const STAGE_WIDTH = 1280;
const STAGE_HEIGHT = 760;

const SLOT_COLUMNS = 3;
const SLOT_ROWS = 2;
const SLOT_X_START = 250;
const SLOT_Y_START = 210;
const SLOT_X_GAP = 170;
const SLOT_Y_GAP = 190;

const BENCH_Y = 690;
const BENCH_START_X = 150;
const BENCH_GAP = 130;

const ENEMY_SPAWN_X = 1180;
const ENEMY_TARGET_X = 760;

function buildSlotPositions() {
  const positions = [];
  for (let row = 0; row < SLOT_ROWS; row += 1) {
    for (let column = 0; column < SLOT_COLUMNS; column += 1) {
      positions.push({
        x: SLOT_X_START + column * SLOT_X_GAP,
        y: SLOT_Y_START + row * SLOT_Y_GAP,
      });
    }
  }
  return Object.freeze(positions);
}

const SLOT_POSITIONS = buildSlotPositions();

function normalizeString(value, fallback = '') {
  if (typeof value !== 'string') {
    return fallback;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : fallback;
}

function toFiniteNumber(value, fallback) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function toNonNegativeInteger(value, fallback = 0) {
  return Math.max(0, Math.floor(toFiniteNumber(value, fallback)));
}

function shortName(name, fallback) {
  const source = normalizeString(name, fallback);
  if (source.length <= 8) {
    return source;
  }
  return `${source.slice(0, 8)}…`;
}

function hashCode(value) {
  const source = normalizeString(value, '0');
  let hash = 0;
  for (let index = 0; index < source.length; index += 1) {
    hash = ((hash << 5) - hash + source.charCodeAt(index)) | 0;
  }
  return Math.abs(hash);
}

function resolveEnemyLaneY(enemyInstanceId) {
  const lanes = [130, 200, 270, 340, 410];
  return lanes[hashCode(enemyInstanceId) % lanes.length];
}

function createBenchPosition(index) {
  return {
    x: BENCH_START_X + index * BENCH_GAP,
    y: BENCH_Y,
  };
}

function isSlotIndex(value) {
  return Number.isInteger(value) && value >= 0 && value < SLOT_POSITIONS.length;
}

function pickSlotByPosition(x, y) {
  let best = null;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (let index = 0; index < SLOT_POSITIONS.length; index += 1) {
    const slot = SLOT_POSITIONS[index];
    const distance = Math.hypot(slot.x - x, slot.y - y);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = index;
    }
  }

  return bestDistance <= 74 ? best : null;
}

function resolveRarityColor(unitDef) {
  const rarity = normalizeString(unitDef?.rarity, 'T1');
  if (rarity === 'T3') {
    return 0xffd46b;
  }
  if (rarity === 'T2') {
    return 0x7fd8ff;
  }
  return 0x95c66f;
}

function resolveLevelText(upgradeLevel) {
  const level = toNonNegativeInteger(upgradeLevel, 0) + 1;
  return `Lv.${level}`;
}

