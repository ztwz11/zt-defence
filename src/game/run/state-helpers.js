'use strict';

const {
  RUN_PHASE,
  canTransitionRunPhase,
  validateRunPhase,
} = require('./phases');

const DEFAULT_RUN_STATE = Object.freeze({
  phase: RUN_PHASE.PREPARE,
  waveNumber: 1,
  gateHp: 0,
  gold: 0,
  summonCost: 0,
  rerollCost: 0,
  synergyCounts: Object.freeze([]),
  relics: Object.freeze([]),
});

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function createRunState(overrides) {
  const source = isPlainObject(overrides) ? overrides : {};

  return {
    phase: source.phase !== undefined ? source.phase : DEFAULT_RUN_STATE.phase,
    waveNumber:
      source.waveNumber !== undefined
        ? source.waveNumber
        : DEFAULT_RUN_STATE.waveNumber,
    gateHp: source.gateHp !== undefined ? source.gateHp : DEFAULT_RUN_STATE.gateHp,
    gold: source.gold !== undefined ? source.gold : DEFAULT_RUN_STATE.gold,
    summonCost:
      source.summonCost !== undefined
        ? source.summonCost
        : DEFAULT_RUN_STATE.summonCost,
    rerollCost:
      source.rerollCost !== undefined
        ? source.rerollCost
        : DEFAULT_RUN_STATE.rerollCost,
    synergyCounts: Array.isArray(source.synergyCounts)
      ? source.synergyCounts.slice()
      : [],
    relics: Array.isArray(source.relics) ? source.relics.slice() : [],
  };
}

function validateRunState(state) {
  if (!isPlainObject(state)) {
    return {
      ok: false,
      error: {
        code: 'INVALID_RUN_STATE',
        message: 'run state must be an object',
        details: {
          actualType: state === null ? 'null' : typeof state,
        },
      },
    };
  }

  const phaseValidation = validateRunPhase(state.phase, 'phase');
  if (!phaseValidation.ok) {
    return phaseValidation;
  }

  if (!Number.isInteger(state.waveNumber) || state.waveNumber < 1) {
    return {
      ok: false,
      error: {
        code: 'INVALID_WAVE_NUMBER',
        message: 'waveNumber must be an integer >= 1',
        details: {
          value: state.waveNumber,
        },
      },
    };
  }

  if (
    typeof state.gateHp !== 'number' ||
    Number.isNaN(state.gateHp) ||
    state.gateHp < 0
  ) {
    return {
      ok: false,
      error: {
        code: 'INVALID_GATE_HP',
        message: 'gateHp must be a non-negative number',
        details: {
          value: state.gateHp,
        },
      },
    };
  }

  if (
    typeof state.gold !== 'number' ||
    Number.isNaN(state.gold) ||
    state.gold < 0
  ) {
    return {
      ok: false,
      error: {
        code: 'INVALID_GOLD',
        message: 'gold must be a non-negative number',
        details: {
          value: state.gold,
        },
      },
    };
  }

  return {
    ok: true,
    value: createRunState(state),
  };
}

function getHudBindings(runState) {
  const validated = validateRunState(runState);
  if (!validated.ok) {
    return validated;
  }

  const state = validated.value;

  return {
    ok: true,
    value: {
      waveNumber: state.waveNumber,
      gateHp: state.gateHp,
      phase: state.phase,
      gold: state.gold,
      summonCost: state.summonCost,
      rerollCost: state.rerollCost,
      synergyCounts: state.synergyCounts.slice(),
      relics: state.relics.slice(),
    },
  };
}

function transitionRunPhase(runState, nextPhase) {
  const stateValidation = validateRunState(runState);
  if (!stateValidation.ok) {
    return stateValidation;
  }

  const nextPhaseValidation = validateRunPhase(nextPhase, 'nextPhase');
  if (!nextPhaseValidation.ok) {
    return nextPhaseValidation;
  }

  const currentState = stateValidation.value;
  if (!canTransitionRunPhase(currentState.phase, nextPhase)) {
    return {
      ok: false,
      error: {
        code: 'INVALID_RUN_PHASE_TRANSITION',
        message: `cannot transition phase from ${currentState.phase} to ${nextPhase}`,
        details: {
          from: currentState.phase,
          to: nextPhase,
        },
      },
    };
  }

  return {
    ok: true,
    value: {
      ...currentState,
      phase: nextPhase,
    },
  };
}

module.exports = {
  DEFAULT_RUN_STATE,
  createRunState,
  validateRunState,
  getHudBindings,
  transitionRunPhase,
};
