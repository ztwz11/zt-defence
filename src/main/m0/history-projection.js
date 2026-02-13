'use strict';

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

function toNonEmptyString(value, fallback) {
  return typeof value === 'string' && value.length > 0 ? value : fallback;
}

function normalizeResult(value) {
  if (value === 'clear' || value === 'fail' || value === 'quit') {
    return value;
  }

  return 'fail';
}

function buildDefaultRunId(runSeed, reachedWave) {
  return `run_${runSeed}_${String(reachedWave).padStart(3, '0')}`;
}

function projectRunEntry(resultPayload) {
  const source = isPlainObject(resultPayload) ? resultPayload : {};
  const runSeed = toNonNegativeInteger(source.runSeed, 0);
  const reachedWave = toPositiveInteger(source.reachedWave ?? source.waveNumber, 1);
  const rewards = isPlainObject(source.metaRewards) ? source.metaRewards : {};

  return {
    runId: toNonEmptyString(source.runId, buildDefaultRunId(runSeed, reachedWave)),
    runSeed,
    chapterId: toNonEmptyString(source.chapterId, 'chapter_1'),
    reachedWave,
    result: normalizeResult(source.result ?? source.status),
    durationSec: toNonNegativeInteger(source.durationSec, 0),
    highestDpsUnitId: toNonEmptyString(source.highestDpsUnitId, 'unknown_unit'),
    metaRewards: {
      medal: toNonNegativeInteger(rewards.medal, 0),
      supply: toNonNegativeInteger(rewards.supply, 0),
    },
    finishedAt: toNonEmptyString(source.finishedAt, '1970-01-01T00:00:00.000Z'),
  };
}

module.exports = {
  projectRunEntry,
};
