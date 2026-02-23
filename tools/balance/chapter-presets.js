'use strict';

const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_CHAPTER_ID = 'chapter_1';
const DEFAULT_CHAPTER_PRESETS_PATH = path.resolve(__dirname, '../../content/chapter-presets.json');

let cachedRegistry = null;
let cachedRegistryPath = null;

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

function toNonNegativeNumber(value, fallback) {
  return Math.max(0, toFiniteNumber(value, fallback));
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function deepFreeze(value) {
  if (Array.isArray(value)) {
    for (const item of value) {
      deepFreeze(item);
    }
    return Object.freeze(value);
  }

  if (!isPlainObject(value)) {
    return value;
  }

  const keys = Object.keys(value);
  for (const key of keys) {
    deepFreeze(value[key]);
  }

  return Object.freeze(value);
}

function normalizeRewards(rewards) {
  const source = Array.isArray(rewards) ? rewards : [];
  const normalized = [];

  for (const reward of source) {
    if (!isPlainObject(reward)) {
      continue;
    }
    normalized.push({
      ...reward,
    });
  }

  return normalized;
}

function normalizeEnemyCatalog(enemyCatalog) {
  const source = isPlainObject(enemyCatalog) ? enemyCatalog : {};
  const normalized = {};
  const enemyIds = Object.keys(source).sort();

  for (const enemyId of enemyIds) {
    const rawStats = isPlainObject(source[enemyId]) ? source[enemyId] : {};
    normalized[enemyId] = {
      ...rawStats,
      hp: toPositiveInteger(rawStats.hp, 1),
      armor: toNonNegativeNumber(rawStats.armor, 0),
      resist: toNonNegativeNumber(rawStats.resist, 0),
      moveSpeed: toNonNegativeNumber(rawStats.moveSpeed, 0),
    };
  }

  return normalized;
}

function normalizeSpawnEvents(spawnEvents) {
  const source = Array.isArray(spawnEvents) ? spawnEvents : [];
  const normalized = [];

  for (const spawnEvent of source) {
    if (!isPlainObject(spawnEvent)) {
      continue;
    }

    const enemyId =
      typeof spawnEvent.enemyId === 'string' && spawnEvent.enemyId.length > 0
        ? spawnEvent.enemyId
        : null;
    if (!enemyId) {
      continue;
    }

    normalized.push({
      ...spawnEvent,
      time: toNonNegativeNumber(spawnEvent.time, 0),
      enemyId,
      count: toPositiveInteger(spawnEvent.count, 1),
      interval: toNonNegativeNumber(spawnEvent.interval, 0.6),
    });
  }

  return normalized;
}

function normalizeUnits(units) {
  const source = Array.isArray(units) ? units : [];
  const normalized = [];

  for (const unit of source) {
    if (!isPlainObject(unit)) {
      continue;
    }
    normalized.push({
      ...unit,
    });
  }

  return normalized;
}

function normalizeSimulation(simulation) {
  const source = isPlainObject(simulation) ? simulation : {};

  return {
    ...source,
    tickSeconds: toNonNegativeNumber(source.tickSeconds, 0.25),
    durationSeconds: toNonNegativeNumber(source.durationSeconds, 10),
    spawnEvents: normalizeSpawnEvents(source.spawnEvents),
    enemyCatalog: normalizeEnemyCatalog(source.enemyCatalog),
    units: normalizeUnits(source.units),
  };
}

function normalizeEconomyConfig(economyConfig) {
  const source = isPlainObject(economyConfig) ? economyConfig : {};
  const costs = isPlainObject(source.costs) ? source.costs : {};
  const reroll = isPlainObject(costs.reroll) ? costs.reroll : {};
  const interest = isPlainObject(source.interest) ? source.interest : {};

  return {
    ...source,
    waveStartGold: toNonNegativeNumber(source.waveStartGold, 0),
    waveClearBonusGold: toNonNegativeNumber(source.waveClearBonusGold, 0),
    interest: {
      ...interest,
      enabled: interest.enabled === true,
    },
    costs: {
      ...costs,
      summon: toNonNegativeNumber(costs.summon, 0),
      reroll: {
        ...reroll,
        base: toNonNegativeNumber(reroll.base, 0),
        increasePerUse: toNonNegativeNumber(reroll.increasePerUse, 0),
      },
    },
  };
}

function normalizeChapterPreset(preset) {
  const source = isPlainObject(preset) ? preset : {};
  const gateHp = toNonNegativeNumber(source.gateHp, 20);

  return {
    ...source,
    gateHp,
    maxGateHp: toNonNegativeNumber(source.maxGateHp, gateHp),
    gold: toNonNegativeNumber(source.gold, 0),
    economyConfig: normalizeEconomyConfig(source.economyConfig),
    rewards: normalizeRewards(source.rewards),
    simulation: normalizeSimulation(source.simulation),
  };
}

function normalizeChapterPresetRegistry(registry) {
  const source = isPlainObject(registry) ? registry : {};
  const rawChapters = isPlainObject(source.chapters) ? source.chapters : {};
  const chapterIds = Object.keys(rawChapters).sort();

  if (chapterIds.length === 0) {
    throw new Error('CHAPTER_PRESET_REGISTRY_EMPTY: expected at least one chapter preset');
  }

  const chapters = {};
  for (const chapterId of chapterIds) {
    chapters[chapterId] = normalizeChapterPreset(rawChapters[chapterId]);
  }

  const defaultChapterId =
    typeof source.defaultChapterId === 'string' && chapters[source.defaultChapterId]
      ? source.defaultChapterId
      : chapters[DEFAULT_CHAPTER_ID]
        ? DEFAULT_CHAPTER_ID
        : chapterIds[0];

  return deepFreeze({
    version:
      typeof source.version === 'string' && source.version.length > 0 ? source.version : '1.0.0',
    defaultChapterId,
    chapters,
  });
}

function resolveRegistryPath(options) {
  const source = isPlainObject(options) ? options : {};
  const envPath =
    typeof process.env.BALANCE_CHAPTER_PRESETS_PATH === 'string'
      ? process.env.BALANCE_CHAPTER_PRESETS_PATH
      : '';
  const candidate =
    typeof source.path === 'string' && source.path.trim().length > 0
      ? source.path.trim()
      : envPath.trim().length > 0
        ? envPath.trim()
        : DEFAULT_CHAPTER_PRESETS_PATH;

  return path.isAbsolute(candidate) ? candidate : path.resolve(process.cwd(), candidate);
}

function readRegistryFileText(registryPath, readFileSync) {
  try {
    return String(readFileSync(registryPath, 'utf8'));
  } catch (error) {
    throw new Error(
      `CHAPTER_PRESET_FILE_READ_ERROR: ${registryPath} :: ${
        error && error.message ? error.message : String(error)
      }`
    );
  }
}

function parseRegistryJson(rawText, registryPath) {
  try {
    return JSON.parse(rawText);
  } catch (error) {
    throw new Error(
      `CHAPTER_PRESET_JSON_PARSE_ERROR: ${registryPath} :: ${
        error && error.message ? error.message : String(error)
      }`
    );
  }
}

function loadChapterPresetRegistry(options) {
  const source = isPlainObject(options) ? options : {};
  const readFileSync = typeof source.readFileSync === 'function' ? source.readFileSync : fs.readFileSync;
  const registryPath = resolveRegistryPath(source);
  const rawText = readRegistryFileText(registryPath, readFileSync);
  const parsed = parseRegistryJson(rawText, registryPath);
  const normalized = normalizeChapterPresetRegistry(parsed);

  return deepFreeze({
    ...normalized,
    sourcePath: registryPath,
  });
}

function getChapterPresetRegistry(options) {
  const source = isPlainObject(options) ? options : {};
  if (isPlainObject(source.registry) && isPlainObject(source.registry.chapters)) {
    return source.registry;
  }

  const shouldBypassCache = source.forceReload === true || typeof source.readFileSync === 'function';
  const registryPath = resolveRegistryPath(source);

  if (!shouldBypassCache && cachedRegistry && cachedRegistryPath === registryPath) {
    return cachedRegistry;
  }

  const loadedRegistry = loadChapterPresetRegistry({
    ...source,
    path: registryPath,
  });

  if (!shouldBypassCache) {
    cachedRegistry = loadedRegistry;
    cachedRegistryPath = registryPath;
  }

  return loadedRegistry;
}

function resolveChapterPreset(chapterId, options) {
  const registry = getChapterPresetRegistry(options);
  const chapters = isPlainObject(registry.chapters) ? registry.chapters : {};
  const requestedChapterId =
    typeof chapterId === 'string' && chapterId.length > 0 ? chapterId : null;

  if (requestedChapterId && chapters[requestedChapterId]) {
    return chapters[requestedChapterId];
  }

  if (typeof registry.defaultChapterId === 'string' && chapters[registry.defaultChapterId]) {
    return chapters[registry.defaultChapterId];
  }

  const firstChapterId = Object.keys(chapters).sort()[0];
  if (!firstChapterId) {
    throw new Error('CHAPTER_PRESET_REGISTRY_EMPTY: no chapter presets available');
  }

  return chapters[firstChapterId];
}

function buildBalanceChapterContext(options) {
  const source = isPlainObject(options) ? options : {};
  const chapterId =
    typeof source.chapterId === 'string' && source.chapterId.length > 0
      ? source.chapterId
      : DEFAULT_CHAPTER_ID;
  const preset = resolveChapterPreset(chapterId, {
    registry: source.presetRegistry,
    path: source.presetsPath,
    readFileSync: source.readFileSync,
    forceReload: source.forceReload === true,
  });
  const maxWaves = toPositiveInteger(source.waveMax ?? source.maxWaves, 20);
  const runSeed = Math.floor(toFiniteNumber(source.runSeed, 1));

  return {
    chapterId,
    runSeed,
    waveNumber: 1,
    maxWaves,
    gateHp: toNonNegativeNumber(source.gateHp, preset.gateHp),
    maxGateHp: toNonNegativeNumber(source.maxGateHp, preset.maxGateHp),
    gold: toNonNegativeNumber(source.gold, preset.gold),
    relics: Array.isArray(source.relics) ? source.relics.slice() : [],
    synergyCounts: Array.isArray(source.synergyCounts) ? source.synergyCounts.slice() : [],
    economyConfig: cloneJson(preset.economyConfig),
    rewards: cloneJson(preset.rewards),
    simulation: cloneJson(preset.simulation),
  };
}

const CHAPTER_PRESET_REGISTRY = getChapterPresetRegistry();
const CHAPTER_PRESETS = CHAPTER_PRESET_REGISTRY.chapters;

module.exports = {
  DEFAULT_CHAPTER_ID,
  DEFAULT_CHAPTER_PRESETS_PATH,
  CHAPTER_PRESET_REGISTRY,
  CHAPTER_PRESETS,
  normalizeChapterPresetRegistry,
  loadChapterPresetRegistry,
  getChapterPresetRegistry,
  resolveChapterPreset,
  buildBalanceChapterContext,
};
