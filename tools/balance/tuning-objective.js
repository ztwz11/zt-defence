'use strict';

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function toFiniteNumber(value, fallback) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function roundTo6(value) {
  const rounded = Math.round((value + Number.EPSILON) * 1000000) / 1000000;
  return Object.is(rounded, -0) ? 0 : rounded;
}

function normalizeRate(value, fallback) {
  return clamp(toFiniteNumber(value, fallback), 0, 1);
}

function normalizePositive(value, fallback) {
  return Math.max(1, toFiniteNumber(value, fallback));
}

function normalizeWeight(value, fallback) {
  return Math.max(0, toFiniteNumber(value, fallback));
}

function toNonNegativeInteger(value, fallback) {
  return Math.max(0, Math.floor(toFiniteNumber(value, fallback)));
}

const DEFAULT_TUNING_OBJECTIVE = Object.freeze({
  targetClearRate: 0.5,
  targetReachedWave: 10,
  maxFailRate: 0.25,
  weights: Object.freeze({
    clearRate: 1,
    reachedWave: 1,
    failRateOverflow: 2,
    continueRate: 0.5,
  }),
});

function normalizeTuningObjective(options) {
  const source = isPlainObject(options) ? options : {};
  const weightSource = isPlainObject(source.weights) ? source.weights : source;

  return {
    targetClearRate: roundTo6(
      normalizeRate(source.targetClearRate, DEFAULT_TUNING_OBJECTIVE.targetClearRate)
    ),
    targetReachedWave: roundTo6(
      normalizePositive(source.targetReachedWave, DEFAULT_TUNING_OBJECTIVE.targetReachedWave)
    ),
    maxFailRate: roundTo6(normalizeRate(source.maxFailRate, DEFAULT_TUNING_OBJECTIVE.maxFailRate)),
    weights: {
      clearRate: roundTo6(
        normalizeWeight(
          weightSource.clearRate ?? weightSource.clearRateDelta,
          DEFAULT_TUNING_OBJECTIVE.weights.clearRate
        )
      ),
      reachedWave: roundTo6(
        normalizeWeight(
          weightSource.reachedWave ?? weightSource.reachedWaveDeltaRatio,
          DEFAULT_TUNING_OBJECTIVE.weights.reachedWave
        )
      ),
      failRateOverflow: roundTo6(
        normalizeWeight(
          weightSource.failRateOverflow,
          DEFAULT_TUNING_OBJECTIVE.weights.failRateOverflow
        )
      ),
      continueRate: roundTo6(
        normalizeWeight(weightSource.continueRate, DEFAULT_TUNING_OBJECTIVE.weights.continueRate)
      ),
    },
  };
}

function resolveRateField(rateValue, countValue, runCount) {
  if (Number.isFinite(Number(rateValue))) {
    return normalizeRate(rateValue, 0);
  }

  if (runCount > 0 && Number.isFinite(Number(countValue))) {
    const count = Math.max(0, Number(countValue));
    return normalizeRate(count / runCount, 0);
  }

  return 0;
}

function scoreBalanceSummary(summary, objectiveOptions) {
  const target = normalizeTuningObjective(objectiveOptions);
  const source = isPlainObject(summary) ? summary : {};
  const runCount = toNonNegativeInteger(source.runCount, 0);

  const observed = {
    runCount,
    clearRate: roundTo6(resolveRateField(source.clearRate, source.clearCount, runCount)),
    reachedWave: roundTo6(
      Math.max(0, toFiniteNumber(source.reachedWaveAverage ?? source.reachedWave, 0))
    ),
    failRate: roundTo6(resolveRateField(source.failRate, source.failCount, runCount)),
    continueRate: roundTo6(
      resolveRateField(source.continueRate, source.continueCount, runCount)
    ),
  };

  const clearRateDelta = Math.abs(observed.clearRate - target.targetClearRate);
  const reachedWaveDeltaRatio =
    target.targetReachedWave > 0
      ? Math.abs(observed.reachedWave - target.targetReachedWave) / target.targetReachedWave
      : 0;
  const failRateOverflow = Math.max(0, observed.failRate - target.maxFailRate);

  const clearRatePenalty = clearRateDelta * target.weights.clearRate;
  const reachedWavePenalty = reachedWaveDeltaRatio * target.weights.reachedWave;
  const failRatePenalty = failRateOverflow * target.weights.failRateOverflow;
  const continueRatePenalty = observed.continueRate * target.weights.continueRate;
  const score = clearRatePenalty + reachedWavePenalty + failRatePenalty + continueRatePenalty;

  return {
    score: roundTo6(score),
    breakdown: {
      clearRateDelta: roundTo6(clearRateDelta),
      reachedWaveDeltaRatio: roundTo6(reachedWaveDeltaRatio),
      failRateOverflow: roundTo6(failRateOverflow),
      continueRate: roundTo6(observed.continueRate),
      clearRatePenalty: roundTo6(clearRatePenalty),
      reachedWavePenalty: roundTo6(reachedWavePenalty),
      failRatePenalty: roundTo6(failRatePenalty),
      continueRatePenalty: roundTo6(continueRatePenalty),
      totalPenalty: roundTo6(score),
    },
    target: {
      clearRate: target.targetClearRate,
      reachedWave: target.targetReachedWave,
      maxFailRate: target.maxFailRate,
      weights: { ...target.weights },
    },
    observed,
  };
}

module.exports = {
  DEFAULT_TUNING_OBJECTIVE,
  normalizeTuningObjective,
  scoreBalanceSummary,
};
