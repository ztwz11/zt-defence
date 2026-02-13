'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { calculateStats, percentile } = require('../../tools/perf/stats');

test('calculateStats returns avg/p95/max for numeric samples', () => {
  const stats = calculateStats([4, 1, 3, 2, 5]);

  assert.deepEqual(stats, {
    count: 5,
    avgMs: 3,
    p95Ms: 5,
    maxMs: 5,
  });
});

test('calculateStats rounds output to millisecond thousandths', () => {
  const stats = calculateStats([1, 2, 2]);

  assert.equal(stats.count, 3);
  assert.equal(stats.avgMs, 1.667);
  assert.equal(stats.p95Ms, 2);
  assert.equal(stats.maxMs, 2);
});

test('percentile uses nearest-rank strategy', () => {
  const samples = [];
  for (let index = 1; index <= 20; index += 1) {
    samples.push(index);
  }

  assert.equal(percentile(samples, 95), 19);
});

test('calculateStats returns zero metrics for empty or invalid samples', () => {
  assert.deepEqual(calculateStats([]), {
    count: 0,
    avgMs: 0,
    p95Ms: 0,
    maxMs: 0,
  });

  assert.deepEqual(calculateStats(['bad', null]), {
    count: 0,
    avgMs: 0,
    p95Ms: 0,
    maxMs: 0,
  });
});
