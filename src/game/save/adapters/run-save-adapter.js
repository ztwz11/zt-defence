'use strict';

const { ok } = require('../result');
const { validateRunSavePhase, validateRunSeed } = require('../validation');
const { createSaveAdapter } = require('./create-save-adapter');

const runSaveAdapter = createSaveAdapter({
  id: 'run_save',
  validateSpecific(payload) {
    const runSeedValidation = validateRunSeed(payload.runSeed, 'runSeed');
    if (!runSeedValidation.ok) {
      return runSeedValidation;
    }

    const phaseValidation = validateRunSavePhase(payload.phase, 'phase');
    if (!phaseValidation.ok) {
      return phaseValidation;
    }

    return ok(payload);
  },
});

module.exports = {
  runSaveAdapter,
  validateRunSave: runSaveAdapter.validate,
  serializeRunSave: runSaveAdapter.serialize,
  deserializeRunSave: runSaveAdapter.deserialize,
};
