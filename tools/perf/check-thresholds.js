#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const {
  DEFAULT_THRESHOLDS,
  evaluateThresholds,
  formatFailures,
} = require('./threshold-checker');

function parseArgs(argv) {
  let reportPath = null;
  let thresholdPath = null;
  let failOnMissing = true;
  let help = false;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--help' || arg === '-h') {
      help = true;
      continue;
    }

    if (arg.startsWith('--report=')) {
      reportPath = arg.slice('--report='.length).trim();
      continue;
    }

    if (arg === '--report') {
      reportPath = (argv[index + 1] || '').trim();
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
      failOnMissing = false;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  if (reportPath !== null && reportPath.length === 0) {
    throw new Error('Invalid --report value. Expected a non-empty path.');
  }

  if (thresholdPath !== null && thresholdPath.length === 0) {
    throw new Error('Invalid --thresholds value. Expected a non-empty path.');
  }

  return {
    help,
    reportPath,
    thresholdPath,
    failOnMissing,
  };
}

function printHelp() {
  const usage = [
    'Usage: node tools/perf/check-thresholds.js [options]',
    '',
    'Options:',
    '  --report=<path>      JSON report path. Omit to read report JSON from stdin.',
    '  --thresholds=<path>  Optional thresholds JSON path.',
    '  --allow-missing      Do not fail when a configured operation is missing in the report.',
    '  --help               Show this help message',
    '',
    'Threshold format:',
    '  { "operationName": { "avgMs": 10, "p95Ms": 20, "maxMs": 30 } }',
  ];

  process.stdout.write(`${usage.join('\n')}\n`);
}

function readJsonFromFile(filePath, label) {
  const resolvedPath = path.resolve(process.cwd(), filePath);
  let raw;
  try {
    raw = fs.readFileSync(resolvedPath, 'utf8');
  } catch (error) {
    throw new Error(`${label} file could not be read: ${resolvedPath}`);
  }

  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(`${label} file is not valid JSON: ${resolvedPath}`);
  }
}

function readStdinJson() {
  return new Promise((resolve, reject) => {
    let raw = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => {
      raw += chunk;
    });
    process.stdin.on('end', () => {
      const trimmed = raw.trim();
      if (!trimmed) {
        reject(new Error('No report JSON provided on stdin. Use --report or pipe a JSON payload.'));
        return;
      }

      try {
        resolve(JSON.parse(trimmed));
      } catch (error) {
        reject(new Error('Report stdin payload is not valid JSON.'));
      }
    });
    process.stdin.on('error', () => {
      reject(new Error('Failed to read report JSON from stdin.'));
    });
  });
}

function loadDefaultThresholds() {
  const thresholdFilePath = path.join(__dirname, 'default-thresholds.json');
  try {
    return readJsonFromFile(thresholdFilePath, 'Default thresholds');
  } catch (error) {
    return DEFAULT_THRESHOLDS;
  }
}

async function loadReport(reportPath) {
  if (reportPath) {
    return readJsonFromFile(reportPath, 'Report');
  }

  if (process.stdin.isTTY) {
    throw new Error('Missing report input. Provide --report=<path> or pipe report JSON to stdin.');
  }

  return readStdinJson();
}

function loadThresholds(thresholdPath) {
  if (thresholdPath) {
    return readJsonFromFile(thresholdPath, 'Threshold');
  }
  return loadDefaultThresholds();
}

async function main() {
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
    const report = await loadReport(args.reportPath);
    const thresholds = loadThresholds(args.thresholdPath);
    const evaluation = evaluateThresholds(report, thresholds, {
      failOnMissing: args.failOnMissing,
    });

    if (!evaluation.ok) {
      process.stderr.write('[perf-thresholds] FAIL\n');
      process.stderr.write(`${formatFailures(evaluation)}\n`);
      process.exit(1);
    }

    process.stdout.write(
      `[perf-thresholds] PASS checkedOperations=${evaluation.checkedOperations}\n`
    );
  } catch (error) {
    process.stderr.write('[perf-thresholds] Evaluation failed\n');
    process.stderr.write(`${error.message}\n`);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  loadThresholds,
  parseArgs,
};
