'use strict';

const RUN_PHASE = Object.freeze({
  PREPARE: 'Prepare',
  COMBAT: 'Combat',
  REWARD: 'Reward',
  BOSS_INTRO: 'BossIntro',
  RESULT: 'Result',
});

const RUN_PHASE_VALUES = Object.freeze(Object.values(RUN_PHASE));

const RUN_PHASE_TRANSITIONS = Object.freeze({
  [RUN_PHASE.PREPARE]: Object.freeze([RUN_PHASE.COMBAT]),
  [RUN_PHASE.COMBAT]: Object.freeze([
    RUN_PHASE.REWARD,
    RUN_PHASE.PREPARE,
    RUN_PHASE.BOSS_INTRO,
    RUN_PHASE.RESULT,
  ]),
  [RUN_PHASE.REWARD]: Object.freeze([RUN_PHASE.PREPARE]),
  [RUN_PHASE.BOSS_INTRO]: Object.freeze([RUN_PHASE.COMBAT]),
  [RUN_PHASE.RESULT]: Object.freeze([RUN_PHASE.PREPARE]),
});

function isRunPhase(value) {
  return RUN_PHASE_VALUES.includes(value);
}

function listRunPhases() {
  return RUN_PHASE_VALUES.slice();
}

function getNextRunPhases(phase) {
  if (!isRunPhase(phase)) {
    return [];
  }

  return RUN_PHASE_TRANSITIONS[phase].slice();
}

function canTransitionRunPhase(fromPhase, toPhase) {
  if (!isRunPhase(fromPhase) || !isRunPhase(toPhase)) {
    return false;
  }

  return RUN_PHASE_TRANSITIONS[fromPhase].includes(toPhase);
}

function validateRunPhase(phase, fieldPath) {
  const targetField = typeof fieldPath === 'string' ? fieldPath : 'phase';

  if (!isRunPhase(phase)) {
    return {
      ok: false,
      error: {
        code: 'INVALID_RUN_PHASE',
        message: `${targetField} must be one of: ${RUN_PHASE_VALUES.join(' | ')}`,
        details: {
          fieldPath: targetField,
          value: phase,
          allowed: RUN_PHASE_VALUES.slice(),
        },
      },
    };
  }

  return {
    ok: true,
    value: phase,
  };
}

module.exports = {
  RUN_PHASE,
  RUN_PHASE_VALUES,
  RUN_PHASE_TRANSITIONS,
  isRunPhase,
  listRunPhases,
  getNextRunPhases,
  canTransitionRunPhase,
  validateRunPhase,
};
