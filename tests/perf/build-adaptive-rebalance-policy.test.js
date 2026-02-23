'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  DEFAULT_HISTORY_DIR,
  DEFAULT_OUTPUT_PATH,
  DEFAULT_THRESHOLDS_PATH,
  buildAdaptiveRebalancePolicy,
  parseArgs,
} = require('../../tools/release-readiness/build-adaptive-rebalance-policy');

function createThresholds() {
  return {
    version: '1.0.0',
    perf: {
      operations: {
        tickSimulation: {
          avgMsIncreaseMax: 0.2,
          p95MsIncreaseMax: 0.6,
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
      },
    },
  };
}

function createTrendReport(deltaChapter1, deltaChapter2, degradedChapter2) {
  return {
    ok: true,
    deltas: {
      tuning: {
        chapter_1: {
          status: { degraded: false },
          score: {
            delta: deltaChapter1,
          },
        },
        chapter_2: {
          status: { degraded: degradedChapter2 === true },
          score: {
            delta: deltaChapter2,
          },
        },
      },
    },
  };
}

test('parseArgs supports history and seed report options', () => {
  const parsed = parseArgs([
    '--history-dir=.tmp/release-readiness/history-pr',
    '--thresholds=tools/release-readiness/custom-thresholds.json',
    '--output=.tmp/release-readiness/adaptive-policy.custom.json',
    '--seed-report=.tmp/release-readiness/trend-diff-report.json',
    '--seed-report=.tmp/release-readiness/trend-diff-report.pr.json',
    '--min-samples=5',
  ]);

  assert.deepEqual(parsed, {
    help: false,
    historyDir: '.tmp/release-readiness/history-pr',
    thresholdsPath: 'tools/release-readiness/custom-thresholds.json',
    outputPath: '.tmp/release-readiness/adaptive-policy.custom.json',
    seedReportPaths: [
      '.tmp/release-readiness/trend-diff-report.json',
      '.tmp/release-readiness/trend-diff-report.pr.json',
    ],
    options: {
      minSamples: 5,
      minTightenMargin: 0.01,
      maxTightenMargin: 0.2,
      minRelaxMargin: 0.02,
      maxRelaxMargin: 0.5,
      minTightenRate: 0.15,
      maxTightenRate: 0.8,
    },
  });
});

test('buildAdaptiveRebalancePolicy derives chapter policies from historical trend reports', () => {
  const historyDir = 'C:/repo/.tmp/release-readiness/history';
  const thresholdsPath = 'C:/repo/tools/release-readiness/trend-thresholds.json';
  const outputPath = 'C:/repo/.tmp/release-readiness/adaptive-rebalance-policy.json';
  const seedReportPath = 'C:/repo/.tmp/release-readiness/trend-diff-report.current.json';
  const writes = {};
  const fileMap = {
    [thresholdsPath]: JSON.stringify(createThresholds()),
    [`${historyDir}/trend-diff-report.pr-001.json`]: JSON.stringify(createTrendReport(0.12, 0.28, false)),
    [`${historyDir}/trend-diff-report.pr-002.json`]: JSON.stringify(createTrendReport(0.08, 0.33, true)),
    [seedReportPath]: JSON.stringify(createTrendReport(0.1, 0.3, false)),
  };

  const result = buildAdaptiveRebalancePolicy(
    {
      historyDir: DEFAULT_HISTORY_DIR,
      thresholdsPath: DEFAULT_THRESHOLDS_PATH,
      outputPath: DEFAULT_OUTPUT_PATH,
      seedReportPaths: [seedReportPath],
      options: {
        minSamples: 2,
        minTightenMargin: 0.01,
        maxTightenMargin: 0.2,
        minRelaxMargin: 0.02,
        maxRelaxMargin: 0.5,
        minTightenRate: 0.15,
        maxTightenRate: 0.8,
      },
    },
    {
      cwd() {
        return 'C:/repo';
      },
      resolvePath(cwd, targetPath) {
        if (targetPath === DEFAULT_HISTORY_DIR) {
          return historyDir;
        }
        if (targetPath === DEFAULT_THRESHOLDS_PATH) {
          return thresholdsPath;
        }
        if (targetPath === DEFAULT_OUTPUT_PATH) {
          return outputPath;
        }
        if (/^[A-Za-z]:[\\/]/.test(targetPath)) {
          return String(targetPath).replaceAll('\\', '/');
        }
        return `${cwd}/${String(targetPath).replaceAll('\\', '/')}`;
      },
      joinPath(a, b) {
        return `${String(a).replaceAll('\\', '/')}/${String(b).replaceAll('\\', '/')}`;
      },
      existsSync(filePath) {
        const normalized = String(filePath).replaceAll('\\', '/');
        return normalized === historyDir || Object.prototype.hasOwnProperty.call(fileMap, normalized);
      },
      readdirSync(dirPath) {
        const normalized = String(dirPath).replaceAll('\\', '/');
        if (normalized !== historyDir) {
          throw new Error(`Unexpected directory read: ${normalized}`);
        }
        return ['trend-diff-report.pr-001.json', 'trend-diff-report.pr-002.json'];
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

  assert.equal(result.reportCount, 3);
  assert.deepEqual(result.activeChapterIds, ['chapter_1', 'chapter_2']);
  assert.equal(result.chapters.chapter_1.sampleCount, 3);
  assert.equal(result.chapters.chapter_2.sampleCount, 3);
  assert.ok(result.chapters.chapter_2.policy.relaxMargin > result.chapters.chapter_1.policy.relaxMargin);
  assert.ok(result.chapters.chapter_2.policy.tightenRate < result.chapters.chapter_1.policy.tightenRate);
  assert.ok(Object.prototype.hasOwnProperty.call(writes, outputPath));
});
