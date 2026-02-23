#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const SUMMARY_PREFIX = '[trend-diff]';
const DEFAULT_CURRENT_DIR = '.tmp/release-readiness';
const DEFAULT_BASELINE_DIR = '.tmp/release-readiness/baseline';
const DEFAULT_THRESHOLDS_PATH = path.join(__dirname, 'trend-thresholds.json');
const PERF_REPORT_FILENAME = 'perf-gate-report.json';

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function toFiniteNumber(value, fallback) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function toNonNegativeNumber(value, fallback) {
  return Math.max(0, toFiniteNumber(value, fallback));
}

function roundTo(value, digits) {
  const precision = Math.pow(10, digits);
  return Math.round((toFiniteNumber(value, 0) + Number.EPSILON) * precision) / precision;
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

function parseArgs(argv) {
  const args = Array.isArray(argv) ? argv : [];
  const parsed = {
    help: false,
    currentDir: DEFAULT_CURRENT_DIR,
    baselineDir: DEFAULT_BASELINE_DIR,
    thresholdsPath: DEFAULT_THRESHOLDS_PATH,
    outputPath: null,
    allowMissingBaseline: false,
  };

  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];

    if (token === '--help' || token === '-h') {
      parsed.help = true;
      continue;
    }

    if (token.startsWith('--current-dir=')) {
      parsed.currentDir = token.slice('--current-dir='.length).trim();
      continue;
    }

    if (token === '--current-dir') {
      parsed.currentDir = String(args[index + 1] || '').trim();
      index += 1;
      continue;
    }

    if (token.startsWith('--baseline-dir=')) {
      parsed.baselineDir = token.slice('--baseline-dir='.length).trim();
      continue;
    }

    if (token === '--baseline-dir') {
      parsed.baselineDir = String(args[index + 1] || '').trim();
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

    if (token.startsWith('--allow-missing-baseline=')) {
      parsed.allowMissingBaseline = parseBooleanLike(
        token.slice('--allow-missing-baseline='.length),
        true
      );
      continue;
    }

    if (token === '--allow-missing-baseline') {
      parsed.allowMissingBaseline = true;
      continue;
    }

    throw new Error(`Unknown argument: ${token}`);
  }

  if (parsed.currentDir.length === 0) {
    throw new Error('Invalid --current-dir value. Expected a non-empty path.');
  }

  if (parsed.baselineDir.length === 0) {
    throw new Error('Invalid --baseline-dir value. Expected a non-empty path.');
  }

  if (parsed.thresholdsPath.length === 0) {
    throw new Error('Invalid --thresholds value. Expected a non-empty path.');
  }

  if (parsed.outputPath !== null && parsed.outputPath.length === 0) {
    throw new Error('Invalid --output value. Expected a non-empty path.');
  }

  return parsed;
}

function printHelp() {
  const lines = [
    'Usage: node tools/release-readiness/check-trend-diff.js [options]',
    '',
    'Options:',
    `  --current-dir=<path>   Current artifacts directory (default: ${DEFAULT_CURRENT_DIR})`,
    `  --baseline-dir=<path>  Baseline artifacts directory (default: ${DEFAULT_BASELINE_DIR})`,
    `  --thresholds=<path>    Trend thresholds JSON path (default: ${DEFAULT_THRESHOLDS_PATH})`,
    '  --output=<path>        Optional output JSON report path',
    '  --allow-missing-baseline  Treat missing baseline as SKIP/PASS',
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
      `TREND_DIFF_FILE_READ_ERROR(${description}): ${filePath} :: ${
        error && error.message ? error.message : String(error)
      }`
    );
  }

  try {
    return JSON.parse(stripByteOrderMark(rawText));
  } catch (error) {
    throw new Error(
      `TREND_DIFF_JSON_PARSE_ERROR(${description}): ${filePath} :: ${
        error && error.message ? error.message : String(error)
      }`
    );
  }
}

