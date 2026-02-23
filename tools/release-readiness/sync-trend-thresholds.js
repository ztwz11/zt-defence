#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const { normalizeTrendThresholds } = require('./check-trend-diff');

const SUMMARY_PREFIX = '[trend-threshold-sync]';
const DEFAULT_REPORT_PATH = '.tmp/release-readiness/trend-diff-report.json';
const DEFAULT_THRESHOLDS_PATH = path.join(__dirname, 'trend-thresholds.json');

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function parseArgs(argv) {
  const args = Array.isArray(argv) ? argv : [];
  const parsed = {
    help: false,
    reportPath: DEFAULT_REPORT_PATH,
    thresholdsPath: DEFAULT_THRESHOLDS_PATH,
    outputPath: null,
    summaryOutputPath: null,
    write: false,
    allChapters: false,
    lockBaseline: false,
  };

  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];

    if (token === '--help' || token === '-h') {
      parsed.help = true;
      continue;
    }

    if (token.startsWith('--report=')) {
      parsed.reportPath = token.slice('--report='.length).trim();
      continue;
    }

    if (token === '--report') {
      parsed.reportPath = String(args[index + 1] || '').trim();
      index += 1;
      continue;
    }

    if (token.startsWith('--thresholds=')) {
      parsed.thresholdsPath = token.slice('--thresholds='.length).trim();
      continue;
    }

    if (token === '--thresholds') {
      parsed.thresholdsPath = String(args[index + 1] || '').trim();
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

    if (token.startsWith('--summary-output=')) {
      parsed.summaryOutputPath = token.slice('--summary-output='.length).trim();
      continue;
    }

    if (token === '--summary-output') {
      parsed.summaryOutputPath = String(args[index + 1] || '').trim();
      index += 1;
      continue;
    }

    if (token === '--write') {
      parsed.write = true;
      continue;
    }

    if (token === '--all-chapters') {
      parsed.allChapters = true;
      continue;
    }

    if (token === '--lock-baseline') {
      parsed.lockBaseline = true;
      continue;
    }

    throw new Error(`Unknown argument: ${token}`);
  }

  if (parsed.reportPath.length === 0) {
    throw new Error('Invalid --report value. Expected a non-empty path.');
  }

  if (parsed.thresholdsPath.length === 0) {
    throw new Error('Invalid --thresholds value. Expected a non-empty path.');
  }

  if (parsed.outputPath !== null && parsed.outputPath.length === 0) {
    throw new Error('Invalid --output value. Expected a non-empty path.');
  }

  if (parsed.summaryOutputPath !== null && parsed.summaryOutputPath.length === 0) {
    throw new Error('Invalid --summary-output value. Expected a non-empty path.');
  }

  return parsed;
}

function printHelp() {
  const lines = [
    'Usage: node tools/release-readiness/sync-trend-thresholds.js [options]',
    '',
    'Options:',
    `  --report=<path>      Trend diff report path (default: ${DEFAULT_REPORT_PATH})`,
    `  --thresholds=<path>  Target thresholds path (default: ${DEFAULT_THRESHOLDS_PATH})`,
    '  --output=<path>      Optional output path for synced thresholds JSON',
    '  --summary-output=<path> Optional output path for sync summary JSON',
    '  --write              Write synced thresholds back to --thresholds path',
    '  --all-chapters       Sync all chapters from effectiveThresholds (default: scaffolded only)',
    '  --lock-baseline      Set allowMissingBaseline=false for synced chapter profiles',
    '  --help               Show this help message',
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
      `TREND_THRESHOLD_SYNC_FILE_READ_ERROR(${description}): ${filePath} :: ${
        error && error.message ? error.message : String(error)
      }`
    );
  }

  try {
    return JSON.parse(stripByteOrderMark(rawText));
  } catch (error) {
    throw new Error(
      `TREND_THRESHOLD_SYNC_JSON_PARSE_ERROR(${description}): ${filePath} :: ${
        error && error.message ? error.message : String(error)
      }`
    );
  }
}

