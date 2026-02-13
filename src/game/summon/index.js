'use strict';

function toNumber(value, fallback) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function normalizeRng(rng) {
  if (typeof rng !== 'function') {
    throw new TypeError('RNG_FUNCTION_REQUIRED');
  }

  return () => {
    const value = toNumber(rng(), 0);
    if (value <= 0) {
      return 0;
    }
    if (value >= 1) {
      return 0.999999999999;
    }
    return value;
  };
}

function normalizeWeightedEntries(entries) {
  if (!Array.isArray(entries)) {
    return [];
  }

  const weighted = [];
  for (const entry of entries) {
    if (entry === null || entry === undefined) {
      continue;
    }

    if (typeof entry === 'object' && !Array.isArray(entry)) {
      const weight = toNumber(entry.weight, 1);
      if (weight <= 0) {
        continue;
      }
      weighted.push({ item: entry, weight });
      continue;
    }

    weighted.push({ item: entry, weight: 1 });
  }

  return weighted;
}

function pickWeightedEntry(rng, weightedEntries) {
  if (weightedEntries.length === 0) {
    return null;
  }

  const totalWeight = weightedEntries.reduce((sum, entry) => sum + entry.weight, 0);
  if (totalWeight <= 0) {
    return null;
  }

  const target = rng() * totalWeight;
  let cumulative = 0;

  for (const entry of weightedEntries) {
    cumulative += entry.weight;
    if (target < cumulative) {
      return entry.item;
    }
  }

  return weightedEntries[weightedEntries.length - 1].item;
}

function drawWithPoolWeights(rng, unitsWithWeight) {
  const nextRandom = normalizeRng(rng);
  const weightedEntries = normalizeWeightedEntries(unitsWithWeight);
  return pickWeightedEntry(nextRandom, weightedEntries);
}

function normalizeTierEntries(tierChances, unitPoolByTier) {
  const pools = unitPoolByTier && typeof unitPoolByTier === 'object' ? unitPoolByTier : {};

  const entries = [];
  if (tierChances && typeof tierChances === 'object') {
    for (const [tier, chance] of Object.entries(tierChances)) {
      const pool = Array.isArray(pools[tier]) ? pools[tier] : [];
      const weight = toNumber(chance, 0);
      if (weight > 0 && pool.length > 0) {
        entries.push({ tier, weight });
      }
    }
  }

  if (entries.length > 0) {
    return entries;
  }

  const fallbackEntries = [];
  for (const [tier, pool] of Object.entries(pools)) {
    if (Array.isArray(pool) && pool.length > 0) {
      fallbackEntries.push({ tier, weight: 1 });
    }
  }

  return fallbackEntries;
}

function drawUnitByTierChance(rng, tierChances, unitPoolByTier) {
  const nextRandom = normalizeRng(rng);
  const tierEntries = normalizeTierEntries(tierChances, unitPoolByTier);
  const selectedTier = pickWeightedEntry(
    nextRandom,
    tierEntries.map((entry) => ({
      item: entry,
      weight: entry.weight,
    }))
  );
  if (!selectedTier) {
    return null;
  }

  const pool = Array.isArray(unitPoolByTier?.[selectedTier.tier]) ? unitPoolByTier[selectedTier.tier] : [];
  if (pool.length === 0) {
    return null;
  }

  const weightedPool = pool.map((unit) => {
    if (unit && typeof unit === 'object' && !Array.isArray(unit)) {
      return {
        ...unit,
        weight: toNumber(unit.weight, 1),
      };
    }

    return {
      unitId: unit,
      weight: 1,
    };
  });

  return drawWithPoolWeights(nextRandom, weightedPool);
}

module.exports = {
  drawUnitByTierChance,
  drawWithPoolWeights,
};
