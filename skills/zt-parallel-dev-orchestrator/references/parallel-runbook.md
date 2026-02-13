# Parallel Runbook

Use this runbook for every parallel execution batch.

## 1. Preflight

1. Confirm contract docs are frozen.
2. Confirm module ownership has no overlaps.
3. Confirm dependency graph for this batch.

## 2. Spawn Template

Use one worker per module in the current batch.

Message template:

```text
You own module: <MODULE_NAME>.
Owned paths: <PATHS>.
Do not edit outside owned paths.
You are not alone in the codebase; ignore unrelated edits by other agents.
Acceptance criteria:
1) <CRITERION>
2) <CRITERION>
Tests/checks to run:
1) <COMMAND>
2) <COMMAND>
Deliver handoff using the required format.
```

## 3. Monitoring

1. Wait on all active agents.
2. If one agent blocks:
   - ask for blocker summary
   - unblock with contract clarification
   - or split into a smaller child task
3. Keep at most one integration in progress at a time.

## 4. Integration Order

1. Integrate by dependency level, not by finish time.
2. Re-run required checks after each integration.
3. If integration fails:
   - stop downstream merges
   - fix upstream module first

## 5. Batch Completion Output

Provide:

1. completed modules
2. failed or blocked modules
3. merged interfaces
4. gate status and next batch

