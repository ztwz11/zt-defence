"use strict";

const DEFAULT_CRIT_MULTIPLIER = 1.5;

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function toFiniteNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function applyDefenseFormula(rawDamage, defense) {
  const safeRaw = Math.max(0, toFiniteNumber(rawDamage, 0));
  const safeDefense = toFiniteNumber(defense, 0);
  const denominator = Math.max(1, 100 + safeDefense);
  return safeRaw * (100 / denominator);
}

function computePhysicalDamage(rawDamage, armor) {
  return applyDefenseFormula(rawDamage, armor);
}

function computeMagicDamage(rawDamage, resist) {
  return applyDefenseFormula(rawDamage, resist);
}

function rollCrit(critChance, rng) {
  const chance = clamp(toFiniteNumber(critChance, 0), 0, 1);
  const random = typeof rng === "function" ? toFiniteNumber(rng(), 1) : Math.random();
  return random < chance;
}

function withCrit(rawDamage, options, rng) {
  const config = options || {};
  const forceCrit = Boolean(config.forceCrit);
  const critMultiplier = Math.max(1, toFiniteNumber(config.critMultiplier, DEFAULT_CRIT_MULTIPLIER));
  const isCrit = forceCrit || rollCrit(config.critChance, rng);
  const adjustedRaw = isCrit ? rawDamage * critMultiplier : rawDamage;
  return {
    rawDamage: adjustedRaw,
    isCrit,
  };
}

function computeDamage(params, rng) {
  const config = params || {};
  const rawDamage = Math.max(0, toFiniteNumber(config.rawDamage, 0));
  const damageType = typeof config.damageType === "string" ? config.damageType : "physical";
  const critResult = withCrit(rawDamage, config, rng);

  let finalDamage;
  if (damageType === "magic") {
    finalDamage = computeMagicDamage(critResult.rawDamage, config.resist);
  } else if (damageType === "true") {
    finalDamage = critResult.rawDamage;
  } else {
    finalDamage = computePhysicalDamage(critResult.rawDamage, config.armor);
  }

  return {
    rawDamage: critResult.rawDamage,
    finalDamage,
    isCrit: critResult.isCrit,
    damageType,
  };
}

module.exports = {
  DEFAULT_CRIT_MULTIPLIER,
  computePhysicalDamage,
  computeMagicDamage,
  computeDamage,
  rollCrit,
};
