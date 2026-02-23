#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const { normalizeTrendThresholds } = require('./check-trend-diff');

const SUMMARY_PREFIX = '[adaptive-rebalance-policy]';
const DEFAULT_HISTORY_DIR = '.tmp/release-readiness/history';
const DEFAULT_THRESHOLDS_PATH = path.join(__dirname, 'trend-thresholds.json');
const DEFAULT_OUTPUT_PATH = '.tmp/release-readiness/adaptive-rebalance-policy.json';
const DEFAULT_PREVIOUS_POLICY_PATH = '.tmp/release-readiness/adaptive-rebalance-policy.prev.json';
const TREND_REPORT_FILENAME_RE = /^trend-diff-report.*\.json$/i;
const DEFAULT_POLICY = {
  minScoreIncreaseMax: 0.05,
  maxScoreIncreaseMax: 2,
  tightenMargin: 0.03,
  tightenRate: 0.4,
  relaxMargin: 0.03,
};
const DEFAULT_OPTIONS = {
  minSamples: 3,
  minTightenMargin: 0.01,
  maxTightenMargin: 0.2,
  minRelaxMargin: 0.02,
  maxRelaxMargin: 0.5,
  minTightenRate: 0.15,
  maxTightenRate: 0.8,
  maxTightenMarginStep: 0.02,
  maxRelaxMarginStep: 0.03,
  maxTightenRateStep: 0.08,
};

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function toFiniteNumber(value, fallback) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function clamp(value, minValue, maxValue) {
  const numeric = toFiniteNumber(value, minValue);
  return Math.min(maxValue, Math.max(minValue, numeric));
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
    historyDir: DEFAULT_HISTORY_DIR,
    thresholdsPath: DEFAULT_THRESHOLDS_PATH,
    outputPath: DEFAULT_OUTPUT_PATH,
    previousPolicyPath: DEFAULT_PREVIOUS_POLICY_PATH,
    seedReportPaths: [],
    options: {
      ...DEFAULT_OPTIONS,
    },
  };

  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];

    if (token === '--help' || token === '-h') {
      parsed.help = true;
      continue;
    }

    if (token.startsWith('--history-dir=')) {
      parsed.historyDir = token.slice('--history-dir='.length).trim();
      continue;
    }
    if (token === '--history-dir') {
      parsed.historyDir = String(args[index + 1] || '').trim();
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

    if (token.startsWith('--previous-policy=')) {
      parsed.previousPolicyPath = token.slice('--previous-policy='.length).trim();
      continue;
    }
    if (token === '--previous-policy') {
      parsed.previousPolicyPath = String(args[index + 1] || '').trim();
      index += 1;
      continue;
    }

    if (token.startsWith('--seed-report=')) {
      const value = token.slice('--seed-report='.length).trim();
      if (value.length > 0) {
        parsed.seedReportPaths.push(value);
      }
      continue;
    }
    if (token === '--seed-report') {
      const value = String(args[index + 1] || '').trim();
      if (value.length > 0) {
        parsed.seedReportPaths.push(value);
      }
      index += 1;
      continue;
    }

    if (token.startsWith('--min-samples=')) {
      parsed.options.minSamples = toFiniteNumber(
        token.slice('--min-samples='.length),
        parsed.options.minSamples
      );
      continue;
    }
    if (token === '--min-samples') {
      parsed.options.minSamples = toFiniteNumber(args[index + 1], parsed.options.minSamples);
      index += 1;
      continue;
    }

    if (token.startsWith('--max-tighten-margin-step=')) {
      parsed.options.maxTightenMarginStep = toFiniteNumber(
        token.slice('--max-tighten-margin-step='.length),
        parsed.options.maxTightenMarginStep
      );
      continue;
    }
    if (token === '--max-tighten-margin-step') {
      parsed.options.maxTightenMarginStep = toFiniteNumber(
        args[index + 1],
        parsed.options.maxTightenMarginStep
      );
      index += 1;
      continue;
    }

    if (token.startsWith('--max-relax-margin-step=')) {
      parsed.options.maxRelaxMarginStep = toFiniteNumber(
        token.slice('--max-relax-margin-step='.length),
        parsed.options.maxRelaxMarginStep
      );
      continue;
    }
    if (token === '--max-relax-margin-step') {
      parsed.options.maxRelaxMarginStep = toFiniteNumber(
        args[index + 1],
        parsed.options.maxRelaxMarginStep
      );
      index += 1;
      continue;
    }

    if (token.startsWith('--max-tighten-rate-step=')) {
      parsed.options.maxTightenRateStep = toFiniteNumber(
        token.slice('--max-tighten-rate-step='.length),
        parsed.options.maxTightenRateStep
      );
      continue;
    }
    if (token === '--max-tighten-rate-step') {
      parsed.options.maxTightenRateStep = toFiniteNumber(
        args[index + 1],
        parsed.options.maxTightenRateStep
      );
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${token}`);
  }

  if (parsed.historyDir.length === 0) {
    throw new Error('Invalid --history-dir value. Expected a non-empty path.');
  }
  if (parsed.thresholdsPath.length === 0) {
    throw new Error('Invalid --thresholds value. Expected a non-empty path.');
  }
  if (parsed.outputPath.length === 0) {
    throw new Error('Invalid --output value. Expected a non-empty path.');
  }
  if (parsed.previousPolicyPath.length === 0) {
    throw new Error('Invalid --previous-policy value. Expected a non-empty path.');
  }
  if (!Number.isFinite(parsed.options.minSamples) || parsed.options.minSamples < 1) {
    throw new Error('Invalid --min-samples value. Expected an integer >= 1.');
  }
  if (parsed.options.maxTightenMarginStep < 0) {
    throw new Error('Invalid --max-tighten-margin-step value. Expected a non-negative number.');
  }
  if (parsed.options.maxRelaxMarginStep < 0) {
    throw new Error('Invalid --max-relax-margin-step value. Expected a non-negative number.');
  }
  if (parsed.options.maxTightenRateStep < 0) {
    throw new Error('Invalid --max-tighten-rate-step value. Expected a non-negative number.');
  }
  parsed.options.minSamples = Math.max(1, Math.floor(parsed.options.minSamples));
  parsed.seedReportPaths = Array.from(new Set(parsed.seedReportPaths));

  return parsed;
}

function printHelp() {
  const lines = [
    'Usage: node tools/release-readiness/build-adaptive-rebalance-policy.js [options]',
    '',
    'Options:',
    `  --history-dir=<path>   Historical trend report directory (default: ${DEFAULT_HISTORY_DIR})`,
    `  --thresholds=<path>    Thresholds path for chapter score caps (default: ${DEFAULT_THRESHOLDS_PATH})`,
    `  --output=<path>        Adaptive policy output path (default: ${DEFAULT_OUTPUT_PATH})`,
    `  --previous-policy=<path> Previous adaptive policy path for drift guardrail (default: ${DEFAULT_PREVIOUS_POLICY_PATH})`,
    '  --seed-report=<path>   Additional trend-diff report to include (repeatable)',
    `  --min-samples=<int>    Minimum samples per chapter to activate adaptive policy (default: ${DEFAULT_OPTIONS.minSamples})`,
    `  --max-tighten-margin-step=<num> Max per-run tightenMargin change (default: ${DEFAULT_OPTIONS.maxTightenMarginStep})`,
    `  --max-relax-margin-step=<num> Max per-run relaxMargin change (default: ${DEFAULT_OPTIONS.maxRelaxMarginStep})`,
    `  --max-tighten-rate-step=<num> Max per-run tightenRate change (default: ${DEFAULT_OPTIONS.maxTightenRateStep})`,
    '  --help                 Show this help message',
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
      `ADAPTIVE_POLICY_FILE_READ_ERROR(${description}): ${filePath} :: ${
        error && error.message ? error.message : String(error)
      }`
    );
  }

  try {
    return JSON.parse(stripByteOrderMark(rawText));
  } catch (error) {
    throw new Error(
      `ADAPTIVE_POLICY_JSON_PARSE_ERROR(${description}): ${filePath} :: ${
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

function readOptionalJsonFile(filePath, description, dependencies) {
  const deps = isPlainObject(dependencies) ? dependencies : {};
  const existsSync = typeof deps.existsSync === 'function' ? deps.existsSync : fs.existsSync;
  if (!existsSync(filePath)) {
    return null;
  }
  return readJsonFile(filePath, description, deps);
}

function discoverTrendReportPaths(historyDirPath, dependencies) {
  const deps = isPlainObject(dependencies) ? dependencies : {};
  const existsSync = typeof deps.existsSync === 'function' ? deps.existsSync : fs.existsSync;
  const readdirSync = typeof deps.readdirSync === 'function' ? deps.readdirSync : fs.readdirSync;
  const joinPath = typeof deps.joinPath === 'function' ? deps.joinPath : path.join;

  if (!existsSync(historyDirPath)) {
    return [];
  }

  let entries = [];
  try {
    entries = readdirSync(historyDirPath);
  } catch (_error) {
    return [];
  }

  return entries
    .filter((entry) => TREND_REPORT_FILENAME_RE.test(String(entry)))
    .map((entry) => joinPath(historyDirPath, String(entry)))
    .sort();
}

function createStatsFromValues(values) {
  const numeric = (Array.isArray(values) ? values : [])
    .map((value) => toFiniteNumber(value, NaN))
    .filter((value) => Number.isFinite(value));
  if (numeric.length === 0) {
    return {
      count: 0,
      avg: 0,
      p90: 0,
      max: 0,
    };
  }

  const sorted = [...numeric].sort((a, b) => a - b);
  const sum = sorted.reduce((acc, value) => acc + value, 0);
  const p90Index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * 0.9) - 1));
  return {
    count: sorted.length,
    avg: sum / sorted.length,
    p90: sorted[p90Index],
    max: sorted[sorted.length - 1],
  };
}

