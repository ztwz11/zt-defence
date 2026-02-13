'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { createRuntimeEventBus } = require('../../src/runtime/event-bus');
const { RUNTIME_EVENT } = require('../../src/runtime/event-names');
const {
  createPhaserSceneBinding,
} = require('../../src/runtime/framework-bindings/phaser-scene-binding');

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

function createSceneBridge() {
  return {
    runPhaseCalls: 0,
    simulationCalls: 0,
    resultCalls: 0,
    onRunPhase(payload) {
      this.runPhaseCalls += 1;
      this.lastRunPhasePayload = payload;
    },
    onSimulationEvent(payload) {
      this.simulationCalls += 1;
      this.lastSimulationPayload = payload;
    },
    onResult(payload) {
      this.resultCalls += 1;
      this.lastResultPayload = payload;
    },
  };
}

test('phaser scene binding consumes runtime events into scene bridge and snapshot', () => {
  const bus = createRuntimeEventBus();
  const scene = createSceneBridge();
  const binding = createPhaserSceneBinding({ bus, scene });

  assert.equal(binding.isConnected(), false);
  binding.connect();
  assert.equal(binding.isConnected(), true);

  const phasePayload = createPhasePayload();
  const simulationEventA = createSimulationEvent(0, 0, 'Spawn');
  const simulationEventB = createSimulationEvent(1, 1, 'EnemyDeath');
  const resultPayload = createResultPayload();

  bus.emit(RUNTIME_EVENT.RUN_PHASE, phasePayload);
  bus.emit(RUNTIME_EVENT.SIMULATION_EVENT, simulationEventA);
  bus.emit(RUNTIME_EVENT.SIMULATION_EVENT, simulationEventB);
  bus.emit(RUNTIME_EVENT.RESULT, resultPayload);

  const snapshot = binding.getSnapshot();

  assert.equal(scene.runPhaseCalls, 1);
  assert.equal(scene.simulationCalls, 2);
  assert.equal(scene.resultCalls, 1);
  assert.deepEqual(scene.runtimePhase, phasePayload);
  assert.deepEqual(scene.runtimeSimulationEvent, simulationEventB);
  assert.deepEqual(scene.runtimeSimulationEvents, [simulationEventA, simulationEventB]);
  assert.deepEqual(scene.runtimeResult, resultPayload);

  assert.equal(snapshot.connected, true);
  assert.equal(snapshot.connectionCount, 1);
  assert.deepEqual(snapshot.phase, phasePayload);
  assert.deepEqual(snapshot.simulation, simulationEventB);
  assert.deepEqual(snapshot.simulationEvents, [simulationEventA, simulationEventB]);
  assert.deepEqual(snapshot.result, resultPayload);
  assert.equal(snapshot.phaseEventCount, 1);
  assert.equal(snapshot.simulationEventCount, 2);
  assert.equal(snapshot.resultEventCount, 1);
});

test('phaser scene binding reconnects safely and unsubscribes from old bus', () => {
  const busA = createRuntimeEventBus();
  const busB = createRuntimeEventBus();
  const scene = createSceneBridge();
  const binding = createPhaserSceneBinding({ bus: busA, scene });

  binding.connect();
  busA.emit(RUNTIME_EVENT.RUN_PHASE, createPhasePayload());
  assert.equal(binding.getSnapshot().phaseEventCount, 1);

  binding.connect(busB);
  assert.equal(binding.getSnapshot().connectionCount, 2);
  assert.equal(binding.isConnected(), true);

  busA.emit(RUNTIME_EVENT.RUN_PHASE, createPhasePayload());
  assert.equal(binding.getSnapshot().phaseEventCount, 1);

  busB.emit(RUNTIME_EVENT.RUN_PHASE, createPhasePayload());
  assert.equal(binding.getSnapshot().phaseEventCount, 2);
});

test('phaser scene binding supports configurable scene method names', () => {
  const bus = createRuntimeEventBus();
  const scene = {
    phaseCalls: 0,
    simulationCalls: 0,
    resultCalls: 0,
    handlePhase(payload) {
      this.phaseCalls += 1;
      this.lastPhase = payload;
    },
    handleSimulation(payload) {
      this.simulationCalls += 1;
      this.lastSimulation = payload;
    },
    handleResult(payload) {
      this.resultCalls += 1;
      this.lastResult = payload;
    },
  };
  const binding = createPhaserSceneBinding({
    bus,
    scene,
    methodNames: {
      runPhase: 'handlePhase',
      simulationEvent: 'handleSimulation',
      result: 'handleResult',
    },
  });

  binding.connect();
  const phasePayload = createPhasePayload();
  const simulationEvent = createSimulationEvent(0, 0, 'Spawn');
  const resultPayload = createResultPayload();

  bus.emit(RUNTIME_EVENT.RUN_PHASE, phasePayload);
  bus.emit(RUNTIME_EVENT.SIMULATION_EVENT, simulationEvent);
  bus.emit(RUNTIME_EVENT.RESULT, resultPayload);

  assert.equal(scene.phaseCalls, 1);
  assert.equal(scene.simulationCalls, 1);
  assert.equal(scene.resultCalls, 1);
  assert.deepEqual(scene.lastPhase, phasePayload);
  assert.deepEqual(scene.lastSimulation, simulationEvent);
  assert.deepEqual(scene.lastResult, resultPayload);
});

