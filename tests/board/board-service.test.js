'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createBoard,
  placeUnit,
  moveUnit,
  removeUnit,
  swapUnits,
  listBoardUnits,
  BOARD_WIDTH,
  BOARD_HEIGHT,
} = require('../../src/game/board');

test('placeUnit adds a unit in-range and rejects occupied slots', () => {
  let board = createBoard();
  board = placeUnit(board, { instanceId: 'u1', unitId: 'knight', star: 1 }, { x: 0, y: 0 });
  const units = listBoardUnits(board);

  assert.equal(units.length, 1);
  assert.equal(units[0].slot.x, 0);
  assert.equal(units[0].slot.y, 0);

  assert.throws(
    () => placeUnit(board, { instanceId: 'u2', unitId: 'mage', star: 1 }, { x: 0, y: 0 }),
    (error) => error && error.code === 'BOARD_SLOT_OCCUPIED'
  );
});

test('placeUnit rejects out-of-range coordinates on a 5x4 board', () => {
  const board = createBoard();

  assert.equal(BOARD_WIDTH, 5);
  assert.equal(BOARD_HEIGHT, 4);
  assert.throws(
    () => placeUnit(board, { unitId: 'knight' }, { x: BOARD_WIDTH, y: 0 }),
    (error) => error && error.code === 'BOARD_SLOT_OUT_OF_RANGE'
  );
});

test('moveUnit changes slot and blocks moving into occupied slot', () => {
  let board = createBoard();
  board = placeUnit(board, { instanceId: 'u1', unitId: 'knight', star: 1 }, 0, 0);
  board = placeUnit(board, { instanceId: 'u2', unitId: 'mage', star: 1 }, 1, 0);

  const movedBoard = moveUnit(board, 0, 0, 0, 1);
  const movedKnight = listBoardUnits(movedBoard).find((unit) => unit.instanceId === 'u1');
  assert.deepEqual(movedKnight.slot, { x: 0, y: 1 });

  assert.throws(
    () => moveUnit(movedBoard, { x: 0, y: 1 }, { x: 1, y: 0 }),
    (error) => error && error.code === 'BOARD_SLOT_OCCUPIED'
  );
});

test('swapUnits swaps two occupied slots', () => {
  let board = createBoard();
  board = placeUnit(board, { instanceId: 'a', unitId: 'knight' }, 0, 0);
  board = placeUnit(board, { instanceId: 'b', unitId: 'archer' }, 2, 1);

  const swapped = swapUnits(board, { x: 0, y: 0 }, { x: 2, y: 1 });
  const units = listBoardUnits(swapped);
  const knight = units.find((unit) => unit.instanceId === 'a');
  const archer = units.find((unit) => unit.instanceId === 'b');

  assert.deepEqual(knight.slot, { x: 2, y: 1 });
  assert.deepEqual(archer.slot, { x: 0, y: 0 });
});

test('removeUnit removes the unit from target slot and keeps board immutable', () => {
  let board = createBoard();
  board = placeUnit(board, { instanceId: 'u1', unitId: 'knight' }, 0, 0);
  const before = listBoardUnits(board);

  const nextBoard = removeUnit(board, { x: 0, y: 0 });
  const after = listBoardUnits(nextBoard);

  assert.equal(before.length, 1);
  assert.equal(after.length, 0);
  assert.equal(listBoardUnits(board).length, 1);
});

