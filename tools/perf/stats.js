'use strict';

function toFiniteNumber(value) {
  if (value === null || value === undefined || typeof value === 'boolean') {
    return null;
  }

  if (typeof value === 'string' && value.trim().length === 0) {
    return null;
  }

  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function normalizeSamples(samples) {
  if (!Array.isArray(samples)) {
    return [];
  }

  const normalized = [];
  for (const sample of samples) {
    const numeric = toFiniteNumber(sample);
    if (numeric !== null) {
      normalized.push(numeric);
    }
  }
  return normalized;
}

function roundMilliseconds(value) {
  return Math.round(value * 1000) / 1000;
}

function percentile(samples, percentileRank) {
  const normalized = normalizeSamples(samples);
  if (normalized.length === 0) {
    return 0;
  }

  const rank = Math.max(0, Math.min(100, Number(percentileRank) || 0));
  const sorted = normalized.slice().sort((left, right) => left - right);
  const nearestRankIndex = Math.ceil((rank / 100) * sorted.length) - 1;
  const clampedIndex = Math.max(0, Math.min(sorted.length - 1, nearestRankIndex));
  return sorted[clampedIndex];
}

function calculateStats(samples) {
  const normalized = normalizeSamples(samples);
  if (normalized.length === 0) {
    return {
      count: 0,
      avgMs: 0,
      p95Ms: 0,
      maxMs: 0,
    };
  }

  const total = normalized.reduce((sum, sample) => sum + sample, 0);
  const max = normalized.reduce((currentMax, sample) => Math.max(currentMax, sample), 0);

  return {
    count: normalized.length,
    avgMs: roundMilliseconds(total / normalized.length),
    p95Ms: roundMilliseconds(percentile(normalized, 95)),
    maxMs: roundMilliseconds(max),
  };
}

module.exports = {
  calculateStats,
  percentile,
};
