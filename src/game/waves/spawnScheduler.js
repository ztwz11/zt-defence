"use strict";

const EPSILON = 1e-9;

function toFiniteNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function expandSpawnEvents(spawnEvents) {
  if (!Array.isArray(spawnEvents)) {
    return [];
  }

  const expanded = [];
  for (let batchIndex = 0; batchIndex < spawnEvents.length; batchIndex += 1) {
    const event = spawnEvents[batchIndex] || {};
    const enemyId = event.enemyId;
    if (typeof enemyId !== "string" || enemyId.length === 0) {
      continue;
    }

    const count = Math.max(0, Math.floor(toFiniteNumber(event.count, 0)));
    const startTime = Math.max(0, toFiniteNumber(event.time, 0));
    const interval = Math.max(0, toFiniteNumber(event.interval, 0));

    for (let sequenceIndex = 0; sequenceIndex < count; sequenceIndex += 1) {
      expanded.push({
        time: startTime + interval * sequenceIndex,
        enemyId,
        batchIndex,
        sequenceIndex,
      });
    }
  }

  expanded.sort((a, b) => {
    if (a.time !== b.time) {
      return a.time - b.time;
    }
    if (a.batchIndex !== b.batchIndex) {
      return a.batchIndex - b.batchIndex;
    }
    return a.sequenceIndex - b.sequenceIndex;
  });

  return expanded;
}

function createSpawnScheduler(spawnEvents) {
  const schedule = expandSpawnEvents(spawnEvents);
  let cursor = 0;

  function popDue(currentTime) {
    const due = [];
    const time = toFiniteNumber(currentTime, 0);
    while (cursor < schedule.length && schedule[cursor].time <= time + EPSILON) {
      due.push(schedule[cursor]);
      cursor += 1;
    }
    return due;
  }

  function peekNextTime() {
    if (cursor >= schedule.length) {
      return null;
    }
    return schedule[cursor].time;
  }

  function isFinished() {
    return cursor >= schedule.length;
  }

  function remaining() {
    return schedule.length - cursor;
  }

  return {
    popDue,
    peekNextTime,
    isFinished,
    remaining,
  };
}

module.exports = {
  expandSpawnEvents,
  createSpawnScheduler,
};
