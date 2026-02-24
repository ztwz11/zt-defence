#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const { createRunOrchestrationService } = require('../../src/main');
const { buildBalanceChapterContext } = require('../balance/chapter-presets');

const WATCH_DIRECTORIES = [
  path.resolve(__dirname, '../../src'),
  path.resolve(__dirname, '../../content'),
  path.resolve(__dirname, '../../assets/meta'),
];

function normalizeArgKey(rawKey) {
  return String(rawKey || '')
    .trim()
    .replace(/^--/, '')
    .toLowerCase();
}

function parseCliArgs(argv) {
  const parsed = {};

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) {
      continue;
    }

    const equalIndex = token.indexOf('=');
    if (equalIndex >= 0) {
      const key = normalizeArgKey(token.slice(0, equalIndex));
      const value = token.slice(equalIndex + 1);
      parsed[key] = value;
      continue;
    }

    const key = normalizeArgKey(token);
    const next = argv[index + 1];
    if (next && !next.startsWith('--')) {
      parsed[key] = next;
      index += 1;
      continue;
    }

    parsed[key] = true;
  }

  return parsed;
}

function getArgValue(parsedArgs, aliases, fallback) {
  for (const alias of aliases) {
    if (Object.prototype.hasOwnProperty.call(parsedArgs, alias)) {
      return parsedArgs[alias];
    }
  }
  return fallback;
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

function createPreviewContext(parsedArgs) {
  const chapterId = String(getArgValue(parsedArgs, ['chapter', 'chapter-id'], 'chapter_1'));
  const runSeed = toNonNegativeInteger(getArgValue(parsedArgs, ['run-seed', 'seed'], 2026), 2026);
  const waveNumber = toPositiveInteger(getArgValue(parsedArgs, ['wave', 'wave-number'], 1), 1);
  const maxWaves = Math.max(
    waveNumber,
    toPositiveInteger(getArgValue(parsedArgs, ['max-waves', 'wave-max'], 20), 20)
  );

  const chapterContext = buildBalanceChapterContext({
    chapterId,
    runSeed,
    waveMax: maxWaves,
  });

  return {
    ...chapterContext,
    runSeed,
    waveNumber,
    maxWaves,
    simulation: {
      ...chapterContext.simulation,
      waveNumber,
      seed: runSeed + waveNumber - 1,
    },
  };
}

function summarizeRenderBinding(resultValue) {
  const renderEvents = Array.isArray(resultValue?.render?.events) ? resultValue.render.events : [];
  const firstBoundEvent = renderEvents.find((event) => event && event.renderBinding);
  if (!firstBoundEvent) {
    return '[render] no renderBinding attached events in this slice';
  }

  const binding = firstBoundEvent.renderBinding;
  return `[render] unit=${binding.unitId} runtimeUnit=${binding.runtimeUnitId} animation=${binding.animation} key=${binding.animationKey}`;
}

function printRunResult(result, chapterContext) {
  if (!result.ok) {
    const error = result.error || {};
    console.error(
      `[dev] run failed chapter=${chapterContext.chapterId} seed=${chapterContext.runSeed} wave=${chapterContext.waveNumber} code=${error.code || 'UNKNOWN'}`
    );
    if (error.message) {
      console.error(`[dev] ${error.message}`);
    }
    return false;
  }

  const value = result.value;
  const summary = value.summary || {};
  console.log(
    `[dev] chapter=${summary.chapterId} seed=${value.runSeed} wave=${summary.waveNumber} status=${summary.status} phase=${summary.phase}`
  );
  console.log(
    `[dev] gateHp=${summary.gateHp} gold=${summary.gold} kills=${summary.killCount} damage=${summary.totalDamage}`
  );
  console.log(
    `[dev] renderFrames=${Array.isArray(value.render?.frames) ? value.render.frames.length : 0} renderEvents=${Array.isArray(value.render?.events) ? value.render.events.length : 0}`
  );
  console.log(summarizeRenderBinding(value));
  return true;
}

function runPreview(parsedArgs) {
  const chapterContext = createPreviewContext(parsedArgs);
  const service = createRunOrchestrationService();
  const result = service.runWaveSlice(chapterContext);
  return printRunResult(result, chapterContext);
}

function startWatch(parsedArgs) {
  console.log('[dev] watch mode enabled');
  runPreview(parsedArgs);

  const activeWatchers = [];
  let debounceTimer = null;

  function triggerPreview(changedPath) {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }
    debounceTimer = setTimeout(() => {
      console.log(`[dev] change detected: ${changedPath}`);
      runPreview(parsedArgs);
    }, 120);
  }

  for (const watchPath of WATCH_DIRECTORIES) {
    if (!fs.existsSync(watchPath)) {
      continue;
    }

    const watcher = fs.watch(watchPath, { recursive: true }, (_eventType, fileName) => {
      if (!fileName) {
        return;
      }
      triggerPreview(path.join(watchPath, String(fileName)));
    });
    activeWatchers.push(watcher);
  }

  if (activeWatchers.length === 0) {
    console.log('[dev] no watch paths available; running once only');
    return;
  }

  function shutdown() {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
    for (const watcher of activeWatchers) {
      watcher.close();
    }
    console.log('[dev] watch stopped');
  }

  process.on('SIGINT', () => {
    shutdown();
    process.exit(0);
  });
  process.on('SIGTERM', () => {
    shutdown();
    process.exit(0);
  });
}

function main() {
  const parsedArgs = parseCliArgs(process.argv.slice(2));
  const watchMode = getArgValue(parsedArgs, ['watch', 'w'], false) === true;

  if (watchMode) {
    startWatch(parsedArgs);
    return;
  }

  const ok = runPreview(parsedArgs);
  if (!ok) {
    process.exitCode = 1;
  }
}

main();
