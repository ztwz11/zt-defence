'use strict';

const { applyWaveIncome, getActionCost } = require('../game/economy');
const { evaluateRelicEffects } = require('../game/relics');
const { applyReward } = require('../game/rewards');
const { RUN_PHASE } = require('../game/run');
const { runTickSimulation } = require('../game/sim/tickSimulation');
const { createHeadlessRenderAdapter } = require('../render/headless-render-adapter');
const { createRunStateStore } = require('../ui/run-state-store');

function ok(value) {
  return {
    ok: true,
    value,
  };
}

function fail(code, message, details) {
  return {
    ok: false,
    error: {
      code,
      message,
      details,
    },
  };
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function toFiniteNumber(value, fallback) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function toPositiveInteger(value, fallback) {
  return Math.max(1, Math.floor(toFiniteNumber(value, fallback)));
}

function toNonNegativeInteger(value, fallback) {
  return Math.max(0, Math.floor(toFiniteNumber(value, fallback)));
}

function roundTo(value, digits) {
  const precision = Math.pow(10, digits);
  return Math.round(value * precision) / precision;
}

function cloneArray(value) {
  return Array.isArray(value) ? value.slice() : [];
}

function normalizeRewardList(rewardInput) {
  if (Array.isArray(rewardInput)) {
    return rewardInput.slice();
  }

  if (isPlainObject(rewardInput)) {
    return [rewardInput];
  }

  return [];
}

function normalizeChapterContext(chapterContext) {
  const source = isPlainObject(chapterContext) ? chapterContext : {};
  const chapterId =
    typeof source.chapterId === 'string' && source.chapterId.length > 0
      ? source.chapterId
      : 'chapter_1';
  const runSeed = Math.floor(toFiniteNumber(source.runSeed, 1));
  const waveNumber = toPositiveInteger(source.waveNumber, 1);
  const maxWaves = Math.max(waveNumber, toPositiveInteger(source.maxWaves, waveNumber));
  const baseGateHp = Math.max(0, toFiniteNumber(source.gateHp, 20));
  const maxGateHp = Math.max(baseGateHp, toFiniteNumber(source.maxGateHp, baseGateHp));
  const relics = cloneArray(source.relics);
  const relicModifiers = evaluateRelicEffects(relics);
  const economyConfig = isPlainObject(source.economyConfig)
    ? source.economyConfig
    : isPlainObject(source.economy)
      ? source.economy
      : {};
  const rewardContext = isPlainObject(source.rewardContext)
    ? source.rewardContext
    : isPlainObject(source.rewardSelection)
      ? source.rewardSelection
      : {};
  const baseState = {
    phase: RUN_PHASE.PREPARE,
    waveNumber,
    gateHp: baseGateHp,
    gold: Math.max(0, toFiniteNumber(source.gold, 0)),
    summonCost: 0,
    rerollCost: 0,
    synergyCounts: cloneArray(source.synergyCounts),
    relics,
  };
  const rerollCount = toNonNegativeInteger(source.rerollCount, 0);

  const derivedState = {
    ...baseState,
    rerollCount,
    relicModifiers,
  };

  const derivedSummonCost = getActionCost(derivedState, 'summon', economyConfig);
  const derivedRerollCost = getActionCost(derivedState, 'reroll', economyConfig);

  baseState.summonCost =
    source.summonCost === undefined
      ? derivedSummonCost
      : Math.max(0, toFiniteNumber(source.summonCost, derivedSummonCost));
  baseState.rerollCost =
    source.rerollCost === undefined
      ? derivedRerollCost
      : Math.max(0, toFiniteNumber(source.rerollCost, derivedRerollCost));

  return {
    chapterId,
    runSeed,
    waveNumber,
    maxWaves,
    maxGateHp,
    economyConfig,
    rewards: normalizeRewardList(source.rewards ?? source.reward),
    rewardContext,
    simulationConfig: isPlainObject(source.simulation) ? { ...source.simulation } : {},
    isBossWave: source.isBossWave === true,
    baseState,
  };
}

function startRunFromChapterContext(chapterContext) {
  const normalized = normalizeChapterContext(chapterContext);
  const store = createRunStateStore(normalized.baseState);

  return {
    chapterId: normalized.chapterId,
    runSeed: normalized.runSeed,
    waveNumber: normalized.waveNumber,
    maxWaves: normalized.maxWaves,
    maxGateHp: normalized.maxGateHp,
    economyConfig: normalized.economyConfig,
    rewards: normalized.rewards,
    rewardContext: normalized.rewardContext,
    simulationConfig: normalized.simulationConfig,
    isBossWave: normalized.isBossWave,
    store,
  };
}

function buildSimulationConfig(runContext) {
  const simulationConfig = { ...runContext.simulationConfig };

  if (simulationConfig.waveNumber === undefined) {
    simulationConfig.waveNumber = runContext.waveNumber;
  }

  if (simulationConfig.seed === undefined) {
    simulationConfig.seed = runContext.runSeed + runContext.waveNumber - 1;
  }

  return simulationConfig;
}

function resolveWaveOutcome(simulationResult, gateHp) {
  const finalEnemies = Array.isArray(simulationResult?.finalState?.enemies)
    ? simulationResult.finalState.enemies
    : [];
  const aliveEnemies = finalEnemies.filter((enemy) => enemy && enemy.isAlive);
  const leaks = aliveEnemies.filter((enemy) => toFiniteNumber(enemy.progress, 0) >= 1).length;
  const nextGateHp = Math.max(0, gateHp - leaks);

  return {
    aliveEnemyCount: aliveEnemies.length,
    leaks,
    waveCleared: aliveEnemies.length === 0,
    nextGateHp,
  };
}

function updateCostsForState(state, economyConfig) {
  const relicModifiers = evaluateRelicEffects(state.relics);
  const rerollCount = toNonNegativeInteger(state.rerollCount, 0);
  const costState = {
    ...state,
    relicModifiers,
    rerollCount,
  };

  return {
    ...state,
    summonCost: getActionCost(costState, 'summon', economyConfig),
    rerollCost: getActionCost(costState, 'reroll', economyConfig),
  };
}

function summarizeSimulation(simulationResult) {
  const eventLog = Array.isArray(simulationResult?.eventLog) ? simulationResult.eventLog : [];
  let totalDamage = 0;
  let killCount = 0;

  for (const event of eventLog) {
    if (event?.type === 'Damage') {
      totalDamage += toFiniteNumber(event.amount, 0);
    } else if (event?.type === 'EnemyDeath') {
      killCount += 1;
    }
  }

  return {
    eventCount: eventLog.length,
    killCount,
    totalDamage: roundTo(totalDamage, 4),
  };
}

function createResultPayload(runContext, simulationResult, renderResult, outcome, status) {
  const finalState = runContext.store.getState();
  const hudResult = runContext.store.getHudViewModel();
  const simulationSummary = summarizeSimulation(simulationResult);
  const summary = {
    chapterId: runContext.chapterId,
    waveNumber: runContext.waveNumber,
    nextWaveNumber: finalState.waveNumber,
    status,
    phase: finalState.phase,
    cleared: outcome.waveCleared,
    leaks: outcome.leaks,
    aliveEnemyCount: outcome.aliveEnemyCount,
    gateHp: finalState.gateHp,
    gold: finalState.gold,
    ...simulationSummary,
  };

  return {
    chapterId: runContext.chapterId,
    runSeed: runContext.runSeed,
    phase: finalState.phase,
    hud: hudResult.ok ? hudResult.value : null,
    summary,
    simulation: simulationResult,
    render: renderResult,
  };
}

function applyEconomyAndRewards(runContext, options) {
  const config = isPlainObject(options) ? options : {};
  const includeRewardPhase = config.includeRewardPhase !== false;
  const combatEndState = runContext.store.getState();
  const relicModifiers = evaluateRelicEffects(combatEndState.relics);
  const withIncome = applyWaveIncome(
    {
      ...combatEndState,
      maxGateHp: runContext.maxGateHp,
      relicModifiers,
    },
    runContext.economyConfig
  );

  let nextState = updateCostsForState(withIncome, runContext.economyConfig);

  if (runContext.rewards.length > 0) {
    if (includeRewardPhase) {
      const toReward = runContext.store.enterReward();
      if (!toReward.ok) {
        return toReward;
      }
    }

    for (const reward of runContext.rewards) {
      nextState = applyReward(nextState, reward, runContext.rewardContext);
    }
    nextState = updateCostsForState(nextState, runContext.economyConfig);
  }

  const appliedState = runContext.store.setState(nextState);
  if (!appliedState.ok) {
    return appliedState;
  }

  return {
    ok: true,
    value: runContext.store.getState(),
  };
}

function createRunOrchestrationService(options) {
  const config = isPlainObject(options) ? options : {};
  const simulate =
    typeof config.simulate === 'function' ? config.simulate : runTickSimulation;
  const renderAdapter =
    config.renderAdapter && typeof config.renderAdapter.consumeSimulationEvents === 'function'
      ? config.renderAdapter
      : createHeadlessRenderAdapter();

  function runWaveSlice(chapterContext) {
    const runContext = startRunFromChapterContext(chapterContext);
    const toCombat = runContext.store.enterCombat();
    if (!toCombat.ok) {
      return fail('RUN_PHASE_TRANSITION_FAILED', 'failed to enter Combat phase', toCombat.error);
    }

    if (runContext.isBossWave) {
      const toBossIntro = runContext.store.enterBossIntro();
      if (!toBossIntro.ok) {
        return fail(
          'RUN_PHASE_TRANSITION_FAILED',
          'failed to enter BossIntro phase',
          toBossIntro.error
        );
      }

      const backToCombat = runContext.store.enterCombat();
      if (!backToCombat.ok) {
        return fail('RUN_PHASE_TRANSITION_FAILED', 'failed to re-enter Combat phase', backToCombat.error);
      }
    }

    const simulationResult = simulate(buildSimulationConfig(runContext));
    const renderResult = renderAdapter.consumeSimulationEvents(simulationResult);
    const currentState = runContext.store.getState();
    const outcome = resolveWaveOutcome(simulationResult, currentState.gateHp);
    const gateUpdate = runContext.store.setState({
      gateHp: outcome.nextGateHp,
    });

    if (!gateUpdate.ok) {
      return fail('RUN_STATE_UPDATE_FAILED', 'failed to update gate HP after combat', gateUpdate.error);
    }

    const isFinalWave = runContext.waveNumber >= runContext.maxWaves;
    if (!outcome.waveCleared || outcome.nextGateHp <= 0) {
      const toResult = runContext.store.enterResult();
      if (!toResult.ok) {
        return fail('RUN_PHASE_TRANSITION_FAILED', 'failed to enter Result phase', toResult.error);
      }

      return ok(createResultPayload(runContext, simulationResult, renderResult, outcome, 'fail'));
    }

    const rewardAndIncome = applyEconomyAndRewards(runContext, {
      includeRewardPhase: !isFinalWave,
    });
    if (!rewardAndIncome.ok) {
      return fail('RUN_STATE_UPDATE_FAILED', 'failed to apply economy/rewards', rewardAndIncome.error);
    }

    if (isFinalWave) {
      const toResult = runContext.store.enterResult();
      if (!toResult.ok) {
        return fail('RUN_PHASE_TRANSITION_FAILED', 'failed to enter Result phase', toResult.error);
      }

      return ok(createResultPayload(runContext, simulationResult, renderResult, outcome, 'clear'));
    }

    const toPrepare = runContext.store.enterPrepare();
    if (!toPrepare.ok) {
      return fail('RUN_PHASE_TRANSITION_FAILED', 'failed to enter Prepare phase', toPrepare.error);
    }

    const waveIncrement = runContext.store.setState({
      waveNumber: runContext.waveNumber + 1,
    });

    if (!waveIncrement.ok) {
      return fail('RUN_STATE_UPDATE_FAILED', 'failed to increment wave number', waveIncrement.error);
    }

    return ok(createResultPayload(runContext, simulationResult, renderResult, outcome, 'continue'));
  }

  return {
    startRun: startRunFromChapterContext,
    startRunFromChapterContext,
    runWaveSlice,
  };
}

module.exports = {
  createRunOrchestrationService,
};
