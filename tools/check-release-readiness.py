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


def build_checks(chapter_ids: list[str]) -> list[tuple[str, list[str]]]:
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

    checks.append(
        (
            "release-readiness trend diff checks",
            [
                "node",
                "tools/release-readiness/check-trend-diff.js",
                "--current-dir=.tmp/release-readiness",
                "--baseline-dir=.tmp/release-readiness/baseline",
                "--allow-missing-baseline",
                "--output=.tmp/release-readiness/trend-diff-report.json",
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

    checks = build_checks(chapter_ids)
    print("Running release-readiness checks...")
    print(f"Discovered chapters for tuning gates: {', '.join(chapter_ids)}")
    for name, command in checks:
        code = run_check(name, command)
        if code != 0:
            return code

    print("\nAll release-readiness checks passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
