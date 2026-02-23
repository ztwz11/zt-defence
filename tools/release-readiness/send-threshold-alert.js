#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const SUMMARY_PREFIX = '[threshold-alert]';
const DEFAULT_EVENT = 'threshold_apply_post_verify_failed';
const DEFAULT_CHANNEL = 'generic';
const DEFAULT_ALLOW_MISSING_WEBHOOK = true;
const DEFAULT_RETRY_COUNT = 2;
const DEFAULT_RETRY_BACKOFF_MS = 1500;
const DEFAULT_REQUEST_TIMEOUT_MS = 10000;
const DEFAULT_MAX_RESPONSE_PREVIEW = 512;

const DEFAULT_PROPOSAL_SUMMARY_PATH = '.tmp/release-readiness/trend-threshold-proposal.json';
const DEFAULT_APPLY_SUMMARY_PATH = '.tmp/release-readiness/trend-threshold-apply-summary.json';
const DEFAULT_VERIFICATION_PATH = '.tmp/release-readiness/post-apply-verification.json';
const DEFAULT_REVERT_SUMMARY_PATH = '.tmp/release-readiness/post-apply-revert-summary.json';
const DEFAULT_PAYLOAD_OUTPUT_PATH = '.tmp/release-readiness/post-apply-webhook-payload.json';
const DEFAULT_RESULT_OUTPUT_PATH = '.tmp/release-readiness/post-apply-webhook-result.json';
const SUPPORTED_CHANNELS = new Set(['generic', 'slack', 'teams']);

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function toFiniteNumber(value, fallback) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function normalizeString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function parseBooleanLike(value, fallback) {
  if (value === true || value === false) {
    return value;
  }
  if (value === undefined || value === null) {
    return fallback;
  }
  const normalized = String(value).trim().toLowerCase();
  if (normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'y' || normalized === 'on') {
    return true;
  }
  if (normalized === '0' || normalized === 'false' || normalized === 'no' || normalized === 'n' || normalized === 'off') {
    return false;
  }
  return fallback;
}

function truncateText(value, maxLength) {
  const normalized = typeof value === 'string' ? value : '';
  const limit = Math.max(0, Math.floor(toFiniteNumber(maxLength, DEFAULT_MAX_RESPONSE_PREVIEW)));
  if (limit <= 0 || normalized.length <= limit) {
    return normalized;
  }
  return `${normalized.slice(0, limit)}...`;
}

