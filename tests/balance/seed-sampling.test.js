'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { runBalanceSimulation } = require('../../tools/balance/balance-sim');
const {
  normalizeSeedSamplingOptions,
  sampleRunSeeds,
} = require('../../tools/balance/seed-sampler');

test('sampleRunSeeds is deterministic for the same inputs', () => {
  const options = {
    seedCount: 5,
    baseSeed: 11,
    seedStride: 7,
  };

  const runA = sampleRunSeeds(options);
  const runB = sampleRunSeeds(options);
  assert.deepEqual(runA, [11, 18, 25, 32, 39]);
  assert.deepEqual(runA, runB);
});

test('normalizeSeedSamplingOptions clamps invalid values', () => {
  const normalized = normalizeSeedSamplingOptions({
    seedCount: 'not-a-number',
    baseSeed: -15,
    stride: 0,
  });

  assert.deepEqual(normalized, {
    seedCount: 1,
    baseSeed: 0,
    stride: 1,
  });
});

test('runBalanceSimulation reuses deterministic sampled seeds in run order', () => {
  const seenSeeds = [];
  const simulation = runBalanceSimulation({
    chapterId: 'chapter_1',
    seedCount: 4,
    baseSeed: 3,
    seedStride: 9,
    waveMax: 2,
    buildChapterContext(input) {
      return {
        chapterId: input.chapterId,
        runSeed: input.runSeed,
        waveNumber: 1,
        maxWaves: input.waveMax,
      };
    },
    sessionCoordinator: {
      runSession(chapterContext) {
        seenSeeds.push(chapterContext.runSeed);
        return {
          ok: true,
          value: {
            reachedWave: chapterContext.maxWaves,
            finalStatus: 'clear',
            wavePayloads: [],
          },
        };
      },
    },
  });

  assert.deepEqual(simulation.seeds, [3, 12, 21, 30]);
  assert.deepEqual(seenSeeds, [3, 12, 21, 30]);
});
