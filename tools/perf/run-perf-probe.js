#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const { runTickSimulation } = require('../../src/game/sim/tickSimulation');
const { createRunOrchestrationService, createM0SessionCoordinator } = require('../../src/main');
const { calculateStats } = require('./stats');
const { DEFAULT_THRESHOLDS, normalizeThresholdEnvelope } = require('./threshold-checker');

const DEFAULT_ITERATIONS = 200;
const DEFAULT_PROFILE = 'ci-mobile-baseline';

function toPositiveInteger(value, fallback) {
  if (value === null || value === undefined || value === '') {
    return fallback;
  }
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }
  return Math.max(1, Math.floor(numeric));
}

function parseArgs(argv) {
  let iterations = DEFAULT_ITERATIONS;
  let profile = DEFAULT_PROFILE;
  let outputPath = null;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--help' || arg === '-h') {
      return {
        help: true,
        iterations,
        profile,
        outputPath,
      };
    }

    if (arg.startsWith('--iterations=')) {
      iterations = toPositiveInteger(arg.slice('--iterations='.length), NaN);
      continue;
    }

    if (arg === '--iterations') {
      const nextValue = argv[index + 1];
      iterations = toPositiveInteger(nextValue, NaN);
      index += 1;
      continue;
    }

    if (arg.startsWith('--output=')) {
      outputPath = arg.slice('--output='.length).trim();
      continue;
    }

    if (arg === '--output') {
      outputPath = (argv[index + 1] || '').trim();
      index += 1;
      continue;
    }

    if (arg.startsWith('--profile=')) {
      profile = arg.slice('--profile='.length).trim();
      continue;
    }

    if (arg === '--profile') {
      profile = (argv[index + 1] || '').trim();
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  if (!Number.isFinite(iterations) || iterations < 1) {
    throw new Error('Invalid --iterations value. Expected a positive integer.');
  }

  if (outputPath !== null && outputPath.length === 0) {
    throw new Error('Invalid --output value. Expected a non-empty file path.');
  }

  if (profile.length === 0) {
    throw new Error('Invalid --profile value. Expected a non-empty profile name.');
  }

  return {
    help: false,
    iterations,
    profile,
    outputPath,
  };
}

function printHelp() {
  const usage = [
    'Usage: node tools/perf/run-perf-probe.js [options]',
    '',
    'Options:',
    `  --iterations=<n>   Number of iterations per operation (default: ${DEFAULT_ITERATIONS})`,
    `  --profile=<name>   Threshold profile tag included in output (default: ${DEFAULT_PROFILE})`,
    '  --output=<path>    Optional JSON output file path',
    '  --help             Show this help message',
  ];

  process.stdout.write(`${usage.join('\n')}\n`);
}

function createTickSimulationScenario() {
  return {
    waveNumber: 2,
    tickSeconds: 0.5,
    durationSeconds: 5,
    seed: 12345,
    spawnEvents: [{ time: 0, enemyId: 'goblin', count: 1, interval: 0 }],
    enemyCatalog: {
      goblin: {
        hp: 12,
        armor: 0,
        resist: 0,
        moveSpeed: 0.2,
      },
    },
    units: [
      {
        id: 'archer_1',
        atk: 6,
        atkSpeed: 2,
        damageType: 'physical',
        targeting: 'frontMost',
        critChance: 0,
        critMultiplier: 1.5,
        onHitStatuses: [
          {
            statusId: 'burn',
            chance: 1,
            duration: 3,
            potency: 2,
          },
        ],
      },
    ],
  };
}

