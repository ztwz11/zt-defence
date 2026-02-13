'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  RUN_PHASE,
  RUN_PHASE_VALUES,
  canTransitionRunPhase,
  createRunState,
  getHudBindings,
  isRunPhase,
  transitionRunPhase,
} = require('../../src/game/run');

test('run phase enum matches contract values', () => {
  assert.deepEqual(RUN_PHASE_VALUES, [
    'Prepare',
    'Combat',
    'Reward',
    'BossIntro',
    'Result',
  ]);
  assert.equal(isRunPhase(RUN_PHASE.PREPARE), true);
  assert.equal(isRunPhase('Lobby'), false);
});

test('run phase transitions follow UI state contract run flow', () => {
  assert.equal(canTransitionRunPhase(RUN_PHASE.PREPARE, RUN_PHASE.COMBAT), true);
  assert.equal(canTransitionRunPhase(RUN_PHASE.COMBAT, RUN_PHASE.REWARD), true);
  assert.equal(canTransitionRunPhase(RUN_PHASE.BOSS_INTRO, RUN_PHASE.COMBAT), true);
  assert.equal(canTransitionRunPhase(RUN_PHASE.RESULT, RUN_PHASE.PREPARE), true);
  assert.equal(canTransitionRunPhase(RUN_PHASE.REWARD, RUN_PHASE.RESULT), false);
});

test('run state helpers provide HUD bindings and safe transition errors', () => {
  const state = createRunState({
    phase: RUN_PHASE.PREPARE,
    waveNumber: 3,
    gateHp: 18,
    gold: 14,
    summonCost: 5,
    rerollCost: 2,
    synergyCounts: [{ synergyId: 'syn_knights', count: 2 }],
    relics: ['relic_bonus_gold'],
  });

  const hudResult = getHudBindings(state);
  assert.equal(hudResult.ok, true);
  assert.deepEqual(hudResult.value, {
    waveNumber: 3,
    gateHp: 18,
    phase: 'Prepare',
    gold: 14,
    summonCost: 5,
    rerollCost: 2,
    synergyCounts: [{ synergyId: 'syn_knights', count: 2 }],
    relics: ['relic_bonus_gold'],
  });

  const validTransition = transitionRunPhase(state, RUN_PHASE.COMBAT);
  assert.equal(validTransition.ok, true);
  assert.equal(validTransition.value.phase, RUN_PHASE.COMBAT);

  const invalidTransition = transitionRunPhase(state, RUN_PHASE.RESULT);
  assert.equal(invalidTransition.ok, false);
  assert.equal(invalidTransition.error.code, 'INVALID_RUN_PHASE_TRANSITION');
});
