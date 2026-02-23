'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  parseArgs,
  normalizeTrendThresholds,
  scaffoldMissingChapterThresholds,
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

test('evaluateTrendDiff allows missing baseline tuning report when chapter threshold allows it', () => {
  const thresholds = normalizeTrendThresholds({
    version: 'test',
    perf: {
      operations: {
        tickSimulation: {
          avgMsIncreaseMax: 0.3,
          p95MsIncreaseMax: 0.4,
          maxMsIncreaseMax: 1,
        },
        runWaveSlice: {
          avgMsIncreaseMax: 0.3,
          p95MsIncreaseMax: 0.4,
          maxMsIncreaseMax: 1,
        },
        runSessionShort: {
          avgMsIncreaseMax: 0.3,
          p95MsIncreaseMax: 0.4,
          maxMsIncreaseMax: 1,
        },
      },
    },
    tuning: {
      chapters: {
        chapter_3: {
          scoreIncreaseMax: 0.3,
          allowStatusDegrade: false,
          allowMissingBaseline: true,
          allowMissingCurrent: false,
        },
      },
    },
  });

  const currentReports = {
    perf: createPerfReport({
      operations: [
        {
          operation: 'tickSimulation',
          stats: { avgMs: 0.5, p95Ms: 0.8, maxMs: 1.6 },
        },
        {
          operation: 'runWaveSlice',
          stats: { avgMs: 0.7, p95Ms: 1.1, maxMs: 2.1 },
        },
        {
          operation: 'runSessionShort',
          stats: { avgMs: 1.5, p95Ms: 2.2, maxMs: 3.3 },
        },
      ],
    }),
    tuning: {
      chapter_1: createTuningReport('PASS', 0.25),
      chapter_2: createTuningReport('PASS', 0.45),
      chapter_3: createTuningReport('PASS', 0.5),
    },
  };
  const baselineReports = {
    perf: createPerfReport({
      operations: [
        {
          operation: 'tickSimulation',
          stats: { avgMs: 0.4, p95Ms: 0.6, maxMs: 1.2 },
        },
        {
          operation: 'runWaveSlice',
          stats: { avgMs: 0.6, p95Ms: 0.9, maxMs: 1.8 },
        },
        {
          operation: 'runSessionShort',
          stats: { avgMs: 1.4, p95Ms: 2.0, maxMs: 3.0 },
        },
      ],
    }),
    tuning: {
      chapter_1: createTuningReport('PASS', 0.25),
      chapter_2: createTuningReport('PASS', 0.45),
    },
  };

  const result = evaluateTrendDiff(currentReports, baselineReports, thresholds);

  assert.equal(result.ok, true);
  assert.equal(result.regressions.length, 0);
  assert.equal(result.deltas.tuning.chapter_3.missing.allowed, true);
  assert.equal(result.deltas.tuning.chapter_3.missing.baselineExists, false);
  assert.equal(result.deltas.tuning.chapter_3.missing.currentExists, true);
});

