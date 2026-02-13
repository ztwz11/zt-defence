# Module Map

Use this map to split work for parallel agents.

## Module A: Content Contracts

- Scope:
  - content schema alignment
  - content reference integrity rules
  - sample data parity
- Owned paths:
  - `docs/schemas/**`
  - `docs/examples/**`
  - `docs/CONTENT_INTEGRITY_RULES.md`
  - `docs/SCHEMA_COVERAGE_MATRIX.md`
- Depends on: none
- Blocks:
  - Module B
  - Module C
  - Module D

## Module B: Run Persistence

- Scope:
  - run/profile/history models
  - save/load adapters
  - version compatibility checks
- Owned paths:
  - `src/game/run/**`
  - `src/game/save/**`
  - `src/types/save/**`
  - tests under same areas
- Depends on: Module A contracts
- Blocks:
  - Module E

## Module C: Core Combat Simulation

- Scope:
  - wave scheduler
  - targeting
  - damage/status simulation
  - event log generation
- Owned paths:
  - `src/game/combat/**`
  - `src/game/waves/**`
  - `src/game/sim/**`
  - tests under same areas
- Depends on: Module A contracts
- Blocks:
  - Module E

## Module D: Economy/Reward Engine

- Scope:
  - summon/reroll costs
  - tier chance curves
  - reward choice application
  - relic effect evaluation
- Owned paths:
  - `src/game/economy/**`
  - `src/game/rewards/**`
  - `src/game/relics/**`
  - tests under same areas
- Depends on: Module A contracts
- Blocks:
  - Module E

## Module E: UI State + Integration

- Scope:
  - run phase state machine
  - HUD bindings
  - reward/result screens
  - integration of B/C/D outputs
- Owned paths:
  - `src/ui/**`
  - `src/render/**`
  - `src/main/**`
  - integration tests
- Depends on: Modules B, C, D
- Blocks:
  - Module F

## Module F: Tooling and CI Checks

- Scope:
  - schema/sample validation command
  - deterministic seed regression checks
  - lint/test/build orchestration
- Owned paths:
  - `tools/**`
  - `.github/workflows/**`
  - root scripts/manifests needed for checks
- Depends on: Modules B-E
- Blocks: release readiness

## Default Parallel Batches

1. Batch 1: A
2. Batch 2: B + C + D
3. Batch 3: E
4. Batch 4: F

