# Character01 Asset Pack

This document records the generated sprite pack for `hero_chibi_01` and how to rebuild it.

## Source
- `output/imagegen/character01/idle.png`
- `output/imagegen/character01/attack.png`
- `output/imagegen/character01/hit.png`
- `output/imagegen/character01/death.png`

## Build command
```powershell
python tools/assets/build-character-sprite-pack.py
```

## Output
- `assets/sprites/units/hero_chibi_01/idle.png`
- `assets/sprites/units/hero_chibi_01/attack.png`
- `assets/sprites/units/hero_chibi_01/hit.png`
- `assets/sprites/units/hero_chibi_01/die.png`
- `assets/sprites/units/hero_chibi_01/*.meta.json`
- `assets/meta/unit-sprite-manifest.json`

Each animation strip uses 4 frames on a single horizontal sheet with per-animation fps/loop metadata.

## Runtime resolve
- `src/render/unit-asset-registry.js` resolves animation keys (`<unitId>.<animation>`) to sprite sheet + metadata paths.
- `death` alias is normalized to `die`.
- `src/content/units-catalog.js` loads `content/units.json` and hydrates each unit with `renderAssets`.

## Runtime usage example
```js
const { getUnitsCatalog, hydrateUnitsCatalogWithAssets } = require('../src/content');

const unitsCatalog = getUnitsCatalog();
const runtimeUnits = hydrateUnitsCatalogWithAssets(unitsCatalog);
const heroIdle = runtimeUnits.byId.hero_chibi_01.renderAssets.idle;
```
