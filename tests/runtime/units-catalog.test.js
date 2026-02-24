'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const {
  normalizeUnitsCatalog,
  loadUnitsCatalog,
  hydrateUnitsCatalogWithAssets,
} = require('../../src/content/units-catalog');

test('normalizeUnitsCatalog fills defaults and normalizes animation aliases', () => {
  const normalized = normalizeUnitsCatalog({
    version: '1.0.0',
    units: [
      {
        id: 'hero_chibi_01',
        name: 'hero',
        stats: {
          hp: 120,
          atk: 20,
          atkSpeed: 1.1,
          range: 4.5,
        },
        animations: {
          death: 'hero_chibi_01.death',
        },
      },
    ],
  });

  assert.equal(normalized.version, '1.0.0');
  assert.equal(normalized.units[0].animations.die, 'hero_chibi_01.die');
  assert.equal(normalized.units[0].animations.idle, 'hero_chibi_01.idle');
});

test('loadUnitsCatalog loads content/units.json by default', () => {
  const catalog = loadUnitsCatalog();
  assert.equal(catalog.units.length > 0, true);
  assert.equal(catalog.sourcePath.endsWith(path.join('content', 'units.json')), true);
});

test('hydrateUnitsCatalogWithAssets resolves manifest-backed unit assets', () => {
  const catalog = loadUnitsCatalog();
  const hydrated = hydrateUnitsCatalogWithAssets(catalog, {
    manifestPath: path.resolve(__dirname, '../../assets/meta/unit-sprite-manifest.json'),
  });

  const hero = hydrated.byId.hero_chibi_01;
  assert.ok(hero);
  assert.equal(hero.renderAssets.idle.source, 'manifest');
  assert.equal(hero.renderAssets.attack.sheetPath, 'assets/sprites/units/hero_chibi_01/attack.png');
  assert.equal(hero.renderAssets.die.metaPath, 'assets/sprites/units/hero_chibi_01/die.meta.json');
});

test('hydrateUnitsCatalogWithAssets falls back to convention for non-manifest units', () => {
  const catalog = loadUnitsCatalog();
  const hydrated = hydrateUnitsCatalogWithAssets(catalog, {
    manifestPath: path.resolve(__dirname, '../../assets/meta/unit-sprite-manifest.json'),
  });

  const knight = hydrated.byId.knight_sword;
  assert.ok(knight);
  assert.equal(knight.renderAssets.idle.source, 'convention');
  assert.equal(knight.renderAssets.idle.sheetPath, 'assets/sprites/units/knight_sword/idle.png');
});