function parseArgs(argv) {
  const args = Array.isArray(argv) ? argv : [];
  const parsed = {
    help: false,
    webhookUrl: '',
    channel: DEFAULT_CHANNEL,
    event: DEFAULT_EVENT,
    allowMissingWebhook: DEFAULT_ALLOW_MISSING_WEBHOOK,
    verificationExitCode: null,
    targetRef: '',
    allowManualReview: false,
    pushChanges: false,
    proposalSummaryPath: DEFAULT_PROPOSAL_SUMMARY_PATH,
    applySummaryPath: DEFAULT_APPLY_SUMMARY_PATH,
    verificationPath: DEFAULT_VERIFICATION_PATH,
    revertSummaryPath: DEFAULT_REVERT_SUMMARY_PATH,
    payloadOutputPath: DEFAULT_PAYLOAD_OUTPUT_PATH,
    resultOutputPath: DEFAULT_RESULT_OUTPUT_PATH,
    retryCount: DEFAULT_RETRY_COUNT,
    retryBackoffMs: DEFAULT_RETRY_BACKOFF_MS,
    requestTimeoutMs: DEFAULT_REQUEST_TIMEOUT_MS,
    maxResponsePreview: DEFAULT_MAX_RESPONSE_PREVIEW,
  };

  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];

    if (token === '--help' || token === '-h') {
      parsed.help = true;
      continue;
    }

    if (token.startsWith('--webhook-url=')) {
      parsed.webhookUrl = normalizeString(token.slice('--webhook-url='.length));
      continue;
    }
    if (token === '--webhook-url') {
      parsed.webhookUrl = normalizeString(args[index + 1]);
      index += 1;
      continue;
    }

    if (token.startsWith('--channel=')) {
      parsed.channel = normalizeString(token.slice('--channel='.length)).toLowerCase();
      continue;
    }
    if (token === '--channel') {
      parsed.channel = normalizeString(args[index + 1]).toLowerCase();
      index += 1;
      continue;
    }

    if (token.startsWith('--event=')) {
      parsed.event = normalizeString(token.slice('--event='.length));
      continue;
    }
    if (token === '--event') {
      parsed.event = normalizeString(args[index + 1]);
      index += 1;
      continue;
    }

    if (token.startsWith('--allow-missing-webhook=')) {
      parsed.allowMissingWebhook = parseBooleanLike(
        token.slice('--allow-missing-webhook='.length),
        true
      );
      continue;
    }
    if (token === '--allow-missing-webhook') {
      parsed.allowMissingWebhook = true;
      continue;
    }

    if (token.startsWith('--verification-exit-code=')) {
      parsed.verificationExitCode = toFiniteNumber(
        token.slice('--verification-exit-code='.length),
        parsed.verificationExitCode
      );
      continue;
    }
    if (token === '--verification-exit-code') {
      parsed.verificationExitCode = toFiniteNumber(args[index + 1], parsed.verificationExitCode);
      index += 1;
      continue;
    }

    if (token.startsWith('--target-ref=')) {
      parsed.targetRef = normalizeString(token.slice('--target-ref='.length));
      continue;
    }
    if (token === '--target-ref') {
      parsed.targetRef = normalizeString(args[index + 1]);
      index += 1;
      continue;
    }

    if (token.startsWith('--allow-manual-review=')) {
      parsed.allowManualReview = parseBooleanLike(
        token.slice('--allow-manual-review='.length),
        parsed.allowManualReview
      );
      continue;
    }
    if (token === '--allow-manual-review') {
      parsed.allowManualReview = true;
      continue;
    }

    if (token.startsWith('--push-changes=')) {
      parsed.pushChanges = parseBooleanLike(token.slice('--push-changes='.length), parsed.pushChanges);
      continue;
    }
    if (token === '--push-changes') {
      parsed.pushChanges = true;
      continue;
    }

    if (token.startsWith('--proposal-summary=')) {
      parsed.proposalSummaryPath = normalizeString(token.slice('--proposal-summary='.length));
      continue;
    }
    if (token === '--proposal-summary') {
      parsed.proposalSummaryPath = normalizeString(args[index + 1]);
      index += 1;
      continue;
    }

    if (token.startsWith('--apply-summary=')) {
      parsed.applySummaryPath = normalizeString(token.slice('--apply-summary='.length));
      continue;
    }
    if (token === '--apply-summary') {
      parsed.applySummaryPath = normalizeString(args[index + 1]);
      index += 1;
      continue;
    }

    if (token.startsWith('--verification=')) {
      parsed.verificationPath = normalizeString(token.slice('--verification='.length));
      continue;
    }
    if (token === '--verification') {
      parsed.verificationPath = normalizeString(args[index + 1]);
      index += 1;
      continue;
    }

    if (token.startsWith('--revert-summary=')) {
      parsed.revertSummaryPath = normalizeString(token.slice('--revert-summary='.length));
      continue;
    }
    if (token === '--revert-summary') {
      parsed.revertSummaryPath = normalizeString(args[index + 1]);
      index += 1;
      continue;
    }

    if (token.startsWith('--payload-output=')) {
      parsed.payloadOutputPath = normalizeString(token.slice('--payload-output='.length));
      continue;
    }
    if (token === '--payload-output') {
      parsed.payloadOutputPath = normalizeString(args[index + 1]);
      index += 1;
      continue;
    }

    if (token.startsWith('--result-output=')) {
      parsed.resultOutputPath = normalizeString(token.slice('--result-output='.length));
      continue;
    }
    if (token === '--result-output') {
      parsed.resultOutputPath = normalizeString(args[index + 1]);
      index += 1;
      continue;
    }

    if (token.startsWith('--retry-count=')) {
      parsed.retryCount = toFiniteNumber(token.slice('--retry-count='.length), parsed.retryCount);
      continue;
    }
    if (token === '--retry-count') {
      parsed.retryCount = toFiniteNumber(args[index + 1], parsed.retryCount);
      index += 1;
      continue;
    }

    if (token.startsWith('--retry-backoff-ms=')) {
      parsed.retryBackoffMs = toFiniteNumber(
        token.slice('--retry-backoff-ms='.length),
        parsed.retryBackoffMs
      );
      continue;
    }
    if (token === '--retry-backoff-ms') {
      parsed.retryBackoffMs = toFiniteNumber(args[index + 1], parsed.retryBackoffMs);
      index += 1;
      continue;
    }

    if (token.startsWith('--request-timeout-ms=')) {
      parsed.requestTimeoutMs = toFiniteNumber(
        token.slice('--request-timeout-ms='.length),
        parsed.requestTimeoutMs
      );
      continue;
    }
    if (token === '--request-timeout-ms') {
      parsed.requestTimeoutMs = toFiniteNumber(args[index + 1], parsed.requestTimeoutMs);
      index += 1;
      continue;
    }

    if (token.startsWith('--max-response-preview=')) {
      parsed.maxResponsePreview = toFiniteNumber(
        token.slice('--max-response-preview='.length),
        parsed.maxResponsePreview
      );
      continue;
    }
    if (token === '--max-response-preview') {
      parsed.maxResponsePreview = toFiniteNumber(args[index + 1], parsed.maxResponsePreview);
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${token}`);
  }

  if (!SUPPORTED_CHANNELS.has(parsed.channel)) {
    throw new Error(
      `Invalid --channel value. Expected one of: ${Array.from(SUPPORTED_CHANNELS).join(', ')}`
    );
  }
  if (parsed.event.length === 0) {
    throw new Error('Invalid --event value. Expected a non-empty string.');
  }

  const requiredPathFields = [
    ['--proposal-summary', parsed.proposalSummaryPath],
    ['--apply-summary', parsed.applySummaryPath],
    ['--verification', parsed.verificationPath],
    ['--revert-summary', parsed.revertSummaryPath],
    ['--payload-output', parsed.payloadOutputPath],
    ['--result-output', parsed.resultOutputPath],
  ];
  for (const [name, value] of requiredPathFields) {
    if (typeof value !== 'string' || value.length === 0) {
      throw new Error(`Invalid ${name} value. Expected a non-empty path.`);
    }
  }

  if (!Number.isFinite(parsed.retryCount) || parsed.retryCount < 0) {
    throw new Error('Invalid --retry-count value. Expected an integer >= 0.');
  }
  if (!Number.isFinite(parsed.retryBackoffMs) || parsed.retryBackoffMs < 0) {
    throw new Error('Invalid --retry-backoff-ms value. Expected an integer >= 0.');
  }
  if (!Number.isFinite(parsed.requestTimeoutMs) || parsed.requestTimeoutMs < 1) {
    throw new Error('Invalid --request-timeout-ms value. Expected an integer >= 1.');
  }
  if (!Number.isFinite(parsed.maxResponsePreview) || parsed.maxResponsePreview < 0) {
    throw new Error('Invalid --max-response-preview value. Expected an integer >= 0.');
  }

  parsed.retryCount = Math.floor(parsed.retryCount);
  parsed.retryBackoffMs = Math.floor(parsed.retryBackoffMs);
  parsed.requestTimeoutMs = Math.floor(parsed.requestTimeoutMs);
  parsed.maxResponsePreview = Math.floor(parsed.maxResponsePreview);
  if (!Number.isFinite(parsed.verificationExitCode)) {
    parsed.verificationExitCode = null;
  } else {
    parsed.verificationExitCode = Math.floor(parsed.verificationExitCode);
  }

  return parsed;
}

function printHelp() {
  const lines = [
    'Usage: node tools/release-readiness/send-threshold-alert.js [options]',
    '',
    'Options:',
    '  --webhook-url=<url>       External webhook URL (secret value)',
    `  --channel=<name>          Alert channel adapter: generic|slack|teams (default: ${DEFAULT_CHANNEL})`,
    `  --event=<name>            Event key (default: ${DEFAULT_EVENT})`,
    `  --allow-missing-webhook   Skip send when webhook URL is missing (default: ${DEFAULT_ALLOW_MISSING_WEBHOOK})`,
    '  --verification-exit-code=<int>  Post-verify exit code override',
    '  --target-ref=<ref>        Workflow target ref metadata',
    '  --allow-manual-review=<bool>     Workflow input metadata',
    '  --push-changes=<bool>             Workflow input metadata',
    `  --proposal-summary=<path> Proposal summary path (default: ${DEFAULT_PROPOSAL_SUMMARY_PATH})`,
    `  --apply-summary=<path>    Apply summary path (default: ${DEFAULT_APPLY_SUMMARY_PATH})`,
    `  --verification=<path>     Verification summary path (default: ${DEFAULT_VERIFICATION_PATH})`,
    `  --revert-summary=<path>   Revert summary path (default: ${DEFAULT_REVERT_SUMMARY_PATH})`,
    `  --payload-output=<path>   Payload artifact path (default: ${DEFAULT_PAYLOAD_OUTPUT_PATH})`,
    `  --result-output=<path>    Result artifact path (default: ${DEFAULT_RESULT_OUTPUT_PATH})`,
    `  --retry-count=<int>       Retry count after first attempt (default: ${DEFAULT_RETRY_COUNT})`,
    `  --retry-backoff-ms=<int>  Backoff base milliseconds (default: ${DEFAULT_RETRY_BACKOFF_MS})`,
    `  --request-timeout-ms=<int> Request timeout milliseconds (default: ${DEFAULT_REQUEST_TIMEOUT_MS})`,
    `  --max-response-preview=<int> Stored response preview max length (default: ${DEFAULT_MAX_RESPONSE_PREVIEW})`,
    '  --help                    Show this help message',
  ];
  process.stdout.write(`${lines.join('\n')}\n`);
}

function resolvePathFromCwd(candidatePath, dependencies) {
  const deps = isPlainObject(dependencies) ? dependencies : {};
  const resolvePath = typeof deps.resolvePath === 'function' ? deps.resolvePath : path.resolve;
  const cwd = typeof deps.cwd === 'function' ? deps.cwd() : process.cwd();
  return resolvePath(cwd, candidatePath);
}

function stripByteOrderMark(text) {
  if (typeof text !== 'string') {
    return '';
  }
  return text.replace(/^\uFEFF/, '');
}

function readJsonFile(filePath, description, dependencies) {
  const deps = isPlainObject(dependencies) ? dependencies : {};
  const readFileSync = typeof deps.readFileSync === 'function' ? deps.readFileSync : fs.readFileSync;
  let rawText;

  try {
    rawText = String(readFileSync(filePath, 'utf8'));
  } catch (error) {
    throw new Error(
      `THRESHOLD_ALERT_FILE_READ_ERROR(${description}): ${filePath} :: ${
        error && error.message ? error.message : String(error)
      }`
    );
  }

  try {
    return JSON.parse(stripByteOrderMark(rawText));
  } catch (error) {
    throw new Error(
      `THRESHOLD_ALERT_JSON_PARSE_ERROR(${description}): ${filePath} :: ${
        error && error.message ? error.message : String(error)
      }`
    );
  }
}

function readOptionalJsonFile(filePath, description, dependencies) {
  const deps = isPlainObject(dependencies) ? dependencies : {};
  const existsSync = typeof deps.existsSync === 'function' ? deps.existsSync : fs.existsSync;
  if (!existsSync(filePath)) {
    return null;
  }
  return readJsonFile(filePath, description, deps);
}

function writeJsonFile(filePath, payload, dependencies) {
  const deps = isPlainObject(dependencies) ? dependencies : {};
  const mkdirSync = typeof deps.mkdirSync === 'function' ? deps.mkdirSync : fs.mkdirSync;
  const writeFileSync = typeof deps.writeFileSync === 'function' ? deps.writeFileSync : fs.writeFileSync;
  const dirname = typeof deps.dirname === 'function' ? deps.dirname : path.dirname;

  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`);
}

