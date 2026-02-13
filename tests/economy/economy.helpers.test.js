const test = require('node:test');
const assert = require('node:assert/strict');

const {
  getTierChancesByWave,
  applyWaveIncome,
  getActionCost,
  canSpend,
  spend,
} = require('../../src/game/economy');

test('getTierChancesByWave resolves the expected bracket by wave', () => {
  const tierChancesByWave = [
    {
      minWave: 1,
      maxWave: 5,
      chances: { T1: 85, T2: 15, T3: 0 },
    },
    {
      minWave: 6,
      maxWave: 12,
      chances: { T1: 70, T2: 25, T3: 5 },
    },
    {
      minWave: 13,
      chances: { T1: 55, T2: 35, T3: 10 },
    },
  ];

  assert.deepEqual(getTierChancesByWave(tierChancesByWave, 1), { T1: 85, T2: 15, T3: 0 });
  assert.deepEqual(getTierChancesByWave(tierChancesByWave, 8), { T1: 70, T2: 25, T3: 5 });
  assert.deepEqual(getTierChancesByWave(tierChancesByWave, 99), { T1: 55, T2: 35, T3: 10 });
});

test('applyWaveIncome applies wave, clear, kill, interest and relic bonus income', () => {
  const state = {
    gold: 20,
    pendingKillGold: 4,
    relicModifiers: {
      bonusGoldPerWave: 2,
    },
  };

  const config = {
    waveStartGold: 3,
    waveClearBonusGold: 5,
    interest: {
      enabled: true,
      perGold: 10,
      goldPerStep: 1,
      maxGold: 5,
    },
  };

  const nextState = applyWaveIncome(state, config);

  assert.equal(nextState.gold, 36);
  assert.deepEqual(nextState.lastIncome, {
    waveStartGold: 3,
    waveClearGold: 5,
    killGold: 4,
    interestGold: 2,
    relicBonusGold: 2,
    totalGold: 16,
  });
});

test('spend never allows negative gold', () => {
  const config = {
    costs: {
      summon: 3,
      reroll: { base: 2, increasePerUse: 1 },
    },
  };

  const initialState = { gold: 2, rerollCount: 0 };
  assert.equal(canSpend(initialState, 'summon', config), false);

  const failedSummon = spend(initialState, 'summon', config);
  assert.equal(failedSummon.lastSpend.success, false);
  assert.equal(failedSummon.gold, 2);

  const firstReroll = spend(failedSummon, 'reroll', config);
  assert.equal(firstReroll.lastSpend.success, true);
  assert.equal(firstReroll.gold, 0);
  assert.equal(firstReroll.rerollCount, 1);

  const failedSecondReroll = spend(firstReroll, 'reroll', config);
  assert.equal(failedSecondReroll.lastSpend.success, false);
  assert.equal(failedSecondReroll.gold, 0);
});

test('reroll discount can reduce cost to zero but never below zero', () => {
  const config = {
    costs: {
      reroll: { base: 2, increasePerUse: 1 },
    },
  };

  const state = {
    gold: 1,
    rerollCount: 0,
    relicModifiers: {
      rerollDiscountFlat: 5,
    },
  };

  assert.equal(getActionCost(state, 'reroll', config), 0);
  const nextState = spend(state, 'reroll', config);
  assert.equal(nextState.gold, 1);
  assert.equal(nextState.rerollCount, 1);
});