function collectChapterHistory(reportPayloads) {
  const reports = Array.isArray(reportPayloads) ? reportPayloads : [];
  const chapterMap = {};

  for (const report of reports) {
    const tuningDeltas = isPlainObject(report?.deltas?.tuning) ? report.deltas.tuning : {};
    for (const chapterIdRaw of Object.keys(tuningDeltas)) {
      const chapterId = String(chapterIdRaw || '').trim().toLowerCase();
      if (chapterId.length === 0) {
        continue;
      }
      if (!chapterMap[chapterId]) {
        chapterMap[chapterId] = {
          deltas: [],
          positiveDeltas: [],
          degradedCount: 0,
        };
      }

      const chapterDelta = isPlainObject(tuningDeltas[chapterIdRaw]) ? tuningDeltas[chapterIdRaw] : {};
      const scoreDelta = toFiniteNumber(chapterDelta?.score?.delta, NaN);
      if (Number.isFinite(scoreDelta)) {
        chapterMap[chapterId].deltas.push(scoreDelta);
        if (scoreDelta > 0) {
          chapterMap[chapterId].positiveDeltas.push(scoreDelta);
        }
      }
      if (chapterDelta?.status?.degraded === true) {
        chapterMap[chapterId].degradedCount += 1;
      }
    }
  }

  return chapterMap;
}

