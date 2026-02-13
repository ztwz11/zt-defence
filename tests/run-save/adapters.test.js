'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  deserializeProfile,
  deserializeRunHistory,
  deserializeRunSave,
  profileSaveAdapter,
  runHistoryAdapter,
  runSaveAdapter,
  serializeProfile,
  serializeRunHistory,
  serializeRunSave,
} = require('../../src/game/save');

function createProfilePayload() {
  return {
    saveVersion: '1.0.0',
    contentVersion: '0.1.0',
    updatedAt: '2026-02-13T12:00:00Z',
    playerId: 'local-profile',
    metaCurrencies: {
      medal: 12,
      supply: 8,
      bonsikExp: 34,
    },
    upgrades: [
      { id: 'wall_hp_1', level: 1 },
      { id: 'start_gold_1', level: 2 },
    ],
    unlockedContent: {
      units: ['knight_sword', 'archer'],
      relics: ['relic_bonus_gold'],
      chapters: ['chapter_1'],
    },
    settings: {
      sfx: true,
      vibration: true,
      lowFxMode: false,
    },
  };
}

function createRunSavePayload() {
  return {
    saveVersion: '1.0.0',
    contentVersion: '0.1.0',
    updatedAt: '2026-02-13T12:34:00Z',
    runId: 'run_20260213_001',
    runSeed: 123456789,
    chapterId: 'chapter_1',
    phase: 'Prepare',
    waveNumber: 3,
    gateHp: 18,
    gold: 14,
    boardUnits: [],
    benchUnits: [],
    relics: ['relic_bonus_gold'],
    activeSynergies: [],
    rngState: {
      algo: 'xorshift32',
      state: 987654321,
    },
    eventLogCursor: 420,
    stats: {
      kills: 51,
      totalDamage: 1240,
      leaks: 2,
    },
  };
}

function createRunHistoryPayload() {
  return {
    saveVersion: '1.0.0',
    contentVersion: '0.1.0',
    updatedAt: '2026-02-13T12:35:00Z',
    entries: [
      {
        runId: 'run_20260213_001',
        runSeed: 123456789,
        chapterId: 'chapter_1',
        reachedWave: 5,
        result: 'fail',
        durationSec: 621,
        highestDpsUnitId: 'archer',
        metaRewards: {
          medal: 12,
          supply: 3,
        },
        finishedAt: '2026-02-13T12:35:00Z',
      },
    ],
  };
}

test('profile adapter roundtrip serialize/deserialize', () => {
  const payload = createProfilePayload();
  const serialized = serializeProfile(payload);
  assert.equal(serialized.ok, true);

  const deserialized = deserializeProfile(serialized.value);
  assert.equal(deserialized.ok, true);
  assert.deepEqual(deserialized.value, payload);
});

test('run_save adapter roundtrip serialize/deserialize', () => {
  const payload = createRunSavePayload();
  const serialized = serializeRunSave(payload);
  assert.equal(serialized.ok, true);

  const deserialized = deserializeRunSave(serialized.value);
  assert.equal(deserialized.ok, true);
  assert.deepEqual(deserialized.value, payload);
});

test('run_history adapter roundtrip serialize/deserialize', () => {
  const payload = createRunHistoryPayload();
  const serialized = serializeRunHistory(payload);
  assert.equal(serialized.ok, true);

  const deserialized = deserializeRunHistory(serialized.value);
  assert.equal(deserialized.ok, true);
  assert.deepEqual(deserialized.value, payload);
});

test('run_save adapter requires valid phase enum', () => {
  const payload = createRunSavePayload();
  payload.phase = 'Lobby';

  const result = runSaveAdapter.validate(payload);
  assert.equal(result.ok, false);
  assert.equal(result.error.code, 'INVALID_RUN_PHASE');
});

test('run_save adapter requires runSeed', () => {
  const payload = createRunSavePayload();
  delete payload.runSeed;

  const result = runSaveAdapter.validate(payload);
  assert.equal(result.ok, false);
  assert.equal(result.error.code, 'INVALID_RUN_SEED');
});

test('run_history adapter requires runSeed on each entry', () => {
  const payload = createRunHistoryPayload();
  delete payload.entries[0].runSeed;

  const result = runHistoryAdapter.validate(payload);
  assert.equal(result.ok, false);
  assert.equal(result.error.code, 'INVALID_RUN_SEED');
});

test('save adapter warns for saveVersion minor mismatch', () => {
  const payload = createProfilePayload();
  payload.saveVersion = '1.2.0';

  const result = profileSaveAdapter.deserialize(payload, {
    expectedSaveVersion: '1.0.0',
  });

  assert.equal(result.ok, true);
  assert.equal(result.warnings.length, 1);
  assert.equal(result.warnings[0].code, 'SAVE_VERSION_MINOR_MISMATCH');
});

test('save adapter blocks saveVersion major mismatch', () => {
  const payload = createProfilePayload();
  payload.saveVersion = '2.0.0';

  const result = profileSaveAdapter.deserialize(payload, {
    expectedSaveVersion: '1.0.0',
  });

  assert.equal(result.ok, false);
  assert.equal(result.error.code, 'SAVE_VERSION_INCOMPATIBLE');
});
