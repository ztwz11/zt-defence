# UI State Contract (Phaser + React)

> 목적: 씬/화면 상태 전이와 최소 데이터 바인딩 규약을 고정한다.

## 1. 아키텍처 경계

- Phaser 담당
  - 보드 렌더링
  - 유닛/적 애니메이션
  - 전투 이펙트
- React 담당
  - 로비/챕터/결과 화면
  - HUD 오버레이
  - 보상 카드/툴팁/모달
- 상태 소스: `RunStateStore` 단일 스토어(읽기/쓰기 경계 명확화)

## 2. Run 상태 enum

```ts
type RunPhase = "Prepare" | "Combat" | "Reward" | "BossIntro" | "Result";
```

## 3. 상태 전이

| 현재 상태 | 이벤트 | 다음 상태 | 조건 |
| --- | --- | --- | --- |
| Lobby | StartRun | ChapterSelect | 프로필 로드 성공 |
| ChapterSelect | ConfirmChapter | Prepare | Run 초기화 성공 |
| Prepare | PressStartCombat | Combat | 최소 유닛 1개 이상 |
| Combat | WaveCleared | Reward | 보상 웨이브인 경우 |
| Combat | WaveCleared | Prepare | 일반 웨이브 |
| Combat | BossWaveIntro | BossIntro | 보스 웨이브 시작 |
| BossIntro | IntroFinished | Combat | 자동/스킵 |
| Combat | GateHpZero | Result | 실패 |
| Combat | FinalWaveCleared | Result | 클리어 |
| Reward | RewardSelected | Prepare | 저장 성공 |
| Result | Retry | Prepare | 같은 챕터 재시작 |
| Result | GoLobby | Lobby | 결과 저장 완료 |

## 4. HUD 최소 바인딩

- 상단
  - `waveNumber`
  - `gateHp`
  - `phase`
- 하단
  - `gold`
  - `summonCost`
  - `rerollCost`
  - `actions.summon()`
  - `actions.reroll()`
- 측면
  - `synergyCounts[]`
  - `relics[]`

## 5. 화면별 필수 데이터

| 화면 | 필수 데이터 |
| --- | --- |
| Lobby | 프로필 요약, 최근 기록 |
| ChapterSelect | 챕터 목록, 최고 웨이브, 시작 보너스 후보 |
| Run(HUD) | 골드, 웨이브, 성문 HP, 시너지, 유물 |
| Reward | 후보 유물 3개, 희귀도, 상세 툴팁 |
| Result | 클리어/실패, 통계, 메타 보상, runSeed |

## 6. 에러 처리 규약

- 컨텐츠 로드 실패: Run 진입 차단 + 오류 모달
- 저장 실패:
  - `Prepare/Reward`에서 재시도 버튼
  - `Result -> Lobby` 전 실패 시 로컬 임시 저장 1회 시도
- 상태 불일치 감지 시: `Result`로 강등 + 로그 기록

## 7. 접근성/품질 최소 규칙

- 색상 외 아이콘/텍스트 병기
- 버튼 최소 터치 영역 44px
- 저사양 모드에서 전투 이펙트 단계 축소

