// ================= هم‌رسانیِ داده‌ی بچه با حسابش (GET/POST /sync) =================
// همان موتورِ فرانتِ اصلی (New LUKO/frontend/src/features/sync) به جاوااسکریپتِ ساده:
//  ۱. تغییراتِ سرور از آخرین بار گرفته می‌شود؛
//  ۲. هر کلید سه‌طرفه ادغام می‌شود — پایه آخرین مقدارِ هم‌رسان‌شده است، پس سکه‌ای که روی
//     گوشی و سایت هم‌زمان گرفته شده جمع می‌شود نه جای هم؛
//  ۳. نتیجه در localStorage نوشته و آنچه سرور ندارد فرستاده می‌شود (فقط روی نسخه‌ای که دیده‌ایم).
// کلیدها و قاعده‌ها همانِ syncKeys.ts هستند، به‌اضافه‌ی کلیدهای خودِ شهر (ذخیره‌ی شهر، مدال‌ها…).
// متا جدا از سایتِ اصلی نگه داشته می‌شود تا دو موتور پایه‌ی همدیگر را پاک نکنند؛ هر دو روی همان
// مقدارهای localStorage کار می‌کنند و چون «مقدارِ برابر» زودتر از هر قاعده‌ای برنده است، هم‌گرا می‌مانند.
import { http, tokens, ApiError } from './api.js';

export const CITY_SAVE_KEY = 'luko-city-save-v1';
const META_KEY = 'luko_sync_meta_city';
const STASH_PREFIX = 'luko_sync_cstash_';
const MAX_VALUE = 200 * 1024;
const MAX_ROUNDS = 3;
const BATCH = 150;
const EVERY_MS = 30000;
const DEBOUNCE_MS = 1500;
const DAILY_KEEP_DAYS = 2;

// ---------- کدام کلید با چه قاعده‌ای ----------
const NEVER = new Set([
  'luko_access_token', 'luko_refresh_token', 'luko_parent_access_token', 'luko_parent_refresh_token',
  'luko_session_user', 'luko_parent_session_user', 'luko_guest', 'luko_parent_guest',
  'luko_query_cache', 'luko_pending_completions', 'luko_pending_events',
  // مرجعشان سرور است
  'luko_completed_games', 'luko_treasures', 'luko_game_stars', 'luko_grade',
  'luko_city_pending_completions',
]);
const EXACT = {
  luko_coins: 'counter',
  luko_club_total: 'counter',
  luko_club_days: 'set',
  luko_club_owned: 'set',
  luko_medal_dew: 'set',
  luko_podcast_listened: 'set',
  luko_garden_state: 'garden',
  luko_settings: 'object',
  luko_last_mood_time: 'max',
  luko_last_mood: 'scalar',
  luko_art_log: 'list-at',
  luko_secrets: 'list-id',
  luko_active_user_cache: 'scalar',
  luko_local_users: 'scalar',
  // مالِ شهر
  [CITY_SAVE_KEY]: 'scalar',
  luko_medals_earned: 'set',
  luko_cinema_tickets: 'scalar',
  luko_season_memories: 'object',
};
const DAILY = [
  [/^luko_club_done_(\d{4}-\d{2}-\d{2})$/, 'set'],
  [/^luko_sport_done_(\d{4}-\d{2}-\d{2})$/, 'set'],
  [/^luko_dew_time_(\d{4}-\d{2}-\d{2})$/, 'counter'],
];

function recent(day, now) {
  const oldest = new Date(now);
  oldest.setDate(oldest.getDate() - DAILY_KEEP_DAYS);
  return day >= oldest.toLocaleDateString('en-CA');
}

