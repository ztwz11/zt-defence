'use strict';

const { createRunOrchestrationService } = require('../../run-orchestration-service');
const { createRuntimeBridge } = require('../create-runtime-bridge');
const {
  RUNTIME_EVENT,
  RUNTIME_EVENT_NAMES,
  createPhaserFacade,
  createReactHudFacade,
} = require('../../../runtime');

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function toFiniteNumber(value, fallback) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function toPositiveInteger(value, fallback) {
  return Math.max(1, Math.floor(toFiniteNumber(value, fallback)));
}

function toNonNegativeInteger(value, fallback) {
  return Math.max(0, Math.floor(toFiniteNumber(value, fallback)));
}

function cloneArray(value) {
  return Array.isArray(value) ? value.slice() : [];
}

function cloneObject(value) {
  return isPlainObject(value) ? { ...value } : {};
}

function normalizeStatus(status) {
  return status === 'clear' || status === 'fail' ? status : 'continue';
}

function normalizeChapterId(chapterId) {
  return typeof chapterId === 'string' && chapterId.length > 0 ? chapterId : 'chapter_1';
}

function createSimulationContext(simulation, runSeed, waveNumber) {
  const baseSimulation = isPlainObject(simulation) ? simulation : {};
  return {
    ...baseSimulation,
    waveNumber,
    seed: runSeed + waveNumber - 1,
  };
}

function normalizeSessionInput(chapterContext, runOptions) {
  const source = isPlainObject(chapterContext) ? chapterContext : {};
  const options = isPlainObject(runOptions) ? runOptions : {};
  const runSeed = toNonNegativeInteger(source.runSeed, 0);
  const waveNumber = toPositiveInteger(source.waveNumber, 1);
  const contextMaxWaves = Math.max(waveNumber, toPositiveInteger(source.maxWaves, waveNumber));
  const maxWaves = options.maxWaves === undefined
    ? contextMaxWaves
    : Math.max(waveNumber, toPositiveInteger(options.maxWaves, contextMaxWaves));

  return {
    maxSlices: maxWaves - waveNumber + 1,
    context: {
      ...source,
      chapterId: normalizeChapterId(source.chapterId),
      runSeed,
      waveNumber,
      maxWaves,
      gateHp: Math.max(0, toFiniteNumber(source.gateHp, 20)),
      gold: Math.max(0, toFiniteNumber(source.gold, 0)),
      relics: cloneArray(source.relics),
      synergyCounts: cloneArray(source.synergyCounts),
      simulation: createSimulationContext(source.simulation, runSeed, waveNumber),
    },
  };
}

function buildNextWaveContext(previousContext, runPayload) {
  const summary = isPlainObject(runPayload?.summary) ? runPayload.summary : {};
  const hud = isPlainObject(runPayload?.hud) ? runPayload.hud : {};
  const nextWaveNumber = toPositiveInteger(
    summary.nextWaveNumber,
    toPositiveInteger(previousContext.waveNumber, 1) + 1
  );
  const runSeed = toNonNegativeInteger(previousContext.runSeed, 0);
  const nextContext = {
    ...previousContext,
    waveNumber: nextWaveNumber,
    gateHp: Math.max(0, toFiniteNumber(summary.gateHp, previousContext.gateHp)),
    gold: Math.max(0, toFiniteNumber(summary.gold, previousContext.gold)),
    relics: cloneArray(Array.isArray(hud.relics) ? hud.relics : previousContext.relics),
    synergyCounts: cloneArray(
      Array.isArray(hud.synergyCounts) ? hud.synergyCounts : previousContext.synergyCounts
    ),
  };
  nextContext.simulation = createSimulationContext(previousContext.simulation, runSeed, nextWaveNumber);
  return nextContext;
}

function buildWaveSnapshot(runPayload) {
  const summary = isPlainObject(runPayload?.summary) ? runPayload.summary : {};
  return {
    wave: toPositiveInteger(summary.waveNumber, 1),
    status: normalizeStatus(summary.status),
    gateHp: Math.max(0, toFiniteNumber(summary.gateHp, 0)),
    gold: Math.max(0, toFiniteNumber(summary.gold, 0)),
  };
}

function incrementCounter(counter, key, amount) {
  if (typeof key !== 'string' || key.length === 0) {
    return;
  }

  const increment = toNonNegativeInteger(amount, 0);
  if (increment <= 0) {
    return;
  }

  counter[key] = (counter[key] || 0) + increment;
}

function sortedCounter(counter) {
  const source = isPlainObject(counter) ? counter : {};
  const sortedKeys = Object.keys(source).sort();
  const target = {};
  for (const key of sortedKeys) {
    target[key] = source[key];
  }
  return target;
}

function createEmptyEventSummary() {
  return {
    totalEvents: 0,
    byEventName: {},
    simulationEventTypes: {},
    resultStatuses: {},
  };
}

