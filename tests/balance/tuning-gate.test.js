'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  STATUS_PASS,
  STATUS_WARN,
  STATUS_FAIL,
  parseTuningGateConfig,
  normalizeTuningGateConfig,
  evaluateTuningGateReport,
} = require('../../tools/balance/tuning-gate');
const {
  resolveGateExitCode,
  normalizeAutoTuneDefaults,
  resolveScopedConfig,
  buildTopCandidates,
  resolveTopCandidatesLimit,
  mergeParsedArgsWithAutoTuneDefaults,
  runTuningGate,
} = require('../../tools/balance/run-tuning-gate');

test('evaluateTuningGateReport applies PASS/WARN/FAIL threshold boundaries', () => {
  const parsedConfig = parseTuningGateConfig(
    JSON.stringify({
      thresholds: {
        passMaxScore: 1,
        warnMaxScore: 2,
      },
      recommendations: {
        pass: 'pass',
        warn: 'warn',
        fail: 'fail',
      },
    })
  );
  const gateConfig = normalizeTuningGateConfig(parsedConfig);

  const passResult = evaluateTuningGateReport(
    {
      bestCandidate: {
        score: 1,
      },
    },
    gateConfig
  );
  assert.equal(passResult.status, STATUS_PASS);
  assert.equal(passResult.reason.status, STATUS_PASS);
  assert.equal(passResult.reason.score, 1);
  assert.deepEqual(passResult.reason.thresholds, gateConfig.thresholds);
  assert.equal(passResult.reason.recommendation, 'pass');

  const warnResult = evaluateTuningGateReport(
    {
      bestCandidate: {
        score: 2,
      },
    },
    gateConfig
  );
  assert.equal(warnResult.status, STATUS_WARN);
  assert.equal(warnResult.reason.status, STATUS_WARN);
  assert.equal(warnResult.reason.score, 2);
  assert.equal(warnResult.reason.recommendation, 'warn');

  const failResult = evaluateTuningGateReport(
    {
      bestCandidate: {
        score: 2.000001,
      },
    },
    gateConfig
  );
  assert.equal(failResult.status, STATUS_FAIL);
  assert.equal(failResult.reason.status, STATUS_FAIL);
  assert.equal(failResult.reason.score, 2.000001);
  assert.equal(failResult.reason.recommendation, 'fail');
});

test('evaluateTuningGateReport fails with clear reason when bestCandidate is missing', () => {
  const gateConfig = normalizeTuningGateConfig({
    thresholds: {
      passMaxScore: 0.5,
      warnMaxScore: 1,
    },
    recommendations: {
      missingBestCandidate: 'missing',
    },
  });

  const result = evaluateTuningGateReport({}, gateConfig);

  assert.equal(result.status, STATUS_FAIL);
  assert.equal(result.score, null);
  assert.deepEqual(result.reason, {
    status: STATUS_FAIL,
    score: null,
    thresholds: {
      passMaxScore: 0.5,
      warnMaxScore: 1,
    },
    recommendation: 'missing',
  });
});

test('resolveGateExitCode applies fail-on-warn switch', () => {
  assert.equal(resolveGateExitCode(STATUS_PASS, false), 0);
  assert.equal(resolveGateExitCode(STATUS_WARN, false), 0);
  assert.equal(resolveGateExitCode(STATUS_WARN, true), 1);
  assert.equal(resolveGateExitCode(STATUS_FAIL, false), 1);
  assert.equal(resolveGateExitCode(STATUS_FAIL, true), 1);
});

test('resolveScopedConfig applies chapter overrides for thresholds and auto-tune defaults', () => {
  const scoped = resolveScopedConfig(
    {
      autoTuneDefaults: {
        chapter: 'chapter_1',
        seeds: 100,
      },
      thresholds: {
        passMaxScore: 0.8,
        warnMaxScore: 1.2,
      },
      chapters: {
        chapter_2: {
          autoTuneDefaults: {
            chapter: 'chapter_2',
            seeds: 240,
            searchSeed: 2222,
          },
          thresholds: {
            passMaxScore: 0.4,
            warnMaxScore: 0.9,
          },
        },
      },
    },
    {
      chapter: 'chapter_2',
    }
  );

  assert.equal(scoped.requestedChapterId, 'chapter_2');
  assert.equal(scoped.selectedChapterId, 'chapter_2');
  assert.equal(scoped.hasChapterOverride, true);
  assert.deepEqual(scoped.availableChapterIds, ['chapter_2']);
  assert.deepEqual(scoped.config.thresholds, {
    passMaxScore: 0.4,
    warnMaxScore: 0.9,
  });
  assert.deepEqual(scoped.config.autoTuneDefaults, {
    chapter: 'chapter_2',
    seeds: 240,
    searchSeed: 2222,
  });
  assert.equal(Object.prototype.hasOwnProperty.call(scoped.config, 'chapters'), false);
});

