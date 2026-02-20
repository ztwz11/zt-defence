'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  evaluateThresholds,
  formatFailures,
  normalizeThresholdEnvelope,
  normalizeThresholds,
} = require('../../tools/perf/threshold-checker');

function createReport() {
  return {
    operations: [
      {
        operation: 'tickSimulation',
        stats: {
          avgMs: 1.5,
          p95Ms: 2.5,
          maxMs: 4,
        },
      },
      {
        operation: 'runWaveSlice',
        stats: {
          avgMs: 2,
          p95Ms: 3,
          maxMs: 5,
        },
      },
      {
        operation: 'runSessionShort',
        stats: {
          avgMs: 3,
          p95Ms: 5,
          maxMs: 8,
        },
      },
    ],
  };
}

test('evaluateThresholds passes when all operations are under limit', () => {
  const result = evaluateThresholds(
    createReport(),
    {
      tickSimulation: { avgMs: 2, p95Ms: 3, maxMs: 5 },
      runWaveSlice: { avgMs: 3, p95Ms: 4, maxMs: 6 },
      runSessionShort: { avgMs: 4, p95Ms: 6, maxMs: 9 },
    },
    {
      failOnMissing: true,
    }
  );

  assert.equal(result.ok, true);
  assert.equal(result.failures.length, 0);
});

test('evaluateThresholds fails when a metric exceeds threshold and formats clear message', () => {
  const result = evaluateThresholds(createReport(), {
    tickSimulation: { p95Ms: 2 },
  });

  assert.equal(result.ok, false);
  assert.equal(result.failures.length, 1);
  assert.equal(result.failures[0].type, 'threshold_exceeded');

  const message = formatFailures(result);
  assert.match(message, /operation=tickSimulation/);
  assert.match(message, /metric=p95Ms/);
  assert.match(message, /actual=2.5ms threshold=2ms/);
});

test('evaluateThresholds fails when configured operation is missing', () => {
  const report = {
    operations: [
      {
        operation: 'tickSimulation',
        stats: { avgMs: 1, p95Ms: 1, maxMs: 1 },
      },
    ],
  };

  const result = evaluateThresholds(report, {
    runWaveSlice: { avgMs: 2 },
  });

  assert.equal(result.ok, false);
  assert.equal(result.failures.length, 1);
  assert.equal(result.failures[0].type, 'missing_operation');
  assert.match(formatFailures(result), /Missing operation in report: operation=runWaveSlice/);
});

test('evaluateThresholds can ignore missing operations', () => {
  const report = {
    operations: [
      {
        operation: 'tickSimulation',
        stats: { avgMs: 1, p95Ms: 1, maxMs: 1 },
      },
    ],
  };

  const result = evaluateThresholds(
    report,
    {
      runWaveSlice: { avgMs: 2 },
    },
    {
      failOnMissing: false,
    }
  );

  assert.equal(result.ok, true);
  assert.equal(result.failures.length, 0);
});

test('normalizeThresholds keeps only numeric metrics', () => {
  const normalized = normalizeThresholds({
    tickSimulation: {
      avgMs: 10,
      p95Ms: 'bad',
      maxMs: 20,
      unknown: 30,
    },
  });

  assert.deepEqual(normalized, {
    tickSimulation: {
      avgMs: 10,
      maxMs: 20,
    },
  });
});

test('normalizeThresholdEnvelope supports versioned threshold schema', () => {
  const envelope = normalizeThresholdEnvelope({
    version: '1.2.3',
    profile: 'ci-mobile-baseline',
    operations: {
      tickSimulation: {
        avgMs: 10,
        p95Ms: 'bad',
        maxMs: 20,
      },
      runWaveSlice: 'invalid',
    },
  });

  assert.deepEqual(envelope, {
    version: '1.2.3',
    profile: 'ci-mobile-baseline',
    operations: {
      tickSimulation: {
        avgMs: 10,
        maxMs: 20,
      },
    },
  });
});

test('evaluateThresholds reads versioned thresholds and includes profile in failures', () => {
  const result = evaluateThresholds(createReport(), {
    version: '2.0.0',
    profile: 'ci-mobile-baseline',
    operations: {
      tickSimulation: { p95Ms: 2 },
    },
  });

  assert.equal(result.ok, false);
  assert.equal(result.profile, 'ci-mobile-baseline');
  assert.equal(result.thresholdVersion, '2.0.0');

  const message = formatFailures(result);
  assert.match(message, /operation=tickSimulation/);
  assert.match(message, /metric=p95Ms/);
  assert.match(message, /actual=2.5ms/);
  assert.match(message, /threshold=2ms/);
  assert.match(message, /profile=ci-mobile-baseline/);
});
