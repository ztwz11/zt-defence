'use strict';

function toNumber(value, fallback) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function normalizeUnitTags(unit) {
  if (!unit || typeof unit !== 'object') {
    return [];
  }

  if (Array.isArray(unit.tags)) {
    return unit.tags.filter((tag) => typeof tag === 'string' && tag.length > 0);
  }

  if (typeof unit.tags === 'string' && unit.tags.length > 0) {
    return [unit.tags];
  }

  if (typeof unit.tag === 'string' && unit.tag.length > 0) {
    return [unit.tag];
  }

  return [];
}

function countTags(units) {
  const counts = {};
  if (!Array.isArray(units)) {
    return counts;
  }

  for (const unit of units) {
    const uniqueTags = new Set(normalizeUnitTags(unit));
    for (const tag of uniqueTags) {
      counts[tag] = (counts[tag] ?? 0) + 1;
    }
  }

  return counts;
}

function normalizeThresholds(definition) {
  if (!definition || typeof definition !== 'object') {
    return [];
  }

  let rawThresholds = [];

  if (Array.isArray(definition.thresholds)) {
    rawThresholds = definition.thresholds;
  } else if (Array.isArray(definition.tiers)) {
    rawThresholds = definition.tiers;
  } else if (definition.requiredCount !== undefined) {
    rawThresholds = [definition.requiredCount];
  }

  const thresholds = [];
  for (const value of rawThresholds) {
    if (typeof value === 'object' && value !== null) {
      const count = toNumber(value.count ?? value.requiredCount, Number.NaN);
      if (Number.isInteger(count) && count > 0) {
        thresholds.push(count);
      }
      continue;
    }

    const numeric = toNumber(value, Number.NaN);
    if (Number.isInteger(numeric) && numeric > 0) {
      thresholds.push(numeric);
    }
  }

  return Array.from(new Set(thresholds)).sort((a, b) => a - b);
}

function resolveActiveSynergies(synergyDefs, tagCounts) {
  const definitions = Array.isArray(synergyDefs) ? synergyDefs : [];
  const counts = tagCounts && typeof tagCounts === 'object' ? tagCounts : {};

  const resolved = [];
  for (const definition of definitions) {
    const tag = typeof definition?.tag === 'string' ? definition.tag : null;
    if (!tag) {
      continue;
    }

    const synergyId = definition.synergyId ?? definition.id ?? tag;
    const thresholds = normalizeThresholds(definition);
    if (thresholds.length === 0) {
      continue;
    }

    const currentCount = toNumber(counts[tag], 0);
    const activeThreshold = thresholds.reduce((max, threshold) => {
      if (currentCount >= threshold && threshold > max) {
        return threshold;
      }
      return max;
    }, 0);

    if (activeThreshold <= 0) {
      continue;
    }

    const nextThreshold = thresholds.find((threshold) => threshold > currentCount) ?? null;
    resolved.push({
      synergyId,
      tag,
      count: currentCount,
      activeThreshold,
      nextThreshold,
    });
  }

  return resolved.sort((a, b) => String(a.synergyId).localeCompare(String(b.synergyId)));
}

module.exports = {
  countTags,
  resolveActiveSynergies,
};

