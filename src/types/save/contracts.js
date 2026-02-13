'use strict';

const SAVE_FILE_KIND = Object.freeze({
  PROFILE: 'profile',
  RUN_SAVE: 'run_save',
  RUN_HISTORY: 'run_history',
});

const REQUIRED_VERSION_FIELDS = Object.freeze([
  'saveVersion',
  'contentVersion',
]);

const DEFAULT_SAVE_VERSION = '1.0.0';
const DEFAULT_CONTENT_VERSION = '0.1.0';
const SEMVER_PATTERN = /^\d+\.\d+\.\d+$/;
const RUN_HISTORY_MAX_ENTRIES = 20;

module.exports = {
  SAVE_FILE_KIND,
  REQUIRED_VERSION_FIELDS,
  DEFAULT_SAVE_VERSION,
  DEFAULT_CONTENT_VERSION,
  SEMVER_PATTERN,
  RUN_HISTORY_MAX_ENTRIES,
};
