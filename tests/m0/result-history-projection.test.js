'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { buildResultViewModel } = require('../../src/main/m0/result-presenter');
const { projectRunEntry } = require('../../src/main/m0/history-projection');
const { createResultScreenModel } = require('../../src/ui/screens/result-screen-model');
const { createHistoryScreenModel } = require('../../src/ui/screens/history-screen-model');

function createRunPayload() {
  return {
    chapterId: 'chapter_1',
    runSeed: 424242,
    summary: {
      waveNumber: 5,
      status: 'fail',
      totalDamage: 321.75,
      killCount: 18,
      leaks: 2,
      gateHp: 0,
      gold: 12,
    },
  };
}

test('result presenter maps run payload to result contract fields', () => {
  const viewModel = buildResultViewModel(createRunPayload());

  assert.deepEqual(viewModel, {
    chapterId: 'chapter_1',
    result: 'fail',
    runSeed: 424242,
    reachedWave: 5,
    totalDamage: 321.75,
    kills: 18,
    leaks: 2,
    gateHp: 0,
    gold: 12,
  });
});

test('history projection produces run_history entry shape', () => {
  const resultPayload = {
    ...buildResultViewModel(createRunPayload()),
    durationSec: 621,
    highestDpsUnitId: 'archer',
    metaRewards: {
      medal: 12,
      supply: 3,
    },
    finishedAt: '2026-02-13T12:35:00Z',
  };

  const entry = projectRunEntry(resultPayload);

  assert.deepEqual(entry, {
    runId: 'run_424242_005',
    runSeed: 424242,
    chapterId: 'chapter_1',
    reachedWave: 5,
    result: 'fail',
    durationSec: 621,
    highestDpsUnitId: 'archer',
    metaRewards: {
      medal: 12,
      supply: 3,
    },
    finishedAt: '2026-02-13T12:35:00Z',
  });
});

test('screen adapters provide stable screen models', () => {
  const resultVm = buildResultViewModel(createRunPayload());
  const entry = projectRunEntry({
    ...resultVm,
    durationSec: 100,
    highestDpsUnitId: 'archer',
    finishedAt: '2026-02-13T12:35:00Z',
  });

  const resultScreen = createResultScreenModel(resultVm);
  const historyScreen = createHistoryScreenModel([entry]);

  assert.deepEqual(resultScreen, {
    screenId: 'Result',
    result: 'fail',
    runSeed: 424242,
    stats: {
      reachedWave: 5,
      totalDamage: 321.75,
      kills: 18,
      leaks: 2,
      gateHp: 0,
      gold: 12,
    },
  });

  assert.deepEqual(historyScreen, {
    screenId: 'History',
    totalEntries: 1,
    entries: [entry],
  });
});
