# Threshold Apply Alert Webhook Contract

## Scope

- Workflow: `.github/workflows/threshold-proposal-apply.yml`
- Trigger point: `post_verify` failure + auto-revert path
- Sender script: `tools/release-readiness/send-threshold-alert.js`

## Config

- Secret: `THRESHOLD_APPLY_ALERT_WEBHOOK_URL`
- Variable: `THRESHOLD_APPLY_ALERT_CHANNEL` (`generic` | `slack` | `teams`)

If webhook URL is missing, send step is skipped (`allow-missing-webhook=true`) and result artifact is still generated.

## Artifacts

- Payload: `.tmp/release-readiness/post-apply-webhook-payload.json`
- Delivery result: `.tmp/release-readiness/post-apply-webhook-result.json`

## Canonical Payload Fields

- `schemaVersion`
- `generatedAt`
- `event`
- `severity`
- `source`: repository/workflow/job/run/sha/ref/actor/event
- `workflowInput`: `targetRef`, `allowManualReview`, `pushChanges`
- `failure`: phase/step/verificationExitCode/revert info
- `thresholdDiff`: applied/manual review/blocked and row preview summary
- `links`: run/repository/PR URL
- `artifacts`: related local artifact paths
- `correlation`: `correlationId`, `dedupeKey`, `attemptKey`

## Correlation and Dedupe

- `correlationId`: event + repository + runId + runAttempt + job
- `dedupeKey`: event + repository + runId + job + verificationExitCode
- `attemptKey`: event + repository + runId + runAttempt + job + verificationExitCode

`dedupeKey` is stable across webhook retry attempts within the same workflow run.

## Delivery Headers

When webhook URL is configured, request headers include:

- `x-threshold-alert-event`
- `x-threshold-alert-correlation-id`
- `x-threshold-alert-dedupe-key`
- `x-threshold-alert-attempt-key`

These headers are intended for receiver-side dedupe/routing.

## Channel Templates

- `generic`: canonical payload JSON 그대로 전송
- `slack`: `text` fallback + blocks(header/summary/fields/actions/context)
- `teams`: MessageCard + expanded facts + workflow/PR links

Channel payloads always include the canonical payload under `payload` for traceability (`slack`, `teams`).
