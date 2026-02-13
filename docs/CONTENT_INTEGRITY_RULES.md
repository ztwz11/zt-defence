# Content Integrity Rules

> 목적: 스키마 검증 이후에 수행해야 할 참조/의미 검증 규칙을 표준화한다.

## 1. 검증 단계

1. JSON 파싱
2. 스키마 검증
3. 참조 무결성 검증
4. 의미 규칙 검증
5. 경고(권장) 규칙 검증

## 2. 규칙 목록 (필수)

| 규칙 ID | 설명 | 실패 레벨 |
| --- | --- | --- |
| `IR-001` | 모든 컨텐츠 루트에 `version`이 존재해야 함 | Error |
| `IR-002` | 동일 파일 내 `id` 중복 금지 | Error |
| `IR-003` | `units[].skillIds[]`는 `skills.id`를 참조해야 함 | Error |
| `IR-004` | `waves[].spawns[].enemyId`는 `enemies.id`를 참조해야 함 | Error |
| `IR-005` | `skills.effects[].statusId`가 있으면 허용 상태 목록에 존재해야 함 | Error |
| `IR-006` | `synergies[].thresholds[].effects[].statusId`가 있으면 허용 상태 목록에 존재해야 함 | Error |
| `IR-007` | `economy.runEconomy.tierChancesByWave[].chances`의 합은 1.0이어야 함(허용오차 1e-6) | Error |
| `IR-008` | `waves[].waveNumber`는 오름차순, 중복 금지 | Error |
| `IR-009` | `waves[].reward.choices`는 `RelicChoice`에서만 사용 | Error |
| `IR-010` | `relics[].effects[].tag` 사용 시 실제 `units.tags`에 최소 1개 이상 존재해야 함 | Warn |

## 3. 상태이상 허용 목록 (M0/M1)

- `slow`
- `stun`
- `burn`

> 상태이상 목록은 구현 시 `StatusRegistry` 상수와 동일해야 하며, 변경 시 문서와 코드 동시 수정이 필요하다.

## 4. 에러 포맷 표준

```json
{
  "level": "error",
  "ruleId": "IR-003",
  "file": "content/units.json",
  "path": "$.units[2].skillIds[0]",
  "message": "Unknown skill id: skill_fire_storm",
  "hint": "Add skill_fire_storm to skills.json or remove the reference."
}
```

## 5. 에러 코드 정책

- 로더는 실패 항목을 가능한 한 모두 수집해 한 번에 출력한다.
- `Error` 1건 이상이면 로딩 실패로 간주한다.
- `Warn`만 존재하면 로딩 성공 + 경고 로그 출력.

## 6. 권장 규칙 (선택)

| 규칙 ID | 설명 | 레벨 |
| --- | --- | --- |
| `AR-001` | `units` rarity 분포가 한 티어에 과도 편중인지 체크 | Warn |
| `AR-002` | `waves`의 총 적 수 증가 추세 역전 탐지 | Warn |
| `AR-003` | `relics` 효과 타입 편향(특정 타입 70% 이상) 탐지 | Warn |

