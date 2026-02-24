'use strict';

const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_MANIFEST_PATH = path.resolve(
  __dirname,
  '../../assets/meta/unit-sprite-manifest.json'
);
const SUPPORTED_ANIMATIONS = new Set(['idle', 'attack', 'hit', 'die', 'death']);

function normalizeString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeAnimation(animation) {
  const name = normalizeString(animation).toLowerCase();
  if (name === 'death') {
    return 'die';
  }
  return name;
}

function parseAnimationKey(animationKey) {
  const key = normalizeString(animationKey);
  if (key.length === 0) {
    return null;
  }

  const splitIndex = key.indexOf('.');
  if (splitIndex <= 0 || splitIndex >= key.length - 1) {
    return null;
  }

  const unitId = normalizeString(key.slice(0, splitIndex));
  const animation = normalizeAnimation(key.slice(splitIndex + 1));
  if (!unitId || !animation) {
    return null;
  }

  return {
    unitId,
    animation,
  };
}

function defaultAnimationEntry(unitId, animation) {
  const normalizedUnitId = normalizeString(unitId);
  const normalizedAnimation = normalizeAnimation(animation);
  const spriteBasePath = `assets/sprites/units/${normalizedUnitId}`;
  return {
    key: `${normalizedUnitId}.${normalizedAnimation}`,
    sheetPath: `${spriteBasePath}/${normalizedAnimation}.png`,
    metaPath: `${spriteBasePath}/${normalizedAnimation}.meta.json`,
    source: 'convention',
  };
}

function loadUnitSpriteManifest(options) {
  const config = options && typeof options === 'object' ? options : {};
  const manifestPath = normalizeString(config.manifestPath) || DEFAULT_MANIFEST_PATH;

  if (!fs.existsSync(manifestPath)) {
    return {
      manifestPath,
      manifest: {
        version: '0.1.0',
        units: {},
      },
    };
  }

  const content = fs.readFileSync(manifestPath, 'utf8');
  const parsed = JSON.parse(content);
  const units =
    parsed && typeof parsed === 'object' && parsed.units && typeof parsed.units === 'object'
      ? parsed.units
      : {};

  return {
    manifestPath,
    manifest: {
      version: normalizeString(parsed?.version) || '0.1.0',
      units,
    },
  };
}

function createUnitAssetRegistry(options) {
  const config = options && typeof options === 'object' ? options : {};
  const loaded =
    config.manifest && typeof config.manifest === 'object'
      ? {
          manifestPath: normalizeString(config.manifestPath) || DEFAULT_MANIFEST_PATH,
          manifest: config.manifest,
        }
      : loadUnitSpriteManifest(config);

  function resolve(unitId, animation) {
    const normalizedUnitId = normalizeString(unitId);
    const normalizedAnimation = normalizeAnimation(animation);
    if (!normalizedUnitId || !normalizedAnimation) {
      return {
        ok: false,
        error: {
          code: 'INVALID_ANIMATION_REQUEST',
          message: 'unitId and animation are required',
        },
      };
    }

    if (!SUPPORTED_ANIMATIONS.has(normalizedAnimation)) {
      return {
        ok: false,
        error: {
          code: 'UNSUPPORTED_ANIMATION',
          message: `unsupported animation: ${normalizedAnimation}`,
        },
      };
    }

    const unitEntry = loaded.manifest?.units?.[normalizedUnitId];
    const manifestAnimation = unitEntry?.animations?.[normalizedAnimation];
    if (
      manifestAnimation &&
      typeof manifestAnimation === 'object' &&
      normalizeString(manifestAnimation.sheetPath) &&
      normalizeString(manifestAnimation.metaPath)
    ) {
      return {
        ok: true,
        value: {
          key:
            normalizeString(manifestAnimation.key) || `${normalizedUnitId}.${normalizedAnimation}`,
          sheetPath: normalizeString(manifestAnimation.sheetPath),
          metaPath: normalizeString(manifestAnimation.metaPath),
          source: 'manifest',
        },
      };
    }

    return {
      ok: true,
      value: defaultAnimationEntry(normalizedUnitId, normalizedAnimation),
    };
  }

  function resolveByKey(animationKey) {
    const parsed = parseAnimationKey(animationKey);
    if (!parsed) {
      return {
        ok: false,
        error: {
          code: 'INVALID_ANIMATION_KEY',
          message: 'animation key must be in "<unitId>.<animation>" format',
        },
      };
    }

    return resolve(parsed.unitId, parsed.animation);
  }

  return {
    manifestPath: loaded.manifestPath,
    manifestVersion: normalizeString(loaded.manifest?.version) || '0.1.0',
    resolve,
    resolveByKey,
  };
}

module.exports = {
  DEFAULT_MANIFEST_PATH,
  parseAnimationKey,
  defaultAnimationEntry,
  loadUnitSpriteManifest,
  createUnitAssetRegistry,
};