export function strategyFor(key, now = new Date()) {
  if (NEVER.has(key) || key.startsWith('luko_sync_')) return null;
  if (EXACT[key]) return EXACT[key];
  for (const [re, s] of DAILY) {
    const m = re.exec(key);
    if (m) return recent(m[1], now) ? s : null;
  }
  if (key.startsWith('luko_guide_')) return 'flag';
  if (key.startsWith('luko_') || key.startsWith('luko-')) return null;
  // بقیه را بازی‌های داخلِ iframe نوشته‌اند (قالب‌ها، مرحله‌ها، خریدهای داخلِ بازی)
  return 'scalar';
}

// ---------- ادغامِ سه‌طرفه (merge.ts) ----------
export function mergeValue(strategy, base, local, server) {
  if (local === server) return local;
  if (base !== undefined) {
    if (local === base) return server;
    if (server === base) return local;
  }
  try { return mergeBoth(strategy, base, local, server); } catch (e) { return local ?? server; }
}

function mergeBoth(strategy, base, local, server) {
  if (local === null) return server;
  if (server === null) return local;
  switch (strategy) {
    case 'counter': return String(mergeNumber(num(base), num(local), num(server)));
    case 'max': return String(Math.max(num(local) ?? 0, num(server) ?? 0));
    case 'set': return JSON.stringify(mergeSet(list(base), list(local), list(server), String));
    case 'list-id': return JSON.stringify(mergeSet(list(base), list(local), list(server), (x) => String(x.id)));
    case 'list-at':
      return JSON.stringify(mergeSet(list(base), list(local), list(server), (x) => String(x.at))
        .sort((a, b) => Number(b.at) - Number(a.at)));
    case 'object': return JSON.stringify(mergeObject(obj(base), obj(local), obj(server), !base));
    case 'garden': return JSON.stringify(mergeGarden(obj(base), obj(local), obj(server)));
    default: return base === undefined ? server : local;
  }
}

const num = (raw) => {
  if (raw === null || raw === undefined) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
};
function list(raw) {
  if (raw === null || raw === undefined) return null;
  const v = JSON.parse(raw);
  if (!Array.isArray(v)) throw new Error('not a list');
  return v;
}
function obj(raw) {
  if (raw === null || raw === undefined) return null;
  const v = JSON.parse(raw);
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error('not an object');
  return v;
}

export function mergeNumber(base, local, server) {
  const l = local ?? 0, s = server ?? 0;
  if (base === null) return Math.max(l, s);
  return Math.max(0, s + (l - base));
}

export function mergeSet(base, local, server, id) {
  const localIds = new Set(local.map(id));
  const serverIds = new Set(server.map(id));
  const baseIds = new Set((base || []).map(id));
  const localById = new Map(local.map((x) => [id(x), x]));
  const removedHere = base ? new Set([...baseIds].filter((k) => !localIds.has(k))) : new Set();
  const out = [], taken = new Set();
  for (const item of server) {
    const k = id(item);
    if (removedHere.has(k) || taken.has(k)) continue;
    out.push(localById.get(k) ?? item);
    taken.add(k);
  }
  for (const item of local) {
    const k = id(item);
    if (taken.has(k)) continue;
    if (base && baseIds.has(k) && !serverIds.has(k)) continue;
    out.push(item);
    taken.add(k);
  }
  return out;
}

export function mergeObject(base, local, server, preferServer) {
  if (!base) return preferServer ? { ...local, ...server } : { ...server, ...local };
  const out = {};
  for (const key of new Set([...Object.keys(base), ...Object.keys(local), ...Object.keys(server)])) {
    const changedHere = JSON.stringify(local[key]) !== JSON.stringify(base[key]);
    const source = changedHere ? local : server;
    if (key in source) out[key] = source[key];
  }
  return out;
}

function gardenScore(g) {
  const plants = Array.isArray(g.plants) ? g.plants : [];
  return (Number(g.plotLevel) || 0) * 1000
    + plants.reduce((s, p) => s + (Number(p.care) || 0), 0) * 10
    + (Array.isArray(g.decor) ? g.decor.length : 0) * 50
    + (Number(g.dew) || 0);
}

