// ================= تالار اصلی شهر: تخت و گوی بلوری =================
// با کلیک روی «تالار اصلی شهر» باز می‌شود. لابی نقاشیِ assets/hall/hall.webp است:
//  - تخت ← لوکی صندوقچه‌ی جایزه‌ی روزانه را می‌آورد (همان جایزه‌ی قبلیِ تالار)
//  - گوی بلوری ← پیکسل تو را به «تالار بازی‌ها» می‌برد: مسیرِ سیزن با هفته‌ها، ستاره‌ها،
//    نقطه‌های عکسِ یادگاری و بازی‌های واقعیِ لوکو (public/games) داخلِ iframe
//
// مسیر از بک‌اندِ لوکو می‌آید (GET /games/path)، بازی با لینکِ امضاشده‌ی سرور باز می‌شود و
// تکمیلش به سرور می‌رود (POST /games/<slug>/complete) — سکه و ستاره و گزارشِ والدین همان‌جا ثبت
// می‌شوند. بی‌سرور (dev یا قطعی) مسیرِ محلیِ public/game-path.json (scripts/build-game-path.mjs)
// جایگزین است. قفل و بازشدنِ هفته‌ها همان منطقِ seasonData پروژه‌ی اصلی است.
// کیفِ بازی‌ها (luko_coins، سکه‌ی کم‌تعدادِ پلتفرم) از سکه‌ی شهر جداست؛ شهر برای هر مرحله‌ی
// تازه جایزه‌ی خودش را می‌دهد (CITY_COIN_RATE برابرِ سکه‌ی مرحله).
import { addCoins, addXp, buildingReady, setBuildingCooldown, cooldownLeft } from './state.js';
import { ASSET, assetUrl, CITY_COIN_RATE } from './config.js';
import { sfx } from './audio.js';
import { Interior, wait, fa, esc } from './interior.js';
import { completeMission } from './progress.js';
import { account, server } from './net/account.js';
import { openLogin } from './login.js';

// ---------- نقاشیِ تالار (۱۵۳۶×۶۹۰ بعد از بریدنِ نوارهای سیاه) ----------
const IMG = { w: 1536, h: 690 };
const SPOTS = {
  throne: { x: 690, y: 300, w: 160, h: 140, name: 'جایزه‌ی روزانه', icon: '👑' },
  ball: { x: 702, y: 432, w: 128, h: 140, name: 'گوی بازی‌ها', icon: '🔮' },
};
const VIEWS = {
  throne: [560, 190, 980, 560],
  ball: [610, 360, 925, 620],
};

// ---------- سیزن (همان پیکربندیِ seasonData پروژه‌ی اصلی) ----------
const SEASON = {
  id: 'season-1',
  title: 'سیزنِ اول',
  subtitle: 'نقشه‌ی جزیره‌ی ستاره‌ها',
  startsAt: new Date('2026-08-08T00:00:00'),
  nextHint: 'یک جنگلِ روشن پشتِ ابرهاست…',
  photoSpots: [
    { id: 'spot-1', afterStage: 2, title: 'اولین قدم', prompt: 'یه عکس از خودت بگیر تا یادت بمونه از کجا شروع کردی!' },
    { id: 'spot-2', afterStage: 6, title: 'نصفه‌ی راه', prompt: 'تا اینجا اومدی! یه عکسِ قهرمانانه بگیر.' },
    { id: 'spot-3', afterStage: 11, title: 'قله‌ی سیزن', prompt: 'نزدیکِ آخرشی — این عکس یادگاریِ سیزنِ اولته!' },
  ],
};
const DAY_MS = 24 * 60 * 60 * 1000;
const CLAIM_AFTER_MS = 3 * 60 * 1000;
const PENDING_KEY = 'luko_city_pending_completions';      // بازی‌ای که پایانش را خبر نمی‌دهد: دکمه‌ی «تموم کردم!» بعد از ۳ دقیقه

const KEYS = {
  done: 'luko_completed_games',
  stars: 'luko_game_stars',
  memories: 'luko_season_memories',
  grade: 'luko_grade',
};
const readJSON = (key, fallback) => {
  try { const raw = localStorage.getItem(key); if (raw) return JSON.parse(raw); } catch (e) { /* خراب ← پیش‌فرض */ }
  return fallback;
};
const writeJSON = (key, v) => { try { localStorage.setItem(key, JSON.stringify(v)); } catch (e) { /* پر یا بسته */ } };
const startOfDay = (d) => { const c = new Date(d); c.setHours(0, 0, 0, 0); return c; };

