# Run Save Contract (M0/M1)

> 목적: 저장/불러오기 포맷을 구현 전 계약으로 고정한다.

## 1. 공통 규칙

- 모든 저장 데이터는 UTF-8 JSON
- 모든 루트 객체 필수 필드
  - `saveVersion` (예: `1.0.0`)
  - `contentVersion` (예: `0.1.0`)
  - `updatedAt` (ISO 8601 UTC)
- `run` 관련 데이터는 `runSeed` 필수

## 2. `profile.json` 계약

```json
{
  "saveVersion": "1.0.0",
  "contentVersion": "0.1.0",
  "updatedAt": "2026-02-13T12:00:00Z",
  "playerId": "local-profile",
  "metaCurrencies": {
    "medal": 0,
    "supply": 0,
    "bonsikExp": 0
  },
  "upgrades": [
    {
      "id": "wall_hp_1",
      "level": 1
    }
  ],
  "unlockedContent": {
    "units": [],
    "relics": [],
    "chapters": ["chapter_1"]
  },
  "settings": {
    "sfx": true,
    "vibration": true,
    "lowFxMode": false
  }
}
```

### 필수 검증

- `metaCurrencies` 값은 음수 불가
- `upgrades[].id` 중복 금지
- `chapters`는 최소 1개 이상

## 3. `run_save.json` 계약

```json
{
  "saveVersion": "1.0.0",
  "contentVersion": "0.1.0",
  "updatedAt": "2026-02-13T12:34:00Z",
  "runId": "run_20260213_001",
  "runSeed": 123456789,
  "chapterId": "chapter_1",
  "phase": "Prepare",
  "waveNumber": 3,
  "gateHp": 18,
  "gold": 14,
  "boardUnits": [
    {
      "instanceId": "u_001",
      "unitId": "knight_sword",
      "star": 2,
      "slot": { "x": 1, "y": 2 },
      "currentHp": 240
    }
  ],
  "benchUnits": [],
  "relics": ["relic_bonus_gold"],
  "activeSynergies": [
    {
      "synergyId": "syn_knights",
      "activeThreshold": 2
    }
  ],
  "rngState": {
    "algo": "xorshift32",
    "state": 987654321
  },
  "eventLogCursor": 420,
  "stats": {
    "kills": 51,
    "totalDamage": 1240,
    "leaks": 2
  }
}
```

### 필수 검증

- `phase` enum: `Prepare | Combat | Reward | BossIntro | Result`
- `waveNumber >= 1`
- `gateHp >= 0`
- `boardUnits[].slot` 중복 금지
- `boardUnits[].unitId`는 `units.id` 참조
- `relics[]`는 `relics.id` 참조

## 4. `run_history.json` 계약

```json
{
  "saveVersion": "1.0.0",
  "contentVersion": "0.1.0",
  "updatedAt": "2026-02-13T12:35:00Z",
  "entries": [
    {
      "runId": "run_20260213_001",
      "runSeed": 123456789,
      "chapterId": "chapter_1",
      "reachedWave": 5,
      "result": "fail",
      "durationSec": 621,
      "highestDpsUnitId": "archer",
      "metaRewards": {
        "medal": 12,
        "supply": 3
      },
      "finishedAt": "2026-02-13T12:35:00Z"
    }
  ]
}
```

### 필수 검증

- `entries`는 최신순 정렬
- 최대 N개(기본 20개) 유지
- `result` enum: `clear | fail | quit`

## 5. 호환성 정책

- `saveVersion` major 불일치: 로드 차단
- `saveVersion` minor 불일치: 마이그레이션 후 로드 시도
- `contentVersion` 불일치:
  - 기본: 재현성 보장을 위해 이어하기 차단
  - 옵션: 디버그 모드에서만 강제 로드 허용

## 6. 저장 시점

- 자동 저장: 웨이브 종료 시
- 수동 저장: 옵션
- 종료 저장: 앱 백그라운드/탭 종료 직전(가능 시)

