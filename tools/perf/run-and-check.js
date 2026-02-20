#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const { loadThresholds } = require('./check-thresholds');
const { DEFAULT_PROFILE, runPerfProbe } = require('./run-perf-probe');
const { evaluateThresholds, formatFailures } = require('./threshold-checker');

const SUMMARY_PREFIX = '[perf-run-and-check]';

function toPositiveInteger(value, fallback) {
  if (value === null || value === undefined || value === '') {
    return fallback;
  }
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }
  return Math.max(1, Math.floor(numeric));
}

function parseArgs(argv) {
  let iterations = null;
  let profile = DEFAULT_PROFILE;
  let outputPath = null;
  let thresholdPath = null;
  let allowMissing = false;
  let help = false;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--help' || arg === '-h') {
      help = true;
      continue;
    }

    if (arg.startsWith('--iterations=')) {
      iterations = toPositiveInteger(arg.slice('--iterations='.length), NaN);
      continue;
    }

    if (arg === '--iterations') {
      iterations = toPositiveInteger(argv[index + 1], NaN);
      index += 1;
      continue;
    }

    if (arg.startsWith('--profile=')) {
      profile = arg.slice('--profile='.length).trim();
      continue;
    }

    if (arg === '--profile') {
      profile = (argv[index + 1] || '').trim();
      index += 1;
      continue;
    }

    if (arg.startsWith('--output=')) {
      outputPath = arg.slice('--output='.length).trim();
      continue;
    }

    if (arg === '--output') {
      outputPath = (argv[index + 1] || '').trim();
      index += 1;
      continue;
    }

    if (arg.startsWith('--thresholds=')) {
      thresholdPath = arg.slice('--thresholds='.length).trim();
      continue;
    }

    if (arg === '--thresholds') {
      thresholdPath = (argv[index + 1] || '').trim();
      index += 1;
      continue;
    }

    if (arg === '--allow-missing') {
      allowMissing = true;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  if (iterations !== null && (!Number.isFinite(iterations) || iterations < 1)) {
    throw new Error('Invalid --iterations value. Expected a positive integer.');
  }

  if (profile.length === 0) {
    throw new Error('Invalid --profile value. Expected a non-empty profile name.');
  }

  if (outputPath !== null && outputPath.length === 0) {
    throw new Error('Invalid --output value. Expected a non-empty path.');
  }

  if (thresholdPath !== null && thresholdPath.length === 0) {
    throw new Error('Invalid --thresholds value. Expected a non-empty path.');
  }

  return {
    help,
    iterations,
    profile,
    outputPath,
    thresholdPath,
    allowMissing,
  };
}

function printHelp() {
  const usage = [
    'Usage: node tools/perf/run-and-check.js [options]',
    '',
    'Options:',
    '  --iterations=<n>   Number of iterations per operation',
    `  --profile=<name>   Profile tag included in probe output (default: ${DEFAULT_PROFILE})`,
    '  --output=<path>    Optional output JSON path for combined report + gate result',
    '  --thresholds=<path>  Optional thresholds JSON path',
    '  --allow-missing    Do not fail when an operation is missing in the report',
    '  --help             Show this help message',
  ];

  process.stdout.write(`${usage.join('\n')}\n`);
}

function writeReportFile(outputPath, payload, dependencies) {
  const deps = dependencies || {};
  const mkdirSync = typeof deps.mkdirSync === 'function' ? deps.mkdirSync : fs.mkdirSync;
  const writeFileSync = typeof deps.writeFileSync === 'function' ? deps.writeFileSync : fs.writeFileSync;
  const resolvePath = typeof deps.resolvePath === 'function' ? deps.resolvePath : path.resolve;
  const dirname = typeof deps.dirname === 'function' ? deps.dirname : path.dirname;
  const cwd = typeof deps.cwd === 'function' ? deps.cwd() : process.cwd();

  const resolvedPath = resolvePath(cwd, outputPath);
  const directoryPath = dirname(resolvedPath);
  mkdirSync(directoryPath, { recursive: true });
  writeFileSync(resolvedPath, JSON.stringify(payload, null, 2));
  return resolvedPath;
}

function createSummaryLine(result) {
  const status = result.ok ? 'PASS' : 'FAIL';
  const parts = [
    `${SUMMARY_PREFIX} ${status}`,
    `checkedOperations=${result.checkedOperations}`,
    `profile=${result.profile || 'n/a'}`,
    `thresholdVersion=${result.thresholdVersion || 'n/a'}`,
  ];

  if (!result.ok) {
    parts.push(`failures=${result.failures.length}`);
  }

  return parts.join(' ');
}

function runAndCheck(options, dependencies) {
  const deps = dependencies || {};
  const runProbe = typeof deps.runPerfProbe === 'function' ? deps.runPerfProbe : runPerfProbe;
  const loadThresholdConfig =
    typeof deps.loadThresholds === 'function' ? deps.loadThresholds : loadThresholds;
  const evaluate =
    typeof deps.evaluateThresholds === 'function' ? deps.evaluateThresholds : evaluateThresholds;
  const formatFailureOutput =
    typeof deps.formatFailures === 'function' ? deps.formatFailures : formatFailures;
  const now = typeof deps.now === 'function' ? deps.now : () => new Date().toISOString();

  const probeReport = runProbe({
    iterations: options.iterations,
    profile: options.profile,
  });
  const thresholds = loadThresholdConfig(options.thresholdPath || null);
  const evaluation = evaluate(probeReport, thresholds, {
    failOnMissing: !options.allowMissing,
  });
  const reportPayload = {
    generatedAt: now(),
    ok: evaluation.ok,
    profile: probeReport?.profile || evaluation.profile || null,
    thresholdVersion: evaluation.thresholdVersion || probeReport?.thresholdVersion || null,
    checkedOperations: evaluation.checkedOperations,
    failures: evaluation.failures,
    probeReport,
  };
  const summaryLine = createSummaryLine(reportPayload);
  const failureDetails = evaluation.ok ? '' : formatFailureOutput(evaluation);
  let savedPath = null;

  if (options.outputPath) {
    savedPath = writeReportFile(options.outputPath, reportPayload, deps);
  }

  return {
    ok: evaluation.ok,
    summaryLine,
    failureDetails,
    savedPath,
    reportPayload,
    evaluation,
  };
}

function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.stderr.write('Use --help to see supported options.\n');
    process.exit(1);
  }

  if (args.help) {
    printHelp();
    return;
  }

  try {
    const result = runAndCheck(args);

    if (result.savedPath) {
      process.stderr.write(`${SUMMARY_PREFIX} Wrote report to ${result.savedPath}\n`);
    }

    if (!result.ok) {
      process.stderr.write(`${result.summaryLine}\n`);
      if (result.failureDetails) {
        process.stderr.write(`${result.failureDetails}\n`);
      }
      process.exit(1);
    }

    process.stdout.write(`${result.summaryLine}\n`);
  } catch (error) {
    process.stderr.write(`${SUMMARY_PREFIX} Execution failed\n`);
    process.stderr.write(`${error && error.stack ? error.stack : error}\n`);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  createSummaryLine,
  parseArgs,
  runAndCheck,
  writeReportFile,
};