function buildAdaptiveChapterPolicy(chapterId, chapterHistory, chapterThreshold, options) {
  const baseScoreCap = toFiniteNumber(chapterThreshold?.scoreIncreaseMax, 0.3);
  const deltaStats = createStatsFromValues(chapterHistory?.deltas || []);
  const positiveStats = createStatsFromValues(chapterHistory?.positiveDeltas || []);
  const sampleCount = deltaStats.count;
  const degradeRatio = sampleCount > 0 ? (chapterHistory.degradedCount || 0) / sampleCount : 0;
  const volatility = baseScoreCap > 0 ? Math.min(2, Math.abs(deltaStats.avg) / baseScoreCap) : 0;

  const tightenMargin = clamp(
    DEFAULT_POLICY.tightenMargin + baseScoreCap * volatility * 0.15,
    options.minTightenMargin,
    options.maxTightenMargin
  );
  const tightenRate = clamp(
    DEFAULT_POLICY.tightenRate - volatility * 0.2 - degradeRatio * 0.15,
    options.minTightenRate,
    options.maxTightenRate
  );
  const relaxMargin = clamp(
    DEFAULT_POLICY.relaxMargin + positiveStats.p90 * 0.2 + baseScoreCap * volatility * 0.1 + degradeRatio * 0.1,
    options.minRelaxMargin,
    options.maxRelaxMargin
  );

  const active = sampleCount >= options.minSamples;
  return {
    chapterId,
    sampleCount,
    active,
    reason: active ? 'sufficient_samples' : 'insufficient_samples',
    metrics: {
      avgDelta: roundTo(deltaStats.avg, 6),
      p90Delta: roundTo(deltaStats.p90, 6),
      p90PositiveDelta: roundTo(positiveStats.p90, 6),
      maxPositiveDelta: roundTo(positiveStats.max, 6),
      degradeRatio: roundTo(degradeRatio, 6),
      volatility: roundTo(volatility, 6),
    },
    policy: {
      tightenMargin: roundTo(tightenMargin, 6),
      tightenRate: roundTo(tightenRate, 6),
      relaxMargin: roundTo(relaxMargin, 6),
    },
  };
}

