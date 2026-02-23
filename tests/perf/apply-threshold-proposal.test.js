'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  DEFAULT_OUTPUT_PATH,
  DEFAULT_PROPOSAL_PATH,
  DEFAULT_SUMMARY_OUTPUT_PATH,
  DEFAULT_THRESHOLDS_PATH,
  applyThresholdProposal,
  parseArgs,
} = require('../../tools/release-readiness/apply-threshold-proposal');

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

test('parseArgs parses apply proposal options', () => {
  const args = parseArgs([
    '--proposal=.tmp/release-readiness/custom-proposal.json',
    '--thresholds=tools/release-readiness/custom-thresholds.json',
    '--output=.tmp/release-readiness/custom-applied.json',
    '--summary-output=.tmp/release-readiness/custom-summary.json',
    '--chapters=chapter_1,chapter_2',
    '--allow-manual-review',
    '--write',
  ]);

  assert.deepEqual(args, {
    help: false,
    proposalPath: '.tmp/release-readiness/custom-proposal.json',
    thresholdsPath: 'tools/release-readiness/custom-thresholds.json',
    outputPath: '.tmp/release-readiness/custom-applied.json',
    summaryOutputPath: '.tmp/release-readiness/custom-summary.json',
    write: true,
    allowManualReview: true,
    chapterIds: ['chapter_1', 'chapter_2'],
  });
});

test('applyThresholdProposal applies relaxed/tightened rows and writes outputs', () => {
  const proposalPath = 'C:/repo/.tmp/release-readiness/trend-threshold-proposal.json';
  const thresholdsPath = 'C:/repo/tools/release-readiness/trend-thresholds.json';
  const outputPath = 'C:/repo/.tmp/release-readiness/trend-thresholds.applied.preview.json';
  const summaryOutputPath = 'C:/repo/.tmp/release-readiness/trend-threshold-apply-summary.json';
  const proposal = {
    hasProposal: true,
    rebalance: {
      chapterRows: [
        {
          chapterId: 'chapter_1',
          action: 'tighten',
          currentScoreIncreaseMax: 0.2,
          proposedScoreIncreaseMax: 0.18,
        },
        {
          chapterId: 'chapter_2',
          action: 'relax',
          currentScoreIncreaseMax: 0.25,
          proposedScoreIncreaseMax: 0.34,
        },
      ],
    },
  };
  const fileMap = {
    [proposalPath]: JSON.stringify(proposal),
    [thresholdsPath]: JSON.stringify(createThresholds()),
  };
  const writes = {};

  const result = applyThresholdProposal(
    {
      proposalPath: DEFAULT_PROPOSAL_PATH,
      thresholdsPath: DEFAULT_THRESHOLDS_PATH,
      outputPath: DEFAULT_OUTPUT_PATH,
      summaryOutputPath: DEFAULT_SUMMARY_OUTPUT_PATH,
      write: true,
      allowManualReview: false,
      chapterIds: [],
    },
    {
      cwd() {
        return 'C:/repo';
      },
      resolvePath(cwd, targetPath) {
        if (targetPath === DEFAULT_PROPOSAL_PATH) {
          return proposalPath;
        }
        if (targetPath === DEFAULT_THRESHOLDS_PATH) {
          return thresholdsPath;
        }
        if (targetPath === DEFAULT_OUTPUT_PATH) {
          return outputPath;
        }
        if (targetPath === DEFAULT_SUMMARY_OUTPUT_PATH) {
          return summaryOutputPath;
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

  assert.equal(result.blocked, false);
  assert.deepEqual(result.appliedChapterIds, ['chapter_1', 'chapter_2']);
  assert.equal(result.writtenThresholdsPath, thresholdsPath);
  assert.equal(writes[thresholdsPath].tuning.chapters.chapter_1.scoreIncreaseMax, 0.18);
  assert.equal(writes[thresholdsPath].tuning.chapters.chapter_2.scoreIncreaseMax, 0.34);
  assert.ok(Object.prototype.hasOwnProperty.call(writes, outputPath));
  assert.ok(Object.prototype.hasOwnProperty.call(writes, summaryOutputPath));
});

test('applyThresholdProposal blocks when manual review rows exist and override is off', () => {
  const proposalPath = 'C:/repo/.tmp/release-readiness/trend-threshold-proposal.json';
  const thresholdsPath = 'C:/repo/tools/release-readiness/trend-thresholds.json';
  const outputPath = 'C:/repo/.tmp/release-readiness/trend-thresholds.applied.preview.json';
  const summaryOutputPath = 'C:/repo/.tmp/release-readiness/trend-threshold-apply-summary.json';
  const proposal = {
    hasProposal: true,
    rebalance: {
      chapterRows: [
        {
          chapterId: 'chapter_3',
          action: 'manual_review',
          currentScoreIncreaseMax: 0.3,
          proposedScoreIncreaseMax: 0.3,
        },
      ],
    },
  };
  const fileMap = {
    [proposalPath]: JSON.stringify(proposal),
    [thresholdsPath]: JSON.stringify(createThresholds()),
  };
  const writes = {};

  const result = applyThresholdProposal(
    {
      proposalPath,
      thresholdsPath,
      outputPath,
      summaryOutputPath,
      write: true,
      allowManualReview: false,
      chapterIds: [],
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

  assert.equal(result.blocked, true);
  assert.deepEqual(result.manualReviewChapterIds, ['chapter_3']);
  assert.equal(result.writtenThresholdsPath, null);
  assert.ok(Object.prototype.hasOwnProperty.call(writes, outputPath));
  assert.ok(Object.prototype.hasOwnProperty.call(writes, summaryOutputPath));
  assert.equal(
    writes[outputPath].tuning.chapters.chapter_1.scoreIncreaseMax,
    0.2
  );
});
