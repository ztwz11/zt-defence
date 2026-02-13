'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');

const {
  readJsonFile,
  stringifyJson,
  writeJsonFile,
} = require('../../src/game/save');

const TMP_DIR = path.join(__dirname, '.tmp');
const ROUNDTRIP_FILE = path.join(TMP_DIR, 'roundtrip.json');
const INVALID_JSON_FILE = path.join(TMP_DIR, 'invalid.json');
const CIRCULAR_JSON_FILE = path.join(TMP_DIR, 'circular.json');

test('writeJsonFile/readJsonFile roundtrip without throw-only behavior', async (context) => {
  context.after(async () => {
    await fs.rm(ROUNDTRIP_FILE, { force: true });
    await fs.rm(TMP_DIR, { recursive: true, force: true });
  });

  const payload = {
    saveVersion: '1.0.0',
    contentVersion: '0.1.0',
    updatedAt: '2026-02-13T12:00:00Z',
  };

  const writeResult = await writeJsonFile(ROUNDTRIP_FILE, payload);
  assert.equal(writeResult.ok, true);

  const readResult = await readJsonFile(ROUNDTRIP_FILE);
  assert.equal(readResult.ok, true);
  assert.deepEqual(readResult.value, payload);
});

test('readJsonFile returns safe parse error object', async (context) => {
  context.after(async () => {
    await fs.rm(INVALID_JSON_FILE, { force: true });
    await fs.rm(TMP_DIR, { recursive: true, force: true });
  });

  await fs.mkdir(TMP_DIR, { recursive: true });
  await fs.writeFile(INVALID_JSON_FILE, '{invalid json', 'utf8');

  const result = await readJsonFile(INVALID_JSON_FILE);
  assert.equal(result.ok, false);
  assert.equal(result.error.code, 'FILE_PARSE_ERROR');
  assert.equal(result.error.details.parseError.code, 'JSON_PARSE_ERROR');
});

test('writeJsonFile returns safe stringify error object', async (context) => {
  context.after(async () => {
    await fs.rm(CIRCULAR_JSON_FILE, { force: true });
    await fs.rm(TMP_DIR, { recursive: true, force: true });
  });

  const circular = {};
  circular.self = circular;

  const result = await writeJsonFile(CIRCULAR_JSON_FILE, circular);
  assert.equal(result.ok, false);
  assert.equal(result.error.code, 'JSON_STRINGIFY_ERROR');
});

test('stringifyJson supports disabling trailing newline', () => {
  const result = stringifyJson({ ok: true }, { trailingNewline: false });
  assert.equal(result.ok, true);
  assert.equal(result.value.endsWith('\n'), false);
});