function resolvePreviousChapterPolicy(previousPolicyPayload, chapterId) {
  const chapterPolicy = previousPolicyPayload?.chapters?.[chapterId]?.policy;
  return isPlainObject(chapterPolicy) ? chapterPolicy : null;
}

function clampPolicyStep(currentValue, previousValue, maxStep) {
  const current = toFiniteNumber(currentValue, NaN);
  const previous = toFiniteNumber(previousValue, NaN);
  if (!Number.isFinite(current) || !Number.isFinite(previous) || !Number.isFinite(maxStep) || maxStep < 0) {
    return currentValue;
  }
  if (Math.abs(current - previous) <= maxStep) {
    return current;
  }
  return previous + Math.sign(current - previous) * maxStep;
}

function applyChapterPolicyDriftGuardrail(chapterPolicy, previousChapterPolicy, options) {
  const policy = isPlainObject(chapterPolicy) ? chapterPolicy : {};
  const previous = isPlainObject(previousChapterPolicy) ? previousChapterPolicy : null;
  const normalized = {
    tightenMargin: toFiniteNumber(policy.tightenMargin, DEFAULT_POLICY.tightenMargin),
    tightenRate: toFiniteNumber(policy.tightenRate, DEFAULT_POLICY.tightenRate),
    relaxMargin: toFiniteNumber(policy.relaxMargin, DEFAULT_POLICY.relaxMargin),
  };

  if (!previous) {
    return {
      policy: {
        tightenMargin: roundTo(normalized.tightenMargin, 6),
        tightenRate: roundTo(normalized.tightenRate, 6),
        relaxMargin: roundTo(normalized.relaxMargin, 6),
      },
      guardrail: {
        applied: false,
        reason: 'no_previous_policy',
        changed: false,
      },
    };
  }

  const guarded = {
    tightenMargin: clampPolicyStep(
      normalized.tightenMargin,
      previous.tightenMargin,
      options.maxTightenMarginStep
    ),
    tightenRate: clampPolicyStep(
      normalized.tightenRate,
      previous.tightenRate,
      options.maxTightenRateStep
    ),
    relaxMargin: clampPolicyStep(
      normalized.relaxMargin,
      previous.relaxMargin,
      options.maxRelaxMarginStep
    ),
  };

  const changed =
    Math.abs(guarded.tightenMargin - normalized.tightenMargin) > 0.000001 ||
    Math.abs(guarded.tightenRate - normalized.tightenRate) > 0.000001 ||
    Math.abs(guarded.relaxMargin - normalized.relaxMargin) > 0.000001;

  return {
    policy: {
      tightenMargin: roundTo(guarded.tightenMargin, 6),
      tightenRate: roundTo(guarded.tightenRate, 6),
      relaxMargin: roundTo(guarded.relaxMargin, 6),
    },
    guardrail: {
      applied: true,
      reason: changed ? 'step_limited' : 'within_step_limit',
      changed,
      previousPolicy: {
        tightenMargin: roundTo(previous.tightenMargin, 6),
        tightenRate: roundTo(previous.tightenRate, 6),
        relaxMargin: roundTo(previous.relaxMargin, 6),
      },
      candidatePolicy: {
        tightenMargin: roundTo(normalized.tightenMargin, 6),
        tightenRate: roundTo(normalized.tightenRate, 6),
        relaxMargin: roundTo(normalized.relaxMargin, 6),
      },
      maxStep: {
        tightenMargin: roundTo(options.maxTightenMarginStep, 6),
        tightenRate: roundTo(options.maxTightenRateStep, 6),
        relaxMargin: roundTo(options.maxRelaxMarginStep, 6),
      },
    },
  };
}

function createSummaryLine(result) {
  const source = isPlainObject(result) ? result : {};
  const chapterCount = Array.isArray(source.chapterIds) ? source.chapterIds.length : 0;
  const activeCount = Array.isArray(source.activeChapterIds) ? source.activeChapterIds.length : 0;
  const reportCount = toFiniteNumber(source.reportCount, 0);
  return `${SUMMARY_PREFIX} PASS reports=${reportCount} chapters=${chapterCount} active=${activeCount}`;
}

