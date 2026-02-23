#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const { normalizeTrendThresholds } = require('./check-trend-diff');

const SUMMARY_PREFIX = '[trend-threshold-apply]';
const DEFAULT_PROPOSAL_PATH = '.tmp/release-readiness/trend-threshold-proposal.json';
const DEFAULT_THRESHOLDS_PATH = path.join(__dirname, 'trend-thresholds.json');
const DEFAULT_OUTPUT_PATH = '.tmp/release-readiness/trend-thresholds.applied.preview.json';
const DEFAULT_SUMMARY_OUTPUT_PATH = '.tmp/release-readiness/trend-threshold-apply-summary.json';

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function toFiniteNumber(value, fallback) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function parseBooleanLike(value, fallback) {
  if (value === true || value === false) {
    return value;
  }
  if (value === undefined || value === null) {
    return fallback;
  }
  const normalized = String(value).trim().toLowerCase();
  if (normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'y') {
    return true;
  }
  if (normalized === '0' || normalized === 'false' || normalized === 'no' || normalized === 'n') {
    return false;
  }
  return fallback;
}

function normalizeChapterList(source) {
  if (typeof source !== 'string' || source.trim().length === 0) {
    return [];
  }
  const values = source
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter((value) => value.length > 0);
  return Array.from(new Set(values)).sort();
}

function roundTo(value, digits) {
  const numeric = toFiniteNumber(value, NaN);
  if (!Number.isFinite(numeric)) {
    return null;
  }
  const precision = Math.pow(10, digits);
  return Math.round((numeric + Number.EPSILON) * precision) / precision;
}

function parseArgs(argv) {
  const args = Array.isArray(argv) ? argv : [];
  const parsed = {
    help: false,
    proposalPath: DEFAULT_PROPOSAL_PATH,
    thresholdsPath: DEFAULT_THRESHOLDS_PATH,
    outputPath: DEFAULT_OUTPUT_PATH,
    summaryOutputPath: DEFAULT_SUMMARY_OUTPUT_PATH,
    write: false,
    allowManualReview: false,
    chapterIds: [],
  };

  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];

    if (token === '--help' || token === '-h') {
      parsed.help = true;
      continue;
    }

    if (token.startsWith('--proposal=')) {
      parsed.proposalPath = token.slice('--proposal='.length).trim();
      continue;
    }
    if (token === '--proposal') {
      parsed.proposalPath = String(args[index + 1] || '').trim();
      index += 1;
      continue;
    }

    if (token.startsWith('--thresholds=')) {
      parsed.thresholdsPath = token.slice('--thresholds='.length).trim();
      continue;
    }
    if (token === '--thresholds') {
      parsed.thresholdsPath = String(args[index + 1] || '').trim();
      index += 1;
      continue;
    }

    if (token.startsWith('--output=')) {
      parsed.outputPath = token.slice('--output='.length).trim();
      continue;
    }
    if (token === '--output') {
      parsed.outputPath = String(args[index + 1] || '').trim();
      index += 1;
      continue;
    }

    if (token.startsWith('--summary-output=')) {
      parsed.summaryOutputPath = token.slice('--summary-output='.length).trim();
      continue;
    }
    if (token === '--summary-output') {
      parsed.summaryOutputPath = String(args[index + 1] || '').trim();
      index += 1;
      continue;
    }

    if (token.startsWith('--chapters=')) {
      parsed.chapterIds = normalizeChapterList(token.slice('--chapters='.length));
      continue;
    }
    if (token === '--chapters') {
      parsed.chapterIds = normalizeChapterList(String(args[index + 1] || ''));
      index += 1;
      continue;
    }

    if (token.startsWith('--allow-manual-review=')) {
      parsed.allowManualReview = parseBooleanLike(
        token.slice('--allow-manual-review='.length),
        true
      );
      continue;
    }
    if (token === '--allow-manual-review') {
      parsed.allowManualReview = true;
      continue;
    }

    if (token === '--write') {
      parsed.write = true;
      continue;
    }

    throw new Error(`Unknown argument: ${token}`);
  }

  const requiredPathFields = [
    ['--proposal', parsed.proposalPath],
    ['--thresholds', parsed.thresholdsPath],
    ['--output', parsed.outputPath],
    ['--summary-output', parsed.summaryOutputPath],
  ];
  for (const [name, value] of requiredPathFields) {
    if (typeof value !== 'string' || value.length === 0) {
      throw new Error(`Invalid ${name} value. Expected a non-empty path.`);
    }
  }

  return parsed;
}

