'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  DEFAULT_REPORT_PATH,
  DEFAULT_THRESHOLDS_PATH,
  parseArgs,
  syncTrendThresholds,
} = require('../../tools/release-readiness/sync-trend-thresholds');

test('parseArgs supports sync options', () => {
  const args = parseArgs([
    '--report=.tmp/release-readiness/custom-report.json',
    '--thresholds=tools/release-readiness/custom-thresholds.json',
    '--output=artifacts/synced-thresholds.json',
    '--write',
    '--all-chapters',
    '--lock-baseline',
  ]);

  assert.deepEqual(args, {
    help: false,
    reportPath: '.tmp/release-readiness/custom-report.json',
    thresholdsPath: 'tools/release-readiness/custom-thresholds.json',
    outputPath: 'artifacts/synced-thresholds.json',
    write: true,
    allChapters: true,
    lockBaseline: true,
  });
});

test('syncTrendThresholds syncs scaffolded chapter profiles and supports write/output targets', () => {
  const reportPath = 'C:/repo/.tmp/release-readiness/trend-diff-report.json';
  const thresholdsPath = 'C:/repo/tools/release-readiness/trend-thresholds.json';
  const outputPath = 'C:/repo/artifacts/trend-thresholds.synced.json';

  const reportPayload = {
    effectiveThresholds: {
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
            allowMissingBaseline: true,
            allowMissingCurrent: false,
          },
        },
      },
    },
    scaffoldedChapterIds: ['chapter_3'],
  };

  const currentThresholds = {
    version: '1.0.0',
    perf: reportPayload.effectiveThresholds.perf,
    tuning: {
      defaultChapterThreshold: reportPayload.effectiveThresholds.tuning.defaultChapterThreshold,
      autoScaffold: reportPayload.effectiveThresholds.tuning.autoScaffold,
      chapters: {
        chapter_1: reportPayload.effectiveThresholds.tuning.chapters.chapter_1,
        chapter_2: reportPayload.effectiveThresholds.tuning.chapters.chapter_2,
      },
    },
  };

  const fileMap = {
    [reportPath]: JSON.stringify(reportPayload),
    [thresholdsPath]: JSON.stringify(currentThresholds),
  };
  const writes = {};

  const result = syncTrendThresholds(
    {
      reportPath,
      thresholdsPath,
      outputPath,
      write: true,
      allChapters: false,
      lockBaseline: true,
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
        const value = String(filePath).replaceAll('\\', '/');
        return value.split('/').slice(0, -1).join('/');
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

  assert.deepEqual(result.chapterIdsToSync, ['chapter_3']);
  assert.deepEqual(result.addedChapterIds, ['chapter_3']);
  assert.deepEqual(result.updatedChapterIds, []);
  assert.equal(result.syncedChapterCount, 1);
  assert.equal(result.writtenThresholdsPath, thresholdsPath);
  assert.equal(result.writtenOutputPath, outputPath);

  assert.ok(Object.prototype.hasOwnProperty.call(writes, thresholdsPath));
  assert.ok(Object.prototype.hasOwnProperty.call(writes, outputPath));
  assert.equal(
    writes[thresholdsPath].tuning.chapters.chapter_3.allowMissingBaseline,
    false
  );
});

test('syncTrendThresholds supports no-op when scaffolded chapter list is empty', () => {
  const reportPath = 'C:/repo/.tmp/release-readiness/trend-diff-report.json';
  const thresholdsPath = 'C:/repo/tools/release-readiness/trend-thresholds.json';
  const reportPayload = {
    effectiveThresholds: {
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
        },
      },
    },
    scaffoldedChapterIds: [],
  };

  const thresholdsPayload = {
    version: '1.0.0',
    perf: reportPayload.effectiveThresholds.perf,
    tuning: reportPayload.effectiveThresholds.tuning,
  };

  const fileMap = {
    [reportPath]: JSON.stringify(reportPayload),
    [thresholdsPath]: JSON.stringify(thresholdsPayload),
  };

  const result = syncTrendThresholds(
    {
      reportPath: DEFAULT_REPORT_PATH,
      thresholdsPath: DEFAULT_THRESHOLDS_PATH,
      outputPath: null,
      write: false,
      allChapters: false,
      lockBaseline: false,
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
        return `${cwd}/${String(targetPath).replaceAll('\\', '/')}`;
      },
      readFileSync(filePath) {
        const normalized = String(filePath).replaceAll('\\', '/');
        if (!Object.prototype.hasOwnProperty.call(fileMap, normalized)) {
          throw new Error(`Unexpected read: ${normalized}`);
        }
        return fileMap[normalized];
      },
      now() {
        return '2026-02-23T00:00:00.000Z';
      },
    }
  );

  assert.deepEqual(result.chapterIdsToSync, []);
  assert.equal(result.syncedChapterCount, 0);
  assert.equal(result.writtenThresholdsPath, null);
  assert.equal(result.writtenOutputPath, null);
});