function createDefaultTrendThresholds() {
  return {
    version: '1.0.0',
    perf: {
      operations: {
        tickSimulation: {
          avgMsIncreaseMax: 0.2,
          p95MsIncreaseMax: 0.6,
          maxMsIncreaseMax: 2.5,
        },
        runWaveSlice: {
          avgMsIncreaseMax: 0.25,
          p95MsIncreaseMax: 0.7,
          maxMsIncreaseMax: 2.5,
        },
        runSessionShort: {
          avgMsIncreaseMax: 0.3,
          p95MsIncreaseMax: 0.8,
          maxMsIncreaseMax: 2.5,
        },
      },
    },
    tuning: {
      chapters: {
        chapter_1: {
          scoreIncreaseMax: 0.2,
          allowStatusDegrade: false,
        },
        chapter_2: {
          scoreIncreaseMax: 0.25,
          allowStatusDegrade: false,
        },
      },
    },
  };
}

function normalizePerfOperationThresholds(source, fallback) {
  const input = isPlainObject(source) ? source : {};
  const defaultThresholds = isPlainObject(fallback) ? fallback : {};
  const target = {};
  const operationNames = new Set([...Object.keys(defaultThresholds), ...Object.keys(input)]);

  for (const operationName of operationNames) {
    const currentSource = isPlainObject(input[operationName]) ? input[operationName] : {};
    const fallbackSource = isPlainObject(defaultThresholds[operationName])
      ? defaultThresholds[operationName]
      : {};

    target[operationName] = {
      avgMsIncreaseMax: toNonNegativeNumber(
        currentSource.avgMsIncreaseMax,
        toNonNegativeNumber(fallbackSource.avgMsIncreaseMax, 0)
      ),
      p95MsIncreaseMax: toNonNegativeNumber(
        currentSource.p95MsIncreaseMax,
        toNonNegativeNumber(fallbackSource.p95MsIncreaseMax, 0)
      ),
      maxMsIncreaseMax: toNonNegativeNumber(
        currentSource.maxMsIncreaseMax,
        toNonNegativeNumber(fallbackSource.maxMsIncreaseMax, 0)
      ),
    };
  }

  return target;
}

function normalizeTuningChapterThresholds(source, fallback) {
  const input = isPlainObject(source) ? source : {};
  const defaultThresholds = isPlainObject(fallback) ? fallback : {};
  const target = {};
  const chapterIds = new Set([...Object.keys(defaultThresholds), ...Object.keys(input)]);

  for (const chapterId of chapterIds) {
    const currentSource = isPlainObject(input[chapterId]) ? input[chapterId] : {};
    const fallbackSource = isPlainObject(defaultThresholds[chapterId]) ? defaultThresholds[chapterId] : {};
    target[chapterId] = {
      scoreIncreaseMax: toNonNegativeNumber(
        currentSource.scoreIncreaseMax,
        toNonNegativeNumber(fallbackSource.scoreIncreaseMax, 0)
      ),
      allowStatusDegrade: parseBooleanLike(
        currentSource.allowStatusDegrade,
        parseBooleanLike(fallbackSource.allowStatusDegrade, false)
      ),
    };
  }

  return target;
}

function normalizeTrendThresholds(source) {
  const defaults = createDefaultTrendThresholds();
  const parsed = isPlainObject(source) ? source : {};
  const perf = isPlainObject(parsed.perf) ? parsed.perf : {};
  const tuning = isPlainObject(parsed.tuning) ? parsed.tuning : {};
  const defaultPerf = isPlainObject(defaults.perf) ? defaults.perf : {};
  const defaultTuning = isPlainObject(defaults.tuning) ? defaults.tuning : {};

  return {
    version:
      typeof parsed.version === 'string' && parsed.version.trim().length > 0
        ? parsed.version.trim()
        : defaults.version,
    perf: {
      operations: normalizePerfOperationThresholds(
        perf.operations,
        defaultPerf.operations
      ),
    },
    tuning: {
      chapters: normalizeTuningChapterThresholds(
        tuning.chapters,
        defaultTuning.chapters
      ),
    },
  };
}

