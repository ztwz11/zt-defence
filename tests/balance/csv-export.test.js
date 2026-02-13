'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { toRunRowsCsv } = require('../../tools/balance/csv-export');

test('toRunRowsCsv serializes rows and escapes csv special chars', () => {
  const csv = toRunRowsCsv(
    [
      {
        runIndex: 1,
        seed: 42,
        chapterId: 'chapter_1',
        reachedWave: 5,
        finalStatus: 'clear',
        clear: 1,
        fail: 0,
        waveCount: 5,
        kills: 20,
        damage: 55.25,
      },
      {
        runIndex: 2,
        seed: 99,
        chapterId: 'chapter_1,hard',
        reachedWave: 3,
        finalStatus: 'fail',
        clear: 0,
        fail: 1,
        waveCount: 3,
        kills: 9,
        damage: '12 "burst"',
      },
    ],
    ['runIndex', 'seed', 'chapterId', 'finalStatus', 'damage']
  );

  assert.equal(
    csv,
    [
      'runIndex,seed,chapterId,finalStatus,damage',
      '1,42,chapter_1,clear,55.25',
      '2,99,"chapter_1,hard",fail,"12 ""burst"""',
      '',
    ].join('\n')
  );
});
