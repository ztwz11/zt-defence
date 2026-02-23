# Examples

This directory contains sample JSON payloads used by the data-driven game runtime.

## Files
- `units.sample.json`: unit definition samples
- `skills.sample.json`: skill definition samples
- `synergies.sample.json`: synergy threshold samples
- `enemies.sample.json`: chapter-scoped enemy samples
- `waves.sample.json`: chapter-scoped wave samples
- `relics.sample.json`: relic samples
- `economy.sample.json`: run economy + chapter overrides
- `chapter_presets.sample.json`: balance chapter preset registry sample
- `profile.sample.json`: meta profile save sample
- `run_save.sample.json`: in-run save sample
- `run_history.sample.json`: run history sample

## Validation
- Validate schema/sample pairs: `python tools/validate-schemas.py`

Use additional integrity checks to validate cross-file references in production pipelines.