// چند هفته از سیزن تا امروز باز شده
export function releasedWeeks(today, totalWeeks) {
  const days = Math.floor((startOfDay(today) - startOfDay(SEASON.startsAt)) / DAY_MS);
  if (days < 0) return 0;
  return Math.min(Math.floor(days / 7) + 1, totalWeeks);
}

// وضعیتِ سیزن برای امروز: مرحله‌ی بعدی اولین نرفته‌ی هفته‌های باز است و بعدش همه قفل
export function seasonState(path, done, stars = {}, today = new Date()) {
  const totalWeeks = Math.max(1, ...path.map((s) => s.week));
  const opened = releasedWeeks(today, totalWeeks);
  const released = path.filter((s) => s.week <= opened);
  const current = released.find((s) => !done.has(s.id));
  const stages = path.map((s) => ({
    ...s,
    done: done.has(s.id),
    locked: !done.has(s.id) && (current === undefined || s.order > current.order),
    stars: done.has(s.id) ? (stars[s.id] ?? 0) : 0,
  }));
  const weeks = [];
  for (let i = 1; i <= totalWeeks; i++) {
    const list = stages.filter((s) => s.week === i);
    weeks.push({
      index: i,
      stages: list,
      open: i <= opened,
      completed: list.filter((s) => s.done).length,
      unlocksAt: new Date(SEASON.startsAt.getTime() + (i - 1) * 7 * DAY_MS),
    });
  }
  const openStages = weeks.filter((w) => w.open).flatMap((w) => w.stages);
  const clouded = weeks.filter((w) => !w.open);
  return {
    weeks,
    current,
    openStages: openStages.length,
    completedStages: openStages.filter((s) => s.done).length,
    earnedStars: openStages.reduce((n, s) => n + s.stars, 0),
    totalStars: openStages.reduce((n, s) => n + s.maxStars, 0),
    coinsEarned: openStages.filter((s) => s.done).reduce((n, s) => n + s.coinReward, 0),
    daysToNextWeek: clouded.length
      ? Math.max(0, Math.ceil((startOfDay(clouded[0].unlocksAt) - startOfDay(today)) / DAY_MS))
      : undefined,
    seasonFinished: !clouded.length && openStages.every((s) => s.done),
  };
}

// لحنِ پیکسل: گیمری و کل‌کلی (همان جمله‌های پروژه‌ی اصلی)
function tease(st) {
  const remaining = st.openStages - st.completedStages;
  if (st.completedStages === 0) return 'مسیرِ سیزن باز شد و تو هنوز تکون نخوردی! بزن بریم ببینم چند مَرده حلاجی.';
  if (remaining === 0) return 'کلِ مرحله‌های این هفته رو زدی! حالا باید صبر کنی ابرها کنار برن — منم منتظرم.';
  return `${fa(st.completedStages)} مرحله رفتی، ${fa(remaining)} تا از مرحله‌های بازشده مونده. جا نزنی!`;
}

// { source: 'server' | 'local', grades: { [grade]: stages } }
let pathCache = null;
async function loadPath() {
  if (pathCache) return pathCache;
  try {
    const list = await server.grades();
    const grades = {};
    await Promise.all(list.map(async (g) => { grades[g] = await server.path(g); }));
    pathCache = { source: 'server', grades };
  } catch (e) {
    // سرور در دسترس نیست: مسیرِ محلی (فقط برای dev و نسخه‌ی بی‌سرور)
    const res = await fetch(assetUrl('game-path.json'));
    if (!res.ok) throw new Error('path ' + res.status);
    pathCache = { source: 'local', grades: (await res.json()).grades || {} };
  }
  return pathCache;
}
// با عوض‌شدنِ حساب (ورود/خروج) مسیر و پیشرفت از نو خوانده می‌شوند
account.on(() => { pathCache = null; });

