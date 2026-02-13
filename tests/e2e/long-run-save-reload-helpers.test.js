'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  deserializeRunSave,
  serializeRunSave,
} = require('../../src/game/save');
const {
  FIXED_TIMESTAMP,
  combineWavePayloads,
  compareDeterministicTraces,
  createLongRunChapterContext,
  createRunSaveCheckpoint,
  describeTraceComparison,
  restoreChapterContextFromRunSave,
  runWaveSequence,
} = require('../../tools/e2e/long-run-save-reload-helpers');

function createWavePayload(waveNumber, overrides) {
  const source = overrides && typeof overrides === 'object' ? overrides : {};
  const summaryOverride =
    source.summary && typeof source.summary === 'object' ? source.summary : {};
  const simulationOverride =
    source.simulation && typeof source.simulation === 'object'
      ? source.simulation
      : {};
  const renderOverride =
    source.render && typeof source.render === 'object' ? source.render : {};

  return {
    phase: source.phase || 'Prepare',
    summary: {
      waveNumber,
      nextWaveNumber: waveNumber + 1,
      status: 'continue',
      gateHp: 20,
      gold: 10,
      killCount: 4,
      totalDamage: 25,
      leaks: 0,
      ...summaryOverride,
    },
    simulation: {
      eventLog: [],
      ...simulationOverride,
    },
    render: {
      events: [],
      ...renderOverride,
    },
    hud: source.hud || null,
  };
}

test('createRunSaveCheckpoint produces adapter-compatible payload and restores context', () => {
  const template = createLongRunChapterContext({
    runSeed: 10101,
    maxWaves: 7,
    relics: ['relic_alpha'],
    synergyCounts: [{ synergyId: 'syn_knights', count: 1 }],
  });
  const checkpointContext = {
    ...template,
    waveNumber: 4,
    gateHp: 17,
    gold: 29,
    relics: ['relic_alpha', 'relic_beta'],
    synergyCounts: [{ synergyId: 'syn_knights', count: 3 }],
  };

  const completedWavePayloads = [
    createWavePayload(1, {
      summary: { killCount: 4, totalDamage: 22.25, leaks: 0 },
      simulation: { eventLog: [{ type: 'A' }, { type: 'B' }] },
    }),
    createWavePayload(2, {
      summary: { killCount: 5, totalDamage: 31.5, leaks: 1 },
      simulation: { eventLog: [{ type: 'C' }] },
    }),
  ];

  const payload = createRunSaveCheckpoint({
    runId: 'run_checkpoint_test',
    updatedAt: FIXED_TIMESTAMP,
    context: checkpointContext,
    completedWavePayloads,
  });

  assert.equal(payload.stats.kills, 9);
  assert.equal(payload.stats.totalDamage, 53.75);
  assert.equal(payload.stats.leaks, 1);
  assert.equal(payload.eventLogCursor, 3);

  const serialized = serializeRunSave(payload);
  assert.equal(serialized.ok, true);
  const deserialized = deserializeRunSave(serialized.value);
  assert.equal(deserialized.ok, true);

  const restored = restoreChapterContextFromRunSave(template, deserialized.value);
  assert.equal(restored.waveNumber, 4);
  assert.equal(restored.gateHp, 17);
  assert.equal(restored.gold, 29);
  assert.deepEqual(restored.relics, ['relic_alpha', 'relic_beta']);
  assert.deepEqual(restored.synergyCounts, [{ synergyId: 'syn_knights', count: 3 }]);
  assert.equal(restored.maxWaves, 7);
  assert.equal(restored.simulation.seed, 10104);
});

test('compareDeterministicTraces reports clear mismatch details', () => {
  const baseline = [
    createWavePayload(1),
    createWavePayload(2, {
      summary: { status: 'clear' },
    }),
  ];
  const candidate = [
    createWavePayload(1, {
      summary: { gold: 999 },
    }),
    createWavePayload(2, {
      summary: { status: 'clear' },
    }),
  ];

  const comparison = compareDeterministicTraces(baseline, candidate);
  assert.equal(comparison.match, false);
  assert.equal(comparison.reason, 'WAVE_TRACE_MISMATCH');
  assert.equal(comparison.waveIndex, 1);
  assert.match(describeTraceComparison(comparison), /wave=1/);
});

test('long-run resume trace matches uninterrupted baseline trace', () => {
  const chapterContext = createLongRunChapterContext({
    runSeed: 13579,
    maxWaves: 6,
  });
  const baseline = runWaveSequence({
    chapterContext,
  });
  assert.equal(baseline.ok, true);

  const firstSegment = runWaveSequence({
    chapterContext,
    maxSlices: 3,
  });
  assert.equal(firstSegment.ok, true);
  assert.equal(firstSegment.value.finalStatus, 'continue');
  assert.ok(firstSegment.value.nextContext);

  const savePayload = createRunSaveCheckpoint({
    runId: 'run_resume_test',
    updatedAt: FIXED_TIMESTAMP,
    context: firstSegment.value.nextContext,
    completedWavePayloads: firstSegment.value.wavePayloads,
  });
  const serialized = serializeRunSave(savePayload);
  assert.equal(serialized.ok, true);
  const deserialized = deserializeRunSave(serialized.value);
  assert.equal(deserialized.ok, true);

  const restoredContext = restoreChapterContextFromRunSave(
    chapterContext,
    deserialized.value
  );
  const resumedSegment = runWaveSequence({
    chapterContext: restoredContext,
  });
  assert.equal(resumedSegment.ok, true);

  const interruptedTrace = combineWavePayloads(
    firstSegment.value.wavePayloads,
    resumedSegment.value.wavePayloads
  );
  const comparison = compareDeterministicTraces(
    baseline.value.wavePayloads,
    interruptedTrace
  );
  assert.equal(comparison.match, true, describeTraceComparison(comparison));
});
