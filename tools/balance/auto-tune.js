'use strict';

const { runBalanceSimulation } = require('./balance-sim');
const { buildBalanceChapterContext } = require('./chapter-presets');
const { sampleRunSeeds } = require('./seed-sampler');
const { normalizeTuningObjective, scoreBalanceSummary: defaultScoreBalanceSummary } = require('./tuning-objective');
const { createSeededRng } = require('../../src/game/sim/seededRng');

const AUTO_TUNE_REPORT_VERSION = 1;

const DEFAULT_PARAMETER_SPACE = Object.freeze({
  waveStartGold: Object.freeze({
    min: 1,
    max: 6,
    step: 1,
  }),
  waveClearBonusGold: Object.freeze({
    min: 2,
    max: 8,
    step: 1,
  }),
  summonCost: Object.freeze({
    min: 2,
    max: 7,
    step: 1,
  }),
  goblinHpScale: Object.freeze({
    min: 1.3,
    max: 1.8,
    step: 0.05,
  }),
  goblinEliteHpScale: Object.freeze({
    min: 1.3,
    max: 1.8,
    step: 0.05,
  }),
});

const DEFAULT_PARAMETER_KEYS = Object.freeze(Object.keys(DEFAULT_PARAMETER_SPACE));
const CHAPTER_TUNING_ENEMY_IDS = Object.freeze({
  chapter_1: Object.freeze({
    primary: 'goblin',
    elite: 'goblin_elite',
  }),
  chapter_2: Object.freeze({
    primary: 'raider_goblin',
    elite: 'orc_brute',
  }),
  chapter_3: Object.freeze({
    primary: 'shadow_raider',
    elite: 'dread_guard',
  }),
});

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
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

function toNumberList(values) {
  if (!Array.isArray(values)) {
    return [];
  }

  const normalized = [];
  const seen = new Set();

  for (const value of values) {
    const numeric = toFiniteNumber(value, NaN);
    if (!Number.isFinite(numeric)) {
      continue;
    }

    const rounded = roundTo(numeric, 6);
    const key = String(rounded);
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    normalized.push(rounded);
  }

  return normalized;
}

function buildRangeValues(spec) {
  const minValue = toFiniteNumber(spec.min, 0);
  const maxValue = toFiniteNumber(spec.max, minValue);
  const stepValue = Math.abs(toFiniteNumber(spec.step, 1));
  const min = Math.min(minValue, maxValue);
  const max = Math.max(minValue, maxValue);
  const step = stepValue > 0 ? stepValue : 1;
  const values = [];

  for (let current = min; current <= max + step / 2; current += step) {
    values.push(roundTo(current, 6));
    if (values.length > 10000) {
      break;
    }
  }

  return values.length > 0 ? toNumberList(values) : [roundTo(min, 6)];
}

function normalizeParameterSpec(spec, fallbackSpec) {
  if (Array.isArray(spec)) {
    const values = toNumberList(spec);
    if (values.length > 0) {
      return {
        values,
      };
    }
  }

  if (isPlainObject(spec) && Array.isArray(spec.values)) {
    const values = toNumberList(spec.values);
    if (values.length > 0) {
      return {
        values,
      };
    }
  }

  if (isPlainObject(spec)) {
    const values = buildRangeValues(spec);
    if (values.length > 0) {
      return {
        values,
      };
    }
  }

  return {
    values: buildRangeValues(fallbackSpec),
  };
}

function normalizeParameterSpace(space) {
  const source = isPlainObject(space) ? space : {};
  const normalized = {};

  for (const key of DEFAULT_PARAMETER_KEYS) {
    normalized[key] = normalizeParameterSpec(source[key], DEFAULT_PARAMETER_SPACE[key]);
  }

  const extraKeys = Object.keys(source).filter((key) => !Object.prototype.hasOwnProperty.call(normalized, key));
  extraKeys.sort();
  for (const key of extraKeys) {
    normalized[key] = normalizeParameterSpec(source[key], { min: 0, max: 0, step: 1 });
  }

  return normalized;
}

function normalizeOptionalSeeds(seedValues) {
  if (!Array.isArray(seedValues)) {
    return null;
  }

  const normalized = [];
  for (const seed of seedValues) {
    const numericSeed = toFiniteNumber(seed, NaN);
    if (!Number.isFinite(numericSeed)) {
      continue;
    }
    normalized.push(Math.floor(numericSeed));
  }

  return normalized.length > 0 ? normalized : null;
}