function buildTokenVisual(scene, unitDef, upgradeLevel) {
  const container = scene.add.container(0, 0);
  const rarityColor = resolveRarityColor(unitDef);

  const frame = scene.add.rectangle(0, -8, 96, 98, 0x000000, 0);
  frame.setStrokeStyle(2, rarityColor, 0.92);

  const levelBadge = scene.add.rectangle(0, -56, 50, 18, 0x11222f, 0.92);
  levelBadge.setStrokeStyle(1, 0x78d9c0, 0.65);
  levelBadge.name = 'levelBadge';

  const levelLabel = scene.add.text(0, -56, resolveLevelText(upgradeLevel), {
    fontFamily: 'SUIT Variable, Pretendard, sans-serif',
    fontSize: '11px',
    color: '#b9fff1',
    fontStyle: 'bold',
  });
  levelLabel.setOrigin(0.5, 0.5);
  levelLabel.name = 'levelLabel';

  container.add(frame);

  if (normalizeString(unitDef?.id) === 'hero_chibi_01' && scene.textures.exists('hero_chibi_01_idle')) {
    const sprite = scene.add.sprite(0, -10, 'hero_chibi_01_idle', 0);
    sprite.setScale(0.12);
    if (scene.anims.exists('hero_chibi_01_idle_loop')) {
      sprite.play('hero_chibi_01_idle_loop');
    }
    container.add(sprite);
  } else {
    const icon = scene.add.circle(0, -10, 33, rarityColor, 0.25);
    icon.setStrokeStyle(2, rarityColor, 0.85);
    const labelCore = scene.add.text(0, -10, shortName(unitDef?.name, unitDef?.id || '유닛'), {
      fontFamily: 'SUIT Variable, Pretendard, sans-serif',
      fontSize: '12px',
      color: '#e9fcff',
      align: 'center',
      wordWrap: { width: 62 },
    });
    labelCore.setOrigin(0.5, 0.5);
    container.add(icon);
    container.add(labelCore);
  }

  const nameLabel = scene.add.text(0, 44, shortName(unitDef?.name, unitDef?.id || '유닛'), {
    fontFamily: 'SUIT Variable, Pretendard, sans-serif',
    fontSize: '11px',
    color: '#d6e6ef',
  });
  nameLabel.setOrigin(0.5, 0.5);
  nameLabel.name = 'nameLabel';

  container.add(levelBadge);
  container.add(levelLabel);
  container.add(nameLabel);

  container.setSize(100, 112);
  container.setDepth(10);
  container.setInteractive(
    new window.Phaser.Geom.Rectangle(-50, -56, 100, 112),
    window.Phaser.Geom.Rectangle.Contains
  );

  return container;
}

function updateTokenVisual(token, unitDef, upgradeLevel) {
  if (!token) {
    return;
  }

  const levelLabel = token.getByName('levelLabel');
  if (levelLabel) {
    levelLabel.setText(resolveLevelText(upgradeLevel));
  }

  const nameLabel = token.getByName('nameLabel');
  if (nameLabel) {
    nameLabel.setText(shortName(unitDef?.name, unitDef?.id || '유닛'));
  }
}

function createBackground(scene) {
  const base = scene.add.rectangle(0, 0, STAGE_WIDTH, STAGE_HEIGHT, 0x061217, 1);
  base.setOrigin(0, 0);

  const laneHeight = 560;
  const lane = scene.add.rectangle(0, 0, STAGE_WIDTH, laneHeight, 0x0a1d22, 1);
  lane.setOrigin(0, 0);

  const bench = scene.add.rectangle(0, laneHeight, STAGE_WIDTH, STAGE_HEIGHT - laneHeight, 0x08131a, 1);
  bench.setOrigin(0, 0);

  const enemyZone = scene.add.rectangle(700, 0, 560, laneHeight, 0x11212e, 0.33);
  enemyZone.setOrigin(0, 0);

  const grid = scene.add.graphics();
  grid.lineStyle(1, 0x25404a, 0.34);
  for (let x = 40; x < STAGE_WIDTH; x += 40) {
    grid.lineBetween(x, 0, x, laneHeight);
  }
  for (let y = 20; y < laneHeight; y += 40) {
    grid.lineBetween(0, y, STAGE_WIDTH, y);
  }

  const benchLabel = scene.add.text(18, laneHeight + 16, '대기열 (드래그해서 슬롯에 배치)', {
    fontFamily: 'SUIT Variable, Pretendard, sans-serif',
    fontSize: '14px',
    color: '#98b5c5',
  });

  const enemyLabel = scene.add.text(730, 20, '적 진입 구간', {
    fontFamily: 'SUIT Variable, Pretendard, sans-serif',
    fontSize: '14px',
    color: '#98b5c5',
  });

  void base;
  void lane;
  void bench;
  void enemyZone;
  void benchLabel;
  void enemyLabel;
}

