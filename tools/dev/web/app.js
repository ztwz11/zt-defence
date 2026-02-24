import { createPlaySceneController } from './play-scene.js';

const REWARD_POOL = Object.freeze([
  {
    id: 'atk_boost',
    name: '공격 강화',
    description: '아군 공격력이 10% 증가합니다.',
  },
  {
    id: 'haste_boost',
    name: '가속',
    description: '아군 공격 속도가 0.15 증가합니다.',
  },
  {
    id: 'crit_boost',
    name: '치명타 훈련',
    description: '치명타 확률이 5% 증가합니다.',
  },
]);

const SPEED_STEPS = Object.freeze([1, 2, 4]);

function byId(id) {
  return document.getElementById(id);
}

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

function toPositiveInteger(value, fallback) {
  return Math.max(1, Math.floor(toFiniteNumber(value, fallback)));
}

function pickRandom(source) {
  if (!Array.isArray(source) || source.length === 0) {
    return null;
  }
  const index = Math.floor(Math.random() * source.length);
  return source[index] || null;
}

function sampleUnique(source, count) {
  const pool = Array.isArray(source) ? source.slice() : [];
  const result = [];
  while (pool.length > 0 && result.length < count) {
    const index = Math.floor(Math.random() * pool.length);
    result.push(pool.splice(index, 1)[0]);
  }
  return result;
}

function pretty(value) {
  return JSON.stringify(value, null, 2);
}

function koreanStatus(status) {
  const normalized = normalizeString(status, 'idle');
  if (normalized === 'continue') {
    return '계속 진행';
  }
  if (normalized === 'clear') {
    return '클리어';
  }
  if (normalized === 'fail') {
    return '패배';
  }
  return '대기';
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  let payload = {};
  try {
    payload = await response.json();
  } catch (_error) {
    payload = {};
  }

  if (!response.ok || payload.ok !== true) {
    const message =
      normalizeString(payload?.error?.message) || `request failed: ${response.status}`;
    throw new Error(message);
  }

  return payload.value || {};
}

const ui = {
  btnGoLobby: byId('btn-go-lobby'),
  btnStartFlow: byId('btn-start-flow'),
  btnRefreshChapters: byId('btn-refresh-chapters'),
  chapterList: byId('chapter-list'),

  btnSummon: byId('btn-summon'),
  btnReroll: byId('btn-reroll'),
  btnStartCombat: byId('btn-start-combat'),
  btnSpeed: byId('btn-speed'),

  hudChapter: byId('hud-chapter'),
  hudWave: byId('hud-wave'),
  hudGateHp: byId('hud-gate-hp'),
  hudGold: byId('hud-gold'),
  hudPhase: byId('hud-phase'),
  hudStatus: byId('hud-status'),
  hudSummonCost: byId('hud-summon-cost'),
  hudRerollCost: byId('hud-reroll-cost'),
  statusPill: byId('status-pill'),

  shopList: byId('shop-list'),
  boardUnitList: byId('board-unit-list'),
  rewardEffectList: byId('reward-effect-list'),
  debugLog: byId('debug-log'),

  modalReward: byId('modal-reward'),
  rewardOptionList: byId('reward-option-list'),

  modalResult: byId('modal-result'),
  resultTitle: byId('result-title'),
  resultSummary: byId('result-summary'),
  btnRetry: byId('btn-retry'),
  btnResultLobby: byId('btn-result-lobby'),

  gameRoot: byId('game-root'),
};

const state = {
  chapters: [],
  units: [],
  unitsById: {},

  currentScreen: 'lobby',
  currentChapterId: null,

  runSeed: 2026,
  waveNumber: 1,
  maxWaves: 20,
  gateHp: 20,
  gold: 0,
  phase: 'Prepare',
  status: 'idle',
  summonCost: 4,
  rerollCost: 2,

  boardUnits: [],
  rewardEffects: [],
  shopOffer: [],
  pendingRewardOptions: [],

  nextInstanceNumber: 1,
  speedStepIndex: 0,
  isCombatRunning: false,
  latestSummary: null,
};

let playSceneController = null;

