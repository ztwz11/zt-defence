'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  CHAPTER_PRESETS,
  resolveChapterPreset,
  buildBalanceChapterContext,
} = require('../../tools/balance/chapter-presets');

test('resolveChapterPreset selects known chapter and falls back to chapter_1', () => {
  assert.equal(resolveChapterPreset('chapter_2'), CHAPTER_PRESETS.chapter_2);
  assert.equal(resolveChapterPreset('unknown_chapter'), CHAPTER_PRESETS.chapter_1);
});

test('buildBalanceChapterContext uses chapter_2 preset values', () => {
  const context = buildBalanceChapterContext({
    chapterId: 'chapter_2',
    waveMax: 20,
    runSeed: 2026,
  });

  assert.equal(context.chapterId, 'chapter_2');
  assert.equal(context.waveNumber, 1);
  assert.equal(context.maxWaves, 20);
  assert.equal(context.runSeed, 2026);
  assert.equal(context.gateHp, 20);
  assert.equal(context.maxGateHp, 20);
  assert.equal(context.gold, 6);
  assert.equal(context.economyConfig.waveStartGold, 3);
  assert.equal(context.economyConfig.waveClearBonusGold, 4);
  assert.equal(context.economyConfig.costs.summon, 4);
  assert.equal(context.simulation.enemyCatalog.raider_goblin.hp, 24);
  assert.equal(context.simulation.enemyCatalog.orc_brute.hp, 58);
  assert.equal(context.simulation.spawnEvents[0].enemyId, 'raider_goblin');
});

test('buildBalanceChapterContext returns deep-cloned chapter preset values', () => {
  const context = buildBalanceChapterContext({
    chapterId: 'chapter_2',
  });

  context.economyConfig.costs.summon = 999;
  context.simulation.enemyCatalog.raider_goblin.hp = 999;
  context.rewards[0].amount = 999;

  assert.equal(CHAPTER_PRESETS.chapter_2.economyConfig.costs.summon, 4);
  assert.equal(CHAPTER_PRESETS.chapter_2.simulation.enemyCatalog.raider_goblin.hp, 24);
  assert.equal(CHAPTER_PRESETS.chapter_2.rewards[0].amount, 2);
});
