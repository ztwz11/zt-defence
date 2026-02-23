'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  DEFAULT_OUTPUT_JSON_PATH,
  DEFAULT_OUTPUT_PATH,
  DEFAULT_REBALANCE_REPORT_PATH,
  DEFAULT_SYNC_SUMMARY_PATH,
  DEFAULT_TREND_REPORT_PATH,
  buildThresholdProposal,
  parseArgs,
} = require('../../tools/release-readiness/build-threshold-proposal-comment');

test('parseArgs supports proposal paths', () => {
  const parsed = parseArgs([
    '--trend-report=.tmp/release-readiness/trend-diff-report.custom.json',
    '--sync-summary=.tmp/release-readiness/sync-summary.custom.json',
    '--rebalance-report=.tmp/release-readiness/rebalance.custom.json',
    '--output=.tmp/release-readiness/proposal.custom.md',
    '--output-json=.tmp/release-readiness/proposal.custom.json',
  ]);

  assert.deepEqual(parsed, {
    help: false,
    trendReportPath: '.tmp/release-readiness/trend-diff-report.custom.json',
    syncSummaryPath: '.tmp/release-readiness/sync-summary.custom.json',
    rebalanceReportPath: '.tmp/release-readiness/rebalance.custom.json',
    outputPath: '.tmp/release-readiness/proposal.custom.md',
    outputJsonPath: '.tmp/release-readiness/proposal.custom.json',
  });
});

test('buildThresholdProposal writes markdown and json summary from report inputs', () => {
  const trendReportPath = 'C:/repo/.tmp/release-readiness/trend-diff-report.json';
  const syncSummaryPath = 'C:/repo/.tmp/release-readiness/trend-threshold-sync-summary.json';
  const rebalanceReportPath = 'C:/repo/.tmp/release-readiness/trend-threshold-recommendation.json';
  const outputPath = 'C:/repo/.tmp/release-readiness/trend-threshold-proposal-comment.md';
  const outputJsonPath = 'C:/repo/.tmp/release-readiness/trend-threshold-proposal.json';
  const fileMap = {
    [trendReportPath]: JSON.stringify({
      generatedAt: '2026-02-23T00:00:00.000Z',
      ok: true,
      skipped: false,
      thresholdsVersion: '1.0.0',
      regressions: [],
    }),
    [syncSummaryPath]: JSON.stringify({
      syncedChapterCount: 3,
      addedChapterIds: ['chapter_3'],
      updatedChapterIds: ['chapter_1'],
      unchangedChapterIds: ['chapter_2'],
      chapterIdsToSync: ['chapter_1', 'chapter_2', 'chapter_3'],
    }),
    [rebalanceReportPath]: JSON.stringify({
      generatedAt: '2026-02-23T00:00:02.000Z',
      summary: {
        changedCount: 1,
        tightenedCount: 0,
        relaxedCount: 1,
        manualReviewCount: 1,
      },
      changedChapterIds: ['chapter_2'],
      manualReviewChapterIds: ['chapter_3'],
      chapters: {
        chapter_2: {
          action: 'relax',
          currentScoreIncreaseMax: 0.25,
          proposedScoreIncreaseMax: 0.34,
          observedScoreDelta: 0.31,
          reason: 'score_regression_detected',
        },
        chapter_3: {
          action: 'manual_review',
          currentScoreIncreaseMax: 0.3,
          proposedScoreIncreaseMax: 0.3,
          observedScoreDelta: 0.2,
          reason: 'status_degraded',
        },
      },
    }),
  };
  const writes = {};

  const result = buildThresholdProposal(
    {
      trendReportPath: DEFAULT_TREND_REPORT_PATH,
      syncSummaryPath: DEFAULT_SYNC_SUMMARY_PATH,
      rebalanceReportPath: DEFAULT_REBALANCE_REPORT_PATH,
      outputPath: DEFAULT_OUTPUT_PATH,
      outputJsonPath: DEFAULT_OUTPUT_JSON_PATH,
    },
    {
      cwd() {
        return 'C:/repo';
      },
      resolvePath(cwd, targetPath) {
        if (targetPath === DEFAULT_TREND_REPORT_PATH) {
          return trendReportPath;
        }
        if (targetPath === DEFAULT_SYNC_SUMMARY_PATH) {
          return syncSummaryPath;
        }
        if (targetPath === DEFAULT_REBALANCE_REPORT_PATH) {
          return rebalanceReportPath;
        }
        if (targetPath === DEFAULT_OUTPUT_PATH) {
          return outputPath;
        }
        if (targetPath === DEFAULT_OUTPUT_JSON_PATH) {
          return outputJsonPath;
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
        writes[String(filePath).replaceAll('\\', '/')] = String(value);
      },
    }
  );

  assert.equal(result.outputPath, outputPath);
  assert.equal(result.outputJsonPath, outputJsonPath);
  assert.equal(result.summary.rebalance.changedCount, 1);
  assert.equal(result.summary.rebalance.manualReviewCount, 1);
  assert.equal(result.summary.hasProposal, true);
  assert.match(writes[outputPath], /Release Readiness Threshold Proposal/);
  assert.match(writes[outputPath], /\| chapter_2 \| relax \|/);
  assert.match(writes[outputPath], /\| chapter_3 \| manual_review \|/);

  const outputJson = JSON.parse(writes[outputJsonPath]);
  assert.equal(outputJson.trend.regressions, 0);
  assert.equal(outputJson.rebalance.changedCount, 1);
});
