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

  const configPath = resolveInputPath(
    getArgValue(sourceArgs, ['config'], DEFAULT_GATE_CONFIG_PATH),
    DEFAULT_GATE_CONFIG_PATH
  );
  const configText = readTextFile(configPath, 'config', readFileSync);
  const gateConfig = normalizeTuningGateConfig(parseTuningGateConfig(configText));

  const reportArg = getArgValue(sourceArgs, ['report'], null);
  const failOnWarn = toBooleanFlag(getArgValue(sourceArgs, ['fail-on-warn'], false), false);

  let reportSource = 'auto-tune';
  let reportPath = null;
  let autoTuneReport;
  if (typeof reportArg === 'string' && reportArg.trim().length > 0) {
    reportSource = 'report';
    reportPath = resolveInputPath(reportArg, null);
    const reportText = readTextFile(reportPath, 'report', readFileSync);
    autoTuneReport = parseJson(reportText, 'report', reportPath);
  } else {
    const autoTuneOptions = buildAutoTuneOptions(sourceArgs);
    autoTuneReport = runAutoTuneFn(autoTuneOptions);
  }

  const evaluation = evaluateTuningGateReport(autoTuneReport, gateConfig);
  const exitCode = resolveGateExitCode(evaluation.status, failOnWarn);

  return {
    configPath,
    failOnWarn,
    reportSource,
    reportPath,
    evaluation,
    exitCode,
    report: autoTuneReport,
    config: gateConfig,
  };
}

function main() {
  const parsedArgs = parseCliArgs(process.argv.slice(2));
  const result = runTuningGate(parsedArgs);

  process.stdout.write(
    `${JSON.stringify(
      {
        configPath: result.configPath,
        failOnWarn: result.failOnWarn,
        reportSource: result.reportSource,
        reportPath: result.reportPath,
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
  resolveGateExitCode,
  runTuningGate,
  main,
};
