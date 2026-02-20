#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const { runAutoTune } = require('./auto-tune');
const { parseCliArgs, getArgValue, buildAutoTuneOptions } = require('./run-auto-tune');
const {
  STATUS_WARN,
  STATUS_FAIL,
  parseTuningGateConfig,
  normalizeTuningGateConfig,
  evaluateTuningGateReport,
} = require('./tuning-gate');

const DEFAULT_GATE_CONFIG_PATH = path.join(__dirname, 'tuning-gate-config.json');

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function toFiniteNumber(value, fallback) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function toPositiveInteger(value, fallback) {
  return Math.max(1, Math.floor(toFiniteNumber(value, fallback)));
}

function toNonNegativeInteger(value, fallback) {
  return Math.max(0, Math.floor(toFiniteNumber(value, fallback)));
}

function toBooleanFlag(value, fallback) {
  if (value === true) {
    return true;
  }

  if (value === false || value === undefined || value === null) {
    return fallback;
  }

  const normalized = String(value).trim().toLowerCase();
  if (
    normalized === '1' ||
    normalized === 'true' ||
    normalized === 'yes' ||
    normalized === 'y' ||
    normalized === 'on'
  ) {
    return true;
  }

  if (
    normalized === '0' ||
    normalized === 'false' ||
    normalized === 'no' ||
    normalized === 'n' ||
    normalized === 'off'
  ) {
    return false;
  }

  return fallback;
}

function resolveInputPath(rawPath, fallbackPath) {
  const candidate =
    typeof rawPath === 'string' && rawPath.trim().length > 0
      ? rawPath.trim()
      : fallbackPath;

  if (typeof candidate !== 'string' || candidate.length === 0) {
    return null;
  }

  return path.isAbsolute(candidate) ? candidate : path.resolve(process.cwd(), candidate);
}

function readTextFile(filePath, description, readFileSync) {
  try {
    return String(readFileSync(filePath, 'utf8'));
  } catch (error) {
    throw new Error(
      `TUNING_GATE_FILE_READ_ERROR(${description}): ${filePath} :: ${
        error && error.message ? error.message : String(error)
      }`
    );
  }
}

function stripByteOrderMark(text) {
  if (typeof text !== 'string') {
    return '';
  }

  return text.replace(/^\uFEFF/, '');
}

function parseJson(text, description, filePath) {
  try {
    return JSON.parse(stripByteOrderMark(text));
  } catch (error) {
    throw new Error(
      `TUNING_GATE_JSON_PARSE_ERROR(${description}): ${filePath} :: ${
        error && error.message ? error.message : String(error)
      }`
    );
  }
}

function normalizeChapterId(value) {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function mergeScopedConfig(baseConfig, scopedConfig) {
  const merged = isPlainObject(baseConfig) ? { ...baseConfig } : {};
  delete merged.chapters;

  if (!isPlainObject(scopedConfig)) {
    return merged;
  }

  const sectionKeys = ['autoTuneDefaults', 'thresholds', 'recommendations'];
  for (const key of sectionKeys) {
    const baseSection = isPlainObject(merged[key]) ? merged[key] : {};
    const scopedSection = isPlainObject(scopedConfig[key]) ? scopedConfig[key] : {};
    merged[key] = {
      ...baseSection,
      ...scopedSection,
    };
  }

  return merged;
}

function resolveScopedConfig(parsedConfig, parsedArgs) {
  const baseConfig = isPlainObject(parsedConfig) ? parsedConfig : {};
  const sourceArgs = isPlainObject(parsedArgs) ? parsedArgs : {};
  const chapters = isPlainObject(baseConfig.chapters) ? baseConfig.chapters : {};
  const availableChapterIds = Object.keys(chapters).sort();
  const requestedChapterId = normalizeChapterId(getArgValue(sourceArgs, ['chapter', 'chapter-id'], null));

  let selectedChapterId = requestedChapterId;
  let chapterConfig = null;
  if (requestedChapterId && isPlainObject(chapters[requestedChapterId])) {
    chapterConfig = chapters[requestedChapterId];
  }

  if (!selectedChapterId) {
    const baseDefaults = isPlainObject(baseConfig.autoTuneDefaults) ? baseConfig.autoTuneDefaults : {};
    const defaultChapterId = normalizeChapterId(baseDefaults.chapter ?? baseDefaults.chapterId);
    if (defaultChapterId) {
      selectedChapterId = defaultChapterId;
      if (isPlainObject(chapters[defaultChapterId])) {
        chapterConfig = chapters[defaultChapterId];
      }
    }
  }

  return {
    requestedChapterId,
    selectedChapterId,
    hasChapterOverride: Boolean(chapterConfig),
    availableChapterIds,
    config: mergeScopedConfig(baseConfig, chapterConfig),
  };
}

function resolveTopCandidatesLimit(value, fallback) {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }

  return toNonNegativeInteger(value, fallback);
}

