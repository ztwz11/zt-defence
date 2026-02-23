'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  DEFAULT_OUTPUT_PATH,
  DEFAULT_REPORT_PATH,
  DEFAULT_THRESHOLDS_PATH,
  parseArgs,
  rebalanceTrendThresholds,
} = require('../../tools/release-readiness/rebalance-trend-thresholds');

function createThresholdsPayload() {
  return {
    version: '1.0.0',
    perf: {
      operations: {
        tickSimulation: {
          avgMsIncreaseMax: 0.2,
          p95MsIncreaseMax: 0.6,
          maxMsIncreaseMax: 2.5,
        },
        runWaveSlice: {
          avgMsIncreaseMax: 0.25,
          p95MsIncreaseMax: 0.7,
          maxMsIncreaseMax: 2.5,
        },
        runSessionShort: {
          avgMsIncreaseMax: 0.3,
          p95MsIncreaseMax: 0.8,
          maxMsIncreaseMax: 2.5,
        },
      },
    },
    tuning: {
      defaultChapterThreshold: {
        scoreIncreaseMax: 0.3,
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
        chapter_2: {
          scoreIncreaseMax: 0.25,
          allowStatusDegrade: false,
          allowMissingBaseline: false,
          allowMissingCurrent: false,
        },
        chapter_3: {
          scoreIncreaseMax: 0.3,
          allowStatusDegrade: false,
          allowMissingBaseline: false,
          allowMissingCurrent: false,
        },
      },
    },
  };
}

function createReportPayload(overrides) {
  const source = overrides && typeof overrides === 'object' ? overrides : {};
  return {
    regressions: Array.isArray(source.regressions) ? source.regressions : [],
    deltas: {
      tuning: source.tuningDeltas || {},
    },
  };
}

test('parseArgs supports rebalance policy options', () => {
  const args = parseArgs([
    '--report=.tmp/release-readiness/custom-trend.json',
    '--thresholds=tools/release-readiness/custom-thresholds.json',
    '--output=.tmp/release-readiness/recommendation.json',
    '--min-score-increase-max=0.1',
    '--max-score-increase-max=1.4',
    '--tighten-margin=0.02',
    '--tighten-rate=0.6',
    '--relax-margin=0.05',
    '--write',
  ]);

  assert.deepEqual(args, {
    help: false,
    reportPath: '.tmp/release-readiness/custom-trend.json',
    thresholdsPath: 'tools/release-readiness/custom-thresholds.json',
    outputPath: '.tmp/release-readiness/recommendation.json',
    write: true,
    policy: {
      minScoreIncreaseMax: 0.1,
      maxScoreIncreaseMax: 1.4,
      tightenMargin: 0.02,
      tightenRate: 0.6,
      relaxMargin: 0.05,
      epsilon: 0.000001,
    },
  });
});

test('rebalanceTrendThresholds relaxes chapter threshold when score regression is detected', () => {
  const reportPath = 'C:/repo/.tmp/release-readiness/trend-diff-report.json';
  const thresholdsPath = 'C:/repo/tools/release-readiness/trend-thresholds.json';
  const outputPath = 'C:/repo/.tmp/release-readiness/trend-threshold-recommendation.json';
  const writes = {};

  const reportPayload = createReportPayload({
    regressions: [{ type: 'tuning_score_regression', chapterId: 'chapter_2' }],
    tuningDeltas: {
      chapter_1: { score: { delta: 0.01 } },
      chapter_2: { score: { delta: 0.31 } },
      chapter_3: { score: { delta: 0.0 } },
    },
  });
  const fileMap = {
    [reportPath]: JSON.stringify(reportPayload),
    [thresholdsPath]: JSON.stringify(createThresholdsPayload()),
  };

  const result = rebalanceTrendThresholds(
    {
      reportPath,
      thresholdsPath,
      outputPath,
      write: true,
      policy: {
        minScoreIncreaseMax: 0.05,
        maxScoreIncreaseMax: 2,
        tightenMargin: 0.03,
        tightenRate: 0.4,
        relaxMargin: 0.03,
      },
    },
    {
      cwd() {
        return 'C:/repo';
      },
      resolvePath(cwd, targetPath) {
        if (/^[A-Za-z]:[\\/]/.test(targetPath)) {
          return String(targetPath).replaceAll('\\', '/');
        }
        return `${cwd}/${String(targetPath).replaceAll('\\', '/')}`;
      },
      dirname(filePath) {
        return String(filePath).replaceAll('\\', '/').split('/').slice(0, -1).join('/');
      },
      mkdirSync() {},
      readFileSync(filePath) {
        const normalized = String(filePath).replaceAll('\\', '/');
        if (!Object.prototype.hasOwnProperty.call(fileMap, normalized)) {
          throw new Error(`Unexpected read: ${normalized}`);
        }
        return fileMap[normalized];
      },
      writeFileSync(filePath, value) {
        writes[String(filePath).replaceAll('\\', '/')] = JSON.parse(value);
      },
      now() {
        return '2026-02-23T00:00:00.000Z';
      },
    }
  );

  assert.equal(result.summary.changedCount, 2);
  assert.ok(result.relaxedChapterIds.includes('chapter_2'));
  assert.equal(result.chapters.chapter_2.action, 'relax');
  assert.equal(result.chapters.chapter_2.proposedScoreIncreaseMax, 0.34);
  assert.equal(result.chapters.chapter_3.action, 'keep');
  assert.equal(result.chapters.chapter_3.proposedScoreIncreaseMax, 0.3);
  assert.equal(result.writtenThresholdsPath, thresholdsPath);
  assert.equal(result.writtenOutputPath, outputPath);
  assert.equal(writes[thresholdsPath].tuning.chapters.chapter_2.scoreIncreaseMax, 0.34);
});

