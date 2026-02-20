'use strict';

const { createUiTextBundle, normalizeUiLocale } = require('../localization');

function toFiniteNumber(value, fallback) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function toNonNegativeInteger(value, fallback) {
  return Math.max(0, Math.floor(toFiniteNumber(value, fallback)));
}

function resolveUiLocale(options) {
  if (typeof options === 'string') {
    return normalizeUiLocale(options);
  }

  if (!options || typeof options !== 'object' || Array.isArray(options)) {
    return normalizeUiLocale(undefined);
  }

  return normalizeUiLocale(options.locale);
}

function createResultScreenModel(resultVm, options) {
  const source = resultVm && typeof resultVm === 'object' ? resultVm : {};
  const locale = resolveUiLocale(options);
  const textBundle = createUiTextBundle(locale);

  return {
    locale,
    screenId: 'Result',
    screenLabel: textBundle.screens.result,
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
