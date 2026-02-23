'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { buildBalanceChapterContext } = require('../../tools/balance/chapter-presets');
const {
  AUTO_TUNE_REPORT_VERSION,
  applyCandidateToChapterContext,
  generateSearchCandidates,
  runAutoTune,
} = require('../../tools/balance/auto-tune');

test('generateSearchCandidates is deterministic with the same search seed', () => {
  const options = {
    searchSeed: 2026,
    candidateCount: 10,
  };

  const runA = generateSearchCandidates(options);
  const runB = generateSearchCandidates(options);

  assert.equal(runA.length, 10);
  assert.deepEqual(runA, runB);
  assert.ok(runA.every((candidate) => Number.isFinite(candidate.waveStartGold)));
  assert.ok(runA.every((candidate) => Number.isFinite(candidate.waveClearBonusGold)));
  assert.ok(runA.every((candidate) => Number.isFinite(candidate.summonCost)));
  assert.ok(runA.every((candidate) => Number.isFinite(candidate.goblinHpScale)));
  assert.ok(runA.every((candidate) => Number.isFinite(candidate.goblinEliteHpScale)));
});

test('applyCandidateToChapterContext updates only target economy/enemy fields on a clone', () => {
  const baseContext = buildBalanceChapterContext({
    chapterId: 'chapter_1',
    waveMax: 6,
    runSeed: 77,
  });
  const baseSnapshot = JSON.parse(JSON.stringify(baseContext));

  const tunedContext = applyCandidateToChapterContext(baseContext, {
    waveStartGold: 7,
    waveClearBonusGold: 11,
    summonCost: 2,
    goblinHpScale: 1.5,
    goblinEliteHpScale: 0.5,
  });

  assert.notStrictEqual(tunedContext, baseContext);
  assert.deepEqual(baseContext, baseSnapshot);

  assert.equal(tunedContext.economyConfig.waveStartGold, 7);
  assert.equal(tunedContext.economyConfig.waveClearBonusGold, 11);
  assert.equal(tunedContext.economyConfig.costs.summon, 2);
  assert.equal(tunedContext.simulation.enemyCatalog.goblin.hp, 36);
  assert.equal(tunedContext.simulation.enemyCatalog.goblin_elite.hp, 29);

  assert.equal(tunedContext.gateHp, baseContext.gateHp);
  assert.equal(tunedContext.gold, baseContext.gold);
  assert.equal(
    tunedContext.economyConfig.costs.reroll.base,
    baseContext.economyConfig.costs.reroll.base
  );
  assert.equal(
    tunedContext.simulation.enemyCatalog.goblin.armor,
    baseContext.simulation.enemyCatalog.goblin.armor
  );
  assert.deepEqual(tunedContext.simulation.units, baseContext.simulation.units);
});

test('applyCandidateToChapterContext scales chapter_2 enemy targets', () => {
  const baseContext = buildBalanceChapterContext({
    chapterId: 'chapter_2',
    waveMax: 6,
    runSeed: 77,
  });
  const baseSnapshot = JSON.parse(JSON.stringify(baseContext));

  const tunedContext = applyCandidateToChapterContext(baseContext, {
    goblinHpScale: 1.5,
    goblinEliteHpScale: 0.5,
  });

  assert.notStrictEqual(tunedContext, baseContext);
  assert.deepEqual(baseContext, baseSnapshot);
  assert.equal(tunedContext.simulation.enemyCatalog.raider_goblin.hp, 36);
  assert.equal(tunedContext.simulation.enemyCatalog.orc_brute.hp, 29);
  assert.equal(tunedContext.simulation.enemyCatalog.hex_shaman.hp, 44);
});

test('applyCandidateToChapterContext scales chapter_3 enemy targets', () => {
  const baseContext = buildBalanceChapterContext({
    chapterId: 'chapter_3',
    waveMax: 6,
    runSeed: 77,
  });
  const baseSnapshot = JSON.parse(JSON.stringify(baseContext));

  const tunedContext = applyCandidateToChapterContext(baseContext, {
    goblinHpScale: 1.5,
    goblinEliteHpScale: 0.5,
  });

  assert.notStrictEqual(tunedContext, baseContext);
  assert.deepEqual(baseContext, baseSnapshot);
  assert.equal(tunedContext.simulation.enemyCatalog.shadow_raider.hp, 45);
  assert.equal(tunedContext.simulation.enemyCatalog.dread_guard.hp, 36);
  assert.equal(tunedContext.simulation.enemyCatalog.hex_oracle.hp, 56);
});

test('runAutoTune ranks candidates and selects best candidate with injected stubs', () => {
  const seenSeedBatches = [];
  const fixedSeeds = [13, 31, 49];
  const result = runAutoTune({
    seeds: fixedSeeds,
    searchSeed: 99,
    candidateCount: 7,
    parameterSpace: {
      waveStartGold: {
        values: [2, 6, 10],
      },
      waveClearBonusGold: {
        values: [3],
      },
      summonCost: {
        values: [4],
      },
      goblinHpScale: {
        values: [1],
      },
      goblinEliteHpScale: {
        values: [1],
      },
    },
    runSimulation(simulationOptions) {
      seenSeedBatches.push(simulationOptions.seeds.slice());
      const candidate = simulationOptions.candidate || {};
      return {
        options: {
          seedCount: simulationOptions.seeds.length,
        },
        summary: {
          scoreMarker: Number(candidate.waveStartGold || 0),
        },
      };
    },
    scoreBalanceSummary(summary) {
      return Math.abs(summary.scoreMarker - 6);
    },
  });

  assert.equal(result.reportVersion, AUTO_TUNE_REPORT_VERSION);
  assert.deepEqual(result.objective, result.options.objective);
  assert.deepEqual(result.seeds, fixedSeeds);
  assert.equal(result.rankedCandidates.length, 4);
  assert.equal(result.bestCandidate.isBaseline, false);
  assert.equal(result.bestCandidate.candidate.waveStartGold, 6);
  assert.equal(result.bestCandidate.score, 0);
  assert.equal(result.rankedCandidates[0].rank, 1);

  const uniqueSeedBatchCount = new Set(
    seenSeedBatches.map((seedBatch) => JSON.stringify(seedBatch))
  ).size;
  assert.equal(uniqueSeedBatchCount, 1);
  assert.equal(seenSeedBatches.length, result.rankedCandidates.length);
});
