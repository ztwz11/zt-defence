'use strict';

const { RUN_PHASE } = require('../game/run');
const { TUTORIAL_STEP } = require('../game/tutorial');

const UI_LOCALE = Object.freeze({
  EN: 'en',
  KO: 'ko',
});

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function cloneValue(value) {
  if (Array.isArray(value)) {
    return value.map(cloneValue);
  }

  if (!isPlainObject(value)) {
    return value;
  }

  const clone = {};
  for (const key of Object.keys(value)) {
    clone[key] = cloneValue(value[key]);
  }
  return clone;
}

const UI_TEXT_BUNDLES = Object.freeze({
  [UI_LOCALE.EN]: Object.freeze({
    phaseLabels: Object.freeze({
      [RUN_PHASE.PREPARE]: 'Prepare',
      [RUN_PHASE.COMBAT]: 'Combat',
      [RUN_PHASE.REWARD]: 'Reward',
      [RUN_PHASE.BOSS_INTRO]: 'Boss Intro',
      [RUN_PHASE.RESULT]: 'Result',
    }),
    tutorial: Object.freeze({
      steps: Object.freeze({
        [TUTORIAL_STEP.SUMMON]: 'Summon units 3 times',
        [TUTORIAL_STEP.MERGE]: 'Merge units 1 time',
        [TUTORIAL_STEP.SYNERGY]: 'Trigger 1 synergy',
        [TUTORIAL_STEP.COMPLETE]: 'Tutorial complete',
      }),
      skipped: 'Tutorial skipped',
    }),
    screens: Object.freeze({
      history: 'History',
      result: 'Result',
    }),
    hud: Object.freeze({
      summon: 'Summon',
      reroll: 'Reroll',
      timer: 'Timer',
      speed: 'Speed',
    }),
    settings: Object.freeze({
      sfx: 'Sound',
      vibration: 'Vibration',
      lowFxMode: 'Low FX Mode',
    }),
  }),
  [UI_LOCALE.KO]: Object.freeze({
    phaseLabels: Object.freeze({
      [RUN_PHASE.PREPARE]: '준비',
      [RUN_PHASE.COMBAT]: '전투',
      [RUN_PHASE.REWARD]: '보상',
      [RUN_PHASE.BOSS_INTRO]: '보스 등장',
      [RUN_PHASE.RESULT]: '결과',
    }),
    tutorial: Object.freeze({
      steps: Object.freeze({
        [TUTORIAL_STEP.SUMMON]: '유닛 3회 소환',
        [TUTORIAL_STEP.MERGE]: '유닛 1회 합성',
        [TUTORIAL_STEP.SYNERGY]: '시너지 1회 발동',
        [TUTORIAL_STEP.COMPLETE]: '튜토리얼 완료',
      }),
      skipped: '튜토리얼 건너뜀',
    }),
    screens: Object.freeze({
      history: '기록',
      result: '결과',
    }),
    hud: Object.freeze({
      summon: '소환',
      reroll: '리롤',
      timer: '타이머',
      speed: '배속',
    }),
    settings: Object.freeze({
      sfx: '사운드',
      vibration: '진동',
      lowFxMode: '저사양 이펙트',
    }),
  }),
});

function normalizeUiLocale(locale) {
  if (locale === UI_LOCALE.KO) {
    return UI_LOCALE.KO;
  }

  if (locale === UI_LOCALE.EN) {
    return UI_LOCALE.EN;
  }

  return UI_LOCALE.EN;
}

function createUiTextBundle(locale) {
  const normalizedLocale = normalizeUiLocale(locale);
  return cloneValue(UI_TEXT_BUNDLES[normalizedLocale]);
}

function resolvePhaseLabel(phase, locale) {
  const normalizedLocale = normalizeUiLocale(locale);
  const bundle = UI_TEXT_BUNDLES[normalizedLocale];
  const phaseLabel = bundle.phaseLabels[phase];

  if (typeof phaseLabel === 'string' && phaseLabel.length > 0) {
    return phaseLabel;
  }

  return typeof phase === 'string' ? phase : '';
}

function createOptionLabelModel(locale) {
  const normalizedLocale = normalizeUiLocale(locale);
  const bundle = UI_TEXT_BUNDLES[normalizedLocale];

  return {
    locale: normalizedLocale,
    hudActions: cloneValue({
      summon: bundle.hud.summon,
      reroll: bundle.hud.reroll,
    }),
    hudOptions: cloneValue({
      timer: bundle.hud.timer,
      speed: bundle.hud.speed,
    }),
    settings: cloneValue(bundle.settings),
  };
}

module.exports = {
  UI_LOCALE,
  normalizeUiLocale,
  createUiTextBundle,
  resolvePhaseLabel,
  createOptionLabelModel,
};
