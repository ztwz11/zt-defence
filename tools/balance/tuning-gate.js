'use strict';

const STATUS_PASS = 'PASS';
const STATUS_WARN = 'WARN';
const STATUS_FAIL = 'FAIL';

const DEFAULT_TUNING_GATE_CONFIG = Object.freeze({
  thresholds: Object.freeze({
    passMaxScore: 0.75,
    warnMaxScore: 1.25,
  }),
  recommendations: Object.freeze({
    pass: 'No tuning changes required.',
    warn: 'Review the candidate spread and consider re-running auto tune.',
    fail: 'Block release and re-run auto tune after tuning adjustments.',
    missingBestCandidate: 'Provide an auto-tune report that includes bestCandidate.score.',
  }),
});

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function toFiniteNumber(value, fallback) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function roundTo(value, digits) {
  const precision = Math.pow(10, digits);
  return Math.round(value * precision) / precision;
}

function toNonNegativeNumber(value, fallback) {
  return Math.max(0, toFiniteNumber(value, fallback));
}

function stripByteOrderMark(text) {
  if (typeof text !== 'string') {
    return '';
  }

  return text.replace(/^\uFEFF/, '');
}

function parseTuningGateConfig(source) {
  if (Buffer.isBuffer(source)) {
    return parseTuningGateConfig(source.toString('utf8'));
  }

  if (typeof source === 'string') {
    const trimmed = stripByteOrderMark(source).trim();
    if (trimmed.length === 0) {
      return {};
    }

    try {
      return JSON.parse(trimmed);
    } catch (error) {
      throw new Error(
        `TUNING_GATE_CONFIG_PARSE_ERROR: ${error && error.message ? error.message : String(error)}`
      );
    }
  }

  if (isPlainObject(source)) {
    return cloneJson(source);
  }

  return {};
}

function getFirstFiniteNumber(candidates, fallback) {
  for (const candidate of candidates) {
    const numeric = Number(candidate);
    if (Number.isFinite(numeric)) {
      return numeric;
    }
  }

  return fallback;
}

function normalizeRecommendation(value, fallback) {
  if (typeof value !== 'string') {
    return fallback;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : fallback;
}

function normalizeTuningGateConfig(config) {
  const source = isPlainObject(config) ? config : {};
  const thresholdsSource = isPlainObject(source.thresholds) ? source.thresholds : {};
  const recommendationsSource = isPlainObject(source.recommendations) ? source.recommendations : {};

  const passCandidate = getFirstFiniteNumber(
    [
      thresholdsSource.passMaxScore,
      thresholdsSource.passThreshold,
      source.passMaxScore,
      source.passThreshold,
    ],
    DEFAULT_TUNING_GATE_CONFIG.thresholds.passMaxScore
  );
  const warnCandidate = getFirstFiniteNumber(
    [
      thresholdsSource.warnMaxScore,
      thresholdsSource.warnThreshold,
      source.warnMaxScore,
      source.warnThreshold,
    ],
    DEFAULT_TUNING_GATE_CONFIG.thresholds.warnMaxScore
  );

  const passMaxScore = roundTo(toNonNegativeNumber(passCandidate, 0), 6);
  const warnMaxScore = roundTo(
    Math.max(passMaxScore, toNonNegativeNumber(warnCandidate, passMaxScore)),
    6
  );

  return {
    thresholds: {
      passMaxScore,
      warnMaxScore,
    },
    recommendations: {
      pass: normalizeRecommendation(
        recommendationsSource.pass,
        DEFAULT_TUNING_GATE_CONFIG.recommendations.pass
      ),
      warn: normalizeRecommendation(
        recommendationsSource.warn,
        DEFAULT_TUNING_GATE_CONFIG.recommendations.warn
      ),
      fail: normalizeRecommendation(
        recommendationsSource.fail,
        DEFAULT_TUNING_GATE_CONFIG.recommendations.fail
      ),
      missingBestCandidate: normalizeRecommendation(
        recommendationsSource.missingBestCandidate,
        DEFAULT_TUNING_GATE_CONFIG.recommendations.missingBestCandidate
      ),
    },
  };
}

function buildReasonPayload(status, score, thresholds, recommendation) {
  return {
    status,
    score,
    thresholds: cloneJson(thresholds),
    recommendation,
  };
}

function evaluateTuningGateReport(report, config) {
  const normalizedConfig = normalizeTuningGateConfig(config);
  const sourceReport = isPlainObject(report) ? report : {};
  const bestCandidate = isPlainObject(sourceReport.bestCandidate) ? sourceReport.bestCandidate : null;
  const thresholds = normalizedConfig.thresholds;

  if (!bestCandidate) {
    const recommendation = normalizedConfig.recommendations.missingBestCandidate;
    const reason = buildReasonPayload(STATUS_FAIL, null, thresholds, recommendation);
    return {
      status: STATUS_FAIL,
      score: null,
      thresholds: cloneJson(thresholds),
      recommendation,
      reason,
    };
  }

  const score = toFiniteNumber(bestCandidate.score, NaN);
  if (!Number.isFinite(score)) {
    const recommendation = normalizedConfig.recommendations.missingBestCandidate;
    const reason = buildReasonPayload(STATUS_FAIL, null, thresholds, recommendation);
    return {
      status: STATUS_FAIL,
      score: null,
      thresholds: cloneJson(thresholds),
      recommendation,
      reason,
    };
  }

  let status = STATUS_FAIL;
  let recommendation = normalizedConfig.recommendations.fail;
  if (score <= thresholds.passMaxScore) {
    status = STATUS_PASS;
    recommendation = normalizedConfig.recommendations.pass;
  } else if (score <= thresholds.warnMaxScore) {
    status = STATUS_WARN;
    recommendation = normalizedConfig.recommendations.warn;
  }

  const normalizedScore = roundTo(score, 6);
  const reason = buildReasonPayload(status, normalizedScore, thresholds, recommendation);
  return {
    status,
    score: normalizedScore,
    thresholds: cloneJson(thresholds),
    recommendation,
    reason,
  };
}

module.exports = {
  STATUS_PASS,
  STATUS_WARN,
  STATUS_FAIL,
  DEFAULT_TUNING_GATE_CONFIG,
  parseTuningGateConfig,
  normalizeTuningGateConfig,
  evaluateTuningGateReport,
};
