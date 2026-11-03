// ================= لیدربرد: برج قهرمان‌ها =================
// با دکمه‌ی «لیدربرد» در HUD باز می‌شود (سبکِ تابلوهای رتبه‌ی بازی‌ها): برج بالای صفحه، سه
// رده‌ی جایزه، زمانِ جایزه‌ی بعدی و فهرستِ رتبه‌ها.
// رتبه‌ها واقعی‌اند: بچه‌های لوکو بر اساسِ جمعِ ستاره‌هایی که در بازی‌ها گرفته‌اند (سرور ثبت می‌کند).
// فایلش را سرور هر ۱۰ دقیقه می‌سازد (New LUKO/deploy/beta_leaderboard.py) و فقط به بچه‌ی واردشده
// نشان داده می‌شود؛ مهمان به‌جای فهرست دعوت به ورود می‌بیند.
// جایزه‌ی رتبه همان کنشِ ساختمانِ لیدربرد است (کول‌داونش از config)؛ هرچه رتبه بالاتر، جایزه بیشتر.
import { addCoins, addXp, buildingReady, setBuildingCooldown, cooldownLeft } from './state.js';
import { ASSET } from './config.js';
import { sfx } from './audio.js';
import { fa, esc } from './interior.js';
import { account } from './net/account.js';
import { http } from './net/api.js';
import { openLogin } from './login.js';

const AVATARS = ['luko', 'health', 'welcome', 'navigator', 'club', 'art', 'sport', 'garden', 'maker', 'explorer', 'podcast', 'gamer', 'ironman_security', 'bikerider', 'parkingattendant', 'chef'];
// رده‌ها: کدام رتبه‌ها و چه جایزه‌ای
export const TIERS = [
  { id: 'gold', label: 'سه نفرِ اول', from: 1, to: 3, coins: 300, xp: 30 },
  { id: 'silver', label: 'رتبه‌ی ۴ تا ۱۰', from: 4, to: 10, coins: 180, xp: 20 },
  { id: 'bronze', label: 'رتبه‌ی ۱۱ به بعد', from: 11, to: Infinity, coins: 120, xp: 12 },
];
const FRESH_MS = 60000;

// هر بچه همیشه همان آواتار را دارد (از شناسه‌اش)، روی هر دستگاهی
const avatarOf = (id) => AVATARS[[...String(id)].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % AVATARS.length];
const tierOf = (rank) => TIERS.find((t) => rank >= t.from && rank <= t.to) || TIERS[TIERS.length - 1];

let cache = null;   // { at, uid, value }

// رتبه‌های واقعی: { list, me, total } — me برای بچه‌ای که هنوز ستاره ندارد null است.
// مهمان یا بی‌اینترنت: خطا (ApiError) می‌دهد؛ صدازننده پیامِ مناسب را نشان می‌دهد.
export async function ranking() {
  const user = account.user();
  if (!account.loggedIn() || !user) { const e = new Error('guest'); e.guest = true; throw e; }
  if (cache && cache.uid === user.id && Date.now() - cache.at < FRESH_MS) return cache.value;
  const d = await http.get('/city/leaderboard');
  const mine = d && d.ranks ? d.ranks[user.id] : null;
  const list = ((d && d.top) || []).map((p) => ({ ...p, avatar: avatarOf(p.id), me: p.id === user.id }));
  const me = mine ? { id: user.id, rank: mine[0], score: mine[1], name: account.name(), avatar: avatarOf(user.id), me: true } : null;
  const value = { list, me, total: (d && d.total) || list.length };
  cache = { at: Date.now(), uid: user.id, value };
  return value;
}

const rowHtml = (p, i) => `<li class="lb-row ${p.me ? 'me' : ''} ${p.rank <= 3 ? 'top top' + p.rank : ''}" style="--d:${Math.min(i, 14) * 40}ms">
  <b class="lb-rank">${p.rank <= 3 ? ['🥇', '🥈', '🥉'][p.rank - 1] : fa(p.rank)}</b>
  <img src="${ASSET('avatars/' + p.avatar + '.webp')}" alt="">
  <span class="lb-name">${esc(p.name)}${p.me ? ' <em>(خودت)</em>' : ''}</span>
  <span class="lb-score"><i>⭐</i>${fa(p.score)}</span>
</li>`;

export class Board {
  constructor(ui, building) {
    this.ui = ui;
    this.building = building;
    this.tier = TIERS[TIERS.length - 1];
    this._onKey = (e) => { if (e.key === 'Escape') this.close(); };
  }