test('scaffoldMissingChapterThresholds creates chapter_3 threshold from default template', () => {
  const normalized = normalizeTrendThresholds({
    version: 'test',
    tuning: {
      defaultChapterThreshold: {
        scoreIncreaseMax: 0.4,
        allowStatusDegrade: false,
        allowMissingBaseline: false,
        allowMissingCurrent: false,
      },
      autoScaffold: {
        enabled: true,
        allowMissingBaseline: true,
        allowMissingCurrent: false,
      },
      chapters: {
        chapter_1: {
          scoreIncreaseMax: 0.2,
          allowStatusDegrade: false,
          allowMissingBaseline: false,
          allowMissingCurrent: false,
        },
      },
    },
  });

  const result = scaffoldMissingChapterThresholds(normalized, ['chapter_1', 'chapter_3']);
  const chapter3 = result.thresholds.tuning.chapters.chapter_3;

  assert.deepEqual(result.scaffoldedChapterIds, ['chapter_3']);
  assert.equal(chapter3.scoreIncreaseMax, 0.4);
  assert.equal(chapter3.allowMissingBaseline, true);
  assert.equal(chapter3.allowMissingCurrent, false);
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

test('runTrendDiff auto-scaffolds chapter_3 threshold from discovered artifacts', () => {
  const thresholdsPath = 'C:/repo/tools/release-readiness/trend-thresholds.json';
  const currentDir = 'C:/repo/.tmp/release-readiness';
  const baselineDir = 'C:/repo/.tmp/release-readiness/baseline';
  const files = {
    [thresholdsPath]: JSON.stringify({
      version: 'test',
      perf: {
        operations: {
          tickSimulation: {
            avgMsIncreaseMax: 0.3,
            p95MsIncreaseMax: 0.4,
            maxMsIncreaseMax: 1.0,
          },
          runWaveSlice: {
            avgMsIncreaseMax: 0.3,
            p95MsIncreaseMax: 0.4,
            maxMsIncreaseMax: 1.0,
          },
          runSessionShort: {
            avgMsIncreaseMax: 0.3,
            p95MsIncreaseMax: 0.4,
            maxMsIncreaseMax: 1.0,
          },
        },
      },
      tuning: {
        defaultChapterThreshold: {
          scoreIncreaseMax: 0.35,
          allowStatusDegrade: false,
          allowMissingBaseline: false,
          allowMissingCurrent: false,
        },
        autoScaffold: {
          enabled: true,
          allowMissingBaseline: true,
          allowMissingCurrent: false,
        },
        chapters: {
          chapter_1: {
            scoreIncreaseMax: 0.2,
            allowStatusDegrade: false,
            allowMissingBaseline: false,
            allowMissingCurrent: false,
          },
        },
      },
    }),
    [`${currentDir}/perf-gate-report.json`]: JSON.stringify({
      probeReport: {
        operations: [
          {
            operation: 'tickSimulation',
            stats: { avgMs: 0.5, p95Ms: 0.8, maxMs: 1.6 },
          },
          {
            operation: 'runWaveSlice',
            stats: { avgMs: 0.7, p95Ms: 1.1, maxMs: 2.1 },
          },
          {
            operation: 'runSessionShort',
            stats: { avgMs: 1.5, p95Ms: 2.2, maxMs: 3.3 },
          },
        ],
      },
    }),
    [`${baselineDir}/perf-gate-report.json`]: JSON.stringify({
      probeReport: {
        operations: [
          {
            operation: 'tickSimulation',
            stats: { avgMs: 0.4, p95Ms: 0.6, maxMs: 1.2 },
          },
          {
            operation: 'runWaveSlice',
            stats: { avgMs: 0.6, p95Ms: 0.9, maxMs: 1.8 },
          },
          {
            operation: 'runSessionShort',
            stats: { avgMs: 1.4, p95Ms: 2.0, maxMs: 3.0 },
          },
        ],
      },
    }),
    [`${currentDir}/tuning-gate-report.chapter_1.json`]: JSON.stringify(createTuningReport('PASS', 0.4)),
    [`${baselineDir}/tuning-gate-report.chapter_1.json`]: JSON.stringify(createTuningReport('PASS', 0.3)),
    [`${currentDir}/tuning-gate-report.chapter_2.json`]: JSON.stringify(createTuningReport('PASS', 0.55)),
    [`${baselineDir}/tuning-gate-report.chapter_2.json`]: JSON.stringify(createTuningReport('PASS', 0.45)),
    [`${currentDir}/tuning-gate-report.chapter_3.json`]: JSON.stringify(createTuningReport('PASS', 0.6)),
  };

  const result = runTrendDiff(
    {
      currentDir: '.tmp/release-readiness',
      baselineDir: '.tmp/release-readiness/baseline',
      thresholdsPath,
      outputPath: null,
      allowMissingBaseline: false,
    },
    {
      cwd() {
        return 'C:/repo';
      },
      resolvePath(cwd, targetPath) {
        if (/^[A-Za-z]:[\\/]/.test(targetPath)) {
          return targetPath.replaceAll('\\', '/');
        }
        return `${cwd}/${String(targetPath).replaceAll('\\', '/')}`;
      },
      readFileSync(filePath) {
        const normalizedPath = String(filePath).replaceAll('\\', '/');
        if (!(normalizedPath in files)) {
          throw new Error(`Unexpected read: ${normalizedPath}`);
        }
        return files[normalizedPath];
      },
      existsSync(filePath) {
        const normalizedPath = String(filePath).replaceAll('\\', '/');
        if (normalizedPath === currentDir || normalizedPath === baselineDir) {
          return true;
        }
        return normalizedPath in files;
      },
      readdirSync(dirPath) {
        const normalizedPath = String(dirPath).replaceAll('\\', '/');
        if (normalizedPath === currentDir) {
          return [
            'perf-gate-report.json',
            'tuning-gate-report.chapter_1.json',
            'tuning-gate-report.chapter_2.json',
            'tuning-gate-report.chapter_3.json',
          ];
        }
        if (normalizedPath === baselineDir) {
          return [
            'perf-gate-report.json',
            'tuning-gate-report.chapter_1.json',
            'tuning-gate-report.chapter_2.json',
          ];
        }
        throw new Error(`Unexpected directory read: ${normalizedPath}`);
      },
      now() {
        return '2026-02-23T00:00:00.000Z';
      },
    }
  );

  assert.equal(result.ok, true);
  assert.equal(result.skipped, false);
  assert.deepEqual(result.scaffoldedChapterIds, ['chapter_3']);
  assert.ok(result.effectiveChapterIds.includes('chapter_3'));
  assert.equal(result.deltas.tuning.chapter_3.missing.allowed, true);
  assert.equal(result.regressions.length, 0);
});