function readGitHubEventPayload(dependencies) {
  const deps = isPlainObject(dependencies) ? dependencies : {};
  const env = isPlainObject(deps.env) ? deps.env : process.env;
  const eventPath = normalizeString(env.GITHUB_EVENT_PATH);
  if (eventPath.length === 0) {
    return null;
  }
  try {
    return readOptionalJsonFile(eventPath, 'github_event_payload', deps);
  } catch (_error) {
    return null;
  }
}

function buildLinks(env, eventPayload) {
  const sourceEnv = isPlainObject(env) ? env : {};
  const serverUrl = normalizeString(sourceEnv.GITHUB_SERVER_URL) || 'https://github.com';
  const repository = normalizeString(sourceEnv.GITHUB_REPOSITORY);
  const runId = normalizeString(sourceEnv.GITHUB_RUN_ID);
  const repositoryUrl = repository.length > 0 ? `${serverUrl}/${repository}` : null;
  const runUrl = repository.length > 0 && runId.length > 0 ? `${serverUrl}/${repository}/actions/runs/${runId}` : null;

  let pullRequestUrl = null;
  if (isPlainObject(eventPayload?.pull_request) && typeof eventPayload.pull_request.html_url === 'string') {
    pullRequestUrl = normalizeString(eventPayload.pull_request.html_url) || null;
  } else if (
    isPlainObject(eventPayload?.issue?.pull_request) &&
    typeof eventPayload.issue.pull_request.html_url === 'string'
  ) {
    pullRequestUrl = normalizeString(eventPayload.issue.pull_request.html_url) || null;
  }

  return {
    runUrl,
    repositoryUrl,
    pullRequestUrl,
  };
}