function buildTopCandidates(report, limit) {
  if (!Number.isFinite(limit) || limit <= 0) {
    return [];
  }

  const sourceReport = isPlainObject(report) ? report : {};
  const rankedCandidates = Array.isArray(sourceReport.rankedCandidates) ? sourceReport.rankedCandidates : [];
  if (rankedCandidates.length > 0) {
    return rankedCandidates.slice(0, limit);
  }

  if (isPlainObject(sourceReport.bestCandidate)) {
    return [sourceReport.bestCandidate];
  }

  return [];
}

function writeJsonReportFile(outputPath, payload, dependencies) {
  const options = dependencies && typeof dependencies === 'object' ? dependencies : {};
  const mkdirSync = typeof options.mkdirSync === 'function' ? options.mkdirSync : fs.mkdirSync;
  const writeFileSync = typeof options.writeFileSync === 'function' ? options.writeFileSync : fs.writeFileSync;
  const resolvePath = typeof options.resolvePath === 'function' ? options.resolvePath : path.resolve;
  const dirname = typeof options.dirname === 'function' ? options.dirname : path.dirname;
  const cwd = typeof options.cwd === 'function' ? options.cwd() : process.cwd();

  const resolvedPath = resolvePath(cwd, outputPath);
  mkdirSync(dirname(resolvedPath), { recursive: true });
  writeFileSync(resolvedPath, JSON.stringify(payload, null, 2));
  return resolvedPath;
}

function normalizeAutoTuneDefaults(source) {
  const parsed = isPlainObject(source) ? source : {};
  const defaults = isPlainObject(parsed.autoTuneDefaults) ? parsed.autoTuneDefaults : {};
  const objective = isPlainObject(defaults.objective) ? defaults.objective : {};
  const weights = isPlainObject(objective.weights)
    ? objective.weights
    : isPlainObject(defaults.weights)
      ? defaults.weights
      : {};

  const normalized = {};
  if (typeof defaults.chapter === 'string' && defaults.chapter.trim().length > 0) {
    normalized.chapter = defaults.chapter.trim();
  } else if (typeof defaults.chapterId === 'string' && defaults.chapterId.trim().length > 0) {
    normalized.chapter = defaults.chapterId.trim();
  }

  if (Number.isFinite(Number(defaults.waveMax))) {
    normalized['wave-max'] = toPositiveInteger(defaults.waveMax, 20);
  }
  if (Number.isFinite(Number(defaults.seeds ?? defaults.seedCount))) {
    normalized.seeds = toPositiveInteger(defaults.seeds ?? defaults.seedCount, 100);
  }
  if (Number.isFinite(Number(defaults.candidates ?? defaults.candidateCount))) {
    normalized.candidates = toPositiveInteger(defaults.candidates ?? defaults.candidateCount, 24);
  }
  if (Number.isFinite(Number(defaults.searchSeed))) {
    normalized['search-seed'] = toNonNegativeInteger(defaults.searchSeed, 1337);
  }

  const targetClearCandidate = defaults.targetClear ?? objective.targetClearRate;
  if (Number.isFinite(Number(targetClearCandidate))) {
    normalized['target-clear'] = Number(targetClearCandidate);
  }

  const targetWaveCandidate = defaults.targetWave ?? objective.targetReachedWave;
  if (Number.isFinite(Number(targetWaveCandidate))) {
    normalized['target-wave'] = Number(targetWaveCandidate);
  }

  const maxFailCandidate = defaults.maxFail ?? objective.maxFailRate;
  if (Number.isFinite(Number(maxFailCandidate))) {
    normalized['max-fail'] = Number(maxFailCandidate);
  }

  const clearWeightCandidate = weights.clearRate;
  if (Number.isFinite(Number(clearWeightCandidate))) {
    normalized['weight-clear'] = Number(clearWeightCandidate);
  }
  const waveWeightCandidate = weights.reachedWave;
  if (Number.isFinite(Number(waveWeightCandidate))) {
    normalized['weight-wave'] = Number(waveWeightCandidate);
  }
  const failWeightCandidate = weights.failRateOverflow;
  if (Number.isFinite(Number(failWeightCandidate))) {
    normalized['weight-fail'] = Number(failWeightCandidate);
  }
  const continueWeightCandidate = weights.continueRate;
  if (Number.isFinite(Number(continueWeightCandidate))) {
    normalized['weight-continue'] = Number(continueWeightCandidate);
  }

  return normalized;
}

function mergeParsedArgsWithAutoTuneDefaults(parsedArgs, autoTuneDefaults) {
  const sourceArgs = isPlainObject(parsedArgs) ? parsedArgs : {};
  const defaults = isPlainObject(autoTuneDefaults) ? autoTuneDefaults : {};
  return {
    ...defaults,
    ...sourceArgs,
  };
}

function resolveGateExitCode(status, failOnWarn) {
  if (status === STATUS_FAIL) {
    return 1;
  }

  if (status === STATUS_WARN && failOnWarn) {
    return 1;
  }

  return 0;
}

