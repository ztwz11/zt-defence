#!/usr/bin/env node
'use strict';

const {
  deserializeRunSave,
  serializeRunSave,
} = require('../../src/game/save');
const {
  FIXED_TIMESTAMP,
  combineWavePayloads,
  compareDeterministicTraces,
  createLongRunChapterContext,
  createRunSaveCheckpoint,
  describeTraceComparison,
  restoreChapterContextFromRunSave,
  runWaveSequence,
} = require('./long-run-save-reload-helpers');

function toFiniteNumber(value, fallback) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function toPositiveInteger(value, fallback) {
  return Math.max(1, Math.floor(toFiniteNumber(value, fallback)));
}

function parseArgs(argv) {
  const options = {
    forceMismatch: false,
  };

  for (const arg of argv) {
    if (arg === '--force-mismatch') {
      options.forceMismatch = true;
      continue;
    }

    if (arg.startsWith('--seed=')) {
      options.seed = toPositiveInteger(arg.slice('--seed='.length), 1);
      continue;
    }

    if (arg.startsWith('--max-waves=')) {
      options.maxWaves = toPositiveInteger(arg.slice('--max-waves='.length), 8);
      continue;
    }

    if (arg.startsWith('--save-after-wave=')) {
      options.saveAfterWave = toPositiveInteger(
        arg.slice('--save-after-wave='.length),
        1
      );
      continue;
    }

    throw new Error(`Unsupported argument: ${arg}`);
  }

  return options;
}

function unwrapResult(result, label) {
  if (result && result.ok) {
    return result.value;
  }

  const code = result?.error?.code ? ` (${result.error.code})` : '';
  const message = result?.error?.message || 'unknown error';
  throw new Error(`${label}${code}: ${message}`);
}

function resolveSavePoint(baseContext, requestedWave) {
  const minWave = baseContext.waveNumber;
  const maxWave = baseContext.maxWaves;
  const totalWaves = maxWave - minWave + 1;
  const defaultSaveAfterWave = minWave + Math.floor(totalWaves / 2) - 1;
  const saveAfterWave =
    requestedWave === undefined
      ? defaultSaveAfterWave
      : toPositiveInteger(requestedWave, defaultSaveAfterWave);

  if (saveAfterWave <= minWave - 1 || saveAfterWave >= maxWave) {
    throw new Error(
      `save-after-wave must be within [${minWave}, ${maxWave - 1}], got ${saveAfterWave}`
    );
  }

  return {
    saveAfterWave,
    slicesBeforeSave: saveAfterWave - minWave + 1,
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const baseContext = createLongRunChapterContext({
    runSeed: args.seed,
    maxWaves: args.maxWaves,
  });
  const savePoint = resolveSavePoint(baseContext, args.saveAfterWave);

  const baseline = unwrapResult(
    runWaveSequence({
      chapterContext: baseContext,
    }),
    'baseline run failed'
  );

  const beforeSave = unwrapResult(
    runWaveSequence({
      chapterContext: baseContext,
      maxSlices: savePoint.slicesBeforeSave,
    }),
    'pre-save run failed'
  );

  if (beforeSave.finalStatus !== 'continue' || !beforeSave.nextContext) {
    throw new Error(
      `run reached terminal status before checkpoint (status=${beforeSave.finalStatus})`
    );
  }

  const runSavePayload = createRunSaveCheckpoint({
    runId: `run_e2e_seed_${baseContext.runSeed}`,
    updatedAt: FIXED_TIMESTAMP,
    context: beforeSave.nextContext,
    completedWavePayloads: beforeSave.wavePayloads,
  });
  const serialized = serializeRunSave(runSavePayload);
  const serializedValue = unwrapResult(serialized, 'serializeRunSave failed');
  const deserialized = deserializeRunSave(serializedValue);
  const restoredSavePayload = unwrapResult(deserialized, 'deserializeRunSave failed');

  const restoredContext = restoreChapterContextFromRunSave(
    baseContext,
    restoredSavePayload
  );
  if (args.forceMismatch) {
    restoredContext.gold += 1;
  }

  const afterRestore = unwrapResult(
    runWaveSequence({
      chapterContext: restoredContext,
    }),
    'post-restore run failed'
  );

  const interruptedTrace = combineWavePayloads(
    beforeSave.wavePayloads,
    afterRestore.wavePayloads
  );
  const comparison = compareDeterministicTraces(
    baseline.wavePayloads,
    interruptedTrace
  );
  if (!comparison.match) {
    throw new Error(describeTraceComparison(comparison));
  }

  console.log(
    `[e2e smoke] matched baseline (seed=${baseContext.runSeed}, range=${baseContext.waveNumber}-${baseContext.maxWaves}, saveAfterWave=${savePoint.saveAfterWave})`
  );
}

try {
  main();
} catch (error) {
  console.error('[e2e smoke] deterministic save/reload check failed');
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
}
