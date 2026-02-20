'use strict';

const {
  TUTORIAL_STATUS,
  TUTORIAL_STEP,
  createTutorialState,
  getCurrentStep,
} = require('../../game/tutorial');
const { createUiTextBundle, normalizeUiLocale } = require('../localization');

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function resolveUiLocale(options) {
  if (typeof options === 'string') {
    return normalizeUiLocale(options);
  }

  const source = isPlainObject(options) ? options : {};
  return normalizeUiLocale(source.locale);
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

function resolveStepText(stepId, status, textBundle) {
  const tutorialText = isPlainObject(textBundle?.tutorial)
    ? textBundle.tutorial
    : {};
  const stepTextMap = isPlainObject(tutorialText.steps) ? tutorialText.steps : {};
  const fallbackTextMap = {
    [TUTORIAL_STEP.SUMMON]: 'Summon units 3 times',
    [TUTORIAL_STEP.MERGE]: 'Merge units 1 time',
    [TUTORIAL_STEP.SYNERGY]: 'Trigger 1 synergy',
    [TUTORIAL_STEP.COMPLETE]: 'Tutorial complete',
  };

  if (status === TUTORIAL_STATUS.SKIPPED) {
    return typeof tutorialText.skipped === 'string'
      ? tutorialText.skipped
      : 'Tutorial skipped';
  }

  if (status === TUTORIAL_STATUS.COMPLETED) {
    const completedText = stepTextMap[TUTORIAL_STEP.COMPLETE];
    return typeof completedText === 'string'
      ? completedText
      : fallbackTextMap[TUTORIAL_STEP.COMPLETE];
  }

  const currentStepText = stepTextMap[stepId];
  if (typeof currentStepText === 'string') {
    return currentStepText;
  }

  return fallbackTextMap[stepId] || fallbackTextMap[TUTORIAL_STEP.SUMMON];
}

function toTutorialUiModel(state, options) {
  const safeState = isPlainObject(state) ? state : createTutorialState();
  const locale = resolveUiLocale(options);
  const textBundle = createUiTextBundle(locale);
  const status = resolveStatus(safeState);
  const currentStep = getCurrentStep(safeState);

  return {
    locale,
    status,
    stepId:
      status === TUTORIAL_STATUS.IN_PROGRESS
        ? currentStep.id
        : TUTORIAL_STEP.COMPLETE,
    stepText: resolveStepText(currentStep.id, status, textBundle),
    progress: resolveProgress(status, currentStep),
    skippable: resolveCanSkip(status, safeState),
  };
}

module.exports = {
  toTutorialUiModel,
};
