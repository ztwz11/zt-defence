'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { createM0SessionCoordinator } = require('../../src/main/m0/session-coordinator');

function createChapterContext() {
  return {
    chapterId: 'chapter_1',
    runSeed: 424242,
    waveNumber: 1,
    maxWaves: 3,
    gateHp: 20,
    maxGateHp: 20,
    gold: 5,
    economyConfig: {
      waveStartGold: 2,
      waveClearBonusGold: 3,
      interest: {
        enabled: false,
      },
      costs: {
        summon: 4,
        reroll: {
          base: 2,
          increasePerUse: 1,
        },
      },
    },
    rewards: [{ type: 'Gold', amount: 1 }],
    simulation: {
      tickSeconds: 0.5,
      durationSeconds: 5,
      spawnEvents: [{ time: 0, enemyId: 'goblin', count: 1, interval: 0 }],
      enemyCatalog: {
        goblin: {
          hp: 8,
          armor: 0,
          resist: 0,
          moveSpeed: 0.1,
        },
      },
      units: [
        {
          id: 'archer_1',
          atk: 10,
          atkSpeed: 1.5,
          damageType: 'physical',
          targeting: 'frontMost',
          critChance: 0,
          critMultiplier: 1.5,
        },
      ],
    },
  };
}

test('session coordinator runs until terminal status and is deterministic', () => {
  const coordinator = createM0SessionCoordinator();
  const context = createChapterContext();

  const runA = coordinator.runSession(context);
  const runB = coordinator.runSession(context);

  assert.equal(runA.ok, true);
  assert.equal(runB.ok, true);
  assert.deepEqual(runA.value, runB.value);

  assert.equal(runA.value.runSeed, 424242);
  assert.equal(runA.value.finalStatus, 'clear');
  assert.equal(runA.value.reachedWave, 3);
  assert.deepEqual(
    runA.value.snapshots.map((snapshot) => snapshot.status),
    ['continue', 'continue', 'clear']
  );

  for (const snapshot of runA.value.snapshots) {
    assert.deepEqual(Object.keys(snapshot).sort(), ['gateHp', 'gold', 'status', 'wave']);
    assert.equal(typeof snapshot.wave, 'number');
    assert.equal(typeof snapshot.gold, 'number');
    assert.equal(typeof snapshot.gateHp, 'number');
  }
});
