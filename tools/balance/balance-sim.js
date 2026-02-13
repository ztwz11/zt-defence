'use strict';

const { createM0SessionCoordinator } = require('../../src/main/m0/session-coordinator');
const { buildBalanceChapterContext } = require('./chapter-presets');
const { sampleRunSeeds } = require('./seed-sampler');

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

function roundTo(value, digits) {
  const precision = Math.pow(10, digits);
  return Math.round(value * precision) / precision;
}

function normalizeStatus(status) {
  return status === 'clear' || status === 'fail' ? status : 'continue';
}

function normalizeSimulationOptions(options) {
  const source = isPlainObject(options) ? options : {};
  const chapterId =
    typeof source.chapterId === 'string' && source.chapterId.length > 0
      ? source.chapterId
      : 'chapter_1';
  const waveMax = toPositiveInteger(source.waveMax, 20);
  const seedCount = toPositiveInteger(source.seedCount ?? source.seeds, 100);
  const baseSeed = toNonNegativeInteger(source.baseSeed, 1);
  const seedStride = toPositiveInteger(source.seedStride, 1);

  return {
    chapterId,
    waveMax,
    seedCount,
    baseSeed,
    seedStride,
    chapterOverrides: isPlainObject(source.chapterOverrides) ? { ...source.chapterOverrides } : {},
    buildChapterContext:
      typeof source.buildChapterContext === 'function'
        ? source.buildChapterContext
        : buildBalanceChapterContext,
    sessionCoordinator:
      source.sessionCoordinator && typeof source.sessionCoordinator.runSession === 'function'
        ? source.sessionCoordinator
        : createM0SessionCoordinator(),
  };
}

function normalizeSeeds(options, normalizedOptions) {
  if (!Array.isArray(options?.seeds)) {
    return sampleRunSeeds({
      seedCount: normalizedOptions.seedCount,
      baseSeed: normalizedOptions.baseSeed,
      seedStride: normalizedOptions.seedStride,
    });
  }

  const seeds = [];
  for (const seed of options.seeds) {
    seeds.push(Math.floor(toFiniteNumber(seed, 0)));
  }

  return seeds;
}

function summarizeWavePayloads(wavePayloads) {
  const payloads = Array.isArray(wavePayloads) ? wavePayloads : [];
  let kills = 0;
  let damage = 0;
  let hasKills = false;
  let hasDamage = false;

  for (const payload of payloads) {
    const summary = isPlainObject(payload?.summary) ? payload.summary : {};
    const killCount = Number(summary.killCount);
    const totalDamage = Number(summary.totalDamage);

    if (Number.isFinite(killCount)) {
      kills += killCount;
      hasKills = true;
    }

    if (Number.isFinite(totalDamage)) {
      damage += totalDamage;
      hasDamage = true;
    }
  }

  return {
    waveCount: payloads.length,
    kills: hasKills ? roundTo(kills, 4) : null,
    damage: hasDamage ? roundTo(damage, 4) : null,
  };
}

function createRunRowFromSession(sessionValue, metadata) {
  const source = isPlainObject(sessionValue) ? sessionValue : {};
  const context = isPlainObject(metadata) ? metadata : {};
  const chapterId =
    typeof context.chapterId === 'string' && context.chapterId.length > 0
      ? context.chapterId
      : 'chapter_1';
  const seed = Math.floor(toFiniteNumber(context.seed, 0));
  const runIndex = toPositiveInteger(context.runIndex, 1);
  const finalStatus = normalizeStatus(source.finalStatus);
  const waveSummary = summarizeWavePayloads(source.wavePayloads);

  return {
    runIndex,
    seed,
    chapterId,
    reachedWave: toPositiveInteger(source.reachedWave, 1),
    finalStatus,
    clear: finalStatus === 'clear' ? 1 : 0,
    fail: finalStatus === 'fail' ? 1 : 0,
    waveCount: waveSummary.waveCount,
    kills: waveSummary.kills,
    damage: waveSummary.damage,
  };
}

function aggregateRunRows(runRows) {
  const rows = Array.isArray(runRows) ? runRows : [];
  if (rows.length === 0) {
    return {
      runCount: 0,
      reachedWaveAverage: 0,
      clearCount: 0,
      failCount: 0,
      continueCount: 0,
      clearRate: 0,
      failRate: 0,
      averageKills: null,
      averageDamage: null,
    };
  }

  let reachedWaveTotal = 0;
  let clearCount = 0;
  let failCount = 0;
  let continueCount = 0;
  let killTotal = 0;
  let damageTotal = 0;
  let killObservedCount = 0;
  let damageObservedCount = 0;

  for (const row of rows) {
    const reachedWave = toPositiveInteger(row?.reachedWave, 1);
    reachedWaveTotal += reachedWave;

    const status = normalizeStatus(row?.finalStatus);
    if (status === 'clear') {
      clearCount += 1;
    } else if (status === 'fail') {
      failCount += 1;
    } else {
      continueCount += 1;
    }

    const hasKills = row && row.kills !== null && row.kills !== undefined;
    const hasDamage = row && row.damage !== null && row.damage !== undefined;
    const kills = Number(row?.kills);
    const damage = Number(row?.damage);
    if (hasKills && Number.isFinite(kills)) {
      killTotal += kills;
      killObservedCount += 1;
    }
    if (hasDamage && Number.isFinite(damage)) {
      damageTotal += damage;
      damageObservedCount += 1;
    }
  }

  const runCount = rows.length;
  return {
    runCount,
    reachedWaveAverage: roundTo(reachedWaveTotal / runCount, 4),
    clearCount,
    failCount,
    continueCount,
    clearRate: roundTo(clearCount / runCount, 6),
    failRate: roundTo(failCount / runCount, 6),
    averageKills: killObservedCount > 0 ? roundTo(killTotal / killObservedCount, 4) : null,
    averageDamage: damageObservedCount > 0 ? roundTo(damageTotal / damageObservedCount, 4) : null,
  };
}

function runBalanceSimulation(options) {
  const normalized = normalizeSimulationOptions(options);
  const seeds = normalizeSeeds(options, normalized);
  const runRows = [];

  for (let index = 0; index < seeds.length; index += 1) {
    const seed = seeds[index];
    const chapterContext = normalized.buildChapterContext({
      chapterId: normalized.chapterId,
      waveMax: normalized.waveMax,
      runSeed: seed,
      ...normalized.chapterOverrides,
    });
    const sessionResult = normalized.sessionCoordinator.runSession(chapterContext, {
      maxSlices: normalized.waveMax,
    });

    if (!sessionResult.ok) {
      throw new Error(
        `BALANCE_SESSION_FAILED(seed=${seed}, index=${index + 1}): ${JSON.stringify(
          sessionResult.error || null
        )}`
      );
    }

    runRows.push(
      createRunRowFromSession(sessionResult.value, {
        seed,
        chapterId: normalized.chapterId,
        runIndex: index + 1,
      })
    );
  }

  return {
    options: {
      chapterId: normalized.chapterId,
      waveMax: normalized.waveMax,
      seedCount: seeds.length,
      baseSeed: normalized.baseSeed,
      seedStride: normalized.seedStride,
    },
    seeds,
    runs: runRows,
    summary: aggregateRunRows(runRows),
  };
}

module.exports = {
  normalizeSimulationOptions,
  summarizeWavePayloads,
  createRunRowFromSession,
  aggregateRunRows,
  runBalanceSimulation,
};
