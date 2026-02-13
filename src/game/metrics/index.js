'use strict';

const VALID_RESULTS = new Set(['clear', 'fail', 'quit']);

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function toFiniteNumber(value, fallback) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function toNonNegativeNumber(value, fallback) {
  return Math.max(0, toFiniteNumber(value, fallback));
}

function toNonNegativeInteger(value, fallback) {
  return Math.max(0, Math.floor(toFiniteNumber(value, fallback)));
}

function toPositiveInteger(value, fallback) {
  return Math.max(1, Math.floor(toFiniteNumber(value, fallback)));
}

function toUnitId(value) {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function toResult(value) {
  return VALID_RESULTS.has(value) ? value : 'fail';
}

function normalizeRelics(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  const relics = [];
  for (const relicId of value) {
    const normalized = toUnitId(relicId);
    if (normalized) {
      relics.push(normalized);
    }
  }

  return relics;
}

function cloneWaveMetric(metric) {
  return {
    waveNumber: metric.waveNumber,
    startGold: metric.startGold,
    endGold: metric.endGold,
    kills: metric.kills,
    leaks: metric.leaks,
    highestDpsUnit: metric.highestDpsUnit,
  };
}

function cloneFinalizedRun(finalizedRun) {
  return {
    runSummary: {
      reachedWave: finalizedRun.runSummary.reachedWave,
      result: finalizedRun.runSummary.result,
      relics: [...finalizedRun.runSummary.relics],
      runSeed: finalizedRun.runSummary.runSeed,
    },
    waveMetrics: finalizedRun.waveMetrics.map(cloneWaveMetric),
  };
}

function selectHighestDpsUnit(damageByUnit) {
  let bestUnitId = null;
  let bestDamage = 0;

  for (const [unitId, damage] of Object.entries(damageByUnit)) {
    if (damage > bestDamage) {
      bestUnitId = unitId;
      bestDamage = damage;
      continue;
    }

    if (damage === bestDamage && bestUnitId !== null && unitId < bestUnitId) {
      bestUnitId = unitId;
    }
  }

  return bestUnitId;
}

function parseDamageArgs(firstArg, secondArg) {
  if (isPlainObject(firstArg)) {
    return {
      unitId: toUnitId(firstArg.unitId ?? firstArg.sourceUnitId ?? firstArg.unit),
      amount: toFiniteNumber(firstArg.amount ?? firstArg.damage, 0),
    };
  }

  return {
    unitId: toUnitId(firstArg),
    amount: toFiniteNumber(secondArg, 0),
  };
}

function parseCounterIncrement(input, fallback) {
  if (isPlainObject(input)) {
    return toNonNegativeInteger(input.count, fallback);
  }

  return toNonNegativeInteger(input, fallback);
}

function resolveReachedWave(waves) {
  if (waves.length === 0) {
    return 1;
  }

  return waves[waves.length - 1].waveNumber;
}

function createRunMetricsCollector() {
  const state = {
    currentWave: null,
    waves: [],
    finalizedRun: null,
  };

  function assertMutableRun() {
    if (state.finalizedRun !== null) {
      throw new Error('RUN_ALREADY_FINALIZED');
    }
  }

  function requireActiveWave() {
    if (state.currentWave === null) {
      throw new Error('NO_ACTIVE_WAVE');
    }
  }

  function beginWave(input = {}) {
    assertMutableRun();

    if (state.currentWave !== null) {
      throw new Error('WAVE_ALREADY_ACTIVE');
    }

    const fallbackWaveNumber = state.waves.length + 1;
    state.currentWave = {
      waveNumber: toPositiveInteger(input.waveNumber ?? input.wave, fallbackWaveNumber),
      startGold: toNonNegativeNumber(input.startGold, 0),
      kills: 0,
      leaks: 0,
      damageByUnit: {},
    };
  }

  function recordDamage(firstArg, secondArg) {
    assertMutableRun();
    requireActiveWave();

    const { unitId, amount } = parseDamageArgs(firstArg, secondArg);
    if (!unitId || amount <= 0) {
      return;
    }

    const currentDamage = state.currentWave.damageByUnit[unitId] ?? 0;
    state.currentWave.damageByUnit[unitId] = currentDamage + amount;
  }

  function recordKill(input = 1) {
    assertMutableRun();
    requireActiveWave();
    state.currentWave.kills += parseCounterIncrement(input, 1);
  }

  function recordLeak(input = 1) {
    assertMutableRun();
    requireActiveWave();
    state.currentWave.leaks += parseCounterIncrement(input, 1);
  }

  function endWave(input = {}) {
    assertMutableRun();
    requireActiveWave();

    const finalizedWave = {
      waveNumber: state.currentWave.waveNumber,
      startGold: state.currentWave.startGold,
      endGold: toNonNegativeNumber(input.endGold, state.currentWave.startGold),
      kills: state.currentWave.kills,
      leaks: state.currentWave.leaks,
      highestDpsUnit: selectHighestDpsUnit(state.currentWave.damageByUnit),
    };

    state.waves.push(finalizedWave);
    state.currentWave = null;
    return cloneWaveMetric(finalizedWave);
  }

  function finalizeRun(input = {}) {
    if (state.finalizedRun !== null) {
      return cloneFinalizedRun(state.finalizedRun);
    }

    if (state.currentWave !== null) {
      throw new Error('CANNOT_FINALIZE_WITH_ACTIVE_WAVE');
    }

    const defaultReachedWave = resolveReachedWave(state.waves);
    state.finalizedRun = {
      runSummary: {
        reachedWave: toPositiveInteger(input.reachedWave ?? input.waveNumber, defaultReachedWave),
        result: toResult(input.result),
        relics: normalizeRelics(input.relics),
        runSeed: toNonNegativeInteger(input.runSeed, 0),
      },
      waveMetrics: state.waves.map(cloneWaveMetric),
    };

    return cloneFinalizedRun(state.finalizedRun);
  }

  return {
    beginWave,
    recordDamage,
    recordKill,
    recordLeak,
    endWave,
    finalizeRun,
  };
}

module.exports = {
  createRunMetricsCollector,
};