function mergeGarden(base, local, server) {
  if (!base) return gardenScore(local) > gardenScore(server) ? local : server;
  const out = mergeObject(base, local, server, false);
  const n = (o, k) => (typeof o[k] === 'number' ? o[k] : null);
  for (const k of ['dew', 'fertilizer', 'seeds']) out[k] = mergeNumber(n(base, k), n(local, k), n(server, k));
  out.waterCharges = Math.min(
    mergeNumber(n(base, 'waterCharges'), n(local, 'waterCharges'), n(server, 'waterCharges')),
    Math.max(n(local, 'waterCharges') ?? 0, n(server, 'waterCharges') ?? 0),
  );
  out.plotLevel = Math.max(n(local, 'plotLevel') ?? 1, n(server, 'plotLevel') ?? 1);
  for (const k of ['lastRefillAt', 'seasonStartAt', 'lastWateredAt']) {
    const vs = [local[k], server[k]].filter((v) => typeof v === 'number');
    out[k] = vs.length ? Math.max(...vs) : (local[k] ?? server[k] ?? null);
  }
  const arr = (o, k) => (Array.isArray(o[k]) ? o[k] : []);
  out.decor = mergeSet(arr(base, 'decor'), arr(local, 'decor'), arr(server, 'decor'), String);
  delete out.dewLog;
  const basePlants = new Map(arr(base, 'plants').map((p) => [p.id, p]));
  const serverPlants = new Map(arr(server, 'plants').map((p) => [p.id, p]));
  out.plants = mergeSet(arr(base, 'plants'), arr(local, 'plants'), arr(server, 'plants'), (p) => p.id).map((p) => {
    const b = basePlants.get(p.id), s = serverPlants.get(p.id);
    if (!b || !s) return p;
    return { ...p, care: mergeNumber(b.care ?? 0, p.care ?? 0, s.care ?? 0) };
  });
  return out;
}

// ---------- موتور ----------
const readJSON = (k) => { try { const r = localStorage.getItem(k); return r ? JSON.parse(r) : null; } catch (e) { return null; } };
const writeJSON = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* پر */ } };
const tooBig = (v) => v !== null && v !== undefined && v.length > MAX_VALUE;

function owner() {
  if (!tokens.access()) return null;
  const u = tokens.user();
  return u && u.role === 'student' ? u.id : null;
}

function syncedLocalKeys(now = new Date()) {
  const out = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && strategyFor(k, now)) out.push(k);
  }
  return out;
}

let notifying = false;
function notify(changed) {
  if (!changed.length) return;
  notifying = true;
  try { window.dispatchEvent(new CustomEvent('luko:account-synced', { detail: changed })); } finally { notifying = false; }
}
function writeLocal(key, value, changed) {
  const old = localStorage.getItem(key);
  if (old === value) return;
  try {
    if (value === null) localStorage.removeItem(key); else localStorage.setItem(key, value);
    changed.push(key);
  } catch (e) { /* پر: دفعه‌ی بعد */ }
}

// هم‌رسان نمی‌شوند (مرجعشان سرور است) ولی مالِ همین بچه‌اند؛ با او کنار می‌روند و برمی‌گردند.
// صفِ تکمیل‌های آفلاین نباید به نامِ بچه‌ی بعدی فرستاده شود.
const PRIVATE = ['luko_completed_games', 'luko_game_stars', 'luko_city_pending_completions'];

// داده‌ی بچه‌ی قبلی کنار می‌رود تا بچه‌ی بعدی (یا مهمان) آن را نبیند
function stashAndClear(meta, changed) {
  const values = {};
  for (const k of [...syncedLocalKeys(), ...PRIVATE]) { const v = localStorage.getItem(k); if (v !== null) values[k] = v; }
  writeJSON(STASH_PREFIX + meta.owner, { meta, values });
  for (const k of Object.keys(values)) writeLocal(k, null, changed);
  localStorage.removeItem(META_KEY);
}
function restoreStash(who, changed) {
  const s = readJSON(STASH_PREFIX + who);
  if (!s) return null;
  for (const [k, v] of Object.entries(s.values || {})) writeLocal(k, v, changed);
  localStorage.removeItem(STASH_PREFIX + who);
  return s.meta && s.meta.owner === who ? s.meta : null;
}