function appendLog(message, details) {
  const timestamp = new Date().toLocaleTimeString('ko-KR', { hour12: false });
  const lines = [`[${timestamp}] ${message}`];
  if (details !== undefined) {
    lines.push(pretty(details));
  }

  const current = ui.debugLog.textContent.trim();
  const merged = current.length > 0 ? `${current}\n${lines.join('\n')}` : lines.join('\n');
  const sliced = merged.split('\n').slice(-160).join('\n');
  ui.debugLog.textContent = sliced;
  ui.debugLog.scrollTop = ui.debugLog.scrollHeight;
}

function setModalOpen(modalElement, isOpen) {
  modalElement.classList.toggle('is-open', Boolean(isOpen));
}

function showScreen(screenId) {
  state.currentScreen = screenId;
  const screens = ['lobby', 'chapter', 'run'];
  for (const name of screens) {
    const node = byId(`screen-${name}`);
    if (!node) {
      continue;
    }
    node.classList.toggle('is-active', name === screenId);
  }
}

function getUnitName(unitId) {
  const unit = state.unitsById[unitId];
  if (!unit) {
    return unitId;
  }
  return normalizeString(unit.name, unitId);
}

function getChapterById(chapterId) {
  return state.chapters.find((chapter) => chapter.id === chapterId) || null;
}

function getSpeedMultiplier() {
  return SPEED_STEPS[state.speedStepIndex] || 1;
}

function updateSpeedButtonLabel() {
  ui.btnSpeed.textContent = `속도 ${getSpeedMultiplier()}x`;
}

function findBoardUnit(instanceId) {
  return state.boardUnits.find((unit) => unit.instanceId === instanceId) || null;
}

function findOccupiedUnit(slotIndex, exceptInstanceId) {
  return (
    state.boardUnits.find(
      (unit) => unit.instanceId !== exceptInstanceId && unit.slotIndex === slotIndex
    ) || null
  );
}

function firstEmptySlot() {
  for (let slotIndex = 0; slotIndex < 6; slotIndex += 1) {
    if (!findOccupiedUnit(slotIndex, null)) {
      return slotIndex;
    }
  }
  return null;
}

function nextInstanceId(unitId) {
  state.nextInstanceNumber += 1;
  return `${unitId}_${String(state.nextInstanceNumber).padStart(3, '0')}`;
}

function refillShopOffer() {
  state.shopOffer = [];
  if (state.units.length === 0) {
    return;
  }

  for (let index = 0; index < 3; index += 1) {
    const picked = pickRandom(state.units);
    if (picked) {
      state.shopOffer.push(picked.id);
    }
  }
}

function renderChapterList() {
  ui.chapterList.innerHTML = '';

  if (state.chapters.length === 0) {
    const empty = document.createElement('p');
    empty.textContent = '챕터 정보를 불러오지 못했습니다.';
    ui.chapterList.appendChild(empty);
    return;
  }

  for (const chapter of state.chapters) {
    const card = document.createElement('article');
    card.className = 'chapter-card';

    const title = document.createElement('h3');
    title.textContent = `챕터 ${chapter.id.replace('chapter_', '')}`;
    card.appendChild(title);

    const gateHp = document.createElement('p');
    gateHp.textContent = `초기 게이트 HP: ${toFiniteNumber(chapter.gateHp, 20)}`;
    card.appendChild(gateHp);

    const gold = document.createElement('p');
    gold.textContent = `초기 골드: ${toFiniteNumber(chapter.gold, 0)}`;
    card.appendChild(gold);

    const button = document.createElement('button');
    button.className = 'accent';
    button.textContent = '이 챕터 시작';
    button.dataset.chapterId = chapter.id;
    card.appendChild(button);

    ui.chapterList.appendChild(card);
  }
}

function renderHud() {
  ui.hudChapter.textContent = state.currentChapterId || '-';
  ui.hudWave.textContent = `${state.waveNumber} / ${state.maxWaves}`;
  ui.hudGateHp.textContent = String(Math.max(0, Math.floor(state.gateHp)));
  ui.hudGold.textContent = String(Math.max(0, Math.floor(state.gold)));
  ui.hudPhase.textContent = normalizeString(state.phase, 'Prepare');
  ui.hudStatus.textContent = koreanStatus(state.status);
  ui.hudSummonCost.textContent = String(Math.max(0, Math.floor(state.summonCost)));
  ui.hudRerollCost.textContent = String(Math.max(0, Math.floor(state.rerollCost)));
  ui.statusPill.textContent = koreanStatus(state.status);
}

