'use strict';

const { createRunOrchestrationService } = require('../run-orchestration-service');

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

function normalizeStatus(status) {
  return status === 'clear' || status === 'fail' ? status : 'continue';
}

function buildWaveSnapshot(runPayload) {
  const summary = isPlainObject(runPayload?.summary) ? runPayload.summary : {};
  return {
    gold: Math.max(0, toFiniteNumber(summary.gold, 0)),
    gateHp: Math.max(0, toFiniteNumber(summary.gateHp, 0)),
    wave: toPositiveInteger(summary.waveNumber, 1),
    status: normalizeStatus(summary.status),
  };
}

function createSimulationContext(simulation, runSeed, waveNumber) {
  const baseSimulation = isPlainObject(simulation) ? simulation : {};
  return {
    ...baseSimulation,
    waveNumber,
    seed: runSeed + waveNumber - 1,
  };
}

function normalizeSessionContext(chapterContext, runOptions) {
  const source = isPlainObject(chapterContext) ? chapterContext : {};
  const options = isPlainObject(runOptions) ? runOptions : {};
  const runSeed = toNonNegativeInteger(source.runSeed, 0);
  const chapterId =
    typeof source.chapterId === 'string' && source.chapterId.length > 0
      ? source.chapterId
      : 'chapter_1';
  const waveNumber = toPositiveInteger(source.waveNumber, 1);
  const maxWaves = Math.max(waveNumber, toPositiveInteger(source.maxWaves, waveNumber));
  const defaultSliceCount = maxWaves - waveNumber + 1;
  const maxSlices = Math.max(
    1,
    toPositiveInteger(options.maxSlices ?? options.maxWaves, defaultSliceCount)
  );

  return {
    maxSlices,
    context: {
      ...source,
      chapterId,
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

function createM0SessionCoordinator(options) {
  const config = isPlainObject(options) ? options : {};
  const orchestrationService =
    config.orchestrationService &&
    typeof config.orchestrationService.runWaveSlice === 'function'
      ? config.orchestrationService
      : createRunOrchestrationService(config.serviceOptions);

  function runSession(chapterContext, runOptions) {
    const session = normalizeSessionContext(chapterContext, runOptions);
    let currentContext = session.context;
    const wavePayloads = [];
    const snapshots = [];
    let finalPayload = null;
    let finalStatus = 'continue';

    for (let index = 0; index < session.maxSlices; index += 1) {
      const waveResult = orchestrationService.runWaveSlice(currentContext);
      if (!waveResult.ok) {
        return waveResult;
      }

      finalPayload = waveResult.value;
      wavePayloads.push(finalPayload);

      const snapshot = buildWaveSnapshot(finalPayload);
      snapshots.push(snapshot);
      finalStatus = snapshot.status;

      if (finalStatus !== 'continue') {
        break;
      }

      currentContext = buildNextWaveContext(currentContext, finalPayload);
    }

    const reachedWave = finalPayload
      ? toPositiveInteger(finalPayload?.summary?.waveNumber, currentContext.waveNumber)
      : currentContext.waveNumber;

    return {
      ok: true,
      value: {
        chapterId: session.context.chapterId,
        runSeed: session.context.runSeed,
        reachedWave,
        finalStatus,
        snapshots,
        wavePayloads,
        finalPayload,
      },
    };
  }

  return {
    runSession,
  };
}

module.exports = {
  createM0SessionCoordinator,
};
