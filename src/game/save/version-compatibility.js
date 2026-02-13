'use strict';

const { SEMVER_PATTERN } = require('../../types/save/contracts');

function parseVersion(version) {
  if (typeof version !== 'string' || !SEMVER_PATTERN.test(version)) {
    return null;
  }

  const [major, minor, patch] = version.split('.').map((part) => Number.parseInt(part, 10));
  return { major, minor, patch };
}

function checkVersionCompatibility(expectedVersion, actualVersion) {
  const expectedParts = parseVersion(expectedVersion);
  const actualParts = parseVersion(actualVersion);

  if (!expectedParts || !actualParts) {
    return {
      compatible: false,
      warn: false,
      reason: 'invalid_version',
      expectedVersion,
      actualVersion,
      expectedParts,
      actualParts,
    };
  }

  if (expectedParts.major !== actualParts.major) {
    return {
      compatible: false,
      warn: false,
      reason: 'major_mismatch',
      expectedVersion,
      actualVersion,
      expectedParts,
      actualParts,
    };
  }

  if (expectedParts.minor !== actualParts.minor) {
    return {
      compatible: true,
      warn: true,
      reason: 'minor_mismatch',
      expectedVersion,
      actualVersion,
      expectedParts,
      actualParts,
    };
  }

  if (expectedParts.patch !== actualParts.patch) {
    return {
      compatible: true,
      warn: false,
      reason: 'patch_mismatch',
      expectedVersion,
      actualVersion,
      expectedParts,
      actualParts,
    };
  }

  return {
    compatible: true,
    warn: false,
    reason: 'match',
    expectedVersion,
    actualVersion,
    expectedParts,
    actualParts,
  };
}

module.exports = {
  parseVersion,
  checkVersionCompatibility,
};
