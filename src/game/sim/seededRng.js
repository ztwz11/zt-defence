"use strict";

function createSeededRng(seed) {
  let state = Number(seed) >>> 0;
  if (state === 0) {
    state = 0x6d2b79f5;
  }

  return function nextRandom() {
    state ^= state << 13;
    state >>>= 0;
    state ^= state >>> 17;
    state >>>= 0;
    state ^= state << 5;
    state >>>= 0;
    return state / 0x100000000;
  };
}

module.exports = {
  createSeededRng,
};