test('phaser scene binding falls back to runtime-prefixed handler defaults', () => {
  const bus = createRuntimeEventBus();
  const scene = {
    runPhaseCalls: 0,
    simulationCalls: 0,
    resultCalls: 0,
    onRuntimeRunPhase() {
      this.runPhaseCalls += 1;
    },
    onRuntimeSimulationEvent() {
      this.simulationCalls += 1;
    },
    onRuntimeResult() {
      this.resultCalls += 1;
    },
  };
  const binding = createPhaserSceneBinding({ bus, scene });
  binding.connect();

  bus.emit(RUNTIME_EVENT.RUN_PHASE, createPhasePayload());
  bus.emit(RUNTIME_EVENT.SIMULATION_EVENT, createSimulationEvent(0, 0, 'Spawn'));
  bus.emit(RUNTIME_EVENT.RESULT, createResultPayload());

  assert.equal(scene.runPhaseCalls, 1);
  assert.equal(scene.simulationCalls, 1);
  assert.equal(scene.resultCalls, 1);
});

test('phaser scene binding snapshot is immutable against payload and consumer mutation', () => {
  const bus = createRuntimeEventBus();
  const scene = createSceneBridge();
  const binding = createPhaserSceneBinding({ bus, scene });
  binding.connect();

  const phasePayload = createPhasePayload();
  const simulationEvent = createSimulationEvent(0, 0, 'Spawn');
  const resultPayload = createResultPayload();

  bus.emit(RUNTIME_EVENT.RUN_PHASE, phasePayload);
  bus.emit(RUNTIME_EVENT.SIMULATION_EVENT, simulationEvent);
  bus.emit(RUNTIME_EVENT.RESULT, resultPayload);

  phasePayload.state.gold = 999;
  simulationEvent.payload.type = 'Mutated';
  resultPayload.value.summary.status = 'clear';

  const afterPayloadMutation = binding.getSnapshot();
  assert.equal(afterPayloadMutation.phase.state.gold, 8);
  assert.equal(afterPayloadMutation.simulationEvents[0].payload.type, 'Spawn');
  assert.equal(afterPayloadMutation.result.value.summary.status, 'continue');

  scene.runtimePhase.state.phase = 'Result';
  scene.runtimeSimulationEvents[0].payload.type = 'SceneMutation';
  scene.runtimeResult.value.summary.status = 'loss';

  const afterSceneMutation = binding.getSnapshot();
  assert.equal(afterSceneMutation.phase.state.phase, 'Prepare');
  assert.equal(afterSceneMutation.simulationEvents[0].payload.type, 'Spawn');
  assert.equal(afterSceneMutation.result.value.summary.status, 'continue');

  const leakedSnapshot = binding.getSnapshot();
  leakedSnapshot.phase.state.phase = 'Corrupted';
  leakedSnapshot.simulationEvents.length = 0;
  leakedSnapshot.result.value.summary.status = 'Corrupted';

  const stableSnapshot = binding.getSnapshot();
  assert.equal(stableSnapshot.phase.state.phase, 'Prepare');
  assert.equal(stableSnapshot.simulationEvents.length, 1);
  assert.equal(stableSnapshot.result.value.summary.status, 'continue');
});

test('phaser scene binding lifecycle is idempotent and validates options', () => {
  const scene = createSceneBridge();
  const bus = createRuntimeEventBus();

  assert.throws(
    () => createPhaserSceneBinding(),
    /options must be an object/
  );
  assert.throws(
    () => createPhaserSceneBinding({ scene, bus: null }),
    /options\.bus must provide an on\(eventName, listener\) function/
  );
  assert.throws(
    () => createPhaserSceneBinding({ bus, scene: null }),
    /options\.scene must be an object/
  );

  const binding = createPhaserSceneBinding({ bus, scene });
  assert.equal(binding.isConnected(), false);

  assert.doesNotThrow(() => {
    binding.disconnect();
    binding.disconnect();
  });
  assert.equal(binding.getSnapshot().connected, false);

  binding.connect();
  binding.connect();
  assert.equal(binding.getSnapshot().connectionCount, 1);

  binding.disconnect();
  binding.disconnect();
  assert.equal(binding.isConnected(), false);
  assert.equal(binding.getSnapshot().connected, false);

  bus.emit(RUNTIME_EVENT.RUN_PHASE, createPhasePayload());
  assert.equal(binding.getSnapshot().phaseEventCount, 0);
});
