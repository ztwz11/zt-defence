'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const {
  parseAnimationKey,
  defaultAnimationEntry,
  createUnitAssetRegistry,
} = require('../../src/render/unit-asset-registry');

test('parseAnimationKey parses key and normalizes death -> die', () => {
  assert.deepEqual(parseAnimationKey('hero_chibi_01.death'), {
    unitId: 'hero_chibi_01',
    animation: 'die',
  });
});

test('defaultAnimationEntry uses convention-based asset paths', () => {
  assert.deepEqual(defaultAnimationEntry('hero_chibi_01', 'attack'), {
    key: 'hero_chibi_01.attack',
    sheetPath: 'assets/sprites/units/hero_chibi_01/attack.png',
    metaPath: 'assets/sprites/units/hero_chibi_01/attack.meta.json',
    source: 'convention',
  });
});

test('registry resolves configured unit animation from manifest', () => {
  const registry = createUnitAssetRegistry({
    manifestPath: path.resolve(__dirname, '../../assets/meta/unit-sprite-manifest.json'),
  });

  const resolved = registry.resolveByKey('hero_chibi_01.idle');
  assert.equal(resolved.ok, true);
  assert.equal(resolved.value.source, 'manifest');
  assert.equal(resolved.value.sheetPath, 'assets/sprites/units/hero_chibi_01/idle.png');
  assert.equal(resolved.value.metaPath, 'assets/sprites/units/hero_chibi_01/idle.meta.json');
});

test('registry falls back to convention when unit is missing in manifest', () => {
  const registry = createUnitAssetRegistry({
    manifestPath: path.resolve(__dirname, '../../assets/meta/unit-sprite-manifest.json'),
  });

  const resolved = registry.resolveByKey('unknown_unit.attack');
  assert.equal(resolved.ok, true);
  assert.equal(resolved.value.source, 'convention');
  assert.equal(resolved.value.sheetPath, 'assets/sprites/units/unknown_unit/attack.png');
});

test('registry rejects malformed animation key', () => {
  const registry = createUnitAssetRegistry({
    manifestPath: path.resolve(__dirname, '../../assets/meta/unit-sprite-manifest.json'),
  });

  const resolved = registry.resolveByKey('invalid-key-format');
  assert.equal(resolved.ok, false);
  assert.equal(resolved.error.code, 'INVALID_ANIMATION_KEY');
});
