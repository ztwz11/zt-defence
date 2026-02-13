'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { createRunMetricsCollector } = require('../../src/game/metrics');

test('collector aggregates wave metrics and run summary', () => {
  const collector = createRunMetricsCollector();

  collector.beginWave({ waveNumber: 1, startGold: 10 });
  collector.recordDamage({ unitId: 'archer', amount: 11.5 });
  collector.recordDamage('mage', 3);
  collector.recordDamage('archer', 4.5);
  collector.recordKill();
  collector.recordKill({ count: 2 });
  collector.recordLeak();

  const wave = collector.endWave({ endGold: 17 });
  assert.deepEqual(wave, {
    waveNumber: 1,
    startGold: 10,
    endGold: 17,
    kills: 3,
    leaks: 1,
    highestDpsUnit: 'archer',
  });

  const run = collector.finalizeRun({
    reachedWave: 1,
    result: 'clear',
    relics: ['relic_bonus_gold', 'relic_freeze'],
    runSeed: 314159,
  });

  assert.deepEqual(run, {
    runSummary: {
      reachedWave: 1,
      result: 'clear',
      relics: ['relic_bonus_gold', 'relic_freeze'],
      runSeed: 314159,
    },
    waveMetrics: [
      {
        waveNumber: 1,
        startGold: 10,
        endGold: 17,
        kills: 3,
        leaks: 1,
        highestDpsUnit: 'archer',
      },
    ],
  });
});

test('collector keeps stable shape when there is zero damage and no kills', () => {
  const collector = createRunMetricsCollector();

  collector.beginWave({ waveNumber: 3, startGold: 9 });
  collector.recordDamage({ unitId: 'archer', amount: 0 });
  collector.recordDamage({ unitId: 'mage', amount: -10 });
  collector.recordDamage({ unitId: '', amount: 25 });
  collector.endWave({ endGold: 4 });

  const run = collector.finalizeRun({
    reachedWave: 3,
    result: 'fail',
    relics: [],
    runSeed: 7,
  });

  assert.deepEqual(run, {
    runSummary: {
      reachedWave: 3,
      result: 'fail',
      relics: [],
      runSeed: 7,
    },
    waveMetrics: [
      {
        waveNumber: 3,
        startGold: 9,
        endGold: 4,
        kills: 0,
        leaks: 0,
        highestDpsUnit: null,
      },
    ],
  });
});

test('collector handles multiple waves and deterministic highest dps tie-break', () => {
  const collector = createRunMetricsCollector();

  collector.beginWave({ waveNumber: 1, startGold: 3 });
  collector.recordDamage('zeta', 5);
  collector.recordDamage('alpha', 5);
  collector.recordKill();
  collector.endWave({ endGold: 8 });

  collector.beginWave({ waveNumber: 2, startGold: 8 });
  collector.recordDamage('beta', 2);
  collector.recordKill({ count: 2 });
  collector.recordKill(1);
  collector.recordLeak({ count: 2 });
  collector.endWave({ endGold: 6 });

  const run = collector.finalizeRun({
    result: 'clear',
    relics: [' relic_a ', '', 1, 'relic_b'],
    runSeed: '42',
  });

  assert.deepEqual(Object.keys(run), ['runSummary', 'waveMetrics']);
  assert.deepEqual(Object.keys(run.runSummary), ['reachedWave', 'result', 'relics', 'runSeed']);
  assert.deepEqual(Object.keys(run.waveMetrics[0]), [
    'waveNumber',
    'startGold',
    'endGold',
    'kills',
    'leaks',
    'highestDpsUnit',
  ]);

  assert.deepEqual(run, {
    runSummary: {
      reachedWave: 2,
      result: 'clear',
      relics: ['relic_a', 'relic_b'],
      runSeed: 42,
    },
    waveMetrics: [
      {
        waveNumber: 1,
        startGold: 3,
        endGold: 8,
        kills: 1,
        leaks: 0,
        highestDpsUnit: 'alpha',
      },
      {
        waveNumber: 2,
        startGold: 8,
        endGold: 6,
        kills: 3,
        leaks: 2,
        highestDpsUnit: 'beta',
      },
    ],
  });
});
