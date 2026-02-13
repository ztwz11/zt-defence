'use strict';

const { RUNTIME_EVENT } = require('../event-names');

const DEFAULT_METHOD_NAMES = Object.freeze({
  runPhase: 'onRuntimeRunPhase',
  hudUpdate: 'onRuntimeHudUpdate',
  result: 'onRuntimeResult',
});

const DEFAULT_STATE_KEYS = Object.freeze({
  connected: 'runtimeConnected',
  connectionCount: 'runtimeConnectionCount',
  renderCount: 'runtimeRenderCount',
  phase: 'runtimePhase',
  hudModel: 'runtimeHudModel',
  result: 'runtimeResult',
  phaseEventCount: 'runtimePhaseEventCount',
  hudEventCount: 'runtimeHudEventCount',
  resultEventCount: 'runtimeResultEventCount',
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

function assertHud(hud) {
  if (!isPlainObject(hud)) {
    throw new TypeError('options.hud must be an object');
  }
}

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

function toUnsubscribe(value) {
  if (typeof value === 'function') {
    return value;
  }

  return function noop() {};
}

function createReactHudBinding(options) {
  if (!isPlainObject(options)) {
    throw new TypeError('options must be an object');
  }

  assertBus(options.bus, 'options.bus');
  assertHud(options.hud);

  let currentBus = options.bus;
  const hud = options.hud;
  const methodNames = resolveNameMap(DEFAULT_METHOD_NAMES, options.methodNames);
  const stateKeys = resolveNameMap(DEFAULT_STATE_KEYS, options.stateKeys);
  const snapshot = createInitialSnapshot();

  let connected = false;
  let unsubscribers = [];

  function toBridgeState() {
    return {
      [stateKeys.connected]: snapshot.connected,
      [stateKeys.connectionCount]: snapshot.connectionCount,
      [stateKeys.renderCount]: snapshot.renderCount,
      [stateKeys.phase]: cloneValue(snapshot.phase),
      [stateKeys.hudModel]: cloneValue(snapshot.hudModel),
      [stateKeys.result]: cloneValue(snapshot.result),
      [stateKeys.phaseEventCount]: snapshot.phaseEventCount,
      [stateKeys.hudEventCount]: snapshot.hudEventCount,
      [stateKeys.resultEventCount]: snapshot.resultEventCount,
    };
  }

  function syncHudBridgeState() {
    const bridgeState = toBridgeState();
    const keys = Object.keys(bridgeState);
    for (const key of keys) {
      hud[key] = bridgeState[key];
    }
    return bridgeState;
  }

  function callHudHandler(handlerName, payload) {
    const methodName = methodNames[handlerName];
    const handler = hud[methodName];
    if (typeof handler === 'function') {
      handler.call(hud, cloneValue(payload), getSnapshot());
      return true;
    }
    return false;
  }

  function applyEventUpdate(handlerName, payload) {
    const bridgeState = syncHudBridgeState();
    const handled = callHudHandler(handlerName, payload);
    if (!handled && typeof hud.setState === 'function') {
      hud.setState(cloneValue(bridgeState));
    }
  }

  function persistRunPhase(payload) {
    snapshot.phase = cloneValue(payload);
    snapshot.phaseEventCount += 1;
    snapshot.renderCount += 1;

    applyEventUpdate('runPhase', payload);
  }

  function persistHudUpdate(payload) {
    snapshot.hudModel = cloneValue(payload);
    snapshot.hudEventCount += 1;
    snapshot.renderCount += 1;

    applyEventUpdate('hudUpdate', payload);
  }

  function persistResult(payload) {
    snapshot.result = cloneValue(payload);
    snapshot.resultEventCount += 1;
    snapshot.renderCount += 1;

    applyEventUpdate('result', payload);
  }

  function subscribe(bus) {
    return [
      toUnsubscribe(bus.on(RUNTIME_EVENT.RUN_PHASE, persistRunPhase)),
      toUnsubscribe(bus.on(RUNTIME_EVENT.HUD_UPDATE, persistHudUpdate)),
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

    syncHudBridgeState();
    return getSnapshot();
  }

  function disconnect() {
    if (!connected) {
      snapshot.connected = false;
      syncHudBridgeState();
      return getSnapshot();
    }

    connected = false;
    snapshot.connected = false;

    const activeUnsubscribers = unsubscribers.slice();
    unsubscribers = [];
    for (const unsubscribe of activeUnsubscribers) {
      unsubscribe();
    }

    syncHudBridgeState();
    return getSnapshot();
  }

  function isConnected() {
    return connected;
  }

  function getSnapshot() {
    return cloneValue(snapshot);
  }

  syncHudBridgeState();

  return {
    connect,
    disconnect,
    isConnected,
    getSnapshot,
  };
}

module.exports = {
  createReactHudBinding,
};
