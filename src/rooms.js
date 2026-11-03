// ================= شورای شهر و خونه‌ی من =================
// این دو ساختمان هنوز نقاشیِ داخلی ندارند؛ اتاقشان با CSS ساخته شده ولی همان پوسته‌ی بازیِ
// بقیه‌ی ساختمان‌ها را دارد (نوارِ بالا، حباب، دکمه‌های برجسته):
//  - شورا: خزانه‌ی شهر (همان «بودجه شهر» قبلی) + گزارشِ شهری که بچه ساخته، با پری
//  - خونه‌ی من: اتاقِ خودِ بچه؛ تخت (استراحت = همان جایزه‌ی قبلی)، نقاشی‌هایش در قاب،
//    قفسه‌ی مدال‌ها و عکس‌های یادگاری، و کارتِ پروفایل (لول، تجربه، رتبه، استریک)
import { state, addCoins, addXp, buildingReady, setBuildingCooldown, cooldownLeft } from './state.js';
import { ASSET, xpForLevel } from './config.js';
import { sfx } from './audio.js';
import { fa, esc, wait } from './interior.js';
import { medals, clubState, streakOf } from './progress.js';
import { ranking } from './board.js';

const readJSON = (key, fallback) => {
  try { const raw = localStorage.getItem(key); if (raw) return JSON.parse(raw); } catch (e) { /* خراب ← پیش‌فرض */ }
  return fallback;
};

// پایه‌ی اتاق‌های بی‌نقاشی: همان کلاس‌های .interior و نوارِ بالا
class Room {
  constructor(ui, building, { id, title, avatar }) {
    this.ui = ui;
    this.building = building;
    this.opts = { id, title, avatar };
    this._onKey = (e) => { if (e.key === 'Escape') this.close(); };
  }

  body() { return ''; }
  bind() {}

  open() {
    const { id, title, avatar } = this.opts;
    const root = document.createElement('div');
    root.id = id;
    root.className = 'interior room-css';
    root.innerHTML = `
      ${this.body()}
      <div class="cl-hud">
        <button class="cl-back" aria-label="برگشت"><span>➜</span></button>
        <div class="cl-title"><img src="${avatar}" alt=""><span>${title}</span></div>
      </div>
      <div class="cl-say"></div>`;
    document.getElementById('game').appendChild(root);
    this.root = root;
    root.querySelector('.cl-back').addEventListener('click', () => this.close());
    window.addEventListener('keydown', this._onKey);
    this.bind();
    void root.offsetWidth;
    root.classList.add('show');
    sfx.whoosh();
  }

  close() {
    clearInterval(this._t);
    window.removeEventListener('keydown', this._onKey);
    const root = this.root;
    if (!root) return;
    sfx.click();
    root.classList.remove('show');
    setTimeout(() => root.remove(), 380);
    this.root = null;
    this.ui[this.opts.id] = null;
  }

  safe(fn) {
    try { const r = fn(); if (r && r.catch) r.catch((e) => console.error(e)); } catch (e) { console.error(`[${this.opts.id}]`, e); }
  }

  say(text, ms = 0) {
    const el = this.root && this.root.querySelector('.cl-say');
    if (!el) return;
    clearTimeout(this._sayT);
    el.innerHTML = `<span>${text}</span>`;
    el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
    if (ms) this._sayT = setTimeout(() => el.classList.remove('show'), ms);
  }

  // جایزه‌ی کنشِ ساختمان (کول‌داون از config) — متنِ نتیجه یا null اگر وقتش نرسیده
  claim() {
    const b = this.building, a = b && b.action;
    if (!a || !buildingReady(b.id, a.cooldown)) return null;
    if (a.coins) addCoins(a.coins);
    if (a.dew) addDew(a.dew);
    if (a.xp && addXp(a.xp)) this.ui.levelUp();
    setBuildingCooldown(b.id);
    this.ui.bumpCurrencies();
    const parts = [];
    if (a.coins) parts.push(`+${fa(a.coins)} سکه`);
    if (a.xp) parts.push(`+${fa(a.xp)} تجربه`);
    return parts.join('، ');
  }

  leftText() {
    const b = this.building, a = b && b.action;
    const left = a ? cooldownLeft(b.id, a.cooldown) / 1000 : 0;
    if (left <= 0) return '';
    // اول کلِ ثانیه‌ها گرد می‌شود؛ گردکردنِ جدای ثانیه «۲:۶۰» می‌ساخت
    const t = Math.ceil(left);
    return `${fa(Math.floor(t / 60))}:${String(t % 60).padStart(2, '0').replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[d])}`;
  }
}
// شبنم فقط اگر کنشی داشت (فعلاً شورا و خانه ندارند)
function addDew(n) { state.dew += n; }