function extractObjectiveOptions(source) {
  if (isPlainObject(source.objective)) {
    return source.objective;
  }

  return {
    targetClearRate: source.targetClearRate,
    targetReachedWave: source.targetReachedWave,
    maxFailRate: source.maxFailRate,
    weights: isPlainObject(source.weights) ? source.weights : undefined,
  };
}

function normalizeAutoTuneOptions(options) {
  const source = isPlainObject(options) ? options : {};
  const chapterId =
    typeof source.chapterId === 'string' && source.chapterId.length > 0
      ? source.chapterId
      : 'chapter_1';
  const waveMax = toPositiveInteger(source.waveMax, 20);
  const seedCount = toPositiveInteger(source.seedCount ?? source.seeds, 100);
  const baseSeed = toNonNegativeInteger(source.baseSeed, 1);
  const seedStride = toPositiveInteger(source.seedStride ?? source.stride, 1);
  const searchSeed = toNonNegativeInteger(source.searchSeed, 1337);
  const candidateCount = toPositiveInteger(source.candidateCount ?? source.samples, 24);
  const chapterOverrides = isPlainObject(source.chapterOverrides) ? { ...source.chapterOverrides } : {};
  const parameterSpace = normalizeParameterSpace(source.parameterSpace);
  const explicitSeeds = normalizeOptionalSeeds(source.seeds);
  const objective = normalizeTuningObjective(extractObjectiveOptions(source));
  const scoreBalanceSummary =
    typeof source.scoreBalanceSummary === 'function'
      ? source.scoreBalanceSummary
      : defaultScoreBalanceSummary;

  return {
    chapterId,
    waveMax,
    seedCount,
    baseSeed,
    seedStride,
    searchSeed,
    candidateCount,
    parameterSpace,
    objective,
    seeds: explicitSeeds,
    chapterOverrides,
    buildChapterContext:
      typeof source.buildChapterContext === 'function'
        ? source.buildChapterContext
        : buildBalanceChapterContext,
    runSimulation:
      typeof source.runSimulation === 'function' ? source.runSimulation : runBalanceSimulation,
    scoreBalanceSummary,
    sessionCoordinator:
      source.sessionCoordinator && typeof source.sessionCoordinator.runSession === 'function'
        ? source.sessionCoordinator
        : null,
  };
}

function resolveParameterKeys(parameterSpace) {
  const extraKeys = Object.keys(parameterSpace).filter(
    (key) => !Object.prototype.hasOwnProperty.call(DEFAULT_PARAMETER_SPACE, key)
  );
  extraKeys.sort();
  return [...DEFAULT_PARAMETER_KEYS, ...extraKeys];
}

function getMaxUniqueCandidates(parameterSpace, parameterKeys, maxCap) {
  let total = 1;
  for (const key of parameterKeys) {
    const values = parameterSpace[key]?.values || [];
    if (values.length <= 0) {
      return 0;
    }
    total *= values.length;
    if (total >= maxCap) {
      return maxCap;
    }
  }
  return total;
}

function generateSearchCandidatesFromNormalized(normalized) {
  const parameterKeys = resolveParameterKeys(normalized.parameterSpace);
  const maxUnique = getMaxUniqueCandidates(
    normalized.parameterSpace,
    parameterKeys,
    normalized.candidateCount
  );
  const targetCount = Math.min(normalized.candidateCount, maxUnique);

  if (targetCount <= 0) {
    return [];
  }

  const rng = createSeededRng(normalized.searchSeed);
  const candidates = [];
  const seen = new Set();
  let attempts = 0;
  const maxAttempts = Math.max(targetCount * 24, 128);

  while (candidates.length < targetCount && attempts < maxAttempts) {
    attempts += 1;
    const candidate = {};

    for (const key of parameterKeys) {
      const values = normalized.parameterSpace[key].values;
      const choiceIndex = Math.min(values.length - 1, Math.floor(rng() * values.length));
      candidate[key] = values[choiceIndex];
    }

    const signature = JSON.stringify(candidate);
    if (seen.has(signature)) {
      continue;
    }

    seen.add(signature);
    candidates.push(candidate);
  }

  if (candidates.length >= targetCount) {
    return candidates;
  }

  // Fill deterministic leftovers by cycling value indexes in order.
  const indexState = {};
  for (const key of parameterKeys) {
    indexState[key] = 0;
  }

  while (candidates.length < targetCount) {
    const candidate = {};
    for (const key of parameterKeys) {
      const values = normalized.parameterSpace[key].values;
      candidate[key] = values[indexState[key]];
    }

    const signature = JSON.stringify(candidate);
    if (!seen.has(signature)) {
      seen.add(signature);
      candidates.push(candidate);
      if (candidates.length >= targetCount) {
        break;
      }
    }

    for (let index = parameterKeys.length - 1; index >= 0; index -= 1) {
      const key = parameterKeys[index];
      const values = normalized.parameterSpace[key].values;
      indexState[key] += 1;
      if (indexState[key] >= values.length) {
        indexState[key] = 0;
        continue;
      }
      break;
    }
  }

  return candidates;
}

