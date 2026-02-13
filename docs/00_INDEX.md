# 운빨요새: 봉식의 마지막 수비 (가칭) — 기획문서 패키지 (단계별)

> 목적: 이 문서 묶음은 **게임 전반(컨셉/플레이/보상/스토리/경제/UX/기술 요구사항)** 을 단계별로 정의하여  
> Codex가 **개발 설계(아키텍처/데이터 스키마/모듈 분리/백로그)** 까지 바로 생성할 수 있게 한다.

## 읽는 순서(권장)
1. `00_CODEX_RULES.md` — Codex 작업 규칙(경로/권한 포함)
2. `01_VISION_ONEPAGER.md` — 한 장 기획(핵심만)
3. `02_MDA_DESIGN_PILLARS.md` — 재미의 목표/디자인 원칙
4. `03_GAMEPLAY_LOOPS_SESSION_FLOW.md` — 코어 루프/세션 흐름
5. `04_COMBAT_WAVES_RULES.md` — 전투 규칙/웨이브/난이도
6. `05_UNITS_SKILLS_SYNERGIES.md` — 유닛/스킬/시너지 구조
7. `06_REWARDS_META_PROGRESSION.md` — 보상/메타 성장/재화
8. `07_ECONOMY_BALANCING_FRAMEWORK.md` — 경제/밸런싱 프레임
9. `08_STORY_WORLD_BIBLE.md` — 세계관/스토리/캐릭터
10. `09_UI_UX_FLOWS.md` — 화면/플로우/상태
11. `10_CONTENT_PIPELINE.md` — 스크립트 기반 컨텐츠 파이프라인(정의/검증/툴)
12. `11_TECHNICAL_DESIGN_FOR_CODEX.md` — 개발 설계 요구사항(모듈/데이터/저장/재현 RNG)
13. `12_PRODUCTION_PLAN_BACKLOG.md` — MVP→확장 로드맵/백로그
14. `prompts/13_CODEX_PROMPT_PACK.md` — Codex에게 바로 붙여넣을 프롬프트 묶음
15. `schemas/*` , `examples/*` — JSON 스키마/예시(데이터-드리븐 구현용)

## 정합성/실행 부록 (신규)

- `TECH_SPEC_ALIGNMENT.md` — 문서/스키마/샘플 단일 기준 정렬
- `SCHEMA_COVERAGE_MATRIX.md` — 요구사항 대비 스키마 커버리지 표
- `CONTENT_INTEGRITY_RULES.md` — 참조/의미 무결성 검증 규칙
- `RUN_SAVE_CONTRACT.md` — 저장/복구 데이터 계약
- `BALANCE_BASELINE.md` — M0 수치 기준선
- `UI_STATE_CONTRACT.md` — 상태 전이/HUD 바인딩 계약
- `IMPLEMENTATION_BACKLOG_REFINED.md` — 정합성 반영 백로그
- `GO_NO_GO_CHECKLIST.md` — 구현 착수 체크리스트
- `orchestration/BATCH_STATUS.md` — 병렬 오케스트레이션 배치/게이트 상태

## 폴더 구조
- `docs/` : 단계별 기획 문서(마크다운)
- `docs/schemas/` : 컨텐츠 정의 스키마(JSON Schema)
- `docs/examples/` : 샘플 컨텐츠 JSON
- `docs/prompts/` : Codex에게 주는 지시/프롬프트 템플릿

## 표기 규칙
- **MVP**: 최소 기능(“이것만 있어도 게임이 돈다”)
- **v1.0**: 출시 가능한 1차 버전
- **LiveOps**: 이벤트/시즌/스킨 등 운영 컨텐츠
- **Seeded RNG**: 시드 기반 랜덤(재현 가능)

---

작성일: 2026-02-13 (Asia/Seoul)