// پیشرفتِ حسابِ واردشده مرجعش سرور است؛ مهمان همان کلیدهای محلی را دارد
async function pullProgress() {
  if (!account.loggedIn()) return;
  try {
    await flushPending();
    const p = await server.progress();
    writeJSON(KEYS.done, p.completed);
    writeJSON(KEYS.stars, p.stars);
  } catch (e) { /* بی‌اینترنت: آخرین نسخه‌ی محلی */ }
}

// جایزه‌ی سرور روی کیفِ بازی‌ها (همان luko_coins که سایتِ اصلی و بازی‌ها نشان می‌دهند) — مثلِ grantCoins
function grantPlatformCoins(result) {
  const n = result && !result.alreadyDone ? Math.round(Number(result.coins) || 0) : 0;
  if (n <= 0) return;
  const cur = Math.max(0, Math.round(Number(localStorage.getItem('luko_coins')) || 0));
  try { localStorage.setItem('luko_coins', String(cur + n)); } catch (e) { /* پر */ }
}

// تکمیل‌هایی که وقتِ قطعیِ اینترنت به سرور نرسیدند
async function flushPending() {
  const list = readJSON(PENDING_KEY, []);
  if (!list.length || !account.loggedIn()) return;
  const left = [];
  for (const c of list) {
    try { grantPlatformCoins(await server.complete(c.id, c.stars)); } catch (e) { if (e.transient) left.push(c); }
  }
  writeJSON(PENDING_KEY, left);
}

export class Hall extends Interior {
  constructor(ui, building) {
    super(ui, building, {
      id: 'hall',
      img: { src: ASSET('hall/hall.webp'), w: IMG.w, h: IMG.h },
      title: 'تالار اصلی شهر',
      avatar: ASSET('hall/luki.webp'),
      views: VIEWS,
      spots: Object.values(SPOTS),
    });
    this._onMessage = (e) => this._fromGame(e);
  }

  stageHtml() {
    return `
      <div class="hl-glow" aria-hidden="true"></div>
      ${Object.entries(SPOTS).map(([id, d]) => `
        <button class="cl-door hl-spot" data-spot="${id}" aria-label="${d.name}"
          style="left:${d.x}px;top:${d.y}px;width:${d.w}px;height:${d.h}px">
          <span class="cl-door-tag hl-tag ${id}"><b>${d.icon}</b>${d.name}</span>
        </button>`).join('')}
      <img class="hl-pixel" src="${ASSET('hall/pixel.webp')}" alt="پیکسل" draggable="false">
      <img class="hl-luki" src="${ASSET('hall/luki.webp')}" alt="لوکی" draggable="false">
      <div class="hl-chest" aria-hidden="true"><i class="lid"></i><i class="box"></i><i class="lock">🔒</i></div>`;
  }

  onOpen() {
    const root = this.root;
    root.querySelectorAll('.hl-spot').forEach((b) => this.tap(b, () => this.enter(b.dataset.spot)));
    this.tap(root.querySelector('.hl-pixel'), () => this.enter('ball'));
    this.tap(root.querySelector('.hl-luki'), () => this.enter('throne'));
    this.tap(root.querySelector('.hl-chest'), () => this._openChest());
    window.addEventListener('message', this._onMessage);
    this.say('به تالار اصلی شهر خوش اومدی 👑 گوی بلوری تو رو به دنیای بازی‌ها می‌بره!', 4200);
  }

  onLeaveRoom() {
    clearInterval(this._chestT);
    clearTimeout(this._claimT);
    this._game = null;
    this.root && this.root.classList.remove('chest-on', 'chest-open', 'ball-charge', 'gaming');
  }

  onClose() {
    window.removeEventListener('message', this._onMessage);
    this.ui.hall = null;
  }

  toLobby(hint = 'تخت یا گوی بلوری رو انتخاب کن.') { super.toLobby(hint); }

  // برگشت/Esc وسطِ بازی اول به نقشه‌ی سیزن برمی‌گردد، نه به لابی
  back() {
    if (this._game) { this._closeGame(); return; }
    super.back();
  }