function buildThresholdDiffSummary(proposalSummary, applySummary) {
  const proposal = isPlainObject(proposalSummary) ? proposalSummary : {};
  const apply = isPlainObject(applySummary) ? applySummary : {};
  const proposalRows = Array.isArray(proposal?.rebalance?.chapterRows) ? proposal.rebalance.chapterRows : [];
  const applyRows = Array.isArray(apply.rows) ? apply.rows : [];
  const appliedChapterIds = Array.isArray(apply.appliedChapterIds) ? apply.appliedChapterIds : [];
  const manualReviewChapterIds = Array.isArray(apply.manualReviewChapterIds)
    ? apply.manualReviewChapterIds
    : [];

  return {
    hasProposal: proposal?.hasProposal === true,
    consideredRowCount: toFiniteNumber(apply.consideredRowCount, applyRows.length),
    appliedCount: appliedChapterIds.length,
    appliedChapterIds,
    manualReviewCount: manualReviewChapterIds.length,
    manualReviewChapterIds,
    blocked: apply?.blocked === true,
    proposalRebalanceChangedCount: toFiniteNumber(proposal?.rebalance?.changedCount, proposalRows.length),
    proposalManualReviewCount: toFiniteNumber(proposal?.rebalance?.manualReviewCount, 0),
    proposalChangedChapterIds: Array.isArray(proposal?.rebalance?.changedChapterIds)
      ? proposal.rebalance.changedChapterIds
      : [],
  };
}

