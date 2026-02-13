# Go / No-Go Checklist (구현 착수 전)

> 목적: 문서 정합성 단계 완료 여부를 체크하고 구현 착수 판단을 표준화한다.

## 1. Content/Schema

- [x] M0/M1 필수 컨텐츠 파일 목록이 확정되어 있다.
- [x] `docs/SCHEMA_COVERAGE_MATRIX.md`에서 미해결 Critical Gap이 0건이다.
- [x] `docs/CONTENT_INTEGRITY_RULES.md`의 규칙 ID가 확정되어 있다.
- [x] 저장 포맷 스키마(`profile/run_save/run_history`)가 존재한다.
- [x] 샘플 JSON이 현재 스키마를 통과한다.

## 2. Save/RNG

- [x] `docs/RUN_SAVE_CONTRACT.md` 필수 필드가 확정되어 있다.
- [x] `runSeed`, `contentVersion`, `saveVersion` 정책이 명시돼 있다.
- [x] 저장 시점(웨이브 종료/결과)이 정의되어 있다.

## 3. UI/State

- [x] `docs/UI_STATE_CONTRACT.md` 상태 전이가 확정되어 있다.
- [x] HUD 최소 바인딩 항목이 고정되어 있다.
- [x] 오류 처리(로드 실패/저장 실패/상태 불일치) 규약이 있다.

## 4. Balance

- [x] `docs/BALANCE_BASELINE.md`의 초기 수치가 확정돼 있다.
- [x] M0 목표 지표(도달율/런타임)가 정의되어 있다.
- [x] 로깅 최소 항목이 정의되어 있다.

## 5. Backlog/Execution

- [x] `docs/IMPLEMENTATION_BACKLOG_REFINED.md`가 의존성 순서로 정렬되어 있다.
- [x] M0 릴리즈 게이트가 명시되어 있다.
- [x] 비범위 항목(서버/결제/라이브옵스)이 명확하다.

## 6. 최종 판정

- 위 체크가 모두 완료됨: **GO**
- 하나라도 미완료면: **NO-GO** (미완료 항목부터 닫고 재평가)
