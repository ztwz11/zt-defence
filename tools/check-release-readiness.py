#!/usr/bin/env python3
"""
Run the release-readiness checks required for CI and local gating.

Checks:
1) Schema/sample validation
2) Node test suite
3) Deterministic replay/save smoke checks
"""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]

CHECKS = [
    ("schema/sample validation", [sys.executable, "tools/validate-schemas.py"]),
    ("node test suite", ["node", "--test", "tests/**/*.test.js"]),
    ("deterministic replay/save smoke checks", ["node", "tools/smoke-replay-save-check.js"]),
    ("long-run save/reload smoke checks", ["node", "tools/e2e/long-run-save-reload-smoke.js"]),
]


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
    print("Running release-readiness checks...")
    for name, command in CHECKS:
        code = run_check(name, command)
        if code != 0:
            return code

    print("\nAll release-readiness checks passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
