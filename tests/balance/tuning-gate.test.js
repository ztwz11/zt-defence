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
const { resolveGateExitCode, runTuningGate } = require('../../tools/balance/run-tuning-gate');

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

test('runTuningGate supports --report mode and default internal auto-tune mode', () => {
  const configPath = 'C:\\gate-config.json';
  const reportPath = 'C:\\auto-tune-report.json';
  const fileMap = {
    [configPath]: JSON.stringify({
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

  assert.equal(internalModeResult.reportSource, 'auto-tune');
  assert.equal(internalModeResult.reportPath, null);
  assert.equal(internalModeResult.evaluation.status, STATUS_PASS);
  assert.equal(internalModeResult.exitCode, 0);
  assert.equal(autoTuneCallCount, 1);
});
