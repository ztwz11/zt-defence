'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { parseArgs, runAndCheck } = require('../../tools/perf/run-and-check');

test('parseArgs supports all wrapper options', () => {
  const args = parseArgs([
    '--iterations=75',
    '--profile=qa-smoke',
    '--output=artifacts/perf/report.json',
    '--thresholds=tools/perf/custom-thresholds.json',
    '--allow-missing',
  ]);

  assert.deepEqual(args, {
    help: false,
    iterations: 75,
    profile: 'qa-smoke',
    outputPath: 'artifacts/perf/report.json',
    thresholdPath: 'tools/perf/custom-thresholds.json',
    allowMissing: true,
  });
});

test('runAndCheck returns PASS summary and forwards failOnMissing=false when allow-missing is enabled', () => {
  let probeOptions = null;
  let thresholdPathArg = null;
  let evaluationOptions = null;

  const result = runAndCheck(
    {
      iterations: 20,
      profile: 'qa-smoke',
      outputPath: null,
      thresholdPath: 'thresholds.json',
      allowMissing: true,
    },
    {
      runPerfProbe(options) {
        probeOptions = options;
        return {
          reportVersion: 1,
          generatedAt: '2026-02-20T00:00:00.000Z',
          iterations: options.iterations,
          profile: options.profile,
          thresholdVersion: '1.0.0',
          operations: [],
        };
      },
      loadThresholds(thresholdPath) {
        thresholdPathArg = thresholdPath;
        return {
          version: '1.0.0',
          profile: 'qa-smoke',
          operations: {},
        };
      },
      evaluateThresholds(report, thresholds, options) {
        assert.equal(report.profile, 'qa-smoke');
        assert.equal(thresholds.version, '1.0.0');
        evaluationOptions = options;
        return {
          ok: true,
          checkedOperations: 3,
          failures: [],
          profile: 'qa-smoke',
          thresholdVersion: '1.0.0',
        };
      },
      now() {
        return '2026-02-20T00:00:01.000Z';
      },
    }
  );

  assert.deepEqual(probeOptions, {
    iterations: 20,
    profile: 'qa-smoke',
  });
  assert.equal(thresholdPathArg, 'thresholds.json');
  assert.deepEqual(evaluationOptions, { failOnMissing: false });
  assert.equal(result.ok, true);
  assert.match(result.summaryLine, /\[perf-run-and-check\] PASS/);
  assert.equal(result.failureDetails, '');
  assert.equal(result.reportPayload.generatedAt, '2026-02-20T00:00:01.000Z');
});

test('runAndCheck returns FAIL summary and writes output report using injected file dependencies', () => {
  let mkdirArgs = null;
  let writeArgs = null;

  const result = runAndCheck(
    {
      iterations: null,
      profile: 'ci-mobile-baseline',
      outputPath: 'artifacts/perf/result.json',
      thresholdPath: null,
      allowMissing: false,
    },
    {
      runPerfProbe() {
        return {
          reportVersion: 1,
          generatedAt: '2026-02-20T00:00:00.000Z',
          iterations: 200,
          profile: 'ci-mobile-baseline',
          thresholdVersion: '1.0.0',
          operations: [],
        };
      },
      loadThresholds() {
        return {
          version: '1.0.0',
          profile: 'ci-mobile-baseline',
          operations: {},
        };
      },
      evaluateThresholds() {
        return {
          ok: false,
          checkedOperations: 3,
          profile: 'ci-mobile-baseline',
          thresholdVersion: '1.0.0',
          failures: [
            {
              type: 'threshold_exceeded',
              operation: 'tickSimulation',
              metric: 'p95Ms',
              actualMs: 31,
              thresholdMs: 30,
              profile: 'ci-mobile-baseline',
            },
          ],
        };
      },
      formatFailures() {
        return (
          'Threshold exceeded: operation=tickSimulation metric=p95Ms ' +
          'actual=31ms threshold=30ms profile=ci-mobile-baseline'
        );
      },
      mkdirSync(directoryPath, options) {
        mkdirArgs = { directoryPath, options };
      },
      writeFileSync(filePath, content) {
        writeArgs = { filePath, content };
      },
      resolvePath(cwd, outputPath) {
        return `${cwd}/${outputPath}`;
      },
      dirname(resolvedPath) {
        return resolvedPath.split('/').slice(0, -1).join('/');
      },
      cwd() {
        return 'C:/repo';
      },
      now() {
        return '2026-02-20T00:00:02.000Z';
      },
    }
  );

  assert.equal(result.ok, false);
  assert.match(result.summaryLine, /\[perf-run-and-check\] FAIL/);
  assert.match(result.failureDetails, /operation=tickSimulation/);
  assert.equal(result.savedPath, 'C:/repo/artifacts/perf/result.json');
  assert.deepEqual(mkdirArgs, {
    directoryPath: 'C:/repo/artifacts/perf',
    options: { recursive: true },
  });
  assert.equal(writeArgs.filePath, 'C:/repo/artifacts/perf/result.json');

  const writtenPayload = JSON.parse(writeArgs.content);
  assert.equal(writtenPayload.ok, false);
  assert.equal(writtenPayload.checkedOperations, 3);
  assert.equal(writtenPayload.thresholdVersion, '1.0.0');
  assert.equal(writtenPayload.failures.length, 1);
  assert.equal(writtenPayload.generatedAt, '2026-02-20T00:00:02.000Z');
});