function renderShopList() {
  ui.shopList.innerHTML = '';
  if (state.shopOffer.length === 0) {
    const empty = document.createElement('p');
    empty.textContent = '상점 데이터가 없습니다.';
    ui.shopList.appendChild(empty);
    return;
  }

  state.shopOffer.forEach((unitId, index) => {
    const item = document.createElement('article');
    item.className = 'shop-item';

    const textWrap = document.createElement('div');
    const title = document.createElement('strong');
    title.textContent = getUnitName(unitId);

    const detail = document.createElement('span');
    const rarity = normalizeString(state.unitsById[unitId]?.rarity, 'T1');
    detail.textContent = `등급 ${rarity}`;

    textWrap.appendChild(title);
    textWrap.appendChild(detail);

    const button = document.createElement('button');
    button.className = 'warn';
    button.textContent = '소환';
    button.dataset.shopIndex = String(index);

    item.appendChild(textWrap);
    item.appendChild(button);
    ui.shopList.appendChild(item);
  });
}

function renderBoardUnitList() {
  ui.boardUnitList.innerHTML = '';

  if (state.boardUnits.length === 0) {
    const item = document.createElement('li');
    item.textContent = '배치된 유닛이 없습니다.';
    ui.boardUnitList.appendChild(item);
    return;
  }

  const sorted = state.boardUnits.slice().sort((left, right) => left.instanceId.localeCompare(right.instanceId));

  for (const boardUnit of sorted) {
    const item = document.createElement('li');
    const row = document.createElement('div');
    row.className = 'board-row';

    const label = document.createElement('span');
    const slotText = Number.isInteger(boardUnit.slotIndex)
      ? `슬롯 ${boardUnit.slotIndex + 1}`
      : '대기열';
    label.textContent = `${getUnitName(boardUnit.unitId)} (${slotText})`;

    const removeButton = document.createElement('button');
    removeButton.className = 'ghost';
    removeButton.textContent = '판매';
    removeButton.dataset.removeInstanceId = boardUnit.instanceId;

    row.appendChild(label);
    row.appendChild(removeButton);
    item.appendChild(row);
    ui.boardUnitList.appendChild(item);
  }
}

function renderRewardEffectList() {
  ui.rewardEffectList.innerHTML = '';

  if (state.rewardEffects.length === 0) {
    const item = document.createElement('li');
    item.textContent = '적용된 효과가 없습니다.';
    ui.rewardEffectList.appendChild(item);
    return;
  }

  for (const effect of state.rewardEffects) {
    const item = document.createElement('li');
    item.textContent = `${effect.name}: ${effect.description}`;
    ui.rewardEffectList.appendChild(item);
  }
}

function renderRewardOptions() {
  ui.rewardOptionList.innerHTML = '';

  for (const reward of state.pendingRewardOptions) {
    const item = document.createElement('article');
    item.className = 'reward-option';

    const title = document.createElement('h4');
    title.textContent = reward.name;

    const description = document.createElement('p');
    description.textContent = reward.description;

    const button = document.createElement('button');
    button.className = 'accent';
    button.textContent = '선택';
    button.dataset.rewardId = reward.id;

    item.appendChild(title);
    item.appendChild(description);
    item.appendChild(button);
    ui.rewardOptionList.appendChild(item);
  }
}

async function syncSceneBoard() {
  if (!playSceneController) {
    return;
  }
  await playSceneController.syncBoardUnits(state.boardUnits, state.unitsById);
}

function setControlEnabled(enabled) {
  const disabled = !enabled;
  ui.btnSummon.disabled = disabled;
  ui.btnReroll.disabled = disabled;
  ui.btnStartCombat.disabled = disabled;
}

function hydrateFromRunResult(runValue) {
  const summary = runValue?.summary || {};
  const hud = runValue?.hud || {};

  state.phase = normalizeString(hud.phase || summary.phase, state.phase);
  state.status = normalizeString(summary.status, state.status);
  state.gateHp = Math.max(0, toFiniteNumber(summary.gateHp, state.gateHp));
  state.gold = Math.max(0, toFiniteNumber(summary.gold, state.gold));
  state.summonCost = Math.max(0, toFiniteNumber(hud.summonCost, state.summonCost));
  state.rerollCost = Math.max(0, toFiniteNumber(hud.rerollCost, state.rerollCost));
  state.latestSummary = summary;

  if (state.status === 'continue') {
    state.waveNumber = Math.max(
      state.waveNumber + 1,
      toPositiveInteger(summary.nextWaveNumber, state.waveNumber + 1)
    );
  }
}

