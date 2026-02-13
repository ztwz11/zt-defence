'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { createRuntimeEventBus } = require('../../src/runtime/event-bus');
const { RUNTIME_EVENT } = require('../../src/runtime/event-names');
const { createReactHudConnector } = require('../../src/runtime/connectors');

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

function runScenario() {
  const bus = createRuntimeEventBus();
  const connector = createReactHudConnector();
  connector.connect(bus);

  const phasePayload = createPhasePayload();
  const hudPayload = createHudPayload();
  const resultPayload = createResultPayload();

  bus.emit(RUNTIME_EVENT.RUN_PHASE, phasePayload);
  bus.emit(RUNTIME_EVENT.HUD_UPDATE, hudPayload);
  bus.emit(RUNTIME_EVENT.RESULT, resultPayload);

  return {
    bus,
    connector,
    phasePayload,
    hudPayload,
    resultPayload,
    snapshot: connector.getSnapshot(),
  };
}

test('react hud connector consumes runtime events into hud model snapshot', () => {
  const scenario = runScenario();
  const snapshot = scenario.snapshot;

  assert.equal(snapshot.connected, true);
  assert.equal(snapshot.connectionCount, 1);
  assert.deepEqual(snapshot.phase, scenario.phasePayload);
  assert.deepEqual(snapshot.hudModel, scenario.hudPayload);
  assert.deepEqual(snapshot.result, scenario.resultPayload);
  assert.equal(snapshot.phaseEventCount, 1);
  assert.equal(snapshot.hudEventCount, 1);
  assert.equal(snapshot.resultEventCount, 1);
  assert.equal(snapshot.renderCount, 3);
});

test('react hud connector attach/detach is safe across reconnect', () => {
  const connector = createReactHudConnector();
  const busA = createRuntimeEventBus();
  const busB = createRuntimeEventBus();

  assert.doesNotThrow(() => {
    connector.disconnect();
    connector.disconnect();
  });

  connector.connect(busA);
  busA.emit(RUNTIME_EVENT.HUD_UPDATE, createHudPayload());
  assert.equal(connector.getSnapshot().hudEventCount, 1);
  assert.equal(connector.getSnapshot().renderCount, 1);

  connector.connect(busB);
  busA.emit(RUNTIME_EVENT.HUD_UPDATE, createHudPayload());
  assert.equal(connector.getSnapshot().hudEventCount, 1);
  assert.equal(connector.getSnapshot().renderCount, 1);

  busB.emit(RUNTIME_EVENT.HUD_UPDATE, createHudPayload());
  assert.equal(connector.getSnapshot().hudEventCount, 2);
  assert.equal(connector.getSnapshot().renderCount, 2);

  connector.disconnect();
  busB.emit(RUNTIME_EVENT.HUD_UPDATE, createHudPayload());
  assert.equal(connector.getSnapshot().hudEventCount, 2);
  assert.equal(connector.getSnapshot().connected, false);
});

test('react hud connector snapshots are deterministic and immutable', () => {
  const first = runScenario();
  const second = runScenario();
  assert.deepEqual(first.snapshot, second.snapshot);

  first.phasePayload.state.gold = 999;
  first.hudPayload.gold = 999;
  first.resultPayload.value.summary.status = 'clear';

  const afterPayloadMutation = first.connector.getSnapshot();
  assert.equal(afterPayloadMutation.phase.state.gold, 10);
  assert.equal(afterPayloadMutation.hudModel.gold, 10);
  assert.equal(afterPayloadMutation.result.value.summary.status, 'continue');

  const leakedSnapshot = first.connector.getSnapshot();
  leakedSnapshot.hudModel.phase = 'Result';
  leakedSnapshot.renderCount = 0;

  const stableSnapshot = first.connector.getSnapshot();
  assert.equal(stableSnapshot.hudModel.phase, 'Prepare');
  assert.equal(stableSnapshot.renderCount, 3);
});
