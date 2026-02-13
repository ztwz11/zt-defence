'use strict';

const { RUNTIME_EVENT_NAMES } = require('./event-names');

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function uniqueStrings(values) {
  if (!Array.isArray(values)) {
    return [];
  }

  const unique = new Set();
  for (const value of values) {
    if (typeof value === 'string' && value.length > 0) {
      unique.add(value);
    }
  }

  return Array.from(unique);
}

function normalizeEventNames(options) {
  if (!isPlainObject(options)) {
    return RUNTIME_EVENT_NAMES.slice();
  }

  const customEventNames = uniqueStrings(options.eventNames);
  return customEventNames.length > 0
    ? customEventNames
    : RUNTIME_EVENT_NAMES.slice();
}

function createRuntimeEventBus(options) {
  const eventNames = normalizeEventNames(options);
  const listenersByEvent = new Map(eventNames.map((eventName) => [eventName, new Set()]));

  function assertEventName(eventName) {
    if (!listenersByEvent.has(eventName)) {
      throw new Error(`unknown runtime event name: ${eventName}`);
    }
  }

  function on(eventName, listener) {
    assertEventName(eventName);
    if (typeof listener !== 'function') {
      throw new TypeError('listener must be a function');
    }

    const listeners = listenersByEvent.get(eventName);
    listeners.add(listener);

    return function unsubscribe() {
      listeners.delete(listener);
    };
  }

  function off(eventName, listener) {
    if (typeof listener !== 'function' || !listenersByEvent.has(eventName)) {
      return false;
    }

    return listenersByEvent.get(eventName).delete(listener);
  }

  function emit(eventName, payload) {
    assertEventName(eventName);

    const listeners = listenersByEvent.get(eventName);
    const stableListeners = Array.from(listeners);
    for (const listener of stableListeners) {
      listener(payload);
    }

    return {
      ok: true,
      delivered: stableListeners.length,
    };
  }

  function clear(eventName) {
    if (eventName === undefined) {
      for (const listeners of listenersByEvent.values()) {
        listeners.clear();
      }
      return;
    }

    assertEventName(eventName);
    listenersByEvent.get(eventName).clear();
  }

  return {
    eventNames: eventNames.slice(),
    on,
    off,
    emit,
    clear,
  };
}

module.exports = {
  createRuntimeEventBus,
};
