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

function normalizeResult(value) {
  const result = typeof value === 'string' ? value : 'fail';
  if (result === 'clear' || result === 'fail' || result === 'quit') {
    return result;
  }

  return 'fail';
}

function buildResultViewModel(runPayload) {
  const source = isPlainObject(runPayload) ? runPayload : {};
  const summary = isPlainObject(source.summary) ? source.summary : {};
  const chapterId =
    typeof source.chapterId === 'string' && source.chapterId.length > 0
      ? source.chapterId
      : 'chapter_1';
  const reachedWave = toPositiveInteger(
    source.reachedWave ?? summary.waveNumber ?? source.waveNumber,
    1
  );
  const totalDamage = Math.max(0, toFiniteNumber(source.totalDamage ?? summary.totalDamage, 0));
  const kills = toNonNegativeInteger(source.kills ?? source.killCount ?? summary.killCount, 0);
  const leaks = toNonNegativeInteger(source.leaks ?? summary.leaks, 0);

  return {
    chapterId,
    result: normalizeResult(source.result ?? summary.status),
    runSeed: toNonNegativeInteger(source.runSeed, 0),
    reachedWave,
    totalDamage,
    kills,
    leaks,
    gateHp: Math.max(0, toFiniteNumber(source.gateHp ?? summary.gateHp, 0)),
    gold: Math.max(0, toFiniteNumber(source.gold ?? summary.gold, 0)),
  };
}

module.exports = {
  buildResultViewModel,
};
