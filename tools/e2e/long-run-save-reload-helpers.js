'use strict';

const { createHash } = require('node:crypto');
const { isDeepStrictEqual } = require('node:util');

const { createRunOrchestrationService } = require('../../src/main');
const { RUN_PHASE } = require('../../src/game/run');
const {
  DEFAULT_CONTENT_VERSION,
  DEFAULT_SAVE_VERSION,
} = require('../../src/types/save');

const FIXED_TIMESTAMP = '2026-02-13T00:00:00Z';

function ok(value) {
  return {
    ok: true,
    value,
  };
}

function fail(code, message, details) {
  return {
    ok: false,
    error: {
      code,
      message,
      details,
    },
  };
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function cloneArray(value) {
  return Array.isArray(value) ? value.slice() : [];
}

function cloneJson(value, fallback) {
  if (value === undefined) {
    return fallback;
  }

  try {
    return JSON.parse(JSON.stringify(value));
  } catch (error) {
    return fallback;
  }
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

function roundTo(value, digits) {
  const precision = Math.pow(10, digits);
  return Math.round(value * precision) / precision;
}

function normalizeStatus(status) {
  return status === 'clear' || status === 'fail' ? status : 'continue';
}

function mergeEconomyConfig(baseConfig, overrideConfig) {
  const base = isPlainObject(baseConfig) ? baseConfig : {};
  const override = isPlainObject(overrideConfig) ? overrideConfig : {};
  const baseCosts = isPlainObject(base.costs) ? base.costs : {};
  const overrideCosts = isPlainObject(override.costs) ? override.costs : {};
  const baseReroll = isPlainObject(baseCosts.reroll) ? baseCosts.reroll : {};
  const overrideReroll = isPlainObject(overrideCosts.reroll)
    ? overrideCosts.reroll
    : {};

  return {
    ...base,
    ...override,
    interest: {
      ...(isPlainObject(base.interest) ? base.interest : {}),
      ...(isPlainObject(override.interest) ? override.interest : {}),
    },
    costs: {
      ...baseCosts,
      ...overrideCosts,
      reroll: {
        ...baseReroll,
        ...overrideReroll,
      },
    },
  };
}

function mergeSimulationConfig(baseConfig, overrideConfig) {
  const base = isPlainObject(baseConfig) ? cloneJson(baseConfig, {}) : {};
  const override = isPlainObject(overrideConfig) ? overrideConfig : {};
  const merged = {
    ...base,
    ...override,
  };

  merged.spawnEvents = Array.isArray(override.spawnEvents)
    ? cloneJson(override.spawnEvents, [])
    : cloneJson(base.spawnEvents, []);
  merged.units = Array.isArray(override.units)
    ? cloneJson(override.units, [])
    : cloneJson(base.units, []);
  merged.enemyCatalog = {
    ...(isPlainObject(base.enemyCatalog) ? base.enemyCatalog : {}),
    ...(isPlainObject(override.enemyCatalog) ? override.enemyCatalog : {}),
  };

  return merged;
}

function createSimulationContext(simulation, runSeed, waveNumber) {
  const normalizedSeed = toNonNegativeInteger(runSeed, 0);
  const normalizedWave = toPositiveInteger(waveNumber, 1);
  const baseSimulation = isPlainObject(simulation)
    ? cloneJson(simulation, {})
    : {};

  return {
    ...baseSimulation,
    waveNumber: normalizedWave,
    seed: normalizedSeed + normalizedWave - 1,
  };
}

function cloneChapterContext(chapterContext) {
  const source = isPlainObject(chapterContext) ? chapterContext : {};
  return {
    ...source,
    relics: cloneArray(source.relics),
    synergyCounts: cloneArray(source.synergyCounts),
    rewards: cloneArray(source.rewards),
    rewardContext: isPlainObject(source.rewardContext)
      ? { ...source.rewardContext }
      : {},
    economyConfig: cloneJson(source.economyConfig, {}),
    simulation: cloneJson(source.simulation, {}),
  };
}

function createLongRunChapterContext(overrides) {
  const source = isPlainObject(overrides) ? overrides : {};
  const defaultSimulation = {
    tickSeconds: 0.25,
    durationSeconds: 7,
    spawnEvents: [
      { time: 0, enemyId: 'goblin', count: 2, interval: 0.45 },
      { time: 1.4, enemyId: 'orc', count: 1, interval: 0 },
      { time: 2.7, enemyId: 'runner', count: 1, interval: 0 },
    ],
    enemyCatalog: {
      goblin: {
        hp: 12,
        armor: 0,
        resist: 0,
        moveSpeed: 0.08,
      },
      orc: {
        hp: 34,
        armor: 2,
        resist: 1,
        moveSpeed: 0.055,
      },
      runner: {
        hp: 9,
        armor: 0,
        resist: 0,
        moveSpeed: 0.13,
      },
    },
    units: [
      {
        id: 'archer_alpha',
        atk: 13,
        atkSpeed: 2.4,
        damageType: 'physical',
        targeting: 'frontMost',
        critChance: 0.2,
        critMultiplier: 1.75,
      },
      {
        id: 'mage_beta',
        atk: 9,
        atkSpeed: 1.9,
        damageType: 'magic',
        targeting: 'lowestHp',
        critChance: 0.1,
        critMultiplier: 1.6,
      },
    ],
  };

  const defaultEconomyConfig = {
    waveStartGold: 2,
    waveClearBonusGold: 3,
    interest: {
      enabled: false,
    },
    costs: {
      summon: 4,
      reroll: {
        base: 2,
        increasePerUse: 1,
      },
    },
  };

  const waveNumber = toPositiveInteger(source.waveNumber, 1);
  const gateHp = Math.max(0, toFiniteNumber(source.gateHp, 30));
  const maxGateHp = Math.max(gateHp, toFiniteNumber(source.maxGateHp, gateHp));
  const mergedSimulation = mergeSimulationConfig(defaultSimulation, source.simulation);
  const context = {
    chapterId:
      typeof source.chapterId === 'string' && source.chapterId.length > 0
        ? source.chapterId
        : 'chapter_1',
    runSeed: toNonNegativeInteger(source.runSeed, 24681357),
    waveNumber,
    maxWaves: Math.max(waveNumber, toPositiveInteger(source.maxWaves, 8)),
    gateHp,
    maxGateHp,
    gold: Math.max(0, toFiniteNumber(source.gold, 7)),
    relics: cloneArray(source.relics),
    synergyCounts: cloneArray(source.synergyCounts),
    economyConfig: mergeEconomyConfig(defaultEconomyConfig, source.economyConfig),
    rewards: Array.isArray(source.rewards)
      ? source.rewards.slice()
      : [{ type: 'Gold', amount: 2 }],
    rewardContext: isPlainObject(source.rewardContext)
      ? { ...source.rewardContext }
      : {},
    simulation: createSimulationContext(
      mergedSimulation,
      toNonNegativeInteger(source.runSeed, 24681357),
      waveNumber
    ),
  };

  return context;
}

function buildNextWaveContext(previousContext, runPayload) {
  const baseContext = cloneChapterContext(previousContext);
  const summary = isPlainObject(runPayload?.summary) ? runPayload.summary : {};
  const hud = isPlainObject(runPayload?.hud) ? runPayload.hud : {};
  const nextWaveNumber = toPositiveInteger(
    summary.nextWaveNumber,
    toPositiveInteger(baseContext.waveNumber, 1) + 1
  );
  const runSeed = toNonNegativeInteger(baseContext.runSeed, 0);
  const nextContext = {
    ...baseContext,
    waveNumber: nextWaveNumber,
    gateHp: Math.max(0, toFiniteNumber(summary.gateHp, baseContext.gateHp)),
    gold: Math.max(0, toFiniteNumber(summary.gold, baseContext.gold)),
    relics: cloneArray(Array.isArray(hud.relics) ? hud.relics : baseContext.relics),
    synergyCounts: cloneArray(
      Array.isArray(hud.synergyCounts)
        ? hud.synergyCounts
        : baseContext.synergyCounts
    ),
  };
  nextContext.maxWaves = Math.max(
    nextWaveNumber,
    toPositiveInteger(baseContext.maxWaves, nextWaveNumber)
  );
  nextContext.maxGateHp = Math.max(
    nextContext.gateHp,
    toFiniteNumber(baseContext.maxGateHp, nextContext.gateHp)
  );
  nextContext.simulation = createSimulationContext(
    baseContext.simulation,
    runSeed,
    nextWaveNumber
  );
  return nextContext;
}

function hashPayload(payload) {
  return createHash('sha256')
    .update(JSON.stringify(payload))
    .digest('hex');
}

function extractWaveTraceEntry(runPayload) {
  const summary = isPlainObject(runPayload?.summary) ? runPayload.summary : {};
  const simulation = isPlainObject(runPayload?.simulation)
    ? runPayload.simulation
    : {};
  const render = isPlainObject(runPayload?.render) ? runPayload.render : {};
  const eventLog = Array.isArray(simulation.eventLog) ? simulation.eventLog : [];
  const renderEvents = Array.isArray(render.events) ? render.events : [];

  return {
    waveNumber: toPositiveInteger(summary.waveNumber, 1),
    nextWaveNumber: toPositiveInteger(
      summary.nextWaveNumber,
      toPositiveInteger(summary.waveNumber, 1) + 1
    ),
    status: normalizeStatus(summary.status),
    phase:
      typeof runPayload?.phase === 'string' ? runPayload.phase : RUN_PHASE.PREPARE,
    gateHp: Math.max(0, toFiniteNumber(summary.gateHp, 0)),
    gold: Math.max(0, toFiniteNumber(summary.gold, 0)),
    killCount: toNonNegativeInteger(summary.killCount, 0),
    totalDamage: roundTo(Math.max(0, toFiniteNumber(summary.totalDamage, 0)), 4),
    leaks: toNonNegativeInteger(summary.leaks, 0),
    eventCount: eventLog.length,
    renderEventCount: renderEvents.length,
    payloadHash: hashPayload(runPayload),
  };
}

function buildComparableTrace(wavePayloads) {
  const source = Array.isArray(wavePayloads) ? wavePayloads : [];
  return source.map((payload) => extractWaveTraceEntry(payload));
}

function compareDeterministicTraces(baselineWavePayloads, candidateWavePayloads) {
  const baselineTrace = buildComparableTrace(baselineWavePayloads);
  const candidateTrace = buildComparableTrace(candidateWavePayloads);

  if (baselineTrace.length !== candidateTrace.length) {
    return {
      match: false,
      reason: 'WAVE_COUNT_MISMATCH',
      baselineLength: baselineTrace.length,
      candidateLength: candidateTrace.length,
      baselineTrace,
      candidateTrace,
    };
  }

  for (let index = 0; index < baselineTrace.length; index += 1) {
    if (!isDeepStrictEqual(baselineTrace[index], candidateTrace[index])) {
      return {
        match: false,
        reason: 'WAVE_TRACE_MISMATCH',
        waveIndex: index + 1,
        baselineEntry: baselineTrace[index],
        candidateEntry: candidateTrace[index],
        baselineTrace,
        candidateTrace,
      };
    }
  }

  return {
    match: true,
    baselineTrace,
    candidateTrace,
  };
}

function describeTraceComparison(comparisonResult) {
  if (comparisonResult && comparisonResult.match) {
    return 'deterministic trace matched';
  }

  const source = isPlainObject(comparisonResult) ? comparisonResult : {};
  const lines = ['Deterministic trace mismatch detected.'];

  if (typeof source.reason === 'string' && source.reason.length > 0) {
    lines.push(`reason=${source.reason}`);
  }

  if (Number.isInteger(source.waveIndex)) {
    lines.push(`wave=${source.waveIndex}`);
  }

  if (
    Number.isInteger(source.baselineLength) ||
    Number.isInteger(source.candidateLength)
  ) {
    lines.push(
      `baselineWaves=${source.baselineLength ?? 0}, candidateWaves=${source.candidateLength ?? 0}`
    );
  }

  if (source.baselineEntry) {
    lines.push(`baseline=${JSON.stringify(source.baselineEntry)}`);
  }

  if (source.candidateEntry) {
    lines.push(`candidate=${JSON.stringify(source.candidateEntry)}`);
  }

  return lines.join('\n');
}

function collectRunStats(wavePayloads) {
  const source = Array.isArray(wavePayloads) ? wavePayloads : [];
  let kills = 0;
  let totalDamage = 0;
  let leaks = 0;
  let eventLogCursor = 0;

  for (const payload of source) {
    const summary = isPlainObject(payload?.summary) ? payload.summary : {};
    const simulation = isPlainObject(payload?.simulation) ? payload.simulation : {};
    const eventLog = Array.isArray(simulation.eventLog) ? simulation.eventLog : [];
    kills += toNonNegativeInteger(summary.killCount, 0);
    totalDamage += Math.max(0, toFiniteNumber(summary.totalDamage, 0));
    leaks += toNonNegativeInteger(summary.leaks, 0);
    eventLogCursor += eventLog.length;
  }

  return {
    kills,
    totalDamage: roundTo(totalDamage, 4),
    leaks,
    eventLogCursor,
  };
}

function createRunSaveCheckpoint(options) {
  const source = isPlainObject(options) ? options : {};
  const context = isPlainObject(source.context) ? source.context : {};
  const normalizedWave = toPositiveInteger(context.waveNumber, 1);
  const normalizedSeed = toNonNegativeInteger(context.runSeed, 0);
  const stats = collectRunStats(source.completedWavePayloads);

  return {
    saveVersion:
      typeof source.saveVersion === 'string'
        ? source.saveVersion
        : DEFAULT_SAVE_VERSION,
    contentVersion:
      typeof source.contentVersion === 'string'
        ? source.contentVersion
        : DEFAULT_CONTENT_VERSION,
    updatedAt:
      typeof source.updatedAt === 'string' ? source.updatedAt : FIXED_TIMESTAMP,
    runId:
      typeof source.runId === 'string' && source.runId.length > 0
        ? source.runId
        : `run_long_smoke_seed_${normalizedSeed}`,
    runSeed: normalizedSeed,
    chapterId:
      typeof context.chapterId === 'string' && context.chapterId.length > 0
        ? context.chapterId
        : 'chapter_1',
    phase: RUN_PHASE.PREPARE,
    waveNumber: normalizedWave,
    gateHp: Math.max(0, toFiniteNumber(context.gateHp, 0)),
    gold: Math.max(0, toFiniteNumber(context.gold, 0)),
    boardUnits: [],
    benchUnits: [],
    relics: cloneArray(context.relics),
    activeSynergies: cloneArray(context.synergyCounts),
    rngState: {
      algo: 'xorshift32',
      state: (normalizedSeed + normalizedWave - 1) >>> 0,
    },
    eventLogCursor: stats.eventLogCursor,
    stats: {
      kills: stats.kills,
      totalDamage: stats.totalDamage,
      leaks: stats.leaks,
    },
  };
}

function restoreChapterContextFromRunSave(templateContext, runSavePayload) {
  const template = isPlainObject(templateContext)
    ? cloneChapterContext(templateContext)
    : createLongRunChapterContext();
  const payload = isPlainObject(runSavePayload) ? runSavePayload : {};
  const waveNumber = toPositiveInteger(payload.waveNumber, template.waveNumber);
  const runSeed = toNonNegativeInteger(payload.runSeed, template.runSeed);

  const restored = {
    ...template,
    chapterId:
      typeof payload.chapterId === 'string' && payload.chapterId.length > 0
        ? payload.chapterId
        : template.chapterId,
    runSeed,
    waveNumber,
    gateHp: Math.max(0, toFiniteNumber(payload.gateHp, template.gateHp)),
    gold: Math.max(0, toFiniteNumber(payload.gold, template.gold)),
    relics: cloneArray(
      Array.isArray(payload.relics) ? payload.relics : template.relics
    ),
    synergyCounts: cloneArray(
      Array.isArray(payload.activeSynergies)
        ? payload.activeSynergies
        : template.synergyCounts
    ),
  };

  restored.maxWaves = Math.max(
    restored.waveNumber,
    toPositiveInteger(template.maxWaves, restored.waveNumber)
  );
  restored.maxGateHp = Math.max(
    restored.gateHp,
    toFiniteNumber(template.maxGateHp, restored.gateHp)
  );
  restored.simulation = createSimulationContext(
    template.simulation,
    runSeed,
    restored.waveNumber
  );
  return restored;
}

function runWaveSequence(options) {
  const source = isPlainObject(options) ? options : {};
  const orchestrationService =
    source.orchestrationService &&
    typeof source.orchestrationService.runWaveSlice === 'function'
      ? source.orchestrationService
      : createRunOrchestrationService();
  let currentContext = cloneChapterContext(
    isPlainObject(source.chapterContext)
      ? source.chapterContext
      : createLongRunChapterContext()
  );

  currentContext.waveNumber = toPositiveInteger(currentContext.waveNumber, 1);
  currentContext.maxWaves = Math.max(
    currentContext.waveNumber,
    toPositiveInteger(currentContext.maxWaves, currentContext.waveNumber)
  );
  currentContext.simulation = createSimulationContext(
    currentContext.simulation,
    toNonNegativeInteger(currentContext.runSeed, 0),
    currentContext.waveNumber
  );

  const defaultSlices = currentContext.maxWaves - currentContext.waveNumber + 1;
  const maxSlices = toPositiveInteger(source.maxSlices, defaultSlices);
  const wavePayloads = [];
  let finalStatus = 'continue';

  for (let index = 0; index < maxSlices; index += 1) {
    const waveResult = orchestrationService.runWaveSlice(currentContext);
    if (!waveResult.ok) {
      return fail('WAVE_SLICE_FAILED', 'runWaveSlice returned an error', {
        sliceIndex: index + 1,
        contextWave: currentContext.waveNumber,
        cause: waveResult.error,
      });
    }

    const payload = waveResult.value;
    wavePayloads.push(payload);
    finalStatus = normalizeStatus(payload?.summary?.status);

    if (finalStatus !== 'continue') {
      return ok({
        wavePayloads,
        finalStatus,
        reachedWave: toPositiveInteger(payload?.summary?.waveNumber, 1),
        nextContext: null,
      });
    }

    currentContext = buildNextWaveContext(currentContext, payload);
  }

  const lastPayload = wavePayloads[wavePayloads.length - 1];
  return ok({
    wavePayloads,
    finalStatus,
    reachedWave: toPositiveInteger(
      lastPayload?.summary?.waveNumber,
      currentContext.waveNumber
    ),
    nextContext: currentContext,
  });
}

function combineWavePayloads(firstSegment, secondSegment) {
  const first = Array.isArray(firstSegment) ? firstSegment : [];
  const second = Array.isArray(secondSegment) ? secondSegment : [];
  return first.concat(second);
}

module.exports = {
  FIXED_TIMESTAMP,
  buildComparableTrace,
  buildNextWaveContext,
  combineWavePayloads,
  compareDeterministicTraces,
  createLongRunChapterContext,
  createRunSaveCheckpoint,
  createSimulationContext,
  describeTraceComparison,
  extractWaveTraceEntry,
  normalizeStatus,
  restoreChapterContextFromRunSave,
  runWaveSequence,
};
