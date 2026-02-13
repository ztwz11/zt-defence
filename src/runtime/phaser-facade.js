'use strict';

const { RUNTIME_EVENT } = require('./event-names');

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function assertBus(bus) {
  if (!bus || typeof bus.on !== 'function') {
    throw new TypeError('bus must provide an on(eventName, listener) function');
  }
}

function createPhaserFacade(bus, callbacks) {
  assertBus(bus);

  const config = isPlainObject(callbacks) ? callbacks : {};
  const onRunPhase =
    typeof config.onRunPhase === 'function' ? config.onRunPhase : () => {};
  const onSimulationEvent =
    typeof config.onSimulationEvent === 'function'
      ? config.onSimulationEvent
      : () => {};
  const onResult = typeof config.onResult === 'function' ? config.onResult : () => {};

  const unsubscribers = [
    bus.on(RUNTIME_EVENT.RUN_PHASE, (eventPayload) => {
      onRunPhase(eventPayload);
    }),
    bus.on(RUNTIME_EVENT.SIMULATION_EVENT, (eventPayload) => {
      onSimulationEvent(eventPayload);
    }),
    bus.on(RUNTIME_EVENT.RESULT, (eventPayload) => {
      onResult(eventPayload);
    }),
  ];

  let disposed = false;

  function dispose() {
    if (disposed) {
      return;
    }

    disposed = true;
    for (const unsubscribe of unsubscribers) {
      unsubscribe();
    }
  }

  return {
    dispose,
    isDisposed() {
      return disposed;
    },
  };
}

module.exports = {
  createPhaserFacade,
};
