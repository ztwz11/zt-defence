# 운빨요새: 봉식의 마지막 수비 (가칭) — Planning Pack (for Codex)

이 ZIP은 Codex가 **게임 전반 기획 → 개발 설계**를 수행할 수 있도록 만든 문서 묶음이다.

## 빠른 시작
1) `docs/00_CODEX_RULES.md` 를 Codex에게 먼저 전달
2) `docs/00_INDEX.md` 순서대로 읽히기
3) `docs/prompts/13_CODEX_PROMPT_PACK.md` 의 프롬프트를 단계별로 실행

## 구현 전 필수 정합성 체크(신규)
1) `docs/TECH_SPEC_ALIGNMENT.md` 확인
2) `docs/SCHEMA_COVERAGE_MATRIX.md` 와 `docs/CONTENT_INTEGRITY_RULES.md` 확인
3) `docs/RUN_SAVE_CONTRACT.md` / `docs/UI_STATE_CONTRACT.md` / `docs/BALANCE_BASELINE.md` 확인
4) `docs/GO_NO_GO_CHECKLIST.md`로 GO/NO-GO 판정

## 검증 커맨드
- 스키마/샘플 일괄 검증: `python tools/validate-schemas.py`
- 릴리즈 준비 통합 체크: `python tools/check-release-readiness.py`
- 밸런스 시뮬레이션: `node tools/balance/run-balance-sim.js --seeds=200 --wave-max=20 --chapter=chapter_1`
- 성능 프로브 + 임계치 체크: `node tools/perf/run-perf-probe.js --iterations=200 | node tools/perf/check-thresholds.js`

## 포함 파일
- `AGENTS.md` : Codex 에이전트 가이드(프로젝트 아키텍처/규칙)
- `Ludo_Project_Concept_RNG_Defense.pdf` : Ludo용 컨셉 PDF(에셋/스프라이트 파이프라인 참고)
- `docs/` : 단계별 기획/설계 문서

작성일: 2026-02-13