// ================= شورای شهر =================
export class Council extends Room {
  constructor(ui, building) {
    super(ui, building, { id: 'council', title: 'شورای شهر لوکو', avatar: ASSET('council/pari.webp') });
  }

  body() {
    const report = [
      ['🏠', 'سازه‌هایی که ساختی', state.structures.length],
      ['🌱', 'جایگاه‌های کشت', state.plots.length],
      ['🪓', 'زمینِ پاک‌شده', state.clearedCells.length],
      ['⭐', 'لولِ شهردار', state.level],
      ['🪙', 'سکه‌ی خزانه‌ی تو', Math.floor(state.coins)],
      ['💧', 'شبنم', Math.floor(state.dew)],
    ];
    return `
      <div class="rc-council">
        <div class="rc-arches"><i></i><i></i><i></i><i></i><i></i></div>
        <div class="rc-banner">🏛️ برای آینده‌ی شهر تصمیم می‌گیریم</div>
        <img class="rc-host" src="${ASSET('council/pari.webp')}" alt="پری">
        <div class="rc-hall">
          <button class="rc-vault" aria-label="خزانه‌ی شهر">
            <span class="rc-coins"><i></i><i></i><i></i><i></i><i></i></span>
            <span class="rc-chest">🏛️</span>
            <span class="rc-label">بودجه‌ی شهر</span>
            <span class="rc-left"></span>
          </button>
          <section class="rc-report">
            <h3>📜 گزارشِ شهرِ تو</h3>
            <ul>${report.map(([i, t, v]) => `<li><b>${i}</b><span>${t}</span><em>${fa(v)}</em></li>`).join('')}</ul>
          </section>
        </div>
      </div>`;
  }

  bind() {
    this.root.querySelector('.rc-vault').addEventListener('click', () => this.safe(() => this._take()));
    this._refresh();
    this._t = setInterval(() => this._refresh(), 1000);
    this.root.querySelector('.rc-host').addEventListener('click', () => this.safe(() => this.say('پری: «هر چی شهرت بزرگ‌تر بشه، گزارشت قشنگ‌تر می‌شه! 🗺️»', 3000)));
    this.say('پری: «سلام شهردار! خزانه‌ی شهر هر چند وقت یه بار بودجه‌ی تازه می‌گیره 🪙 روش بزن تا بودجه‌ات رو بگیری.»', 4500);
  }

  _refresh() {
    const v = this.root && this.root.querySelector('.rc-vault');
    if (!v) return;
    const left = this.leftText();
    v.classList.toggle('ready', !left);
    v.querySelector('.rc-left').textContent = left ? `⏳ ${left}` : '🎁 آماده‌ست!';
  }

  _take() {
    const got = this.claim();
    const v = this.root.querySelector('.rc-vault');
    if (!got) {
      sfx.error();
      v.classList.remove('shake'); void v.offsetWidth; v.classList.add('shake');
      this.say(`خزانه هنوز پر نشده! ${this.leftText()} دیگه بیا ⏳`, 2500);
      return;
    }
    sfx.coin();
    v.classList.remove('burst'); void v.offsetWidth; v.classList.add('burst');
    this.say(`شورا بودجه‌ی شهر رو بهت داد: ${got} 🎉 خرجِ ساختنِ شهرت کن!`, 4000);
    this._refresh();
  }
}

// ================= خونه‌ی من =================
export class Home extends Room {
  constructor(ui, building) {
    super(ui, building, { id: 'home', title: 'خونه‌ی من', avatar: ASSET('hall/luki.webp') });
  }

