'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  parseArgs,
  normalizeTrendThresholds,
  evaluateTrendDiff,
  runTrendDiff,
} = require('../../tools/release-readiness/check-trend-diff');

function createPerfReport(overrides) {
  const source = overrides && typeof overrides === 'object' ? overrides : {};
  return {
    probeReport: {
      operations: source.operations || [],
    },
  };
}

function createTuningReport(status, score) {
  return {
    evaluation: {
      status,
      score,
    },
  };
}

test('parseArgs parses known options', () => {
  const parsed = parseArgs([
    '--current-dir=.tmp/release-readiness/current',
    '--baseline-dir=.tmp/release-readiness/baseline',
    '--thresholds=tools/release-readiness/custom-thresholds.json',
    '--output=.tmp/release-readiness/trend.json',
    '--allow-missing-baseline',
  ]);

  assert.deepEqual(parsed, {
    help: false,
    currentDir: '.tmp/release-readiness/current',
    baselineDir: '.tmp/release-readiness/baseline',
    thresholdsPath: 'tools/release-readiness/custom-thresholds.json',
    outputPath: '.tmp/release-readiness/trend.json',
    allowMissingBaseline: true,
  });
});

test('evaluateTrendDiff reports perf regression above threshold', () => {
  const thresholds = normalizeTrendThresholds({
    version: 'test',
    perf: {
      operations: {
        tickSimulation: {
          avgMsIncreaseMax: 0.1,
          p95MsIncreaseMax: 0.2,
          maxMsIncreaseMax: 0.5,
        },
      },
    },
    tuning: {
      chapters: {},
    },
  });

  const currentReports = {
    perf: createPerfReport({
      operations: [
        {
          operation: 'tickSimulation',
          stats: {
            avgMs: 0.5,
            p95Ms: 0.7,
            maxMs: 2.2,
          },
        },
      ],
    }),
    tuning: {},
  };
  const baselineReports = {
    perf: createPerfReport({
      operations: [
        {
          operation: 'tickSimulation',
          stats: {
            avgMs: 0.2,
            p95Ms: 0.3,
            maxMs: 1.4,
          },
        },
      ],
    }),
    tuning: {},
  };

  const result = evaluateTrendDiff(currentReports, baselineReports, thresholds);

  assert.equal(result.ok, false);
  assert.ok(result.regressions.length >= 3);
  assert.ok(
    result.regressions.some(
      (regression) =>
        regression.type === 'perf_regression' &&
        regression.operation === 'tickSimulation' &&
        regression.metric === 'avgMs'
    )
  );
});

test('evaluateTrendDiff reports tuning status and score regression', () => {
  const thresholds = normalizeTrendThresholds({
    version: 'test',
    perf: {
      operations: {},
    },
    tuning: {
      chapters: {
        chapter_1: {
          scoreIncreaseMax: 0.1,
          allowStatusDegrade: false,
        },
      },
    },
  });

  const currentReports = {
    perf: createPerfReport(),
    tuning: {
      chapter_1: createTuningReport('FAIL', 0.8),
    },
  };
  const baselineReports = {
    perf: createPerfReport(),
    tuning: {
      chapter_1: createTuningReport('PASS', 0.2),
    },
  };

  const result = evaluateTrendDiff(currentReports, baselineReports, thresholds);

  assert.equal(result.ok, false);
  assert.ok(
    result.regressions.some(
      (regression) =>
        regression.type === 'tuning_status_regression' && regression.chapterId === 'chapter_1'
    )
  );
  assert.ok(
    result.regressions.some(
      (regression) =>
        regression.type === 'tuning_score_regression' && regression.chapterId === 'chapter_1'
    )
  );
});

test('runTrendDiff skips when baseline is missing and allowMissingBaseline is true', () => {
  let readCount = 0;
  const thresholdsPath = 'C:/repo/tools/release-readiness/trend-thresholds.json';
  const result = runTrendDiff(
    {
      currentDir: '.tmp/release-readiness',
      baselineDir: '.tmp/release-readiness/baseline',
      thresholdsPath,
      outputPath: null,
      allowMissingBaseline: true,
    },
    {
      cwd() {
        return 'C:/repo';
      },
      resolvePath(cwd, targetPath) {
        if (/^[A-Za-z]:[\\/]/.test(targetPath)) {
          return targetPath;
        }
        return `${cwd}/${String(targetPath).replaceAll('\\', '/')}`;
      },
      readFileSync(filePath) {
        readCount += 1;
        if (filePath === thresholdsPath) {
          return JSON.stringify({
            version: 'test',
            perf: {
              operations: {
                tickSimulation: {
                  avgMsIncreaseMax: 0.2,
                  p95MsIncreaseMax: 0.5,
                  maxMsIncreaseMax: 1.5,
                },
              },
            },
            tuning: {
              chapters: {
                chapter_1: {
                  scoreIncreaseMax: 0.2,
                  allowStatusDegrade: false,
                },
              },
            },
          });
        }
        throw new Error(`Unexpected read: ${filePath}`);
      },
      existsSync(filePath) {
        if (filePath.includes('baseline')) {
          return false;
        }
        return true;
      },
      now() {
        return '2026-02-23T00:00:00.000Z';
      },
    }
  );

  assert.equal(readCount, 1);
  assert.equal(result.ok, true);
  assert.equal(result.skipped, true);
  assert.equal(result.reason, 'baseline_missing');
  assert.match(result.summaryLine, /\[trend-diff\] PASS/);
});
