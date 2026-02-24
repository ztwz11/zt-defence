#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { URL } = require('node:url');

const { createRunOrchestrationService } = require('../../src/main');
const { buildBalanceChapterContext } = require('../balance/chapter-presets');

const WEB_ROOT = path.resolve(__dirname, './web');

const MIME_BY_EXT = Object.freeze({
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
});

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

function pickText(value, fallback) {
  if (typeof value !== 'string') {
    return fallback;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : fallback;
}

function jsonResponse(response, statusCode, payload) {
  const body = JSON.stringify(payload, null, 2);
  response.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  });
  response.end(body);
}

function createRunContextFromQuery(query) {
  const chapterId = pickText(query.get('chapter'), 'chapter_1');
  const runSeed = toNonNegativeInteger(query.get('seed'), 2026);
  const waveNumber = toPositiveInteger(query.get('wave'), 1);
  const maxWaves = Math.max(
    waveNumber,
    toPositiveInteger(query.get('maxWaves') || query.get('waveMax'), 20)
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

function summarizeRunResult(result) {
  if (!result || result.ok !== true) {
    return {
      ok: false,
      error: result?.error || {
        code: 'RUN_FAILED',
        message: 'runWaveSlice failed',
      },
    };
  }

  const payload = result.value || {};
  const summary = payload.summary || {};
  const hud = payload.hud || {};
  const render = payload.render || {};
  const events = Array.isArray(render.events) ? render.events : [];
  const frames = Array.isArray(render.frames) ? render.frames : [];

  return {
    ok: true,
    value: {
      summary,
      hud,
      render: {
        frameCount: frames.length,
        eventCount: events.length,
        runtimeUnitVisualMap: render.runtimeUnitVisualMap || {},
        events: events.slice(0, 40),
      },
      diagnostics: {
        firstBoundEvent:
          events.find((event) => event && event.renderBinding)?.renderBinding || null,
      },
    },
  };
}

function safeJoinWebPath(urlPathname) {
  const normalized = path
    .normalize(urlPathname)
    .replace(/^(\.\.[/\\])+/, '')
    .replace(/^[/\\]+/, '');
  const targetPath = path.resolve(WEB_ROOT, normalized);
  if (!targetPath.startsWith(WEB_ROOT)) {
    return null;
  }
  return targetPath;
}

function serveStaticFile(response, filePath) {
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    jsonResponse(response, 404, {
      ok: false,
      error: {
        code: 'NOT_FOUND',
        message: `asset not found: ${filePath}`,
      },
    });
    return;
  }

  const ext = path.extname(filePath).toLowerCase();
  response.writeHead(200, {
    'content-type': MIME_BY_EXT[ext] || 'application/octet-stream',
    'cache-control': 'no-store',
  });
  fs.createReadStream(filePath).pipe(response);
}

function createServer(options) {
  const config = options && typeof options === 'object' ? options : {};
  const runOrchestrationService =
    config.runOrchestrationService &&
    typeof config.runOrchestrationService.runWaveSlice === 'function'
      ? config.runOrchestrationService
      : createRunOrchestrationService();

  return http.createServer((request, response) => {
    const requestUrl = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`);

    if (requestUrl.pathname === '/api/health') {
      jsonResponse(response, 200, {
        ok: true,
        service: 'zt-defence-dev-web',
      });
      return;
    }

    if (requestUrl.pathname === '/api/run') {
      try {
        const chapterContext = createRunContextFromQuery(requestUrl.searchParams);
        const runResult = runOrchestrationService.runWaveSlice(chapterContext);
        const summarized = summarizeRunResult(runResult);
        jsonResponse(response, summarized.ok ? 200 : 500, summarized);
      } catch (error) {
        jsonResponse(response, 500, {
          ok: false,
          error: {
            code: 'DEV_SERVER_RUN_ERROR',
            message: error && error.message ? error.message : String(error),
          },
        });
      }
      return;
    }

    const staticPath =
      requestUrl.pathname === '/'
        ? path.join(WEB_ROOT, 'index.html')
        : safeJoinWebPath(requestUrl.pathname);
    if (!staticPath) {
      jsonResponse(response, 400, {
        ok: false,
        error: {
          code: 'INVALID_PATH',
          message: 'path traversal is not allowed',
        },
      });
      return;
    }

    serveStaticFile(response, staticPath);
  });
}

function runDryMode(parsedArgs) {
  const query = new URLSearchParams();
  query.set('chapter', pickText(getArgValue(parsedArgs, ['chapter', 'chapter-id'], 'chapter_1'), 'chapter_1'));
  query.set('seed', String(toNonNegativeInteger(getArgValue(parsedArgs, ['seed', 'run-seed'], 2026), 2026)));
  query.set('wave', String(toPositiveInteger(getArgValue(parsedArgs, ['wave', 'wave-number'], 1), 1)));
  query.set(
    'maxWaves',
    String(toPositiveInteger(getArgValue(parsedArgs, ['max-waves', 'wave-max'], 20), 20))
  );

  const service = createRunOrchestrationService();
  const chapterContext = createRunContextFromQuery(query);
  const runResult = summarizeRunResult(service.runWaveSlice(chapterContext));
  if (!runResult.ok) {
    console.error('[dev:web] dry-run failed');
    console.error(runResult.error);
    process.exitCode = 1;
    return;
  }

  const summary = runResult.value.summary || {};
  const render = runResult.value.render || {};
  console.log(
    `[dev:web] dry-run ok chapter=${summary.chapterId} seed=${chapterContext.runSeed} wave=${summary.waveNumber} status=${summary.status}`
  );
  console.log(`[dev:web] render frameCount=${render.frameCount} eventCount=${render.eventCount}`);
}

function main() {
  const parsedArgs = parseCliArgs(process.argv.slice(2));
  if (getArgValue(parsedArgs, ['dry-run', 'check'], false) === true) {
    runDryMode(parsedArgs);
    return;
  }

  const host = pickText(getArgValue(parsedArgs, ['host'], '127.0.0.1'), '127.0.0.1');
  const port = toPositiveInteger(getArgValue(parsedArgs, ['port', 'p'], 5173), 5173);
  const server = createServer({});

  server.listen(port, host, () => {
    console.log(`[dev:web] server running at http://${host}:${port}`);
    console.log('[dev:web] open the URL in your browser');
    console.log('[dev:web] api example: /api/run?chapter=chapter_1&seed=2026&wave=1&maxWaves=20');
  });
}

main();