  body() {
    const art = readJSON('luko_art_log', []).slice(0, 4);
    const memories = Object.values(readJSON('luko_season_memories', {})).slice(0, 2);
    const got = medals().filter((m) => m.unlocked);
    const need = xpForLevel(state.level);
    const streak = streakOf(clubState().days);
    const frames = [0, 1, 2, 3].map((i) => art[i]
      ? `<button class="rh-frame" data-art="${i}" style="--r:${[-3, 2, -2, 3][i]}deg"><img src="${art[i].thumbnail}" alt=""></button>`
      : `<div class="rh-frame empty" style="--r:${[-3, 2, -2, 3][i]}deg"><span>🖼️</span></div>`).join('');
    return `
      <div class="rh-room">
        <div class="rh-window"><i></i><i></i></div>
        <div class="rh-frames">${frames}</div>
        <div class="rh-shelf">
          <div class="rh-items">
            ${got.length ? got.slice(0, 6).map((m) => `<span class="rh-trophy ${m.tier}" title="${esc(m.title)}">${m.icon}</span>`).join('') : '<small>مدال‌هات اینجا می‌شینن 🏅</small>'}
            ${memories.map((t) => `<img class="rh-photo" src="${t}" alt="">`).join('')}
          </div>
        </div>
        <button class="rh-bed" aria-label="تخت"><span class="rh-pillow"></span><span class="rh-blanket"></span><span class="rh-zzz">Z z z</span></button>
        <img class="rh-luki" src="${ASSET('hall/luki.webp')}" alt="لوکی">
        <section class="rh-card">
          <div class="rh-lvl">${fa(state.level)}</div>
          <div class="rh-info">
            <b>شهردارِ کوچولوی لوکو</b>
            <div class="rh-xp"><i style="width:${Math.min(100, Math.round(state.xp / need * 100))}%"></i></div>
            <small>${fa(state.xp)} از ${fa(need)} تجربه تا لولِ بعد</small>
          </div>
          <ul class="rh-stats">
            <li class="rh-rank">🏆 رتبه <b>…</b></li>
            <li>🔥 <b>${fa(streak)}</b> روزِ پیاپی</li>
            <li>🏅 <b>${fa(got.length)}</b> مدال</li>
            <li>🎨 <b>${fa(readJSON('luko_art_log', []).length)}</b> نقاشی</li>
          </ul>
        </section>
        <div class="rh-view"></div>
      </div>`;
  }

  bind() {
    const r = this.root;
    r.querySelector('.rh-bed').addEventListener('click', () => this.safe(() => this._rest()));
    r.querySelector('.rh-luki').addEventListener('click', () => this.safe(() => {
      sfx.pop();
      const l = r.querySelector('.rh-luki');
      l.classList.remove('hop'); void l.offsetWidth; l.classList.add('hop');
      this.say('لوکی: «خونه‌ی خودته! نقاشی‌هات رو به دیوار زدم و مدال‌هات روی قفسه‌ست 😄»', 3500);
    }));
    r.querySelectorAll('.rh-frame[data-art]').forEach((f) => f.addEventListener('click', () => this.safe(() => {
      const art = readJSON('luko_art_log', [])[+f.dataset.art];
      if (!art) return;
      sfx.click();
      const v = r.querySelector('.rh-view');
      v.innerHTML = `<div class="rh-big"><img src="${art.thumbnail}" alt=""><button class="cl-btn ghost">بستن</button></div>`;
      v.classList.add('show');
      v.querySelector('button').addEventListener('click', () => v.classList.remove('show'));
    })));
    // رتبه‌ی واقعی (لیدربرد) بعد از باز شدن می‌رسد؛ مهمان یا بی‌اینترنت: «—»
    const rank = r.querySelector('.rh-rank');
    ranking().then(({ me, total }) => {
      rank.innerHTML = me ? `🏆 رتبه <b>${fa(me.rank)}</b> از ${fa(total)}` : '🏆 رتبه <b>—</b>';
    }, () => { rank.innerHTML = '🏆 رتبه <b>—</b>'; });
    this.say('به خونه‌ی خودت خوش اومدی 🏠 روی تخت بزن تا یه چُرت بزنی و انرژی بگیری!', 4000);
  }

  async _rest() {
    if (this._resting) return;
    const left = this.leftText();
    if (left) {
      sfx.error();
      this.say(`تازه بیدار شدی! ${left} دیگه دوباره می‌تونی بخوابی 😴`, 2500);
      return;
    }
    this._resting = true;
    this.root.classList.add('night');
    sfx.drop();
    this.say('خواااب… 😴', 0);
    await wait(2600);
    if (!this.root) return;
    this.root.classList.remove('night');
    const got = this.claim();
    sfx.levelup();
    this.say(`صبح بخیر! ☀️ با انرژیِ تازه: ${got || 'استراحت کردی'}`, 4000);
    this._resting = false;
  }
}

export function openCouncil(ui, building) {
  if (ui.council) return ui.council;
  ui.council = new Council(ui, building);
  ui.council.open();
  return ui.council;
}

export function openHome(ui, building) {
  if (ui.home) return ui.home;
  ui.home = new Home(ui, building);
  ui.home.open();
  return ui.home;
}