  async enter(spot) {
    if (this.view !== 'lobby' || this._busy) return;
    sfx.click();
    this._busy = true;
    try {
      if (spot === 'throne') {
        this.setView('throne');
        await wait(650);
        this._showChest();
      } else {
        // گوی بلوری پُر نور می‌شود و صحنه به «داخلِ گوی» می‌رود
        this.root.classList.add('ball-charge');
        sfx.levelup();
        // گوی اول نقشه‌ی بازی‌ها (مسیرِ سیزن) را باز می‌کند؛ بچه خودش مرحله را از روی نقشه انتخاب می‌کند
        await this.zoomInto('ball', () => this.safe(() => this._renderSeason()));
        this.root.classList.remove('ball-charge');
      }
    } finally {
      this._busy = false;
    }
  }

  // ================= تخت: صندوقچه‌ی جایزه‌ی روزانه =================
  _reward() { return this.building && this.building.action; }

  _showChest() {
    const a = this._reward();
    this.root.classList.add('chest-on');
    this.root.classList.remove('chest-open');
    const ready = a && buildingReady(this.building.id, a.cooldown);
    this.root.classList.toggle('chest-locked', !ready);
    if (ready) {
      sfx.pop();
      this.say(`لوکی: «صندوقچه‌ی امروزت رسید! 🎁 بزن روش تا بازش کنیم.»`);
    } else {
      this._tickChest();
      this._chestT = setInterval(() => this._tickChest(), 1000);
    }
  }

  _tickChest() {
    const a = this._reward();
    const left = a ? cooldownLeft(this.building.id, a.cooldown) / 1000 : 0;
    if (left <= 0) {
      clearInterval(this._chestT);
      this.root.classList.remove('chest-locked');
      sfx.ready();
      this.say('لوکی: «قفلش باز شد! 🎁 بزن روش.»');
      return;
    }
    const t = Math.ceil(left), m = Math.floor(t / 60), s = t % 60;
    this.say(`لوکی: «صندوقچه‌ی بعدی ${fa(m)}:${String(s).padStart(2, '0').replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[d])} دیگه آماده می‌شه ⏳»`);
  }

  async _openChest() {
    if (this.view !== 'throne' || this.root.classList.contains('chest-open')) return;
    const a = this._reward();
    if (!a || !buildingReady(this.building.id, a.cooldown)) {
      sfx.error();
      const c = this.root.querySelector('.hl-chest');
      c.classList.remove('shake'); void c.offsetWidth; c.classList.add('shake');
      return;
    }
    this.root.classList.add('chest-open');
    sfx.coin();
    if (a.coins) addCoins(a.coins);
    if (a.xp && addXp(a.xp)) this.ui.levelUp();
    setBuildingCooldown(this.building.id);
    this.ui.bumpCurrencies();
    this._coinBurst();
    const parts = [];
    if (a.coins) parts.push(`+${fa(a.coins)} سکه`);
    if (a.xp) parts.push(`+${fa(a.xp)} تجربه`);
    this.say(`لوکی: «واااای! ${parts.join('، ')} مالِ تو شد 🎉 بعداً بازم سر بزن!»`);
    await wait(2600);
  }

  // سکه‌ها از صندوقچه بیرون می‌پرند
  _coinBurst() {
    const box = document.createElement('div');
    box.className = 'hl-burst';
    for (let i = 0; i < 18; i++) {
      const c = document.createElement('img');
      c.src = ASSET('coin.webp');
      const ang = -Math.PI / 2 + (Math.random() - 0.5) * 2.2;
      const d = 140 + Math.random() * 160;
      c.style.setProperty('--tx', `${Math.cos(ang) * d}px`);
      c.style.setProperty('--ty', `${Math.sin(ang) * d}px`);
      c.style.animationDelay = `${i * 30}ms`;
      box.appendChild(c);
    }
    this.root.appendChild(box);
    setTimeout(() => box.remove(), 1800);
  }

  // ================= داخلِ گوی: تالار بازی‌ها و مسیرِ سیزن =================
  _grade() {
    // بچه‌ی واردشده پایه‌ی خودِ حسابش را دارد؛ مهمان خودش انتخاب می‌کند
    const g = account.grade() || Number(localStorage.getItem(KEYS.grade));
    return g >= 1 && g <= 6 ? g : 1;
  }

