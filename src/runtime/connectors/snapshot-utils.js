'use strict';

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function cloneSnapshotValue(value) {
  if (Array.isArray(value)) {
    return value.map(cloneSnapshotValue);
  }

  if (!isPlainObject(value)) {
    return value;
  }

  const clone = {};
  const keys = Object.keys(value);
  for (const key of keys) {
    clone[key] = cloneSnapshotValue(value[key]);
  }

  return clone;
}

module.exports = {
  cloneSnapshotValue,
};
