'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  DEFAULT_CHAPTER_PRESETS_PATH,
  CHAPTER_PRESET_REGISTRY,
  CHAPTER_PRESETS,
  loadChapterPresetRegistry,
  resolveChapterPreset,
  buildBalanceChapterContext,
} = require('../../tools/balance/chapter-presets');

test('default chapter preset registry is loaded from content/chapter-presets.json', () => {
  assert.match(
    DEFAULT_CHAPTER_PRESETS_PATH.replaceAll('\\', '/'),
    /\/content\/chapter-presets\.json$/
  );
  assert.equal(CHAPTER_PRESET_REGISTRY.defaultChapterId, 'chapter_1');
  assert.equal(CHAPTER_PRESET_REGISTRY.sourcePath, DEFAULT_CHAPTER_PRESETS_PATH);
});

test('resolveChapterPreset selects known chapter and falls back to chapter_1', () => {
  assert.equal(resolveChapterPreset('chapter_2'), CHAPTER_PRESETS.chapter_2);
  assert.equal(resolveChapterPreset('chapter_3'), CHAPTER_PRESETS.chapter_3);
  assert.equal(resolveChapterPreset('unknown_chapter'), CHAPTER_PRESETS.chapter_1);
});

test('loadChapterPresetRegistry supports dependency injection for file reads', () => {
  const registry = loadChapterPresetRegistry({
    path: 'C:/virtual/content/chapter-presets.json',
    readFileSync(filePath) {
      assert.equal(filePath, 'C:/virtual/content/chapter-presets.json');
      return JSON.stringify({
        version: '9.9.9',
        defaultChapterId: 'chapter_custom',
        chapters: {
          chapter_custom: {
            gateHp: 30,
            maxGateHp: 30,
            gold: 7,
            economyConfig: {
              waveStartGold: 4,
              waveClearBonusGold: 4,
              interest: { enabled: false },
              costs: {
                summon: 3,
                reroll: { base: 2, increasePerUse: 1 },
              },
            },
            rewards: [{ type: 'Gold', amount: 1 }],
            simulation: {
              tickSeconds: 0.25,
              durationSeconds: 8,
              spawnEvents: [{ time: 0, enemyId: 'goblin', count: 1, interval: 0 }],
              enemyCatalog: {
                goblin: {
                  hp: 20,
                  armor: 0,
                  resist: 0,
                  moveSpeed: 0.2,
                },
              },
              units: [],
            },
          },
        },
      });
    },
  });

  assert.equal(registry.version, '9.9.9');
  assert.equal(registry.defaultChapterId, 'chapter_custom');
  assert.equal(registry.sourcePath, 'C:/virtual/content/chapter-presets.json');
  assert.equal(registry.chapters.chapter_custom.gateHp, 30);
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

test('buildBalanceChapterContext uses chapter_3 preset values', () => {
  const context = buildBalanceChapterContext({
    chapterId: 'chapter_3',
    waveMax: 20,
    runSeed: 2028,
  });

  assert.equal(context.chapterId, 'chapter_3');
  assert.equal(context.waveNumber, 1);
  assert.equal(context.maxWaves, 20);
  assert.equal(context.runSeed, 2028);
  assert.equal(context.gateHp, 20);
  assert.equal(context.maxGateHp, 20);
  assert.equal(context.gold, 6);
  assert.equal(context.economyConfig.waveStartGold, 3);
  assert.equal(context.economyConfig.waveClearBonusGold, 4);
  assert.equal(context.economyConfig.costs.summon, 4);
  assert.equal(context.simulation.enemyCatalog.shadow_raider.hp, 30);
  assert.equal(context.simulation.enemyCatalog.dread_guard.hp, 72);
  assert.equal(context.simulation.enemyCatalog.hex_oracle.hp, 56);
  assert.equal(context.simulation.spawnEvents[0].enemyId, 'shadow_raider');
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