function buildPerfStatsIndex(perfGateReport) {
  const source = isPlainObject(perfGateReport) ? perfGateReport : {};
  const probeReport = isPlainObject(source.probeReport) ? source.probeReport : {};
  const operations = Array.isArray(probeReport.operations) ? probeReport.operations : [];
  const index = {};

  for (const operationEntry of operations) {
    const operationName =
      typeof operationEntry?.operation === 'string' ? operationEntry.operation.trim() : '';
    if (operationName.length === 0) {
      continue;
    }

    const stats = isPlainObject(operationEntry.stats) ? operationEntry.stats : {};
    index[operationName] = {
      avgMs: toFiniteNumber(stats.avgMs, NaN),
      p95Ms: toFiniteNumber(stats.p95Ms, NaN),
      maxMs: toFiniteNumber(stats.maxMs, NaN),
    };
  }

  return index;
}

function buildTuningSummaryIndex(tuningGateReports) {
  const source = isPlainObject(tuningGateReports) ? tuningGateReports : {};
  const index = {};

  for (const chapterId of Object.keys(source)) {
    const report = isPlainObject(source[chapterId]) ? source[chapterId] : {};
    const evaluation = isPlainObject(report.evaluation) ? report.evaluation : {};
    index[chapterId] = {
      status:
        typeof evaluation.status === 'string' && evaluation.status.trim().length > 0
          ? evaluation.status.trim().toUpperCase()
          : 'UNKNOWN',
      score: toFiniteNumber(evaluation.score, NaN),
    };
  }

  return index;
}

function statusRank(status) {
  if (status === 'PASS') {
    return 0;
  }
  if (status === 'WARN') {
    return 1;
  }
  if (status === 'FAIL') {
    return 2;
  }
  return 3;
}

function comparePerfMetrics(currentIndex, baselineIndex, operationThresholds) {
  const current = isPlainObject(currentIndex) ? currentIndex : {};
  const baseline = isPlainObject(baselineIndex) ? baselineIndex : {};
  const thresholds = isPlainObject(operationThresholds) ? operationThresholds : {};
  const operations = Object.keys(thresholds).sort();
  const regressions = [];
  const deltas = {};

  for (const operationName of operations) {
    const operationThreshold = isPlainObject(thresholds[operationName]) ? thresholds[operationName] : {};
    const currentStats = isPlainObject(current[operationName]) ? current[operationName] : null;
    const baselineStats = isPlainObject(baseline[operationName]) ? baseline[operationName] : null;

    if (!currentStats || !baselineStats) {
      regressions.push({
        type: 'missing_perf_operation',
        operation: operationName,
        currentExists: Boolean(currentStats),
        baselineExists: Boolean(baselineStats),
      });
      continue;
    }

    const metricThresholdPairs = [
      ['avgMs', 'avgMsIncreaseMax'],
      ['p95Ms', 'p95MsIncreaseMax'],
      ['maxMs', 'maxMsIncreaseMax'],
    ];

    deltas[operationName] = {};
    for (const [metricName, thresholdName] of metricThresholdPairs) {
      const currentValue = toFiniteNumber(currentStats[metricName], NaN);
      const baselineValue = toFiniteNumber(baselineStats[metricName], NaN);
      const maxIncrease = toNonNegativeNumber(operationThreshold[thresholdName], 0);

      if (!Number.isFinite(currentValue) || !Number.isFinite(baselineValue)) {
        regressions.push({
          type: 'missing_perf_metric',
          operation: operationName,
          metric: metricName,
          currentValue,
          baselineValue,
        });
        continue;
      }

      const delta = roundTo(currentValue - baselineValue, 6);
      deltas[operationName][metricName] = {
        current: roundTo(currentValue, 6),
        baseline: roundTo(baselineValue, 6),
        delta,
        increaseMax: roundTo(maxIncrease, 6),
      };

      if (delta > maxIncrease) {
        regressions.push({
          type: 'perf_regression',
          operation: operationName,
          metric: metricName,
          current: roundTo(currentValue, 6),
          baseline: roundTo(baselineValue, 6),
          delta,
          increaseMax: roundTo(maxIncrease, 6),
        });
      }
    }
  }

  return {
    deltas,
    regressions,
  };
}

