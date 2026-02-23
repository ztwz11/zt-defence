'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  DEFAULT_APPLY_SUMMARY_PATH,
  DEFAULT_PAYLOAD_OUTPUT_PATH,
  DEFAULT_PROPOSAL_SUMMARY_PATH,
  DEFAULT_RESULT_OUTPUT_PATH,
  DEFAULT_REVERT_SUMMARY_PATH,
  DEFAULT_VERIFICATION_PATH,
  buildCorrelationKeys,
  buildChannelRequestBody,
  parseArgs,
  runAlert,
} = require('../../tools/release-readiness/send-threshold-alert');

function normalizePath(value) {
  return String(value).replaceAll('\\', '/');
}

function resolveFromCwd(cwd, targetPath) {
  const normalized = normalizePath(targetPath);
  if (/^[A-Za-z]:\//.test(normalized)) {
    return normalized;
  }
  return `${normalizePath(cwd)}/${normalized}`;
}

test('parseArgs supports channel/retry and workflow metadata options', () => {
  const parsed = parseArgs([
    '--webhook-url=https://example.com/hook',
    '--channel=teams',
    '--event=custom_failure_event',
    '--allow-missing-webhook=false',
    '--verification-exit-code=17',
    '--target-ref=main',
    '--allow-manual-review=true',
    '--push-changes=false',
    '--retry-count=3',
    '--retry-backoff-ms=750',
    '--request-timeout-ms=9000',
    '--max-response-preview=256',
  ]);

  assert.equal(parsed.webhookUrl, 'https://example.com/hook');
  assert.equal(parsed.channel, 'teams');
  assert.equal(parsed.event, 'custom_failure_event');
  assert.equal(parsed.allowMissingWebhook, false);
  assert.equal(parsed.verificationExitCode, 17);
  assert.equal(parsed.targetRef, 'main');
  assert.equal(parsed.allowManualReview, true);
  assert.equal(parsed.pushChanges, false);
  assert.equal(parsed.retryCount, 3);
  assert.equal(parsed.retryBackoffMs, 750);
  assert.equal(parsed.requestTimeoutMs, 9000);
  assert.equal(parsed.maxResponsePreview, 256);
});

test('buildChannelRequestBody creates adapter-specific payloads', () => {
  const payload = {
    event: 'threshold_apply_post_verify_failed',
    workflowInput: { targetRef: 'main' },
    source: { repository: 'org/repo' },
    failure: { verificationExitCode: 1 },
    thresholdDiff: { appliedCount: 2, manualReviewCount: 1, blocked: true },
    links: {
      runUrl: 'https://github.com/org/repo/actions/runs/123',
      pullRequestUrl: 'https://github.com/org/repo/pull/99',
    },
    correlation: {
      correlationId: 'corr-1',
      dedupeKey: 'dedupe-1',
    },
  };

  const slackBody = buildChannelRequestBody('slack', payload);
  assert.ok(typeof slackBody.text === 'string' && slackBody.text.includes('org/repo'));
  assert.ok(slackBody.fallbackText.includes('dedupe-1'));
  assert.ok(Array.isArray(slackBody.blocks));
  assert.equal(slackBody.blocks[0].type, 'header');
  assert.equal(slackBody.blocks[slackBody.blocks.length - 1].type, 'context');

  const teamsBody = buildChannelRequestBody('teams', payload);
  assert.equal(teamsBody['@type'], 'MessageCard');
  assert.equal(teamsBody.title, 'Threshold Apply Alert');
  const factNames = teamsBody.sections[0].facts.map((fact) => fact.name);
  assert.ok(factNames.includes('Dedupe'));
  assert.ok(factNames.includes('Correlation'));

  const genericBody = buildChannelRequestBody('generic', payload);
  assert.deepEqual(genericBody, payload);
});

test('buildCorrelationKeys creates stable dedupe and attempt keys', () => {
  const payload = {
    event: 'threshold_apply_post_verify_failed',
    source: {
      repository: 'Org/Repo',
      runId: '12345',
      runAttempt: '2',
      job: 'apply-threshold-proposal',
    },
    failure: {
      verificationExitCode: 1,
    },
  };
  const keys = buildCorrelationKeys(payload);
  assert.equal(keys.correlationId, 'threshold-apply-post-verify-failed:org-repo:12345:2:apply-threshold-proposal');
  assert.equal(keys.dedupeKey, 'threshold-apply-post-verify-failed:org-repo:12345:apply-threshold-proposal:1');
  assert.equal(keys.attemptKey, 'threshold-apply-post-verify-failed:org-repo:12345:2:apply-threshold-proposal:1');
});