test('runTuningGate supports --report mode and default internal auto-tune mode', () => {
  const configPath = 'C:\\gate-config.json';
  const reportPath = 'C:\\auto-tune-report.json';
  const fileMap = {
    [configPath]: JSON.stringify({
      autoTuneDefaults: {
        chapter: 'chapter_2',
        waveMax: 12,
        seeds: 64,
        candidates: 16,
        searchSeed: 404,
        objective: {
          targetClearRate: 0.6,
          targetReachedWave: 9,
          maxFailRate: 0.3,
        },
      },
      thresholds: {
        passMaxScore: 0.5,
        warnMaxScore: 1,
      },
    }),
    [reportPath]: JSON.stringify({
      bestCandidate: {
        score: 0.8,
      },
    }),
  };
  const readFileSync = (filePath) => {
    if (Object.prototype.hasOwnProperty.call(fileMap, filePath)) {
      return fileMap[filePath];
    }

    throw new Error(`Unexpected file read: ${filePath}`);
  };

  let autoTuneCallCount = 0;
  const reportModeResult = runTuningGate(
    {
      config: configPath,
      report: reportPath,
      'fail-on-warn': true,
    },
    {
      readFileSync,
      runAutoTune() {
        autoTuneCallCount += 1;
        return {
          bestCandidate: {
            score: 0.1,
          },
        };
      },
    }
  );

  assert.equal(reportModeResult.reportSource, 'report');
  assert.equal(reportModeResult.reportPath, reportPath);
  assert.equal(reportModeResult.evaluation.status, STATUS_WARN);
  assert.equal(reportModeResult.exitCode, 1);
  assert.equal(autoTuneCallCount, 0);

  const internalModeResult = runTuningGate(
    {
      config: configPath,
    },
    {
      readFileSync,
      runAutoTune(receivedOptions) {
        autoTuneCallCount += 1;
        assert.equal(receivedOptions.chapterId, 'chapter_2');
        assert.equal(receivedOptions.waveMax, 12);
        assert.equal(receivedOptions.seedCount, 64);
        assert.equal(receivedOptions.candidateCount, 16);
        assert.equal(receivedOptions.searchSeed, 404);
        assert.deepEqual(receivedOptions.objective, {
          targetClearRate: 0.6,
          targetReachedWave: 9,
          maxFailRate: 0.3,
        });
        return {
          bestCandidate: {
            score: 0.1,
          },
        };
      },
    }
  );

  assert.equal(internalModeResult.reportSource, 'auto-tune');
  assert.equal(internalModeResult.reportPath, null);
  assert.equal(internalModeResult.evaluation.status, STATUS_PASS);
  assert.equal(internalModeResult.exitCode, 0);
  assert.equal(autoTuneCallCount, 1);
});