function compareTuningMetrics(currentIndex, baselineIndex, chapterThresholds) {
  const current = isPlainObject(currentIndex) ? currentIndex : {};
  const baseline = isPlainObject(baselineIndex) ? baselineIndex : {};
  const thresholds = isPlainObject(chapterThresholds) ? chapterThresholds : {};
  const chapterIds = Object.keys(thresholds).sort();
  const regressions = [];
  const deltas = {};

  for (const chapterId of chapterIds) {
    const chapterThreshold = isPlainObject(thresholds[chapterId]) ? thresholds[chapterId] : {};
    const currentSummary = isPlainObject(current[chapterId]) ? current[chapterId] : null;
    const baselineSummary = isPlainObject(baseline[chapterId]) ? baseline[chapterId] : null;

    if (!currentSummary || !baselineSummary) {
      regressions.push({
        type: 'missing_tuning_chapter',
        chapterId,
        currentExists: Boolean(currentSummary),
        baselineExists: Boolean(baselineSummary),
      });
      continue;
    }

    const currentStatus = String(currentSummary.status || 'UNKNOWN').toUpperCase();
    const baselineStatus = String(baselineSummary.status || 'UNKNOWN').toUpperCase();
    const currentScore = toFiniteNumber(currentSummary.score, NaN);
    const baselineScore = toFiniteNumber(baselineSummary.score, NaN);
    const scoreIncreaseMax = toNonNegativeNumber(chapterThreshold.scoreIncreaseMax, 0);
    const allowStatusDegrade = parseBooleanLike(chapterThreshold.allowStatusDegrade, false);
    const scoreDelta = roundTo(currentScore - baselineScore, 6);

    deltas[chapterId] = {
      status: {
        current: currentStatus,
        baseline: baselineStatus,
        degraded: statusRank(currentStatus) > statusRank(baselineStatus),
      },
      score: {
        current: roundTo(currentScore, 6),
        baseline: roundTo(baselineScore, 6),
        delta: scoreDelta,
        increaseMax: roundTo(scoreIncreaseMax, 6),
      },
    };

    if (statusRank(currentStatus) > statusRank(baselineStatus) && !allowStatusDegrade) {
      regressions.push({
        type: 'tuning_status_regression',
        chapterId,
        currentStatus,
        baselineStatus,
      });
    }

    if (!Number.isFinite(currentScore) || !Number.isFinite(baselineScore)) {
      regressions.push({
        type: 'missing_tuning_score',
        chapterId,
        currentScore,
        baselineScore,
      });
      continue;
    }

    if (scoreDelta > scoreIncreaseMax) {
      regressions.push({
        type: 'tuning_score_regression',
        chapterId,
        current: roundTo(currentScore, 6),
        baseline: roundTo(baselineScore, 6),
        delta: scoreDelta,
        increaseMax: roundTo(scoreIncreaseMax, 6),
      });
    }
  }

  return {
    deltas,
    regressions,
  };
}

function evaluateTrendDiff(currentReports, baselineReports, normalizedThresholds) {
  const thresholds = normalizeTrendThresholds(normalizedThresholds);
  const current = isPlainObject(currentReports) ? currentReports : {};
  const baseline = isPlainObject(baselineReports) ? baselineReports : {};
  const currentPerfIndex = buildPerfStatsIndex(current.perf);
  const baselinePerfIndex = buildPerfStatsIndex(baseline.perf);
  const currentTuningIndex = buildTuningSummaryIndex(current.tuning);
  const baselineTuningIndex = buildTuningSummaryIndex(baseline.tuning);

  const perfComparison = comparePerfMetrics(
    currentPerfIndex,
    baselinePerfIndex,
    thresholds.perf.operations
  );
  const tuningComparison = compareTuningMetrics(
    currentTuningIndex,
    baselineTuningIndex,
    thresholds.tuning.chapters
  );
  const regressions = [...perfComparison.regressions, ...tuningComparison.regressions];

  return {
    ok: regressions.length === 0,
    thresholdsVersion: thresholds.version,
    regressions,
    deltas: {
      perf: perfComparison.deltas,
      tuning: tuningComparison.deltas,
    },
  };
}

