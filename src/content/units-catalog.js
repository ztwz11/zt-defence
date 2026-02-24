'use strict';

const fs = require('node:fs');
const path = require('node:path');

const {
  createUnitAssetRegistry,
  parseAnimationKey,
  defaultAnimationEntry,
} = require('../render/unit-asset-registry');

const DEFAULT_UNITS_PATH = path.resolve(__dirname, '../../content/units.json');
const ALLOWED_RARITY = new Set(['T1', 'T2', 'T3']);
const ALLOWED_TARGET_RULE = new Set(['frontMost', 'lowestHp', 'random']);
const CANONICAL_ANIMATIONS = ['idle', 'attack', 'hit', 'die'];

let cachedCatalog = null;
let cachedCatalogPath = null;

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function toFiniteNumber(value, fallback) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function normalizeString(value, fallback = '') {
  if (typeof value !== 'string') {
    return fallback;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : fallback;
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

  for (const key of Object.keys(value)) {
    deepFreeze(value[key]);
  }

  return Object.freeze(value);
}

function cloneValue(value) {
  if (Array.isArray(value)) {
    return value.map(cloneValue);
  }

  if (!isPlainObject(value)) {
    return value;
  }

  const target = {};
  for (const key of Object.keys(value)) {
    target[key] = cloneValue(value[key]);
  }
  return target;
}

function normalizeId(rawId, fallbackId) {
  const id = normalizeString(rawId, fallbackId);
  return /^[a-z][a-z0-9_\-.]*$/.test(id) ? id : fallbackId;
}

function normalizeTags(tags) {
  const source = Array.isArray(tags) ? tags : [];
  const normalized = [];
  const seen = new Set();

  for (const tag of source) {
    const value = normalizeString(tag);
    if (!value || seen.has(value)) {
      continue;
    }
    seen.add(value);
    normalized.push(value);
  }

  return normalized;
}

function normalizeSkillIds(skillIds) {
  const source = Array.isArray(skillIds) ? skillIds : [];
  const normalized = [];
  const seen = new Set();

  for (const skillId of source) {
    const value = normalizeString(skillId);
    if (!value || seen.has(value)) {
      continue;
    }
    seen.add(value);
    normalized.push(value);
  }

  return normalized;
}

function normalizeStats(stats) {
  const source = isPlainObject(stats) ? stats : {};
  return {
    hp: Math.max(1, toFiniteNumber(source.hp, 100)),
    atk: Math.max(0, toFiniteNumber(source.atk, 10)),
    atkSpeed: Math.max(0.1, toFiniteNumber(source.atkSpeed, 1)),
    range: Math.max(0, toFiniteNumber(source.range, 1)),
    critChance: Math.min(1, Math.max(0, toFiniteNumber(source.critChance, 0.05))),
    critMultiplier: Math.max(1, toFiniteNumber(source.critMultiplier, 1.5)),
  };
}

function normalizeAnimationKey(unitId, animation, rawKey) {
  const parsed = parseAnimationKey(rawKey);
  if (parsed) {
    return `${parsed.unitId}.${parsed.animation}`;
  }
  return `${unitId}.${animation}`;
}

function normalizeAnimations(unitId, animations) {
  const source = isPlainObject(animations) ? animations : {};
  const normalized = {};

  for (const animation of CANONICAL_ANIMATIONS) {
    const rawValue =
      animation === 'die' && source.die === undefined && source.death !== undefined
        ? source.death
        : source[animation];
    normalized[animation] = normalizeAnimationKey(unitId, animation, rawValue);
  }

  return normalized;
}

function normalizeRarity(rarity) {
  const value = normalizeString(rarity, 'T1');
  return ALLOWED_RARITY.has(value) ? value : 'T1';
}

function normalizeTargetRule(targetRule) {
  const value = normalizeString(targetRule, 'frontMost');
  return ALLOWED_TARGET_RULE.has(value) ? value : 'frontMost';
}

function normalizeUnit(unit, index) {
  const source = isPlainObject(unit) ? unit : {};
  const fallbackId = `unit_${index + 1}`;
  const id = normalizeId(source.id, fallbackId);

  return {
    id,
    name: normalizeString(source.name, id),
    rarity: normalizeRarity(source.rarity),
    tags: normalizeTags(source.tags),
    stats: normalizeStats(source.stats),
    skillIds: normalizeSkillIds(source.skillIds),
    targetRule: normalizeTargetRule(source.targetRule),
    animations: normalizeAnimations(id, source.animations),
  };
}

function normalizeUnitsCatalog(payload) {
  const source = isPlainObject(payload) ? payload : {};
  const sourceUnits = Array.isArray(source.units) ? source.units : [];
  const normalizedUnits = [];
  const seenIds = new Set();

  for (let index = 0; index < sourceUnits.length; index += 1) {
    const normalizedUnit = normalizeUnit(sourceUnits[index], index);
    if (seenIds.has(normalizedUnit.id)) {
      continue;
    }
    seenIds.add(normalizedUnit.id);
    normalizedUnits.push(normalizedUnit);
  }

  if (normalizedUnits.length === 0) {
    throw new Error('UNITS_CATALOG_EMPTY: expected at least one unit');
  }

  return {
    version: normalizeString(source.version, '0.1.0'),
    units: normalizedUnits,
  };
}

function resolveCatalogPath(options) {
  const source = isPlainObject(options) ? options : {};
  const envPath = normalizeString(process.env.UNITS_CATALOG_PATH);
  const candidate = normalizeString(source.path) || envPath || DEFAULT_UNITS_PATH;
  return path.isAbsolute(candidate) ? candidate : path.resolve(process.cwd(), candidate);
}

function readCatalogFileText(catalogPath, readFileSync) {
  try {
    return String(readFileSync(catalogPath, 'utf8'));
  } catch (error) {
    throw new Error(
      `UNITS_CATALOG_FILE_READ_ERROR: ${catalogPath} :: ${
        error && error.message ? error.message : String(error)
      }`
    );
  }
}

function parseCatalogJson(rawText, catalogPath) {
  try {
    return JSON.parse(rawText);
  } catch (error) {
    throw new Error(
      `UNITS_CATALOG_JSON_PARSE_ERROR: ${catalogPath} :: ${
        error && error.message ? error.message : String(error)
      }`
    );
  }
}

function loadUnitsCatalog(options) {
  const source = isPlainObject(options) ? options : {};
  const readFileSync = typeof source.readFileSync === 'function' ? source.readFileSync : fs.readFileSync;
  const catalogPath = resolveCatalogPath(source);
  const rawText = readCatalogFileText(catalogPath, readFileSync);
  const parsed = parseCatalogJson(rawText, catalogPath);
  const normalized = normalizeUnitsCatalog(parsed);

  return deepFreeze({
    ...normalized,
    sourcePath: catalogPath,
  });
}

function getUnitsCatalog(options) {
  const source = isPlainObject(options) ? options : {};
  const shouldBypassCache = source.forceReload === true || typeof source.readFileSync === 'function';
  const catalogPath = resolveCatalogPath(source);

  if (!shouldBypassCache && cachedCatalog && cachedCatalogPath === catalogPath) {
    return cachedCatalog;
  }

  const catalog = loadUnitsCatalog({
    ...source,
    path: catalogPath,
  });

  if (!shouldBypassCache) {
    cachedCatalog = catalog;
    cachedCatalogPath = catalogPath;
  }

  return catalog;
}

function resolveUnitAssetMap(unit, assetRegistry) {
  const animationEntries = {};
  const sourceAnimations = isPlainObject(unit?.animations) ? unit.animations : {};

  for (const animation of CANONICAL_ANIMATIONS) {
    const animationKey = normalizeString(sourceAnimations[animation], `${unit.id}.${animation}`);
    const resolved = assetRegistry.resolveByKey(animationKey);
    animationEntries[animation] = resolved.ok
      ? resolved.value
      : defaultAnimationEntry(unit.id, animation);
  }

  return animationEntries;
}

function hydrateUnitsCatalogWithAssets(catalog, options) {
  const source = isPlainObject(options) ? options : {};
  const manifestPath = normalizeString(source.manifestPath);
  const assetRegistry =
    source.assetRegistry && typeof source.assetRegistry.resolveByKey === 'function'
      ? source.assetRegistry
      : createUnitAssetRegistry({
          manifestPath: manifestPath || undefined,
        });

  const sourceCatalog = isPlainObject(catalog) ? catalog : getUnitsCatalog(source);
  const sourceUnits = Array.isArray(sourceCatalog.units) ? sourceCatalog.units : [];
  const units = sourceUnits.map((unit) => ({
    ...unit,
    renderAssets: resolveUnitAssetMap(unit, assetRegistry),
  }));

  const byId = {};
  for (const unit of units) {
    byId[unit.id] = unit;
  }

  return deepFreeze({
    version: normalizeString(sourceCatalog.version, '0.1.0'),
    sourcePath: normalizeString(sourceCatalog.sourcePath, resolveCatalogPath(source)),
    units,
    byId,
    assetManifestPath: normalizeString(assetRegistry.manifestPath),
  });
}

function stripInstanceSuffix(unitId) {
  const normalized = normalizeString(unitId);
  if (!normalized) {
    return '';
  }
  return normalized.replace(/([_#-])\d+$/u, '');
}

function findFuzzyUnitDefinitionId(catalog, strippedRuntimeId) {
  if (!isPlainObject(catalog?.byId) || !strippedRuntimeId) {
    return null;
  }

  const byId = catalog.byId;
  const allIds = Object.keys(byId).sort();
  if (allIds.length === 0) {
    return null;
  }

  if (allIds.includes(strippedRuntimeId)) {
    return strippedRuntimeId;
  }

  const token = strippedRuntimeId
    .split(/[_.#-]+/u)
    .filter(Boolean)
    .pop();
  if (!token || token.length < 3) {
    return null;
  }

  const fuzzyCandidates = allIds.filter(
    (id) =>
      id === token ||
      id.endsWith(`_${token}`) ||
      id.startsWith(`${token}_`) ||
      id.includes(`_${token}_`)
  );
  if (fuzzyCandidates.length === 1) {
    return fuzzyCandidates[0];
  }

  return null;
}

function resolveUnitDefinitionId(runtimeUnitId, catalog) {
  const normalizedRuntimeId = normalizeString(runtimeUnitId);
  if (!normalizedRuntimeId || !isPlainObject(catalog?.byId)) {
    return null;
  }

  const byId = catalog.byId;
  if (byId[normalizedRuntimeId]) {
    return normalizedRuntimeId;
  }

  const stripped = stripInstanceSuffix(normalizedRuntimeId);
  if (stripped && byId[stripped]) {
    return stripped;
  }

  return findFuzzyUnitDefinitionId(catalog, stripped);
}

function resolveRuntimeUnitVisual(runtimeUnitId, catalog) {
  const unitDefId = resolveUnitDefinitionId(runtimeUnitId, catalog);
  if (!unitDefId) {
    return null;
  }

  const unitDef = catalog.byId?.[unitDefId];
  if (!isPlainObject(unitDef) || !isPlainObject(unitDef.renderAssets)) {
    return null;
  }

  return deepFreeze({
    runtimeUnitId: normalizeString(runtimeUnitId),
    unitId: unitDefId,
    name: normalizeString(unitDef.name, unitDefId),
    renderAssets: cloneValue(unitDef.renderAssets),
  });
}

function buildRuntimeUnitVisualMap(runtimeUnitIds, catalog) {
  const hydratedCatalog = isPlainObject(catalog) ? catalog : hydrateUnitsCatalogWithAssets();
  const sourceIds = Array.isArray(runtimeUnitIds) ? runtimeUnitIds : [];
  const uniqueIds = Array.from(
    new Set(
      sourceIds
        .map((value) => normalizeString(value))
        .filter(Boolean)
    )
  ).sort();

  const map = {};
  for (const runtimeUnitId of uniqueIds) {
    const visual = resolveRuntimeUnitVisual(runtimeUnitId, hydratedCatalog);
    if (visual) {
      map[runtimeUnitId] = visual;
    }
  }

  return deepFreeze(map);
}

module.exports = {
  DEFAULT_UNITS_PATH,
  normalizeUnitsCatalog,
  loadUnitsCatalog,
  getUnitsCatalog,
  hydrateUnitsCatalogWithAssets,
  resolveUnitDefinitionId,
  resolveRuntimeUnitVisual,
  buildRuntimeUnitVisualMap,
};
