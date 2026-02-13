'use strict';

const BOARD_WIDTH = 5;
const BOARD_HEIGHT = 4;

function createBoardError(code, detail) {
  const error = new Error(code);
  error.code = code;
  if (detail) {
    error.detail = detail;
  }
  return error;
}

function toNumber(value, fallback) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function normalizeCoordinate(slotOrX, y) {
  if (slotOrX && typeof slotOrX === 'object' && y === undefined) {
    return {
      x: toNumber(slotOrX.x, Number.NaN),
      y: toNumber(slotOrX.y, Number.NaN),
    };
  }

  return {
    x: toNumber(slotOrX, Number.NaN),
    y: toNumber(y, Number.NaN),
  };
}

function ensureValidSlot(slot) {
  const x = Math.floor(slot.x);
  const y = Math.floor(slot.y);
  const isValid = Number.isInteger(x) && Number.isInteger(y) && x >= 0 && x < BOARD_WIDTH && y >= 0 && y < BOARD_HEIGHT;
  if (!isValid) {
    throw createBoardError('BOARD_SLOT_OUT_OF_RANGE', { slot });
  }
  return { x, y };
}

function cloneUnit(unit) {
  if (!unit || typeof unit !== 'object') {
    return { unitId: unit };
  }

  const next = { ...unit };
  if (next.slot && typeof next.slot === 'object') {
    next.slot = { ...next.slot };
  }
  return next;
}

function cloneUnits(units) {
  if (!Array.isArray(units)) {
    return [];
  }
  return units.map(cloneUnit);
}

function normalizeBoard(board) {
  if (Array.isArray(board)) {
    return {
      width: BOARD_WIDTH,
      height: BOARD_HEIGHT,
      units: cloneUnits(board),
    };
  }

  const base = board && typeof board === 'object' ? board : {};
  return {
    ...base,
    width: BOARD_WIDTH,
    height: BOARD_HEIGHT,
    units: cloneUnits(base.units),
  };
}

function withBoardUnits(board, units) {
  const nextBoard = normalizeBoard(board);
  nextBoard.units = units;
  return nextBoard;
}

function findUnitIndexBySlot(units, slot) {
  return units.findIndex((unit) => unit?.slot?.x === slot.x && unit?.slot?.y === slot.y);
}

function listBoardUnits(board) {
  const normalized = normalizeBoard(board);
  return normalized.units
    .filter((unit) => unit && unit.slot && Number.isInteger(unit.slot.x) && Number.isInteger(unit.slot.y))
    .sort((a, b) => {
      if (a.slot.y !== b.slot.y) {
        return a.slot.y - b.slot.y;
      }
      if (a.slot.x !== b.slot.x) {
        return a.slot.x - b.slot.x;
      }
      const aKey = String(a.instanceId ?? a.unitId ?? '');
      const bKey = String(b.instanceId ?? b.unitId ?? '');
      return aKey.localeCompare(bKey);
    });
}

function createBoard(initialUnits) {
  let board = withBoardUnits({}, []);
  if (!Array.isArray(initialUnits)) {
    return board;
  }

  for (const unit of initialUnits) {
    if (!unit || typeof unit !== 'object' || !unit.slot) {
      continue;
    }
    board = placeUnit(board, unit, unit.slot);
  }

  return board;
}

function placeUnit(board, unit, slotOrX, y) {
  const normalized = normalizeBoard(board);
  const slot = ensureValidSlot(normalizeCoordinate(slotOrX, y));
  if (findUnitIndexBySlot(normalized.units, slot) >= 0) {
    throw createBoardError('BOARD_SLOT_OCCUPIED', { slot });
  }

  const unitRecord = cloneUnit(unit);
  unitRecord.slot = slot;

  return withBoardUnits(normalized, [...normalized.units, unitRecord]);
}

function parseMoveSlots(fromOrX, fromYOrTo, toOrX, toY) {
  if (fromOrX && typeof fromOrX === 'object' && fromYOrTo && typeof fromYOrTo === 'object' && toOrX === undefined) {
    return {
      from: normalizeCoordinate(fromOrX),
      to: normalizeCoordinate(fromYOrTo),
    };
  }

  return {
    from: normalizeCoordinate(fromOrX, fromYOrTo),
    to: normalizeCoordinate(toOrX, toY),
  };
}

function moveUnit(board, fromOrX, fromYOrTo, toOrX, toY) {
  const normalized = normalizeBoard(board);
  const slots = parseMoveSlots(fromOrX, fromYOrTo, toOrX, toY);
  const from = ensureValidSlot(slots.from);
  const to = ensureValidSlot(slots.to);

  const fromIndex = findUnitIndexBySlot(normalized.units, from);
  if (fromIndex < 0) {
    throw createBoardError('BOARD_SLOT_EMPTY', { slot: from });
  }

  if (findUnitIndexBySlot(normalized.units, to) >= 0) {
    throw createBoardError('BOARD_SLOT_OCCUPIED', { slot: to });
  }

  const nextUnits = cloneUnits(normalized.units);
  nextUnits[fromIndex] = {
    ...nextUnits[fromIndex],
    slot: to,
  };

  return withBoardUnits(normalized, nextUnits);
}

function removeUnit(board, slotOrX, y) {
  const normalized = normalizeBoard(board);
  const slot = ensureValidSlot(normalizeCoordinate(slotOrX, y));
  const index = findUnitIndexBySlot(normalized.units, slot);
  if (index < 0) {
    return withBoardUnits(normalized, normalized.units);
  }

  const nextUnits = cloneUnits(normalized.units);
  nextUnits.splice(index, 1);
  return withBoardUnits(normalized, nextUnits);
}

function parseSwapSlots(aOrX, aYOrB, bOrX, bY) {
  if (aOrX && typeof aOrX === 'object' && aYOrB && typeof aYOrB === 'object' && bOrX === undefined) {
    return {
      left: normalizeCoordinate(aOrX),
      right: normalizeCoordinate(aYOrB),
    };
  }

  return {
    left: normalizeCoordinate(aOrX, aYOrB),
    right: normalizeCoordinate(bOrX, bY),
  };
}

function swapUnits(board, aOrX, aYOrB, bOrX, bY) {
  const normalized = normalizeBoard(board);
  const slots = parseSwapSlots(aOrX, aYOrB, bOrX, bY);
  const left = ensureValidSlot(slots.left);
  const right = ensureValidSlot(slots.right);

  const leftIndex = findUnitIndexBySlot(normalized.units, left);
  const rightIndex = findUnitIndexBySlot(normalized.units, right);
  if (leftIndex < 0 || rightIndex < 0) {
    throw createBoardError('BOARD_SLOT_EMPTY', {
      left,
      right,
    });
  }

  const nextUnits = cloneUnits(normalized.units);
  const leftUnit = nextUnits[leftIndex];
  const rightUnit = nextUnits[rightIndex];

  nextUnits[leftIndex] = {
    ...rightUnit,
    slot: left,
  };

  nextUnits[rightIndex] = {
    ...leftUnit,
    slot: right,
  };

  return withBoardUnits(normalized, nextUnits);
}

module.exports = {
  BOARD_WIDTH,
  BOARD_HEIGHT,
  createBoard,
  placeUnit,
  moveUnit,
  removeUnit,
  swapUnits,
  listBoardUnits,
  ...require('./merge'),
};

