'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { drawUnitByTierChance, drawWithPoolWeights } = require('../../src/game/summon');
const { createSeededRng } = require('../../src/game/sim/seededRng');

test('drawWithPoolWeights selects entries deterministically with injected rng', () => {
  const pool = [
    { unitId: 'unit_a', weight: 1 },
    { unitId: 'unit_b', weight: 3 },
  ];

  const first = drawWithPoolWeights(() => 0, pool);
  const second = drawWithPoolWeights(() => 0.99, pool);

  assert.equal(first.unitId, 'unit_a');
  assert.equal(second.unitId, 'unit_b');
});

test('drawUnitByTierChance chooses tier by chance and unit by pool weights', () => {
  const tierChances = { 1: 0.8, 2: 0.2 };
  const poolByTier = {
    1: [{ unitId: 'knight', weight: 1 }],
    2: [{ unitId: 'mage', weight: 1 }],
  };

  const drawn = drawUnitByTierChance(() => 0.95, tierChances, poolByTier);
  assert.equal(drawn.unitId, 'mage');
});

test('drawUnitByTierChance falls back to available tiers when weighted tier pool is empty', () => {
  const drawn = drawUnitByTierChance(
    () => 0.1,
    { 1: 1 },
    {
      1: [],
      2: [{ unitId: 'fallback_archer', weight: 1 }],
    }
  );

  assert.equal(drawn.unitId, 'fallback_archer');
});

test('drawUnitByTierChance remains deterministic across seeded rng instances', () => {
  const tierChances = { 1: 0.5, 2: 0.5 };
  const poolByTier = {
    1: [{ unitId: 'soldier', weight: 1 }],
    2: [{ unitId: 'wizard', weight: 1 }],
  };

  const runA = createSeededRng(12345);
  const runB = createSeededRng(12345);
  const sequenceA = [];
  const sequenceB = [];

  for (let index = 0; index < 6; index += 1) {
    sequenceA.push(drawUnitByTierChance(runA, tierChances, poolByTier).unitId);
    sequenceB.push(drawUnitByTierChance(runB, tierChances, poolByTier).unitId);
  }

  assert.deepEqual(sequenceA, sequenceB);
});