function buildCanonicalPayload(options, context) {
  const sourceOptions = isPlainObject(options) ? options : {};
  const sourceContext = isPlainObject(context) ? context : {};
  const env = isPlainObject(sourceContext.env) ? sourceContext.env : {};
  const now = typeof sourceContext.now === 'function' ? sourceContext.now : () => new Date().toISOString();
  const verificationSummary = isPlainObject(sourceContext.verificationSummary)
    ? sourceContext.verificationSummary
    : null;
  const revertSummary = isPlainObject(sourceContext.revertSummary) ? sourceContext.revertSummary : null;
  const thresholdDiff = buildThresholdDiffSummary(
    sourceContext.proposalSummary,
    sourceContext.applySummary
  );
  const links = buildLinks(env, sourceContext.eventPayload);
  const verificationExitCode = Number.isFinite(sourceOptions.verificationExitCode)
    ? sourceOptions.verificationExitCode
    : toFiniteNumber(verificationSummary?.exitCode, 1);

  return {
    schemaVersion: '1.0.0',
    generatedAt: now(),
    event: sourceOptions.event || DEFAULT_EVENT,
    severity: 'error',
    source: {
      repository: normalizeString(env.GITHUB_REPOSITORY) || null,
      workflow: normalizeString(env.GITHUB_WORKFLOW) || null,
      job: normalizeString(env.GITHUB_JOB) || null,
      runId: normalizeString(env.GITHUB_RUN_ID) || null,
      runAttempt: normalizeString(env.GITHUB_RUN_ATTEMPT) || null,
      sha: normalizeString(env.GITHUB_SHA) || null,
      ref: normalizeString(env.GITHUB_REF) || null,
      actor: normalizeString(env.GITHUB_ACTOR) || null,
      eventName: normalizeString(env.GITHUB_EVENT_NAME) || null,
    },
    workflowInput: {
      targetRef: sourceOptions.targetRef || normalizeString(env.GITHUB_REF) || null,
      allowManualReview: sourceOptions.allowManualReview === true,
      pushChanges: sourceOptions.pushChanges === true,
    },
    failure: {
      phase: 'post_apply_verification',
      step: 'Post-apply release-readiness verification',
      verificationExitCode,
      verification: verificationSummary,
      reverted: revertSummary?.reverted === true,
      revertSummary,
    },
    thresholdDiff,
    links,
    artifacts: {
      proposalSummaryPath: sourceContext.proposalSummaryPath || null,
      applySummaryPath: sourceContext.applySummaryPath || null,
      verificationPath: sourceContext.verificationPath || null,
      revertSummaryPath: sourceContext.revertSummaryPath || null,
      payloadPath: sourceContext.payloadOutputPath || null,
      resultPath: sourceContext.resultOutputPath || null,
    },
  };
}

