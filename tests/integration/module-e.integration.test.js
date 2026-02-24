'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { RUN_PHASE } = require('../../src/game/run');
const { createRunOrchestrationService } = require('../../src/main');
const { createRunStateStore } = require('../../src/ui');

function createChapterContext() {
  return {
    chapterId: 'chapter_1',
    runSeed: 424242,
    waveNumber: 2,
    maxWaves: 5,
    gateHp: 20,
    maxGateHp: 20,
    gold: 5,
    economyConfig: {
      waveStartGold: 2,
      waveClearBonusGold: 3,
      interest: {
        enabled: false,
      },
      costs: {
        summon: 4,
        reroll: {
          base: 2,
          increasePerUse: 1,
        },
      },
    },
    rewards: [{ type: 'Gold', amount: 4 }],
    simulation: {
      tickSeconds: 0.5,
      durationSeconds: 5,
      spawnEvents: [{ time: 0, enemyId: 'goblin', count: 1, interval: 0 }],
      enemyCatalog: {
        goblin: {
          hp: 8,
          armor: 0,
          resist: 0,
          moveSpeed: 0.1,
        },
      },
      units: [
        {
          id: 'archer_1',
          atk: 10,
          atkSpeed: 1.5,
          damageType: 'physical',
          targeting: 'frontMost',
          critChance: 0,
          critMultiplier: 1.5,
        },
      ],
    },
  };
}

test('phase transitions follow the run phase contract helpers', () => {
  const store = createRunStateStore({
    phase: RUN_PHASE.PREPARE,
    waveNumber: 1,
    gateHp: 20,
    gold: 5,
    summonCost: 4,
    rerollCost: 2,
  });

  assert.equal(store.enterReward().ok, false);
  assert.equal(store.getState().phase, RUN_PHASE.PREPARE);

  assert.equal(store.enterCombat().ok, true);
  assert.equal(store.getState().phase, RUN_PHASE.COMBAT);

  assert.equal(store.enterBossIntro().ok, true);
  assert.equal(store.getState().phase, RUN_PHASE.BOSS_INTRO);

  assert.equal(store.enterCombat().ok, true);
  assert.equal(store.enterReward().ok, true);
  assert.equal(store.enterPrepare().ok, true);

  assert.equal(store.enterCombat().ok, true);
  assert.equal(store.enterResult().ok, true);
  assert.equal(store.getState().phase, RUN_PHASE.RESULT);

  assert.equal(store.enterPrepare().ok, true);
  assert.equal(store.getState().phase, RUN_PHASE.PREPARE);
});

test('HUD bindings reflect state updates', () => {
  const store = createRunStateStore({
    phase: RUN_PHASE.PREPARE,
    waveNumber: 3,
    gateHp: 18,
    gold: 9,
    summonCost: 4,
    rerollCost: 2,
    synergyCounts: [{ synergyId: 'syn_knights', count: 2 }],
    relics: ['relic_bonus_gold'],
  });

  const initialHud = store.getHudViewModel();
  assert.equal(initialHud.ok, true);
  assert.deepEqual(initialHud.value, {
    locale: 'en',
    gold: 9,
    wave: 3,
    gateHp: 18,
    phase: 'Prepare',
    phaseLabel: 'Prepare',
    summonCost: 4,
    rerollCost: 2,
    synergyCounts: [{ synergyId: 'syn_knights', count: 2 }],
    relics: ['relic_bonus_gold'],
    optionLabels: {
      locale: 'en',
      hudActions: {
        summon: 'Summon',
        reroll: 'Reroll',
      },
      hudOptions: {
        timer: 'Timer',
        speed: 'Speed',
      },
      settings: {
        sfx: 'Sound',
        vibration: 'Vibration',
        lowFxMode: 'Low FX Mode',
      },
    },
  });

  const update = store.setState({
    gold: 15,
    waveNumber: 4,
    gateHp: 17,
    synergyCounts: [{ synergyId: 'syn_knights', count: 3 }],
  });
  assert.equal(update.ok, true);

  const updatedHud = store.getHudViewModel();
  assert.equal(updatedHud.ok, true);
  assert.equal(updatedHud.value.gold, 15);
  assert.equal(updatedHud.value.wave, 4);
  assert.equal(updatedHud.value.gateHp, 17);
  assert.equal(updatedHud.value.phaseLabel, 'Prepare');
  assert.deepEqual(updatedHud.value.synergyCounts, [{ synergyId: 'syn_knights', count: 3 }]);

  updatedHud.value.relics.push('mutated');
  const hudAfterMutation = store.getHudViewModel();
  assert.deepEqual(hudAfterMutation.value.relics, ['relic_bonus_gold']);

  store.setLocale('ko');
  const koreanHud = store.getHudViewModel();
  assert.equal(koreanHud.value.locale, 'ko');
  assert.equal(koreanHud.value.phaseLabel, '준비');
  assert.equal(koreanHud.value.optionLabels.settings.sfx, '사운드');
});

test('run slice returns deterministic output for identical seed and context', () => {
  const service = createRunOrchestrationService();
  const context = createChapterContext();

  const runA = service.runWaveSlice(context);
  const runB = service.runWaveSlice(context);

  assert.equal(runA.ok, true);
  assert.equal(runB.ok, true);
  assert.deepEqual(runA.value, runB.value);

  assert.equal(runA.value.runSeed, 424242);
  assert.equal(runA.value.summary.status, 'continue');
  assert.equal(runA.value.summary.cleared, true);
  assert.equal(runA.value.phase, 'Prepare');
  assert.equal(runA.value.hud.gold, 14);
  assert.equal(runA.value.hud.wave, 3);
  assert.ok(runA.value.render.frames.length > 0);
  assert.equal(runA.value.render.runtimeUnitVisualMap.archer_1.unitId, 'archer');
});
