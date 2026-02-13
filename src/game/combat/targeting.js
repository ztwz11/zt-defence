"use strict";

const TARGETING_RULES = Object.freeze({
  FRONT_MOST: "frontMost",
  LOWEST_HP: "lowestHp",
  RANDOM: "random",
});

function toComparableId(entity) {
  if (!entity || typeof entity !== "object") {
    return "";
  }

  if (typeof entity.instanceId === "string") {
    return entity.instanceId;
  }
  if (typeof entity.id === "string") {
    return entity.id;
  }
  return "";
}

function isTargetable(enemy) {
  return Boolean(enemy) && enemy.isAlive !== false && Number(enemy.hp) > 0;
}

function compareFrontMost(a, b) {
  const progressA = Number(a.progress) || 0;
  const progressB = Number(b.progress) || 0;
  if (progressA !== progressB) {
    return progressB - progressA;
  }

  const spawnOrderA = Number(a.spawnOrder) || 0;
  const spawnOrderB = Number(b.spawnOrder) || 0;
  if (spawnOrderA !== spawnOrderB) {
    return spawnOrderA - spawnOrderB;
  }

  return toComparableId(a).localeCompare(toComparableId(b));
}

function compareLowestHp(a, b) {
  const hpA = Number(a.hp) || 0;
  const hpB = Number(b.hp) || 0;
  if (hpA !== hpB) {
    return hpA - hpB;
  }

  return compareFrontMost(a, b);
}

function getRandomIndex(length, rng) {
  if (length <= 0) {
    return -1;
  }
  const randomValue = typeof rng === "function" ? Number(rng()) : Math.random();
  if (!Number.isFinite(randomValue)) {
    return 0;
  }

  const bounded = Math.min(Math.max(randomValue, 0), 0.999999999999);
  return Math.floor(bounded * length);
}

function selectTarget(enemies, rule, rng) {
  if (!Array.isArray(enemies) || enemies.length === 0) {
    return null;
  }

  const candidates = enemies.filter(isTargetable);
  if (candidates.length === 0) {
    return null;
  }

  switch (rule) {
    case TARGETING_RULES.LOWEST_HP: {
      return [...candidates].sort(compareLowestHp)[0] || null;
    }
    case TARGETING_RULES.RANDOM: {
      return candidates[getRandomIndex(candidates.length, rng)] || null;
    }
    case TARGETING_RULES.FRONT_MOST:
    default: {
      return [...candidates].sort(compareFrontMost)[0] || null;
    }
  }
}

module.exports = {
  TARGETING_RULES,
  selectTarget,
};