function printHelp() {
  const lines = [
    'Usage: node tools/release-readiness/apply-threshold-proposal.js [options]',
    '',
    'Options:',
    `  --proposal=<path>          Proposal json path (default: ${DEFAULT_PROPOSAL_PATH})`,
    `  --thresholds=<path>        Thresholds json path (default: ${DEFAULT_THRESHOLDS_PATH})`,
    `  --output=<path>            Applied thresholds preview path (default: ${DEFAULT_OUTPUT_PATH})`,
    `  --summary-output=<path>    Apply summary path (default: ${DEFAULT_SUMMARY_OUTPUT_PATH})`,
    '  --chapters=<a,b,c>         Optional chapter id allow-list',
    '  --allow-manual-review      Do not fail when manual_review chapter rows exist',
    '  --write                    Apply updates directly to --thresholds',
    '  --help                     Show this help message',
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
      `TREND_THRESHOLD_APPLY_FILE_READ_ERROR(${description}): ${filePath} :: ${
        error && error.message ? error.message : String(error)
      }`
    );
  }

  try {
    return JSON.parse(stripByteOrderMark(rawText));
  } catch (error) {
    throw new Error(
      `TREND_THRESHOLD_APPLY_JSON_PARSE_ERROR(${description}): ${filePath} :: ${
        error && error.message ? error.message : String(error)
      }`
    );
  }
}

