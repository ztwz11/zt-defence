'use strict';

const { RUN_PHASE } = require('../game/run');
const { createRunOrchestrationService } = require('../main/run-orchestration-service');
const { createHeadlessRenderAdapter } = require('../render/headless-render-adapter');
const { createRunStateStore } = require('../ui/run-state-store');
const { createRuntimeEventBus } = require('./event-bus');
const { RUNTIME_EVENT } = require('./event-names');

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function cloneArray(value) {
  return Array.isArray(value) ? value.slice() : [];
}

function toFiniteNumber(value, fallback) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function toPositiveInteger(value, fallback) {
  return Math.max(1, Math.floor(toFiniteNumber(value, fallback)));
}

function toNonNegativeNumber(value, fallback) {
  return Math.max(0, toFiniteNumber(value, fallback));
}

function normalizeContext(context) {
  return isPlainObject(context) ? context : {};
}

function createInitialRunState(chapterContext) {
  const source = normalizeContext(chapterContext);

  return {
    phase: RUN_PHASE.PREPARE,
    waveNumber: toPositiveInteger(source.waveNumber, 1),
    gateHp: toNonNegativeNumber(source.gateHp, 0),
    gold: toNonNegativeNumber(source.gold, 0),
    summonCost: toNonNegativeNumber(source.summonCost, 0),
    rerollCost: toNonNegativeNumber(source.rerollCost, 0),
    synergyCounts: cloneArray(source.synergyCounts),
    relics: cloneArray(source.relics),
  };
}

function createSimulationEmitterAdapter(baseRenderAdapter, bus) {
  const targetAdapter =
    baseRenderAdapter && typeof baseRenderAdapter.consumeSimulationEvents === 'function'
      ? baseRenderAdapter
      : createHeadlessRenderAdapter();

  function consumeSimulationEvents(simulationResult, renderContext) {
    const renderResult = targetAdapter.consumeSimulationEvents(simulationResult, renderContext);
    const events = Array.isArray(renderResult?.events)
      ? renderResult.events
      : [];

    for (const event of events) {
      bus.emit(RUNTIME_EVENT.SIMULATION_EVENT, event);
    }

    return renderResult;
  }

  return {
    consumeSimulationEvents,
  };
}

function syncStoreFromResult(store, resultPayload) {
  const currentState = store.getState();
  const payload = isPlainObject(resultPayload) ? resultPayload : {};
  const summary = isPlainObject(payload.summary) ? payload.summary : {};
  const hud = isPlainObject(payload.hud) ? payload.hud : {};

  const nextState = {
    phase:
      typeof payload.phase === 'string'
        ? payload.phase
        : currentState.phase,
    waveNumber: toPositiveInteger(
      summary.nextWaveNumber ?? summary.waveNumber,
      currentState.waveNumber
    ),
    gateHp: toNonNegativeNumber(summary.gateHp, currentState.gateHp),
    gold: toNonNegativeNumber(summary.gold, currentState.gold),
    summonCost: toNonNegativeNumber(hud.summonCost, currentState.summonCost),
    rerollCost: toNonNegativeNumber(hud.rerollCost, currentState.rerollCost),
    synergyCounts: cloneArray(hud.synergyCounts ?? currentState.synergyCounts),
    relics: cloneArray(hud.relics ?? currentState.relics),
  };

  return store.setState(nextState);
}

function createRuntimeCoordinator(options) {
  const config = isPlainObject(options) ? options : {};
  const bus =
    config.bus &&
    typeof config.bus.emit === 'function' &&
    typeof config.bus.on === 'function'
      ? config.bus
      : createRuntimeEventBus();
  const runStateStoreFactory =
    typeof config.createRunStateStore === 'function'
      ? config.createRunStateStore
      : createRunStateStore;
  const renderAdapterFactory =
    typeof config.createHeadlessRenderAdapter === 'function'
      ? config.createHeadlessRenderAdapter
      : createHeadlessRenderAdapter;
  const orchestrationFactory =
    typeof config.createRunOrchestrationService === 'function'
      ? config.createRunOrchestrationService
      : createRunOrchestrationService;
  const orchestrationOptions = isPlainObject(config.orchestrationOptions)
    ? { ...config.orchestrationOptions }
    : {};
  const instrumentedRenderAdapter = createSimulationEmitterAdapter(
    renderAdapterFactory(config.renderAdapterOptions),
    bus
  );
  const orchestrationService = orchestrationFactory({
    ...orchestrationOptions,
    renderAdapter: instrumentedRenderAdapter,
  });

  function emitPhaseAndHud(store) {
    const state = store.getState();
    bus.emit(RUNTIME_EVENT.RUN_PHASE, {
      phase: state.phase,
      state,
    });

    const hudResult = store.getHudViewModel();
    if (hudResult.ok) {
      bus.emit(RUNTIME_EVENT.HUD_UPDATE, hudResult.value);
    }

    return {
      state,
      hud: hudResult.ok ? hudResult.value : null,
    };
  }

  function runWaveSlice(chapterContext) {
    const store = runStateStoreFactory(createInitialRunState(chapterContext));
    emitPhaseAndHud(store);

    const orchestrationResult = orchestrationService.runWaveSlice(chapterContext);
    if (!orchestrationResult.ok) {
      bus.emit(RUNTIME_EVENT.RESULT, orchestrationResult);
      return orchestrationResult;
    }

    const syncResult = syncStoreFromResult(store, orchestrationResult.value);
    if (!syncResult.ok) {
      const syncError = {
        ok: false,
        error: {
          code: 'RUNTIME_STORE_SYNC_FAILED',
          message: 'failed to synchronize runtime store from orchestration result',
          details: syncResult.error,
        },
      };
      bus.emit(RUNTIME_EVENT.RESULT, syncError);
      return syncError;
    }

    const finalProjection = emitPhaseAndHud(store);
    const okResult = {
      ok: true,
      value: {
        ...orchestrationResult.value,
        runtimeState: finalProjection.state,
        runtimeHud: finalProjection.hud,
      },
    };
    bus.emit(RUNTIME_EVENT.RESULT, okResult);

    return okResult;
  }

  return {
    bus,
    runWave: runWaveSlice,
    runWaveSlice,
  };
}

module.exports = {
  createRuntimeCoordinator,
  createInitialRunState,
  createSimulationEmitterAdapter,
};
