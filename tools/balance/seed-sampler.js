'use strict';

function toFiniteNumber(value, fallback) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function toPositiveInteger(value, fallback) {
  return Math.max(1, Math.floor(toFiniteNumber(value, fallback)));
}

function toNonNegativeInteger(value, fallback) {
  return Math.max(0, Math.floor(toFiniteNumber(value, fallback)));
}

function normalizeSeedSamplingOptions(options) {
  const source = options && typeof options === 'object' ? options : {};
  return {
    seedCount: toPositiveInteger(source.seedCount ?? source.seeds, 1),
    baseSeed: toNonNegativeInteger(source.baseSeed, 1),
    stride: toPositiveInteger(source.seedStride ?? source.stride, 1),
  };
}

function sampleRunSeeds(options) {
  const normalized = normalizeSeedSamplingOptions(options);
  const seeds = [];

  for (let index = 0; index < normalized.seedCount; index += 1) {
    seeds.push(normalized.baseSeed + index * normalized.stride);
  }

  return seeds;
}

module.exports = {
  normalizeSeedSamplingOptions,
  sampleRunSeeds,
};
