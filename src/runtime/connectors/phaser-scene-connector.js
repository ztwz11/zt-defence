'use strict';

const { createPhaserFacade } = require('../phaser-facade');
const { cloneSnapshotValue } = require('./snapshot-utils');

function createInitialSnapshot() {
  return {
    connected: false,
    connectionCount: 0,
    phase: null,
    simulation: null,
    result: null,
    simulationEvents: [],
    phaseEventCount: 0,
    simulationEventCount: 0,
    resultEventCount: 0,
  };
}

function createPhaserSceneConnector() {
  let facade = null;
  const snapshot = createInitialSnapshot();

  function connect(bus) {
    disconnect();

    facade = createPhaserFacade(bus, {
      onRunPhase(eventPayload) {
        snapshot.phase = cloneSnapshotValue(eventPayload);
        snapshot.phaseEventCount += 1;
      },
      onSimulationEvent(eventPayload) {
        const nextEvent = cloneSnapshotValue(eventPayload);
        snapshot.simulation = nextEvent;
        snapshot.simulationEvents.push(nextEvent);
        snapshot.simulationEventCount += 1;
      },
      onResult(eventPayload) {
        snapshot.result = cloneSnapshotValue(eventPayload);
        snapshot.resultEventCount += 1;
      },
    });

    snapshot.connected = true;
    snapshot.connectionCount += 1;
    return getSnapshot();
  }

  function disconnect() {
    if (!facade) {
      snapshot.connected = false;
      return getSnapshot();
    }

    facade.dispose();
    facade = null;
    snapshot.connected = false;
    return getSnapshot();
  }

  function getSnapshot() {
    return cloneSnapshotValue(snapshot);
  }

  return {
    connect,
    disconnect,
    getSnapshot,
  };
}

module.exports = {
  createPhaserSceneConnector,
};