const status = { state: 'idle', at: null };
export const syncStatus = () => ({ ...status });
function setStatus(state) {
  status.state = state;
  if (state === 'ok') status.at = Date.now();
  window.dispatchEvent(new CustomEvent('luko:sync-status', { detail: syncStatus() }));
}

async function syncOnce() {
  const who = owner();
  if (!who) return null;
  const lost = () => owner() !== who;
  const changed = [];
  let meta = readJSON(META_KEY);
  // این دستگاه داده‌ای دارد که هنوز به هیچ حسابی نرسیده (بازیِ مهمان قبل از ورود)؟ همان را نگه می‌داریم
  if (meta && meta.owner !== who) { stashAndClear(meta, changed); meta = null; }
  if (!meta) meta = restoreStash(who, changed) || { owner: who, since: null, base: {}, versions: {} };

  setStatus('syncing');
  let pulled;
  try {
    pulled = await http.get('/sync', meta.since ? { since: meta.since } : undefined);
  } catch (e) {
    if (lost()) return null;
    writeJSON(META_KEY, meta);
    notify(changed);
    setStatus('offline');
    return null;
  }
  if (lost()) return null;

  const now = new Date();
  const serverItems = new Map((pulled.items || []).map((it) => [it.key, it]));
  // حسابی که کیفِ هم‌رسان‌شده ندارد و این دستگاه هم کیف ندارد: موجودیِ خودِ سرور نقطه‌ی شروع است
  if (meta.since === null && !serverItems.has('luko_coins') && localStorage.getItem('luko_coins') === null) {
    try {
      const p = await http.get('/users/me/profile');
      if (lost()) return null;
      const c = Number(p && p.coins);
      writeLocal('luko_coins', String(Number.isInteger(c) && c >= 0 ? c : 0), changed);
    } catch (e) { /* بی‌آن */ }
  }

  const keys = new Set([...serverItems.keys(), ...syncedLocalKeys(now), ...Object.keys(meta.base)]);
  let pending = [];
  const pendingValues = new Map();
  for (const key of keys) {
    const strategy = strategyFor(key, now);
    if (!strategy) { delete meta.base[key]; delete meta.versions[key]; continue; }
    const hasBase = key in meta.base;
    const base = hasBase ? meta.base[key] : undefined;
    const item = serverItems.get(key);
    const server = item ? item.value : hasBase ? base : null;
    const serverVersion = item ? item.version : (meta.versions[key] ?? 0);
    const local = localStorage.getItem(key);
    if (tooBig(local) || tooBig(server)) continue;
    const merged = mergeValue(strategy, base, local, server);
    writeLocal(key, merged, changed);
    if (merged !== server) {
      pending.push({ key, value: merged, baseVersion: serverVersion });
      pendingValues.set(key, merged);
    } else {
      meta.base[key] = merged;
      meta.versions[key] = serverVersion;
    }
  }

  let pushed = 0;
  for (let round = 0; round < MAX_ROUNDS && pending.length; round++) {
    const next = [];
    for (let i = 0; i < pending.length; i += BATCH) {
      let res;
      try {
        res = await http.post('/sync', { changes: pending.slice(i, i + BATCH) });
      } catch (e) {
        if (lost()) return null;
        writeJSON(META_KEY, meta);
        notify(changed);
        setStatus(e instanceof ApiError && !e.transient && e.status !== 409 ? 'error' : 'offline');
        return { pushed, changed };
      }
      if (lost()) return null;
      for (const { key, version } of res.applied || []) {
        meta.base[key] = pendingValues.get(key) ?? null;
        meta.versions[key] = version;
        pushed++;
      }
      for (const c of res.conflicts || []) {
        const strategy = strategyFor(c.key, now);
        if (!strategy) continue;
        const base = c.key in meta.base ? meta.base[c.key] : undefined;
        const merged = mergeValue(strategy, base, localStorage.getItem(c.key), c.value);
        writeLocal(c.key, merged, changed);
        if (merged === c.value) { meta.base[c.key] = merged; meta.versions[c.key] = c.version; }
        else { next.push({ key: c.key, value: merged, baseVersion: c.version }); pendingValues.set(c.key, merged); }
      }
    }
    pending = next;
  }
  meta.since = pulled.since;
  writeJSON(META_KEY, meta);
  notify(changed);
  setStatus('ok');
  return { pushed, changed };
}

