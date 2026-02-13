'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { fail, ok } = require('./result');

function toErrorCause(error) {
  if (!error || typeof error !== 'object') {
    return {
      message: String(error),
    };
  }

  return {
    name: error.name || 'Error',
    message: error.message || String(error),
    code: error.code,
  };
}

function parseJson(text, source) {
  const name = typeof source === 'string' ? source : 'json';
  if (typeof text !== 'string') {
    return fail('INVALID_JSON_INPUT', `${name} must be a JSON string`, {
      source: name,
      actualType: typeof text,
    });
  }

  try {
    return ok(JSON.parse(text));
  } catch (error) {
    return fail('JSON_PARSE_ERROR', `invalid JSON in ${name}`, {
      source: name,
      cause: toErrorCause(error),
    });
  }
}

function stringifyJson(value, options) {
  const settings = options || {};
  const space = Number.isInteger(settings.space) ? settings.space : 2;
  const trailingNewline = settings.trailingNewline !== false;

  try {
    const serialized = JSON.stringify(value, null, space);
    if (typeof serialized !== 'string') {
      return fail('JSON_STRINGIFY_ERROR', 'JSON serialization produced no string', {
        reason: 'empty_result',
      });
    }

    return ok(trailingNewline ? `${serialized}\n` : serialized);
  } catch (error) {
    return fail('JSON_STRINGIFY_ERROR', 'failed to serialize JSON payload', {
      cause: toErrorCause(error),
    });
  }
}

async function readJsonFile(filePath, options) {
  const settings = options || {};
  const encoding = typeof settings.encoding === 'string' ? settings.encoding : 'utf8';

  try {
    const fileText = await fs.readFile(filePath, { encoding });
    const parseResult = parseJson(fileText, filePath);
    if (!parseResult.ok) {
      return fail('FILE_PARSE_ERROR', parseResult.error.message, {
        path: filePath,
        parseError: parseResult.error,
      });
    }

    return ok(parseResult.value);
  } catch (error) {
    return fail('FILE_READ_ERROR', `failed to read JSON file: ${filePath}`, {
      path: filePath,
      cause: toErrorCause(error),
    });
  }
}

async function writeJsonFile(filePath, value, options) {
  const settings = options || {};
  const ensureDir = settings.ensureDir !== false;
  const encoding = typeof settings.encoding === 'string' ? settings.encoding : 'utf8';

  const stringifyResult = stringifyJson(value, settings);
  if (!stringifyResult.ok) {
    return stringifyResult;
  }

  try {
    if (ensureDir) {
      await fs.mkdir(path.dirname(filePath), { recursive: true });
    }

    await fs.writeFile(filePath, stringifyResult.value, { encoding });
    return ok({
      path: filePath,
      bytes: Buffer.byteLength(stringifyResult.value, encoding),
    });
  } catch (error) {
    return fail('FILE_WRITE_ERROR', `failed to write JSON file: ${filePath}`, {
      path: filePath,
      cause: toErrorCause(error),
    });
  }
}

module.exports = {
  parseJson,
  stringifyJson,
  readJsonFile,
  writeJsonFile,
};