function summarizeEmittedEvents(events) {
  const records = Array.isArray(events) ? events : [];
  const byEventName = {};
  const simulationEventTypes = {};
  const resultStatuses = {};

  for (const record of records) {
    const eventName = typeof record?.name === 'string' ? record.name : '';
    incrementCounter(byEventName, eventName, 1);

    if (eventName === RUNTIME_EVENT.SIMULATION_EVENT) {
      incrementCounter(simulationEventTypes, record?.payload?.type, 1);
    }

    if (eventName === RUNTIME_EVENT.RESULT) {
      const status = record?.payload?.ok === true
        ? normalizeStatus(record?.payload?.value?.summary?.status)
        : 'error';
      incrementCounter(resultStatuses, status, 1);
    }
  }

  return {
    totalEvents: records.length,
    byEventName: sortedCounter(byEventName),
    simulationEventTypes: sortedCounter(simulationEventTypes),
    resultStatuses: sortedCounter(resultStatuses),
  };
}

function mergeCounters(firstCounter, secondCounter) {
  const merged = {};
  const first = isPlainObject(firstCounter) ? firstCounter : {};
  const second = isPlainObject(secondCounter) ? secondCounter : {};

  for (const key of Object.keys(first)) {
    incrementCounter(merged, key, first[key]);
  }
  for (const key of Object.keys(second)) {
    incrementCounter(merged, key, second[key]);
  }

  return sortedCounter(merged);
}

function mergeEventSummaries(firstSummary, secondSummary) {
  const first = isPlainObject(firstSummary) ? firstSummary : createEmptyEventSummary();
  const second = isPlainObject(secondSummary) ? secondSummary : createEmptyEventSummary();

  return {
    totalEvents:
      toNonNegativeInteger(first.totalEvents, 0) + toNonNegativeInteger(second.totalEvents, 0),
    byEventName: mergeCounters(first.byEventName, second.byEventName),
    simulationEventTypes: mergeCounters(first.simulationEventTypes, second.simulationEventTypes),
    resultStatuses: mergeCounters(first.resultStatuses, second.resultStatuses),
  };
}

function copyRuntimeState(state) {
  const source = isPlainObject(state) ? state : {};
  return {
    ...source,
    synergyCounts: cloneArray(source.synergyCounts),
    relics: cloneArray(source.relics),
  };
}

function copyRuntimeHud(hud) {
  const source = isPlainObject(hud) ? hud : {};
  return {
    ...source,
    synergyCounts: cloneArray(source.synergyCounts),
    relics: cloneArray(source.relics),
  };
}

function captureBridgeEvents(bus, action) {
  if (!bus || typeof bus.on !== 'function') {
    return {
      result: action(),
      eventSummary: createEmptyEventSummary(),
    };
  }

  const events = [];
  const unsubscribers = [];

  for (const eventName of RUNTIME_EVENT_NAMES) {
    const unsubscribe = bus.on(eventName, (payload) => {
      events.push({
        name: eventName,
        payload,
      });
    });
    unsubscribers.push(unsubscribe);
  }

  let result;
  try {
    result = action();
  } finally {
    for (const unsubscribe of unsubscribers) {
      unsubscribe();
    }
  }

  return {
    result,
    eventSummary: summarizeEmittedEvents(events),
  };
}

function hasAnyFunction(target, keys) {
  if (!isPlainObject(target) || !Array.isArray(keys)) {
    return false;
  }

  for (const key of keys) {
    if (typeof target[key] === 'function') {
      return true;
    }
  }

  return false;
}

function attachCallbackSubscribers(bus, callbacks) {
  if (!bus || typeof bus.on !== 'function' || !isPlainObject(callbacks)) {
    return () => {};
  }

  const disposers = [];
  const phaserCallbacks = isPlainObject(callbacks.phaser) ? callbacks.phaser : null;
  const reactCallbacks = isPlainObject(callbacks.react) ? callbacks.react : null;

  if (phaserCallbacks && hasAnyFunction(phaserCallbacks, ['onRunPhase', 'onSimulationEvent', 'onResult'])) {
    const phaserFacade = createPhaserFacade(bus, phaserCallbacks);
    disposers.push(() => phaserFacade.dispose());
  }

  if (reactCallbacks && hasAnyFunction(reactCallbacks, ['onRunPhase', 'onHudUpdate', 'onResult'])) {
    const reactFacade = createReactHudFacade(bus, reactCallbacks);
    disposers.push(() => reactFacade.dispose());
  }

  if (typeof callbacks.onEvent === 'function') {
    for (const eventName of RUNTIME_EVENT_NAMES) {
      const unsubscribe = bus.on(eventName, (payload) => {
        callbacks.onEvent(eventName, payload);
      });
      disposers.push(unsubscribe);
    }
  }

  let disposed = false;
  return function disposeSubscribers() {
    if (disposed) {
      return;
    }

    disposed = true;
    for (const dispose of disposers) {
      dispose();
    }
  };
}

