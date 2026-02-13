'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { checkVersionCompatibility, parseVersion } = require('../../src/game/save');

test('parseVersion accepts x.y.z and rejects invalid values', () => {
  assert.deepEqual(parseVersion('1.2.3'), { major: 1, minor: 2, patch: 3 });
  assert.equal(parseVersion('1.2'), null);
  assert.equal(parseVersion('a.b.c'), null);
});

test('version compatibility blocks major mismatch', () => {
  const result = checkVersionCompatibility('1.0.0', '2.0.0');
  assert.equal(result.compatible, false);
  assert.equal(result.warn, false);
  assert.equal(result.reason, 'major_mismatch');
});

test('version compatibility warns on minor mismatch', () => {
  const result = checkVersionCompatibility('1.0.0', '1.2.0');
  assert.equal(result.compatible, true);
  assert.equal(result.warn, true);
  assert.equal(result.reason, 'minor_mismatch');
});

test('version compatibility allows patch mismatch without warning', () => {
  const result = checkVersionCompatibility('1.0.0', '1.0.7');
  assert.equal(result.compatible, true);
  assert.equal(result.warn, false);
  assert.equal(result.reason, 'patch_mismatch');
});
