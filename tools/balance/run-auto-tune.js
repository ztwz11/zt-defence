#!/usr/bin/env node
'use strict';

const { runAutoTune } = require('./auto-tune');

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
      parsed[key] = token.slice(equalIndex + 1);
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

function toOptionalFiniteNumber(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function parseSeedList(value) {
  if (typeof value !== 'string') {
    return null;
  }

  const seeds = [];
  for (const rawPart of value.split(',')) {
    const trimmed = rawPart.trim();
    if (trimmed.length === 0) {
      continue;
    }

    const numeric = Number(trimmed);
    if (!Number.isFinite(numeric)) {
      continue;
    }

    seeds.push(Math.floor(numeric));
  }

  return seeds.length > 0 ? seeds : null;
}

function buildAutoTuneOptions(parsedArgs) {
  const chapterId = String(getArgValue(parsedArgs, ['chapter', 'chapter-id'], 'chapter_1'));
  const waveMax = toPositiveInteger(getArgValue(parsedArgs, ['wave-max', 'wave'], 20), 20);
  const seedCount = toPositiveInteger(getArgValue(parsedArgs, ['seeds', 'seed-count'], 100), 100);
  const baseSeed = toNonNegativeInteger(getArgValue(parsedArgs, ['base-seed', 'seed-base'], 1), 1);
  const seedStride = toPositiveInteger(getArgValue(parsedArgs, ['seed-stride', 'stride'], 1), 1);
  const searchSeed = toNonNegativeInteger(getArgValue(parsedArgs, ['search-seed'], 1337), 1337);
  const candidateCount = toPositiveInteger(
    getArgValue(parsedArgs, ['candidate-count', 'candidates', 'samples'], 24),
    24
  );
  const seedList = parseSeedList(getArgValue(parsedArgs, ['seed-list'], null));
  const targetClearRate = toOptionalFiniteNumber(
    getArgValue(parsedArgs, ['target-clear', 'target-clear-rate'], null)
  );
  const targetReachedWave = toOptionalFiniteNumber(
    getArgValue(parsedArgs, ['target-wave', 'target-reached-wave'], null)
  );
  const maxFailRate = toOptionalFiniteNumber(
    getArgValue(parsedArgs, ['max-fail', 'max-fail-rate'], null)
  );

  const clearWeight = toOptionalFiniteNumber(
    getArgValue(parsedArgs, ['weight-clear', 'weight-clear-rate'], null)
  );
  const waveWeight = toOptionalFiniteNumber(
    getArgValue(parsedArgs, ['weight-wave', 'weight-reached-wave'], null)
  );
  const failWeight = toOptionalFiniteNumber(
    getArgValue(parsedArgs, ['weight-fail', 'weight-fail-overflow'], null)
  );
  const continueWeight = toOptionalFiniteNumber(
    getArgValue(parsedArgs, ['weight-continue', 'weight-continue-rate'], null)
  );

  const objective = {};
  if (targetClearRate !== null) {
    objective.targetClearRate = targetClearRate;
  }
  if (targetReachedWave !== null) {
    objective.targetReachedWave = targetReachedWave;
  }
  if (maxFailRate !== null) {
    objective.maxFailRate = maxFailRate;
  }

  const weights = {};
  if (clearWeight !== null) {
    weights.clearRate = clearWeight;
  }
  if (waveWeight !== null) {
    weights.reachedWave = waveWeight;
  }
  if (failWeight !== null) {
    weights.failRateOverflow = failWeight;
  }
  if (continueWeight !== null) {
    weights.continueRate = continueWeight;
  }
  if (Object.keys(weights).length > 0) {
    objective.weights = weights;
  }

  const options = {
    chapterId,
    waveMax,
    seedCount,
    baseSeed,
    seedStride,
    searchSeed,
    candidateCount,
    seeds: seedList,
  };

  if (Object.keys(objective).length > 0) {
    options.objective = objective;
  }

  return options;
}

function main() {
  const parsedArgs = parseCliArgs(process.argv.slice(2));
  const autoTuneOptions = buildAutoTuneOptions(parsedArgs);
  const result = runAutoTune(autoTuneOptions);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

try {
  main();
} catch (error) {
  process.stderr.write('[auto-tune] Failed to run auto tuning\n');
  process.stderr.write(`${error && error.stack ? error.stack : String(error)}\n`);
  process.exit(1);
}
