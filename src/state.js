// ================= وضعیت بازی + ذخیره‌سازی =================
import { START, LAYOUT, OBSTACLES, obstacleCost, xpForLevel, TIMING } from './config.js';

const KEY = 'luko-city-save-v1';
const SAVE_VERSION = 2;

// مولد عدد تصادفی با بذر ثابت — تا چیدمان اولیه‌ی موانع برای همه یکسان و متعادل باشد
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function cellXY(cell) {
  const f = LAYOUT.field;
  return { col: cell % f.cols, row: Math.floor(cell / f.cols) };
}

export function cellPosition(cell) {
  const f = LAYOUT.field;
  const { col, row } = cellXY(cell);
  return {
    x: f.cx + (col - (f.cols - 1) / 2) * f.spacing,
    z: f.cz + (row - (f.rows - 1) / 2) * f.spacing,
  };
}

// فاصله‌ی سلول از نزدیک‌ترین سلول باز — برای قیمت پاک‌کردن
function ringDist(cell, clearedSet) {
  const { col, row } = cellXY(cell);
  let best = Infinity;
  for (const c of clearedSet) {
    const o = cellXY(c);
    best = Math.min(best, Math.abs(o.col - col) + Math.abs(o.row - row));
  }
  return best === Infinity ? 1 : best;
}

let obstacleSeq = 0;
function makeObstacle(kind, x, z, cell, cost, rng) {
  return {
    id: 'ob_' + (obstacleSeq++) + '_' + Math.floor(rng() * 1e6).toString(36),
    kind,                                    // 'tree' | 'rock'
    type: Math.floor(rng() * 3),             // کدام مدل از پکیج
    cell: cell == null ? null : cell,        // سلول زمین کشت (null = وحشی)
    x, z,
    cost,
    rot: Math.floor(rng() * 4) * (Math.PI / 2) + rng() * 0.6,
    scaleMul: 0.9 + rng() * 0.25,
  };
}

// ساخت موانع اولیه: همه‌ی سلول‌های بسته‌ی زمین + چندتایی دور شهر
export function generateObstacles(clearedCells, plotCells = []) {
  const rng = mulberry32(20241018);
  const f = LAYOUT.field;
  const cleared = new Set([...clearedCells, ...plotCells]);
  const list = [];

  for (let cell = 0; cell < f.cols * f.rows; cell++) {
    if (cleared.has(cell)) continue;
    const { x, z } = cellPosition(cell);
    const kind = rng() < 0.35 ? 'rock' : 'tree';
    const ob = makeObstacle(kind, x, z, cell, 0, rng);
    ob.cost = obstacleCost(kind, ringDist(cell, cleared), ob.type);
    list.push(ob);
  }

  // موانع وحشی کناره‌های نقشه
  const spots = [...LAYOUT.wildSpots];
  for (let i = spots.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [spots[i], spots[j]] = [spots[j], spots[i]];
  }
  for (const s of spots.slice(0, OBSTACLES.initialWild)) {
    const kind = rng() < 0.3 ? 'rock' : 'tree';
    const ob = makeObstacle(kind, s.x, s.z, null, 0, rng);
    ob.cost = obstacleCost(kind, 2, ob.type);
    list.push(ob);
  }
  return list;
}

function starterPlots() {
  return LAYOUT.starterPlotCells.map((cell) => ({
    id: 'plot_' + cell,
    cell,
    state: 'empty',      // empty | tilled | growing | ready
    soilCount: 0,
    crop: null,
    phase: 0,
    progress: 0,
    moisture: 70,
    fertilized: false,
  }));
}

