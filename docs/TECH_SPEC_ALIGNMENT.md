# TECH SPEC Alignment (M0/M1 기준)

> 목적: 기존 기획 문서(`docs/01~12`)와 스키마/샘플(`docs/schemas`, `docs/examples`)을 구현 가능한 단일 기준으로 정렬한다.

## 1. 범위와 원칙

- 현재 단계 목표: **구현 전 정합성 고정**
- 구현 범위 기준: M0~M1
- 스택 기본값: **Phaser(전투 렌더) + React(UI/HUD/오버레이) 분리**
- 서버(API/DB): MVP 범위 제외, 로컬 저장 우선
- RNG: `runSeed` 기반 재현성 우선

## 2. 단일 소스 오브 트루스 (SSOT)

| 주제 | 기준 문서 | 구현 시 우선순위 |
| --- | --- | --- |
| 게임 비전/세션 | `docs/01_VISION_ONEPAGER.md` | 중 |
| 코어 루프/상태 흐름 | `docs/03_GAMEPLAY_LOOPS_SESSION_FLOW.md` | 상 |
| 전투 규칙/웨이브 | `docs/04_COMBAT_WAVES_RULES.md` | 상 |
| 유닛/스킬/시너지 모델 | `docs/05_UNITS_SKILLS_SYNERGIES.md` | 상 |
| 보상/메타 성장 | `docs/06_REWARDS_META_PROGRESSION.md` | 중 |
| 경제/밸런싱 기준 | `docs/07_ECONOMY_BALANCING_FRAMEWORK.md` | 상 |
| UI/UX 흐름 | `docs/09_UI_UX_FLOWS.md` | 상 |
| 컨텐츠 파이프라인 | `docs/10_CONTENT_PIPELINE.md` | 상 |
| 기술 설계 최소 요구 | `docs/11_TECHNICAL_DESIGN_FOR_CODEX.md` | 최상 |
| 마일스톤/백로그 | `docs/12_PRODUCTION_PLAN_BACKLOG.md` | 최상 |

## 3. 정합성 결정 사항 (고정)

### 3.1 컨텐츠 파일 집합

- M0/M1 필수 파일
  - `content/units.json`
  - `content/skills.json`
  - `content/synergies.json`
  - `content/enemies.json`
  - `content/waves.json`
  - `content/relics.json`
  - `content/economy.json`
- M2 이후 검토 파일
  - `content/loot.json` (현재 스키마 없음)
  - `content/dialogues.json` (스토리/UI 확장 시)
- 상태이상(`Slow/Stun/Burn`)은 당장 별도 파일을 만들지 않고, `skills/synergies`의 `statusId` 문자열로 참조한다.
  - 단, 구현 시 내부 `StatusRegistry` 상수는 반드시 둔다.

### 3.2 스킬 트리거 범위

- M0/M1 허용 트리거
  - `Passive`, `OnAttack`, `OnHit`, `OnKill`, `OnWaveStart`, `Active`
- `OnAllyDeath`는 문서상 아이디어로만 유지하고 M2 확장 항목으로 분리한다.

### 3.3 저장 포맷 최소 필수

- `run_save`/`run_history`/`profile`는 모두 `contentVersion`을 포함한다.
- `run_save`/`run_history`는 반드시 `runSeed`를 포함한다.
- 호환 규칙: `saveVersion` 불일치 시 마이그레이션 또는 로드 차단.

### 3.4 검증 단계 고정

1. JSON 파싱
2. 스키마 검증
3. 참조 무결성 검증
4. 의미 규칙 검증(합계/중복/정렬/범위)

## 4. 용어 표준

| 용어 | 정의 |
| --- | --- |
| Run | 웨이브 1~N 한 판 |
| RunSeed | 해당 Run의 랜덤 재현 키 |
| ContentVersion | 런 당시 컨텐츠 묶음 버전 |
| Prepare | 소환/합성/배치 준비 상태 |
| Combat | 자동 전투 상태 |
| Reward | 보상 선택 상태 |
| Result | 클리어/실패 결과 상태 |

## 5. 비범위(현재 단계)

- 실제 코드 구현
- CI/CD
- 서버 통신 API
- 상점/결제/광고
- 라이브옵스 데이터 운영

## 6. 구현 착수 조건

- `docs/SCHEMA_COVERAGE_MATRIX.md`에서 Critical 공백 0건
- `docs/CONTENT_INTEGRITY_RULES.md` 규칙 ID 확정
- `docs/RUN_SAVE_CONTRACT.md` 필수 필드 동결
- `docs/UI_STATE_CONTRACT.md` 상태 전이 동결

