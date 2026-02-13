#!/usr/bin/env node
'use strict';

const { runBalanceSimulation } = require('./balance-sim');
const { writeRunRowsCsv } = require('./csv-export');

function normalizeArgKey(rawKey) {
  return String(rawKey || '')
    .trim()
    .replace(/^--/, '')
    .toLowerCase();
}

function parseCliArgs(argv) {
  const parsed = {};

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) {
      continue;
    }

    const equalIndex = token.indexOf('=');
    if (equalIndex >= 0) {
      const key = normalizeArgKey(token.slice(0, equalIndex));
      const value = token.slice(equalIndex + 1);
      parsed[key] = value;
      continue;
    }

    const key = normalizeArgKey(token);
    const next = argv[index + 1];
    if (next && !next.startsWith('--')) {
      parsed[key] = next;
      index += 1;
      continue;
    }

    parsed[key] = true;
  }

  return parsed;
}

function getArgValue(parsedArgs, aliases, fallback) {
  for (const alias of aliases) {
    if (Object.prototype.hasOwnProperty.call(parsedArgs, alias)) {
      return parsedArgs[alias];
    }
  }
  return fallback;
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

function buildSimulationOptions(parsedArgs) {
  const chapterId = String(getArgValue(parsedArgs, ['chapter', 'chapter-id'], 'chapter_1'));
  const seedCount = toPositiveInteger(getArgValue(parsedArgs, ['seeds', 'seed-count'], 200), 200);
  const waveMax = toPositiveInteger(getArgValue(parsedArgs, ['wave-max', 'wave'], 20), 20);
  const baseSeed = toNonNegativeInteger(
    getArgValue(parsedArgs, ['base-seed', 'seed-base', 'base'], 1),
    1
  );
  const seedStride = toPositiveInteger(
    getArgValue(parsedArgs, ['seed-stride', 'stride'], 1),
    1
  );

  return {
    chapterId,
    seedCount,
    waveMax,
    baseSeed,
    seedStride,
  };
}

async function main() {
  const parsedArgs = parseCliArgs(process.argv.slice(2));
  const simulationOptions = buildSimulationOptions(parsedArgs);
  const simulation = runBalanceSimulation(simulationOptions);
  const csvPath = getArgValue(parsedArgs, ['csv', 'csv-path'], null);

  if (typeof csvPath === 'string' && csvPath.length > 0) {
    await writeRunRowsCsv(csvPath, simulation.runs);
  }

  const payload = {
    options: simulation.options,
    summary: simulation.summary,
  };
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write('[balance-sim] Failed to run balance simulation\n');
  process.stderr.write(`${error && error.stack ? error.stack : String(error)}\n`);
  process.exit(1);
});