function closeAllModals() {
  setModalOpen(ui.modalReward, false);
  setModalOpen(ui.modalResult, false);
}

async function applyUnitSlotChange(instanceId, slotIndex) {
  const boardUnit = findBoardUnit(instanceId);
  if (!boardUnit) {
    return;
  }

  const normalizedSlotIndex = Number.isInteger(slotIndex) ? slotIndex : null;
  if (normalizedSlotIndex !== null) {
    const occupied = findOccupiedUnit(normalizedSlotIndex, instanceId);
    if (occupied) {
      occupied.slotIndex = null;
    }
  }

  boardUnit.slotIndex = normalizedSlotIndex;
  renderBoardUnitList();
  await syncSceneBoard();
}

async function addBoardUnit(unitId, preferredSlot) {
  const normalizedUnitId = normalizeString(unitId);
  if (!normalizedUnitId) {
    return;
  }

  const instanceId = nextInstanceId(normalizedUnitId);
  const slotIndex = Number.isInteger(preferredSlot) ? preferredSlot : firstEmptySlot();

  state.boardUnits.push({
    instanceId,
    unitId: normalizedUnitId,
    slotIndex,
  });

  renderBoardUnitList();
  await syncSceneBoard();
}

async function removeBoardUnit(instanceId) {
  const index = state.boardUnits.findIndex((unit) => unit.instanceId === instanceId);
  if (index < 0) {
    return;
  }

  const [removed] = state.boardUnits.splice(index, 1);
  state.gold += 1;
  renderHud();
  renderBoardUnitList();
  await syncSceneBoard();
  appendLog(`유닛 판매: ${getUnitName(removed.unitId)} (+1 골드)`);
}

async function summonFromShop(shopIndex) {
  if (state.isCombatRunning) {
    return;
  }

  const index = toPositiveInteger(shopIndex, 1) - 1;
  const unitId = state.shopOffer[index];
  if (!unitId) {
    appendLog('소환할 상점 유닛이 없습니다.');
    return;
  }

  if (state.gold < state.summonCost) {
    appendLog('골드가 부족해 소환할 수 없습니다.');
    return;
  }

  state.gold -= state.summonCost;
  renderHud();

  await addBoardUnit(unitId, null);

  const replacement = pickRandom(state.units);
  state.shopOffer[index] = replacement ? replacement.id : unitId;
  renderShopList();

  appendLog(`소환 완료: ${getUnitName(unitId)} (비용 ${state.summonCost})`);
}

function rerollShop() {
  if (state.isCombatRunning) {
    return;
  }

  if (state.gold < state.rerollCost) {
    appendLog('골드가 부족해 리롤할 수 없습니다.');
    return;
  }

  state.gold -= state.rerollCost;
  refillShopOffer();
  renderHud();
  renderShopList();
  appendLog(`리롤 완료 (비용 ${state.rerollCost})`);
}

function openRewardModal() {
  state.pendingRewardOptions = sampleUnique(REWARD_POOL, 3);
  renderRewardOptions();
  setModalOpen(ui.modalReward, true);
}

async function closeRewardModalWithPick(rewardId) {
  const reward = state.pendingRewardOptions.find((entry) => entry.id === rewardId);
  if (!reward) {
    return;
  }

  state.rewardEffects.push(reward);
  state.pendingRewardOptions = [];
  setModalOpen(ui.modalReward, false);

  state.phase = 'Prepare';
  state.status = 'idle';
  refillShopOffer();

  renderHud();
  renderShopList();
  renderRewardEffectList();

  await playSceneController.setInteractionLocked(false);
  state.isCombatRunning = false;
  setControlEnabled(true);

  appendLog(`보상 선택: ${reward.name}`);
}

