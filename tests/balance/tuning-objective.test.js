'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  normalizeTuningObjective,
  scoreBalanceSummary,
} = require('../../tools/balance/tuning-objective');

test('normalizeTuningObjective clamps invalid objective values', () => {
  const normalized = normalizeTuningObjective({
    targetClearRate: 2,
    targetReachedWave: -5,
    maxFailRate: -1,
    weights: {
      clearRate: -2,
      reachedWave: 'invalid',
      failRateOverflow: Infinity,
      continueRate: -0.5,
    },
  });

  assert.deepEqual(normalized, {
    targetClearRate: 1,
    targetReachedWave: 1,
    maxFailRate: 0,
    weights: {
      clearRate: 0,
      reachedWave: 1,
      failRateOverflow: 2,
      continueRate: 0,
    },
  });
});

test('scoreBalanceSummary returns lower scores for summaries closer to target', () => {
  const objective = normalizeTuningObjective({
    targetClearRate: 0.6,
    targetReachedWave: 20,
    maxFailRate: 0.25,
    weights: {
      clearRate: 1,
      reachedWave: 1,
      failRateOverflow: 2,
      continueRate: 0.5,
    },
  });

  const closer = scoreBalanceSummary(
    {
      runCount: 100,
      clearRate: 0.58,
      reachedWaveAverage: 19.2,
      failRate: 0.2,
      continueRate: 0.08,
    },
    objective
  );

  const farther = scoreBalanceSummary(
    {
      runCount: 100,
      clearRate: 0.25,
      reachedWaveAverage: 11,
      failRate: 0.55,
      continueRate: 0.28,
    },
    objective
  );

  assert.ok(closer.score < farther.score);
});

test('scoreBalanceSummary applies fail-rate overflow and continue-rate penalties', () => {
  const scored = scoreBalanceSummary(
    {
      runCount: 20,
      clearRate: 0.5,
      reachedWaveAverage: 10,
      failRate: 0.4,
      continueRate: 0.25,
    },
    {
      targetClearRate: 0.5,
      targetReachedWave: 10,
      maxFailRate: 0.1,
      weights: {
        clearRate: 0,
        reachedWave: 0,
        failRateOverflow: 3,
        continueRate: 2,
      },
    }
  );

  assert.deepEqual(scored.breakdown, {
    clearRateDelta: 0,
    reachedWaveDeltaRatio: 0,
    failRateOverflow: 0.3,
    continueRate: 0.25,
    clearRatePenalty: 0,
    reachedWavePenalty: 0,
    failRatePenalty: 0.9,
    continueRatePenalty: 0.5,
    totalPenalty: 1.4,
  });
  assert.equal(scored.score, 1.4);
});

test('scoreBalanceSummary handles missing summary fields safely', () => {
  const scored = scoreBalanceSummary({}, undefined);

  assert.deepEqual(scored.target, {
    clearRate: 0.5,
    reachedWave: 10,
    maxFailRate: 0.25,
    weights: {
      clearRate: 1,
      reachedWave: 1,
      failRateOverflow: 2,
      continueRate: 0.5,
    },
  });

  assert.deepEqual(scored.observed, {
    runCount: 0,
    clearRate: 0,
    reachedWave: 0,
    failRate: 0,
    continueRate: 0,
  });

  assert.deepEqual(scored.breakdown, {
    clearRateDelta: 0.5,
    reachedWaveDeltaRatio: 1,
    failRateOverflow: 0,
    continueRate: 0,
    clearRatePenalty: 0.5,
    reachedWavePenalty: 1,
    failRatePenalty: 0,
    continueRatePenalty: 0,
    totalPenalty: 1.5,
  });
  assert.equal(scored.score, 1.5);
});
