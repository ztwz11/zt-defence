'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { createRuntimeEventBus } = require('../../src/runtime/event-bus');
const { RUNTIME_EVENT } = require('../../src/runtime/event-names');
const {
  createReactHudBinding,
} = require('../../src/runtime/framework-bindings/react-hud-binding');

function createPhasePayload() {
  return {
    phase: 'Prepare',
    state: {
      phase: 'Prepare',
      waveNumber: 3,
      gateHp: 18,
      gold: 10,
      summonCost: 4,
      rerollCost: 2,
      synergyCounts: [{ synergyId: 'fire', count: 2 }],
      relics: ['ember-ring'],
    },
  };
}

function createHudPayload() {
  return {
    gold: 10,
    wave: 3,
    gateHp: 18,
    phase: 'Prepare',
    summonCost: 4,
    rerollCost: 2,
    synergyCounts: [{ synergyId: 'fire', count: 2 }],
    relics: ['ember-ring'],
  };
}

function createResultPayload() {
  return {
    ok: true,
    value: {
      summary: {
        status: 'continue',
        phase: 'Prepare',
        waveNumber: 3,
        nextWaveNumber: 4,
      },
    },
  };
}

function createHudBridgeWithHandlers() {
  return {
    runPhaseCalls: 0,
    hudUpdateCalls: 0,
    resultCalls: 0,
    onRuntimeRunPhase(payload) {
      this.runPhaseCalls += 1;
      this.lastRunPhasePayload = payload;
    },
    onRuntimeHudUpdate(payload) {
      this.hudUpdateCalls += 1;
      this.lastHudPayload = payload;
    },
    onRuntimeResult(payload) {
      this.resultCalls += 1;
      this.lastResultPayload = payload;
    },
  };
}

test('react hud binding consumes runtime events into hud bridge and render counters', () => {
  const bus = createRuntimeEventBus();
  const hud = createHudBridgeWithHandlers();
  const binding = createReactHudBinding({ bus, hud });

  assert.equal(binding.isConnected(), false);
  assert.equal(hud.runtimeConnected, false);
  assert.equal(hud.runtimeRenderCount, 0);

  binding.connect();
  assert.equal(binding.isConnected(), true);

  const phasePayload = createPhasePayload();
  const hudPayload = createHudPayload();
  const resultPayload = createResultPayload();

  bus.emit(RUNTIME_EVENT.RUN_PHASE, phasePayload);
  bus.emit(RUNTIME_EVENT.HUD_UPDATE, hudPayload);
  bus.emit(RUNTIME_EVENT.RESULT, resultPayload);

  const snapshot = binding.getSnapshot();

  assert.equal(hud.runPhaseCalls, 1);
  assert.equal(hud.hudUpdateCalls, 1);
  assert.equal(hud.resultCalls, 1);
  assert.deepEqual(hud.runtimePhase, phasePayload);
  assert.deepEqual(hud.runtimeHudModel, hudPayload);
  assert.deepEqual(hud.runtimeResult, resultPayload);
  assert.equal(hud.runtimeRenderCount, 3);
  assert.equal(hud.runtimePhaseEventCount, 1);
  assert.equal(hud.runtimeHudEventCount, 1);
  assert.equal(hud.runtimeResultEventCount, 1);

  assert.equal(snapshot.connected, true);
  assert.equal(snapshot.connectionCount, 1);
  assert.equal(snapshot.renderCount, 3);
  assert.deepEqual(snapshot.phase, phasePayload);
  assert.deepEqual(snapshot.hudModel, hudPayload);
  assert.deepEqual(snapshot.result, resultPayload);
  assert.equal(snapshot.phaseEventCount, 1);
  assert.equal(snapshot.hudEventCount, 1);
  assert.equal(snapshot.resultEventCount, 1);
});

