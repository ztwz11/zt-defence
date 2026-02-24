'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const { createHeadlessRenderAdapter } = require('../../src/render/headless-render-adapter');
const {
  loadUnitsCatalog,
  hydrateUnitsCatalogWithAssets,
  buildRuntimeUnitVisualMap,
} = require('../../src/content/units-catalog');

test('headless render adapter attaches renderBinding for unit-origin events', () => {
  const catalog = hydrateUnitsCatalogWithAssets(loadUnitsCatalog(), {
    manifestPath: path.resolve(__dirname, '../../assets/meta/unit-sprite-manifest.json'),
  });
  const runtimeUnitVisualMap = buildRuntimeUnitVisualMap(['archer_1'], catalog);

  const adapter = createHeadlessRenderAdapter();
  const render = adapter.consumeSimulationEvents(
    {
      eventLog: [
        { type: 'WaveStart', time: 0, waveNumber: 1 },
        {
          type: 'Damage',
          time: 0.5,
          srcId: 'archer_1',
          dstId: 'goblin#1',
          amount: 11,
        },
      ],
    },
    {
      runtimeUnitVisualMap,
    }
  );

  assert.equal(render.events.length, 2);
  assert.equal(render.events[0].renderBinding, undefined);
  assert.equal(render.events[1].renderBinding.unitId, 'archer');
  assert.equal(render.events[1].renderBinding.animation, 'attack');
  assert.equal(
    render.events[1].renderBinding.sheetPath,
    'assets/sprites/units/archer/attack.png'
  );
});

test('headless render adapter returns deterministic frame partitioning with render context', () => {
  const adapter = createHeadlessRenderAdapter();
  const render = adapter.consumeSimulationEvents(
    {
      eventLog: [
        { type: 'Spawn', time: 1.0, enemyId: 'goblin' },
        { type: 'Damage', time: 1.0, srcId: 'unknown_1', amount: 3 },
        { type: 'EnemyDeath', time: 2.0, enemyId: 'goblin' },
      ],
    },
    {
      runtimeUnitVisualMap: {},
    }
  );

  assert.equal(render.frames.length, 2);
  assert.equal(render.frames[0].events.length, 2);
  assert.equal(render.frames[1].events.length, 1);
  assert.equal(render.events[1].renderBinding, undefined);
});
