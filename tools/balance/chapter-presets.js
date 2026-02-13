'use strict';

function toFiniteNumber(value, fallback) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function toPositiveInteger(value, fallback) {
  return Math.max(1, Math.floor(toFiniteNumber(value, fallback)));
}

function toNonNegativeNumber(value, fallback) {
  return Math.max(0, toFiniteNumber(value, fallback));
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

const CHAPTER_PRESETS = Object.freeze({
  chapter_1: Object.freeze({
    gateHp: 20,
    maxGateHp: 20,
    gold: 6,
    economyConfig: Object.freeze({
      waveStartGold: 3,
      waveClearBonusGold: 4,
      interest: Object.freeze({
        enabled: false,
      }),
      costs: Object.freeze({
        summon: 4,
        reroll: Object.freeze({
          base: 2,
          increasePerUse: 1,
        }),
      }),
    }),
    rewards: Object.freeze([
      Object.freeze({
        type: 'Gold',
        amount: 2,
      }),
    ]),
    simulation: Object.freeze({
      tickSeconds: 0.25,
      durationSeconds: 10,
      spawnEvents: Object.freeze([
        Object.freeze({
          time: 0,
          enemyId: 'goblin',
          count: 5,
          interval: 0.6,
        }),
        Object.freeze({
          time: 2.2,
          enemyId: 'goblin_elite',
          count: 1,
          interval: 0,
        }),
      ]),
      enemyCatalog: Object.freeze({
        goblin: Object.freeze({
          hp: 24,
          armor: 2,
          resist: 0,
          moveSpeed: 0.16,
        }),
        goblin_elite: Object.freeze({
          hp: 58,
          armor: 8,
          resist: 4,
          moveSpeed: 0.14,
        }),
      }),
      units: Object.freeze([
        Object.freeze({
          id: 'archer_1',
          atk: 17,
          atkSpeed: 1.3,
          damageType: 'physical',
          targeting: 'random',
          critChance: 0.25,
          critMultiplier: 1.7,
        }),
        Object.freeze({
          id: 'mage_1',
          atk: 9,
          atkSpeed: 1,
          damageType: 'magic',
          targeting: 'frontMost',
          critChance: 0.1,
          critMultiplier: 1.6,
          onHitStatuses: Object.freeze([
            Object.freeze({
              statusId: 'burn',
              chance: 0.35,
              duration: 2.5,
              potency: 2,
            }),
          ]),
        }),
      ]),
    }),
  }),
});

function resolveChapterPreset(chapterId) {
  if (typeof chapterId === 'string' && CHAPTER_PRESETS[chapterId]) {
    return CHAPTER_PRESETS[chapterId];
  }
  return CHAPTER_PRESETS.chapter_1;
}

function buildBalanceChapterContext(options) {
  const source = options && typeof options === 'object' ? options : {};
  const chapterId =
    typeof source.chapterId === 'string' && source.chapterId.length > 0
      ? source.chapterId
      : 'chapter_1';
  const preset = resolveChapterPreset(chapterId);
  const maxWaves = toPositiveInteger(source.waveMax ?? source.maxWaves, 20);
  const runSeed = Math.floor(toFiniteNumber(source.runSeed, 1));

  return {
    chapterId,
    runSeed,
    waveNumber: 1,
    maxWaves,
    gateHp: toNonNegativeNumber(source.gateHp, preset.gateHp),
    maxGateHp: toNonNegativeNumber(source.maxGateHp, preset.maxGateHp),
    gold: toNonNegativeNumber(source.gold, preset.gold),
    relics: Array.isArray(source.relics) ? source.relics.slice() : [],
    synergyCounts: Array.isArray(source.synergyCounts) ? source.synergyCounts.slice() : [],
    economyConfig: cloneJson(preset.economyConfig),
    rewards: cloneJson(preset.rewards),
    simulation: cloneJson(preset.simulation),
  };
}

module.exports = {
  CHAPTER_PRESETS,
  resolveChapterPreset,
  buildBalanceChapterContext,
};
