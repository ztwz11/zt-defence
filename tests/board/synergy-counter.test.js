'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { countTags, resolveActiveSynergies } = require('../../src/game/synergy');

test('countTags counts unique tags per unit', () => {
  const units = [
    { unitId: 'u1', tags: ['fire', 'mage', 'fire'] },
    { unitId: 'u2', tags: ['fire'] },
    { unitId: 'u3', tags: 'mage' },
    { unitId: 'u4', tag: 'tank' },
  ];

  const counts = countTags(units);
  assert.deepEqual(counts, {
    fire: 2,
    mage: 2,
    tank: 1,
  });
});

test('resolveActiveSynergies returns only thresholds currently activated', () => {
  const synergyDefs = [
    { id: 'syn_fire', tag: 'fire', thresholds: [2, 4] },
    { id: 'syn_mage', tag: 'mage', thresholds: [3] },
    { id: 'syn_tank', tag: 'tank', thresholds: [1, 2] },
  ];

  const resolved = resolveActiveSynergies(synergyDefs, {
    fire: 3,
    mage: 2,
    tank: 1,
  });

  assert.deepEqual(resolved, [
    {
      synergyId: 'syn_fire',
      tag: 'fire',
      count: 3,
      activeThreshold: 2,
      nextThreshold: 4,
    },
    {
      synergyId: 'syn_tank',
      tag: 'tank',
      count: 1,
      activeThreshold: 1,
      nextThreshold: 2,
    },
  ]);
});

test('resolveActiveSynergies chooses highest threshold not exceeding tag count', () => {
  const synergyDefs = [{ id: 'syn_fire', tag: 'fire', thresholds: [2, 4, 6] }];
  const resolved = resolveActiveSynergies(synergyDefs, { fire: 6 });

  assert.equal(resolved.length, 1);
  assert.equal(resolved[0].activeThreshold, 6);
  assert.equal(resolved[0].nextThreshold, null);
});