function writeJsonFile(filePath, payload, dependencies) {
  const deps = isPlainObject(dependencies) ? dependencies : {};
  const mkdirSync = typeof deps.mkdirSync === 'function' ? deps.mkdirSync : fs.mkdirSync;
  const writeFileSync = typeof deps.writeFileSync === 'function' ? deps.writeFileSync : fs.writeFileSync;
  const dirname = typeof deps.dirname === 'function' ? deps.dirname : path.dirname;

  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`);
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function createSummaryLine(result) {
  const source = isPlainObject(result) ? result : {};
  const status = source.blocked ? 'FAIL' : 'PASS';
  return [
    `${SUMMARY_PREFIX} ${status}`,
    `rows=${source.consideredRowCount || 0}`,
    `applied=${(source.appliedChapterIds || []).length}`,
    `manualReview=${(source.manualReviewChapterIds || []).length}`,
    `blocked=${source.blocked ? 'true' : 'false'}`,
  ].join(' ');
}

function applyThresholdProposal(options, dependencies) {
  const deps = isPlainObject(dependencies) ? dependencies : {};
  const sourceOptions = isPlainObject(options) ? options : {};
  const now = typeof deps.now === 'function' ? deps.now : () => new Date().toISOString();
  const resolvedProposalPath = resolvePathFromCwd(sourceOptions.proposalPath, deps);
  const resolvedThresholdsPath = resolvePathFromCwd(sourceOptions.thresholdsPath, deps);
  const resolvedOutputPath = resolvePathFromCwd(sourceOptions.outputPath, deps);
  const resolvedSummaryOutputPath = resolvePathFromCwd(sourceOptions.summaryOutputPath, deps);
  const proposal = readJsonFile(resolvedProposalPath, 'proposal', deps);
  const baseThresholds = normalizeTrendThresholds(readJsonFile(resolvedThresholdsPath, 'thresholds', deps));
  const nextThresholds = cloneJson(baseThresholds);
  const defaultChapterThreshold = nextThresholds.tuning.defaultChapterThreshold;
  const selectedChapterIds = Array.isArray(sourceOptions.chapterIds) ? sourceOptions.chapterIds : [];
  const selectedChapterSet = new Set(selectedChapterIds);
  const rows = Array.isArray(proposal?.rebalance?.chapterRows) ? proposal.rebalance.chapterRows : [];
  const manualReviewChapterIds = [];
  const appliedChapterIds = [];
  const unchangedChapterIds = [];
  const skippedChapterIds = [];
  const ignoredActionChapterIds = [];
  const invalidValueChapterIds = [];
  const resultRows = [];

  for (const row of rows) {
    const chapterId =
      typeof row?.chapterId === 'string' && row.chapterId.trim().length > 0
        ? row.chapterId.trim().toLowerCase()
        : null;
    if (!chapterId) {
      continue;
    }

    if (selectedChapterSet.size > 0 && !selectedChapterSet.has(chapterId)) {
      skippedChapterIds.push(chapterId);
      continue;
    }

    const action = typeof row.action === 'string' ? row.action.trim().toLowerCase() : 'keep';
    if (action === 'manual_review') {
      manualReviewChapterIds.push(chapterId);
      resultRows.push({
        chapterId,
        action,
        current: roundTo(row.currentScoreIncreaseMax, 6),
        proposed: roundTo(row.proposedScoreIncreaseMax, 6),
        applied: false,
        reason: 'manual_review_required',
      });
      continue;
    }

    if (action !== 'tighten' && action !== 'relax' && action !== 'keep') {
      ignoredActionChapterIds.push(chapterId);
      resultRows.push({
        chapterId,
        action,
        current: roundTo(row.currentScoreIncreaseMax, 6),
        proposed: roundTo(row.proposedScoreIncreaseMax, 6),
        applied: false,
        reason: 'unsupported_action',
      });
      continue;
    }

    const proposedScore = toFiniteNumber(row.proposedScoreIncreaseMax, NaN);
    if (!Number.isFinite(proposedScore) || proposedScore < 0) {
      invalidValueChapterIds.push(chapterId);
      resultRows.push({
        chapterId,
        action,
        current: roundTo(row.currentScoreIncreaseMax, 6),
        proposed: roundTo(row.proposedScoreIncreaseMax, 6),
        applied: false,
        reason: 'invalid_proposed_score',
      });
      continue;
    }

    if (!isPlainObject(nextThresholds.tuning.chapters[chapterId])) {
      nextThresholds.tuning.chapters[chapterId] = cloneJson(defaultChapterThreshold);
    }

    const currentScore = toFiniteNumber(
      nextThresholds.tuning.chapters[chapterId].scoreIncreaseMax,
      toFiniteNumber(defaultChapterThreshold.scoreIncreaseMax, 0)
    );
    const nextScore = roundTo(proposedScore, 6);

    if (Math.abs(currentScore - nextScore) <= 0.000001) {
      unchangedChapterIds.push(chapterId);
      resultRows.push({
        chapterId,
        action,
        current: roundTo(currentScore, 6),
        proposed: nextScore,
        applied: false,
        reason: 'no_change',
      });
      continue;
    }

    nextThresholds.tuning.chapters[chapterId].scoreIncreaseMax = nextScore;
    appliedChapterIds.push(chapterId);
    resultRows.push({
      chapterId,
      action,
      current: roundTo(currentScore, 6),
      proposed: nextScore,
      applied: true,
      reason: 'applied',
    });
  }

  const blocked = manualReviewChapterIds.length > 0 && sourceOptions.allowManualReview !== true;
  let writtenThresholdsPath = null;

  if (!blocked && sourceOptions.write === true) {
    writeJsonFile(resolvedThresholdsPath, nextThresholds, deps);
    writtenThresholdsPath = resolvedThresholdsPath;
  }

  writeJsonFile(resolvedOutputPath, nextThresholds, deps);

  const result = {
    generatedAt: now(),
    proposalPath: resolvedProposalPath,
    thresholdsPath: resolvedThresholdsPath,
    outputPath: resolvedOutputPath,
    summaryOutputPath: resolvedSummaryOutputPath,
    write: sourceOptions.write === true,
    allowManualReview: sourceOptions.allowManualReview === true,
    selectedChapterIds,
    hasProposal: proposal?.hasProposal === true,
    consideredRowCount: resultRows.length,
    appliedChapterIds: Array.from(new Set(appliedChapterIds)).sort(),
    unchangedChapterIds: Array.from(new Set(unchangedChapterIds)).sort(),
    skippedChapterIds: Array.from(new Set(skippedChapterIds)).sort(),
    ignoredActionChapterIds: Array.from(new Set(ignoredActionChapterIds)).sort(),
    invalidValueChapterIds: Array.from(new Set(invalidValueChapterIds)).sort(),
    manualReviewChapterIds: Array.from(new Set(manualReviewChapterIds)).sort(),
    blocked,
    writtenThresholdsPath,
    writtenOutputPath: resolvedOutputPath,
    rows: resultRows,
  };

  writeJsonFile(resolvedSummaryOutputPath, result, deps);
  return {
    ...result,
    summaryLine: createSummaryLine(result),
  };
}

function main() {
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

  try {
    const result = applyThresholdProposal(parsedArgs);
    process.stdout.write(`${result.summaryLine}\n`);
    process.stderr.write(`${SUMMARY_PREFIX} Wrote preview to ${result.writtenOutputPath}\n`);
    process.stderr.write(`${SUMMARY_PREFIX} Wrote summary to ${result.summaryOutputPath}\n`);
    if (result.writtenThresholdsPath) {
      process.stderr.write(`${SUMMARY_PREFIX} Wrote thresholds to ${result.writtenThresholdsPath}\n`);
    }
    if (result.blocked) {
      process.stderr.write(
        `${SUMMARY_PREFIX} Manual review chapters require explicit override: ${result.manualReviewChapterIds.join(', ')}\n`
      );
      process.exit(2);
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
  DEFAULT_PROPOSAL_PATH,
  DEFAULT_THRESHOLDS_PATH,
  DEFAULT_OUTPUT_PATH,
  DEFAULT_SUMMARY_OUTPUT_PATH,
  parseArgs,
  applyThresholdProposal,
  createSummaryLine,
};