let running = null, again = false;
export function syncAccount() {
  if (running) { again = true; return running; }
  running = syncOnce().catch((e) => { console.warn('[sync]', e); setStatus('error'); return null; }).finally(() => {
    running = null;
    if (again) { again = false; syncAccount(); }
  });
  return running;
}

// خروجِ بچه: آخرین تغییرات با همان توکن، بعد داده‌اش از دستگاه کنار می‌رود
export async function leaveAccount() {
  const who = owner();
  if (!who) return;
  const token = tokens.access();
  const meta = readJSON(META_KEY);
  const cur = meta && meta.owner === who ? meta : { owner: who, since: null, base: {}, versions: {} };
  const dirty = [];
  for (const k of syncedLocalKeys()) {
    const v = localStorage.getItem(k);
    if (k in cur.base && cur.base[k] === v) continue;
    if (tooBig(v)) continue;
    dirty.push({ key: k, value: v, baseVersion: cur.versions[k] ?? 0 });
  }
  const changed = [];
  stashAndClear(cur, changed);
  notify(changed);
  if (!dirty.length || !token) return;
  try {
    const res = await http.post('/sync', { changes: dirty.slice(0, BATCH) }, { token });
    if (!(res.conflicts || []).length && dirty.length <= BATCH) localStorage.removeItem(STASH_PREFIX + who);
  } catch (e) { /* بی‌اینترنت: کنارگذاشته می‌ماند */ }
}

// نشست از سمتِ سرور بسته شد (ورود از دستگاهِ دیگر) یا خروج: داده‌ی این بچه کنار می‌رود — نه پاک —
// تا اگر همین بچه دوباره روی همین دستگاه وارد شد، آنچه هنوز نفرستاده بود ادغام و فرستاده شود
export function setAsideSession() {
  const meta = readJSON(META_KEY);
  if (!meta || owner() === meta.owner) return false;
  stashAndClear(meta, []);
  return true;
}

let timer = null;
function schedule() {
  clearTimeout(timer);
  timer = setTimeout(() => { timer = null; syncAccount(); }, DEBOUNCE_MS);
}

let started = false;
export function startAccountSync() {
  if (started) return;
  started = true;
  const proto = Storage.prototype;
  const setItem = proto.setItem, removeItem = proto.removeItem;
  proto.setItem = function (k, v) {
    setItem.call(this, k, v);
    if (this === localStorage && !notifying && owner() && strategyFor(k)) schedule();
  };
  proto.removeItem = function (k) {
    removeItem.call(this, k);
    if (this === localStorage && !notifying && owner() && strategyFor(k)) schedule();
  };
  // نوشتنِ بازی‌های داخلِ iframe و تبِ دیگر
  window.addEventListener('storage', (e) => { if (!notifying && e.key && strategyFor(e.key)) schedule(); });
  window.addEventListener('online', () => syncAccount());
  window.addEventListener('luko:session-changed', () => syncAccount());
  window.addEventListener('luko:session-ended', setAsideSession);
  document.addEventListener('visibilitychange', () => {
    // رفتن از اپ: همین حالا بفرست تا گم نشود
    syncAccount();
  });
  setInterval(() => { if (document.visibilityState === 'visible') syncAccount(); }, EVERY_MS);
}
