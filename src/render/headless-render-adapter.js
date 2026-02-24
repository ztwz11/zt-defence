'use strict';

function toFiniteNumber(value, fallback) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function cloneValue(value) {
  if (Array.isArray(value)) {
    return value.map(cloneValue);
  }

  if (!isPlainObject(value)) {
    return value;
  }

  const clone = {};
  const keys = Object.keys(value);
  for (const key of keys) {
    clone[key] = cloneValue(value[key]);
  }

  return clone;
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

function resolveSourceUnitRuntimeId(event) {
  if (!isPlainObject(event)) {
    return '';
  }

  if (typeof event.srcId === 'string' && event.srcId.length > 0) {
    return event.srcId;
  }

  if (typeof event.sourceId === 'string' && event.sourceId.length > 0) {
    return event.sourceId;
  }

  return '';
}

function resolveSuggestedAnimation(eventType) {
  const normalizedType = typeof eventType === 'string' ? eventType : '';

  if (normalizedType === 'Damage' || normalizedType === 'StatusApply') {
    return 'attack';
  }
  if (normalizedType === 'StatusExpired' || normalizedType === 'StatusTick') {
    return 'hit';
  }
  if (normalizedType === 'UnitDeath') {
    return 'die';
  }
  if (normalizedType === 'WaveStart' || normalizedType === 'Spawn') {
    return 'idle';
  }

  return 'idle';
}

function resolveRenderBinding(event, runtimeUnitVisualMap) {
  const map = isPlainObject(runtimeUnitVisualMap) ? runtimeUnitVisualMap : {};
  const runtimeUnitId = resolveSourceUnitRuntimeId(event);
  if (!runtimeUnitId) {
    return null;
  }

  const unitVisual = map[runtimeUnitId];
  if (!isPlainObject(unitVisual) || !isPlainObject(unitVisual.renderAssets)) {
    return null;
  }

  const animation = resolveSuggestedAnimation(event?.type);
  const selectedAsset = isPlainObject(unitVisual.renderAssets[animation])
    ? unitVisual.renderAssets[animation]
    : isPlainObject(unitVisual.renderAssets.idle)
      ? unitVisual.renderAssets.idle
      : null;
  if (!selectedAsset) {
    return null;
  }

  return {
    runtimeUnitId,
    unitId: typeof unitVisual.unitId === 'string' ? unitVisual.unitId : runtimeUnitId,
    unitName: typeof unitVisual.name === 'string' ? unitVisual.name : runtimeUnitId,
    animation,
    animationKey: selectedAsset.key,
    sheetPath: selectedAsset.sheetPath,
    metaPath: selectedAsset.metaPath,
  };
}

function mapSimulationEvent(event, eventIndex, renderContext) {
  const source = event && typeof event === 'object' ? event : {};
  const renderBinding = resolveRenderBinding(source, renderContext?.runtimeUnitVisualMap);
  return {
    eventIndex,
    time: toFiniteNumber(source.time, 0),
    type: typeof source.type === 'string' ? source.type : 'Unknown',
    payload: { ...source },
    ...(renderBinding ? { renderBinding } : {}),
  };
}

function createHeadlessRenderAdapter() {
  function consumeSimulationEvents(simulationResult, renderContext) {
    const eventLog = Array.isArray(simulationResult?.eventLog)
      ? simulationResult.eventLog
      : [];
    const frames = [];
    const events = [];
    let activeFrame = null;

    for (const sortedEntry of sortByTimeStable(eventLog)) {
      const renderEvent = mapSimulationEvent(sortedEntry.event, events.length, renderContext);

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
      runtimeUnitVisualMap: cloneValue(renderContext?.runtimeUnitVisualMap || {}),
    };
  }

  return {
    consumeSimulationEvents,
  };
}

module.exports = {
  createHeadlessRenderAdapter,
};