export const state = {
  coins: START.coins,
  dew: START.dew,
  level: START.level,
  xp: START.xp,
  inventory: { ...START.inventory },
  plots: starterPlots(),
  clearedCells: [...LAYOUT.starterClearedCells],
  obstacles: generateObstacles(LAYOUT.starterClearedCells, LAYOUT.starterPlotCells),
  buildingPos: {},        // id -> {x, z} موقعیت سفارشی ساختمان‌ها
  cooldowns: {},          // buildingId -> timestamp
  sound: true,
  mails: [
    { id: 'm1', title: 'به شهر لوکو خوش آمدی!', body: 'امیدواریم از ساختن شهرت لذت ببری. این هدیه‌ی کوچک از طرف تیم لوکو.', reward: { coins: 300 }, claimed: false },
    { id: 'm2', title: 'دکتر نیلا', body: 'زمین‌های جنوب شهر پر از درخت و سنگ است! روی هرکدام کلیک کن و با سکه پاکش کن تا زمین کشت باز شود؛ شبنم هم گیرت می‌آید.', reward: { dew: 20 }, claimed: false },
    { id: 'm3', title: 'باشگاه لوکو', body: 'برای تمرین امروز آماده‌ای؟ یک سر به باشگاه بزن!', reward: { xp: 60 }, claimed: false },
  ],
  friends: [
    { id: 'f1', name: 'سارا', level: 8 },
    { id: 'f2', name: 'امیر', level: 15 },
    { id: 'f3', name: 'نگار', level: 5 },
    { id: 'f4', name: 'آرش', level: 21 },
    { id: 'f5', name: 'مینا', level: 11 },
  ],
};

// ---------- ذخیره / بازیابی ----------
let saveTimer = null;
export function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify({
        version: SAVE_VERSION,
        coins: state.coins,
        dew: state.dew,
        level: state.level,
        xp: state.xp,
        inventory: state.inventory,
        plots: state.plots,
        clearedCells: state.clearedCells,
        obstacles: state.obstacles,
        buildingPos: state.buildingPos,
        cooldowns: state.cooldowns,
        sound: state.sound,
        mails: state.mails,
      }));
    } catch (e) { /* بی‌خیال */ }
  }, 250);
}

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return false;
    const data = JSON.parse(raw);
    Object.assign(state, {
      coins: data.coins ?? state.coins,
      dew: data.dew ?? state.dew,
      level: data.level ?? state.level,
      xp: data.xp ?? state.xp,
      inventory: { ...state.inventory, ...(data.inventory || {}) },
      cooldowns: data.cooldowns || {},
      sound: data.sound ?? true,
    });
    if (Array.isArray(data.plots) && data.plots.length) state.plots = data.plots;
    if (Array.isArray(data.mails) && data.mails.length) state.mails = data.mails;
    if (data.buildingPos && typeof data.buildingPos === 'object') state.buildingPos = data.buildingPos;

    const f = LAYOUT.field;
    // جایگاه‌های ذخیره‌ی قدیمی ممکن است سلول خارج از زمین جدید داشته باشند؛ اصلاحشان کن
    const usedCells = new Set();
    state.plots.forEach((p) => {
      if (typeof p.moisture !== 'number') p.moisture = 70;
      if (typeof p.cell !== 'number' || p.cell < 0 || p.cell >= f.cols * f.rows || usedCells.has(p.cell)) {
        let cell = 0;
        while (usedCells.has(cell)) cell++;
        p.cell = cell;
      }
      usedCells.add(p.cell);
    });

    if (Array.isArray(data.obstacles)) {
      state.obstacles = data.obstacles.filter(o => o && (o.kind === 'tree' || o.kind === 'rock'));
      state.clearedCells = Array.isArray(data.clearedCells)
        ? data.clearedCells
        : [...LAYOUT.starterClearedCells];
    } else {
      // مهاجرت از ذخیره‌ی قدیمی (نسخه‌ی درخت‌های آزاد):
      // زمین از اول پر از درخت و سنگ می‌شود، به‌جز سلول‌هایی که بازیکن رویشان جایگاه دارد.
      const plotCells = state.plots.map(p => p.cell);
      state.clearedCells = [...new Set([...LAYOUT.starterClearedCells, ...plotCells])];
      state.obstacles = generateObstacles(state.clearedCells, plotCells);
    }
    // هیچ مانعی نباید روی سلولِ دارای جایگاه بماند
    const plotCellSet = new Set(state.plots.map(p => p.cell));
    state.obstacles = state.obstacles.filter(o => o.cell === null || !plotCellSet.has(o.cell));
    return true;
  } catch (e) {
    return false;
  }
}