  async _renderSeason() {
    this.sceneEl.className = 'cl-scene room-season';
    this.sceneEl.innerHTML = `<div class="ss-loading"><img src="${ASSET('hall/pixel.webp')}" alt=""><p>پیکسل داره مسیرت رو آماده می‌کنه…</p></div>`;
    let loaded;
    try {
      [loaded] = await Promise.all([loadPath(), pullProgress()]);
    } catch (e) {
      this.sceneEl.innerHTML = `<div class="ss-loading"><img src="${ASSET('hall/pixel.webp')}" alt="">
        <p>مسیر باز نشد! اینترنتت رو چک کن و دوباره بیا 🔌</p>
        <button class="cl-btn green" data-retry>دوباره امتحان کن</button></div>`;
      this.sceneEl.querySelector('[data-retry]').addEventListener('click', () => this.safe(() => this._renderSeason()));
      return;
    }
    this._grades = loaded.grades;
    this._source = loaded.source;
    this._drawSeason();
  }

  _drawSeason() {
    const grade = this._grade();
    const path = this._grades[grade] || [];
    const done = new Set(readJSON(KEYS.done, []));
    const st = seasonState(path, done, readJSON(KEYS.stars, {}));
    this._st = st;
    const memories = readJSON(KEYS.memories, {});
    const available = account.loggedIn() ? [] : Object.keys(this._grades).map(Number).sort((a, b) => a - b);

    // مسیر از پایین به بالا خوانده می‌شود: هفته‌ی اول پایینِ صفحه، ابرها بالا
    let n = 0;
    const node = (s) => {
      const x = Math.sin(n++ * 1.1) * 30;
      const cls = s.done ? 'done' : s.locked ? 'locked' : 'open';
      const isCur = st.current && st.current.id === s.id;
      const stars = s.done ? `<span class="ss-stars">${'★'.repeat(s.stars)}<i>${'★'.repeat(Math.max(0, s.maxStars - s.stars))}</i></span>` : '';
      return `<div class="ss-row" style="--x:${x}%">
        <button class="ss-node ${cls} ${isCur ? 'current' : ''} look-${(s.order - 1) % 6}" data-stage="${esc(s.id)}" aria-label="${esc(s.title)}">
          <span class="num">${s.locked ? '🔒' : fa(s.order)}</span>
          ${isCur ? `<img class="ss-me" src="${ASSET('hall/pixel.webp')}" alt="">` : ''}
        </button>
        <span class="ss-label">${esc(s.title)}</span>${stars}
      </div>`;
    };
    const spotHtml = (sp) => {
      const thumb = memories[sp.id];
      const reached = st.completedStages >= sp.afterStage;
      return `<div class="ss-row" style="--x:${Math.sin(n++ * 1.1) * 30}%">
        <button class="ss-photo ${reached ? '' : 'far'}" data-spot="${sp.id}" aria-label="${esc(sp.title)}">
          ${thumb ? `<img src="${thumb}" alt="">` : '<span>📸</span>'}
        </button><span class="ss-label">${esc(sp.title)}</span></div>`;
    };
    const weeksHtml = st.weeks.map((w) => {
      if (!w.open) {
        return `<section class="ss-week clouded"><div class="ss-cloud">☁️☁️☁️</div>
          <p>هفته‌ی ${fa(w.index)} پشتِ ابرهاست</p><small>${fa(Math.max(0, Math.ceil((startOfDay(w.unlocksAt) - startOfDay(new Date())) / DAY_MS)))} روز دیگه باز می‌شه</small></section>`;
      }
      const rows = [];
      for (const s of w.stages) {
        rows.push(node(s));
        for (const sp of SEASON.photoSpots) if (sp.afterStage === s.order) rows.push(spotHtml(sp));
      }
      return `<section class="ss-week ${w.completed === w.stages.length ? 'clear' : ''}">
        <h3>هفته‌ی ${fa(w.index)} <small>${fa(w.completed)} از ${fa(w.stages.length)}</small></h3>
        <div class="ss-path">${rows.join('')}</div></section>`;
    }).reverse().join('');

    const pct = st.totalStars ? Math.round(st.earnedStars / st.totalStars * 100) : 0;
    this.sceneEl.innerHTML = `
      <div class="ss-sky"></div>
      <div class="ss-top">
        <div class="ss-host">
          <img src="${ASSET('hall/pixel.webp')}" alt="پیکسل">
          <div class="ss-bubble"><b>پیکسل، باحالِ شهر لوکو</b><p>${path.length ? tease(st) : `بازی‌های کلاس ${fa(grade)} تو راهن!`}</p></div>
        </div>
        <div class="ss-banner">
          <div class="ss-title"><b>⚡ تالار بازی‌ها</b><span>${SEASON.title} — ${SEASON.subtitle}</span></div>
          <div class="ss-stats">
            <span>🏁 ${fa(st.completedStages)}/${fa(st.openStages)}</span>
            <span>⭐ ${fa(st.earnedStars)}/${fa(st.totalStars)} <small>(${fa(pct)}٪)</small></span>
            <span>🪙 ${fa(st.coinsEarned)}</span>
          </div>
          <div class="ss-grades">${available.map((g) => `<button class="${g === grade ? 'on' : ''}" data-grade="${g}">کلاس ${fa(g)}</button>`).join('')}</div>
        </div>
      </div>
      <div class="ss-scroll">
        ${st.seasonFinished && path.length ? '<p class="ss-end">کلِ سیزن رو تموم کردی! 🏆 سیزنِ بعدی با مرحله‌های تازه در راهه.</p>' : ''}
        ${st.daysToNextWeek !== undefined ? `<p class="ss-next">${SEASON.nextHint}</p>` : ''}
        ${weeksHtml || '<p class="ss-end">هنوز مرحله‌ای برای این کلاس نیست.</p>'}
        <div class="ss-start">🚩 شروعِ مسیر</div>
      </div>
      <div class="ss-game"></div>`;

    const scene = this.sceneEl;
    scene.querySelectorAll('.ss-grades button').forEach((b) => b.addEventListener('click', () => this.safe(() => {
      sfx.click();
      localStorage.setItem(KEYS.grade, b.dataset.grade);
      this._drawSeason();
    })));
    scene.querySelectorAll('.ss-node').forEach((b) => b.addEventListener('click', () => this.safe(() => this._pickStage(b))));
    scene.querySelectorAll('.ss-photo').forEach((b) => b.addEventListener('click', () => this.safe(() => this._memory(b.dataset.spot))));
    // مرحله‌ی فعلی وسطِ صفحه
    const cur = scene.querySelector('.ss-node.current') || scene.querySelector('.ss-node.done:last-of-type');
    const scroller = scene.querySelector('.ss-scroll');
    // فقط خودِ فهرست اسکرول می‌شود؛ scrollIntoView والدهای overflow:hidden را هم جابه‌جا می‌کرد
    requestAnimationFrame(() => {
      if (!cur) { scroller.scrollTop = scroller.scrollHeight; return; }
      // صحنه هنوز در انیمیشنِ ورود (scale) است؛ فاصله‌ها به اندازه‌ی واقعی برگردانده می‌شوند
      const a = cur.getBoundingClientRect(), b = scroller.getBoundingClientRect();
      const k = b.height / (scroller.offsetHeight || b.height) || 1;
      scroller.scrollTop += (a.top - b.top) / k - (scroller.clientHeight - cur.offsetHeight) / 2;
    });
  }