function generateSearchCandidates(options) {
  const normalized = normalizeAutoTuneOptions(options);
  return generateSearchCandidatesFromNormalized(normalized);
}

function ensureObject(parent, key) {
  if (!isPlainObject(parent[key])) {
    parent[key] = {};
  }
  return parent[key];
}

function scaleEnemyHp(enemyCatalog, enemyId, scale) {
  if (!Number.isFinite(scale)) {
    return;
  }

  const enemy = ensureObject(enemyCatalog, enemyId);
  const hp = Number(enemy.hp);
  if (!Number.isFinite(hp)) {
    return;
  }

  enemy.hp = roundTo(Math.max(0, hp) * Math.max(0, scale), 4);
}

function resolveChapterTuningEnemyIds(chapterId) {
  if (typeof chapterId === 'string' && CHAPTER_TUNING_ENEMY_IDS[chapterId]) {
    return CHAPTER_TUNING_ENEMY_IDS[chapterId];
  }

  return CHAPTER_TUNING_ENEMY_IDS.chapter_1;
}

function applyCandidateToChapterContext(chapterContext, candidate) {
  const clonedContext = isPlainObject(chapterContext) ? cloneJson(chapterContext) : {};
  const sourceCandidate = isPlainObject(candidate) ? candidate : {};

  const economyConfig = ensureObject(clonedContext, 'economyConfig');
  const costs = ensureObject(economyConfig, 'costs');
  const simulation = ensureObject(clonedContext, 'simulation');
  const enemyCatalog = ensureObject(simulation, 'enemyCatalog');
  const chapterTuningEnemyIds = resolveChapterTuningEnemyIds(clonedContext.chapterId);

  const waveStartGold = toFiniteNumber(sourceCandidate.waveStartGold, NaN);
  if (Number.isFinite(waveStartGold)) {
    economyConfig.waveStartGold = roundTo(Math.max(0, waveStartGold), 4);
  }

  const waveClearBonusGold = toFiniteNumber(sourceCandidate.waveClearBonusGold, NaN);
  if (Number.isFinite(waveClearBonusGold)) {
    economyConfig.waveClearBonusGold = roundTo(Math.max(0, waveClearBonusGold), 4);
  }

  const summonCost = toFiniteNumber(sourceCandidate.summonCost, NaN);
  if (Number.isFinite(summonCost)) {
    costs.summon = roundTo(Math.max(0, summonCost), 4);
  }

  const goblinHpScale = toFiniteNumber(sourceCandidate.goblinHpScale, NaN);
  scaleEnemyHp(enemyCatalog, chapterTuningEnemyIds.primary, goblinHpScale);

  const goblinEliteHpScale = toFiniteNumber(sourceCandidate.goblinEliteHpScale, NaN);
  scaleEnemyHp(enemyCatalog, chapterTuningEnemyIds.elite, goblinEliteHpScale);

  return clonedContext;
}

function normalizeScoreResult(scoreResult) {
  if (Number.isFinite(Number(scoreResult))) {
    return {
      score: Number(scoreResult),
      scoreDetail: null,
    };
  }

  if (isPlainObject(scoreResult)) {
    const scoreCandidates = [scoreResult.score, scoreResult.value, scoreResult.objective];
    let score = NaN;

    for (const value of scoreCandidates) {
      const numeric = toFiniteNumber(value, NaN);
      if (Number.isFinite(numeric)) {
        score = numeric;
        break;
      }
    }

    if (Number.isFinite(score)) {
      return {
        score,
        scoreDetail: cloneJson(scoreResult),
      };
    }
  }

  throw new Error(
    `AUTO_TUNE_INVALID_SCORE: expected number or object with score/value/objective, got ${JSON.stringify(
      scoreResult
    )}`
  );
}

