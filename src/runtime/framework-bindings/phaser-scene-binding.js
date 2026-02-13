'use strict';

const { RUNTIME_EVENT } = require('../event-names');

const DEFAULT_METHOD_NAMES = Object.freeze({
  runPhase: 'onRunPhase',
  simulationEvent: 'onSimulationEvent',
  result: 'onResult',
});

const DEFAULT_METHOD_ALIASES = Object.freeze({
  runPhase: Object.freeze(['onRuntimeRunPhase']),
  simulationEvent: Object.freeze(['onRuntimeSimulationEvent']),
  result: Object.freeze(['onRuntimeResult']),
});

const DEFAULT_STATE_KEYS = Object.freeze({
  phase: 'runtimePhase',
  simulation: 'runtimeSimulationEvent',
  simulationEvents: 'runtimeSimulationEvents',
  result: 'runtimeResult',
});

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.length > 0;
}

function cloneValue(value) {
  if (Array.isArray(value)) {
    return value.map(cloneValue);
  }

  if (!isPlainObject(value)) {
    return value;
  }

  const clone = {};
  const keys = Object.keys(value);
  for (const key of keys) {
    clone[key] = cloneValue(value[key]);
  }

  return clone;
}

function resolveNameMap(defaultMap, customMap) {
  if (!isPlainObject(customMap)) {
    return { ...defaultMap };
  }

  const resolved = { ...defaultMap };
  const keys = Object.keys(defaultMap);
  for (const key of keys) {
    if (isNonEmptyString(customMap[key])) {
      resolved[key] = customMap[key];
    }
  }

  return resolved;
}

function assertBus(bus, fieldName) {
  if (!bus || typeof bus.on !== 'function') {
    throw new TypeError(
      `${fieldName} must provide an on(eventName, listener) function`
    );
  }
}

function assertScene(scene) {
  if (!isPlainObject(scene)) {
    throw new TypeError('options.scene must be an object');
  }
}

function createInitialSnapshot() {
  return {
    connected: false,
    connectionCount: 0,
    phase: null,
    simulation: null,
    simulationEvents: [],
    result: null,
    phaseEventCount: 0,
    simulationEventCount: 0,
    resultEventCount: 0,
  };
}

function toUnsubscribe(value) {
  if (typeof value === 'function') {
    return value;
  }

  return function noop() {};
}

function listHandlerCandidates(handlerName, methodNames) {
  const primaryName = methodNames[handlerName];
  const candidates = [];

  if (isNonEmptyString(primaryName)) {
    candidates.push(primaryName);
  }

  if (primaryName !== DEFAULT_METHOD_NAMES[handlerName]) {
    return candidates;
  }

  const aliases = DEFAULT_METHOD_ALIASES[handlerName];
  if (!Array.isArray(aliases)) {
    return candidates;
  }

  for (const alias of aliases) {
    if (isNonEmptyString(alias) && !candidates.includes(alias)) {
      candidates.push(alias);
    }
  }

  return candidates;
}

function createPhaserSceneBinding(options) {
  if (!isPlainObject(options)) {
    throw new TypeError('options must be an object');
  }

  assertBus(options.bus, 'options.bus');
  assertScene(options.scene);

  let currentBus = options.bus;
  const scene = options.scene;
  const methodNames = resolveNameMap(DEFAULT_METHOD_NAMES, options.methodNames);
  const stateKeys = resolveNameMap(DEFAULT_STATE_KEYS, options.stateKeys);
  const snapshot = createInitialSnapshot();

  let connected = false;
  let unsubscribers = [];

  function callSceneHandler(handlerName, payload) {
    const candidateMethodNames = listHandlerCandidates(handlerName, methodNames);
    for (const methodName of candidateMethodNames) {
      const handler = scene[methodName];
      if (typeof handler === 'function') {
        handler.call(scene, cloneValue(payload));
        return;
      }
    }
  }

  function persistRunPhase(payload) {
    const valueForSnapshot = cloneValue(payload);
    snapshot.phase = valueForSnapshot;
    snapshot.phaseEventCount += 1;

    scene[stateKeys.phase] = cloneValue(valueForSnapshot);
    callSceneHandler('runPhase', valueForSnapshot);
  }

  function persistSimulationEvent(payload) {
    const valueForSnapshot = cloneValue(payload);
    snapshot.simulation = valueForSnapshot;
    snapshot.simulationEvents.push(valueForSnapshot);
    snapshot.simulationEventCount += 1;

    scene[stateKeys.simulation] = cloneValue(valueForSnapshot);
    if (!Array.isArray(scene[stateKeys.simulationEvents])) {
      scene[stateKeys.simulationEvents] = [];
    }
    scene[stateKeys.simulationEvents].push(cloneValue(valueForSnapshot));

    callSceneHandler('simulationEvent', valueForSnapshot);
  }

  function persistResult(payload) {
    const valueForSnapshot = cloneValue(payload);
    snapshot.result = valueForSnapshot;
    snapshot.resultEventCount += 1;

    scene[stateKeys.result] = cloneValue(valueForSnapshot);
    callSceneHandler('result', valueForSnapshot);
  }

  function subscribe(bus) {
    return [
      toUnsubscribe(bus.on(RUNTIME_EVENT.RUN_PHASE, persistRunPhase)),
      toUnsubscribe(bus.on(RUNTIME_EVENT.SIMULATION_EVENT, persistSimulationEvent)),
      toUnsubscribe(bus.on(RUNTIME_EVENT.RESULT, persistResult)),
    ];
  }

  function connect(nextBus) {
    const bus = nextBus === undefined ? currentBus : nextBus;
    assertBus(bus, 'connect(bus)');

    if (connected && bus === currentBus) {
      return getSnapshot();
    }

    disconnect();

    currentBus = bus;
    unsubscribers = subscribe(currentBus);
    connected = true;
    snapshot.connected = true;
    snapshot.connectionCount += 1;

    return getSnapshot();
  }

  function disconnect() {
    if (!connected) {
      snapshot.connected = false;
      return getSnapshot();
    }

    connected = false;
    snapshot.connected = false;

    const activeUnsubscribers = unsubscribers.slice();
    unsubscribers = [];
    for (const unsubscribe of activeUnsubscribers) {
      unsubscribe();
    }

    return getSnapshot();
  }

  function isConnected() {
    return connected;
  }

  function getSnapshot() {
    return cloneValue(snapshot);
  }

  return {
    connect,
    disconnect,
    isConnected,
    getSnapshot,
  };
}

module.exports = {
  createPhaserSceneBinding,
};