  _pixelSay(text) {
    const p = this.sceneEl.querySelector('.ss-bubble p');
    if (p) p.innerHTML = text;
  }

  _pickStage(btn) {
    const path = this._grades[this._grade()] || [];
    const stage = path.find((s) => s.id === btn.dataset.stage);
    if (!stage) return;
    if (btn.classList.contains('locked')) {
      sfx.error();
      btn.classList.remove('shake'); void btn.offsetWidth; btn.classList.add('shake');
      this._pixelSay('هی هی! اول مرحله‌ی قبلی رو تموم کن، بعد بیا اینجا 😏');
      return;
    }
    sfx.ready();
    this._play(stage);
  }

  // ---------- اجرای بازی ----------
  async _play(stage) {
    if (this._opening) return;
    const box = this.sceneEl.querySelector('.ss-game');
    let src;
    if (this._source === 'server') {
      this._opening = true;
      try {
        src = await server.playLink(stage.id);
      } catch (e) {
        if (e.status === 401) {
          // مهمان فقط مرحله‌ی اولِ هر کلاس را دارد
          this._pixelSay('برای این مرحله باید وارد حسابت بشی! 🔑');
          openLogin(this.ui, { onDone: (u) => { if (u) this._renderSeason(); } });
        } else {
          sfx.error();
          this._pixelSay(e.transient ? 'اینترنت قطعه! وصل که شد دوباره بزن 🔌' : (e.message || 'این مرحله باز نشد.'));
        }
        return;
      } finally { this._opening = false; }
      if (!this.sceneEl.contains(box)) return;
    } else {
      src = assetUrl('games/' + stage.file);
    }
    this._game = { stage, won: false };
    this.root.classList.add('gaming');
    box.innerHTML = `
      <div class="ss-gbar">
        <button class="cl-btn ghost" data-close>➜ نقشه</button>
        <b>${esc(stage.title)}</b>
        <button class="cl-btn green ss-claim" data-claim hidden>تموم کردم! ✅</button>
      </div>
      <iframe src="${esc(src)}" title="${esc(stage.title)}" sandbox="allow-scripts allow-same-origin" allow="autoplay; fullscreen"></iframe>
      <div class="ss-win"></div>`;
    box.classList.add('show');
    box.querySelector('[data-close]').addEventListener('click', () => this.safe(() => this._closeGame()));
    box.querySelector('[data-claim]').addEventListener('click', () => this.safe(() => this._finish(stage.id, undefined)));
    clearTimeout(this._claimT);
    this._claimT = setTimeout(() => { const c = box.querySelector('[data-claim]'); if (c) c.hidden = false; }, CLAIM_AFTER_MS);
  }

