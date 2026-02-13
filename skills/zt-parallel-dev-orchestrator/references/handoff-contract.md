# Handoff Contract

Require this format from each module owner.

## Required Output

```markdown
Module: <MODULE_NAME>
Owner: <AGENT_ID>

Summary
- <ONE LINE>

Changed Files
- `<PATH>`
- `<PATH>`

Interface Deltas
- <TYPE/API/SCHEMA CHANGE>

Checks Run
- `<COMMAND>`: pass/fail
- `<COMMAND>`: pass/fail

Acceptance Criteria
- [x] <CRITERION>
- [ ] <CRITERION IF NOT MET>

Known Limitations
- <ITEM>

Rollback Notes
- <HOW TO REVERT SAFELY>
```

## Rejection Rules

Reject handoff if:

1. owned path rule violated
2. checks missing
3. interface delta undocumented
4. acceptance criteria not mapped

