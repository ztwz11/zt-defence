'use strict';

const {
  REQUIRED_VERSION_FIELDS,
  RUN_HISTORY_MAX_ENTRIES,
  SEMVER_PATTERN,
} = require('../../types/save/contracts');
const { RUN_PHASE_VALUES, isRunPhase } = require('../run/phases');
const { fail, ok } = require('./result');

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function getTypeName(value) {
  if (value === null) {
    return 'null';
  }

  if (Array.isArray(value)) {
    return 'array';
  }

  return typeof value;
}

function ensureObject(value, context) {
  const name = typeof context === 'string' ? context : 'value';
  if (!isPlainObject(value)) {
    return fail('INVALID_OBJECT', `${name} must be an object`, {
      context: name,
      actualType: getTypeName(value),
    });
  }

  return ok(value);
}

function validateVersionFields(value, context) {
  const name = typeof context === 'string' ? context : 'save';
  const objectResult = ensureObject(value, name);
  if (!objectResult.ok) {
    return objectResult;
  }

  for (const field of REQUIRED_VERSION_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(value, field)) {
      return fail('MISSING_REQUIRED_FIELD', `${name}.${field} is required`, {
        context: name,
        field,
      });
    }

    const fieldValue = value[field];
    if (typeof fieldValue !== 'string' || !SEMVER_PATTERN.test(fieldValue)) {
      return fail(
        'INVALID_VERSION_FIELD',
        `${name}.${field} must be a semantic version string (x.y.z)`,
        {
          context: name,
          field,
          value: fieldValue,
        }
      );
    }
  }

  return ok(value);
}

function validateRunSeed(value, fieldPath) {
  const path = typeof fieldPath === 'string' ? fieldPath : 'runSeed';
  if (!Number.isInteger(value) || value < 0) {
    return fail('INVALID_RUN_SEED', `${path} must be a non-negative integer`, {
      fieldPath: path,
      value,
    });
  }

  return ok(value);
}

function validateRunSavePhase(phase, fieldPath) {
  const path = typeof fieldPath === 'string' ? fieldPath : 'phase';
  if (!isRunPhase(phase)) {
    return fail(
      'INVALID_RUN_PHASE',
      `${path} must be one of: ${RUN_PHASE_VALUES.join(' | ')}`,
      {
        fieldPath: path,
        value: phase,
        allowed: RUN_PHASE_VALUES.slice(),
      }
    );
  }

  return ok(phase);
}

function validateRunHistoryEntries(entries, fieldPath) {
  const path = typeof fieldPath === 'string' ? fieldPath : 'entries';

  if (!Array.isArray(entries)) {
    return fail('INVALID_RUN_HISTORY_ENTRIES', `${path} must be an array`, {
      fieldPath: path,
      actualType: getTypeName(entries),
    });
  }

  if (entries.length > RUN_HISTORY_MAX_ENTRIES) {
    return fail(
      'RUN_HISTORY_LIMIT_EXCEEDED',
      `${path} may contain at most ${RUN_HISTORY_MAX_ENTRIES} entries`,
      {
        fieldPath: path,
        count: entries.length,
        max: RUN_HISTORY_MAX_ENTRIES,
      }
    );
  }

  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    const entryPath = `${path}[${index}]`;
    const objectResult = ensureObject(entry, entryPath);
    if (!objectResult.ok) {
      return objectResult;
    }

    const runSeedResult = validateRunSeed(entry.runSeed, `${entryPath}.runSeed`);
    if (!runSeedResult.ok) {
      return runSeedResult;
    }
  }

  return ok(entries);
}

module.exports = {
  ensureObject,
  validateVersionFields,
  validateRunSeed,
  validateRunSavePhase,
  validateRunHistoryEntries,
};
