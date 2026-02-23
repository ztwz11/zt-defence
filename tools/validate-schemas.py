#!/usr/bin/env python3
"""
Validate docs/examples/*.sample.json against docs/schemas/*.schema.json.

This script intentionally supports only the JSON Schema keywords used in this repo.
It has no external dependency.
"""

from __future__ import annotations

import json
import re
import sys
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
SCHEMAS_DIR = ROOT / "docs" / "schemas"
EXAMPLES_DIR = ROOT / "docs" / "examples"

PAIRS = [
    ("units.schema.json", "units.sample.json"),
    ("skills.schema.json", "skills.sample.json"),
    ("synergies.schema.json", "synergies.sample.json"),
    ("enemies.schema.json", "enemies.sample.json"),
    ("waves.schema.json", "waves.sample.json"),
    ("relics.schema.json", "relics.sample.json"),
    ("economy.schema.json", "economy.sample.json"),
    ("chapter_presets.schema.json", "chapter_presets.sample.json"),
    ("profile.schema.json", "profile.sample.json"),
    ("run_save.schema.json", "run_save.sample.json"),
    ("run_history.schema.json", "run_history.sample.json"),
]


@dataclass
class ValidationError:
    path: str
    message: str


def is_number(value: Any) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool)


def is_integer(value: Any) -> bool:
    return isinstance(value, int) and not isinstance(value, bool)


def parse_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def validate_format(value: str, fmt: str) -> bool:
    if fmt == "date-time":
        # Accept ISO-8601 with Z suffix.
        candidate = value.replace("Z", "+00:00")
        try:
            datetime.fromisoformat(candidate)
            return True
        except ValueError:
            return False
    # Unsupported formats are ignored for now.
    return True


def validate_node(value: Any, schema: dict[str, Any], path: str) -> list[ValidationError]:
    errors: list[ValidationError] = []

    if "enum" in schema and value not in schema["enum"]:
        errors.append(ValidationError(path, f"value {value!r} is not in enum"))
        return errors

    expected_type = schema.get("type")
    if expected_type:
        if expected_type == "object":
            if not isinstance(value, dict):
                errors.append(ValidationError(path, "expected object"))
                return errors
        elif expected_type == "array":
            if not isinstance(value, list):
                errors.append(ValidationError(path, "expected array"))
                return errors
        elif expected_type == "string":
            if not isinstance(value, str):
                errors.append(ValidationError(path, "expected string"))
                return errors
        elif expected_type == "number":
            if not is_number(value):
                errors.append(ValidationError(path, "expected number"))
                return errors
        elif expected_type == "integer":
            if not is_integer(value):
                errors.append(ValidationError(path, "expected integer"))
                return errors
        elif expected_type == "boolean":
            if not isinstance(value, bool):
                errors.append(ValidationError(path, "expected boolean"))
                return errors

    if isinstance(value, str):
        if "minLength" in schema and len(value) < schema["minLength"]:
            errors.append(ValidationError(path, f"string length < minLength {schema['minLength']}"))
        if "pattern" in schema:
            if not re.match(schema["pattern"], value):
                errors.append(ValidationError(path, f"string does not match pattern {schema['pattern']!r}"))
        if "format" in schema and not validate_format(value, schema["format"]):
            errors.append(ValidationError(path, f"string does not satisfy format {schema['format']}"))

    if is_number(value):
        if "minimum" in schema and value < schema["minimum"]:
            errors.append(ValidationError(path, f"value < minimum {schema['minimum']}"))
        if "maximum" in schema and value > schema["maximum"]:
            errors.append(ValidationError(path, f"value > maximum {schema['maximum']}"))
        if "exclusiveMinimum" in schema and value <= schema["exclusiveMinimum"]:
            errors.append(ValidationError(path, f"value <= exclusiveMinimum {schema['exclusiveMinimum']}"))

    if isinstance(value, list):
        if "minItems" in schema and len(value) < schema["minItems"]:
            errors.append(ValidationError(path, f"array length < minItems {schema['minItems']}"))
        if "maxItems" in schema and len(value) > schema["maxItems"]:
            errors.append(ValidationError(path, f"array length > maxItems {schema['maxItems']}"))
        item_schema = schema.get("items")
        if isinstance(item_schema, dict):
            for idx, item in enumerate(value):
                errors.extend(validate_node(item, item_schema, f"{path}[{idx}]"))

    if isinstance(value, dict):
        required = schema.get("required", [])
        for key in required:
            if key not in value:
                errors.append(ValidationError(path, f"missing required key {key!r}"))

        properties = schema.get("properties", {})
        for key, val in value.items():
            if key in properties:
                errors.extend(validate_node(val, properties[key], f"{path}.{key}"))
            else:
                additional = schema.get("additionalProperties", True)
                if additional is False:
                    errors.append(ValidationError(path, f"unexpected key {key!r}"))
                elif isinstance(additional, dict):
                    errors.extend(validate_node(val, additional, f"{path}.{key}"))

    return errors


def validate_pair(schema_name: str, sample_name: str) -> tuple[bool, list[ValidationError]]:
    schema_path = SCHEMAS_DIR / schema_name
    sample_path = EXAMPLES_DIR / sample_name

    missing = []
    if not schema_path.exists():
        missing.append(str(schema_path))
    if not sample_path.exists():
        missing.append(str(sample_path))
    if missing:
        return False, [ValidationError("$", f"missing file(s): {', '.join(missing)}")]

    schema = parse_json(schema_path)
    sample = parse_json(sample_path)
    errors = validate_node(sample, schema, "$")
    return len(errors) == 0, errors


def main() -> int:
    total = len(PAIRS)
    failed = 0

    print(f"Validating {total} schema/sample pair(s)...")
    for schema_name, sample_name in PAIRS:
        ok, errors = validate_pair(schema_name, sample_name)
        label = f"{schema_name} <= {sample_name}"
        if ok:
            print(f"[OK]   {label}")
            continue
        failed += 1
        print(f"[FAIL] {label}")
        for err in errors:
            print(f"       - {err.path}: {err.message}")

    if failed:
        print(f"\nValidation failed: {failed}/{total} pair(s)")
        return 1

    print("\nValidation passed: all pairs are valid")
    return 0


if __name__ == "__main__":
    sys.exit(main())