function writeJsonFile(filePath, payload, dependencies) {
  const deps = isPlainObject(dependencies) ? dependencies : {};
  const mkdirSync = typeof deps.mkdirSync === 'function' ? deps.mkdirSync : fs.mkdirSync;
  const writeFileSync = typeof deps.writeFileSync === 'function' ? deps.writeFileSync : fs.writeFileSync;
  const dirname = typeof deps.dirname === 'function' ? deps.dirname : path.dirname;

  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`);
}

function buildSyncSummaryPayload(result) {
  const source = isPlainObject(result) ? result : {};
  return {
    generatedAt: source.generatedAt || null,
    reportPath: source.reportPath || null,
    thresholdsPath: source.thresholdsPath || null,
    outputPath: source.outputPath || null,
    allChapters: source.allChapters === true,
    lockBaseline: source.lockBaseline === true,
    sourceChapterIds: Array.isArray(source.sourceChapterIds) ? source.sourceChapterIds : [],
    chapterIdsToSync: Array.isArray(source.chapterIdsToSync) ? source.chapterIdsToSync : [],
    addedChapterIds: Array.isArray(source.addedChapterIds) ? source.addedChapterIds : [],
    updatedChapterIds: Array.isArray(source.updatedChapterIds) ? source.updatedChapterIds : [],
    unchangedChapterIds: Array.isArray(source.unchangedChapterIds) ? source.unchangedChapterIds : [],
    syncedChapterCount: Number.isFinite(Number(source.syncedChapterCount))
      ? Number(source.syncedChapterCount)
      : 0,
    writtenThresholdsPath: source.writtenThresholdsPath || null,
    writtenOutputPath: source.writtenOutputPath || null,
  };
}

function extractSyncInput(reportPayload) {
  const source = isPlainObject(reportPayload) ? reportPayload : {};
  const effectiveThresholds = isPlainObject(source.effectiveThresholds)
    ? source.effectiveThresholds
    : source;
  const scaffoldedChapterIds = Array.isArray(source.scaffoldedChapterIds)
    ? source.scaffoldedChapterIds.filter(
        (chapterId) => typeof chapterId === 'string' && chapterId.trim().length > 0
      )
    : [];

  return {
    effectiveThresholds,
    scaffoldedChapterIds: Array.from(new Set(scaffoldedChapterIds)).sort(),
  };
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function resolveChapterIdsToSync(sourceThresholds, syncInput, options) {
  const sourceChapters = isPlainObject(sourceThresholds.tuning?.chapters)
    ? sourceThresholds.tuning.chapters
    : {};
  const sourceChapterIds = Object.keys(sourceChapters).sort();
  const source = isPlainObject(options) ? options : {};

  if (source.allChapters) {
    return sourceChapterIds;
  }

  const scaffolded = Array.isArray(syncInput.scaffoldedChapterIds)
    ? syncInput.scaffoldedChapterIds
    : [];
  if (scaffolded.length > 0) {
    return scaffolded.filter((chapterId) => Object.prototype.hasOwnProperty.call(sourceChapters, chapterId));
  }

  return [];
}

function syncTrendThresholds(options, dependencies) {
  const deps = isPlainObject(dependencies) ? dependencies : {};
  const now = typeof deps.now === 'function' ? deps.now : () => new Date().toISOString();
  const resolvedReportPath = resolvePathFromCwd(options.reportPath, deps);
  const resolvedThresholdsPath = resolvePathFromCwd(options.thresholdsPath, deps);
  const resolvedOutputPath =
    typeof options.outputPath === 'string' && options.outputPath.length > 0
      ? resolvePathFromCwd(options.outputPath, deps)
      : null;
  const rawReport = readJsonFile(resolvedReportPath, 'trend_report', deps);
  const syncInput = extractSyncInput(rawReport);
  const sourceThresholds = normalizeTrendThresholds(syncInput.effectiveThresholds);
  const currentThresholds = normalizeTrendThresholds(
    readJsonFile(resolvedThresholdsPath, 'thresholds', deps)
  );
  const chapterIdsToSync = resolveChapterIdsToSync(sourceThresholds, syncInput, options);
  const nextThresholds = cloneJson(currentThresholds);
  const addedChapterIds = [];
  const updatedChapterIds = [];
  const unchangedChapterIds = [];
  const missingSourceChapterIds = [];

  for (const chapterId of chapterIdsToSync) {
    const sourceProfile = sourceThresholds.tuning?.chapters?.[chapterId];
    if (!isPlainObject(sourceProfile)) {
      missingSourceChapterIds.push(chapterId);
      continue;
    }

    const nextProfile = cloneJson(sourceProfile);
    if (options.lockBaseline) {
      nextProfile.allowMissingBaseline = false;
    }

    const beforeProfile = nextThresholds.tuning.chapters[chapterId];
    const beforeSnapshot = JSON.stringify(beforeProfile ?? null);
    const afterSnapshot = JSON.stringify(nextProfile);

    nextThresholds.tuning.chapters[chapterId] = nextProfile;
    if (!isPlainObject(beforeProfile)) {
      addedChapterIds.push(chapterId);
    } else if (beforeSnapshot !== afterSnapshot) {
      updatedChapterIds.push(chapterId);
    } else {
      unchangedChapterIds.push(chapterId);
    }
  }

  if (missingSourceChapterIds.length > 0) {
    throw new Error(
      `TREND_THRESHOLD_SYNC_MISSING_SOURCE_CHAPTERS: ${missingSourceChapterIds.join(', ')}`
    );
  }

  let writtenThresholdsPath = null;
  let writtenOutputPath = null;

  if (options.write) {
    writeJsonFile(resolvedThresholdsPath, nextThresholds, deps);
    writtenThresholdsPath = resolvedThresholdsPath;
  }

  if (resolvedOutputPath) {
    writeJsonFile(resolvedOutputPath, nextThresholds, deps);
    writtenOutputPath = resolvedOutputPath;
  }

  return {
    generatedAt: now(),
    reportPath: resolvedReportPath,
    thresholdsPath: resolvedThresholdsPath,
    outputPath: resolvedOutputPath,
    allChapters: options.allChapters === true,
    lockBaseline: options.lockBaseline === true,
    sourceChapterIds: Object.keys(sourceThresholds.tuning.chapters).sort(),
    chapterIdsToSync,
    addedChapterIds,
    updatedChapterIds,
    unchangedChapterIds,
    syncedChapterCount: addedChapterIds.length + updatedChapterIds.length + unchangedChapterIds.length,
    writtenThresholdsPath,
    writtenOutputPath,
    thresholds: nextThresholds,
  };
}

function createSummaryLine(result) {
  const source = isPlainObject(result) ? result : {};
  return [
    `${SUMMARY_PREFIX} PASS`,
    `synced=${source.syncedChapterCount || 0}`,
    `added=${(source.addedChapterIds || []).length}`,
    `updated=${(source.updatedChapterIds || []).length}`,
    `unchanged=${(source.unchangedChapterIds || []).length}`,
  ].join(' ');
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
    const result = syncTrendThresholds(parsedArgs);
    let writtenSummaryPath = null;
    if (parsedArgs.summaryOutputPath) {
      const summaryPayload = buildSyncSummaryPayload(result);
      writtenSummaryPath = resolvePathFromCwd(parsedArgs.summaryOutputPath, {});
      writeJsonFile(writtenSummaryPath, summaryPayload, {});
    }

    process.stdout.write(`${createSummaryLine(result)}\n`);

    if (result.writtenThresholdsPath) {
      process.stderr.write(`${SUMMARY_PREFIX} Wrote thresholds to ${result.writtenThresholdsPath}\n`);
    }
    if (result.writtenOutputPath) {
      process.stderr.write(`${SUMMARY_PREFIX} Wrote output to ${result.writtenOutputPath}\n`);
    }
    if (writtenSummaryPath) {
      process.stderr.write(`${SUMMARY_PREFIX} Wrote summary to ${writtenSummaryPath}\n`);
    }
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
  DEFAULT_REPORT_PATH,
  DEFAULT_THRESHOLDS_PATH,
  parseArgs,
  extractSyncInput,
  resolveChapterIdsToSync,
  buildSyncSummaryPayload,
  syncTrendThresholds,
  createSummaryLine,
};