  _closeGame() {
    sfx.click();
    clearTimeout(this._claimT);
    this._game = null;
    this.root.classList.remove('gaming');
    const box = this.sceneEl.querySelector('.ss-game');
    box.classList.remove('show');
    box.innerHTML = '';
    this._drawSeason();
  }

  // پیام‌های بازیِ داخلِ iframe (فقط هم‌ریشه)
  _fromGame(e) {
    if (!this._game || e.origin !== window.location.origin) return;
    const d = e.data || {};
    if (d.type === 'luko-game-complete') {
      const raw = d.summary && d.summary.stars;
      this._finish(this._game.stage.id, typeof raw === 'number' && Number.isFinite(raw) && raw >= 0 ? Math.round(raw) : undefined);
    }
  }

  _finish(id, stars) {
    const g = this._game;
    if (!g || g.won || g.stage.id !== id) return;
    g.won = true;
    clearTimeout(this._claimT);
    const done = new Set(readJSON(KEYS.done, []));
    const first = !done.has(id);
    done.add(id);
    writeJSON(KEYS.done, [...done]);
    const best = readJSON(KEYS.stars, {});
    const got = stars === undefined ? (best[id] ?? g.stage.maxStars) : Math.min(stars, g.stage.maxStars);
    best[id] = Math.max(best[id] ?? 0, got);
    writeJSON(KEYS.stars, best);
    const cityCoins = g.stage.coinReward * CITY_COIN_RATE;
    if (first) { addCoins(cityCoins); if (addXp(20)) this.ui.levelUp(); this.ui.bumpCurrencies(); }
    // سرور جایزه‌ی پلتفرم (سکه‌ی بازی‌ها، شبنمِ باغچه) و گزارشِ والدین را ثبت می‌کند
    if (this._source === 'server' && account.loggedIn()) {
      server.complete(id, stars).then(grantPlatformCoins).catch((e) => {
        if (e.transient) writeJSON(PENDING_KEY, [...readJSON(PENDING_KEY, []), { id, stars }]);
      });
    }
    completeMission('game', this.ui);   // مأموریتِ «یه بازی رو کامل کن»
    sfx.levelup();
    const path = this._grades[this._grade()] || [];
    const next = path.find((s) => s.order === g.stage.order + 1);
    const win = this.sceneEl.querySelector('.ss-win');
    win.innerHTML = `
      <div class="ss-wincard">
        <img src="${ASSET('hall/pixel.webp')}" alt="">
        <h3>${first ? 'مرحله رو بردی! 🎉' : 'دوباره بردی! 💪'}</h3>
        <div class="ss-winstars">${[...Array(g.stage.maxStars)].map((_, i) => `<span class="${i < got ? 'on' : ''}" style="--d:${i * 180}ms">★</span>`).join('')}</div>
        ${first ? `<p class="ss-coins">🪙 +${fa(cityCoins)} سکه‌ی شهر · ⭐ +${fa(20)} تجربه</p>` : ''}
        ${!account.loggedIn() ? '<p class="ss-guest">مهمانی! برای اینکه پیشرفتت گم نشه، وارد حسابت شو 🔑</p>' : ''}
        <div class="vt-row">
          ${next ? '<button class="cl-btn green" data-next>مرحله‌ی بعد ➜</button>' : ''}
          <button class="cl-btn ghost" data-map>برگشت به نقشه</button>
        </div>
      </div>`;
    win.classList.add('show');
    win.querySelector('[data-map]').addEventListener('click', () => this.safe(() => this._closeGame()));
    const nb = win.querySelector('[data-next]');
    if (nb) nb.addEventListener('click', () => this.safe(() => {
      // مرحله‌ی بعد فقط اگر بازشده باشد (هفته‌اش رسیده باشد)
      const st = seasonState(path, new Set(readJSON(KEYS.done, [])), readJSON(KEYS.stars, {}));
      const ok = st.weeks.some((w) => w.open && w.stages.some((s) => s.id === next.id && !s.locked));
      if (!ok) { this._closeGame(); this._pixelSay(`مرحله‌ی بعد هنوز پشتِ ابرهاست! ${st.daysToNextWeek !== undefined ? fa(st.daysToNextWeek) + ' روز دیگه.' : ''}`); return; }
      this._play(next);
    }));
  }

