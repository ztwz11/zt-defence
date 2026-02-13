'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  TUTORIAL_STATUS,
  TUTORIAL_STEP,
  TUTORIAL_STEP_STATUS,
  createTutorialState,
  recordSummon,
  recordMerge,
  recordSynergyTrigger,
  skip,
  reset,
} = require('../../src/game/tutorial');
const { toTutorialUiModel } = require('../../src/ui/tutorial');

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

test('tutorial flow progresses through summon -> merge -> synergy -> complete', () => {
  let state = createTutorialState();
  assert.equal(state.status, TUTORIAL_STATUS.IN_PROGRESS);
  assert.equal(state.currentStepId, TUTORIAL_STEP.SUMMON);
  assert.equal(state.steps[0].status, TUTORIAL_STEP_STATUS.ACTIVE);

  const beforeInvalidAction = clone(state);
  state = recordMerge(state);
  assert.deepEqual(state, beforeInvalidAction);

  state = recordSummon(state);
  state = recordSummon(state);
  assert.equal(state.currentStepId, TUTORIAL_STEP.SUMMON);
  assert.equal(state.steps[0].progress, 2);

  state = recordSummon(state);
  assert.equal(state.currentStepId, TUTORIAL_STEP.MERGE);
  assert.equal(state.steps[0].status, TUTORIAL_STEP_STATUS.COMPLETED);
  assert.equal(state.steps[1].status, TUTORIAL_STEP_STATUS.ACTIVE);

  state = recordMerge(state);
  assert.equal(state.currentStepId, TUTORIAL_STEP.SYNERGY);
  assert.equal(state.steps[1].status, TUTORIAL_STEP_STATUS.COMPLETED);
  assert.equal(state.steps[2].status, TUTORIAL_STEP_STATUS.ACTIVE);

  state = recordSynergyTrigger(state);
  assert.equal(state.status, TUTORIAL_STATUS.COMPLETED);
  assert.equal(state.currentStepId, TUTORIAL_STEP.COMPLETE);
  assert.equal(state.canSkip, false);
  assert.equal(state.steps[2].status, TUTORIAL_STEP_STATUS.COMPLETED);
  assert.equal(state.steps[3].status, TUTORIAL_STEP_STATUS.COMPLETED);
  assert.equal(state.steps[3].progress, 1);

  const doneSnapshot = clone(state);
  state = recordSummon(state);
  assert.deepEqual(state, doneSnapshot);
});

test('skip marks tutorial as skipped and blocks further progress updates', () => {
  let state = createTutorialState();
  state = recordSummon(state);
  state = skip(state);

  assert.equal(state.status, TUTORIAL_STATUS.SKIPPED);
  assert.equal(state.currentStepId, TUTORIAL_STEP.COMPLETE);
  assert.equal(state.canSkip, false);
  assert.equal(state.steps[0].status, TUTORIAL_STEP_STATUS.SKIPPED);
  assert.equal(state.steps[1].status, TUTORIAL_STEP_STATUS.SKIPPED);
  assert.equal(state.steps[2].status, TUTORIAL_STEP_STATUS.SKIPPED);
  assert.equal(state.steps[3].status, TUTORIAL_STEP_STATUS.SKIPPED);

  const skippedSnapshot = clone(state);
  state = recordMerge(state);
  state = recordSynergyTrigger(state);
  assert.deepEqual(state, skippedSnapshot);
});

test('reset always returns tutorial to initial state', () => {
  let state = createTutorialState();
  state = recordSummon(state);
  state = skip(state);
  state = reset(state);

  assert.deepEqual(state, createTutorialState());
  assert.deepEqual(reset(), createTutorialState());
});

test('ui adapter exposes current step text, progress, and skippable state', () => {
  let state = createTutorialState();
  state = recordSummon(state);
  state = recordSummon(state);

  const inProgressModel = toTutorialUiModel(state);
  assert.deepEqual(inProgressModel, {
    status: TUTORIAL_STATUS.IN_PROGRESS,
    stepId: TUTORIAL_STEP.SUMMON,
    stepText: 'Summon units 3 times',
    progress: {
      current: 2,
      total: 3,
      label: '2/3',
    },
    skippable: true,
  });

  let completedState = state;
  completedState = recordSummon(completedState);
  completedState = recordMerge(completedState);
  completedState = recordSynergyTrigger(completedState);
  const completedModel = toTutorialUiModel(completedState);
  assert.deepEqual(completedModel, {
    status: TUTORIAL_STATUS.COMPLETED,
    stepId: TUTORIAL_STEP.COMPLETE,
    stepText: 'Tutorial complete',
    progress: {
      current: 1,
      total: 1,
      label: '1/1',
    },
    skippable: false,
  });

  const skippedModel = toTutorialUiModel(skip(createTutorialState()));
  assert.deepEqual(skippedModel, {
    status: TUTORIAL_STATUS.SKIPPED,
    stepId: TUTORIAL_STEP.COMPLETE,
    stepText: 'Tutorial skipped',
    progress: {
      current: 1,
      total: 1,
      label: '1/1',
    },
    skippable: false,
  });
});
