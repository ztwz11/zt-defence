# 10) Content Pipeline (스크립트 기반)

> 목표: 유닛/스킬/시너지/웨이브/경제를 **코드가 아니라 데이터(JSON)** 로 관리한다.  
> 컨텐츠가 늘어도 “코드 수정 없이” 추가/튜닝이 가능해야 한다.

## 1. 컨텐츠 파일 구성(권장)
- `content/units.json`
- `content/skills.json`
- `content/synergies.json`
- `content/enemies.json`
- `content/waves.json`
- `content/loot.json`
- `content/economy.json`
- `content/relics.json`
- (확장) `content/dialogues.json`

## 2. 검증(Validation) 필수
- JSON Schema로 구조 검증(필수 필드/타입/범위)
- 게임 실행 시 로딩 단계에서 검증 실패하면 즉시 에러(개발 단계에서 조기 발견)

> Codex 구현 팁: JS/TS라면 Ajv, .NET이라면 System.Text.Json + schema validator(또는 자체 검증) 사용.

## 3. 데이터 버전 관리
- 각 컨텐츠 파일에 `version` 필드 포함
- 런타임에 로딩한 버전/해시를 로그에 남겨 “버그 재현”을 돕는다.

## 4. 애니메이션/스프라이트 시트 파이프라인(권장)
### 4.1 생성 흐름(권장)
1) “마스터 캐릭터” 단일 이미지 생성(일관성)
2) 스프라이트 시트(Idle/Attack/Hit/Die) 생성
3) 엔진 임포트(프레임 크기/피벗 고정)
4) `UnitDef`에 애니 키 연결

### 4.2 네이밍 규칙(예시)
- 파일: `assets/sprites/units/<unitId>/<anim>.png`
  - 예: `assets/sprites/units/knight_sword/idle.png`
- 애니 키: `<unitId>.<anim>`
  - 예: `knight_sword.idle`

### 4.3 메타데이터(권장)
- 프레임 폭/높이, 프레임 수, FPS, 루프 여부
- 피벗(anchor) 정보(가능하면)
- 예: `assets/sprites/units/knight_sword/idle.meta.json`

## 5. 핫리로드(개발 편의)
- 개발 모드에서 컨텐츠 파일 변경 시 자동 재로딩
- 전투 중 변경은 위험하니, 로비에서만 새로고침 적용(단순)

## 6. 샘플/스키마 참고
- `docs/schemas/` : JSON Schema
- `docs/examples/` : 샘플 JSON