test('react hud binding reconnects safely and supports setState fallback', () => {
  const busA = createRuntimeEventBus();
  const busB = createRuntimeEventBus();
  const hud = {
    setStateCalls: 0,
    setState(nextState) {
      this.setStateCalls += 1;
      this.lastSetState = nextState;
      Object.assign(this, nextState);
    },
  };
  const binding = createReactHudBinding({ bus: busA, hud });

  binding.connect();
  binding.connect();
  assert.equal(binding.getSnapshot().connectionCount, 1);
  assert.equal(binding.isConnected(), true);

  busA.emit(RUNTIME_EVENT.HUD_UPDATE, createHudPayload());
  assert.equal(binding.getSnapshot().hudEventCount, 1);
  assert.equal(binding.getSnapshot().renderCount, 1);
  assert.equal(hud.setStateCalls, 1);

  binding.connect(busB);
  assert.equal(binding.getSnapshot().connectionCount, 2);
  assert.equal(binding.isConnected(), true);

  busA.emit(RUNTIME_EVENT.HUD_UPDATE, createHudPayload());
  assert.equal(binding.getSnapshot().hudEventCount, 1);
  assert.equal(binding.getSnapshot().renderCount, 1);
  assert.equal(hud.setStateCalls, 1);

  busB.emit(RUNTIME_EVENT.HUD_UPDATE, createHudPayload());
  assert.equal(binding.getSnapshot().hudEventCount, 2);
  assert.equal(binding.getSnapshot().renderCount, 2);
  assert.equal(hud.setStateCalls, 2);
});

test('react hud binding snapshot is immutable against payload and consumer mutation', () => {
  const bus = createRuntimeEventBus();
  const hud = createHudBridgeWithHandlers();
  const binding = createReactHudBinding({ bus, hud });
  binding.connect();

  const phasePayload = createPhasePayload();
  const hudPayload = createHudPayload();
  const resultPayload = createResultPayload();

  bus.emit(RUNTIME_EVENT.RUN_PHASE, phasePayload);
  bus.emit(RUNTIME_EVENT.HUD_UPDATE, hudPayload);
  bus.emit(RUNTIME_EVENT.RESULT, resultPayload);

  phasePayload.state.gold = 999;
  hudPayload.gold = 999;
  resultPayload.value.summary.status = 'clear';

  const afterPayloadMutation = binding.getSnapshot();
  assert.equal(afterPayloadMutation.phase.state.gold, 10);
  assert.equal(afterPayloadMutation.hudModel.gold, 10);
  assert.equal(afterPayloadMutation.result.value.summary.status, 'continue');

  hud.runtimePhase.state.phase = 'Result';
  hud.runtimeHudModel.phase = 'Result';
  hud.runtimeResult.value.summary.status = 'loss';

  const afterHudMutation = binding.getSnapshot();
  assert.equal(afterHudMutation.phase.state.phase, 'Prepare');
  assert.equal(afterHudMutation.hudModel.phase, 'Prepare');
  assert.equal(afterHudMutation.result.value.summary.status, 'continue');

  const leakedSnapshot = binding.getSnapshot();
  leakedSnapshot.phase.state.phase = 'Corrupted';
  leakedSnapshot.hudModel.phase = 'Corrupted';
  leakedSnapshot.result.value.summary.status = 'Corrupted';
  leakedSnapshot.renderCount = 0;

  const stableSnapshot = binding.getSnapshot();
  assert.equal(stableSnapshot.phase.state.phase, 'Prepare');
  assert.equal(stableSnapshot.hudModel.phase, 'Prepare');
  assert.equal(stableSnapshot.result.value.summary.status, 'continue');
  assert.equal(stableSnapshot.renderCount, 3);
});

test('react hud binding lifecycle is idempotent and validates options', () => {
  const bus = createRuntimeEventBus();
  const hud = createHudBridgeWithHandlers();

  assert.throws(
    () => createReactHudBinding(),
    /options must be an object/
  );
  assert.throws(
    () => createReactHudBinding({ bus: null, hud }),
    /options\.bus must provide an on\(eventName, listener\) function/
  );
  assert.throws(
    () => createReactHudBinding({ bus, hud: null }),
    /options\.hud must be an object/
  );

  const binding = createReactHudBinding({ bus, hud });
  assert.equal(binding.isConnected(), false);

  assert.doesNotThrow(() => {
    binding.disconnect();
    binding.disconnect();
  });
  assert.equal(binding.getSnapshot().connected, false);

  binding.connect();
  binding.disconnect();
  binding.disconnect();
  assert.equal(binding.isConnected(), false);
  assert.equal(binding.getSnapshot().connected, false);

  bus.emit(RUNTIME_EVENT.HUD_UPDATE, createHudPayload());
  assert.equal(binding.getSnapshot().hudEventCount, 0);
  assert.equal(binding.getSnapshot().renderCount, 0);
});
