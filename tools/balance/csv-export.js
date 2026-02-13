'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');

const DEFAULT_COLUMNS = Object.freeze([
  'runIndex',
  'seed',
  'chapterId',
  'reachedWave',
  'finalStatus',
  'clear',
  'fail',
  'waveCount',
  'kills',
  'damage',
]);

function normalizeColumns(columns) {
  if (!Array.isArray(columns) || columns.length === 0) {
    return DEFAULT_COLUMNS.slice();
  }

  return columns.filter((column) => typeof column === 'string' && column.length > 0);
}

function escapeCsvValue(value) {
  if (value === null || value === undefined) {
    return '';
  }

  const raw = String(value);
  if (raw.includes('"') || raw.includes(',') || raw.includes('\n')) {
    return `"${raw.replaceAll('"', '""')}"`;
  }
  return raw;
}

function toRunRowsCsv(rows, columns) {
  const normalizedRows = Array.isArray(rows) ? rows : [];
  const normalizedColumns = normalizeColumns(columns);
  const lines = [normalizedColumns.join(',')];

  for (const row of normalizedRows) {
    const source = row && typeof row === 'object' ? row : {};
    const values = normalizedColumns.map((column) => escapeCsvValue(source[column]));
    lines.push(values.join(','));
  }

  return `${lines.join('\n')}\n`;
}

async function writeRunRowsCsv(outputPath, rows, columns) {
  if (typeof outputPath !== 'string' || outputPath.length === 0) {
    throw new Error('CSV_OUTPUT_PATH_REQUIRED');
  }

  const csv = toRunRowsCsv(rows, columns);
  const absolutePath = path.resolve(outputPath);
  const directoryPath = path.dirname(absolutePath);
  await fs.mkdir(directoryPath, { recursive: true });
  await fs.writeFile(absolutePath, csv, 'utf8');
  return absolutePath;
}

module.exports = {
  DEFAULT_COLUMNS,
  escapeCsvValue,
  toRunRowsCsv,
  writeRunRowsCsv,
};