function buildChannelRequestBody(channel, payload) {
  const selectedChannel = normalizeString(channel).toLowerCase() || DEFAULT_CHANNEL;
  const sourcePayload = isPlainObject(payload) ? payload : {};
  const repository = sourcePayload?.source?.repository || 'unknown-repository';
  const exitCode = sourcePayload?.failure?.verificationExitCode;
  const runUrl = sourcePayload?.links?.runUrl;
  const summaryText = `[threshold-apply] post-apply verification failed (${repository}, exit=${exitCode})`;

  if (selectedChannel === 'slack') {
    return {
      text: summaryText,
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*Threshold Apply Alert*\n${summaryText}`,
          },
        },
        {
          type: 'section',
          fields: [
            { type: 'mrkdwn', text: `*Event*\n${sourcePayload.event || DEFAULT_EVENT}` },
            { type: 'mrkdwn', text: `*Run*\n${runUrl || 'n/a'}` },
          ],
        },
      ],
      payload: sourcePayload,
    };
  }

  if (selectedChannel === 'teams') {
    const facts = [
      { name: 'Repository', value: String(repository) },
      { name: 'Event', value: String(sourcePayload.event || DEFAULT_EVENT) },
      { name: 'Exit Code', value: String(exitCode) },
      { name: 'Run', value: String(runUrl || 'n/a') },
    ];
    return {
      '@type': 'MessageCard',
      '@context': 'http://schema.org/extensions',
      summary: summaryText,
      themeColor: 'E81123',
      title: 'Threshold Apply Alert',
      sections: [
        {
          activityTitle: summaryText,
          facts,
          text: 'post-apply verification failed and threshold auto-revert was triggered.',
        },
      ],
      potentialAction: runUrl
        ? [
            {
              '@type': 'OpenUri',
              name: 'View Workflow Run',
              targets: [{ os: 'default', uri: runUrl }],
            },
          ]
        : [],
      payload: sourcePayload,
    };
  }

  return sourcePayload;
}

async function defaultPostJson(url, body, timeoutMs, dependencies) {
  const deps = isPlainObject(dependencies) ? dependencies : {};
  const fetchImpl = typeof deps.fetch === 'function' ? deps.fetch : globalThis.fetch;
  if (typeof fetchImpl !== 'function') {
    throw new Error('Fetch implementation is unavailable.');
  }

  const timeout = Math.max(1, Math.floor(toFiniteNumber(timeoutMs, DEFAULT_REQUEST_TIMEOUT_MS)));
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  if (typeof timer.unref === 'function') {
    timer.unref();
  }

  try {
    const response = await fetchImpl(String(url), {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const responseText = await response.text();
    return {
      ok: response.ok === true,
      statusCode: toFiniteNumber(response.status, null),
      responseText,
    };
  } finally {
    clearTimeout(timer);
  }
}

async function defaultSleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function sendWithRetry(webhookUrl, requestBody, options, dependencies) {
  const deps = isPlainObject(dependencies) ? dependencies : {};
  const sourceOptions = isPlainObject(options) ? options : {};
  const retryCount = Math.max(0, Math.floor(toFiniteNumber(sourceOptions.retryCount, DEFAULT_RETRY_COUNT)));
  const backoffMs = Math.max(0, Math.floor(toFiniteNumber(sourceOptions.retryBackoffMs, DEFAULT_RETRY_BACKOFF_MS)));
  const timeoutMs = Math.max(1, Math.floor(toFiniteNumber(sourceOptions.requestTimeoutMs, DEFAULT_REQUEST_TIMEOUT_MS)));
  const maxPreview = Math.max(
    0,
    Math.floor(toFiniteNumber(sourceOptions.maxResponsePreview, DEFAULT_MAX_RESPONSE_PREVIEW))
  );
  const postJson = typeof deps.postJson === 'function' ? deps.postJson : defaultPostJson;
  const sleep = typeof deps.sleep === 'function' ? deps.sleep : defaultSleep;
  const attempts = [];
  const maxAttempt = retryCount + 1;

  for (let attempt = 1; attempt <= maxAttempt; attempt += 1) {
    try {
      const response = await postJson(webhookUrl, requestBody, timeoutMs, deps);
      const attemptEntry = {
        attempt,
        ok: response?.ok === true,
        statusCode: toFiniteNumber(response?.statusCode, null),
        responsePreview: truncateText(response?.responseText, maxPreview),
      };
      attempts.push(attemptEntry);

      if (attemptEntry.ok) {
        return {
          sent: true,
          attempts,
          statusCode: attemptEntry.statusCode,
          responsePreview: attemptEntry.responsePreview,
          error: null,
        };
      }
    } catch (error) {
      const message = error && error.message ? error.message : String(error);
      attempts.push({
        attempt,
        ok: false,
        statusCode: null,
        responsePreview: '',
        error: message,
      });
    }

    if (attempt < maxAttempt) {
      await sleep(backoffMs * attempt, deps);
    }
  }

  const lastAttempt = attempts.length > 0 ? attempts[attempts.length - 1] : {};
  return {
    sent: false,
    attempts,
    statusCode: toFiniteNumber(lastAttempt.statusCode, null),
    responsePreview: truncateText(lastAttempt.responsePreview, maxPreview),
    error:
      typeof lastAttempt.error === 'string' && lastAttempt.error.length > 0
        ? lastAttempt.error
        : `HTTP status ${lastAttempt.statusCode || 'unknown'}`,
  };
}

function createSummaryLine(result) {
  const source = isPlainObject(result) ? result : {};
  const status = source.sent ? 'PASS' : source.skipped ? 'SKIP' : 'FAIL';
  const attempts = Array.isArray(source.attempts) ? source.attempts.length : 0;
  return `${SUMMARY_PREFIX} ${status} channel=${source.channel || DEFAULT_CHANNEL} attempts=${attempts} sent=${source.sent === true}`;
}

async function runAlert(options, dependencies) {
  const deps = isPlainObject(dependencies) ? dependencies : {};
  const sourceOptions = isPlainObject(options) ? options : {};
  const now = typeof deps.now === 'function' ? deps.now : () => new Date().toISOString();
  const env = isPlainObject(deps.env) ? deps.env : process.env;
  const resolvedProposalSummaryPath = resolvePathFromCwd(sourceOptions.proposalSummaryPath, deps);
  const resolvedApplySummaryPath = resolvePathFromCwd(sourceOptions.applySummaryPath, deps);
  const resolvedVerificationPath = resolvePathFromCwd(sourceOptions.verificationPath, deps);
  const resolvedRevertSummaryPath = resolvePathFromCwd(sourceOptions.revertSummaryPath, deps);
  const resolvedPayloadOutputPath = resolvePathFromCwd(sourceOptions.payloadOutputPath, deps);
  const resolvedResultOutputPath = resolvePathFromCwd(sourceOptions.resultOutputPath, deps);

  const proposalSummary = readOptionalJsonFile(resolvedProposalSummaryPath, 'proposal_summary', deps);
  const applySummary = readOptionalJsonFile(resolvedApplySummaryPath, 'apply_summary', deps);
  const verificationSummary = readOptionalJsonFile(resolvedVerificationPath, 'post_apply_verification', deps);
  const revertSummary = readOptionalJsonFile(resolvedRevertSummaryPath, 'post_apply_revert_summary', deps);
  const eventPayload = readGitHubEventPayload({
    ...deps,
    env,
  });

  const payload = buildCanonicalPayload(sourceOptions, {
    now,
    env,
    eventPayload,
    proposalSummary,
    applySummary,
    verificationSummary,
    revertSummary,
    proposalSummaryPath: resolvedProposalSummaryPath,
    applySummaryPath: resolvedApplySummaryPath,
    verificationPath: resolvedVerificationPath,
    revertSummaryPath: resolvedRevertSummaryPath,
    payloadOutputPath: resolvedPayloadOutputPath,
    resultOutputPath: resolvedResultOutputPath,
  });

  writeJsonFile(resolvedPayloadOutputPath, payload, deps);

  const webhookUrl = normalizeString(sourceOptions.webhookUrl);
  if (webhookUrl.length === 0) {
    const skipped = sourceOptions.allowMissingWebhook === true;
    const result = {
      generatedAt: now(),
      sent: false,
      skipped,
      reason: skipped ? 'missing_webhook_url' : 'missing_webhook_url_blocked',
      channel: sourceOptions.channel,
      webhookConfigured: false,
      attempts: [],
      statusCode: null,
      responsePreview: '',
      error: skipped ? null : 'Webhook URL is required but missing.',
      payloadPath: resolvedPayloadOutputPath,
      resultPath: resolvedResultOutputPath,
    };
    result.summaryLine = createSummaryLine(result);
    writeJsonFile(resolvedResultOutputPath, result, deps);
    if (!skipped) {
      throw new Error('THRESHOLD_ALERT_MISSING_WEBHOOK_URL');
    }
    return result;
  }

  const channelBody = buildChannelRequestBody(sourceOptions.channel, payload);
  const sendResult = await sendWithRetry(
    webhookUrl,
    channelBody,
    {
      retryCount: sourceOptions.retryCount,
      retryBackoffMs: sourceOptions.retryBackoffMs,
      requestTimeoutMs: sourceOptions.requestTimeoutMs,
      maxResponsePreview: sourceOptions.maxResponsePreview,
    },
    deps
  );

  const result = {
    generatedAt: now(),
    sent: sendResult.sent === true,
    skipped: false,
    reason: sendResult.sent === true ? 'delivered' : 'delivery_failed',
    channel: sourceOptions.channel,
    webhookConfigured: true,
    attempts: sendResult.attempts,
    statusCode: sendResult.statusCode,
    responsePreview: sendResult.responsePreview,
    error: sendResult.error,
    payloadPath: resolvedPayloadOutputPath,
    resultPath: resolvedResultOutputPath,
  };
  result.summaryLine = createSummaryLine(result);

  writeJsonFile(resolvedResultOutputPath, result, deps);

  if (!result.sent) {
    throw new Error(`THRESHOLD_ALERT_DELIVERY_FAILED: ${result.error || 'unknown error'}`);
  }

  return result;
}

async function main() {
  let parsedArgs;
  try {
    parsedArgs = parseArgs(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.stderr.write('Use --help to see supported options.\n');
    process.exit(1);
  }

  if (parsedArgs.help) {
    printHelp();
    return;
  }

  if (parsedArgs.webhookUrl.length === 0) {
    parsedArgs.webhookUrl = normalizeString(process.env.THRESHOLD_APPLY_ALERT_WEBHOOK_URL);
  }

  try {
    const result = await runAlert(parsedArgs);
    process.stdout.write(`${result.summaryLine}\n`);
    process.stderr.write(`${SUMMARY_PREFIX} Wrote payload to ${result.payloadPath}\n`);
    process.stderr.write(`${SUMMARY_PREFIX} Wrote result to ${result.resultPath}\n`);
    if (result.skipped) {
      process.stderr.write(`${SUMMARY_PREFIX} Skipped send: ${result.reason}\n`);
    }
  } catch (error) {
    process.stderr.write(`${SUMMARY_PREFIX} Execution failed\n`);
    process.stderr.write(`${error && error.stack ? error.stack : String(error)}\n`);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  SUMMARY_PREFIX,
  DEFAULT_EVENT,
  DEFAULT_CHANNEL,
  DEFAULT_ALLOW_MISSING_WEBHOOK,
  DEFAULT_RETRY_COUNT,
  DEFAULT_RETRY_BACKOFF_MS,
  DEFAULT_REQUEST_TIMEOUT_MS,
  DEFAULT_PROPOSAL_SUMMARY_PATH,
  DEFAULT_APPLY_SUMMARY_PATH,
  DEFAULT_VERIFICATION_PATH,
  DEFAULT_REVERT_SUMMARY_PATH,
  DEFAULT_PAYLOAD_OUTPUT_PATH,
  DEFAULT_RESULT_OUTPUT_PATH,
  parseArgs,
  buildThresholdDiffSummary,
  buildCanonicalPayload,
  buildChannelRequestBody,
  sendWithRetry,
  runAlert,
  createSummaryLine,
};