function getTuningReportFilename(chapterId) {
  return `tuning-gate-report.${chapterId}.json`;
}

function collectRequiredReportPaths(baseDirPath, normalizedThresholds) {
  const basePath = String(baseDirPath || '');
  const thresholdSource = normalizeTrendThresholds(normalizedThresholds);
  const chapterIds = Object.keys(thresholdSource.tuning.chapters).sort();
  const tuningPaths = {};
  for (const chapterId of chapterIds) {
    tuningPaths[chapterId] = path.join(basePath, getTuningReportFilename(chapterId));
  }

  return {
    perf: path.join(basePath, PERF_REPORT_FILENAME),
    tuning: tuningPaths,
  };
}

function allFilesExist(pathsMap, dependencies) {
  const deps = isPlainObject(dependencies) ? dependencies : {};
  const existsSync = typeof deps.existsSync === 'function' ? deps.existsSync : fs.existsSync;
  const perfPath = pathsMap?.perf;
  const tuningMap = isPlainObject(pathsMap?.tuning) ? pathsMap.tuning : {};

  if (!existsSync(perfPath)) {
    return false;
  }

  for (const chapterId of Object.keys(tuningMap)) {
    if (!existsSync(tuningMap[chapterId])) {
      return false;
    }
  }

  return true;
}

function loadReportsFromPaths(pathsMap, dependencies) {
  const loaded = {
    perf: readJsonFile(pathsMap.perf, 'perf_report', dependencies),
    tuning: {},
  };

  for (const chapterId of Object.keys(pathsMap.tuning || {}).sort()) {
    loaded.tuning[chapterId] = readJsonFile(
      pathsMap.tuning[chapterId],
      `tuning_report:${chapterId}`,
      dependencies
    );
  }

  return loaded;
}

function writeJsonReportFile(outputPath, payload, dependencies) {
  const deps = isPlainObject(dependencies) ? dependencies : {};
  const mkdirSync = typeof deps.mkdirSync === 'function' ? deps.mkdirSync : fs.mkdirSync;
  const writeFileSync = typeof deps.writeFileSync === 'function' ? deps.writeFileSync : fs.writeFileSync;
  const resolvePath = typeof deps.resolvePath === 'function' ? deps.resolvePath : path.resolve;
  const dirname = typeof deps.dirname === 'function' ? deps.dirname : path.dirname;
  const cwd = typeof deps.cwd === 'function' ? deps.cwd() : process.cwd();
  const resolvedPath = resolvePath(cwd, outputPath);

  mkdirSync(dirname(resolvedPath), { recursive: true });
  writeFileSync(resolvedPath, JSON.stringify(payload, null, 2));

  return resolvedPath;
}

function formatRegression(regression) {
  const source = isPlainObject(regression) ? regression : {};
  const type = String(source.type || 'unknown');

  if (type === 'perf_regression') {
    return (
      `perf regression: ${source.operation}.${source.metric} ` +
      `delta=${source.delta} > limit=${source.increaseMax} ` +
      `(baseline=${source.baseline}, current=${source.current})`
    );
  }

  if (type === 'tuning_status_regression') {
    return (
      `tuning status regression: ${source.chapterId} ` +
      `${source.baselineStatus} -> ${source.currentStatus}`
    );
  }

  if (type === 'tuning_score_regression') {
    return (
      `tuning score regression: ${source.chapterId} ` +
      `delta=${source.delta} > limit=${source.increaseMax} ` +
      `(baseline=${source.baseline}, current=${source.current})`
    );
  }

  if (type === 'missing_perf_operation') {
    return (
      `missing perf operation: ${source.operation} ` +
      `(baseline=${source.baselineExists}, current=${source.currentExists})`
    );
  }

  if (type === 'missing_tuning_chapter') {
    return (
      `missing tuning chapter: ${source.chapterId} ` +
      `(baseline=${source.baselineExists}, current=${source.currentExists})`
    );
  }

  return JSON.stringify(source);
}

