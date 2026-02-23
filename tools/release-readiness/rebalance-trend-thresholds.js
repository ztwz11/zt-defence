#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const { normalizeTrendThresholds } = require('./check-trend-diff');

const SUMMARY_PREFIX = '[trend-threshold-rebalance]';
const DEFAULT_REPORT_PATH = '.tmp/release-readiness/trend-diff-report.json';
const DEFAULT_THRESHOLDS_PATH = path.join(__dirname, 'trend-thresholds.json');
const DEFAULT_OUTPUT_PATH = '.tmp/release-readiness/trend-threshold-recommendation.json';
const DEFAULT_POLICY = {
  minScoreIncreaseMax: 0.05,
  maxScoreIncreaseMax: 2.0,
  tightenMargin: 0.03,
  tightenRate: 0.4,
  relaxMargin: 0.03,
  epsilon: 0.000001,
};

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function parseNumberOption(value, fallback) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function roundTo(value, digits) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return 0;
  }
  const precision = Math.pow(10, digits);
  return Math.round((numeric + Number.EPSILON) * precision) / precision;
}

function parseArgs(argv) {
  const args = Array.isArray(argv) ? argv : [];
  const parsed = {
    help: false,
    reportPath: DEFAULT_REPORT_PATH,
    thresholdsPath: DEFAULT_THRESHOLDS_PATH,
    outputPath: DEFAULT_OUTPUT_PATH,
    adaptivePolicyPath: null,
    write: false,
    policy: { ...DEFAULT_POLICY },
  };

  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];

    if (token === '--help' || token === '-h') {
      parsed.help = true;
      continue;
    }

    if (token.startsWith('--report=')) {
      parsed.reportPath = token.slice('--report='.length).trim();
      continue;
    }

    if (token === '--report') {
      parsed.reportPath = String(args[index + 1] || '').trim();
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

    if (token.startsWith('--adaptive-policy=')) {
      parsed.adaptivePolicyPath = token.slice('--adaptive-policy='.length).trim();
      continue;
    }

    if (token === '--adaptive-policy') {
      parsed.adaptivePolicyPath = String(args[index + 1] || '').trim();
      index += 1;
      continue;
    }

    if (token.startsWith('--min-score-increase-max=')) {
      parsed.policy.minScoreIncreaseMax = parseNumberOption(
        token.slice('--min-score-increase-max='.length),
        parsed.policy.minScoreIncreaseMax
      );
      continue;
    }

    if (token === '--min-score-increase-max') {
      parsed.policy.minScoreIncreaseMax = parseNumberOption(
        args[index + 1],
        parsed.policy.minScoreIncreaseMax
      );
      index += 1;
      continue;
    }

    if (token.startsWith('--max-score-increase-max=')) {
      parsed.policy.maxScoreIncreaseMax = parseNumberOption(
        token.slice('--max-score-increase-max='.length),
        parsed.policy.maxScoreIncreaseMax
      );
      continue;
    }

    if (token === '--max-score-increase-max') {
      parsed.policy.maxScoreIncreaseMax = parseNumberOption(
        args[index + 1],
        parsed.policy.maxScoreIncreaseMax
      );
      index += 1;
      continue;
    }

    if (token.startsWith('--tighten-margin=')) {
      parsed.policy.tightenMargin = parseNumberOption(
        token.slice('--tighten-margin='.length),
        parsed.policy.tightenMargin
      );
      continue;
    }

    if (token === '--tighten-margin') {
      parsed.policy.tightenMargin = parseNumberOption(args[index + 1], parsed.policy.tightenMargin);
      index += 1;
      continue;
    }

    if (token.startsWith('--tighten-rate=')) {
      parsed.policy.tightenRate = parseNumberOption(
        token.slice('--tighten-rate='.length),
        parsed.policy.tightenRate
      );
      continue;
    }

    if (token === '--tighten-rate') {
      parsed.policy.tightenRate = parseNumberOption(args[index + 1], parsed.policy.tightenRate);
      index += 1;
      continue;
    }

    if (token.startsWith('--relax-margin=')) {
      parsed.policy.relaxMargin = parseNumberOption(
        token.slice('--relax-margin='.length),
        parsed.policy.relaxMargin
      );
      continue;
    }

    if (token === '--relax-margin') {
      parsed.policy.relaxMargin = parseNumberOption(args[index + 1], parsed.policy.relaxMargin);
      index += 1;
      continue;
    }

    if (token === '--write') {
      parsed.write = true;
      continue;
    }

    throw new Error(`Unknown argument: ${token}`);
  }

  if (parsed.reportPath.length === 0) {
    throw new Error('Invalid --report value. Expected a non-empty path.');
  }

  if (parsed.thresholdsPath.length === 0) {
    throw new Error('Invalid --thresholds value. Expected a non-empty path.');
  }

  if (parsed.outputPath !== null && parsed.outputPath.length === 0) {
    throw new Error('Invalid --output value. Expected a non-empty path.');
  }

  if (parsed.adaptivePolicyPath !== null && parsed.adaptivePolicyPath.length === 0) {
    throw new Error('Invalid --adaptive-policy value. Expected a non-empty path.');
  }

  if (parsed.policy.minScoreIncreaseMax < 0) {
    throw new Error('Invalid --min-score-increase-max value. Expected a non-negative number.');
  }

  if (parsed.policy.maxScoreIncreaseMax < parsed.policy.minScoreIncreaseMax) {
    throw new Error(
      'Invalid score threshold range. Expected --max-score-increase-max >= --min-score-increase-max.'
    );
  }

  if (parsed.policy.tightenMargin < 0) {
    throw new Error('Invalid --tighten-margin value. Expected a non-negative number.');
  }

  if (parsed.policy.relaxMargin < 0) {
    throw new Error('Invalid --relax-margin value. Expected a non-negative number.');
  }

  if (parsed.policy.tightenRate <= 0 || parsed.policy.tightenRate > 1) {
    throw new Error('Invalid --tighten-rate value. Expected a number in the range (0, 1].');
  }

  return parsed;
}

