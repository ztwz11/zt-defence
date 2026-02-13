"use strict";

const STATUS_REGISTRY = Object.freeze({
  slow: Object.freeze({
    id: "slow",
    defaultDuration: 2,
    defaultPotency: 0.3,
    maxStacks: 1,
  }),
  stun: Object.freeze({
    id: "stun",
    defaultDuration: 0.8,
    defaultPotency: 1,
    maxStacks: 1,
  }),
  burn: Object.freeze({
    id: "burn",
    defaultDuration: 3,
    defaultPotency: 3,
    tickInterval: 1,
    maxStacks: 1,
  }),
});

function toFiniteNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function getStatusDefinition(statusId) {
  if (!STATUS_REGISTRY[statusId]) {
    throw new Error(`Unknown status: ${statusId}`);
  }
  return STATUS_REGISTRY[statusId];
}

function createStatusInstance(statusId, options) {
  const config = options || {};
  const definition = getStatusDefinition(statusId);
  const now = toFiniteNumber(config.now, 0);
  const duration = Math.max(0, toFiniteNumber(config.duration, definition.defaultDuration));
  const potency = toFiniteNumber(config.potency, definition.defaultPotency);
  const tickInterval = definition.tickInterval || null;

  return {
    statusId,
    sourceId: typeof config.sourceId === "string" ? config.sourceId : null,
    appliedAt: now,
    duration,
    expiresAt: now + duration,
    potency,
    tickInterval,
    nextTickAt: tickInterval ? now + tickInterval : null,
  };
}

function applyStatus(target, statusId, options) {
  if (!target || typeof target !== "object") {
    throw new Error("applyStatus requires a target object");
  }

  if (!Array.isArray(target.statuses)) {
    target.statuses = [];
  }

  const definition = getStatusDefinition(statusId);
  const incoming = createStatusInstance(statusId, options);
  const existingIndex = target.statuses.findIndex((status) => status.statusId === statusId);

  if (existingIndex >= 0 && definition.maxStacks === 1) {
    const current = target.statuses[existingIndex];
    current.appliedAt = incoming.appliedAt;
    current.duration = incoming.duration;
    current.expiresAt = incoming.expiresAt;
    current.potency = Math.max(current.potency, incoming.potency);
    current.sourceId = incoming.sourceId || current.sourceId;
    current.tickInterval = incoming.tickInterval;
    current.nextTickAt = incoming.nextTickAt;

    return {
      target,
      status: current,
      wasRefresh: true,
    };
  }

  target.statuses.push(incoming);
  return {
    target,
    status: incoming,
    wasRefresh: false,
  };
}

function applyStatusWithLog(params) {
  const config = params || {};
  const target = config.target;
  const statusId = config.statusId;
  const eventLog = Array.isArray(config.eventLog) ? config.eventLog : null;
  const now = toFiniteNumber(config.now, 0);
  const result = applyStatus(target, statusId, {
    now,
    sourceId: config.sourceId,
    duration: config.duration,
    potency: config.potency,
  });

  if (eventLog) {
    eventLog.push({
      type: "StatusApply",
      time: now,
      dstId: target.instanceId || target.id || "unknown",
      statusId,
      duration: result.status.duration,
      sourceId: config.sourceId || null,
      potency: result.status.potency,
    });
  }

  return result;
}

function cleanupExpiredStatuses(target, now) {
  if (!target || !Array.isArray(target.statuses)) {
    return [];
  }
  const currentTime = toFiniteNumber(now, 0);
  target.statuses = target.statuses.filter((status) => status.expiresAt > currentTime);
  return target.statuses;
}

function getStatusEffects(target, now) {
  const currentTime = toFiniteNumber(now, 0);
  const statuses = Array.isArray(target && target.statuses)
    ? target.statuses.filter((status) => status.expiresAt > currentTime)
    : [];

  let hasStun = false;
  let slowMultiplier = 1;
  const activeBurns = [];

  for (const status of statuses) {
    if (status.statusId === "stun") {
      hasStun = true;
    } else if (status.statusId === "slow") {
      const slowFactor = 1 - Math.max(0, Math.min(0.95, toFiniteNumber(status.potency, 0)));
      slowMultiplier *= slowFactor;
    } else if (status.statusId === "burn") {
      activeBurns.push(status);
    }
  }

  return {
    hasStun,
    slowMultiplier: Math.max(0.05, slowMultiplier),
    burns: activeBurns,
  };
}

module.exports = {
  STATUS_REGISTRY,
  getStatusDefinition,
  createStatusInstance,
  applyStatus,
  applyStatusWithLog,
  cleanupExpiredStatuses,
  getStatusEffects,
};
