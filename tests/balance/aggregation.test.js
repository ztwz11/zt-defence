'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  aggregateRunRows,
  createRunRowFromSession,
  summarizeWavePayloads,
} = require('../../tools/balance/balance-sim');

test('summarizeWavePayloads aggregates kill and damage totals from wave summaries', () => {
  const summary = summarizeWavePayloads([
    {
      summary: {
        killCount: 2,
        totalDamage: 7.5,
      },
    },
    {
      summary: {
        killCount: 4,
        totalDamage: 12.3456,
      },
    },
    {
      summary: {},
    },
  ]);

  assert.deepEqual(summary, {
    waveCount: 3,
    kills: 6,
    damage: 19.8456,
  });
});

test('createRunRowFromSession builds expected per-run row shape', () => {
  const row = createRunRowFromSession(
    {
      reachedWave: 5,
      finalStatus: 'clear',
      wavePayloads: [
        {
          summary: {
            killCount: 3,
            totalDamage: 10,
          },
        },
        {
          summary: {
            killCount: 7,
            totalDamage: 18.75,
          },
        },
      ],
    },
    {
      runIndex: 8,
      seed: 12345,
      chapterId: 'chapter_1',
    }
  );

  assert.deepEqual(row, {
    runIndex: 8,
    seed: 12345,
    chapterId: 'chapter_1',
    reachedWave: 5,
    finalStatus: 'clear',
    clear: 1,
    fail: 0,
    waveCount: 2,
    kills: 10,
    damage: 28.75,
  });
});

test('aggregateRunRows computes average reached wave and outcome rates', () => {
  const aggregation = aggregateRunRows([
    {
      reachedWave: 6,
      finalStatus: 'clear',
      kills: 30,
      damage: 120.5,
    },
    {
      reachedWave: 4,
      finalStatus: 'fail',
      kills: 18,
      damage: 70,
    },
    {
      reachedWave: 5,
      finalStatus: 'continue',
      kills: null,
      damage: null,
    },
  ]);

  assert.deepEqual(aggregation, {
    runCount: 3,
    reachedWaveAverage: 5,
    clearCount: 1,
    failCount: 1,
    continueCount: 1,
    clearRate: 0.333333,
    failRate: 0.333333,
    averageKills: 24,
    averageDamage: 95.25,
  });
});
