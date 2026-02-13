"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { TARGETING_RULES, selectTarget } = require("../../src/game/combat/targeting");

test("frontMost selects the enemy with greatest progress", () => {
  const enemies = [
    { instanceId: "a", hp: 10, progress: 0.1, isAlive: true, spawnOrder: 1 },
    { instanceId: "b", hp: 10, progress: 0.4, isAlive: true, spawnOrder: 2 },
    { instanceId: "c", hp: 10, progress: 0.2, isAlive: true, spawnOrder: 3 },
  ];

  const target = selectTarget(enemies, TARGETING_RULES.FRONT_MOST);
  assert.equal(target.instanceId, "b");
});

test("lowestHp selects the enemy with smallest hp and breaks ties deterministically", () => {
  const enemies = [
    { instanceId: "a", hp: 3, progress: 0.5, isAlive: true, spawnOrder: 2 },
    { instanceId: "b", hp: 3, progress: 0.7, isAlive: true, spawnOrder: 1 },
    { instanceId: "c", hp: 8, progress: 0.9, isAlive: true, spawnOrder: 3 },
  ];

  const target = selectTarget(enemies, TARGETING_RULES.LOWEST_HP);
  assert.equal(target.instanceId, "b");
});

test("random uses provided rng and ignores non-targetable enemies", () => {
  const enemies = [
    { instanceId: "a", hp: 10, progress: 0.1, isAlive: true, spawnOrder: 1 },
    { instanceId: "b", hp: 0, progress: 0.9, isAlive: false, spawnOrder: 2 },
    { instanceId: "c", hp: 10, progress: 0.2, isAlive: true, spawnOrder: 3 },
  ];

  const target = selectTarget(enemies, TARGETING_RULES.RANDOM, () => 0.8);
  assert.equal(target.instanceId, "c");
});