  open() {
    const root = document.createElement('div');
    root.id = 'board';
    root.className = 'interior';
    root.innerHTML = `
      <div class="lb-wrap">
        <header class="lb-head">
          <img class="lb-tower" src="${ASSET('board/tower.webp')}" alt="">
          <div class="lb-titles">
            <h2><span>برجِ</span> قهرمان‌ها</h2>
            <p class="lb-next">جایزه‌ی بعدی:</p>
            <div class="lb-timer"><b>⏱</b><span></span></div>
          </div>
          <div class="lb-tiers">
            ${TIERS.map((t) => `<div class="lb-tier ${t.id}" data-tier="${t.id}">
              <small>${t.label}</small>
              <div><span>🪙 ${fa(t.coins)}</span><span>⭐ ${fa(t.xp)}</span></div>
            </div>`).join('')}
          </div>
        </header>
        <button class="cl-btn lb-claim"></button>
        <ol class="lb-list"><li class="lb-msg">⏳ رتبه‌ها دارن می‌رسن…</li></ol>
        <button class="lb-close" aria-label="بستن">✕</button>
      </div>`;
    document.getElementById('game').appendChild(root);
    this.root = root;
    root.querySelector('.lb-close').addEventListener('click', () => this.close());
    root.querySelector('.lb-claim').addEventListener('click', () => this._claim());
    window.addEventListener('keydown', this._onKey);
    this._markTier();
    this._tick();
    this._t = setInterval(() => this._tick(), 1000);
    void root.offsetWidth;
    root.classList.add('show');
    sfx.whoosh();
    this._load();
  }

  async _load() {
    const ol = this.root && this.root.querySelector('.lb-list');
    if (!ol) return;
    let r;
    try {
      r = await ranking();
    } catch (e) {
      if (!this.root) return;
      if (e.guest || e.status === 401) {
        ol.innerHTML = `<li class="lb-msg">🔑 رتبه‌ها مالِ بچه‌های لوکوئه!<br>وارد حسابت شو تا ببینی بینِ بقیه چندمی.
          <button class="cl-btn green" data-login>ورود به حساب</button></li>`;
        ol.querySelector('[data-login]').addEventListener('click', () => {
          this.close();
          openLogin(this.ui, { onDone: (u) => { if (u) this.ui.onLoggedIn(); } });
        });
      } else {
        ol.innerHTML = `<li class="lb-msg">🔌 رتبه‌ها نرسیدن. اینترنتت رو چک کن.
          <button class="cl-btn ghost" data-retry>دوباره امتحان کن</button></li>`;
        ol.querySelector('[data-retry]').addEventListener('click', () => { ol.innerHTML = '<li class="lb-msg">⏳ …</li>'; this._load(); });
      }
      return;
    }
    if (!this.root) return;
    const { list, me, total } = r;
    if (me) this.tier = tierOf(me.rank);
    this._markTier();
    const rows = list.map(rowHtml);
    if (me && !list.some((p) => p.me)) rows.push('<li class="lb-gap">⋯</li>', rowHtml(me, list.length));
    const hint = me
      ? `از ${fa(total)} بچه‌ی لوکو، تو رتبه‌ی ${fa(me.rank)} هستی`
      : 'هنوز ستاره نگرفتی! از گوی تالار یه بازی رو تموم کن تا اسمت بیاد این‌جا ⭐';
    ol.innerHTML = `<li class="lb-msg small">${hint}<small>رتبه‌ها هر ۱۰ دقیقه تازه می‌شن</small></li>${rows.join('') || '<li class="lb-msg">هنوز کسی ستاره نگرفته؛ اولیش تو باش! ⭐</li>'}`;
    // ردیفِ خودِ بچه وسطِ فهرست
    requestAnimationFrame(() => {
      const row = ol.querySelector('.lb-row.me');
      if (row) ol.scrollTop = row.offsetTop - ol.clientHeight / 2 + row.offsetHeight / 2;
    });
  }

  _markTier() {
    this.root.querySelectorAll('.lb-tier').forEach((el) => el.classList.toggle('mine', el.dataset.tier === this.tier.id));
  }

  _tick() {
    const b = this.building, a = b && b.action;
    const btn = this.root.querySelector('.lb-claim');
    const left = a ? cooldownLeft(b.id, a.cooldown) / 1000 : 0;
    const ready = a && buildingReady(b.id, a.cooldown);
    const t = Math.ceil(left), m = Math.floor(t / 60), s = t % 60;
    this.root.querySelector('.lb-timer span').textContent = ready ? 'همین الان! 🎁' : `${fa(m)} دقیقه و ${fa(s)} ثانیه`;
    btn.disabled = !ready;
    btn.className = `cl-btn lb-claim ${ready ? 'green' : 'ghost'}`;
    btn.textContent = ready ? '🎁 جایزه‌ی رتبه‌ات رو بگیر' : '⏳ جایزه‌ی بعدی در راهه';
  }

  _claim() {
    const tier = this.tier;
    const b = this.building, a = b && b.action;
    if (!a || !buildingReady(b.id, a.cooldown)) { sfx.error(); return; }
    addCoins(tier.coins);
    if (addXp(tier.xp)) this.ui.levelUp();
    setBuildingCooldown(b.id);
    this.ui.bumpCurrencies();
    sfx.coin();
    this.ui.toast(`🏆 جایزه‌ی «${tier.label}»: +${fa(tier.coins)} سکه، +${fa(tier.xp)} تجربه`);
    this._tick();
  }

  close() {
    clearInterval(this._t);
    window.removeEventListener('keydown', this._onKey);
    const root = this.root;
    if (!root) return;
    sfx.click();
    root.classList.remove('show');
    setTimeout(() => root.remove(), 350);
    this.root = null;
    this.ui.board = null;
  }
}

export function openBoard(ui, building) {
  if (ui.board) return ui.board;
  ui.board = new Board(ui, building);
  ui.board.open();
  return ui.board;
}
