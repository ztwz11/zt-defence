'use strict';

function toFiniteNumber(value, fallback) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function sortByTimeStable(eventLog) {
  return eventLog
    .map((event, index) => ({
      event,
      index,
      time: toFiniteNumber(event?.time, 0),
    }))
    .sort((a, b) => {
      if (a.time !== b.time) {
        return a.time - b.time;
      }

      return a.index - b.index;
    });
}

function mapSimulationEvent(event, eventIndex) {
  const source = event && typeof event === 'object' ? event : {};
  return {
    eventIndex,
    time: toFiniteNumber(source.time, 0),
    type: typeof source.type === 'string' ? source.type : 'Unknown',
    payload: { ...source },
  };
}

function createHeadlessRenderAdapter() {
  function consumeSimulationEvents(simulationResult) {
    const eventLog = Array.isArray(simulationResult?.eventLog)
      ? simulationResult.eventLog
      : [];
    const frames = [];
    const events = [];
    let activeFrame = null;

    for (const sortedEntry of sortByTimeStable(eventLog)) {
      const renderEvent = mapSimulationEvent(sortedEntry.event, events.length);

      if (!activeFrame || activeFrame.time !== renderEvent.time) {
        activeFrame = {
          frameIndex: frames.length,
          time: renderEvent.time,
          events: [],
        };
        frames.push(activeFrame);
      }

      activeFrame.events.push(renderEvent);
      events.push(renderEvent);
    }

    return {
      frames,
      events,
    };
  }

  return {
    consumeSimulationEvents,
  };
}

module.exports = {
  createHeadlessRenderAdapter,
};

