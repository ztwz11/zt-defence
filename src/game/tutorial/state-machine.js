'use strict';

const TUTORIAL_STATUS = Object.freeze({
  IN_PROGRESS: 'InProgress',
  COMPLETED: 'Completed',
  SKIPPED: 'Skipped',
});

const TUTORIAL_STEP = Object.freeze({
  SUMMON: 'summon',
  MERGE: 'merge',
  SYNERGY: 'synergy',
  COMPLETE: 'complete',
});

const TUTORIAL_STEP_STATUS = Object.freeze({
  PENDING: 'pending',
  ACTIVE: 'active',
  COMPLETED: 'completed',
  SKIPPED: 'skipped',
});

const TUTORIAL_FLOW = Object.freeze([
  Object.freeze({
    id: TUTORIAL_STEP.SUMMON,
    required: 3,
  }),
  Object.freeze({
    id: TUTORIAL_STEP.MERGE,
    required: 1,
  }),
  Object.freeze({
    id: TUTORIAL_STEP.SYNERGY,
    required: 1,
  }),
  Object.freeze({
    id: TUTORIAL_STEP.COMPLETE,
    required: 1,
  }),
]);

function createInitialSteps() {
  return TUTORIAL_FLOW.map((definition, index) => ({
    id: definition.id,
    required: definition.required,
    progress: 0,
    status:
      index === 0 ? TUTORIAL_STEP_STATUS.ACTIVE : TUTORIAL_STEP_STATUS.PENDING,
  }));
}

function createTutorialState() {
  return {
    status: TUTORIAL_STATUS.IN_PROGRESS,
    currentStepId: TUTORIAL_STEP.SUMMON,
    canSkip: true,
    steps: createInitialSteps(),
  };
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function cloneStep(step, fallbackDefinition) {
  const source = isPlainObject(step) ? step : {};
  const definition = fallbackDefinition;
  const required =
    Number.isInteger(source.required) && source.required > 0
      ? source.required
      : definition.required;
  const progress =
    Number.isInteger(source.progress) && source.progress >= 0
      ? Math.min(source.progress, required)
      : 0;
  const statusValues = Object.values(TUTORIAL_STEP_STATUS);
  const status = statusValues.includes(source.status)
    ? source.status
    : TUTORIAL_STEP_STATUS.PENDING;

  return {
    id: definition.id,
    required,
    progress,
    status,
  };
}

function normalizeState(inputState) {
  if (!isPlainObject(inputState)) {
    return createTutorialState();
  }

  const stepsById = new Map();
  if (Array.isArray(inputState.steps)) {
    for (const step of inputState.steps) {
      if (isPlainObject(step) && typeof step.id === 'string') {
        stepsById.set(step.id, step);
      }
    }
  }

  const steps = TUTORIAL_FLOW.map((definition, index) => {
    const existing = stepsById.get(definition.id);
    const cloned = cloneStep(existing, definition);
    if (index === 0 && cloned.status === TUTORIAL_STEP_STATUS.PENDING) {
      return {
        ...cloned,
        status: TUTORIAL_STEP_STATUS.ACTIVE,
      };
    }

    return cloned;
  });

  const statusValues = Object.values(TUTORIAL_STATUS);
  const status = statusValues.includes(inputState.status)
    ? inputState.status
    : TUTORIAL_STATUS.IN_PROGRESS;
  const currentStepId =
    typeof inputState.currentStepId === 'string' &&
    TUTORIAL_FLOW.some((step) => step.id === inputState.currentStepId)
      ? inputState.currentStepId
      : TUTORIAL_STEP.SUMMON;
  const canSkip = inputState.canSkip === true;

  return {
    status,
    currentStepId,
    canSkip,
    steps,
  };
}

function isTerminalStatus(status) {
  return (
    status === TUTORIAL_STATUS.COMPLETED || status === TUTORIAL_STATUS.SKIPPED
  );
}

function findStepIndex(state, stepId) {
  return state.steps.findIndex((step) => step.id === stepId);
}

function markTutorialCompleted(state) {
  const completeStepIndex = findStepIndex(state, TUTORIAL_STEP.COMPLETE);
  if (completeStepIndex >= 0) {
    const completeStep = state.steps[completeStepIndex];
    completeStep.progress = completeStep.required;
    completeStep.status = TUTORIAL_STEP_STATUS.COMPLETED;
  }

  state.status = TUTORIAL_STATUS.COMPLETED;
  state.currentStepId = TUTORIAL_STEP.COMPLETE;
  state.canSkip = false;
  return state;
}

function advanceStateAfterStepComplete(state, currentStepIndex) {
  const nextStepIndex = currentStepIndex + 1;
  if (nextStepIndex >= state.steps.length) {
    return markTutorialCompleted(state);
  }

  const nextStep = state.steps[nextStepIndex];
  if (nextStep.id === TUTORIAL_STEP.COMPLETE) {
    return markTutorialCompleted(state);
  }

  nextStep.status = TUTORIAL_STEP_STATUS.ACTIVE;
  state.currentStepId = nextStep.id;
  return state;
}

function recordProgress(state, expectedStepId) {
  const nextState = normalizeState(state);
  if (isTerminalStatus(nextState.status)) {
    return nextState;
  }

  if (nextState.currentStepId !== expectedStepId) {
    return nextState;
  }

  const currentStepIndex = findStepIndex(nextState, expectedStepId);
  if (currentStepIndex < 0) {
    return nextState;
  }

  const currentStep = nextState.steps[currentStepIndex];
  currentStep.progress = Math.min(currentStep.required, currentStep.progress + 1);

  if (currentStep.progress < currentStep.required) {
    return nextState;
  }

  currentStep.status = TUTORIAL_STEP_STATUS.COMPLETED;
  return advanceStateAfterStepComplete(nextState, currentStepIndex);
}

function recordSummon(state) {
  return recordProgress(state, TUTORIAL_STEP.SUMMON);
}

function recordMerge(state) {
  return recordProgress(state, TUTORIAL_STEP.MERGE);
}

function recordSynergyTrigger(state) {
  return recordProgress(state, TUTORIAL_STEP.SYNERGY);
}

function skip(state) {
  const nextState = normalizeState(state);
  if (isTerminalStatus(nextState.status)) {
    return nextState;
  }

  nextState.status = TUTORIAL_STATUS.SKIPPED;
  nextState.currentStepId = TUTORIAL_STEP.COMPLETE;
  nextState.canSkip = false;

  for (const step of nextState.steps) {
    if (step.status !== TUTORIAL_STEP_STATUS.COMPLETED) {
      step.status = TUTORIAL_STEP_STATUS.SKIPPED;
    }
  }

  return nextState;
}

function reset() {
  return createTutorialState();
}

function getCurrentStep(state) {
  const nextState = normalizeState(state);
  const currentStep =
    nextState.steps.find((step) => step.id === nextState.currentStepId) ||
    nextState.steps[nextState.steps.length - 1];

  return {
    id: currentStep.id,
    required: currentStep.required,
    progress: currentStep.progress,
    status: currentStep.status,
  };
}

module.exports = {
  TUTORIAL_STATUS,
  TUTORIAL_STEP,
  TUTORIAL_STEP_STATUS,
  TUTORIAL_FLOW,
  createTutorialState,
  getCurrentStep,
  recordSummon,
  recordMerge,
  recordSynergyTrigger,
  skip,
  reset,
};
