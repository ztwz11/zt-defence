# Schemas

이 폴더는 컨텐츠 JSON 구조 검증을 위한 JSON Schema 모음이다.

- `units.schema.json`
- `skills.schema.json`
- `synergies.schema.json`
- `enemies.schema.json`
- `waves.schema.json`
- `relics.schema.json`
- `economy.schema.json`
- `profile.schema.json`
- `run_save.schema.json`
- `run_history.schema.json`

> 스키마는 프로젝트 상황에 맞게 변경 가능하며,
> 변경 시 샘플(examples)도 함께 업데이트하는 것을 권장한다.

## M0/M1 기준 범위

- 위 10개 스키마가 현재 필수 범위다.
- `loot`, `dialogues`는 M2 이후 확장 대상으로 분리한다.
- 저장 포맷(`profile`, `run_save`, `run_history`)은 `../RUN_SAVE_CONTRACT.md`와 스키마를 함께 기준으로 사용한다.