export function resetGame() {
  localStorage.removeItem(KEY);
  location.reload();
}

// ---------- اقتصاد ----------
export function addCoins(n) {
  state.coins = Math.max(0, Math.round(state.coins + n));
  save();
}

export function addDew(n) {
  state.dew = Math.max(0, Math.round(state.dew + n));
  save();
}

export function addXp(n) {
  state.xp += n;
  let leveled = false;
  while (state.xp >= xpForLevel(state.level)) {
    state.xp -= xpForLevel(state.level);
    state.level += 1;
    state.coins += 150; // جایزه لول آپ
    leveled = true;
  }
  save();
  return leveled;
}

export function canAfford(currency, amount) {
  return currency === 'dew' ? state.dew >= amount : state.coins >= amount;
}

export function spend(currency, amount) {
  if (!canAfford(currency, amount)) return false;
  if (currency === 'dew') state.dew -= amount;
  else state.coins -= amount;
  save();
  return true;
}

export function addItem(itemId, n = 1) {
  state.inventory[itemId] = (state.inventory[itemId] || 0) + n;
  save();
}

export function takeItem(itemId, n = 1) {
  if ((state.inventory[itemId] || 0) < n) return false;
  state.inventory[itemId] -= n;
  save();
  return true;
}

// ---------- جایگاه‌های کشت ----------
export function getPlot(id) {
  return state.plots.find(p => p.id === id);
}

export function addPlot(cell) {
  const id = 'plot_' + cell + '_' + Math.random().toString(36).slice(2, 5);
  state.plots.push({
    id, cell,
    state: 'empty',
    soilCount: 0,
    crop: null,
    phase: 0,
    progress: 0,
    moisture: 70,
    fertilized: false,
  });
  save();
  return id;
}

export function isCellTaken(cell) {
  return state.plots.some(p => p.cell === cell);
}

export function removePlot(id) {
  state.plots = state.plots.filter(p => p.id !== id);
  save();
}

export function setPlotCell(id, cell) {
  const p = getPlot(id);
  if (!p) return false;
  p.cell = cell;
  save();
  return true;
}

// ---------- موانع (درخت / سنگ) ----------
export function obstacleAtCell(cell) {
  return state.obstacles.find(o => o.cell === cell) || null;
}

export function isCellBlocked(cell) {
  return !!obstacleAtCell(cell);
}

export function addObstacle(obstacle) {
  state.obstacles.push(obstacle);
  save();
}

export function removeObstacle(id) {
  const ob = state.obstacles.find(o => o.id === id);
  state.obstacles = state.obstacles.filter(o => o.id !== id);
  if (ob && ob.cell !== null && !state.clearedCells.includes(ob.cell)) {
    state.clearedCells.push(ob.cell); // سلول برای همیشه باز شد
  }
  save();
  return ob || null;
}

export function makeWildObstacle(x, z) {
  const kind = Math.random() < 0.3 ? 'rock' : 'tree';
  const ob = makeObstacle(kind, x, z, null, 0, Math.random);
  ob.cost = obstacleCost(kind, 2, ob.type);
  return ob;
}

// ---------- جابجایی ساختمان‌ها (درگ‌اندراپ) ----------
export function setBuildingPos(id, x, z) {
  state.buildingPos[id] = { x, z };
  save();
}

export function getBuildingPos(id, fallbackX, fallbackZ) {
  const p = state.buildingPos[id];
  return p ? { x: p.x, z: p.z } : { x: fallbackX, z: fallbackZ };
}

// ---------- ساختمان‌ها ----------
export function buildingReady(id, cooldownSec) {
  const at = state.cooldowns[id] || 0;
  return Date.now() - at >= (cooldownSec || 0) * 1000 || at === 0;
}

export function setBuildingCooldown(id) {
  state.cooldowns[id] = Date.now();
  save();
}

export function cooldownLeft(id, cooldownSec = 0) {
  const at = state.cooldowns[id] || 0;
  if (!at) return 0;
  return Math.max(0, at + cooldownSec * 1000 - Date.now());
}

export { TIMING };
