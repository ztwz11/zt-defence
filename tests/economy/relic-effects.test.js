const test = require('node:test');
const assert = require('node:assert/strict');

const {
  evaluateRelicEffects,
  applyTierChanceModifiers,
  getBuffForUnitTags,
} = require('../../src/game/relics');

test('evaluateRelicEffects accumulates all supported scaffold effects', () => {
  const relics = [
    {
      id: 'econ_relic',
      effects: [
        { type: 'ModifyTierChance', tier: 'T3', amount: 10 },
        { type: 'DiscountReroll', amount: 1 },
        { type: 'BonusGoldPerWave', amount: 2 },
        { type: 'BuffTaggedUnits', tag: 'fire', buff: { attackPct: 0.2 } },
        { type: 'MergeAssist', chance: 0.1 },
      ],
    },
  ];

  const modifiers = evaluateRelicEffects(relics);

  assert.equal(modifiers.tierChanceModifiers.T3, 10);
  assert.equal(modifiers.rerollDiscountFlat, 1);
  assert.equal(modifiers.bonusGoldPerWave, 2);
  assert.equal(modifiers.mergeAssistChance, 0.1);
  assert.equal(modifiers.taggedUnitBuffs.fire.attackPct, 0.2);
});

test('applyTierChanceModifiers preserves total chance and applies delta', () => {
  const baseChances = { T1: 85, T2: 15, T3: 0 };
  const next = applyTierChanceModifiers(baseChances, { T3: 10 });

  const total = next.T1 + next.T2 + next.T3;
  assert.ok(Math.abs(total - 100) < 0.0001);
  assert.ok(next.T3 > 0);
  assert.ok(next.T1 < 85);
});

test('getBuffForUnitTags sums buffs from all matching tags', () => {
  const modifiers = evaluateRelicEffects([
    {
      effects: [
        { type: 'BuffTaggedUnits', tag: 'fire', buff: { attackPct: 0.2, hpPct: 0.1 } },
        { type: 'BuffTaggedUnits', tag: 'ranged', buff: { attackPct: 0.05 } },
      ],
    },
  ]);

  const buff = getBuffForUnitTags(modifiers, ['fire', 'ranged']);
  assert.equal(buff.attackPct, 0.25);
  assert.equal(buff.hpPct, 0.1);
});
