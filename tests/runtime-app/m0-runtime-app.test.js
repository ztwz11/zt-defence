'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { RUNTIME_EVENT } = require('../../src/runtime');
const { createM0RuntimeApp } = require('../../src/main/runtime/app');

function createChapterContext(overrides) {
  return {
    chapterId: 'chapter_runtime_app',
    runSeed: 424242,
    waveNumber: 1,
    maxWaves: 3,
    gateHp: 20,
    maxGateHp: 20,
    gold: 5,
    summonCost: 4,
    rerollCost: 2,
    rewards: [{ type: 'Gold', amount: 1 }],
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
    ...overrides,
  };
}

function createFrameworkBridges() {
  return {
    phaserScene: {
      runPhaseCalls: 0,
      simulationCalls: 0,
      resultCalls: 0,
      onRunPhase(payload) {
        this.runPhaseCalls += 1;
        this.lastRunPhase = payload;
      },
      onSimulationEvent(payload) {
        this.simulationCalls += 1;
        this.lastSimulation = payload;
      },
      onResult(payload) {
        this.resultCalls += 1;
        this.lastResult = payload;
      },
    },
    reactHud: {
      runPhaseCalls: 0,
      hudUpdateCalls: 0,
      resultCalls: 0,
      onRuntimeRunPhase(payload) {
        this.runPhaseCalls += 1;
        this.lastRunPhase = payload;
      },
      onRuntimeHudUpdate(payload) {
        this.hudUpdateCalls += 1;
        this.lastHudUpdate = payload;
      },
      onRuntimeResult(payload) {
        this.resultCalls += 1;
        this.lastResult = payload;
      },
    },
  };
}

test('runWave returns payload and emitted event summary', () => {
  let phaserRunPhaseCalls = 0;
  let reactHudCalls = 0;
  let resultCalls = 0;

  const app = createM0RuntimeApp({
    callbacks: {
      phaser: {
        onRunPhase() {
          phaserRunPhaseCalls += 1;
        },
      },
      react: {
        onHudUpdate() {
          reactHudCalls += 1;
        },
        onResult() {
          resultCalls += 1;
        },
      },
    },
  });

  const result = app.runWave(createChapterContext());

  assert.equal(result.ok, true);
  assert.equal(result.value.payload.summary.waveNumber, 1);
  assert.ok(result.value.eventSummary.totalEvents > 0);
  assert.equal(result.value.eventSummary.byEventName[RUNTIME_EVENT.RESULT], 1);
  assert.ok(phaserRunPhaseCalls > 0);
  assert.ok(reactHudCalls > 0);
  assert.ok(resultCalls > 0);

  app.dispose();
});

test('framework bindings connect runtime bridge events to phaser/react objects', () => {
  const bridges = createFrameworkBridges();
  const app = createM0RuntimeApp({
    frameworkBindings: {
      phaser: {
        scene: bridges.phaserScene,
      },
      react: {
        hud: bridges.reactHud,
      },
    },
  });

  const result = app.runWave(createChapterContext());
  assert.equal(result.ok, true);

  assert.ok(bridges.phaserScene.runPhaseCalls > 0);
  assert.ok(bridges.phaserScene.simulationCalls > 0);
  assert.equal(bridges.phaserScene.resultCalls, 1);

  assert.ok(bridges.reactHud.runPhaseCalls > 0);
  assert.ok(bridges.reactHud.hudUpdateCalls > 0);
  assert.equal(bridges.reactHud.resultCalls, 1);

  const snapshotsBeforeDispose = app.getFrameworkBindingSnapshots();
  assert.equal(snapshotsBeforeDispose.phaser.connected, true);
  assert.equal(snapshotsBeforeDispose.react.connected, true);
  assert.equal(snapshotsBeforeDispose.phaser.resultEventCount, 1);
  assert.equal(snapshotsBeforeDispose.react.resultEventCount, 1);

  app.dispose();

  const snapshotsAfterDispose = app.getFrameworkBindingSnapshots();
  assert.equal(snapshotsAfterDispose.phaser.connected, false);
  assert.equal(snapshotsAfterDispose.react.connected, false);
});

test('runSession is deterministic for the same seed and context', () => {
  const context = createChapterContext();
  const appA = createM0RuntimeApp();
  const appB = createM0RuntimeApp();

  const runA = appA.runSession(context, { maxWaves: 3 });
  const runB = appB.runSession(context, { maxWaves: 3 });

  assert.equal(runA.ok, true);
  assert.equal(runB.ok, true);
  assert.deepEqual(runA.value, runB.value);

  appA.dispose();
  appB.dispose();
});

test('runSession reaches terminal status within maxWaves', () => {
  const app = createM0RuntimeApp();
  const result = app.runSession(createChapterContext(), { maxWaves: 3 });

  assert.equal(result.ok, true);
  assert.notEqual(result.value.finalStatus, 'continue');
  assert.ok(result.value.finalStatus === 'clear' || result.value.finalStatus === 'fail');
  assert.ok(result.value.waveSnapshots.length >= 1);
  assert.ok(result.value.waveSnapshots.length <= 3);
  assert.equal(result.value.finalResult.summary.status, result.value.finalStatus);
  assert.ok(result.value.reachedWave <= 3);

  app.dispose();
});
