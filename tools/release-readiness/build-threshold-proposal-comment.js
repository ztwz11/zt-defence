#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const SUMMARY_PREFIX = '[trend-threshold-proposal]';
const DEFAULT_TREND_REPORT_PATH = '.tmp/release-readiness/trend-diff-report.json';
const DEFAULT_SYNC_SUMMARY_PATH = '.tmp/release-readiness/trend-threshold-sync-summary.json';
const DEFAULT_REBALANCE_REPORT_PATH = '.tmp/release-readiness/trend-threshold-recommendation.json';
const DEFAULT_OUTPUT_PATH = '.tmp/release-readiness/trend-threshold-proposal-comment.md';
const DEFAULT_OUTPUT_JSON_PATH = '.tmp/release-readiness/trend-threshold-proposal.json';

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function parseArgs(argv) {
  const args = Array.isArray(argv) ? argv : [];
  const parsed = {
    help: false,
    trendReportPath: DEFAULT_TREND_REPORT_PATH,
    syncSummaryPath: DEFAULT_SYNC_SUMMARY_PATH,
    rebalanceReportPath: DEFAULT_REBALANCE_REPORT_PATH,
    outputPath: DEFAULT_OUTPUT_PATH,
    outputJsonPath: DEFAULT_OUTPUT_JSON_PATH,
  };

  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];

    if (token === '--help' || token === '-h') {
      parsed.help = true;
      continue;
    }

    if (token.startsWith('--trend-report=')) {
      parsed.trendReportPath = token.slice('--trend-report='.length).trim();
      continue;
    }

    if (token === '--trend-report') {
      parsed.trendReportPath = String(args[index + 1] || '').trim();
      index += 1;
      continue;
    }

    if (token.startsWith('--sync-summary=')) {
      parsed.syncSummaryPath = token.slice('--sync-summary='.length).trim();
      continue;
    }

    if (token === '--sync-summary') {
      parsed.syncSummaryPath = String(args[index + 1] || '').trim();
      index += 1;
      continue;
    }

    if (token.startsWith('--rebalance-report=')) {
      parsed.rebalanceReportPath = token.slice('--rebalance-report='.length).trim();
      continue;
    }

    if (token === '--rebalance-report') {
      parsed.rebalanceReportPath = String(args[index + 1] || '').trim();
      index += 1;
      continue;
    }

    if (token.startsWith('--output=')) {
      parsed.outputPath = token.slice('--output='.length).trim();
      continue;
    }

    if (token === '--output') {
      parsed.outputPath = String(args[index + 1] || '').trim();
      index += 1;
      continue;
    }

    if (token.startsWith('--output-json=')) {
      parsed.outputJsonPath = token.slice('--output-json='.length).trim();
      continue;
    }

    if (token === '--output-json') {
      parsed.outputJsonPath = String(args[index + 1] || '').trim();
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${token}`);
  }

  const requiredFields = [
    ['--trend-report', parsed.trendReportPath],
    ['--sync-summary', parsed.syncSummaryPath],
    ['--rebalance-report', parsed.rebalanceReportPath],
    ['--output', parsed.outputPath],
    ['--output-json', parsed.outputJsonPath],
  ];

  for (const [name, value] of requiredFields) {
    if (typeof value !== 'string' || value.length === 0) {
      throw new Error(`Invalid ${name} value. Expected a non-empty path.`);
    }
  }

  return parsed;
}

function printHelp() {
  const lines = [
    'Usage: node tools/release-readiness/build-threshold-proposal-comment.js [options]',
    '',
    'Options:',
    `  --trend-report=<path>    Trend diff report path (default: ${DEFAULT_TREND_REPORT_PATH})`,
    `  --sync-summary=<path>    Sync summary JSON path (default: ${DEFAULT_SYNC_SUMMARY_PATH})`,
    `  --rebalance-report=<path> Rebalance report path (default: ${DEFAULT_REBALANCE_REPORT_PATH})`,
    `  --output=<path>          Proposal markdown path (default: ${DEFAULT_OUTPUT_PATH})`,
    `  --output-json=<path>     Proposal summary json path (default: ${DEFAULT_OUTPUT_JSON_PATH})`,
    '  --help                   Show this help message',
  ];

  process.stdout.write(`${lines.join('\n')}\n`);
}

function resolvePathFromCwd(candidatePath, dependencies) {
  const deps = isPlainObject(dependencies) ? dependencies : {};
  const resolvePath = typeof deps.resolvePath === 'function' ? deps.resolvePath : path.resolve;
  const cwd = typeof deps.cwd === 'function' ? deps.cwd() : process.cwd();
  return resolvePath(cwd, candidatePath);
}

function stripByteOrderMark(text) {
  if (typeof text !== 'string') {
    return '';
  }
  return text.replace(/^\uFEFF/, '');
}

function readJsonFile(filePath, description, dependencies) {
  const deps = isPlainObject(dependencies) ? dependencies : {};
  const readFileSync = typeof deps.readFileSync === 'function' ? deps.readFileSync : fs.readFileSync;

  let rawText;
  try {
    rawText = String(readFileSync(filePath, 'utf8'));
  } catch (error) {
    throw new Error(
      `TREND_THRESHOLD_PROPOSAL_FILE_READ_ERROR(${description}): ${filePath} :: ${
        error && error.message ? error.message : String(error)
      }`
    );
  }

  try {
    return JSON.parse(stripByteOrderMark(rawText));
  } catch (error) {
    throw new Error(
      `TREND_THRESHOLD_PROPOSAL_JSON_PARSE_ERROR(${description}): ${filePath} :: ${
        error && error.message ? error.message : String(error)
      }`
    );
  }
}

function writeTextFile(filePath, text, dependencies) {
  const deps = isPlainObject(dependencies) ? dependencies : {};
  const mkdirSync = typeof deps.mkdirSync === 'function' ? deps.mkdirSync : fs.mkdirSync;
  const writeFileSync = typeof deps.writeFileSync === 'function' ? deps.writeFileSync : fs.writeFileSync;
  const dirname = typeof deps.dirname === 'function' ? deps.dirname : path.dirname;

  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, text);
}

function toFiniteNumber(value, fallback) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function roundTo(value, digits) {
  const numeric = toFiniteNumber(value, NaN);
  if (!Number.isFinite(numeric)) {
    return null;
  }
  const precision = Math.pow(10, digits);
  return Math.round((numeric + Number.EPSILON) * precision) / precision;
}

function pickChapterRows(rebalanceReport) {
  const report = isPlainObject(rebalanceReport) ? rebalanceReport : {};
  const chapters = isPlainObject(report.chapters) ? report.chapters : {};
  const changedIds = Array.isArray(report.changedChapterIds) ? report.changedChapterIds : [];
  const manualReviewIds = Array.isArray(report.manualReviewChapterIds)
    ? report.manualReviewChapterIds
    : [];
  const selectedIds = Array.from(new Set([...changedIds, ...manualReviewIds])).sort();
  const rows = [];

  for (const chapterId of selectedIds) {
    const chapter = isPlainObject(chapters[chapterId]) ? chapters[chapterId] : {};
    rows.push({
      chapterId,
      action: chapter.action || 'keep',
      currentScoreIncreaseMax: roundTo(chapter.currentScoreIncreaseMax, 6),
      proposedScoreIncreaseMax: roundTo(chapter.proposedScoreIncreaseMax, 6),
      observedScoreDelta: roundTo(chapter.observedScoreDelta, 6),
      reason: chapter.reason || '',
    });
  }

  return rows;
}

function createProposalSummary(trendReport, syncSummary, rebalanceReport) {
  const trend = isPlainObject(trendReport) ? trendReport : {};
  const sync = isPlainObject(syncSummary) ? syncSummary : {};
  const rebalance = isPlainObject(rebalanceReport) ? rebalanceReport : {};
  const rebalanceSummary = isPlainObject(rebalance.summary) ? rebalance.summary : {};
  const chapterRows = pickChapterRows(rebalance);
  const changedCount = toFiniteNumber(rebalanceSummary.changedCount, 0);
  const manualReviewCount = toFiniteNumber(rebalanceSummary.manualReviewCount, 0);
  const hasProposal = changedCount > 0 || manualReviewCount > 0;

  return {
    generatedAt:
      typeof rebalance.generatedAt === 'string'
        ? rebalance.generatedAt
        : typeof trend.generatedAt === 'string'
          ? trend.generatedAt
          : null,
    trend: {
      ok: trend.ok === true,
      skipped: trend.skipped === true,
      regressions: Array.isArray(trend.regressions) ? trend.regressions.length : 0,
      thresholdsVersion: typeof trend.thresholdsVersion === 'string' ? trend.thresholdsVersion : null,
    },
    sync: {
      syncedChapterCount: toFiniteNumber(sync.syncedChapterCount, 0),
      addedCount: Array.isArray(sync.addedChapterIds) ? sync.addedChapterIds.length : 0,
      updatedCount: Array.isArray(sync.updatedChapterIds) ? sync.updatedChapterIds.length : 0,
      unchangedCount: Array.isArray(sync.unchangedChapterIds) ? sync.unchangedChapterIds.length : 0,
      chapterIdsToSync: Array.isArray(sync.chapterIdsToSync) ? sync.chapterIdsToSync : [],
    },
    rebalance: {
      changedCount,
      tightenedCount: toFiniteNumber(rebalanceSummary.tightenedCount, 0),
      relaxedCount: toFiniteNumber(rebalanceSummary.relaxedCount, 0),
      manualReviewCount,
      changedChapterIds: Array.isArray(rebalance.changedChapterIds) ? rebalance.changedChapterIds : [],
      manualReviewChapterIds: Array.isArray(rebalance.manualReviewChapterIds)
        ? rebalance.manualReviewChapterIds
        : [],
      chapterRows,
    },
    hasProposal,
  };
}

function formatNumber(value) {
  const numeric = toFiniteNumber(value, NaN);
  if (!Number.isFinite(numeric)) {
    return '-';
  }
  return String(roundTo(numeric, 6));
}

function renderProposalMarkdown(summary) {
  const source = isPlainObject(summary) ? summary : {};
  const trend = isPlainObject(source.trend) ? source.trend : {};
  const sync = isPlainObject(source.sync) ? source.sync : {};
  const rebalance = isPlainObject(source.rebalance) ? source.rebalance : {};
  const rows = Array.isArray(rebalance.chapterRows) ? rebalance.chapterRows : [];
  const lines = [
    '### Release Readiness Threshold Proposal',
    '',
    `- Generated at: ${source.generatedAt || '-'}`,
    `- Trend diff: ${trend.ok ? 'PASS' : 'FAIL'} (regressions=${trend.regressions || 0}, skipped=${
      trend.skipped ? 'true' : 'false'
    }, thresholdVersion=${trend.thresholdsVersion || '-'})`,
    `- Sync preview: synced=${sync.syncedChapterCount || 0} (added=${sync.addedCount || 0}, updated=${
      sync.updatedCount || 0
    }, unchanged=${sync.unchangedCount || 0})`,
    `- Rebalance recommendation: changed=${rebalance.changedCount || 0} (tightened=${
      rebalance.tightenedCount || 0
    }, relaxed=${rebalance.relaxedCount || 0}, manualReview=${rebalance.manualReviewCount || 0})`,
    '',
  ];

  if (rows.length === 0) {
    lines.push('No chapter-level threshold updates are currently recommended.');
  } else {
    lines.push('#### Chapter Recommendations');
    lines.push('');
    lines.push('| Chapter | Action | Current | Proposed | Observed Delta | Reason |');
    lines.push('| --- | --- | --- | --- | --- | --- |');
    for (const row of rows) {
      lines.push(
        `| ${row.chapterId} | ${row.action} | ${formatNumber(row.currentScoreIncreaseMax)} | ${formatNumber(
          row.proposedScoreIncreaseMax
        )} | ${formatNumber(row.observedScoreDelta)} | ${row.reason || '-'} |`
      );
    }
  }

  lines.push('');
  lines.push('#### Apply Commands');
  lines.push('');
  lines.push(
    '- Sync from trend report (with baseline lock): `node tools/release-readiness/sync-trend-thresholds.js --report=.tmp/release-readiness/trend-diff-report.json --thresholds=tools/release-readiness/trend-thresholds.json --all-chapters --lock-baseline --write`'
  );
  lines.push(
    '- Apply rebalance recommendation: `node tools/release-readiness/rebalance-trend-thresholds.js --report=.tmp/release-readiness/trend-diff-report.json --thresholds=tools/release-readiness/trend-thresholds.json --write`'
  );

  return `${lines.join('\n')}\n`;
}

function createSummaryLine(result) {
  const source = isPlainObject(result) ? result : {};
  const summary = isPlainObject(source.summary) ? source.summary : {};
  const rebalance = isPlainObject(summary.rebalance) ? summary.rebalance : {};
  return [
    `${SUMMARY_PREFIX} PASS`,
    `changed=${rebalance.changedCount || 0}`,
    `manualReview=${rebalance.manualReviewCount || 0}`,
    `hasProposal=${summary.hasProposal ? 'true' : 'false'}`,
  ].join(' ');
}

function buildThresholdProposal(options, dependencies) {
  const deps = isPlainObject(dependencies) ? dependencies : {};
  const parsedOptions = isPlainObject(options) ? options : {};
  const resolvedTrendReportPath = resolvePathFromCwd(parsedOptions.trendReportPath, deps);
  const resolvedSyncSummaryPath = resolvePathFromCwd(parsedOptions.syncSummaryPath, deps);
  const resolvedRebalanceReportPath = resolvePathFromCwd(parsedOptions.rebalanceReportPath, deps);
  const resolvedOutputPath = resolvePathFromCwd(parsedOptions.outputPath, deps);
  const resolvedOutputJsonPath = resolvePathFromCwd(parsedOptions.outputJsonPath, deps);
  const trendReport = readJsonFile(resolvedTrendReportPath, 'trend_report', deps);
  const syncSummary = readJsonFile(resolvedSyncSummaryPath, 'sync_summary', deps);
  const rebalanceReport = readJsonFile(resolvedRebalanceReportPath, 'rebalance_report', deps);
  const summary = createProposalSummary(trendReport, syncSummary, rebalanceReport);
  const markdown = renderProposalMarkdown(summary);
  writeTextFile(resolvedOutputPath, markdown, deps);
  writeTextFile(
    resolvedOutputJsonPath,
    `${JSON.stringify(
      {
        trendReportPath: resolvedTrendReportPath,
        syncSummaryPath: resolvedSyncSummaryPath,
        rebalanceReportPath: resolvedRebalanceReportPath,
        markdownPath: resolvedOutputPath,
        ...summary,
      },
      null,
      2
    )}\n`,
    deps
  );

  return {
    trendReportPath: resolvedTrendReportPath,
    syncSummaryPath: resolvedSyncSummaryPath,
    rebalanceReportPath: resolvedRebalanceReportPath,
    outputPath: resolvedOutputPath,
    outputJsonPath: resolvedOutputJsonPath,
    summary,
    markdown,
    summaryLine: createSummaryLine({ summary }),
  };
}

function main() {
  let parsedArgs;
  try {
    parsedArgs = parseArgs(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.stderr.write('Use --help to see supported options.\n');
    process.exit(1);
  }

  if (parsedArgs.help) {
    printHelp();
    return;
  }

  try {
    const result = buildThresholdProposal(parsedArgs);
    process.stdout.write(`${result.summaryLine}\n`);
    process.stderr.write(`${SUMMARY_PREFIX} Wrote markdown to ${result.outputPath}\n`);
    process.stderr.write(`${SUMMARY_PREFIX} Wrote summary to ${result.outputJsonPath}\n`);
  } catch (error) {
    process.stderr.write(`${SUMMARY_PREFIX} Execution failed\n`);
    process.stderr.write(`${error && error.stack ? error.stack : String(error)}\n`);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  SUMMARY_PREFIX,
  DEFAULT_TREND_REPORT_PATH,
  DEFAULT_SYNC_SUMMARY_PATH,
  DEFAULT_REBALANCE_REPORT_PATH,
  DEFAULT_OUTPUT_PATH,
  DEFAULT_OUTPUT_JSON_PATH,
  parseArgs,
  pickChapterRows,
  createProposalSummary,
  renderProposalMarkdown,
  buildThresholdProposal,
  createSummaryLine,
};
