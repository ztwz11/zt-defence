'use strict';

function toNumber(value, fallback) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function clampMin(value, min) {
  return value < min ? min : value;
}

function cloneState(state) {
  return state && typeof state === 'object' ? { ...state } : {};
}

function appendPendingReward(state, reward) {
  const base = cloneState(state);
  const pendingRewards = Array.isArray(base.pendingRewards) ? [...base.pendingRewards] : [];
  pendingRewards.push(reward);
  return {
    ...base,
    pendingRewards,
  };
}

function applyGoldReward(state, reward) {
  const base = cloneState(state);
  const amount = clampMin(toNumber(reward?.amount ?? reward?.gold ?? 0, 0), 0);
  const currentGold = clampMin(toNumber(base.gold, 0), 0);
  return {
    ...base,
    gold: currentGold + amount,
  };
}

function applyHealReward(state, reward) {
  const base = cloneState(state);
  const healAmount = clampMin(toNumber(reward?.amount ?? reward?.heal ?? 0, 0), 0);
  const currentHp = clampMin(toNumber(base.gateHp ?? 0, 0), 0);
  const maxHp = clampMin(toNumber(base.maxGateHp ?? currentHp, currentHp), currentHp);

  return {
    ...base,
    gateHp: Math.min(maxHp, currentHp + healAmount),
  };
}

function applyRelicChoiceReward(state, reward, context) {
  const base = cloneState(state);
  const selection = context && typeof context === 'object' ? context : {};
  const selectedIndex = Number.isInteger(selection.selectedIndex) ? selection.selectedIndex : null;
  const options = Array.isArray(reward?.options)
    ? reward.options
    : Array.isArray(reward?.relicOptions)
      ? reward.relicOptions
      : [];

  if (options.length === 0) {
    return base;
  }

  if (selectedIndex === null || selectedIndex < 0 || selectedIndex >= options.length) {
    return appendPendingReward(base, {
      type: 'RelicChoice',
      options: [...options],
      source: reward?.source ?? 'Reward',
    });
  }

  const relics = Array.isArray(base.relics) ? [...base.relics] : [];
  relics.push(options[selectedIndex]);

  return {
    ...base,
    relics,
  };
}

function applyBossChestReward(state, reward, context) {
  let nextState = cloneState(state);
  const selection = context && typeof context === 'object' ? context : {};
  const selectedIndex = Number.isInteger(selection.selectedIndex) ? selection.selectedIndex : null;

  const contents = Array.isArray(reward?.contents)
    ? reward.contents
    : Array.isArray(reward?.rewards)
      ? reward.rewards
      : [];

  for (const contentReward of contents) {
    nextState = applyReward(nextState, contentReward, selection);
  }

  const options = Array.isArray(reward?.options) ? reward.options : [];
  if (options.length === 0) {
    return nextState;
  }

  if (selectedIndex === null || selectedIndex < 0 || selectedIndex >= options.length) {
    return appendPendingReward(nextState, {
      type: 'BossChest',
      options: [...options],
      source: reward?.source ?? 'BossChest',
    });
  }

  return applyReward(nextState, options[selectedIndex], selection);
}

function applyReward(state, reward, context) {
  const safeReward = reward && typeof reward === 'object' ? reward : {};
  switch (safeReward.type) {
    case 'Gold':
      return applyGoldReward(state, safeReward);
    case 'RelicChoice':
      return applyRelicChoiceReward(state, safeReward, context);
    case 'Heal':
      return applyHealReward(state, safeReward);
    case 'BossChest':
      return applyBossChestReward(state, safeReward, context);
    default:
      return cloneState(state);
  }
}

module.exports = {
  applyReward,
  applyGoldReward,
  applyRelicChoiceReward,
  applyHealReward,
  applyBossChestReward,
};
