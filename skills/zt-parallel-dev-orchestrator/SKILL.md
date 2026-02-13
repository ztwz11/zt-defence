---
name: zt-parallel-dev-orchestrator
description: Orchestrate parallel implementation of the zt-defence game using sub-agents with strict module ownership, dependency gates, and integration checkpoints. Use when the user asks to develop concurrently, split work into modules, or run multi-agent delivery based on docs in docs/TECH_SPEC_ALIGNMENT.md, docs/IMPLEMENTATION_BACKLOG_REFINED.md, and related contracts.
---

# ZT Parallel Dev Orchestrator

Use this skill to run multi-agent development in parallel without breaking module boundaries.

## Load Baseline Contracts First

Read these files before assigning any work:

1. `docs/TECH_SPEC_ALIGNMENT.md`
2. `docs/CONTENT_INTEGRITY_RULES.md`
3. `docs/RUN_SAVE_CONTRACT.md`
4. `docs/UI_STATE_CONTRACT.md`
5. `docs/BALANCE_BASELINE.md`
6. `docs/IMPLEMENTATION_BACKLOG_REFINED.md`
7. `docs/GO_NO_GO_CHECKLIST.md`

If contracts conflict, stop assignment and resolve the conflict in docs first.

## Use Module Ownership

Assign one owner agent per module. Never assign overlapping file ownership.

Use `references/module-map.md` for module boundaries, interfaces, and dependency order.

## Run Sub-Agents in Parallel

1. Spawn one agent per independent module.
2. Give each agent:
   - explicit owned paths
   - explicit non-owned paths
   - acceptance criteria
   - required tests/checks
3. Require each agent to ignore unrelated changes outside owned paths.
4. Wait for agents in batches and integrate completed modules in dependency order.

Use `references/parallel-runbook.md` for spawn/wait/integration procedure.

## Enforce Integration Gates

Use these gates:

1. Gate A: Contracts frozen (no unresolved spec gaps)
2. Gate B: Foundation modules merged
3. Gate C: Combat/Run core merged
4. Gate D: UI/HUD integrated
5. Gate E: Validation + save/replay checks passing

Do not start downstream modules before upstream gate is green.

## Require Handoff Contracts

Every module handoff must include:

1. changed files
2. interface deltas
3. tests run
4. known limitations
5. rollback notes

Use the required format in `references/handoff-contract.md`.

## Default Parallel Workflow

1. Split selected epic into modules from `references/module-map.md`.
2. Spawn parallel agents for modules with no dependency edge.
3. Merge module PR/patches in dependency order.
4. Run repo checks after each integration batch.
5. Update `docs/GO_NO_GO_CHECKLIST.md` statuses.

## Conflict Policy

If two modules need the same file:

1. choose a single owner module
2. move secondary change behind interface file or follow-up task
3. re-split workload before resuming parallel execution

Never continue parallel edits with overlapping ownership.

## Deliverable at End of Batch

Produce:

1. module completion table
2. gate status (A-E)
3. remaining blockers
4. next parallel batch plan

