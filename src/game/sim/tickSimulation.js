"use strict";

const { computeDamage } = require("../combat/damage");
const { TARGETING_RULES, selectTarget } = require("../combat/targeting");
const {
  applyStatusWithLog,
  cleanupExpiredStatuses,
  getStatusEffects,
} = require("../combat/statusRegistry");
const { createSpawnScheduler } = require("../waves/spawnScheduler");
const { createSeededRng } = require("./seededRng");

const EPSILON = 1e-9;

function toFiniteNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp01(value) {
  return Math.max(0, Math.min(1, toFiniteNumber(value, 0)));
}

function roundTo(value, digits) {
  const precision = Math.pow(10, digits);
  return Math.round(value * precision) / precision;
}

function makeEnemyInstance(enemyId, index, stats, spawnTime) {
  const hp = Math.max(1, toFiniteNumber(stats.hp, 1));
  return {
    instanceId: `${enemyId}#${index}`,
    enemyId,
    hp,
    maxHp: hp,
    armor: toFiniteNumber(stats.armor, 0),
    resist: toFiniteNumber(stats.resist, 0),
    moveSpeed: Math.max(0, toFiniteNumber(stats.moveSpeed, 0)),
    progress: 0,
    spawnOrder: index,
    spawnTime,
    statuses: [],
    isAlive: true,
  };
}

function isAlive(enemy) {
  return Boolean(enemy) && enemy.isAlive !== false && enemy.hp > 0;
}

function killEnemy(enemy, time, eventLog) {
  if (!enemy || enemy.isAlive === false) {
    return false;
  }

  enemy.hp = 0;
  enemy.isAlive = false;
  eventLog.push({
    type: "EnemyDeath",
    time: roundTo(time, 4),
    id: enemy.instanceId,
    enemyId: enemy.enemyId,
  });
  return true;
}

function normalizeUnits(units) {
  if (!Array.isArray(units)) {
    return [];
  }

  return units.map((unit, index) => {
    const unitId = typeof unit.id === "string" && unit.id.length > 0 ? unit.id : `unit_${index + 1}`;
    return {
      id: unitId,
      atk: Math.max(0, toFiniteNumber(unit.atk, 0)),
      atkSpeed: Math.max(0, toFiniteNumber(unit.atkSpeed, 0)),
      damageType: typeof unit.damageType === "string" ? unit.damageType : "physical",
      critChance: clamp01(unit.critChance),
      critMultiplier: Math.max(1, toFiniteNumber(unit.critMultiplier, 1.5)),
      targeting:
        typeof unit.targeting === "string" ? unit.targeting : TARGETING_RULES.FRONT_MOST,
      onHitStatuses: Array.isArray(unit.onHitStatuses) ? [...unit.onHitStatuses] : [],
      nextAttackAt: Math.max(0, toFiniteNumber(unit.initialAttackAt, 0)),
    };
  });
}

function processBurnEffects(enemy, now, eventLog) {
  if (!isAlive(enemy) || !Array.isArray(enemy.statuses)) {
    return;
  }

  for (const status of enemy.statuses) {
    if (status.statusId !== "burn") {
      continue;
    }
    const tickInterval = Math.max(EPSILON, toFiniteNumber(status.tickInterval, 1));
    while (
      status.nextTickAt !== null &&
      status.nextTickAt <= now + EPSILON &&
      status.nextTickAt < status.expiresAt + EPSILON &&
      isAlive(enemy)
    ) {
      const burnDamage = Math.max(0, toFiniteNumber(status.potency, 0));
      enemy.hp -= burnDamage;
      eventLog.push({
        type: "Damage",
        time: roundTo(status.nextTickAt, 4),
        srcId: status.sourceId || "status:burn",
        dstId: enemy.instanceId,
        amount: roundTo(burnDamage, 4),
        isCrit: false,
        tags: ["burn", "magic"],
      });

      if (enemy.hp <= 0) {
        killEnemy(enemy, status.nextTickAt, eventLog);
      }
      status.nextTickAt = roundTo(status.nextTickAt + tickInterval, 6);
    }
  }
}

function applyOnHitStatuses(unit, target, now, rng, eventLog) {
  for (const statusConfig of unit.onHitStatuses) {
    if (!statusConfig || typeof statusConfig.statusId !== "string") {
      continue;
    }

    const chance = clamp01(statusConfig.chance === undefined ? 1 : statusConfig.chance);
    if (rng() > chance) {
      continue;
    }

    applyStatusWithLog({
      target,
      statusId: statusConfig.statusId,
      now: roundTo(now, 4),
      sourceId: unit.id,
      duration: statusConfig.duration,
      potency: statusConfig.potency,
      eventLog,
    });
  }
}

