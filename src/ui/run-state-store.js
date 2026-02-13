'use strict';

const {
  RUN_PHASE,
  RUN_PHASE_VALUES,
  createRunState,
  getHudBindings,
  getNextRunPhases,
  transitionRunPhase,
  validateRunState,
} = require('../game/run');

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function cloneArray(value) {
  return Array.isArray(value) ? value.slice() : [];
}

function toHudViewModel(state) {
  const hudResult = getHudBindings(state);
  if (!hudResult.ok) {
    return hudResult;
  }

  const hud = hudResult.value;
  return {
    ok: true,
    value: {
      gold: hud.gold,
      wave: hud.waveNumber,
      gateHp: hud.gateHp,
      phase: hud.phase,
      summonCost: hud.summonCost,
      rerollCost: hud.rerollCost,
      synergyCounts: cloneArray(hud.synergyCounts),
      relics: cloneArray(hud.relics),
    },
  };
}

function createRunStateStore(initialState) {
  let state = createRunState(initialState);

  function getState() {
    return createRunState(state);
  }

  function setState(nextPartialState) {
    const partialState = isPlainObject(nextPartialState) ? nextPartialState : {};
    const candidate = createRunState({
      ...state,
      ...partialState,
    });
    const validation = validateRunState(candidate);
    if (!validation.ok) {
      return validation;
    }

    state = validation.value;
    return {
      ok: true,
      value: getState(),
    };
  }

  function transitionToPhase(nextPhase) {
    const transition = transitionRunPhase(state, nextPhase);
    if (!transition.ok) {
      return transition;
    }

    state = transition.value;
    return {
      ok: true,
      value: getState(),
    };
  }

  function getHudViewModel() {
    return toHudViewModel(state);
  }

  function getAvailablePhaseTransitions() {
    return getNextRunPhases(state.phase);
  }

  return {
    runPhases: RUN_PHASE_VALUES.slice(),
    getState,
    setState,
    getHudViewModel,
    getAvailablePhaseTransitions,
    transitionToPhase,
    enterPrepare() {
      return transitionToPhase(RUN_PHASE.PREPARE);
    },
    enterCombat() {
      return transitionToPhase(RUN_PHASE.COMBAT);
    },
    enterReward() {
      return transitionToPhase(RUN_PHASE.REWARD);
    },
    enterBossIntro() {
      return transitionToPhase(RUN_PHASE.BOSS_INTRO);
    },
    enterResult() {
      return transitionToPhase(RUN_PHASE.RESULT);
    },
  };
}

module.exports = {
  createRunStateStore,
};

