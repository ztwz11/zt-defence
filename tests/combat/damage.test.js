"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  computePhysicalDamage,
  computeMagicDamage,
  computeDamage,
} = require("../../src/game/combat/damage");

test("physical damage follows raw * 100 / (100 + armor)", () => {
  const actual = computePhysicalDamage(200, 100);
  assert.equal(actual, 100);
});

test("magic damage follows raw * 100 / (100 + resist)", () => {
  const actual = computeMagicDamage(150, 50);
  assert.equal(actual, 100);
});

test("crit multiplier is applied before defense", () => {
  const result = computeDamage(
    {
      rawDamage: 100,
      damageType: "physical",
      armor: 100,
      critChance: 0,
      critMultiplier: 2,
      forceCrit: true,
    },
    () => 0.99
  );

  assert.equal(result.isCrit, true);
  assert.equal(result.rawDamage, 200);
  assert.equal(result.finalDamage, 100);
});

test("magic damage with non-crit remains deterministic with injected rng", () => {
  const result = computeDamage(
    {
      rawDamage: 80,
      damageType: "magic",
      resist: 60,
      critChance: 0.5,
      critMultiplier: 2,
    },
    () => 0.9
  );

  assert.equal(result.isCrit, false);
  assert.equal(result.finalDamage, 50);
});
