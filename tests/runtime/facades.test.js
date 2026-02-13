'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  RUNTIME_EVENT,
  createPhaserFacade,
  createReactHudFacade,
  createRuntimeEventBus,
} = require('../../src/runtime');

test('facades are framework-agnostic callback routers', () => {
  const bus = createRuntimeEventBus();

  let phaseCalls = 0;
  let simulationCalls = 0;
  let hudCalls = 0;
  let resultCalls = 0;

  const phaserFacade = createPhaserFacade(bus, {
    onRunPhase() {
      phaseCalls += 1;
    },
    onSimulationEvent() {
      simulationCalls += 1;
    },
    onResult() {
      resultCalls += 1;
    },
  });

  const reactHudFacade = createReactHudFacade(bus, {
    onRunPhase() {
      phaseCalls += 1;
    },
    onHudUpdate() {
      hudCalls += 1;
    },
    onResult() {
      resultCalls += 1;
    },
  });

  bus.emit(RUNTIME_EVENT.RUN_PHASE, {
    phase: 'Prepare',
    state: {
      phase: 'Prepare',
      waveNumber: 1,
      gateHp: 20,
      gold: 8,
      summonCost: 4,
      rerollCost: 2,
      synergyCounts: [],
      relics: [],
    },
  });
  bus.emit(RUNTIME_EVENT.SIMULATION_EVENT, {
    eventIndex: 0,
    time: 0,
    type: 'Spawn',
    payload: {
      type: 'Spawn',
      time: 0,
    },
  });
  bus.emit(RUNTIME_EVENT.HUD_UPDATE, {
    gold: 8,
    wave: 1,
    gateHp: 20,
    phase: 'Prepare',
    summonCost: 4,
    rerollCost: 2,
    synergyCounts: [],
    relics: [],
  });
  bus.emit(RUNTIME_EVENT.RESULT, {
    ok: true,
    value: {
      summary: {
        status: 'continue',
      },
    },
  });

  assert.equal(phaseCalls, 2);
  assert.equal(simulationCalls, 1);
  assert.equal(hudCalls, 1);
  assert.equal(resultCalls, 2);

  phaserFacade.dispose();
  reactHudFacade.dispose();

  bus.emit(RUNTIME_EVENT.RUN_PHASE, {
    phase: 'Result',
    state: {
      phase: 'Result',
      waveNumber: 2,
      gateHp: 18,
      gold: 10,
      summonCost: 4,
      rerollCost: 2,
      synergyCounts: [],
      relics: [],
    },
  });
  bus.emit(RUNTIME_EVENT.SIMULATION_EVENT, {
    eventIndex: 1,
    time: 1,
    type: 'EnemyDeath',
    payload: {
      type: 'EnemyDeath',
      time: 1,
    },
  });
  bus.emit(RUNTIME_EVENT.HUD_UPDATE, {
    gold: 10,
    wave: 2,
    gateHp: 18,
    phase: 'Result',
    summonCost: 4,
    rerollCost: 2,
    synergyCounts: [],
    relics: [],
  });
  bus.emit(RUNTIME_EVENT.RESULT, {
    ok: true,
    value: {
      summary: {
        status: 'clear',
      },
    },
  });

  assert.equal(phaseCalls, 2);
  assert.equal(simulationCalls, 1);
  assert.equal(hudCalls, 1);
  assert.equal(resultCalls, 2);
  assert.equal(phaserFacade.isDisposed(), true);
  assert.equal(reactHudFacade.isDisposed(), true);
});
