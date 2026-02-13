'use strict';

const {
  TUTORIAL_STATUS,
  TUTORIAL_STEP,
  createTutorialState,
  getCurrentStep,
} = require('../../game/tutorial');

const STEP_TEXT = Object.freeze({
  [TUTORIAL_STEP.SUMMON]: 'Summon units 3 times',
  [TUTORIAL_STEP.MERGE]: 'Merge units 1 time',
  [TUTORIAL_STEP.SYNERGY]: 'Trigger 1 synergy',
  [TUTORIAL_STEP.COMPLETE]: 'Tutorial complete',
});

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function resolveStatus(state) {
  if (!isPlainObject(state)) {
    return TUTORIAL_STATUS.IN_PROGRESS;
  }

  const allowed = Object.values(TUTORIAL_STATUS);
  return allowed.includes(state.status) ? state.status : TUTORIAL_STATUS.IN_PROGRESS;
}

function resolveCanSkip(status, state) {
  if (status !== TUTORIAL_STATUS.IN_PROGRESS) {
    return false;
  }

  if (!isPlainObject(state)) {
    return true;
  }

  return state.canSkip === true;
}

function resolveProgress(status, step) {
  if (
    status === TUTORIAL_STATUS.COMPLETED ||
    status === TUTORIAL_STATUS.SKIPPED
  ) {
    return {
      current: 1,
      total: 1,
      label: '1/1',
    };
  }

  const total = Number.isInteger(step.required) && step.required > 0 ? step.required : 1;
  const current =
    Number.isInteger(step.progress) && step.progress >= 0
      ? Math.min(step.progress, total)
      : 0;

  return {
    current,
    total,
    label: `${current}/${total}`,
  };
}

function toTutorialUiModel(state) {
  const safeState = isPlainObject(state) ? state : createTutorialState();
  const status = resolveStatus(safeState);
  const currentStep = getCurrentStep(safeState);

  let stepText = STEP_TEXT[currentStep.id] || STEP_TEXT[TUTORIAL_STEP.SUMMON];
  if (status === TUTORIAL_STATUS.COMPLETED) {
    stepText = STEP_TEXT[TUTORIAL_STEP.COMPLETE];
  } else if (status === TUTORIAL_STATUS.SKIPPED) {
    stepText = 'Tutorial skipped';
  }

  return {
    status,
    stepId:
      status === TUTORIAL_STATUS.IN_PROGRESS
        ? currentStep.id
        : TUTORIAL_STEP.COMPLETE,
    stepText,
    progress: resolveProgress(status, currentStep),
    skippable: resolveCanSkip(status, safeState),
  };
}

module.exports = {
  toTutorialUiModel,
};