function createRunSliceContext() {
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

function createRunSessionContext() {
  return {
    chapterId: 'chapter_1',
    runSeed: 424242,
    waveNumber: 1,
    maxWaves: 3,
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
    rewards: [{ type: 'Gold', amount: 1 }],
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

function assertSimulationResult(result, operationName) {
  if (!result || !Array.isArray(result.eventLog) || !result.finalState) {
    throw new Error(`${operationName} returned an invalid simulation payload`);
  }
}

function assertOkResult(result, operationName) {
  if (!result || result.ok !== true) {
    const code = result && result.error && result.error.code ? result.error.code : 'UNKNOWN';
    throw new Error(`${operationName} failed (code=${code})`);
  }
}

function createOperations() {
  const runOrchestrationService = createRunOrchestrationService();
  const sessionCoordinator = createM0SessionCoordinator();
  const tickScenario = createTickSimulationScenario();
  const runSliceContext = createRunSliceContext();
  const runSessionContext = createRunSessionContext();

  return [
    {
      operation: 'tickSimulation',
      execute() {
        const result = runTickSimulation(tickScenario);
        assertSimulationResult(result, 'tickSimulation');
      },
    },
    {
      operation: 'runWaveSlice',
      execute() {
        const result = runOrchestrationService.runWaveSlice(runSliceContext);
        assertOkResult(result, 'runWaveSlice');
      },
    },
    {
      operation: 'runSessionShort',
      execute() {
        const result = sessionCoordinator.runSession(runSessionContext, {
          maxSlices: 2,
        });
        assertOkResult(result, 'runSessionShort');
      },
    },
  ];
}

function measureOperation(operationDefinition, iterations) {
  const samples = [];
  operationDefinition.execute();

  for (let index = 0; index < iterations; index += 1) {
    const startedAt = process.hrtime.bigint();
    operationDefinition.execute();
    const endedAt = process.hrtime.bigint();
    samples.push(Number(endedAt - startedAt) / 1e6);
  }

  return {
    operation: operationDefinition.operation,
    iterations,
    stats: calculateStats(samples),
  };
}

function resolveThresholdVersion(thresholdConfig) {
  const envelope = normalizeThresholdEnvelope(thresholdConfig);
  if (typeof envelope.version === 'string' && envelope.version.length > 0) {
    return envelope.version;
  }
  return null;
}

function loadDefaultThresholdConfig() {
  const defaultThresholdPath = path.join(__dirname, 'default-thresholds.json');
  try {
    const raw = fs.readFileSync(defaultThresholdPath, 'utf8');
    return JSON.parse(raw);
  } catch (error) {
    return DEFAULT_THRESHOLDS;
  }
}

function runPerfProbe(options) {
  const iterations = toPositiveInteger(options?.iterations, DEFAULT_ITERATIONS);
  const profile =
    typeof options?.profile === 'string' && options.profile.trim()
      ? options.profile.trim()
      : DEFAULT_PROFILE;
  const thresholdVersion =
    typeof options?.thresholdVersion === 'string' && options.thresholdVersion.trim()
      ? options.thresholdVersion.trim()
      : resolveThresholdVersion(loadDefaultThresholdConfig());
  const operations = createOperations();
  const operationReports = operations.map((operationDefinition) =>
    measureOperation(operationDefinition, iterations)
  );

  return {
    reportVersion: 1,
    generatedAt: new Date().toISOString(),
    iterations,
    profile,
    thresholdVersion,
    operations: operationReports,
  };
}

function writeReportFile(outputPath, report) {
  const resolvedPath = path.resolve(process.cwd(), outputPath);
  const directoryPath = path.dirname(resolvedPath);
  fs.mkdirSync(directoryPath, { recursive: true });
  fs.writeFileSync(resolvedPath, JSON.stringify(report, null, 2));
  return resolvedPath;
}

function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.stderr.write('Use --help to see supported options.\n');
    process.exit(1);
  }

  if (args.help) {
    printHelp();
    return;
  }

  try {
    const report = runPerfProbe({
      iterations: args.iterations,
      profile: args.profile,
    });

    if (args.outputPath) {
      const savedPath = writeReportFile(args.outputPath, report);
      process.stderr.write(`[perf-probe] Wrote report to ${savedPath}\n`);
    }

    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } catch (error) {
    process.stderr.write('[perf-probe] Probe failed\n');
    process.stderr.write(`${error && error.stack ? error.stack : error}\n`);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  DEFAULT_PROFILE,
  createOperations,
  loadDefaultThresholdConfig,
  parseArgs,
  resolveThresholdVersion,
  runPerfProbe,
};
