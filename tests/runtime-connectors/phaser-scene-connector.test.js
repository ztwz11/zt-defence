'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { createRuntimeEventBus } = require('../../src/runtime/event-bus');
const { RUNTIME_EVENT } = require('../../src/runtime/event-names');
const { createPhaserSceneConnector } = require('../../src/runtime/connectors');

function createPhasePayload() {
  return {
    phase: 'Prepare',
    state: {
      phase: 'Prepare',
      waveNumber: 1,
      gateHp: 20,
      gold: 8,
      summonCost: 4,
      rerollCost: 2,
      synergyCounts: [{ synergyId: 'forest', count: 3 }],
      relics: ['lucky-clover'],
    },
  };
}

function createSimulationEvent(index, time, type) {
  return {
    eventIndex: index,
    time,
    type,
    payload: {
      type,
      time,
    },
  };
}

function createResultPayload() {
  return {
    ok: true,
    value: {
      summary: {
        status: 'continue',
        phase: 'Prepare',
        waveNumber: 1,
        nextWaveNumber: 2,
      },
    },
  };
}

function runScenario() {
  const bus = createRuntimeEventBus();
  const connector = createPhaserSceneConnector();
  connector.connect(bus);

  const phasePayload = createPhasePayload();
  const simulationEventA = createSimulationEvent(0, 0, 'Spawn');
  const simulationEventB = createSimulationEvent(1, 1, 'EnemyDeath');
  const resultPayload = createResultPayload();

  bus.emit(RUNTIME_EVENT.RUN_PHASE, phasePayload);
  bus.emit(RUNTIME_EVENT.SIMULATION_EVENT, simulationEventA);
  bus.emit(RUNTIME_EVENT.SIMULATION_EVENT, simulationEventB);
  bus.emit(RUNTIME_EVENT.RESULT, resultPayload);

  return {
    bus,
    connector,
    phasePayload,
    simulationEventA,
    simulationEventB,
    resultPayload,
    snapshot: connector.getSnapshot(),
  };
}

test('phaser scene connector consumes runtime events into scene snapshot', () => {
  const scenario = runScenario();
  const snapshot = scenario.snapshot;

  assert.equal(snapshot.connected, true);
  assert.equal(snapshot.connectionCount, 1);
  assert.deepEqual(snapshot.phase, scenario.phasePayload);
  assert.deepEqual(snapshot.simulation, scenario.simulationEventB);
  assert.deepEqual(snapshot.simulationEvents, [
    scenario.simulationEventA,
    scenario.simulationEventB,
  ]);
  assert.deepEqual(snapshot.result, scenario.resultPayload);
  assert.equal(snapshot.phaseEventCount, 1);
  assert.equal(snapshot.simulationEventCount, 2);
  assert.equal(snapshot.resultEventCount, 1);
});

test('phaser scene connector attach/detach is safe across reconnect', () => {
  const connector = createPhaserSceneConnector();
  const busA = createRuntimeEventBus();
  const busB = createRuntimeEventBus();

  assert.doesNotThrow(() => {
    connector.disconnect();
    connector.disconnect();
  });

  connector.connect(busA);
  busA.emit(RUNTIME_EVENT.RUN_PHASE, createPhasePayload());
  assert.equal(connector.getSnapshot().phaseEventCount, 1);

  connector.connect(busB);
  busA.emit(RUNTIME_EVENT.RUN_PHASE, createPhasePayload());
  assert.equal(connector.getSnapshot().phaseEventCount, 1);

  busB.emit(RUNTIME_EVENT.RUN_PHASE, createPhasePayload());
  assert.equal(connector.getSnapshot().phaseEventCount, 2);

  connector.disconnect();
  busB.emit(RUNTIME_EVENT.RUN_PHASE, createPhasePayload());
  assert.equal(connector.getSnapshot().phaseEventCount, 2);
  assert.equal(connector.getSnapshot().connected, false);
});

test('phaser scene connector snapshots are deterministic and immutable', () => {
  const first = runScenario();
  const second = runScenario();
  assert.deepEqual(first.snapshot, second.snapshot);

  first.phasePayload.state.gold = 999;
  first.simulationEventA.payload.type = 'Mutated';
  first.resultPayload.value.summary.status = 'clear';

  const afterPayloadMutation = first.connector.getSnapshot();
  assert.equal(afterPayloadMutation.phase.state.gold, 8);
  assert.equal(afterPayloadMutation.simulationEvents[0].payload.type, 'Spawn');
  assert.equal(afterPayloadMutation.result.value.summary.status, 'continue');

  const leakedSnapshot = first.connector.getSnapshot();
  leakedSnapshot.simulationEvents.length = 0;
  leakedSnapshot.phase.state.phase = 'Result';

  const stableSnapshot = first.connector.getSnapshot();
  assert.equal(stableSnapshot.simulationEvents.length, 2);
  assert.equal(stableSnapshot.phase.state.phase, 'Prepare');
});