export function createPlaySceneController(options = {}) {
  const rootElement = options.rootElement;
  const onUnitDrop =
    typeof options.onUnitDrop === 'function' ? options.onUnitDrop : () => {};

  if (!rootElement) {
    throw new Error('play scene rootElement is required');
  }

  if (!window.Phaser) {
    throw new Error('Phaser global is not available');
  }

  const runtime = {
    game: null,
    scene: null,
    readyPromise: null,
    resolveReady: null,
    speedMultiplier: 1,
    interactionLocked: false,
  };

  class DevPlayScene extends window.Phaser.Scene {
    constructor() {
      super({ key: `dev-play-scene-${Date.now()}` });
      this.boardUnits = [];
      this.unitsById = {};
      this.unitObjects = new Map();
      this.enemyObjects = new Map();
      this.combatTimers = [];
      this.combatFx = [];
      this.interactionLocked = false;
      this.bannerText = null;
      this.resultText = null;
    }

    preload() {
      this.load.spritesheet('hero_chibi_01_idle', '/assets/sprites/units/hero_chibi_01/idle.png', {
        frameWidth: 1024,
        frameHeight: 1024,
      });
    }

    create() {
      runtime.scene = this;
      createBackground(this);

      this.slotMarkers = SLOT_POSITIONS.map((slot, index) => {
        const marker = this.add.rectangle(slot.x, slot.y, 112, 112, 0x3dd6b0, 0.08);
        marker.setStrokeStyle(2, 0x3dd6b0, 0.35);

        const label = this.add.text(slot.x, slot.y + 60, `슬롯 ${index + 1}`, {
          fontFamily: 'SUIT Variable, Pretendard, sans-serif',
          fontSize: '12px',
          color: '#7ea8bd',
        });
        label.setOrigin(0.5, 0.5);

        return marker;
      });

      this.bannerText = this.add.text(18, 16, '전투 대기', {
        fontFamily: 'SUIT Variable, Pretendard, sans-serif',
        fontSize: '17px',
        color: '#b1f5e6',
      });

      this.resultText = this.add.text(18, 40, '', {
        fontFamily: 'SUIT Variable, Pretendard, sans-serif',
        fontSize: '12px',
        color: '#9dbccf',
      });

      if (!this.anims.exists('hero_chibi_01_idle_loop')) {
        this.anims.create({
          key: 'hero_chibi_01_idle_loop',
          frames: this.anims.generateFrameNumbers('hero_chibi_01_idle', { start: 0, end: 3 }),
          frameRate: 8,
          repeat: -1,
        });
      }

      this.input.on('dragstart', (_pointer, gameObject) => {
        if (this.interactionLocked) {
          return;
        }
        gameObject.setDepth(999);
        gameObject.setScale(1.08);
      });

      this.input.on('drag', (_pointer, gameObject, dragX, dragY) => {
        if (this.interactionLocked) {
          return;
        }
        gameObject.x = dragX;
        gameObject.y = dragY;
      });

      this.input.on('dragend', (_pointer, gameObject) => {
        gameObject.setDepth(10);
        gameObject.setScale(1);

        if (this.interactionLocked) {
          this.syncBoardUnits(this.boardUnits, this.unitsById);
          return;
        }

        const instanceId = normalizeString(gameObject.getData('instanceId'));
        if (!instanceId) {
          return;
        }
        const slotIndex = pickSlotByPosition(gameObject.x, gameObject.y);
        onUnitDrop(instanceId, slotIndex);
      });

      if (runtime.resolveReady) {
        runtime.resolveReady();
      }
    }

    setInteractionLocked(locked) {
      this.interactionLocked = Boolean(locked);
      for (const token of this.unitObjects.values()) {
        if (token && token.input) {
          token.input.draggable = !this.interactionLocked;
        }
      }
    }

    clearCombatTimers() {
      for (const timer of this.combatTimers) {
        if (timer && typeof timer.remove === 'function') {
          timer.remove(false);
        }
      }
      this.combatTimers.length = 0;
    }

    clearCombatFx() {
      for (const fx of this.combatFx) {
        if (fx && typeof fx.destroy === 'function') {
          fx.destroy();
        }
      }
      this.combatFx.length = 0;
    }

    resetCombatView() {
      this.clearCombatTimers();
      this.clearCombatFx();

      for (const enemy of this.enemyObjects.values()) {
        if (enemy && typeof enemy.destroy === 'function') {
          enemy.destroy();
        }
      }
      this.enemyObjects.clear();
      this.bannerText.setText('전투 대기');
      this.resultText.setText('');
    }

    ensureToken(instanceId, boardUnit) {
      if (this.unitObjects.has(instanceId)) {
        return this.unitObjects.get(instanceId);
      }

      const unitId = normalizeString(boardUnit?.unitId);
      const unitDef = this.unitsById?.[unitId] || { id: unitId, name: unitId, rarity: 'T1' };
      const token = buildTokenVisual(this, unitDef, boardUnit?.upgradeLevel);
      token.setData('instanceId', instanceId);
      token.setData('unitId', unitId);
      this.input.setDraggable(token);
      token.input.draggable = !this.interactionLocked;

      this.unitObjects.set(instanceId, token);
      return token;
    }

    syncBoardUnits(boardUnits, unitsById) {
      const sourceBoardUnits = Array.isArray(boardUnits) ? boardUnits : [];
      this.boardUnits = sourceBoardUnits.map((unit) => ({
        instanceId: normalizeString(unit?.instanceId),
        unitId: normalizeString(unit?.unitId),
        slotIndex: isSlotIndex(unit?.slotIndex) ? unit.slotIndex : null,
        upgradeLevel: toNonNegativeInteger(unit?.upgradeLevel, 0),
      }));
      this.unitsById = unitsById && typeof unitsById === 'object' ? unitsById : {};

      const activeIds = new Set(
        this.boardUnits
          .map((unit) => unit.instanceId)
          .filter((instanceId) => instanceId.length > 0)
      );

      for (const [instanceId, token] of this.unitObjects.entries()) {
        if (activeIds.has(instanceId)) {
          continue;
        }
        token.destroy();
        this.unitObjects.delete(instanceId);
      }

      for (const boardUnit of this.boardUnits) {
        if (!boardUnit.instanceId || !boardUnit.unitId) {
          continue;
        }
        const token = this.ensureToken(boardUnit.instanceId, boardUnit);
        const unitDef = this.unitsById?.[boardUnit.unitId] || {
          id: boardUnit.unitId,
          name: boardUnit.unitId,
          rarity: 'T1',
        };
        updateTokenVisual(token, unitDef, boardUnit.upgradeLevel);
      }

      const waitingUnits = [];
      for (const boardUnit of this.boardUnits) {
        if (boardUnit.slotIndex === null) {
          waitingUnits.push(boardUnit);
        }
      }

      waitingUnits.sort((left, right) => left.instanceId.localeCompare(right.instanceId));

      for (const boardUnit of this.boardUnits) {
        const token = this.unitObjects.get(boardUnit.instanceId);
        if (!token) {
          continue;
        }

        const waitingIndex = waitingUnits.findIndex(
          (entry) => entry.instanceId === boardUnit.instanceId
        );
        const position = isSlotIndex(boardUnit.slotIndex)
          ? SLOT_POSITIONS[boardUnit.slotIndex]
          : createBenchPosition(Math.max(0, waitingIndex));

        this.tweens.add({
          targets: token,
          x: position.x,
          y: position.y,
          duration: 140,
          ease: 'Sine.easeOut',
        });
      }
    }

    spawnEnemy(instanceId, enemyId) {
      const enemyInstanceId = normalizeString(
        instanceId,
        `${enemyId}#${this.enemyObjects.size + 1}`
      );
      if (this.enemyObjects.has(enemyInstanceId)) {
        return;
      }

      const y = resolveEnemyLaneY(enemyInstanceId);
      const container = this.add.container(ENEMY_SPAWN_X, y);

      const body = this.add.circle(0, 0, 24, 0xf59a6e, 0.9);
      body.setStrokeStyle(2, 0xffceb2, 0.9);

      const label = this.add.text(0, 0, shortName(enemyId, '적'), {
        fontFamily: 'SUIT Variable, Pretendard, sans-serif',
        fontSize: '11px',
        color: '#1d0f08',
      });
      label.setOrigin(0.5, 0.5);

      container.add([body, label]);
      container.setDepth(20);

      this.enemyObjects.set(enemyInstanceId, container);

      this.tweens.add({
        targets: container,
        x: ENEMY_TARGET_X,
        duration: 6800,
        ease: 'Linear',
      });
    }

    killEnemy(instanceId) {
      const enemyInstanceId = normalizeString(instanceId);
      const enemy = this.enemyObjects.get(enemyInstanceId);
      if (!enemy) {
        return;
      }

      this.enemyObjects.delete(enemyInstanceId);
      this.tweens.add({
        targets: enemy,
        alpha: 0,
        scaleX: 0.2,
        scaleY: 0.2,
        duration: 180,
        onComplete: () => enemy.destroy(),
      });
    }

    handleDamageEvent(event) {
      const payload = event?.payload || {};
      const srcId = normalizeString(payload.srcId || payload.sourceId);
      const dstId = normalizeString(payload.dstId || payload.targetId);
      const amount = toFiniteNumber(payload.amount, 0);
      const isCrit = payload.isCrit === true;

      const sourceToken = this.unitObjects.get(srcId);
      const targetEnemy = this.enemyObjects.get(dstId);

      if (sourceToken) {
        this.tweens.add({
          targets: sourceToken,
          scaleX: 1.12,
          scaleY: 1.12,
          duration: 70,
          yoyo: true,
          repeat: 1,
        });
      }

      if (sourceToken && targetEnemy) {
        const projectile = this.add.circle(
          sourceToken.x,
          sourceToken.y - 16,
          4,
          isCrit ? 0xffde6e : 0x7dd6ff,
          0.9
        );
        this.combatFx.push(projectile);

        this.tweens.add({
          targets: projectile,
          x: targetEnemy.x,
          y: targetEnemy.y,
          duration: 120,
          onComplete: () => {
            projectile.destroy();
            const index = this.combatFx.indexOf(projectile);
            if (index >= 0) {
              this.combatFx.splice(index, 1);
            }
          },
        });
      }

      if (targetEnemy) {
        const flashColor = isCrit ? 0xfff199 : 0xff9aa9;
        const hitFx = this.add.circle(targetEnemy.x, targetEnemy.y, 28, flashColor, 0.38);
        this.combatFx.push(hitFx);

        this.tweens.add({
          targets: hitFx,
          alpha: 0,
          scaleX: 1.4,
          scaleY: 1.4,
          duration: 180,
          onComplete: () => {
            hitFx.destroy();
            const index = this.combatFx.indexOf(hitFx);
            if (index >= 0) {
              this.combatFx.splice(index, 1);
            }
          },
        });

        const damageText = this.add.text(targetEnemy.x, targetEnemy.y - 36, `${amount.toFixed(1)}`, {
          fontFamily: 'SUIT Variable, Pretendard, sans-serif',
          fontSize: isCrit ? '14px' : '12px',
          color: isCrit ? '#ffe69f' : '#ffd3dd',
          fontStyle: isCrit ? 'bold' : 'normal',
        });
        damageText.setOrigin(0.5, 0.5);
        this.combatFx.push(damageText);

        this.tweens.add({
          targets: damageText,
          y: damageText.y - 26,
          alpha: 0,
          duration: 280,
          onComplete: () => {
            damageText.destroy();
            const index = this.combatFx.indexOf(damageText);
            if (index >= 0) {
              this.combatFx.splice(index, 1);
            }
          },
        });
      }
    }

    applyCombatEvent(event) {
      const type = normalizeString(event?.type, 'Unknown');
      const payload = event?.payload || {};
      const time = toFiniteNumber(event?.time, 0);

      if (type === 'WaveStart') {
        const waveNumber = toFiniteNumber(payload.waveNumber, 1);
        this.bannerText.setText(`웨이브 ${waveNumber} 전투 시작`);
        return;
      }

      if (type === 'Spawn') {
        this.spawnEnemy(payload.instanceId, payload.enemyId);
        return;
      }

      if (type === 'Damage') {
        this.handleDamageEvent(event);
        return;
      }

      if (type === 'EnemyDeath') {
        this.killEnemy(payload.id || payload.instanceId);
        return;
      }

      this.resultText.setText(`${type} @ ${time.toFixed(2)}s`);
    }

    playCombatEvents(events, options = {}) {
      const sourceEvents = Array.isArray(events) ? events : [];
      const speedMultiplier = Math.max(0.25, toFiniteNumber(options.speedMultiplier, 1));

      this.resetCombatView();
      this.bannerText.setText('전투 진행 중');

      if (sourceEvents.length === 0) {
        this.resultText.setText('표시할 전투 이벤트가 없습니다.');
        return Promise.resolve();
      }

      const sorted = sourceEvents
        .slice()
        .sort((left, right) => toFiniteNumber(left?.time, 0) - toFiniteNumber(right?.time, 0));

      return new Promise((resolve) => {
        for (const event of sorted) {
          const delay = Math.max(0, (toFiniteNumber(event?.time, 0) * 1000) / speedMultiplier);
          const timer = this.time.delayedCall(delay, () => this.applyCombatEvent(event));
          this.combatTimers.push(timer);
        }

        const lastEventTime = toFiniteNumber(sorted[sorted.length - 1]?.time, 0);
        const finishDelay = (lastEventTime * 1000 + 520) / speedMultiplier;
        const doneTimer = this.time.delayedCall(finishDelay, () => {
          this.bannerText.setText('전투 종료');
          this.resultText.setText(`이벤트 ${sorted.length}개 재생 완료`);
          resolve();
        });
        this.combatTimers.push(doneTimer);
      });
    }
  }

  runtime.readyPromise = new Promise((resolve) => {
    runtime.resolveReady = resolve;
  });

  const scene = new DevPlayScene();
  runtime.game = new window.Phaser.Game({
    type: window.Phaser.AUTO,
    parent: rootElement,
    backgroundColor: '#071217',
    antialias: true,
    scene: [scene],
    scale: {
      mode: window.Phaser.Scale.FIT,
      autoCenter: window.Phaser.Scale.CENTER_BOTH,
      width: STAGE_WIDTH,
      height: STAGE_HEIGHT,
    },
    fps: {
      target: 60,
      forceSetTimeOut: true,
    },
  });

  async function withScene(work) {
    await runtime.readyPromise;
    return work(runtime.scene);
  }

  return {
    async syncBoardUnits(boardUnits, unitsById) {
      return withScene((sceneRef) => {
        sceneRef.syncBoardUnits(boardUnits, unitsById);
      });
    },

    async playCombatEvents(events) {
      return withScene((sceneRef) =>
        sceneRef.playCombatEvents(events, {
          speedMultiplier: runtime.speedMultiplier,
        })
      );
    },

    async setSpeedMultiplier(nextSpeedMultiplier) {
      runtime.speedMultiplier = Math.max(0.25, toFiniteNumber(nextSpeedMultiplier, 1));
      return runtime.speedMultiplier;
    },

    async setInteractionLocked(locked) {
      runtime.interactionLocked = Boolean(locked);
      return withScene((sceneRef) => {
        sceneRef.setInteractionLocked(runtime.interactionLocked);
      });
    },

    async resetCombat() {
      return withScene((sceneRef) => {
        sceneRef.resetCombatView();
      });
    },

    destroy() {
      if (runtime.game) {
        runtime.game.destroy(true);
      }
    },
  };
}
