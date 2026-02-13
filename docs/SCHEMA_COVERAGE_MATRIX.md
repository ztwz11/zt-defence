# Schema Coverage Matrix (M0/M1)

> 목적: 기획 요구사항과 현재 스키마(`docs/schemas/*.schema.json`)의 대응 관계를 명시한다.

## 1. 커버리지 표

| 요구 항목 | 기준 문서 | 스키마 | 상태 | 비고 |
| --- | --- | --- | --- | --- |
| 유닛 기본 정의(`id/name/rarity/tags/stats`) | `docs/05_UNITS_SKILLS_SYNERGIES.md` | `docs/schemas/units.schema.json` | Covered | M0/M1 충분 |
| 유닛 타겟 규칙 | `docs/04_COMBAT_WAVES_RULES.md`, `docs/05_UNITS_SKILLS_SYNERGIES.md` | `docs/schemas/units.schema.json` | Partial | `frontMost/lowestHp/random`만 정의 |
| 스킬 트리거/효과 | `docs/05_UNITS_SKILLS_SYNERGIES.md` | `docs/schemas/skills.schema.json` | Covered | `OnAllyDeath`는 비범위 |
| 시너지 임계값/효과 | `docs/05_UNITS_SKILLS_SYNERGIES.md` | `docs/schemas/synergies.schema.json` | Covered | 경제형 시너지 포함 |
| 적 스탯/누락 데미지/골드 | `docs/04_COMBAT_WAVES_RULES.md`, `docs/07_ECONOMY_BALANCING_FRAMEWORK.md` | `docs/schemas/enemies.schema.json` | Covered | M0/M1 충분 |
| 웨이브 스폰/보상 | `docs/04_COMBAT_WAVES_RULES.md` | `docs/schemas/waves.schema.json` | Covered | M0/M1 충분 |
| 유물 정의 | `docs/06_REWARDS_META_PROGRESSION.md` | `docs/schemas/relics.schema.json` | Covered | M0/M1 충분 |
| 경제 파라미터 | `docs/07_ECONOMY_BALANCING_FRAMEWORK.md` | `docs/schemas/economy.schema.json` | Covered | 티어 확률 구간 지원 |
| 상태이상 레지스트리 | `docs/04_COMBAT_WAVES_RULES.md` | 없음 | Gap(Non-critical) | M0/M1은 코드 상수로 처리 |
| Loot 데이터 파일 | `docs/10_CONTENT_PIPELINE.md` | 없음 | Gap(Non-critical) | M2 확장 시 스키마 추가 |
| Dialogues 데이터 파일 | `docs/08_STORY_WORLD_BIBLE.md`, `docs/10_CONTENT_PIPELINE.md` | 없음 | Gap(Non-critical) | M1 후 UI 확장 시 추가 |
| 런/프로필 저장 스키마 | `docs/11_TECHNICAL_DESIGN_FOR_CODEX.md` | `docs/schemas/profile.schema.json`, `docs/schemas/run_save.schema.json`, `docs/schemas/run_history.schema.json` | Covered | 계약 문서와 스키마 동시 관리 |

## 2. 저장 포맷 처리 방침

1. 저장 포맷은 즉시 스키마화 대상이다.
- 대상:
  - `schemas/profile.schema.json`
  - `schemas/run_save.schema.json`
  - `schemas/run_history.schema.json`
- 문서 계약(`docs/RUN_SAVE_CONTRACT.md`)을 변경하면 스키마도 같은 변경에서 동기화한다.

2. 참조 무결성은 스키마 외 추가 검증기로 처리한다.
- 예: `Unit.skillIds -> skills.id`, `Wave.spawns.enemyId -> enemies.id`, `statusId` 유효성

## 3. M0/M1 승인 기준

- Covered/Partial 항목이 전부 구현 가능해야 한다.
- 저장 포맷은 계약 문서와 스키마가 동기화돼 있어야 한다.
- Non-critical Gap은 문서에 “명시적 defer”가 있어야 한다.