test('runAlert writes standardized payload and skips send when webhook is missing', async () => {
  const cwd = 'C:/repo';
  const writes = {};
  const eventPath = 'C:/repo/.tmp/release-readiness/workflow-event.json';
  const proposalSummaryPath = resolveFromCwd(cwd, DEFAULT_PROPOSAL_SUMMARY_PATH);
  const applySummaryPath = resolveFromCwd(cwd, DEFAULT_APPLY_SUMMARY_PATH);
  const verificationPath = resolveFromCwd(cwd, DEFAULT_VERIFICATION_PATH);
  const revertSummaryPath = resolveFromCwd(cwd, DEFAULT_REVERT_SUMMARY_PATH);
  const payloadOutputPath = resolveFromCwd(cwd, DEFAULT_PAYLOAD_OUTPUT_PATH);
  const resultOutputPath = resolveFromCwd(cwd, DEFAULT_RESULT_OUTPUT_PATH);

  const fileMap = {
    [proposalSummaryPath]: JSON.stringify({
      hasProposal: true,
      rebalance: {
        changedCount: 2,
        manualReviewCount: 1,
        changedChapterIds: ['chapter_1', 'chapter_2'],
      },
    }),
    [applySummaryPath]: JSON.stringify({
      consideredRowCount: 2,
      appliedChapterIds: ['chapter_1'],
      manualReviewChapterIds: ['chapter_2'],
      blocked: true,
      rows: [{ chapterId: 'chapter_1' }, { chapterId: 'chapter_2' }],
    }),
    [verificationPath]: JSON.stringify({
      ok: false,
      exitCode: 1,
    }),
    [revertSummaryPath]: JSON.stringify({
      reverted: true,
      reason: 'post_apply_verification_failed',
    }),
    [eventPath]: JSON.stringify({
      pull_request: {
        html_url: 'https://github.com/org/repo/pull/42',
      },
    }),
  };

  const result = await runAlert(parseArgs([]), {
    now() {
      return '2026-02-23T00:00:00.000Z';
    },
    cwd() {
      return cwd;
    },
    env: {
      GITHUB_SERVER_URL: 'https://github.com',
      GITHUB_REPOSITORY: 'org/repo',
      GITHUB_WORKFLOW: 'threshold-proposal-apply',
      GITHUB_JOB: 'apply-threshold-proposal',
      GITHUB_RUN_ID: '123456',
      GITHUB_RUN_ATTEMPT: '2',
      GITHUB_SHA: 'abc123',
      GITHUB_REF: 'refs/heads/main',
      GITHUB_ACTOR: 'tester',
      GITHUB_EVENT_NAME: 'workflow_dispatch',
      GITHUB_EVENT_PATH: eventPath,
    },
    resolvePath(cwdPath, targetPath) {
      return resolveFromCwd(cwdPath, targetPath);
    },
    existsSync(filePath) {
      return Object.prototype.hasOwnProperty.call(fileMap, normalizePath(filePath));
    },
    readFileSync(filePath) {
      const normalized = normalizePath(filePath);
      if (!Object.prototype.hasOwnProperty.call(fileMap, normalized)) {
        throw new Error(`Unexpected read: ${normalized}`);
      }
      return fileMap[normalized];
    },
    dirname(filePath) {
      return normalizePath(filePath).split('/').slice(0, -1).join('/');
    },
    mkdirSync() {},
    writeFileSync(filePath, content) {
      writes[normalizePath(filePath)] = String(content);
    },
  });

  assert.equal(result.sent, false);
  assert.equal(result.skipped, true);
  assert.equal(result.reason, 'missing_webhook_url');

  const payload = JSON.parse(writes[payloadOutputPath]);
  assert.equal(payload.failure.verificationExitCode, 1);
  assert.equal(payload.failure.reverted, true);
  assert.equal(payload.thresholdDiff.appliedCount, 1);
  assert.equal(payload.thresholdDiff.manualReviewCount, 1);
  assert.equal(payload.thresholdDiff.proposalRebalanceChangedCount, 2);
  assert.ok(typeof payload.correlation.correlationId === 'string');
  assert.ok(typeof payload.correlation.dedupeKey === 'string');
  assert.equal(payload.links.pullRequestUrl, 'https://github.com/org/repo/pull/42');

  const resultPayload = JSON.parse(writes[resultOutputPath]);
  assert.equal(resultPayload.skipped, true);
  assert.equal(resultPayload.webhookConfigured, false);
  assert.ok(resultPayload.correlation.dedupeKey.length > 0);
});

test('runAlert retries and succeeds with teams adapter', async () => {
  const cwd = 'C:/repo';
  const sleeps = [];
  const posts = [];
  let callCount = 0;

  const result = await runAlert(
    parseArgs([
      '--webhook-url=https://example.test/webhook',
      '--channel=teams',
      '--retry-count=2',
      '--retry-backoff-ms=10',
    ]),
    {
      now() {
        return '2026-02-23T00:00:00.000Z';
      },
      cwd() {
        return cwd;
      },
      env: {
        GITHUB_SERVER_URL: 'https://github.com',
        GITHUB_REPOSITORY: 'org/repo',
        GITHUB_RUN_ID: '999',
      },
      resolvePath(cwdPath, targetPath) {
        return resolveFromCwd(cwdPath, targetPath);
      },
      existsSync() {
        return false;
      },
      dirname(filePath) {
        return normalizePath(filePath).split('/').slice(0, -1).join('/');
      },
      mkdirSync() {},
      writeFileSync() {},
      async postJson(url, body, _timeoutMs, _deps, headers) {
        callCount += 1;
        posts.push({ url, body, headers });
        if (callCount === 1) {
          return { ok: false, statusCode: 500, responseText: 'temporary failure' };
        }
        return { ok: true, statusCode: 200, responseText: 'ok' };
      },
      async sleep(ms) {
        sleeps.push(ms);
      },
    }
  );

  assert.equal(result.sent, true);
  assert.equal(result.skipped, false);
  assert.equal(result.statusCode, 200);
  assert.equal(result.attempts.length, 2);
  assert.deepEqual(sleeps, [10]);
  assert.equal(posts.length, 2);
  assert.equal(posts[0].body['@type'], 'MessageCard');
  assert.ok(posts[0].headers['x-threshold-alert-dedupe-key']);
  assert.equal(posts[0].headers['x-threshold-alert-dedupe-key'], posts[1].headers['x-threshold-alert-dedupe-key']);
  assert.equal(posts[0].headers['x-threshold-alert-correlation-id'], result.correlation.correlationId);
});