function printHelp() {
  const lines = [
    'Usage: node tools/release-readiness/rebalance-trend-thresholds.js [options]',
    '',
    'Options:',
    `  --report=<path>                  Trend diff report path (default: ${DEFAULT_REPORT_PATH})`,
    `  --thresholds=<path>              Trend thresholds path (default: ${DEFAULT_THRESHOLDS_PATH})`,
    `  --output=<path>                  Recommendation output path (default: ${DEFAULT_OUTPUT_PATH})`,
    '  --adaptive-policy=<path>         Optional adaptive chapter policy json',
    '  --write                          Apply proposed scoreIncreaseMax values to --thresholds file',
    `  --min-score-increase-max=<num>   Lower clamp for scoreIncreaseMax (default: ${DEFAULT_POLICY.minScoreIncreaseMax})`,
    `  --max-score-increase-max=<num>   Upper clamp for scoreIncreaseMax (default: ${DEFAULT_POLICY.maxScoreIncreaseMax})`,
    `  --tighten-margin=<num>           Safety margin for tighten target (default: ${DEFAULT_POLICY.tightenMargin})`,
    `  --tighten-rate=<num>             Tighten interpolation rate (default: ${DEFAULT_POLICY.tightenRate})`,
    `  --relax-margin=<num>             Relax safety margin on score regression (default: ${DEFAULT_POLICY.relaxMargin})`,
    '  --help                           Show this help message',
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
      `TREND_THRESHOLD_REBALANCE_FILE_READ_ERROR(${description}): ${filePath} :: ${
        error && error.message ? error.message : String(error)
      }`
    );
  }

  try {
    return JSON.parse(stripByteOrderMark(rawText));
  } catch (error) {
    throw new Error(
      `TREND_THRESHOLD_REBALANCE_JSON_PARSE_ERROR(${description}): ${filePath} :: ${
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

function readAdaptivePolicy(adaptivePolicyPath, dependencies) {
  if (typeof adaptivePolicyPath !== 'string' || adaptivePolicyPath.trim().length === 0) {
    return null;
  }
  return readJsonFile(adaptivePolicyPath, 'adaptive_policy', dependencies);
}

function resolveAdaptiveChapterPolicy(basePolicy, adaptivePolicy, chapterId) {
  const baseline = isPlainObject(basePolicy) ? basePolicy : {};
  const chapterPolicy = isPlainObject(adaptivePolicy?.chapters?.[chapterId]?.policy)
    ? adaptivePolicy.chapters[chapterId].policy
    : {};
  const chapterActive =
    adaptivePolicy?.chapters?.[chapterId]?.active === undefined
      ? true
      : adaptivePolicy.chapters[chapterId].active === true;

  if (!chapterActive) {
    return baseline;
  }

  return {
    ...baseline,
    tightenMargin: Number.isFinite(Number(chapterPolicy.tightenMargin))
      ? Number(chapterPolicy.tightenMargin)
      : baseline.tightenMargin,
    tightenRate: Number.isFinite(Number(chapterPolicy.tightenRate))
      ? Number(chapterPolicy.tightenRate)
      : baseline.tightenRate,
    relaxMargin: Number.isFinite(Number(chapterPolicy.relaxMargin))
      ? Number(chapterPolicy.relaxMargin)
      : baseline.relaxMargin,
  };
}

function toFiniteNumber(value, fallback) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function clampScoreThreshold(value, policy) {
  const minValue = toFiniteNumber(policy.minScoreIncreaseMax, DEFAULT_POLICY.minScoreIncreaseMax);
  const maxValue = toFiniteNumber(policy.maxScoreIncreaseMax, DEFAULT_POLICY.maxScoreIncreaseMax);
  const numeric = toFiniteNumber(value, minValue);
  if (numeric <= minValue) {
    return minValue;
  }
  if (numeric >= maxValue) {
    return maxValue;
  }
  return numeric;
}

function buildRegressionIndexes(regressions) {
  const source = Array.isArray(regressions) ? regressions : [];
  const scoreRegressionChapterIds = new Set();
  const statusRegressionChapterIds = new Set();
  const missingChapterIds = new Set();

  for (const regression of source) {
    if (!isPlainObject(regression)) {
      continue;
    }
    const chapterId =
      typeof regression.chapterId === 'string' && regression.chapterId.trim().length > 0
        ? regression.chapterId.trim().toLowerCase()
        : null;
    if (!chapterId) {
      continue;
    }
    if (regression.type === 'tuning_score_regression') {
      scoreRegressionChapterIds.add(chapterId);
    } else if (regression.type === 'tuning_status_regression') {
      statusRegressionChapterIds.add(chapterId);
    } else if (regression.type === 'missing_tuning_chapter') {
      missingChapterIds.add(chapterId);
    }
  }

  return {
    scoreRegressionChapterIds,
    statusRegressionChapterIds,
    missingChapterIds,
  };
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function computeChapterRebalance(chapterThreshold, chapterDelta, chapterFlags, policy) {
  const currentThreshold = clampScoreThreshold(chapterThreshold.scoreIncreaseMax, policy);
  const epsilon = toFiniteNumber(policy.epsilon, DEFAULT_POLICY.epsilon);
  const observedDelta = toFiniteNumber(chapterDelta?.score?.delta, NaN);
  const hasFiniteDelta = Number.isFinite(observedDelta);
  const hasMissingData = isPlainObject(chapterDelta?.missing);
  const statusDegraded = chapterFlags.statusRegression || chapterDelta?.status?.degraded === true;

  if (statusDegraded) {
    return {
      action: 'manual_review',
      reason: 'status_degraded',
      currentScoreIncreaseMax: roundTo(currentThreshold, 6),
      proposedScoreIncreaseMax: roundTo(currentThreshold, 6),
      observedScoreDelta: hasFiniteDelta ? roundTo(observedDelta, 6) : null,
      scoreRegression: chapterFlags.scoreRegression,
      statusDegraded: true,
      missingData: hasMissingData,
      changed: false,
    };
  }

  if (hasMissingData || chapterFlags.missingRegression) {
    return {
      action: 'manual_review',
      reason: 'missing_tuning_data',
      currentScoreIncreaseMax: roundTo(currentThreshold, 6),
      proposedScoreIncreaseMax: roundTo(currentThreshold, 6),
      observedScoreDelta: hasFiniteDelta ? roundTo(observedDelta, 6) : null,
      scoreRegression: chapterFlags.scoreRegression,
      statusDegraded: false,
      missingData: true,
      changed: false,
    };
  }

  if (!hasFiniteDelta) {
    return {
      action: 'keep',
      reason: 'missing_score_delta',
      currentScoreIncreaseMax: roundTo(currentThreshold, 6),
      proposedScoreIncreaseMax: roundTo(currentThreshold, 6),
      observedScoreDelta: null,
      scoreRegression: chapterFlags.scoreRegression,
      statusDegraded: false,
      missingData: false,
      changed: false,
    };
  }

  let proposed = currentThreshold;
  let action = 'keep';
  let reason = 'within_threshold';

  if (chapterFlags.scoreRegression) {
    const target = Math.max(currentThreshold, Math.max(0, observedDelta) + policy.relaxMargin);
    proposed = clampScoreThreshold(target, policy);
    action = Math.abs(proposed - currentThreshold) > epsilon ? 'relax' : 'keep';
    reason = action === 'relax' ? 'score_regression_detected' : 'score_regression_clamped';
  } else {
    const positiveDelta = Math.max(0, observedDelta);
    if (positiveDelta <= epsilon) {
      reason = 'non_positive_delta_keep';
    } else {
      const tightenTarget = clampScoreThreshold(positiveDelta + policy.tightenMargin, policy);
      if (tightenTarget + epsilon < currentThreshold) {
        proposed = clampScoreThreshold(
          currentThreshold - (currentThreshold - tightenTarget) * policy.tightenRate,
          policy
        );
        action = Math.abs(proposed - currentThreshold) > epsilon ? 'tighten' : 'keep';
        reason = action === 'tighten' ? 'stable_score_delta_tighten' : 'stable_score_delta_keep';
      }
    }
  }

  return {
    action,
    reason,
    currentScoreIncreaseMax: roundTo(currentThreshold, 6),
    proposedScoreIncreaseMax: roundTo(proposed, 6),
    observedScoreDelta: roundTo(observedDelta, 6),
    scoreRegression: chapterFlags.scoreRegression,
    statusDegraded: false,
    missingData: false,
    changed: Math.abs(proposed - currentThreshold) > epsilon,
  };
}

function createSummaryLine(result) {
  const source = isPlainObject(result) ? result : {};
  const summary = isPlainObject(source.summary) ? source.summary : {};
  return [
    `${SUMMARY_PREFIX} PASS`,
    `chapters=${summary.chaptersConsidered || 0}`,
    `changed=${summary.changedCount || 0}`,
    `tightened=${summary.tightenedCount || 0}`,
    `relaxed=${summary.relaxedCount || 0}`,
    `manualReview=${summary.manualReviewCount || 0}`,
  ].join(' ');
}

function rebalanceTrendThresholds(options, dependencies) {
  const sourceOptions = isPlainObject(options) ? options : {};
  const deps = isPlainObject(dependencies) ? dependencies : {};
  const now = typeof deps.now === 'function' ? deps.now : () => new Date().toISOString();
  const normalizedPolicy = {
    ...DEFAULT_POLICY,
    ...(isPlainObject(sourceOptions.policy) ? sourceOptions.policy : {}),
  };
  const resolvedReportPath = resolvePathFromCwd(sourceOptions.reportPath, deps);
  const resolvedThresholdsPath = resolvePathFromCwd(sourceOptions.thresholdsPath, deps);
  const resolvedOutputPath =
    typeof sourceOptions.outputPath === 'string' && sourceOptions.outputPath.trim().length > 0
      ? resolvePathFromCwd(sourceOptions.outputPath, deps)
      : null;
  const resolvedAdaptivePolicyPath =
    typeof sourceOptions.adaptivePolicyPath === 'string' && sourceOptions.adaptivePolicyPath.trim().length > 0
      ? resolvePathFromCwd(sourceOptions.adaptivePolicyPath, deps)
      : null;

  const report = readJsonFile(resolvedReportPath, 'trend_report', deps);
  const thresholdPayload = readJsonFile(resolvedThresholdsPath, 'thresholds', deps);
  const adaptivePolicy = resolvedAdaptivePolicyPath
    ? readAdaptivePolicy(resolvedAdaptivePolicyPath, deps)
    : null;
  const currentThresholds = normalizeTrendThresholds(thresholdPayload);
  const nextThresholds = cloneJson(currentThresholds);
  const tuningDeltas = isPlainObject(report?.deltas?.tuning) ? report.deltas.tuning : {};
  const regressionIndexes = buildRegressionIndexes(report.regressions);
  const chapterIds = Object.keys(nextThresholds.tuning.chapters).sort();
  const chapters = {};
  const changedChapterIds = [];
  const tightenedChapterIds = [];
  const relaxedChapterIds = [];
  const manualReviewChapterIds = [];

  for (const chapterId of chapterIds) {
    const chapterThreshold = nextThresholds.tuning.chapters[chapterId];
    const chapterDelta = isPlainObject(tuningDeltas[chapterId]) ? tuningDeltas[chapterId] : {};
    const chapterFlags = {
      scoreRegression: regressionIndexes.scoreRegressionChapterIds.has(chapterId),
      statusRegression: regressionIndexes.statusRegressionChapterIds.has(chapterId),
      missingRegression: regressionIndexes.missingChapterIds.has(chapterId),
    };
    const chapterPolicy = resolveAdaptiveChapterPolicy(normalizedPolicy, adaptivePolicy, chapterId);
    const chapterResult = computeChapterRebalance(chapterThreshold, chapterDelta, chapterFlags, chapterPolicy);
    chapters[chapterId] = chapterResult;

    if (chapterResult.action === 'manual_review') {
      manualReviewChapterIds.push(chapterId);
      continue;
    }

    if (chapterResult.action === 'tighten') {
      tightenedChapterIds.push(chapterId);
    } else if (chapterResult.action === 'relax') {
      relaxedChapterIds.push(chapterId);
    }

    if (chapterResult.changed) {
      nextThresholds.tuning.chapters[chapterId].scoreIncreaseMax = chapterResult.proposedScoreIncreaseMax;
      changedChapterIds.push(chapterId);
    }
  }

  let writtenThresholdsPath = null;
  let writtenOutputPath = null;

  const result = {
    generatedAt: now(),
    reportPath: resolvedReportPath,
    thresholdsPath: resolvedThresholdsPath,
    outputPath: resolvedOutputPath,
    adaptivePolicyPath: resolvedAdaptivePolicyPath,
    policy: normalizedPolicy,
    summary: {
      chaptersConsidered: chapterIds.length,
      changedCount: changedChapterIds.length,
      tightenedCount: tightenedChapterIds.length,
      relaxedCount: relaxedChapterIds.length,
      manualReviewCount: manualReviewChapterIds.length,
      unchangedCount: chapterIds.length - changedChapterIds.length - manualReviewChapterIds.length,
    },
    changedChapterIds,
    tightenedChapterIds,
    relaxedChapterIds,
    manualReviewChapterIds,
    chapters,
    nextThresholds,
  };

  if (sourceOptions.write) {
    writeJsonFile(resolvedThresholdsPath, nextThresholds, deps);
    writtenThresholdsPath = resolvedThresholdsPath;
  }

  if (resolvedOutputPath) {
    writeJsonFile(resolvedOutputPath, result, deps);
    writtenOutputPath = resolvedOutputPath;
  }

  return {
    ...result,
    writtenThresholdsPath,
    writtenOutputPath,
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
    const result = rebalanceTrendThresholds(parsedArgs);
    process.stdout.write(`${result.summaryLine}\n`);

    if (result.writtenThresholdsPath) {
      process.stderr.write(`${SUMMARY_PREFIX} Wrote thresholds to ${result.writtenThresholdsPath}\n`);
    }
    if (result.writtenOutputPath) {
      process.stderr.write(`${SUMMARY_PREFIX} Wrote recommendation to ${result.writtenOutputPath}\n`);
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
  DEFAULT_REPORT_PATH,
  DEFAULT_THRESHOLDS_PATH,
  DEFAULT_OUTPUT_PATH,
  DEFAULT_POLICY,
  parseArgs,
  buildRegressionIndexes,
  resolveAdaptiveChapterPolicy,
  computeChapterRebalance,
  rebalanceTrendThresholds,
  createSummaryLine,
};
