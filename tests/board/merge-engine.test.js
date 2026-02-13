'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { detectMergeCandidates, mergeThreeSameUnits } = require('../../src/game/board');

test('detectMergeCandidates reports unitId/star groups with at least 3 units', () => {
  const units = [
    { instanceId: 'k1', unitId: 'knight', star: 1 },
    { instanceId: 'k2', unitId: 'knight', star: 1 },
    { instanceId: 'k3', unitId: 'knight', star: 1 },
    { instanceId: 'k4', unitId: 'knight', star: 2 },
    { instanceId: 'k5', unitId: 'knight', star: 2 },
    { instanceId: 'k6', unitId: 'knight', star: 2 },
    { instanceId: 'a1', unitId: 'archer', star: 1 },
  ];

  const candidates = detectMergeCandidates(units);
  assert.deepEqual(candidates, [
    { unitId: 'knight', star: 1, count: 3, mergeCount: 1 },
    { unitId: 'knight', star: 2, count: 3, mergeCount: 1 },
  ]);
});

test('mergeThreeSameUnits merges three same-star units into star+1 (max 3)', () => {
  const units = [
    { instanceId: 'k1', unitId: 'knight', star: 1, slot: { x: 0, y: 0 } },
    { instanceId: 'k2', unitId: 'knight', star: 1, slot: { x: 1, y: 0 } },
    { instanceId: 'a1', unitId: 'archer', star: 1, slot: { x: 2, y: 0 } },
    { instanceId: 'k3', unitId: 'knight', star: 1, slot: { x: 3, y: 0 } },
  ];

  const result = mergeThreeSameUnits(units, 'knight');
  assert.equal(result.didMerge, true);
  assert.equal(result.mergedUnit.star, 2);
  assert.equal(result.consumedUnits.length, 3);
  assert.equal(result.units.length, 2);
  assert.equal(result.units.filter((unit) => unit.unitId === 'knight').length, 1);
  assert.equal(units.length, 4);
});

test('mergeThreeSameUnits does not merge beyond star 3 cap', () => {
  const units = [
    { instanceId: 'k1', unitId: 'knight', star: 3 },
    { instanceId: 'k2', unitId: 'knight', star: 3 },
    { instanceId: 'k3', unitId: 'knight', star: 3 },
  ];

  const result = mergeThreeSameUnits(units, 'knight');
  assert.equal(result.didMerge, false);
  assert.equal(result.mergedUnit, null);
  assert.equal(result.units.length, 3);
});

