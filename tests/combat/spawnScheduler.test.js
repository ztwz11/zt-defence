"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  expandSpawnEvents,
  createSpawnScheduler,
} = require("../../src/game/waves/spawnScheduler");

test("expandSpawnEvents expands count and interval deterministically", () => {
  const expanded = expandSpawnEvents([
    { time: 1, enemyId: "goblin", count: 3, interval: 0.5 },
    { time: 0.2, enemyId: "slime", count: 2, interval: 0.3 },
  ]);

  assert.deepEqual(
    expanded.map((entry) => ({
      enemyId: entry.enemyId,
      time: entry.time,
    })),
    [
      { enemyId: "slime", time: 0.2 },
      { enemyId: "slime", time: 0.5 },
      { enemyId: "goblin", time: 1 },
      { enemyId: "goblin", time: 1.5 },
      { enemyId: "goblin", time: 2 },
    ]
  );
});

test("scheduler popDue returns only due entries and tracks completion", () => {
  const scheduler = createSpawnScheduler([
    { time: 0, enemyId: "a", count: 2, interval: 1 },
    { time: 0.5, enemyId: "b", count: 1, interval: 0 },
  ]);

  assert.equal(scheduler.peekNextTime(), 0);
  assert.equal(scheduler.isFinished(), false);

  const dueAtZero = scheduler.popDue(0);
  assert.deepEqual(dueAtZero.map((entry) => entry.enemyId), ["a"]);
  assert.equal(scheduler.remaining(), 2);

  const dueAtHalf = scheduler.popDue(0.5);
  assert.deepEqual(dueAtHalf.map((entry) => entry.enemyId), ["b"]);
  assert.equal(scheduler.remaining(), 1);

  const dueAtOne = scheduler.popDue(1);
  assert.deepEqual(dueAtOne.map((entry) => entry.enemyId), ["a"]);
  assert.equal(scheduler.isFinished(), true);
});