function runTickSimulation(config) {
  const options = config || {};
  const tickSeconds = Math.max(EPSILON, toFiniteNumber(options.tickSeconds, 0.1));
  const durationSeconds = Math.max(0, toFiniteNumber(options.durationSeconds, 10));
  const waveNumber = Math.max(1, Math.floor(toFiniteNumber(options.waveNumber, 1)));
  const enemyCatalog = options.enemyCatalog && typeof options.enemyCatalog === "object" ? options.enemyCatalog : {};
  const scheduler = createSpawnScheduler(options.spawnEvents || []);
  const rng = typeof options.rng === "function" ? options.rng : createSeededRng(options.seed || 1);
  const units = normalizeUnits(options.units);

  const eventLog = [
    {
      type: "WaveStart",
      time: 0,
      waveNumber,
    },
  ];
  const enemies = [];
  const enemyCounters = Object.create(null);

  function spawnEnemy(spawn) {
    const enemyId = spawn.enemyId;
    enemyCounters[enemyId] = (enemyCounters[enemyId] || 0) + 1;
    const spawnOrder = enemyCounters[enemyId];
    const enemyStats = enemyCatalog[enemyId] || {};
    const instance = makeEnemyInstance(enemyId, spawnOrder, enemyStats, spawn.time);
    enemies.push(instance);
    eventLog.push({
      type: "Spawn",
      time: roundTo(spawn.time, 4),
      enemyId,
      instanceId: instance.instanceId,
    });
  }

  let now = 0;
  for (now = 0; now <= durationSeconds + EPSILON; now = roundTo(now + tickSeconds, 6)) {
    const dueSpawns = scheduler.popDue(now);
    for (const spawn of dueSpawns) {
      spawnEnemy(spawn);
    }

    for (const enemy of enemies) {
      if (!isAlive(enemy)) {
        continue;
      }

      cleanupExpiredStatuses(enemy, now);
      processBurnEffects(enemy, now, eventLog);
      cleanupExpiredStatuses(enemy, now);
      if (!isAlive(enemy)) {
        continue;
      }

      const effects = getStatusEffects(enemy, now);
      if (!effects.hasStun) {
        enemy.progress += enemy.moveSpeed * effects.slowMultiplier * tickSeconds;
      }
    }

    for (const unit of units) {
      if (unit.atk <= 0 || unit.atkSpeed <= 0) {
        continue;
      }
      const interval = 1 / unit.atkSpeed;

      while (unit.nextAttackAt <= now + EPSILON) {
        const candidates = enemies.filter(isAlive);
        if (candidates.length === 0) {
          unit.nextAttackAt = roundTo(unit.nextAttackAt + interval, 6);
          break;
        }

        const target = selectTarget(candidates, unit.targeting, rng);
        if (!target) {
          unit.nextAttackAt = roundTo(unit.nextAttackAt + interval, 6);
          continue;
        }

        const damageResult = computeDamage(
          {
            rawDamage: unit.atk,
            damageType: unit.damageType,
            armor: target.armor,
            resist: target.resist,
            critChance: unit.critChance,
            critMultiplier: unit.critMultiplier,
          },
          rng
        );

        target.hp -= damageResult.finalDamage;
        eventLog.push({
          type: "Damage",
          time: roundTo(now, 4),
          srcId: unit.id,
          dstId: target.instanceId,
          amount: roundTo(damageResult.finalDamage, 4),
          isCrit: damageResult.isCrit,
          tags: [damageResult.damageType],
        });

        if (isAlive(target)) {
          applyOnHitStatuses(unit, target, now, rng, eventLog);
        }

        if (target.hp <= 0) {
          killEnemy(target, now, eventLog);
        }

        unit.nextAttackAt = roundTo(unit.nextAttackAt + interval, 6);
      }
    }

    if (scheduler.isFinished() && enemies.every((enemy) => !isAlive(enemy))) {
      break;
    }
  }

  return {
    eventLog,
    finalState: {
      time: roundTo(now, 4),
      enemies: enemies.map((enemy) => ({
        instanceId: enemy.instanceId,
        enemyId: enemy.enemyId,
        hp: roundTo(Math.max(0, enemy.hp), 4),
        isAlive: isAlive(enemy),
        progress: roundTo(enemy.progress, 4),
      })),
    },
  };
}

module.exports = {
  runTickSimulation,
};