function buildAdaptiveRebalancePolicy(options, dependencies) {
  const deps = isPlainObject(dependencies) ? dependencies : {};
  const now = typeof deps.now === 'function' ? deps.now : () => new Date().toISOString();
  const parsedOptions = isPlainObject(options) ? options : {};
  const resolvedHistoryDir = resolvePathFromCwd(parsedOptions.historyDir, deps);
  const resolvedThresholdsPath = resolvePathFromCwd(parsedOptions.thresholdsPath, deps);
  const resolvedOutputPath = resolvePathFromCwd(parsedOptions.outputPath, deps);
  const resolvedPreviousPolicyPath = resolvePathFromCwd(parsedOptions.previousPolicyPath, deps);
  const thresholdPayload = normalizeTrendThresholds(
    readJsonFile(resolvedThresholdsPath, 'thresholds', deps)
  );
  const previousPolicyPayload = readOptionalJsonFile(
    resolvedPreviousPolicyPath,
    'previous_adaptive_policy',
    deps
  );
  const discoveredHistoryPaths = discoverTrendReportPaths(resolvedHistoryDir, deps);
  const seedPaths = (Array.isArray(parsedOptions.seedReportPaths) ? parsedOptions.seedReportPaths : []).map(
    (filePath) => resolvePathFromCwd(filePath, deps)
  );
  const reportPaths = Array.from(new Set([...discoveredHistoryPaths, ...seedPaths])).sort();
  const reportPayloads = reportPaths.map((filePath, index) =>
    readJsonFile(filePath, `trend_report:${index}`, deps)
  );
  const chapterHistory = collectChapterHistory(reportPayloads);
  const chapterIds = Object.keys(thresholdPayload.tuning.chapters).sort();
  const chapters = {};
  const activeChapterIds = [];
  const guardrailLimitedChapterIds = [];

  for (const chapterId of chapterIds) {
    const chapterPolicy = buildAdaptiveChapterPolicy(
      chapterId,
      chapterHistory[chapterId],
      thresholdPayload.tuning.chapters[chapterId],
      parsedOptions.options
    );
    const previousChapterPolicy = resolvePreviousChapterPolicy(previousPolicyPayload, chapterId);
    const guardrail = applyChapterPolicyDriftGuardrail(
      chapterPolicy.policy,
      previousChapterPolicy,
      parsedOptions.options
    );
    chapterPolicy.policy = guardrail.policy;
    chapterPolicy.guardrail = guardrail.guardrail;
    chapters[chapterId] = chapterPolicy;
    if (chapterPolicy.active) {
      activeChapterIds.push(chapterId);
    }
    if (chapterPolicy.guardrail.changed) {
      guardrailLimitedChapterIds.push(chapterId);
    }
  }

  const output = {
    version: '1.0.0',
    generatedAt: now(),
    historyDir: resolvedHistoryDir,
    thresholdsPath: resolvedThresholdsPath,
    previousPolicyPath: resolvedPreviousPolicyPath,
    minSamples: parsedOptions.options.minSamples,
    reportCount: reportPaths.length,
    reportPaths,
    defaults: {
      basePolicy: DEFAULT_POLICY,
      constraints: parsedOptions.options,
    },
    chapters,
    chapterIds,
    activeChapterIds,
    guardrailLimitedChapterIds,
  };

  writeJsonFile(resolvedOutputPath, output, deps);

  return {
    ...output,
    outputPath: resolvedOutputPath,
    summaryLine: createSummaryLine(output),
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
    const result = buildAdaptiveRebalancePolicy(parsedArgs);
    process.stdout.write(`${result.summaryLine}\n`);
    process.stderr.write(`${SUMMARY_PREFIX} Wrote adaptive policy to ${result.outputPath}\n`);
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
  DEFAULT_HISTORY_DIR,
  DEFAULT_THRESHOLDS_PATH,
  DEFAULT_OUTPUT_PATH,
  DEFAULT_PREVIOUS_POLICY_PATH,
  DEFAULT_POLICY,
  DEFAULT_OPTIONS,
  parseArgs,
  discoverTrendReportPaths,
  collectChapterHistory,
  applyChapterPolicyDriftGuardrail,
  buildAdaptiveChapterPolicy,
  buildAdaptiveRebalancePolicy,
  createSummaryLine,
};