test('runTuningGate applies chapter profile and writes output report with top candidates', () => {
  const configPath = 'C:\\gate-config.json';
  const outputPath = 'artifacts/tuning-gate.json';
  const fileMap = {
    [configPath]: JSON.stringify({
      autoTuneDefaults: {
        chapter: 'chapter_1',
        waveMax: 20,
        seeds: 50,
      },
      thresholds: {
        passMaxScore: 0.8,
        warnMaxScore: 1.2,
      },
      chapters: {
        chapter_2: {
          autoTuneDefaults: {
            chapter: 'chapter_2',
            waveMax: 16,
            seeds: 60,
            searchSeed: 9090,
            objective: {
              targetClearRate: 0.5,
              targetReachedWave: 10,
              maxFailRate: 0.4,
            },
          },
          thresholds: {
            passMaxScore: 0.3,
            warnMaxScore: 0.7,
          },
        },
      },
    }),
  };
  const readFileSync = (filePath) => {
    if (Object.prototype.hasOwnProperty.call(fileMap, filePath)) {
      return fileMap[filePath];
    }
    throw new Error(`Unexpected file read: ${filePath}`);
  };

  let receivedOptions = null;
  let writtenPath = null;
  let writtenPayload = null;
  const result = runTuningGate(
    {
      config: configPath,
      chapter: 'chapter_2',
      output: outputPath,
      'top-candidates': 2,
    },
    {
      readFileSync,
      cwd() {
        return 'C:\\repo';
      },
      resolvePath(cwd, targetPath) {
        if (/^[A-Za-z]:[\\/]/.test(targetPath)) {
          return targetPath;
        }
        return `${cwd}\\${String(targetPath).replaceAll('/', '\\')}`;
      },
      dirname(filePath) {
        return String(filePath).replace(/[\\/][^\\/]+$/, '');
      },
      mkdirSync() {},
      writeFileSync(filePath, value) {
        writtenPath = filePath;
        writtenPayload = JSON.parse(value);
      },
      now() {
        return '2026-02-20T00:00:00.000Z';
      },
      runAutoTune(options) {
        receivedOptions = options;
        return {
          bestCandidate: {
            rank: 1,
            id: 'candidate_1',
            score: 0.4,
            candidate: {
              goblinHpScale: 1.6,
            },
          },
          rankedCandidates: [
            { rank: 1, id: 'candidate_1', score: 0.4 },
            { rank: 2, id: 'candidate_2', score: 0.6 },
            { rank: 3, id: 'candidate_3', score: 0.9 },
          ],
        };
      },
    }
  );

  assert.equal(receivedOptions.chapterId, 'chapter_2');
  assert.equal(receivedOptions.waveMax, 16);
  assert.equal(receivedOptions.seedCount, 60);
  assert.equal(receivedOptions.searchSeed, 9090);
  assert.deepEqual(receivedOptions.objective, {
    targetClearRate: 0.5,
    targetReachedWave: 10,
    maxFailRate: 0.4,
  });

  assert.equal(result.evaluation.status, STATUS_WARN);
  assert.ok(
    result.outputPath.endsWith('\\artifacts\\tuning-gate.json') ||
      result.outputPath.endsWith('/artifacts/tuning-gate.json')
  );
  assert.equal(result.topCandidates.length, 2);
  assert.equal(writtenPath, result.outputPath);
  assert.equal(writtenPayload.generatedAt, '2026-02-20T00:00:00.000Z');
  assert.equal(writtenPayload.chapterProfile.selectedChapterId, 'chapter_2');
  assert.equal(writtenPayload.evaluation.status, STATUS_WARN);
  assert.equal(writtenPayload.topCandidates.length, 2);
});

test('buildTopCandidates and resolveTopCandidatesLimit handle invalid values safely', () => {
  assert.equal(resolveTopCandidatesLimit(undefined, 5), 5);
  assert.equal(resolveTopCandidatesLimit('2', 5), 2);
  assert.equal(resolveTopCandidatesLimit('-4', 5), 0);
  assert.equal(resolveTopCandidatesLimit('abc', 5), 5);

  assert.deepEqual(buildTopCandidates({}, 3), []);
  assert.deepEqual(
    buildTopCandidates(
      {
        bestCandidate: { id: 'best' },
      },
      3
    ),
    [{ id: 'best' }]
  );
  assert.deepEqual(
    buildTopCandidates(
      {
        rankedCandidates: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
      },
      2
    ),
    [{ id: 'a' }, { id: 'b' }]
  );
});

test('config auto tune defaults can be merged and overridden by cli args', () => {
  const defaults = normalizeAutoTuneDefaults({
    autoTuneDefaults: {
      chapterId: 'chapter_1',
      waveMax: 20,
      seeds: 100,
      candidates: 24,
      searchSeed: 2026,
      objective: {
        targetClearRate: 0.55,
        targetReachedWave: 14,
        maxFailRate: 0.35,
      },
      weights: {
        clearRate: 1,
      },
    },
  });

  assert.equal(defaults.chapter, 'chapter_1');
  assert.equal(defaults['wave-max'], 20);
  assert.equal(defaults.seeds, 100);
  assert.equal(defaults.candidates, 24);
  assert.equal(defaults['search-seed'], 2026);
  assert.equal(defaults['target-clear'], 0.55);
  assert.equal(defaults['target-wave'], 14);
  assert.equal(defaults['max-fail'], 0.35);
  assert.equal(defaults['weight-clear'], 1);

  const merged = mergeParsedArgsWithAutoTuneDefaults(
    {
      chapter: 'chapter_3',
      'wave-max': 16,
      seeds: 40,
      'target-wave': 10,
    },
    defaults
  );

  assert.equal(merged.chapter, 'chapter_3');
  assert.equal(merged['wave-max'], 16);
  assert.equal(merged.seeds, 40);
  assert.equal(merged['target-wave'], 10);
  assert.equal(merged['search-seed'], 2026);
  assert.equal(merged['target-clear'], 0.55);
});
