'use strict';

const { createReactHudFacade } = require('../react-hud-facade');
const { cloneSnapshotValue } = require('./snapshot-utils');

function createInitialSnapshot() {
  return {
    connected: false,
    connectionCount: 0,
    renderCount: 0,
    phase: null,
    hudModel: null,
    result: null,
    phaseEventCount: 0,
    hudEventCount: 0,
    resultEventCount: 0,
  };
}

function createReactHudConnector() {
  let facade = null;
  const snapshot = createInitialSnapshot();

  function connect(bus) {
    disconnect();

    facade = createReactHudFacade(bus, {
      onRunPhase(eventPayload) {
        snapshot.phase = cloneSnapshotValue(eventPayload);
        snapshot.phaseEventCount += 1;
        snapshot.renderCount += 1;
      },
      onHudUpdate(eventPayload) {
        snapshot.hudModel = cloneSnapshotValue(eventPayload);
        snapshot.hudEventCount += 1;
        snapshot.renderCount += 1;
      },
      onResult(eventPayload) {
        snapshot.result = cloneSnapshotValue(eventPayload);
        snapshot.resultEventCount += 1;
        snapshot.renderCount += 1;
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
  createReactHudConnector,
};
