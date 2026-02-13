'use strict';

const DEFAULT_ACTION = Object.freeze({
  SUMMON: 'summon',
  REROLL: 'reroll',
});

function toNumber(value, fallback) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function toPositiveInteger(value, fallback) {
  return Math.max(1, Math.floor(toNumber(value, fallback)));
}

function clampMin(value, min) {
  return value < min ? min : value;
}

function cloneChanceMap(chances) {
  const next = {};
  if (!chances || typeof chances !== 'object') {
    return next;
  }

  for (const [tier, chance] of Object.entries(chances)) {
    next[tier] = toNumber(chance, 0);
  }

  return next;
}

function parseWaveRangeFromKey(key) {
  if (typeof key !== 'string') {
    return null;
  }

  const trimmed = key.trim();
  const exactMatch = /^(\d+)$/.exec(trimmed);
  if (exactMatch) {
    const wave = Number(exactMatch[1]);
    return { minWave: wave, maxWave: wave };
  }

  const rangeMatch = /^(\d+)\s*-\s*(\d+)$/.exec(trimmed);
  if (rangeMatch) {
    return {
      minWave: Number(rangeMatch[1]),
      maxWave: Number(rangeMatch[2]),
    };
  }

  const openEndedMatch = /^(\d+)\s*\+$/.exec(trimmed);
  if (openEndedMatch) {
    return {
      minWave: Number(openEndedMatch[1]),
      maxWave: Number.POSITIVE_INFINITY,
    };
  }

  return null;
}

function normalizeTierChanceBrackets(tierChancesByWave) {
  if (Array.isArray(tierChancesByWave)) {
    return tierChancesByWave
      .filter(Boolean)
      .map((entry) => {
        const minWave = toPositiveInteger(entry.minWave ?? entry.from ?? entry.waveStart ?? 1, 1);
        const maxValue = entry.maxWave ?? entry.to ?? entry.waveEnd;
        const maxWave =
          maxValue === undefined || maxValue === null
            ? Number.POSITIVE_INFINITY
            : Math.max(minWave, toNumber(maxValue, minWave));

        return {
          minWave,
          maxWave,
          chances: cloneChanceMap(entry.chances ?? entry.tiers ?? entry),
        };
      })
      .sort((a, b) => a.minWave - b.minWave);
  }

  if (tierChancesByWave && typeof tierChancesByWave === 'object') {
    const entries = [];
    for (const [key, value] of Object.entries(tierChancesByWave)) {
      const range = parseWaveRangeFromKey(key);
      if (!range) {
        continue;
      }

      entries.push({
        minWave: range.minWave,
        maxWave: range.maxWave,
        chances: cloneChanceMap(value),
      });
    }

    return entries.sort((a, b) => a.minWave - b.minWave);
  }

  return [];
}

function getTierChancesByWave(tierChancesByWave, wave) {
  const brackets = normalizeTierChanceBrackets(tierChancesByWave);
  if (brackets.length === 0) {
    return {};
  }

  const normalizedWave = toPositiveInteger(wave, 1);
  let selected = null;

  for (const bracket of brackets) {
    if (normalizedWave >= bracket.minWave && normalizedWave <= bracket.maxWave) {
      selected = bracket;
      break;
    }
  }

  if (!selected && normalizedWave < brackets[0].minWave) {
    selected = brackets[0];
  }

  if (!selected) {
    selected = brackets[brackets.length - 1];
  }

  return cloneChanceMap(selected.chances);
}

function calculateInterestGold(currentGold, interestConfig) {
  if (!interestConfig || interestConfig.enabled !== true) {
    return 0;
  }

  const perGold = toPositiveInteger(interestConfig.perGold ?? interestConfig.step ?? 10, 10);
  const goldPerStep = clampMin(toNumber(interestConfig.goldPerStep ?? 1, 1), 0);
  const maxGold = clampMin(toNumber(interestConfig.maxGold ?? interestConfig.max ?? 5, 5), 0);

  const interestGold = Math.floor(currentGold / perGold) * goldPerStep;
  return Math.min(maxGold, interestGold);
}

