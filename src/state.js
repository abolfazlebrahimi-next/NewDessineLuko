// ================= وضعیت بازی + ذخیره‌سازی =================
import { START, LAYOUT, xpForLevel, TIMING } from './config.js';

const KEY = 'luko-city-save-v1';

function starterPlots() {
  const f = LAYOUT.field;
  return LAYOUT.starterPlotCells.map((cell, i) => ({
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

function starterTrees() {
  // چند درخت از اول کناره‌های مزرعه هستند
  return LAYOUT.treeSpots.slice(0, 7).map((s, i) => ({
    id: 'tree_' + i + '_' + Math.random().toString(36).slice(2, 6),
    type: (i % 3) + 1, // Tree1..Tree3
    x: s.x,
    z: s.z,
  }));
}

export const state = {
  coins: START.coins,
  dew: START.dew,
  level: START.level,
  xp: START.xp,
  inventory: { ...START.inventory },
  plots: starterPlots(),
  trees: starterTrees(),
  buildingPos: {},        // id -> {x, z} موقعیت سفارشی ساختمان‌ها
  cooldowns: {},          // buildingId -> timestamp
  sound: true,
  mails: [
    { id: 'm1', title: 'به شهر لوکو خوش آمدی!', body: 'امیدواریم از ساختن شهرت لذت ببری. این هدیه‌ی کوچک از طرف تیم لوکو.', reward: { coins: 300 }, claimed: false },
    { id: 'm2', title: 'دکتر نیلا', body: 'شبنم‌های تازه رسیده! با ترکاندن درخت‌ها می‌توانی شبنم جمع کنی.', reward: { dew: 20 }, claimed: false },
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
      coins: state.coins,
      dew: state.dew,
      level: state.level,
      xp: state.xp,
      inventory: state.inventory,
      plots: state.plots,
      trees: state.trees,
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
    if (Array.isArray(data.trees)) state.trees = data.trees;
    if (Array.isArray(data.mails)) state.mails = data.mails;
    if (data.buildingPos && typeof data.buildingPos === 'object') state.buildingPos = data.buildingPos;
    // اطمینان از حداقل رطوبت و زمان‌ها
    state.plots.forEach(p => {
      if (typeof p.moisture !== 'number') p.moisture = 70;
    });
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

// ---------- جابجایی اشیاء (درگ‌اندراپ) ----------
export function setBuildingPos(id, x, z) {
  state.buildingPos[id] = { x, z };
  save();
}

export function getBuildingPos(id, fallbackX, fallbackZ) {
  const p = state.buildingPos[id];
  return p ? { x: p.x, z: p.z } : { x: fallbackX, z: fallbackZ };
}

export function setTreePos(id, x, z) {
  const t = state.trees.find(t => t.id === id);
  if (!t) return false;
  t.x = x;
  t.z = z;
  save();
  return true;
}

// ---------- درخت‌ها ----------
export function addTree(tree) {
  state.trees.push(tree);
  save();
}

export function removeTree(id) {
  state.trees = state.trees.filter(t => t.id !== id);
  save();
}

// ---------- ساختمان‌ها ----------
export function buildingReady(id, cooldownSec) {
  const at = state.cooldowns[id] || 0;
  return Date.now() >= at;
}

export function setBuildingCooldown(id) {
  state.cooldowns[id] = Date.now();
  save();
}

export function cooldownLeft(id) {
  return Math.max(0, (state.cooldowns[id] || 0) - Date.now());
}

export { TIMING };
