'use strict';

const METRIC_KEYS = ['avgMs', 'p95Ms', 'maxMs'];

const DEFAULT_THRESHOLDS = Object.freeze({
  tickSimulation: Object.freeze({
    avgMs: 15,
    p95Ms: 30,
    maxMs: 60,
  }),
  runWaveSlice: Object.freeze({
    avgMs: 20,
    p95Ms: 40,
    maxMs: 80,
  }),
  runSessionShort: Object.freeze({
    avgMs: 35,
    p95Ms: 70,
    maxMs: 140,
  }),
});

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function toFiniteNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function roundMs(value) {
  return Math.round(value * 1000) / 1000;
}

function normalizeThresholds(thresholdConfig) {
  const source = isPlainObject(thresholdConfig) ? thresholdConfig : {};
  const normalized = {};

  for (const [operationName, maybeLimits] of Object.entries(source)) {
    if (!isPlainObject(maybeLimits)) {
      continue;
    }

    const limits = {};
    for (const metricKey of METRIC_KEYS) {
      const numericLimit = toFiniteNumber(maybeLimits[metricKey]);
      if (numericLimit !== null) {
        limits[metricKey] = numericLimit;
      }
    }

    if (Object.keys(limits).length > 0) {
      normalized[operationName] = limits;
    }
  }

  return normalized;
}

function collectOperationStats(report) {
  const operations = Array.isArray(report?.operations) ? report.operations : [];
  const operationStats = new Map();

  for (const operationEntry of operations) {
    const operationName =
      typeof operationEntry?.operation === 'string' ? operationEntry.operation.trim() : '';
    if (!operationName) {
      continue;
    }

    operationStats.set(
      operationName,
      isPlainObject(operationEntry.stats) ? operationEntry.stats : {}
    );
  }

  return operationStats;
}

function evaluateThresholds(report, thresholdConfig, options) {
  const evaluationOptions = isPlainObject(options) ? options : {};
  const failOnMissing = evaluationOptions.failOnMissing !== false;
  const thresholds = normalizeThresholds(
    thresholdConfig && Object.keys(thresholdConfig).length > 0 ? thresholdConfig : DEFAULT_THRESHOLDS
  );
  const operationStats = collectOperationStats(report);
  const failures = [];

  for (const [operationName, limits] of Object.entries(thresholds)) {
    const stats = operationStats.get(operationName);
    if (!stats) {
      if (failOnMissing) {
        failures.push({
          type: 'missing_operation',
          operation: operationName,
        });
      }
      continue;
    }

    for (const [metricKey, maxAllowedMs] of Object.entries(limits)) {
      const actualMs = toFiniteNumber(stats[metricKey]);
      if (actualMs === null) {
        failures.push({
          type: 'missing_metric',
          operation: operationName,
          metric: metricKey,
        });
        continue;
      }

      if (actualMs > maxAllowedMs) {
        failures.push({
          type: 'threshold_exceeded',
          operation: operationName,
          metric: metricKey,
          actualMs: roundMs(actualMs),
          maxAllowedMs: roundMs(maxAllowedMs),
        });
      }
    }
  }

  return {
    ok: failures.length === 0,
    checkedOperations: Object.keys(thresholds).length,
    failures,
  };
}

function formatFailure(failure) {
  if (!failure || typeof failure !== 'object') {
    return 'Unknown threshold evaluation failure';
  }

  if (failure.type === 'missing_operation') {
    return `Missing operation in report: ${failure.operation}`;
  }

  if (failure.type === 'missing_metric') {
    return `Missing metric in report: ${failure.operation}.${failure.metric}`;
  }

  if (failure.type === 'threshold_exceeded') {
    return (
      `Threshold exceeded: ${failure.operation}.${failure.metric} ` +
      `actual=${failure.actualMs}ms threshold=${failure.maxAllowedMs}ms`
    );
  }

  return `Unknown failure type: ${failure.type}`;
}

function formatFailures(result) {
  if (!result || !Array.isArray(result.failures) || result.failures.length === 0) {
    return 'No threshold failures';
  }

  return result.failures.map(formatFailure).join('\n');
}

module.exports = {
  DEFAULT_THRESHOLDS,
  evaluateThresholds,
  formatFailure,
  formatFailures,
  normalizeThresholds,
};
