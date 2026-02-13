'use strict';

const {
  DEFAULT_CONTENT_VERSION,
  DEFAULT_SAVE_VERSION,
} = require('../../../types/save/contracts');
const { parseJson, stringifyJson } = require('../json-io');
const { fail, ok, warning } = require('../result');
const { validateVersionFields } = require('../validation');
const { checkVersionCompatibility } = require('../version-compatibility');

function normalizePayloadInput(raw, adapterId) {
  const context = typeof adapterId === 'string' ? adapterId : 'save';

  if (typeof raw === 'string') {
    const parseResult = parseJson(raw, context);
    if (!parseResult.ok) {
      return parseResult;
    }

    if (parseResult.value === null || typeof parseResult.value !== 'object' || Array.isArray(parseResult.value)) {
      return fail('INVALID_OBJECT', `${context} must deserialize to an object`, {
        context,
        actualType: Array.isArray(parseResult.value) ? 'array' : typeof parseResult.value,
      });
    }

    return ok(parseResult.value);
  }

  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return fail('INVALID_OBJECT', `${context} payload must be an object`, {
      context,
      actualType: Array.isArray(raw) ? 'array' : typeof raw,
    });
  }

  return ok(raw);
}

function resolveOptions(options) {
  const source = options || {};
  return {
    expectedSaveVersion:
      typeof source.expectedSaveVersion === 'string'
        ? source.expectedSaveVersion
        : DEFAULT_SAVE_VERSION,
    expectedContentVersion:
      typeof source.expectedContentVersion === 'string'
        ? source.expectedContentVersion
        : DEFAULT_CONTENT_VERSION,
    allowContentVersionMismatch: source.allowContentVersionMismatch === true,
    stringifyOptions: {
      space: source.space,
      trailingNewline: source.trailingNewline,
    },
  };
}

function createSaveAdapter(config) {
  const adapterId = typeof config.id === 'string' ? config.id : 'save';
  const validateSpecific =
    typeof config.validateSpecific === 'function'
      ? config.validateSpecific
      : () => ok(null);

  function validate(payload, options) {
    const normalizedResult = normalizePayloadInput(payload, adapterId);
    if (!normalizedResult.ok) {
      return normalizedResult;
    }

    const normalizedPayload = normalizedResult.value;

    const versionResult = validateVersionFields(normalizedPayload, adapterId);
    if (!versionResult.ok) {
      return versionResult;
    }

    const resolvedOptions = resolveOptions(options);
    const warnings = [];

    const saveVersionCompatibility = checkVersionCompatibility(
      resolvedOptions.expectedSaveVersion,
      normalizedPayload.saveVersion
    );

    if (!saveVersionCompatibility.compatible) {
      return fail(
        'SAVE_VERSION_INCOMPATIBLE',
        `incompatible saveVersion for ${adapterId}: expected ${resolvedOptions.expectedSaveVersion}, got ${normalizedPayload.saveVersion}`,
        {
          adapterId,
          compatibility: saveVersionCompatibility,
        }
      );
    }

    if (saveVersionCompatibility.warn) {
      warnings.push(
        warning(
          'SAVE_VERSION_MINOR_MISMATCH',
          `minor saveVersion mismatch for ${adapterId}: expected ${resolvedOptions.expectedSaveVersion}, got ${normalizedPayload.saveVersion}`,
          {
            adapterId,
            compatibility: saveVersionCompatibility,
          }
        )
      );
    }

    if (
      resolvedOptions.expectedContentVersion &&
      normalizedPayload.contentVersion !== resolvedOptions.expectedContentVersion
    ) {
      if (!resolvedOptions.allowContentVersionMismatch) {
        return fail(
          'CONTENT_VERSION_MISMATCH',
          `contentVersion mismatch for ${adapterId}: expected ${resolvedOptions.expectedContentVersion}, got ${normalizedPayload.contentVersion}`,
          {
            adapterId,
            expectedContentVersion: resolvedOptions.expectedContentVersion,
            actualContentVersion: normalizedPayload.contentVersion,
          }
        );
      }

      warnings.push(
        warning(
          'CONTENT_VERSION_MISMATCH',
          `contentVersion mismatch allowed for ${adapterId}: expected ${resolvedOptions.expectedContentVersion}, got ${normalizedPayload.contentVersion}`,
          {
            adapterId,
            expectedContentVersion: resolvedOptions.expectedContentVersion,
            actualContentVersion: normalizedPayload.contentVersion,
          }
        )
      );
    }

    const specificValidation = validateSpecific(normalizedPayload, resolvedOptions);
    if (!specificValidation.ok) {
      return specificValidation;
    }

    const specificWarnings = Array.isArray(specificValidation.warnings)
      ? specificValidation.warnings
      : [];

    return ok(normalizedPayload, warnings.concat(specificWarnings));
  }

  function serialize(payload, options) {
    const validationResult = validate(payload, options);
    if (!validationResult.ok) {
      return validationResult;
    }

    const stringifyResult = stringifyJson(validationResult.value, resolveOptions(options).stringifyOptions);
    if (!stringifyResult.ok) {
      return stringifyResult;
    }

    return ok(stringifyResult.value, validationResult.warnings);
  }

  function deserialize(raw, options) {
    return validate(raw, options);
  }

  return {
    id: adapterId,
    validate,
    serialize,
    deserialize,
  };
}

module.exports = {
  createSaveAdapter,
};