test('rebalanceTrendThresholds marks manual review for status degradation and keeps threshold', () => {
  const reportPath = 'C:/repo/.tmp/release-readiness/trend-diff-report.json';
  const thresholdsPath = 'C:/repo/tools/release-readiness/trend-thresholds.json';
  const outputPath = 'C:/repo/.tmp/release-readiness/trend-threshold-recommendation.json';
  const reportPayload = createReportPayload({
    regressions: [{ type: 'tuning_status_regression', chapterId: 'chapter_3' }],
    tuningDeltas: {
      chapter_1: { score: { delta: 0 } },
      chapter_2: { score: { delta: 0.05 } },
      chapter_3: {
        status: { degraded: true },
        score: { delta: 0.2 },
      },
    },
  });
  const fileMap = {
    [reportPath]: JSON.stringify(reportPayload),
    [thresholdsPath]: JSON.stringify(createThresholdsPayload()),
  };
  const writes = {};

  const result = rebalanceTrendThresholds(
    {
      reportPath: DEFAULT_REPORT_PATH,
      thresholdsPath: DEFAULT_THRESHOLDS_PATH,
      outputPath: DEFAULT_OUTPUT_PATH,
      write: false,
      policy: {
        minScoreIncreaseMax: 0.05,
        maxScoreIncreaseMax: 2,
        tightenMargin: 0.03,
        tightenRate: 0.4,
        relaxMargin: 0.03,
      },
    },
    {
      cwd() {
        return 'C:/repo';
      },
      resolvePath(cwd, targetPath) {
        if (targetPath === DEFAULT_REPORT_PATH) {
          return reportPath;
        }
        if (targetPath === DEFAULT_THRESHOLDS_PATH) {
          return thresholdsPath;
        }
        if (targetPath === DEFAULT_OUTPUT_PATH) {
          return outputPath;
        }
        return `${cwd}/${String(targetPath).replaceAll('\\', '/')}`;
      },
      readFileSync(filePath) {
        const normalized = String(filePath).replaceAll('\\', '/');
        if (!Object.prototype.hasOwnProperty.call(fileMap, normalized)) {
          throw new Error(`Unexpected read: ${normalized}`);
        }
        return fileMap[normalized];
      },
      writeFileSync(filePath, value) {
        writes[String(filePath).replaceAll('\\', '/')] = JSON.parse(value);
      },
      mkdirSync() {},
      now() {
        return '2026-02-23T00:00:00.000Z';
      },
    }
  );

  assert.equal(result.summary.manualReviewCount, 1);
  assert.ok(result.manualReviewChapterIds.includes('chapter_3'));
  assert.equal(result.chapters.chapter_3.action, 'manual_review');
  assert.equal(result.chapters.chapter_3.proposedScoreIncreaseMax, 0.3);
  assert.equal(result.writtenThresholdsPath, null);
  assert.equal(result.writtenOutputPath, outputPath);
  assert.ok(Object.prototype.hasOwnProperty.call(writes, outputPath));
});
