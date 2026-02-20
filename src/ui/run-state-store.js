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
const {
  createOptionLabelModel,
  normalizeUiLocale,
  resolvePhaseLabel,
} = require('./localization');

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function cloneArray(value) {
  return Array.isArray(value) ? value.slice() : [];
}

function resolveUiLocaleFromOptions(initialState, options) {
  if (options && typeof options === 'object' && !Array.isArray(options)) {
    return normalizeUiLocale(options.locale);
  }

  if (initialState && typeof initialState === 'object' && !Array.isArray(initialState)) {
    return normalizeUiLocale(initialState.locale);
  }

  return normalizeUiLocale(undefined);
}

function toHudViewModel(state, locale) {
  const hudResult = getHudBindings(state);
  if (!hudResult.ok) {
    return hudResult;
  }

  const hud = hudResult.value;
  const normalizedLocale = normalizeUiLocale(locale);
  const optionLabels = createOptionLabelModel(normalizedLocale);

  return {
    ok: true,
    value: {
      locale: normalizedLocale,
      gold: hud.gold,
      wave: hud.waveNumber,
      gateHp: hud.gateHp,
      phase: hud.phase,
      phaseLabel: resolvePhaseLabel(hud.phase, normalizedLocale),
      summonCost: hud.summonCost,
      rerollCost: hud.rerollCost,
      synergyCounts: cloneArray(hud.synergyCounts),
      relics: cloneArray(hud.relics),
      optionLabels,
    },
  };
}

function createRunStateStore(initialState, options) {
  let state = createRunState(initialState);
  let locale = resolveUiLocaleFromOptions(initialState, options);

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
    return toHudViewModel(state, locale);
  }

  function getAvailablePhaseTransitions() {
    return getNextRunPhases(state.phase);
  }

  return {
    runPhases: RUN_PHASE_VALUES.slice(),
    getState,
    setState,
    getHudViewModel,
    getLocale() {
      return locale;
    },
    setLocale(nextLocale) {
      locale = normalizeUiLocale(nextLocale);
      return locale;
    },
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
