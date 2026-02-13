'use strict';

function toStar(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return 1;
  }
  return Math.min(3, Math.max(1, Math.floor(numeric)));
}

function cloneUnit(unit) {
  if (!unit || typeof unit !== 'object') {
    return { unitId: unit, star: 1 };
  }

  const next = { ...unit };
  if (next.slot && typeof next.slot === 'object') {
    next.slot = { ...next.slot };
  }
  next.star = toStar(next.star);
  return next;
}

function cloneUnits(units) {
  if (!Array.isArray(units)) {
    return [];
  }
  return units.map(cloneUnit);
}

function detectMergeCandidates(units) {
  const normalized = cloneUnits(units);
  const groups = new Map();

  for (const unit of normalized) {
    const unitId = unit?.unitId;
    if (typeof unitId !== 'string' || unitId.length === 0) {
      continue;
    }

    const star = toStar(unit.star);
    if (star >= 3) {
      continue;
    }

    const key = `${unitId}::${star}`;
    const current = groups.get(key) ?? {
      unitId,
      star,
      count: 0,
      mergeCount: 0,
    };

    current.count += 1;
    current.mergeCount = Math.floor(current.count / 3);
    groups.set(key, current);
  }

  return Array.from(groups.values())
    .filter((entry) => entry.mergeCount > 0)
    .sort((a, b) => {
      if (a.unitId !== b.unitId) {
        return a.unitId.localeCompare(b.unitId);
      }
      return a.star - b.star;
    });
}

function findMergeableStar(units, unitId, starCounts) {
  for (const unit of units) {
    if (unit?.unitId !== unitId) {
      continue;
    }

    const star = toStar(unit.star);
    if (star >= 3) {
      continue;
    }

    if ((starCounts.get(star) ?? 0) >= 3) {
      return star;
    }
  }

  return null;
}

function mergeThreeSameUnits(units, unitId) {
  const normalized = cloneUnits(units);
  if (typeof unitId !== 'string' || unitId.length === 0) {
    return {
      units: normalized,
      mergedUnit: null,
      consumedUnits: [],
      didMerge: false,
    };
  }

  const starCounts = new Map();
  for (const unit of normalized) {
    if (unit?.unitId !== unitId) {
      continue;
    }
    const star = toStar(unit.star);
    starCounts.set(star, (starCounts.get(star) ?? 0) + 1);
  }

  const selectedStar = findMergeableStar(normalized, unitId, starCounts);
  if (selectedStar === null) {
    return {
      units: normalized,
      mergedUnit: null,
      consumedUnits: [],
      didMerge: false,
    };
  }

  const consumedUnits = [];
  const remainingUnits = [];
  for (const unit of normalized) {
    if (unit.unitId === unitId && toStar(unit.star) === selectedStar && consumedUnits.length < 3) {
      consumedUnits.push(unit);
    } else {
      remainingUnits.push(unit);
    }
  }

  if (consumedUnits.length < 3) {
    return {
      units: normalized,
      mergedUnit: null,
      consumedUnits: [],
      didMerge: false,
    };
  }

  const baseUnit = consumedUnits[0];
  const mergedUnit = {
    ...baseUnit,
    star: Math.min(3, selectedStar + 1),
  };

  return {
    units: [...remainingUnits, mergedUnit],
    mergedUnit,
    consumedUnits,
    didMerge: true,
  };
}

module.exports = {
  detectMergeCandidates,
  mergeThreeSameUnits,
};