function createSummaryLine(result) {
  const source = isPlainObject(result) ? result : {};
  const status = source.ok ? 'PASS' : 'FAIL';
  const parts = [`${SUMMARY_PREFIX} ${status}`];
  if (source.skipped) {
    parts.push('skipped=true');
  }
  if (typeof source.thresholdsVersion === 'string') {
    parts.push(`thresholdVersion=${source.thresholdsVersion}`);
  }
  if (Array.isArray(source.regressions)) {
    parts.push(`regressions=${source.regressions.length}`);
  }
  return parts.join(' ');
}

function runTrendDiff(options, dependencies) {
  const deps = isPlainObject(dependencies) ? dependencies : {};
  const now = typeof deps.now === 'function' ? deps.now : () => new Date().toISOString();
  const resolvedCurrentDir = resolvePathFromCwd(options.currentDir, deps);
  const resolvedBaselineDir = resolvePathFromCwd(options.baselineDir, deps);
  const resolvedThresholdsPath = resolvePathFromCwd(options.thresholdsPath, deps);
  const rawThresholds = readJsonFile(resolvedThresholdsPath, 'trend_thresholds', deps);
  const normalizedThresholds = normalizeTrendThresholds(rawThresholds);
  const currentPaths = collectRequiredReportPaths(resolvedCurrentDir, normalizedThresholds);
  const baselinePaths = collectRequiredReportPaths(resolvedBaselineDir, normalizedThresholds);
  const baselineExists = allFilesExist(baselinePaths, deps);

  if (!baselineExists && options.allowMissingBaseline) {
    const skippedResult = {
      ok: true,
      skipped: true,
      reason: 'baseline_missing',
      thresholdsVersion: normalizedThresholds.version,
      regressions: [],
      deltas: {
        perf: {},
        tuning: {},
      },
    };

    const payload = {
      generatedAt: now(),
      currentDir: resolvedCurrentDir,
      baselineDir: resolvedBaselineDir,
      thresholdsPath: resolvedThresholdsPath,
      ...skippedResult,
    };
    const savedPath = options.outputPath ? writeJsonReportFile(options.outputPath, payload, deps) : null;

    return {
      ...skippedResult,
      payload,
      savedPath,
      summaryLine: createSummaryLine(skippedResult),
      regressionLines: [],
    };
  }

  const currentReports = loadReportsFromPaths(currentPaths, deps);
  const baselineReports = loadReportsFromPaths(baselinePaths, deps);
  const evaluation = evaluateTrendDiff(currentReports, baselineReports, normalizedThresholds);
  const result = {
    ...evaluation,
    skipped: false,
    reason: null,
  };

  const payload = {
    generatedAt: now(),
    currentDir: resolvedCurrentDir,
    baselineDir: resolvedBaselineDir,
    thresholdsPath: resolvedThresholdsPath,
    ...result,
  };

  const savedPath = options.outputPath ? writeJsonReportFile(options.outputPath, payload, deps) : null;
  const regressionLines = (result.regressions || []).map(formatRegression);

  return {
    ...result,
    payload,
    savedPath,
    summaryLine: createSummaryLine(result),
    regressionLines,
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
    const result = runTrendDiff(parsedArgs);

    if (result.savedPath) {
      process.stderr.write(`${SUMMARY_PREFIX} Wrote report to ${result.savedPath}\n`);
    }

    if (!result.ok) {
      process.stderr.write(`${result.summaryLine}\n`);
      for (const line of result.regressionLines) {
        process.stderr.write(`${line}\n`);
      }
      process.exit(1);
    }

    process.stdout.write(`${result.summaryLine}\n`);
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
  DEFAULT_CURRENT_DIR,
  DEFAULT_BASELINE_DIR,
  DEFAULT_THRESHOLDS_PATH,
  parseArgs,
  normalizeTrendThresholds,
  buildPerfStatsIndex,
  buildTuningSummaryIndex,
  comparePerfMetrics,
  compareTuningMetrics,
  evaluateTrendDiff,
  collectRequiredReportPaths,
  allFilesExist,
  createSummaryLine,
  runTrendDiff,
  writeJsonReportFile,
};