  // ---------- عکسِ یادگاری ----------
  _memory(spotId) {
    const sp = SEASON.photoSpots.find((s) => s.id === spotId);
    if (!sp) return;
    const st = this._st;
    if (st.completedStages < sp.afterStage) {
      sfx.error();
      this._pixelSay(`این ایستگاهِ عکس بعد از مرحله‌ی ${fa(sp.afterStage)} باز می‌شه 📸`);
      return;
    }
    sfx.click();
    const memories = readJSON(KEYS.memories, {});
    const box = this.sceneEl.querySelector('.ss-win');
    box.innerHTML = `
      <div class="ss-wincard ss-memo">
        <h3>📸 ${esc(sp.title)}</h3>
        <p>${esc(sp.prompt)}</p>
        <div class="ss-polaroid">${memories[sp.id] ? `<img src="${memories[sp.id]}" alt="">` : '<span>🙂</span>'}</div>
        <div class="vt-row">
          <label class="cl-btn blue">📷 ${memories[sp.id] ? 'عکسِ تازه' : 'عکس بگیر'}<input type="file" accept="image/*" capture="user" hidden></label>
          ${memories[sp.id] ? '<button class="cl-btn red" data-del>🗑️</button>' : ''}
          <button class="cl-btn ghost" data-close>بستن</button>
        </div>
      </div>`;
    box.classList.add('show');
    const close = () => { box.classList.remove('show'); box.innerHTML = ''; this._drawSeason(); };
    box.querySelector('[data-close]').addEventListener('click', () => this.safe(close));
    const del = box.querySelector('[data-del]');
    if (del) del.addEventListener('click', () => this.safe(() => { const m = readJSON(KEYS.memories, {}); delete m[sp.id]; writeJSON(KEYS.memories, m); sfx.drop(); close(); }));
    box.querySelector('input').addEventListener('change', (e) => this.safe(async () => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      const thumb = await toThumb(file, 360);
      const m = readJSON(KEYS.memories, {});
      m[sp.id] = thumb;
      writeJSON(KEYS.memories, m);
      sfx.levelup();
      close();
      this._pixelSay('چه عکسِ باحالی! 😎 گذاشتمش روی نقشه.');
    }));
  }
}

// عکس → بندانگشتیِ JPEG مربعی (برای قابِ پولاروید)
function toThumb(file, size) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = c.height = size;
      const s = Math.min(img.width, img.height);
      c.getContext('2d').drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, size, size);
      URL.revokeObjectURL(img.src);
      resolve(c.toDataURL('image/jpeg', 0.75));
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

export function openHall(ui, building) {
  if (ui.hall) return ui.hall;
  ui.hall = new Hall(ui, building);
  ui.hall.open();
  return ui.hall;
}
