#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');

const { createRunOrchestrationService } = require('../src/main');
const {
  deserializeRunHistory,
  deserializeRunSave,
  readJsonFile,
  serializeRunHistory,
  serializeRunSave,
  writeJsonFile,
} = require('../src/game/save');

const TMP_DIR = path.join(__dirname, '.tmp', 'release-readiness');
const RUN_SAVE_FILE = path.join(TMP_DIR, 'run-save.roundtrip.json');
const RUN_HISTORY_FILE = path.join(TMP_DIR, 'run-history.roundtrip.json');
const FIXED_TIMESTAMP = '2026-02-13T00:00:00Z';

function createChapterContext() {
  return {
    chapterId: 'chapter_1',
    runSeed: 424242,
    waveNumber: 2,
    maxWaves: 5,
    gateHp: 20,
    maxGateHp: 20,
    gold: 5,
    economyConfig: {
      waveStartGold: 2,
      waveClearBonusGold: 3,
      interest: {
        enabled: false,
      },
      costs: {
        summon: 4,
        reroll: {
          base: 2,
          increasePerUse: 1,
        },
      },
    },
    rewards: [{ type: 'Gold', amount: 4 }],
    simulation: {
      tickSeconds: 0.5,
      durationSeconds: 5,
      spawnEvents: [{ time: 0, enemyId: 'goblin', count: 1, interval: 0 }],
      enemyCatalog: {
        goblin: {
          hp: 8,
          armor: 0,
          resist: 0,
          moveSpeed: 0.1,
        },
      },
      units: [
        {
          id: 'archer_1',
          atk: 10,
          atkSpeed: 1.5,
          damageType: 'physical',
          targeting: 'frontMost',
          critChance: 0,
          critMultiplier: 1.5,
        },
      ],
    },
  };
}

function createRunSavePayload(runResult, chapterContext) {
  const hud = runResult.hud || {};
  const summary = runResult.summary || {};
  const simulation = runResult.simulation || {};
  const eventLog = Array.isArray(simulation.eventLog) ? simulation.eventLog : [];
  const finalWave = Number.isInteger(summary.nextWaveNumber)
    ? summary.nextWaveNumber
    : chapterContext.waveNumber;

  return {
    saveVersion: '1.0.0',
    contentVersion: '0.1.0',
    updatedAt: FIXED_TIMESTAMP,
    runId: 'run_smoke_001',
    runSeed: chapterContext.runSeed,
    chapterId: chapterContext.chapterId,
    phase: runResult.phase,
    waveNumber: finalWave,
    gateHp: Number(hud.gateHp ?? summary.gateHp ?? chapterContext.gateHp),
    gold: Number(hud.gold ?? summary.gold ?? chapterContext.gold),
    boardUnits: [],
    benchUnits: [],
    relics: Array.isArray(hud.relics) ? hud.relics.slice() : [],
    activeSynergies: Array.isArray(hud.synergyCounts) ? hud.synergyCounts.slice() : [],
    rngState: {
      algo: 'xorshift32',
      state: chapterContext.runSeed >>> 0,
    },
    eventLogCursor: eventLog.length,
    stats: {
      kills: Number(summary.killCount ?? 0),
      totalDamage: Number(summary.totalDamage ?? 0),
      leaks: Number(summary.leaks ?? 0),
    },
  };
}

function createRunHistoryPayload(runSavePayload, runResult) {
  const summary = runResult.summary || {};
  return {
    saveVersion: '1.0.0',
    contentVersion: '0.1.0',
    updatedAt: FIXED_TIMESTAMP,
    entries: [
      {
        runId: runSavePayload.runId,
        runSeed: runSavePayload.runSeed,
        chapterId: runSavePayload.chapterId,
        reachedWave: Number(summary.nextWaveNumber ?? runSavePayload.waveNumber),
        result: summary.status === 'fail' ? 'fail' : 'clear',
        durationSec: 0,
        highestDpsUnitId: 'archer_1',
        metaRewards: {
          medal: 0,
          supply: 0,
        },
        finishedAt: FIXED_TIMESTAMP,
      },
    ],
  };
}

function assertAdapterRoundTrip(label, payload, serialize, deserialize) {
  const serialized = serialize(payload);
  assert.equal(serialized.ok, true, `${label} serialize should succeed`);

  const deserialized = deserialize(serialized.value);
  assert.equal(deserialized.ok, true, `${label} deserialize should succeed`);
  assert.deepEqual(deserialized.value, payload, `${label} payload should roundtrip`);
}

async function assertJsonRoundTrip(filePath, payload) {
  const writeResult = await writeJsonFile(filePath, payload);
  assert.equal(writeResult.ok, true, `writeJsonFile should succeed for ${filePath}`);

  const readResult = await readJsonFile(filePath);
  assert.equal(readResult.ok, true, `readJsonFile should succeed for ${filePath}`);
  assert.deepEqual(readResult.value, payload, `${filePath} payload should roundtrip`);
}

async function main() {
  console.log('[smoke] Running deterministic replay/save checks');
  await fs.mkdir(TMP_DIR, { recursive: true });

  try {
    const service = createRunOrchestrationService();
    const chapterContext = createChapterContext();

    const firstRun = service.runWaveSlice(chapterContext);
    const secondRun = service.runWaveSlice(chapterContext);

    assert.equal(firstRun.ok, true, 'first runWaveSlice call should succeed');
    assert.equal(secondRun.ok, true, 'second runWaveSlice call should succeed');
    assert.deepEqual(
      firstRun.value,
      secondRun.value,
      'runWaveSlice must be deterministic for identical input'
    );

    const runSavePayload = createRunSavePayload(firstRun.value, chapterContext);
    assertAdapterRoundTrip(
      'run_save',
      runSavePayload,
      serializeRunSave,
      deserializeRunSave
    );
    await assertJsonRoundTrip(RUN_SAVE_FILE, runSavePayload);

    const runHistoryPayload = createRunHistoryPayload(runSavePayload, firstRun.value);
    assertAdapterRoundTrip(
      'run_history',
      runHistoryPayload,
      serializeRunHistory,
      deserializeRunHistory
    );
    await assertJsonRoundTrip(RUN_HISTORY_FILE, runHistoryPayload);

    console.log('[smoke] Deterministic replay/save checks passed');
  } finally {
    await fs.rm(TMP_DIR, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error('[smoke] Deterministic replay/save checks failed');
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});
