'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  RUNTIME_EVENT,
  createRuntimeCoordinator,
  createRuntimeEventBus,
} = require('../../src/runtime');

function createChapterContext() {
  return {
    chapterId: 'chapter_runtime',
    runSeed: 9917,
    waveNumber: 2,
    maxWaves: 5,
    gateHp: 20,
    maxGateHp: 20,
    gold: 8,
    summonCost: 4,
    rerollCost: 2,
    rewards: [{ type: 'Gold', amount: 2 }],
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

function toEventSignature(eventRecord) {
  if (eventRecord.name === RUNTIME_EVENT.RUN_PHASE) {
    const state = eventRecord.payload.state;
    return `${eventRecord.name}|${eventRecord.payload.phase}|${state.waveNumber}|${state.gateHp}|${state.gold}`;
  }

  if (eventRecord.name === RUNTIME_EVENT.HUD_UPDATE) {
    const hud = eventRecord.payload;
    return `${eventRecord.name}|${hud.phase}|${hud.wave}|${hud.gateHp}|${hud.gold}|${hud.summonCost}|${hud.rerollCost}`;
  }

  if (eventRecord.name === RUNTIME_EVENT.SIMULATION_EVENT) {
    const simulationEvent = eventRecord.payload;
    return `${eventRecord.name}|${simulationEvent.eventIndex}|${simulationEvent.time}|${simulationEvent.type}`;
  }

  if (!eventRecord.payload || eventRecord.payload.ok !== true) {
    return `${eventRecord.name}|error`;
  }

  const summary = eventRecord.payload.value.summary;
  return `${eventRecord.name}|ok|${summary.status}|${summary.phase}|${summary.waveNumber}|${summary.nextWaveNumber}`;
}

function runAndCapture(chapterContext) {
  const bus = createRuntimeEventBus();
  const events = [];

  const unsubscribers = [
    bus.on(RUNTIME_EVENT.RUN_PHASE, (payload) => {
      events.push({
        name: RUNTIME_EVENT.RUN_PHASE,
        payload,
      });
    }),
    bus.on(RUNTIME_EVENT.HUD_UPDATE, (payload) => {
      events.push({
        name: RUNTIME_EVENT.HUD_UPDATE,
        payload,
      });
    }),
    bus.on(RUNTIME_EVENT.SIMULATION_EVENT, (payload) => {
      events.push({
        name: RUNTIME_EVENT.SIMULATION_EVENT,
        payload,
      });
    }),
    bus.on(RUNTIME_EVENT.RESULT, (payload) => {
      events.push({
        name: RUNTIME_EVENT.RESULT,
        payload,
      });
    }),
  ];

  const coordinator = createRuntimeCoordinator({ bus });
  const result = coordinator.runWaveSlice(chapterContext);

  for (const unsubscribe of unsubscribers) {
    unsubscribe();
  }

  return {
    result,
    events,
    signature: events.map(toEventSignature),
  };
}

test('runtime event bus enforces typed event names', () => {
  const bus = createRuntimeEventBus();

  assert.throws(() => {
    bus.on('runtime/unknown', () => {});
  }, /unknown runtime event name/);

  assert.throws(() => {
    bus.emit('runtime/unknown', {});
  }, /unknown runtime event name/);
});

test('runtime coordinator emits deterministic event order for identical seed', () => {
  const context = createChapterContext();
  const firstRun = runAndCapture(context);
  const secondRun = runAndCapture(context);

  assert.equal(firstRun.result.ok, true);
  assert.equal(secondRun.result.ok, true);
  assert.deepEqual(firstRun.signature, secondRun.signature);

  const firstNames = firstRun.events.map((event) => event.name);
  assert.equal(firstNames[0], RUNTIME_EVENT.RUN_PHASE);
  assert.equal(firstNames[1], RUNTIME_EVENT.HUD_UPDATE);
  assert.equal(firstNames[firstNames.length - 1], RUNTIME_EVENT.RESULT);

  const lastSimulationIndex = firstNames.lastIndexOf(RUNTIME_EVENT.SIMULATION_EVENT);
  const resultIndex = firstNames.indexOf(RUNTIME_EVENT.RESULT);
  assert.ok(lastSimulationIndex >= 0);
  assert.ok(lastSimulationIndex < resultIndex);
});
