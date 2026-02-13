'use strict';

function toNumber(value, fallback) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function clampMin(value, min) {
  return value < min ? min : value;
}

function round(value) {
  return Math.round(value * 10000) / 10000;
}

function createModifierBag() {
  return {
    tierChanceModifiers: {},
    rerollDiscountFlat: 0,
    rerollDiscountPct: 0,
    bonusGoldPerWave: 0,
    taggedUnitBuffs: {},
    mergeAssistChance: 0,
  };
}

function resolveEffectValue(effect, keys, fallback) {
  for (const key of keys) {
    if (effect && Object.prototype.hasOwnProperty.call(effect, key)) {
      return toNumber(effect[key], fallback);
    }
  }

  return fallback;
}

function evaluateModifyTierChance(modifiers, effect) {
  const tierKey = effect?.tier ?? effect?.targetTier ?? effect?.target;
  if (!tierKey) {
    return;
  }

  const delta = resolveEffectValue(effect, ['amount', 'delta', 'value', 'bonus'], 0);
  modifiers.tierChanceModifiers[tierKey] = toNumber(modifiers.tierChanceModifiers[tierKey], 0) + delta;
}

function evaluateDiscountReroll(modifiers, effect) {
  const flatAmount = clampMin(resolveEffectValue(effect, ['amount', 'flat', 'value'], 0), 0);
  modifiers.rerollDiscountFlat += flatAmount;

  const percentRaw = resolveEffectValue(effect, ['percent', 'ratio'], 0);
  const normalizedPercent = percentRaw > 1 ? percentRaw / 100 : percentRaw;
  modifiers.rerollDiscountPct = clamp(modifiers.rerollDiscountPct + normalizedPercent, 0, 1);
}

function evaluateBonusGoldPerWave(modifiers, effect) {
  const amount = clampMin(resolveEffectValue(effect, ['amount', 'value', 'bonus'], 0), 0);
  modifiers.bonusGoldPerWave += amount;
}

function evaluateBuffTaggedUnits(modifiers, effect) {
  const tags = Array.isArray(effect?.tags) ? effect.tags : effect?.tag ? [effect.tag] : [];
  if (tags.length === 0) {
    return;
  }

  const buffValues = effect?.buff && typeof effect.buff === 'object' ? effect.buff : effect?.stats ?? {};
  for (const tag of tags) {
    if (!modifiers.taggedUnitBuffs[tag]) {
      modifiers.taggedUnitBuffs[tag] = {};
    }

    for (const [key, value] of Object.entries(buffValues)) {
      const numeric = toNumber(value, 0);
      modifiers.taggedUnitBuffs[tag][key] = toNumber(modifiers.taggedUnitBuffs[tag][key], 0) + numeric;
    }
  }
}

function evaluateMergeAssist(modifiers, effect) {
  const rawChance = resolveEffectValue(effect, ['chance', 'percent', 'value'], 0);
  const normalizedChance = rawChance > 1 ? rawChance / 100 : rawChance;
  modifiers.mergeAssistChance = clamp(modifiers.mergeAssistChance + normalizedChance, 0, 1);
}

function evaluateRelicEffects(relics) {
  const modifiers = createModifierBag();
  if (!Array.isArray(relics)) {
    return modifiers;
  }

  for (const relic of relics) {
    const effects = Array.isArray(relic?.effects) ? relic.effects : [];

    for (const effect of effects) {
      switch (effect?.type) {
        case 'ModifyTierChance':
          evaluateModifyTierChance(modifiers, effect);
          break;
        case 'DiscountReroll':
          evaluateDiscountReroll(modifiers, effect);
          break;
        case 'BonusGoldPerWave':
          evaluateBonusGoldPerWave(modifiers, effect);
          break;
        case 'BuffTaggedUnits':
          evaluateBuffTaggedUnits(modifiers, effect);
          break;
        case 'MergeAssist':
          evaluateMergeAssist(modifiers, effect);
          break;
        default:
          break;
      }
    }
  }

  modifiers.rerollDiscountFlat = round(modifiers.rerollDiscountFlat);
  modifiers.rerollDiscountPct = round(modifiers.rerollDiscountPct);
  modifiers.bonusGoldPerWave = round(modifiers.bonusGoldPerWave);
  modifiers.mergeAssistChance = round(modifiers.mergeAssistChance);

  return modifiers;
}

function applyTierChanceModifiers(baseChances, tierChanceModifiers) {
  const base = baseChances && typeof baseChances === 'object' ? baseChances : {};
  const modifiers = tierChanceModifiers && typeof tierChanceModifiers === 'object' ? tierChanceModifiers : {};
  const keys = new Set([...Object.keys(base), ...Object.keys(modifiers)]);
  const originalTotal = [...keys].reduce((sum, tier) => sum + clampMin(toNumber(base[tier], 0), 0), 0);

  const adjusted = {};
  for (const key of keys) {
    const nextValue = clampMin(toNumber(base[key], 0) + toNumber(modifiers[key], 0), 0);
    adjusted[key] = nextValue;
  }

  const adjustedTotal = Object.values(adjusted).reduce((sum, value) => sum + value, 0);
  if (originalTotal <= 0 || adjustedTotal <= 0) {
    return adjusted;
  }

  const scale = originalTotal / adjustedTotal;
  let finalTotal = 0;
  for (const key of keys) {
    adjusted[key] = round(adjusted[key] * scale);
    finalTotal += adjusted[key];
  }

  const drift = round(originalTotal - finalTotal);
  if (Math.abs(drift) > 0) {
    const targetKey = [...keys].sort((a, b) => adjusted[b] - adjusted[a])[0];
    adjusted[targetKey] = round(clampMin(adjusted[targetKey] + drift, 0));
  }

  return adjusted;
}

function getBuffForUnitTags(modifiers, tags) {
  const normalizedTags = Array.isArray(tags) ? tags : [];
  const tagBuffs = modifiers?.taggedUnitBuffs ?? {};
  const mergedBuff = {};

  for (const tag of normalizedTags) {
    const buff = tagBuffs[tag];
    if (!buff || typeof buff !== 'object') {
      continue;
    }

    for (const [key, value] of Object.entries(buff)) {
      mergedBuff[key] = toNumber(mergedBuff[key], 0) + toNumber(value, 0);
    }
  }

  return mergedBuff;
}

module.exports = {
  evaluateRelicEffects,
  applyTierChanceModifiers,
  getBuffForUnitTags,
};
