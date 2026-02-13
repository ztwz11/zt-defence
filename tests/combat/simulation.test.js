"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { runTickSimulation } = require("../../src/game/sim/tickSimulation");

function createScenario() {
  return {
    waveNumber: 2,
    tickSeconds: 0.5,
    durationSeconds: 5,
    seed: 12345,
    spawnEvents: [{ time: 0, enemyId: "goblin", count: 1, interval: 0 }],
    enemyCatalog: {
      goblin: {
        hp: 12,
        armor: 0,
        resist: 0,
        moveSpeed: 0.2,
      },
    },
    units: [
      {
        id: "archer_1",
        atk: 6,
        atkSpeed: 2,
        damageType: "physical",
        targeting: "frontMost",
        critChance: 0,
        critMultiplier: 1.5,
        onHitStatuses: [
          {
            statusId: "burn",
            chance: 1,
            duration: 3,
            potency: 2,
          },
        ],
      },
    ],
  };
}

test("simulation is deterministic with fixed seed and inputs", () => {
  const runA = runTickSimulation(createScenario());
  const runB = runTickSimulation(createScenario());

  assert.deepEqual(runA.eventLog, runB.eventLog);
  assert.deepEqual(runA.finalState, runB.finalState);
});

test("event log includes required record types", () => {
  const result = runTickSimulation(createScenario());
  const eventTypes = new Set(result.eventLog.map((entry) => entry.type));

  assert.equal(eventTypes.has("WaveStart"), true);
  assert.equal(eventTypes.has("Spawn"), true);
  assert.equal(eventTypes.has("Damage"), true);
  assert.equal(eventTypes.has("StatusApply"), true);
  assert.equal(eventTypes.has("EnemyDeath"), true);
});