function buildSeedBatch(normalized) {
  if (Array.isArray(normalized.seeds) && normalized.seeds.length > 0) {
    return normalized.seeds.slice();
  }

  return sampleRunSeeds({
    seedCount: normalized.seedCount,
    baseSeed: normalized.baseSeed,
    seedStride: normalized.seedStride,
  });
}

function evaluateCandidate(normalized, seeds, candidate, id, isBaseline, evaluationIndex) {
  const candidateSnapshot = isPlainObject(candidate) ? cloneJson(candidate) : {};
  const simulationOptions = {
    chapterId: normalized.chapterId,
    waveMax: normalized.waveMax,
    seeds: seeds.slice(),
    baseSeed: normalized.baseSeed,
    seedStride: normalized.seedStride,
    chapterOverrides: normalized.chapterOverrides,
    candidate: candidateSnapshot,
    buildChapterContext(chapterContextOptions) {
      const chapterContext = normalized.buildChapterContext(chapterContextOptions);
      return applyCandidateToChapterContext(chapterContext, candidateSnapshot);
    },
  };

  if (normalized.sessionCoordinator) {
    simulationOptions.sessionCoordinator = normalized.sessionCoordinator;
  }

  const simulationResult = normalized.runSimulation(simulationOptions);
  const summary = isPlainObject(simulationResult?.summary) ? simulationResult.summary : {};
  const scoreResult = normalized.scoreBalanceSummary(
    summary,
    normalized.objective,
    {
      id,
      isBaseline,
      candidate: candidateSnapshot,
      seeds: seeds.slice(),
      simulation: simulationResult,
    }
  );
  const scored = normalizeScoreResult(scoreResult);

  return {
    id,
    isBaseline,
    evaluationIndex,
    candidate: candidateSnapshot,
    score: scored.score,
    scoreDetail: scored.scoreDetail,
    summary: cloneJson(summary),
    simulationOptions: isPlainObject(simulationResult?.options) ? cloneJson(simulationResult.options) : null,
  };
}

function sortEvaluations(a, b) {
  if (a.score !== b.score) {
    return a.score - b.score;
  }
  return a.evaluationIndex - b.evaluationIndex;
}

function runAutoTune(options) {
  const normalized = normalizeAutoTuneOptions(options);
  const seeds = buildSeedBatch(normalized);
  const sampledCandidates = generateSearchCandidatesFromNormalized(normalized);
  const evaluations = [];
  const objective = cloneJson(normalized.objective);

  evaluations.push(evaluateCandidate(normalized, seeds, {}, 'baseline', true, 0));

  for (let index = 0; index < sampledCandidates.length; index += 1) {
    const candidate = sampledCandidates[index];
    evaluations.push(
      evaluateCandidate(
        normalized,
        seeds,
        candidate,
        `candidate_${index + 1}`,
        false,
        index + 1
      )
    );
  }

  const rankedCandidates = evaluations
    .slice()
    .sort(sortEvaluations)
    .map((evaluation, rankIndex) => ({
      rank: rankIndex + 1,
      ...evaluation,
    }));

  return {
    reportVersion: AUTO_TUNE_REPORT_VERSION,
    options: {
      chapterId: normalized.chapterId,
      waveMax: normalized.waveMax,
      seedCount: seeds.length,
      baseSeed: normalized.baseSeed,
      seedStride: normalized.seedStride,
      searchSeed: normalized.searchSeed,
      candidateCount: normalized.candidateCount,
      parameterSpace: cloneJson(normalized.parameterSpace),
      objective: cloneJson(objective),
    },
    objective,
    seeds,
    rankedCandidates,
    bestCandidate: rankedCandidates.length > 0 ? rankedCandidates[0] : null,
  };
}

module.exports = {
  AUTO_TUNE_REPORT_VERSION,
  normalizeAutoTuneOptions,
  generateSearchCandidates,
  applyCandidateToChapterContext,
  runAutoTune,
};