async function openResultModal(summary) {
  const status = normalizeString(summary?.status, 'fail');
  const isClear = status === 'clear';

  ui.resultTitle.textContent = isClear ? '클리어' : '패배';

  const resultPayload = {
    chapterId: state.currentChapterId,
    runSeed: state.runSeed,
    status,
    waveNumber: summary?.waveNumber,
    reachedWave: summary?.nextWaveNumber,
    gateHp: summary?.gateHp,
    gold: summary?.gold,
    killCount: summary?.killCount,
    totalDamage: summary?.totalDamage,
    leaks: summary?.leaks,
  };

  ui.resultSummary.textContent = pretty(resultPayload);
  setModalOpen(ui.modalResult, true);

  await playSceneController.setInteractionLocked(true);
  state.isCombatRunning = false;
  setControlEnabled(false);
}

async function runCombat() {
  if (state.isCombatRunning) {
    return;
  }

  const deployed = state.boardUnits.filter((unit) => Number.isInteger(unit.slotIndex));
  if (deployed.length === 0) {
    appendLog('배치된 유닛이 없어 전투를 시작할 수 없습니다.');
    return;
  }

  state.isCombatRunning = true;
  setControlEnabled(false);
  closeAllModals();

  await playSceneController.setInteractionLocked(true);
  state.status = 'idle';
  renderHud();

  const payload = {
    chapterId: state.currentChapterId,
    runSeed: state.runSeed,
    waveNumber: state.waveNumber,
    maxWaves: state.maxWaves,
    gateHp: state.gateHp,
    gold: state.gold,
    boardUnits: deployed.map((unit) => ({
      instanceId: unit.instanceId,
      unitId: unit.unitId,
    })),
    rewardEffects: state.rewardEffects.map((effect) => ({ id: effect.id })),
  };

  appendLog(`전투 요청: wave=${state.waveNumber}, units=${deployed.length}`);

  try {
    const value = await fetchJson('/api/run', {
      method: 'POST',
      headers: {
        'content-type': 'application/json; charset=utf-8',
      },
      body: JSON.stringify(payload),
    });

    hydrateFromRunResult(value);
    renderHud();

    const renderEvents = Array.isArray(value?.render?.events) ? value.render.events : [];
    await playSceneController.playCombatEvents(renderEvents);

    appendLog(`전투 종료: status=${state.status}`, value.summary || {});

    if (state.status === 'continue') {
      openRewardModal();
      return;
    }

    await openResultModal(value.summary || {});
  } catch (error) {
    appendLog(`전투 오류: ${error && error.message ? error.message : String(error)}`);
    state.isCombatRunning = false;
    await playSceneController.setInteractionLocked(false);
    setControlEnabled(true);
  }
}

async function startChapter(chapterId) {
  const chapter = getChapterById(chapterId);
  if (!chapter) {
    appendLog(`유효하지 않은 챕터: ${chapterId}`);
    return;
  }

  closeAllModals();

  state.currentChapterId = chapter.id;
  state.runSeed = Math.floor(Math.random() * 900000) + 100000;
  state.waveNumber = 1;
  state.maxWaves = 20;
  state.gateHp = Math.max(0, toFiniteNumber(chapter.gateHp, 20));
  state.gold = Math.max(0, toFiniteNumber(chapter.gold, 0));
  state.phase = 'Prepare';
  state.status = 'idle';
  state.summonCost = 4;
  state.rerollCost = 2;

  state.boardUnits = [];
  state.rewardEffects = [];
  state.pendingRewardOptions = [];

  refillShopOffer();

  const starter = state.unitsById.hero_chibi_01 ? 'hero_chibi_01' : state.units[0]?.id;
  if (starter) {
    await addBoardUnit(starter, 0);
  }

  showScreen('run');
  renderHud();
  renderShopList();
  renderBoardUnitList();
  renderRewardEffectList();

  await playSceneController.resetCombat();
  await playSceneController.setInteractionLocked(false);

  state.isCombatRunning = false;
  setControlEnabled(true);

  appendLog(`런 시작: ${chapter.id}, seed=${state.runSeed}`);
}

async function loadBootstrapData() {
  const chapterPayload = await fetchJson('/api/chapters');
  const unitsPayload = await fetchJson('/api/units');

  state.chapters = Array.isArray(chapterPayload.chapters) ? chapterPayload.chapters : [];
  state.units = Array.isArray(unitsPayload.units) ? unitsPayload.units : [];

  state.unitsById = {};
  for (const unit of state.units) {
    if (!normalizeString(unit?.id)) {
      continue;
    }
    state.unitsById[unit.id] = unit;
  }

  if (state.chapters.length > 0 && !state.currentChapterId) {
    state.currentChapterId = chapterPayload.defaultChapterId || state.chapters[0].id;
  }

  renderChapterList();
  appendLog(`초기화 완료: chapters=${state.chapters.length}, units=${state.units.length}`);
}

