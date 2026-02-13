'use strict';

const { ok } = require('../result');
const { createSaveAdapter } = require('./create-save-adapter');

const profileSaveAdapter = createSaveAdapter({
  id: 'profile',
  validateSpecific(payload) {
    return ok(payload);
  },
});

module.exports = {
  profileSaveAdapter,
  validateProfile: profileSaveAdapter.validate,
  serializeProfile: profileSaveAdapter.serialize,
  deserializeProfile: profileSaveAdapter.deserialize,
};
