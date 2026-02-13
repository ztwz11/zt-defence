'use strict';

const { ok } = require('../result');
const { validateRunHistoryEntries } = require('../validation');
const { createSaveAdapter } = require('./create-save-adapter');

const runHistoryAdapter = createSaveAdapter({
  id: 'run_history',
  validateSpecific(payload) {
    const entriesValidation = validateRunHistoryEntries(payload.entries, 'entries');
    if (!entriesValidation.ok) {
      return entriesValidation;
    }

    return ok(payload);
  },
});

module.exports = {
  runHistoryAdapter,
  validateRunHistory: runHistoryAdapter.validate,
  serializeRunHistory: runHistoryAdapter.serialize,
  deserializeRunHistory: runHistoryAdapter.deserialize,
};