function applyWaveIncome(state, config) {
  const baseState = state && typeof state === 'object' ? state : {};
  const baseConfig = config && typeof config === 'object' ? config : {};

  const gold = clampMin(toNumber(baseState.gold, 0), 0);
  const waveStartGold = clampMin(toNumber(baseConfig.waveStartGold ?? baseConfig.startGold ?? 0, 0), 0);
  const waveClearGold = clampMin(
    toNumber(baseConfig.waveClearBonusGold ?? baseConfig.waveClearGold ?? baseConfig.clearGold ?? 0, 0),
    0
  );
  const killGold = clampMin(toNumber(baseConfig.killGold ?? baseState.pendingKillGold ?? baseState.killGold ?? 0, 0), 0);
  const interestGold = calculateInterestGold(gold, baseConfig.interest);
  const relicBonusGold = clampMin(
    toNumber(baseConfig.bonusGoldPerWave ?? baseState.relicModifiers?.bonusGoldPerWave ?? 0, 0),
    0
  );

  const totalGold = waveStartGold + waveClearGold + killGold + interestGold + relicBonusGold;

  return {
    ...baseState,
    gold: gold + totalGold,
    pendingKillGold: 0,
    lastIncome: {
      waveStartGold,
      waveClearGold,
      killGold,
      interestGold,
      relicBonusGold,
      totalGold,
    },
  };
}

function resolveSummonCost(costConfig) {
  return clampMin(toNumber(costConfig?.summon ?? costConfig?.summonCost ?? 0, 0), 0);
}

function resolveRerollCost(state, costConfig) {
  const rerollCostConfig = costConfig?.reroll ?? costConfig?.rerollCost ?? 0;
  const rerollCount = clampMin(toNumber(state?.rerollCount, 0), 0);

  let baseCost = 0;
  if (typeof rerollCostConfig === 'number') {
    baseCost = clampMin(toNumber(rerollCostConfig, 0), 0);
  } else {
    const base = clampMin(
      toNumber(
        rerollCostConfig?.base ?? rerollCostConfig?.cost ?? rerollCostConfig?.start ?? rerollCostConfig?.value ?? 0,
        0
      ),
      0
    );
    const increasePerUse = clampMin(
      toNumber(rerollCostConfig?.increasePerUse ?? rerollCostConfig?.increment ?? rerollCostConfig?.scalePerUse ?? 0, 0),
      0
    );
    const maxCost = toNumber(rerollCostConfig?.maxCost ?? rerollCostConfig?.max ?? Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY);

    baseCost = base + rerollCount * increasePerUse;
    if (Number.isFinite(maxCost)) {
      baseCost = Math.min(baseCost, maxCost);
    }
  }

  const flatDiscount = clampMin(toNumber(state?.relicModifiers?.rerollDiscountFlat ?? 0, 0), 0);
  const percentRaw = toNumber(state?.relicModifiers?.rerollDiscountPct ?? 0, 0);
  const percentDiscount = clampMin(percentRaw > 1 ? percentRaw / 100 : percentRaw, 0);
  const discountedCost = (baseCost - flatDiscount) * (1 - Math.min(percentDiscount, 1));

  return clampMin(Math.floor(discountedCost), 0);
}

function getActionCost(state, action, config) {
  const costConfig = config && typeof config === 'object' ? config.costs ?? config : {};
  if (action === DEFAULT_ACTION.SUMMON) {
    return resolveSummonCost(costConfig);
  }

  if (action === DEFAULT_ACTION.REROLL) {
    return resolveRerollCost(state, costConfig);
  }

  return Number.POSITIVE_INFINITY;
}

function canSpend(state, action, config) {
  const gold = clampMin(toNumber(state?.gold, 0), 0);
  const cost = getActionCost(state, action, config);
  return Number.isFinite(cost) && gold >= cost;
}

function spend(state, action, config) {
  const baseState = state && typeof state === 'object' ? state : {};
  const gold = clampMin(toNumber(baseState.gold, 0), 0);
  const cost = getActionCost(baseState, action, config);

  if (!Number.isFinite(cost)) {
    return {
      ...baseState,
      lastSpend: {
        action,
        cost,
        success: false,
        reason: 'UNKNOWN_ACTION',
      },
    };
  }

  if (gold < cost) {
    return {
      ...baseState,
      gold,
      lastSpend: {
        action,
        cost,
        success: false,
        reason: 'INSUFFICIENT_GOLD',
      },
    };
  }

  const nextState = {
    ...baseState,
    gold: clampMin(gold - cost, 0),
    lastSpend: {
      action,
      cost,
      success: true,
    },
  };

  if (action === DEFAULT_ACTION.REROLL) {
    nextState.rerollCount = clampMin(toNumber(baseState.rerollCount, 0), 0) + 1;
  }

  if (action === DEFAULT_ACTION.SUMMON) {
    nextState.summonCount = clampMin(toNumber(baseState.summonCount, 0), 0) + 1;
  }

  return nextState;
}

module.exports = {
  DEFAULT_ACTION,
  getTierChancesByWave,
  applyWaveIncome,
  getActionCost,
  canSpend,
  spend,
};