function bindEvents() {
  ui.btnGoLobby.addEventListener('click', async () => {
    closeAllModals();
    showScreen('lobby');
    state.isCombatRunning = false;
    setControlEnabled(false);
    await playSceneController.setInteractionLocked(false);
    appendLog('로비로 이동');
  });

  ui.btnStartFlow.addEventListener('click', () => {
    showScreen('chapter');
  });

  ui.btnRefreshChapters.addEventListener('click', async () => {
    try {
      await loadBootstrapData();
      appendLog('챕터/유닛 정보를 새로고침했습니다.');
    } catch (error) {
      appendLog(`새로고침 실패: ${error && error.message ? error.message : String(error)}`);
    }
  });

  ui.chapterList.addEventListener('click', async (event) => {
    const target = event.target;
    if (!(target instanceof HTMLButtonElement)) {
      return;
    }

    const chapterId = normalizeString(target.dataset.chapterId);
    if (!chapterId) {
      return;
    }
    await startChapter(chapterId);
  });

  ui.shopList.addEventListener('click', async (event) => {
    const target = event.target;
    if (!(target instanceof HTMLButtonElement)) {
      return;
    }
    const rawIndex = normalizeString(target.dataset.shopIndex);
    if (!rawIndex) {
      return;
    }
    await summonFromShop(Number(rawIndex) + 1);
  });

  ui.btnSummon.addEventListener('click', async () => {
    await summonFromShop(1);
  });

  ui.btnReroll.addEventListener('click', () => {
    rerollShop();
  });

  ui.btnStartCombat.addEventListener('click', async () => {
    await runCombat();
  });

  ui.btnSpeed.addEventListener('click', async () => {
    state.speedStepIndex = (state.speedStepIndex + 1) % SPEED_STEPS.length;
    updateSpeedButtonLabel();
    await playSceneController.setSpeedMultiplier(getSpeedMultiplier());
    appendLog(`전투 속도 변경: ${getSpeedMultiplier()}x`);
  });

  ui.boardUnitList.addEventListener('click', async (event) => {
    const target = event.target;
    if (!(target instanceof HTMLButtonElement)) {
      return;
    }

    const instanceId = normalizeString(target.dataset.removeInstanceId);
    if (!instanceId) {
      return;
    }

    await removeBoardUnit(instanceId);
  });

  ui.rewardOptionList.addEventListener('click', async (event) => {
    const target = event.target;
    if (!(target instanceof HTMLButtonElement)) {
      return;
    }

    const rewardId = normalizeString(target.dataset.rewardId);
    if (!rewardId) {
      return;
    }

    await closeRewardModalWithPick(rewardId);
  });

  ui.btnRetry.addEventListener('click', async () => {
    setModalOpen(ui.modalResult, false);
    const chapterId = state.currentChapterId || state.chapters[0]?.id;
    if (chapterId) {
      await startChapter(chapterId);
    }
  });

  ui.btnResultLobby.addEventListener('click', async () => {
    setModalOpen(ui.modalResult, false);
    showScreen('lobby');
    state.isCombatRunning = false;
    setControlEnabled(false);
    await playSceneController.setInteractionLocked(false);
  });
}

async function main() {
  playSceneController = createPlaySceneController({
    rootElement: ui.gameRoot,
    onUnitDrop: async (instanceId, slotIndex) => {
      await applyUnitSlotChange(instanceId, slotIndex);
    },
  });

  updateSpeedButtonLabel();
  setControlEnabled(false);

  bindEvents();

  try {
    await loadBootstrapData();
  } catch (error) {
    appendLog(`초기 로딩 실패: ${error && error.message ? error.message : String(error)}`);
  }

  showScreen('lobby');
  renderHud();
  renderShopList();
  renderBoardUnitList();
  renderRewardEffectList();

  await playSceneController.setSpeedMultiplier(getSpeedMultiplier());
  await playSceneController.setInteractionLocked(false);
}

main();
