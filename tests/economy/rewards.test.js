const test = require('node:test');
const assert = require('node:assert/strict');

const {
  applyReward,
  applyGoldReward,
  applyRelicChoiceReward,
  applyHealReward,
  applyBossChestReward,
} = require('../../src/game/rewards');

test('Gold reward helper adds gold', () => {
  const state = { gold: 5 };
  const nextState = applyGoldReward(state, { type: 'Gold', amount: 4 });
  assert.equal(nextState.gold, 9);
});

test('Heal reward helper heals up to max gate HP', () => {
  const state = { gateHp: 8, maxGateHp: 10 };
  const nextState = applyHealReward(state, { type: 'Heal', amount: 5 });
  assert.equal(nextState.gateHp, 10);
});

test('RelicChoice reward can be queued or directly selected', () => {
  const state = { relics: [] };
  const reward = { type: 'RelicChoice', options: ['relic_a', 'relic_b', 'relic_c'] };

  const pendingState = applyRelicChoiceReward(state, reward);
  assert.equal(pendingState.pendingRewards.length, 1);

  const selectedState = applyRelicChoiceReward(state, reward, { selectedIndex: 1 });
  assert.deepEqual(selectedState.relics, ['relic_b']);
  assert.equal(selectedState.pendingRewards ? selectedState.pendingRewards.length : 0, 0);
});

test('BossChest reward applies contained rewards and can apply selected option', () => {
  const state = {
    gold: 0,
    gateHp: 5,
    maxGateHp: 10,
    relics: [],
  };

  const chest = {
    type: 'BossChest',
    contents: [{ type: 'Gold', amount: 10 }],
    options: [{ type: 'Heal', amount: 3 }, { type: 'RelicChoice', options: ['boss_relic'] }],
  };

  const pendingState = applyBossChestReward(state, chest);
  assert.equal(pendingState.gold, 10);
  assert.equal(pendingState.pendingRewards.length, 1);

  const selectedState = applyBossChestReward(state, chest, { selectedIndex: 0 });
  assert.equal(selectedState.gold, 10);
  assert.equal(selectedState.gateHp, 8);
});

test('applyReward dispatches all supported reward types', () => {
  const base = { gold: 1, gateHp: 3, maxGateHp: 5, relics: [] };
  const withGold = applyReward(base, { type: 'Gold', amount: 2 });
  const withHeal = applyReward(withGold, { type: 'Heal', amount: 5 });
  const withRelic = applyReward(withHeal, { type: 'RelicChoice', options: ['r1'] }, { selectedIndex: 0 });

  assert.equal(withRelic.gold, 3);
  assert.equal(withRelic.gateHp, 5);
  assert.deepEqual(withRelic.relics, ['r1']);
});