function runTuningGate(parsedArgs, dependencies) {
  const sourceArgs = parsedArgs && typeof parsedArgs === 'object' ? parsedArgs : {};
  const options = dependencies && typeof dependencies === 'object' ? dependencies : {};
  const readFileSync = typeof options.readFileSync === 'function' ? options.readFileSync : fs.readFileSync;
  const runAutoTuneFn = typeof options.runAutoTune === 'function' ? options.runAutoTune : runAutoTune;
  const now = typeof options.now === 'function' ? options.now : () => new Date().toISOString();

  const configPath = resolveInputPath(
    getArgValue(sourceArgs, ['config'], DEFAULT_GATE_CONFIG_PATH),
    DEFAULT_GATE_CONFIG_PATH
  );
  const configText = readTextFile(configPath, 'config', readFileSync);
  const parsedConfig = parseTuningGateConfig(configText);
  const scoped = resolveScopedConfig(parsedConfig, sourceArgs);
  const gateConfig = normalizeTuningGateConfig(scoped.config);
  const autoTuneDefaults = normalizeAutoTuneDefaults(scoped.config);

  const reportArg = getArgValue(sourceArgs, ['report'], null);
  const failOnWarn = toBooleanFlag(getArgValue(sourceArgs, ['fail-on-warn'], false), false);
  const outputArg = getArgValue(sourceArgs, ['output'], null);
  const outputPath = resolveInputPath(outputArg, null);
  const topCandidatesLimit = resolveTopCandidatesLimit(
    getArgValue(sourceArgs, ['top-candidates', 'topn'], 5),
    5
  );

  if (
    outputArg !== null &&
    outputArg !== undefined &&
    (typeof outputArg !== 'string' || outputPath === null)
  ) {
    throw new Error('TUNING_GATE_INVALID_OUTPUT_PATH: expected --output=<path>');
  }

  let reportSource = 'auto-tune';
  let reportPath = null;
  let autoTuneReport;
  if (typeof reportArg === 'string' && reportArg.trim().length > 0) {
    reportSource = 'report';
    reportPath = resolveInputPath(reportArg, null);
    const reportText = readTextFile(reportPath, 'report', readFileSync);
    autoTuneReport = parseJson(reportText, 'report', reportPath);
  } else {
    const mergedArgs = mergeParsedArgsWithAutoTuneDefaults(sourceArgs, autoTuneDefaults);
    const autoTuneOptions = buildAutoTuneOptions(mergedArgs);
    autoTuneReport = runAutoTuneFn(autoTuneOptions);
  }

  const evaluation = evaluateTuningGateReport(autoTuneReport, gateConfig);
  const exitCode = resolveGateExitCode(evaluation.status, failOnWarn);
  const topCandidates = buildTopCandidates(autoTuneReport, topCandidatesLimit);
  const outputPayload = {
    generatedAt: now(),
    configPath,
    chapterProfile: {
      requestedChapterId: scoped.requestedChapterId,
      selectedChapterId: scoped.selectedChapterId,
      hasChapterOverride: scoped.hasChapterOverride,
      availableChapterIds: scoped.availableChapterIds,
    },
    failOnWarn,
    reportSource,
    reportPath,
    evaluation,
    thresholds: gateConfig.thresholds,
    bestCandidate: isPlainObject(autoTuneReport?.bestCandidate) ? autoTuneReport.bestCandidate : null,
    topCandidates,
  };

  const savedOutputPath = outputPath ? writeJsonReportFile(outputPath, outputPayload, options) : null;

  return {
    configPath,
    chapterProfile: {
      requestedChapterId: scoped.requestedChapterId,
      selectedChapterId: scoped.selectedChapterId,
      hasChapterOverride: scoped.hasChapterOverride,
      availableChapterIds: scoped.availableChapterIds,
    },
    failOnWarn,
    reportSource,
    reportPath,
    evaluation,
    exitCode,
    topCandidatesLimit,
    topCandidates,
    outputPath: savedOutputPath,
    outputPayload,
    report: autoTuneReport,
    config: gateConfig,
  };
}

function main() {
  const parsedArgs = parseCliArgs(process.argv.slice(2));
  const result = runTuningGate(parsedArgs);

  if (result.outputPath) {
    process.stderr.write(`[tuning-gate] Wrote report to ${result.outputPath}\n`);
  }

  process.stdout.write(
    `${JSON.stringify(
      {
        configPath: result.configPath,
        chapterProfile: result.chapterProfile,
        failOnWarn: result.failOnWarn,
        reportSource: result.reportSource,
        reportPath: result.reportPath,
        outputPath: result.outputPath,
        evaluation: result.evaluation,
      },
      null,
      2
    )}\n`
  );

  if (result.exitCode !== 0) {
    process.exit(result.exitCode);
  }
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    process.stderr.write('[tuning-gate] Failed to evaluate tuning gate\n');
    process.stderr.write(`${error && error.stack ? error.stack : String(error)}\n`);
    process.exit(1);
  }
}

module.exports = {
  DEFAULT_GATE_CONFIG_PATH,
  toBooleanFlag,
  resolveInputPath,
  normalizeAutoTuneDefaults,
  resolveScopedConfig,
  resolveTopCandidatesLimit,
  buildTopCandidates,
  mergeParsedArgsWithAutoTuneDefaults,
  writeJsonReportFile,
  resolveGateExitCode,
  runTuningGate,
  main,
};
