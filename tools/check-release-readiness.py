#!/usr/bin/env python3
"""
Run the release-readiness checks required for CI and local gating.

Checks:
1) Schema/sample validation
2) Node test suite
3) Deterministic replay/save smoke checks
4) Chapter-scoped tuning gates (auto-discovered from content/chapter-presets.json)
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
CHAPTER_PRESETS_PATH = ROOT / "content" / "chapter-presets.json"


def load_chapter_ids(chapter_presets_path: Path) -> list[str]:
    if not chapter_presets_path.exists():
        raise RuntimeError(f"Missing chapter presets file: {chapter_presets_path}")

    try:
        parsed = json.loads(chapter_presets_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as error:
        raise RuntimeError(
            f"Failed to parse chapter presets JSON: {chapter_presets_path} :: {error}"
        ) from error

    chapters = parsed.get("chapters", {})
    if not isinstance(chapters, dict) or not chapters:
        raise RuntimeError(
            f"Invalid chapter presets shape: expected non-empty object at 'chapters' in {chapter_presets_path}"
        )

    chapter_ids = sorted(
        chapter_id
        for chapter_id in chapters.keys()
        if isinstance(chapter_id, str) and chapter_id.strip()
    )
    if not chapter_ids:
        raise RuntimeError(
            f"No valid chapter IDs found in chapter presets: {chapter_presets_path}"
        )

    return chapter_ids


def parse_bool_env(name: str, default: bool) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    normalized = raw.strip().lower()
    if normalized in {"1", "true", "yes", "y", "on"}:
        return True
    if normalized in {"0", "false", "no", "n", "off"}:
        return False
    return default


def build_checks(chapter_ids: list[str], allow_missing_baseline: bool) -> list[tuple[str, list[str]]]:
    checks: list[tuple[str, list[str]]] = [
        ("schema/sample validation", [sys.executable, "tools/validate-schemas.py"]),
        ("node test suite", ["node", "--test", "tests/**/*.test.js"]),
        ("deterministic replay/save smoke checks", ["node", "tools/smoke-replay-save-check.js"]),
        ("long-run save/reload smoke checks", ["node", "tools/e2e/long-run-save-reload-smoke.js"]),
        (
            "performance gate checks",
            [
                "node",
                "tools/perf/run-and-check.js",
                "--profile=ci-mobile-baseline",
                "--iterations=200",
                "--output=.tmp/release-readiness/perf-gate-report.json",
            ],
        ),
    ]

    for chapter_id in chapter_ids:
        checks.append(
            (
                f"balance tuning gate checks ({chapter_id})",
                [
                    "node",
                    "tools/balance/run-tuning-gate.js",
                    f"--chapter={chapter_id}",
                    f"--output=.tmp/release-readiness/tuning-gate-report.{chapter_id}.json",
                    "--top-candidates=10",
                ],
            )
        )

    trend_diff_command = [
        "node",
        "tools/release-readiness/check-trend-diff.js",
        "--current-dir=.tmp/release-readiness",
        "--baseline-dir=.tmp/release-readiness/baseline",
        "--output=.tmp/release-readiness/trend-diff-report.json",
    ]
    if allow_missing_baseline:
        trend_diff_command.insert(-1, "--allow-missing-baseline")

    checks.append(
        (
            "release-readiness trend diff checks",
            trend_diff_command,
        )
    )

    checks.append(
        (
            "adaptive rebalance policy build",
            [
                "node",
                "tools/release-readiness/build-adaptive-rebalance-policy.js",
                "--history-dir=.tmp/release-readiness/history",
                "--thresholds=tools/release-readiness/trend-thresholds.json",
                "--seed-report=.tmp/release-readiness/trend-diff-report.json",
                "--output=.tmp/release-readiness/adaptive-rebalance-policy.json",
                "--min-samples=3",
            ],
        )
    )

    checks.append(
        (
            "trend threshold sync preview",
            [
                "node",
                "tools/release-readiness/sync-trend-thresholds.js",
                "--report=.tmp/release-readiness/trend-diff-report.json",
                "--thresholds=tools/release-readiness/trend-thresholds.json",
                "--all-chapters",
                "--lock-baseline",
                "--output=.tmp/release-readiness/trend-thresholds.synced.preview.json",
                "--summary-output=.tmp/release-readiness/trend-threshold-sync-summary.json",
            ],
        )
    )

    checks.append(
        (
            "trend threshold rebalance recommendation",
            [
                "node",
                "tools/release-readiness/rebalance-trend-thresholds.js",
                "--report=.tmp/release-readiness/trend-diff-report.json",
                "--thresholds=tools/release-readiness/trend-thresholds.json",
                "--adaptive-policy=.tmp/release-readiness/adaptive-rebalance-policy.json",
                "--output=.tmp/release-readiness/trend-threshold-recommendation.json",
            ],
        )
    )

    checks.append(
        (
            "trend threshold proposal comment artifact",
            [
                "node",
                "tools/release-readiness/build-threshold-proposal-comment.js",
                "--trend-report=.tmp/release-readiness/trend-diff-report.json",
                "--sync-summary=.tmp/release-readiness/trend-threshold-sync-summary.json",
                "--rebalance-report=.tmp/release-readiness/trend-threshold-recommendation.json",
                "--output=.tmp/release-readiness/trend-threshold-proposal-comment.md",
                "--output-json=.tmp/release-readiness/trend-threshold-proposal.json",
            ],
        )
    )

    checks.append(
        (
            "trend threshold apply preview",
            [
                "node",
                "tools/release-readiness/apply-threshold-proposal.js",
                "--proposal=.tmp/release-readiness/trend-threshold-proposal.json",
                "--thresholds=tools/release-readiness/trend-thresholds.json",
                "--output=.tmp/release-readiness/trend-thresholds.applied.preview.json",
                "--summary-output=.tmp/release-readiness/trend-threshold-apply-summary.json",
                "--allow-manual-review",
            ],
        )
    )

    return checks


def run_check(name: str, command: list[str]) -> int:
    print(f"\n[CHECK] {name}")
    print(f"[CMD]   {' '.join(command)}")

    try:
        completed = subprocess.run(command, cwd=ROOT, check=False)
    except FileNotFoundError:
        print(f"[FAIL]  {name} (command not found: {command[0]})")
        return 127

    if completed.returncode != 0:
        print(f"[FAIL]  {name} (exit code {completed.returncode})")
        return completed.returncode or 1

    print(f"[PASS]  {name}")
    return 0


def main() -> int:
    try:
        chapter_ids = load_chapter_ids(CHAPTER_PRESETS_PATH)
    except RuntimeError as error:
        print(f"[FAIL]  chapter discovery ({error})")
        return 1

    require_baseline = parse_bool_env("RELEASE_READINESS_REQUIRE_BASELINE", False)
    allow_missing_baseline = not require_baseline
    checks = build_checks(chapter_ids, allow_missing_baseline)
    print("Running release-readiness checks...")
    print(f"Discovered chapters for tuning gates: {', '.join(chapter_ids)}")
    print(f"Baseline required mode: {require_baseline}")
    for name, command in checks:
        code = run_check(name, command)
        if code != 0:
            return code

    print("\nAll release-readiness checks passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
