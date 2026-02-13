'use strict';

function toFiniteNumber(value, fallback) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function toNonNegativeInteger(value, fallback) {
  return Math.max(0, Math.floor(toFiniteNumber(value, fallback)));
}

function createResultScreenModel(resultVm) {
  const source = resultVm && typeof resultVm === 'object' ? resultVm : {};

  return {
    screenId: 'Result',
    result: typeof source.result === 'string' ? source.result : 'fail',
    runSeed: toNonNegativeInteger(source.runSeed, 0),
    stats: {
      reachedWave: Math.max(1, toNonNegativeInteger(source.reachedWave, 1)),
      totalDamage: Math.max(0, toFiniteNumber(source.totalDamage, 0)),
      kills: toNonNegativeInteger(source.kills, 0),
      leaks: toNonNegativeInteger(source.leaks, 0),
      gateHp: Math.max(0, toFiniteNumber(source.gateHp, 0)),
      gold: Math.max(0, toFiniteNumber(source.gold, 0)),
    },
  };
}

module.exports = {
  createResultScreenModel,
};
