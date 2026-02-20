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

function normalizeThresholdEnvelope(thresholdConfig) {
  const source = isPlainObject(thresholdConfig) ? thresholdConfig : {};
  const hasVersionedOperations = isPlainObject(source.operations);
  const operationsSource = hasVersionedOperations ? source.operations : source;
  const normalizedVersion =
    typeof source.version === 'string' && source.version.trim()
      ? source.version.trim()
      : null;
  const normalizedProfile =
    typeof source.profile === 'string' && source.profile.trim()
      ? source.profile.trim()
      : null;

  return {
    version: hasVersionedOperations ? normalizedVersion : null,
    profile: hasVersionedOperations ? normalizedProfile : null,
    operations: normalizeThresholds(operationsSource),
  };
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
  const thresholdEnvelope = normalizeThresholdEnvelope(
    thresholdConfig && Object.keys(thresholdConfig).length > 0 ? thresholdConfig : DEFAULT_THRESHOLDS
  );
  const thresholds = thresholdEnvelope.operations;
  const operationStats = collectOperationStats(report);
  const failures = [];

  for (const [operationName, limits] of Object.entries(thresholds)) {
    const stats = operationStats.get(operationName);
    if (!stats) {
      if (failOnMissing) {
        failures.push({
          type: 'missing_operation',
          operation: operationName,
          metric: null,
          actualMs: null,
          thresholdMs: null,
          profile: thresholdEnvelope.profile,
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
          actualMs: null,
          thresholdMs: roundMs(maxAllowedMs),
          maxAllowedMs: roundMs(maxAllowedMs),
          profile: thresholdEnvelope.profile,
        });
        continue;
      }

      if (actualMs > maxAllowedMs) {
        const roundedThresholdMs = roundMs(maxAllowedMs);
        failures.push({
          type: 'threshold_exceeded',
          operation: operationName,
          metric: metricKey,
          actualMs: roundMs(actualMs),
          thresholdMs: roundedThresholdMs,
          maxAllowedMs: roundedThresholdMs,
          profile: thresholdEnvelope.profile,
        });
      }
    }
  }

  return {
    ok: failures.length === 0,
    checkedOperations: Object.keys(thresholds).length,
    profile: thresholdEnvelope.profile,
    thresholdVersion: thresholdEnvelope.version,
    failures,
  };
}

function formatFailure(failure) {
  if (!failure || typeof failure !== 'object') {
    return 'Unknown threshold evaluation failure';
  }

  if (failure.type === 'missing_operation') {
    return (
      'Missing operation in report: ' +
      `operation=${failure.operation} metric=n/a actual=n/a threshold=n/a` +
      (failure.profile ? ` profile=${failure.profile}` : '')
    );
  }

  if (failure.type === 'missing_metric') {
    const thresholdValue = Number.isFinite(failure.thresholdMs) ? `${failure.thresholdMs}ms` : 'n/a';
    return (
      'Missing metric in report: ' +
      `operation=${failure.operation} metric=${failure.metric} actual=n/a threshold=${thresholdValue}` +
      (failure.profile ? ` profile=${failure.profile}` : '')
    );
  }

  if (failure.type === 'threshold_exceeded') {
    const thresholdValue = Number.isFinite(failure.thresholdMs)
      ? failure.thresholdMs
      : Number.isFinite(failure.maxAllowedMs)
      ? failure.maxAllowedMs
      : 'n/a';
    const actualValue = Number.isFinite(failure.actualMs) ? `${failure.actualMs}ms` : 'n/a';
    const thresholdLabel =
      typeof thresholdValue === 'number' ? `${thresholdValue}ms` : String(thresholdValue);
    return (
      'Threshold exceeded: ' +
      `operation=${failure.operation} metric=${failure.metric} ` +
      `actual=${actualValue} threshold=${thresholdLabel}` +
      (failure.profile ? ` profile=${failure.profile}` : '')
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
  normalizeThresholdEnvelope,
  normalizeThresholds,
};