function createM0RuntimeApp(options) {
  const config = isPlainObject(options) ? options : {};
  const runtimeBridgeFactory =
    typeof config.createRuntimeBridge === 'function' ? config.createRuntimeBridge : createRuntimeBridge;
  const runtimeBridge =
    config.runtimeBridge && typeof config.runtimeBridge.runWave === 'function'
      ? config.runtimeBridge
      : runtimeBridgeFactory(cloneObject(config.bridgeOptions));

  if (!runtimeBridge || typeof runtimeBridge.runWave !== 'function') {
    throw new TypeError('runtime bridge must provide runWave(chapterContext) function');
  }

  const orchestrationFactory =
    typeof config.createRunOrchestrationService === 'function'
      ? config.createRunOrchestrationService
      : createRunOrchestrationService;
  const orchestrationService = orchestrationFactory(cloneObject(config.orchestrationOptions));
  const disposeSubscribers = attachCallbackSubscribers(runtimeBridge.bus, config.callbacks);
  let disposed = false;

  function startRun(chapterContext) {
    const runContext = orchestrationService.startRunFromChapterContext(chapterContext);
    const state = copyRuntimeState(runContext.store.getState());
    const hudResult = runContext.store.getHudViewModel();
    const hud = hudResult.ok ? copyRuntimeHud(hudResult.value) : null;

    if (runtimeBridge.bus && typeof runtimeBridge.bus.emit === 'function') {
      runtimeBridge.bus.emit(RUNTIME_EVENT.RUN_PHASE, {
        phase: state.phase,
        state: copyRuntimeState(state),
      });

      if (hud) {
        runtimeBridge.bus.emit(RUNTIME_EVENT.HUD_UPDATE, copyRuntimeHud(hud));
      }
    }

    return {
      ok: true,
      value: {
        chapterId: runContext.chapterId,
        runSeed: runContext.runSeed,
        waveNumber: runContext.waveNumber,
        maxWaves: runContext.maxWaves,
        state,
        hud,
      },
    };
  }

  function runWave(chapterContext) {
    const { result, eventSummary } = captureBridgeEvents(runtimeBridge.bus, () =>
      runtimeBridge.runWave(chapterContext)
    );

    if (!result || result.ok !== true) {
      return {
        ok: false,
        error: result?.error || {
          code: 'RUNTIME_WAVE_FAILED',
          message: 'failed to run wave through runtime bridge',
        },
        eventSummary,
      };
    }

    return {
      ok: true,
      value: {
        payload: result.value,
        eventSummary,
      },
    };
  }

  function runSession(chapterContext, runOptions) {
    const session = normalizeSessionInput(chapterContext, runOptions);
    let currentContext = session.context;
    let finalStatus = 'continue';
    let finalResult = null;
    let emittedEventSummary = createEmptyEventSummary();
    const waveSnapshots = [];
    const waveResults = [];

    for (let index = 0; index < session.maxSlices; index += 1) {
      const waveResult = runWave(currentContext);
      emittedEventSummary = mergeEventSummaries(
        emittedEventSummary,
        waveResult.ok ? waveResult.value.eventSummary : waveResult.eventSummary
      );

      if (!waveResult.ok) {
        return {
          ok: false,
          error: waveResult.error,
          value: {
            chapterId: session.context.chapterId,
            runSeed: session.context.runSeed,
            finalStatus: 'error',
            finalResult,
            waveSnapshots,
            waveResults,
            emittedEventSummary,
          },
        };
      }

      finalResult = waveResult.value.payload;
      waveResults.push(finalResult);

      const snapshot = buildWaveSnapshot(finalResult);
      waveSnapshots.push(snapshot);
      finalStatus = snapshot.status;

      if (finalStatus !== 'continue') {
        break;
      }

      currentContext = buildNextWaveContext(currentContext, finalResult);
    }

    const reachedWave = finalResult
      ? toPositiveInteger(finalResult?.summary?.waveNumber, currentContext.waveNumber)
      : currentContext.waveNumber;

    return {
      ok: true,
      value: {
        chapterId: session.context.chapterId,
        runSeed: session.context.runSeed,
        reachedWave,
        finalStatus,
        finalResult,
        waveSnapshots,
        waveResults,
        emittedEventSummary,
      },
    };
  }

  function dispose() {
    if (disposed) {
      return;
    }

    disposed = true;
    disposeSubscribers();
  }

  return {
    runtimeBridge,
    startRun,
    runWave,
    runSession,
    dispose,
  };
}

module.exports = {
  createM0RuntimeApp,
  createEmptyEventSummary,
  summarizeEmittedEvents,
  mergeEventSummaries,
};
