// ================= رابط کاربری: HUD، فروشگاه کلش‌مانند، کارت‌ها =================
import { state, addCoins, addDew, addXp, resetGame, save, buildingReady, setBuildingCooldown, cooldownLeft, spend, canAfford } from './state.js';
import { LAYOUT, ASSET, ITEMS, TRAY_ORDER, CATEGORIES, CROPS, PRICES, BUY_STEPS, xpForLevel, isGroundItem, TEST_MODE, ITEM_SELL_RATIO } from './config.js';
import { sfx } from './audio.js';

const fmt = (n) => Math.round(n).toLocaleString('fa-IR');
// در حالت تست، موجودی بی‌نهایت نمایش داده می‌شود
const fmtMoney = (currency) => TEST_MODE.infiniteMoney
  ? '∞'
  : fmt(currency === 'dew' ? state.dew : state.coins);

// آیکون‌های برداری (SVG) سازه‌ها — بدون استیکر/ایموجی
const ITEM_SVG = {
  fence: `<svg class="item-svg" viewBox="0 0 48 48"><g fill="#a06a35"><rect x="6" y="10" width="5" height="30" rx="1.5"/><rect x="21.5" y="10" width="5" height="30" rx="1.5"/><rect x="37" y="10" width="5" height="30" rx="1.5"/></g><g fill="#c08347"><rect x="3" y="16.5" width="42" height="4.6" rx="2"/><rect x="3" y="28.5" width="42" height="4.6" rx="2"/></g></svg>`,
  wall: `<svg class="item-svg" viewBox="0 0 48 48"><g fill="#b3573e" stroke="#7e3524" stroke-width="1.6"><rect x="4" y="9" width="19" height="9" rx="1.5"/><rect x="25" y="9" width="19" height="9" rx="1.5"/><rect x="4" y="30" width="19" height="9" rx="1.5"/><rect x="25" y="30" width="19" height="9" rx="1.5"/></g><rect x="14.5" y="19.5" width="19" height="9" rx="1.5" fill="#c9664d" stroke="#7e3524" stroke-width="1.6"/><rect x="4" y="19.5" width="8.5" height="9" rx="1.5" fill="#c9664d" stroke="#7e3524" stroke-width="1.6"/><rect x="35.5" y="19.5" width="8.5" height="9" rx="1.5" fill="#c9664d" stroke="#7e3524" stroke-width="1.6"/></svg>`,
  tent: `<svg class="item-svg" viewBox="0 0 48 48"><polygon points="24,7 44,40 4,40" fill="#e0ac4e"/><polygon points="24,7 44,40 24,40" fill="#c98f2b"/><polygon points="24,22 31,40 17,40" fill="#6e4517"/><line x1="24" y1="7" x2="24" y2="3.5" stroke="#6e4517" stroke-width="2.4"/></svg>`,
  house: `<svg class="item-svg" viewBox="0 0 48 48"><rect x="11" y="22" width="26" height="19" fill="#dbb98a" stroke="#8a5a2b" stroke-width="2"/><polygon points="24,6 43,23 5,23" fill="#a8542f"/><rect x="20.5" y="30" width="7" height="11" fill="#6e4517"/><rect x="14" y="27" width="5" height="5" fill="#aee1ff"/><rect x="29" y="27" width="5" height="5" fill="#aee1ff"/></svg>`,
  hut: `<svg class="item-svg" viewBox="0 0 48 48"><rect x="14" y="26" width="20" height="15" fill="#dbb98a" stroke="#8a5a2b" stroke-width="2"/><polygon points="24,12 39,28 9,28" fill="#a8542f"/><rect x="21" y="31" width="6" height="10" fill="#6e4517"/><rect x="16.5" y="29" width="4" height="4" fill="#aee1ff"/><rect x="27.5" y="29" width="4" height="4" fill="#aee1ff"/></svg>`,
};

// آیکون‌های SVG برای دکمه‌های HUD
const SVG = {
  gear: `<svg viewBox="0 0 24 24" class="ico"><path fill="currentColor" d="M19.14 12.94a7.9 7.9 0 0 0 .06-.94 7.9 7.9 0 0 0-.06-.94l2.03-1.58a.5.5 0 0 0 .12-.62l-1.92-3.32a.5.5 0 0 0-.6-.22l-2.39.96a7.2 7.2 0 0 0-1.62-.94l-.36-2.54a.5.5 0 0 0-.5-.42h-3.84a.5.5 0 0 0-.5.42l-.36 2.54c-.59.24-1.13.56-1.62.94l-2.39-.96a.5.5 0 0 0-.6.22L2.7 8.86a.5.5 0 0 0 .12.62l2.03 1.58a7.9 7.9 0 0 0 0 1.88l-2.03 1.58a.5.5 0 0 0-.12.62l1.92 3.32c.12.22.38.3.6.22l2.39-.96c.49.38 1.03.7 1.62.94l.36 2.54c.04.24.25.42.5.42h3.84c.25 0 .46-.18.5-.42l.36-2.54a7.2 7.2 0 0 0 1.62-.94l2.39.96c.22.08.48 0 .6-.22l1.92-3.32a.5.5 0 0 0-.12-.62l-2.03-1.58ZM12 15.6A3.6 3.6 0 1 1 12 8.4a3.6 3.6 0 0 1 0 7.2Z"/></svg>`,
  shop: `<svg viewBox="0 0 24 24" class="ico"><path fill="currentColor" d="M20 4H4v2h16V4zm1 10v-2l-1-5H4l-1 5v2h1v6h10v-6h4v6h2v-6h1zm-9 4H6v-4h6v4z"/></svg>`,
  mail: `<svg viewBox="0 0 24 24" class="ico"><path fill="currentColor" d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4-8 5-8-5V6l8 5 8-5v2z"/></svg>`,
  trophy: `<svg viewBox="0 0 24 24" class="ico"><path fill="currentColor" d="M19 4h-2V3a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v1H5a2 2 0 0 0-2 2v2a4 4 0 0 0 4 4h.3A5 5 0 0 0 11 15.9V18H8a1 1 0 0 0 0 2h8a1 1 0 0 0 0-2h-3v-2.1a5 5 0 0 0 3.7-3.9H17a4 4 0 0 0 4-4V6a2 2 0 0 0-2-2ZM5 8V6h2v4a2 2 0 0 1-2-2Zm14 0a2 2 0 0 1-2 2V6h2Z"/></svg>`,
  friends: `<svg viewBox="0 0 24 24" class="ico"><path fill="currentColor" d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5s-3 1.34-3 3 1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/></svg>`,
};

export class UI {
  constructor(world) {
    this.world = world;
    this.plotLabels = new Map();
    this.floats = [];
    this.buildHud();
    this.buildModals();
    this.buildTray();
    this.refreshAll();
  }

  // ================= HUD =================
  buildHud() {
    // بالا چپ (سبک کلش): قاب پروفایل + نشان لول رویش + اسم و نوار تجربه‌ی باریک
    const tl = document.createElement('div');
    tl.id = 'hud-topleft';
    tl.innerHTML = `
      <div class="profile-frame">
        <img class="profile-img" src="${ASSET('AmusementPark.png')}" alt="" draggable="false">
        <div class="level-badge" id="level-badge"><span id="level-num">۱</span></div>
      </div>
      <div class="profile-info">
        <div class="profile-name">شهر لوکو</div>
        <div class="xp-wrap">
          <div class="xp-bar"><div class="xp-fill" id="xp-fill"></div></div>
          <div class="xp-text" id="xp-text">0 / 500 XP</div>
        </div>
      </div>`;
    document.getElementById('overlay').appendChild(tl);

    // بالا راست: نوارهای منابع به سبک کلش (آیکون لبه‌ی نوار + عدد درشت + دکمه‌ی ＋)
    const tr = document.createElement('div');
    tr.id = 'hud-topright';
    tr.innerHTML = `
      <div class="res-bar" id="coins-row">
        <span class="res-ico"><img src="${ASSET('coin.png')}" alt="سکه"></span>
        <span class="res-val" id="coins-val">${fmt(state.coins)}</span>
        <button class="res-plus" id="coins-plus" aria-label="فروشگاه">+</button>
      </div>
      <div class="res-bar dew" id="dew-row">
        <span class="res-ico"><img src="${ASSET('Dew.png')}" alt="شبنم"></span>
        <span class="res-val" id="dew-val">${fmt(state.dew)}</span>
        <button class="res-plus" id="dew-plus" aria-label="فروشگاه">+</button>
      </div>`;
    document.getElementById('overlay').appendChild(tr);
    tr.querySelector('#coins-plus').addEventListener('click', () => this.safe(() => this.toast('فروشگاه به‌زودی برمی‌گردد')));
    tr.querySelector('#dew-plus').addEventListener('click', () => this.safe(() => this.toast('فروشگاه به‌زودی برمی‌گردد')));

    // لبه‌ی چپ: دکمه‌های مربعی کرمی (پیام‌ها، دوستان، تنظیمات)
    const left = document.createElement('div');
    left.id = 'hud-left';
    left.innerHTML = `
      <button class="side-btn" id="btn-mail">
        <span class="side-ico">${SVG.mail}</span><span>پیام‌ها</span>
        <span class="badge" id="mail-badge">۳</span>
      </button>
      <button class="side-btn" id="btn-friends">
        <span class="side-ico">${SVG.friends}</span><span>دوستان</span>
      </button>
      <button class="side-btn" id="btn-leaderboard">
        <span class="side-ico">${SVG.trophy}</span><span>لیدربرد</span>
      </button>
      <button class="side-btn" id="btn-settings">
        <span class="side-ico">${SVG.gear}</span><span>تنظیمات</span>
      </button>`;
    document.getElementById('overlay').appendChild(left);
    left.querySelector('#btn-mail').addEventListener('click', () => this.safe(() => this.openMail()));
    // تابلوی لیدربرد از روی نقشه برداشته شد؛ از اینجا باز می‌شود
    left.querySelector('#btn-leaderboard').addEventListener('click', () => this.safe(() => {
      const b = LAYOUT.buildings.find((x) => x.id === 'leaderboard');
      if (b) { sfx.click(); this.openBuilding(b); }
    }));
    left.querySelector('#btn-friends').addEventListener('click', () => this.safe(() => this.openFriends()));
    left.querySelector('#btn-settings').addEventListener('click', () => this.safe(() => this.openSettings()));

  }

  // دکمه‌ی رفت‌وبرگشت بین شهر و مزرعه
  setAreaButton(areaKey) {
    const label = document.getElementById('btn-area-label');
    const btn = document.getElementById('btn-area');
    if (!label || !btn) return;
    if (areaKey === 'farm') {
      label.textContent = 'شهر';
      btn.querySelector('.cta-ico').innerHTML = `<img src="${ASSET('AmusementPark.png')}" alt="" draggable="false">`;
    } else {
      label.textContent = 'مزرعه';
      btn.querySelector('.cta-ico').innerHTML = `<img src="${ASSET('Farm.png')}" alt="" draggable="false">`;
    }
  }

  onAreaToggle() { /* توسط main پر می‌شود */ }

  // ☁️ انتقال ابری بین صحنه‌ها: ابرها صفحه را می‌پوشانند، وسطش صحنه عوض می‌شود
  cloudTransition(midFn) {
    if (this.cloudBusy) return;
    this.cloudBusy = true;
    let ov = document.getElementById('clouds');
    if (!ov) {
      ov = document.createElement('div');
      ov.id = 'clouds';
      let puffs = '';
      for (let i = 0; i < 42; i++) {
        const size = 90 + Math.random() * 220;
        const top = Math.random() * 96;
        const delay = (Math.random() * 0.28).toFixed(2);
        puffs += `<span class="cloud-puff" style="width:${size}px;height:${size * 0.62}px;top:${top}%;animation-delay:${delay}s"></span>`;
      }
      ov.innerHTML = `<div class="cloud-sheet"></div>${puffs}<div class="cloud-text">در راه…</div>`;
      document.getElementById('game').appendChild(ov);
    }
    void ov.offsetWidth;
    ov.classList.add('show');
    setTimeout(() => {
      try { midFn && midFn(); } catch (e) { console.error('[cloudTransition]', e); }
      setTimeout(() => {
        ov.classList.remove('show');
        ov.classList.add('leave');
        setTimeout(() => {
          ov.classList.remove('leave');
          this.cloudBusy = false;
        }, 780);
      }, 140);
    }, 800);
  }

  // اجرای امن هندلرها — هیچ خطایی نباید بازی را بکشد
  safe(fn) {
    try { fn(); } catch (e) {
      console.error('[LukoUI]', e);
      this.toast('خطایی پیش آمد؛ دوباره تلاش کن.');
    }
  }

  refreshHud() {
    try {
      document.getElementById('level-num').textContent = fmt(state.level);
      const need = xpForLevel(state.level);
      document.getElementById('xp-fill').style.width = Math.min(100, (state.xp / need) * 100) + '%';
      document.getElementById('xp-text').textContent = `${fmt(state.xp)} / ${fmt(need)} XP`;
      document.getElementById('coins-val').textContent = fmtMoney('coins');
      document.getElementById('dew-val').textContent = fmtMoney('dew');
      const unclaimed = state.mails.filter(m => !m.claimed).length;
      const badge = document.getElementById('mail-badge');
      badge.textContent = fmt(unclaimed);
      badge.style.display = unclaimed ? 'flex' : 'none';
    } catch (e) { /* بی‌خیال */ }
  }

  bumpCurrencies() {
    this.refreshHud();
    for (const id of ['coins-row', 'dew-row']) {
      const el = document.getElementById(id);
      if (!el) continue;
      el.classList.remove('bump');
      void el.offsetWidth;
      el.classList.add('bump');
    }
  }

  levelUp() {
    sfx.levelup();
    this.toast(`🎉 لول آپ! حالا لول ${fmt(state.level)} هستی — ۱۵۰ سکه جایزه گرفتی!`);
    const badge = document.getElementById('level-badge');
    if (badge) {
      badge.classList.remove('bump');
      void badge.offsetWidth;
      badge.classList.add('bump');
    }
    this.refreshHud();
  }

  // ================= برچسب‌های شناور =================
  showPlotLabel(plotId, x, z, text, y = 1.9) {
    let el = this.plotLabels.get(plotId);
    if (!el) {
      el = document.createElement('div');
      el.className = 'plot-label';
      document.getElementById('labels').appendChild(el);
      this.plotLabels.set(plotId, el);
    }
    el.textContent = text;
    el.style.display = 'block';
    el.dataset.wx = x;
    el.dataset.wz = z;
    el.dataset.wy = y;
    this.positionLabel(el, x, z, y);
  }

  hidePlotLabel(plotId) {
    const el = this.plotLabels.get(plotId);
    if (el) el.style.display = 'none';
  }

  removePlotLabel(plotId) {
    const el = this.plotLabels.get(plotId);
    if (el) {
      el.remove();
      this.plotLabels.delete(plotId);
    }
  }

  // ---------- حباب حرف آدمک‌ها ----------
  showBubble(id, x, z, text, y = 1.3) {
    let el = this.plotLabels.get(id);
    if (!el) {
      el = document.createElement('div');
      el.className = 'plot-label chat-bubble';
      document.getElementById('labels').appendChild(el);
      this.plotLabels.set(id, el);
    }
    el.textContent = text;
    el.style.display = 'block';
    el.dataset.wx = x;
    el.dataset.wz = z;
    el.dataset.wy = y;
    // انیمیشن ظاهرشدن از اول پخش شود
    el.classList.remove('bubble-in');
    void el.offsetWidth;
    el.classList.add('bubble-in');
    this.positionLabel(el, x, z, y);
  }

  moveBubble(id, x, z) {
    const el = this.plotLabels.get(id);
    if (!el) return;
    el.dataset.wx = x;
    el.dataset.wz = z;
  }

  hideBubble(id) {
    this.removePlotLabel(id);
  }

  positionLabel(el, x, z, y = null) {
    const wy = y !== null ? y : (+el.dataset.wy || 1.9);
    const p = this.world.worldToScreen(x, wy, z);
    el.style.left = p.x + 'px';
    el.style.top = p.y + 'px';
    // برچسب‌های صحنه‌ی دیگر (خارج از کادر) دیده نشوند
    const off = p.x < -80 || p.y < -80 || p.x > window.innerWidth + 80 || p.y > window.innerHeight + 80;
    el.style.visibility = off ? 'hidden' : 'visible';
  }

  refreshLabels() {
    for (const [, el] of this.plotLabels) {
      if (el.style.display === 'none') continue;
      this.positionLabel(el, +el.dataset.wx, +el.dataset.wz);
    }
  }

  floatText(x, z, text) {
    const el = document.createElement('div');
    el.className = 'float-text';
    el.textContent = text;
    document.getElementById('labels').appendChild(el);
    const p = this.world.worldToScreen(x, 1.2, z);
    el.style.left = p.x + 'px';
    el.style.top = p.y + 'px';
    this.floats.push({ el, age: 0 });
  }

  updateFloats(dt) {
    for (const f of this.floats) {
      f.age += dt;
      f.el.style.transform = `translateY(${-f.age * 46}px)`;
      f.el.style.opacity = Math.max(0, 1 - f.age / 1.4);
    }
    this.floats = this.floats.filter(f => {
      if (f.age < 1.4) return true;
      f.el.remove();
      return false;
    });
  }

  // ================= پیغام بالای صفحه (با دکمه‌ی ✕) =================
  toast(msg, opts = {}) {
    const box = document.getElementById('toasts');
    if (!box) return () => {};
    const el = document.createElement('div');
    el.className = 'toast';
    el.innerHTML = `<span class="toast-msg"></span><button class="toast-x" aria-label="بستن پیغام">✕</button>`;
    el.querySelector('.toast-msg').textContent = msg;
    box.appendChild(el);
    requestAnimationFrame(() => el.classList.add('show'));
    let gone = false;
    let timer = null;
    const dismiss = () => {
      if (gone) return;
      gone = true;
      if (timer) clearTimeout(timer);
      el.classList.remove('show');
      setTimeout(() => el.remove(), 300);
      if (opts.onClose) { try { opts.onClose(); } catch (e) { /* ok */ } }
    };
    el.querySelector('.toast-x').addEventListener('click', (ev) => { ev.stopPropagation(); dismiss(); });
    if (!opts.sticky) timer = setTimeout(dismiss, opts.ms || 3400);
    // حداکثر سه پیغام هم‌زمان؛ قدیمی‌ترین غیرچسبان حذف می‌شود
    while (box.children.length > 3) {
      const first = box.querySelector('.toast:not(.sticky)') || box.firstElementChild;
      if (!first || first === el) break;
      first.remove();
    }
    if (opts.sticky) el.classList.add('sticky');
    return dismiss;
  }

  needBuy(itemId) {
    const item = ITEMS[itemId];
    this.toast(`از «${item.name}» نداری! اول از فروشگاه بخر.`);
    sfx.error();
    return false;
  }

  // آیکون آیتم: تصویر واقعی یا آیکون برداری — بدون استیکر/ایموجی
  itemIconHtml(item) {
    if (item.icon) return `<img src="${ASSET(item.icon)}" alt="${item.name}" draggable="false">`;
    return ITEM_SVG[item.svg || item.id] || ITEM_SVG.house;
  }

  // آیکون دسته‌های فروشگاه: تصویر یکی از محصولات همان دسته
  catIconHtml(catId) {
    const files = { plots: 'Product1.png', care: 'Water.png', seeds: 'Wheatgrain.png' };
    if (catId === 'build') return ITEM_SVG.house;
    return `<img src="${ASSET(files[catId] || 'coin.png')}" alt="" draggable="false">`;
  }

  // ================= سینی کارت‌ها =================
  // فقط آیتم‌هایی که خریده‌ای و موجود داری اینجا می‌آیند؛
  // همه‌ی محصولات و چیزهای خریدنی داخل فروشگاه (دسته‌بندی‌شده) هستند.
  buildTray() {
    // فعلاً در محصول شهری سینی کارت نداریم
    this.trayScroll = null;
    this._traySignature = null;
    this.placingItem = null;
    this._placeToastOff = null;
  }
  refreshTray() {
    const scroll = this.trayScroll || document.getElementById('tray-scroll');
    if (!scroll) return;
    const owned = TRAY_ORDER.filter(id => (state.inventory[id] || 0) > 0);
    const signature = owned.join('|');
    if (signature === this._traySignature) {
      // فقط شمارنده‌ها عوض شده‌اند
      for (const id of owned) {
        const el = scroll.querySelector(`[data-count="${id}"]`);
        if (el) el.textContent = fmt(state.inventory[id] || 0);
      }
      return;
    }
    this._traySignature = signature;
    scroll.innerHTML = '';
    if (!owned.length) {
      const empty = document.createElement('button');
      empty.className = 'tray-empty';
      empty.textContent = 'کارتی نداری — برای خرید، فروشگاه را باز کن';
      empty.addEventListener('click', () => this.safe(() => this.openShop()));
      scroll.appendChild(empty);
      return;
    }
    for (const id of owned) {
      const item = ITEMS[id];
      const card = document.createElement('div');
      card.className = 'card';
      card.dataset.item = id;
      if (this.placingItem === id) card.classList.add('selected');
      card.innerHTML = `
        <div class="card-title">${item.name}</div>
        <div class="card-count" data-count="${id}">${fmt(state.inventory[id] || 0)}</div>
        <div class="card-img">${this.itemIconHtml(item)}</div>`;
      card.addEventListener('pointerdown', (e) => this.safe(() => this.onCardPointerDown(e, id)));
      scroll.appendChild(card);
    }
  }

  // جهش کارت بعد از خرید (نشان دادن آمدن آیتم به کارت‌های پایین)
  pulseCard(itemId) {
    const card = document.querySelector(`.card[data-item="${itemId}"]`);
    if (!card) return;
    card.classList.remove('pop');
    void card.offsetWidth;
    card.classList.add('pop');
  }

  buyItem(id, qty = 1, silent = false) {
    const item = ITEMS[id];
    const total = item.price * qty;
    if (!canAfford(item.currency, total)) {
      if (!silent) this.toast(item.currency === 'dew' ? 'شبنم کافی نیست!' : 'سکه کافی نیست!');
      sfx.error();
      return false;
    }
    spend(item.currency, total);
    state.inventory[id] = (state.inventory[id] || 0) + qty;
    save();
    sfx.buy();
    this.refreshTray();       // کارت تازه در سینی پایین ظاهر می‌شود
    this.pulseCard(id);
    if (!silent) {
      this.toast(`«${item.name}» ×${fmt(qty)} خریداری شد و به کارت‌های پایین اضافه شد!`);
      this.bumpCurrencies();
    }
    return true;
  }

  // فروش آیتم‌های خریده‌شده از موجودی (در فروشگاه)
  sellItem(id, qty = 1) {
    const item = ITEMS[id];
    const have = state.inventory[id] || 0;
    const n = Math.min(qty, have);
    if (n <= 0) {
      this.toast(`از «${item.name}» چیزی نداری که بفروشی.`);
      sfx.error();
      return false;
    }
    const gain = Math.max(1, Math.floor(item.price * ITEM_SELL_RATIO)) * n;
    state.inventory[id] = have - n;
    if (item.currency === 'dew') addDew(gain);
    else addCoins(gain);
    save();
    sfx.coin();
    this.refreshTray();       // اگر تمام شد، کارت از پایین حذف می‌شود
    this.bumpCurrencies();
    this.toast(`«${item.name}» ×${fmt(n)} فروخته شد → +${fmt(gain)} ${item.currency === 'dew' ? 'شبنم' : 'سکه'}`);
    return true;
  }

  // ---------- گذاشتن کارت: درگ، یا «انتخاب کن و روی زمین بزن» ----------

  // هدف کارت در یک نقطه‌ی صفحه (مشترک بین درگ و ضربه روی زمین)
  computeDropTarget(itemId, px, py) {
    const mesh = this.world.pick(px, py);
    if (mesh && mesh.userData.type === 'plot' && !isGroundItem(itemId)) {
      return { target: { plotId: mesh.userData.id.slice(5), point: null }, ok: true, mesh, ground: null };
    }
    const ground = this.world.pickGround(px, py);
    if (isGroundItem(itemId) && ground) {
      const ok = this.canPlaceAt ? this.canPlaceAt(itemId, ground) !== false : true;
      return { target: { plotId: null, point: ground }, ok, mesh, ground };
    }
    return { target: null, ok: false, mesh, ground };
  }

  _updateDragGhost(itemId, px, py) {
    const r = this.computeDropTarget(itemId, px, py);
    if (r.target && r.target.plotId && r.mesh) {
      this.world.showPlacementGhost(r.mesh.position.x, r.mesh.position.z, 2.4, true);
    } else if (r.target && r.ground) {
      // سبز = جای مجاز، قرمز = جای نامجاز
      this.world.showPlacementGhost(r.ground.x, r.ground.z, ITEMS[itemId].ghost || 2.2, r.ok);
    } else {
      this.world.hidePlacementGhost();
    }
    this.dropTarget = r.target;
    return r;
  }

  _markSelectedCard() {
    document.querySelectorAll('.card[data-item]').forEach(c => {
      c.classList.toggle('selected', c.dataset.item === this.placingItem);
    });
  }

  // انتخاب کارت با یک ضربه؛ بعد روی زمین هرجا بزنی همان‌جا گذاشته می‌شود
  selectForPlacement(itemId) {
    this.cancelPlacement();
    this.placingItem = itemId;
    this._markSelectedCard();
    const item = ITEMS[itemId];
    this._placeToastOff = this.toast(`«${item.name}» انتخاب شد — روی زمین، هرجا می‌خواهی بگذاری همان‌جا بزن.`, {
      sticky: true,
      onClose: () => { if (this.placingItem === itemId) this.cancelPlacement(); },
    });
    sfx.click();
  }

  cancelPlacement() {
    this.placingItem = null;
    this._markSelectedCard();
    if (this._placeToastOff) {
      const off = this._placeToastOff;
      this._placeToastOff = null;
      off();
    }
  }

  // ضربه روی بوم وقتی کارتی انتخاب است (از main صدا زده می‌شود)
  tryPlaceSelected(clientX, clientY) {
    const itemId = this.placingItem;
    if (!itemId) return false;
    const r = this.computeDropTarget(itemId, clientX, clientY);
    if (!r.target) {
      if (r.mesh && r.mesh.userData.type === 'building') {
        this.toast('این کارت روی ساختمان کار نمی‌کند؛ روی زمین بزن.');
      } else {
        this.toast(isGroundItem(itemId) ? 'روی زمین خالی بزن تا گذاشته شود.' : 'روی یک جایگاه کشت بزن.');
      }
      sfx.error();
      return true;
    }
    if ((state.inventory[itemId] || 0) <= 0) {
      this.needBuy(itemId);
      this.cancelPlacement();
      return true;
    }
    this.onDropItem(itemId, r.target);
    // اگر هنوز از آن آیتم داری، انتخاب می‌ماند تا چندتا پشت‌سرهم بگذاری (مثل حصار)
    if ((state.inventory[itemId] || 0) <= 0) this.cancelPlacement();
    else this._markSelectedCard();
    return true;
  }

  onCardPointerDown(e, itemId) {
    e.preventDefault();
    const ghost = document.getElementById('drag-ghost');
    const item = ITEMS[itemId];
    // روی لمسی کارت و نقطه‌ی افتادن بالای انگشت‌اند تا جای گذاشتن دیده شود
    this.dragOffY = e.pointerType === 'touch' ? -92 : 0;
    this.dragItem = itemId;
    this.dragMoved = false;
    this.dropTarget = null;
    const startX = e.clientX, startY = e.clientY;
    let rafId = 0, lastX = e.clientX, lastY = e.clientY;
    const paintGhost = () => {
      rafId = 0;
      const px = lastX, py = lastY + (this.dragOffY || 0);
      ghost.style.transform = `translate(${px}px, ${py}px) translate(-50%, -50%)`;
      this._updateDragGhost(itemId, px, py);
    };
    const move = (ev) => {
      lastX = ev.clientX; lastY = ev.clientY;
      if (!this.dragMoved) {
        // لرزش کوچک انگشت «درگ» حساب نمی‌شود
        if (Math.hypot(ev.clientX - startX, ev.clientY - startY) < 11) return;
        this.dragMoved = true;
        ghost.innerHTML = `${this.itemIconHtml(item)}<span>${item.name}</span>`;
        ghost.style.display = 'flex';
      }
      // ری‌کست فقط یک‌بار در هر فریم — بدون لگ
      if (!rafId) rafId = requestAnimationFrame(paintGhost);
    };
    const up = (ev) => {
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', up);
      document.removeEventListener('pointercancel', up);
      if (rafId) cancelAnimationFrame(rafId);
      ghost.style.display = 'none';
      this.dragItem = null;
      if (!this.dragMoved) {
        this.world.hidePlacementGhost();
        // ضربه‌ی ساده روی کارت = حالت گذاشتن با ضربه روی زمین
        if (this.placingItem === itemId) this.cancelPlacement();
        else this.selectForPlacement(itemId);
        return;
      }
      const r = this._updateDragGhost(itemId, ev.clientX, ev.clientY + (this.dragOffY || 0));
      this.world.hidePlacementGhost();
      this.dropTarget = null;
      if (!r.target) {
        if (r.mesh && r.mesh.userData.type === 'building') {
          this.toast('این کارت روی ساختمان کار نمی‌کند؛ روی مزرعه بینداز.');
        } else {
          this.toast('اینجا نمی‌توانی بیندازی؛ روی جایگاه کشت بینداز.');
        }
        sfx.error();
        return;
      }
      if ((state.inventory[itemId] || 0) <= 0) {
        this.needBuy(itemId);
        return;
      }
      this.cancelPlacement();
      this.onDropItem(itemId, r.target);
    };
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', up);
    document.addEventListener('pointercancel', up);
  }

  onDropItem(itemId, target) {
    // توسط main پر می‌شود
  }

  // ================= مودال‌ها =================
  buildModals() {
    const wrap = document.createElement('div');
    wrap.id = 'modal-root';
    wrap.innerHTML = `<div class="modal-backdrop" id="modal-backdrop"></div>`;
    document.getElementById('overlay').appendChild(wrap);
    wrap.querySelector('#modal-backdrop').addEventListener('click', () => this.safe(() => this.closeModal()));
    this.modalRoot = wrap;
  }

  openModal(html, cls = '') {
    // اگر مودالی باز است، اول ببند
    if (this.activeModal) {
      try { this.activeModal.remove(); } catch (e) { /* ok */ }
      this.activeModal = null;
    }
    const back = this.modalRoot.querySelector('#modal-backdrop');
    back.style.display = 'block';
    const panel = document.createElement('div');
    panel.className = 'modal ' + cls;
    panel.innerHTML = html;
    this.modalRoot.appendChild(panel);
    this.activeModal = panel;
    requestAnimationFrame(() => {
      try {
        back.classList.add('show');
        panel.classList.add('show');
      } catch (e) { /* ok */ }
    });
    sfx.click();
    return panel;
  }

  closeModal() {
    const back = this.modalRoot.querySelector('#modal-backdrop');
    if (back) {
      back.classList.remove('show');
      setTimeout(() => { if (!this.activeModal && back) back.style.display = 'none'; }, 220);
    }
    if (this.activeModal) {
      const p = this.activeModal;
      p.classList.remove('show');
      setTimeout(() => { try { p.remove(); } catch (e) { /* ok */ } }, 220);
      this.activeModal = null;
    }
  }

  // ================= فروشگاه — صفحه‌ی جداگانه به سبک کلش =================
  openShop(category = 'seeds') {
    const panel = this.openModal('', 'panel-shop panel-full');
    this.shopPanel = panel;
    this.renderShop(panel, category);
  }

  renderShop(panel, category) {
    const cats = CATEGORIES.map((c, i) => `
      <button class="shop-cat ${c.id === category ? 'active' : ''}" data-cat="${c.id}" title="${c.name}" aria-label="${c.name}">
        <span class="shop-cat-ico">${this.catIconHtml(c.id)}</span>
      </button>
    `).join('');
    const catName = (CATEGORIES.find(c => c.id === category) || {}).name || '';

    const items = Object.values(ITEMS).filter(i => i.category === category).map(i => {
      const sellOne = Math.max(1, Math.floor(i.price * ITEM_SELL_RATIO));
      const curImg = ASSET(i.currency === 'dew' ? 'Dew.png' : 'coin.png');
      const have = state.inventory[i.id] || 0;
      return `
      <div class="shop-item" data-shop-item="${i.id}">
        <button class="shop-info" data-info="${i.id}" aria-label="توضیح">i</button>
        <div class="shop-item-name">${i.name}</div>
        <div class="shop-item-img">${this.itemIconHtml(i)}<span class="shop-have-badge" data-have="${i.id}">${have ? '×' + fmt(have) : ''}</span></div>
        <div class="shop-qty">
          ${BUY_STEPS.map((q, qi) => `
            <button class="qty-btn ${qi === 0 ? 'active' : ''}" data-qty="${q}" data-for="${i.id}">×${fmt(q)}</button>
          `).join('')}
        </div>
        <div class="shop-actions">
          <button class="shop-buy" data-buy="${i.id}">
            خرید <img src="${curImg}" alt=""> <span data-total="${i.id}">${fmt(i.price)}</span>
          </button>
          <button class="shop-sell" data-sell="${i.id}" ${have > 0 ? '' : 'disabled'}>
            فروش <img src="${curImg}" alt=""> <span data-selltotal="${i.id}">${fmt(sellOne)}</span>
          </button>
        </div>
      </div>`;
    }).join('');

    panel.innerHTML = `
      <div class="shop-topbar">
        <div class="shop-cats">${cats}</div>
        <button class="modal-close">✕</button>
      </div>
      <div class="shop-titleband">${catName}</div>
      <div class="shop-body">
        <div class="shop-grid">${items}</div>
      </div>
      <div class="shop-wallet">
        <span class="w-coin"><img src="${ASSET('coin.png')}" alt=""> ${fmtMoney('coins')}</span>
        <span class="w-dew"><img src="${ASSET('Dew.png')}" alt=""> ${fmtMoney('dew')}</span>
      </div>
      <div class="item-info-pop" hidden>
        <div class="item-info-card">
          <div class="item-info-img"></div>
          <div class="item-info-name"></div>
          <p class="item-info-desc"></p>
          <button class="item-info-back">برگرد</button>
        </div>
      </div>`;

    panel.querySelector('.modal-close').addEventListener('click', () => this.safe(() => this.closeModal()));
    panel.querySelectorAll('.shop-cat').forEach(btn => {
      btn.addEventListener('click', () => this.safe(() => this.renderShop(panel, btn.dataset.cat)));
    });

    // انتخاب تعداد
    panel.querySelectorAll('.qty-btn').forEach(btn => {
      btn.addEventListener('click', () => this.safe(() => {
        const id = btn.dataset.for;
        panel.querySelectorAll(`.qty-btn[data-for="${id}"]`).forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const item = ITEMS[id];
        const totalEl = panel.querySelector(`[data-total="${id}"]`);
        if (totalEl) totalEl.textContent = fmt(item.price * +btn.dataset.qty);
        const sellEl = panel.querySelector(`[data-selltotal="${id}"]`);
        if (sellEl) sellEl.textContent = fmt(Math.max(1, Math.floor(item.price * ITEM_SELL_RATIO)) * +btn.dataset.qty);
      }));
    });

    // به‌روزرسانی ظاهری ردیف یک آیتم بعد از خرید/فروش
    const syncRow = (id) => {
      const badge = panel.querySelector(`[data-have="${id}"]`);
      if (badge) {
        const n = state.inventory[id] || 0;
        badge.textContent = n ? '×' + fmt(n) : '';
      }
      const sellBtn = panel.querySelector(`[data-sell="${id}"]`);
      if (sellBtn) sellBtn.disabled = (state.inventory[id] || 0) <= 0;
      const wallet = panel.querySelector('.shop-wallet');
      if (wallet) wallet.innerHTML = `
        <span class="w-coin"><img src="${ASSET('coin.png')}" alt=""> ${fmtMoney('coins')}</span>
        <span class="w-dew"><img src="${ASSET('Dew.png')}" alt=""> ${fmtMoney('dew')}</span>`;
    };
    const qtyOf = (id) => {
      const qtyBtn = panel.querySelector(`.qty-btn[data-for="${id}"].active`);
      return qtyBtn ? +qtyBtn.dataset.qty : 1;
    };

    // دکمه‌ی «!» — پنجره‌ی توضیح آیتم با دکمه‌ی برگشت
    const infoPop = panel.querySelector('.item-info-pop');
    const closeInfo = () => { if (infoPop) infoPop.hidden = true; };
    if (infoPop) {
      infoPop.addEventListener('click', (e) => { if (e.target === infoPop) closeInfo(); });
      infoPop.querySelector('.item-info-back').addEventListener('click', () => this.safe(closeInfo));
    }
    panel.querySelectorAll('.shop-info').forEach(btn => {
      btn.addEventListener('click', () => this.safe(() => {
        const item = ITEMS[btn.dataset.info];
        if (!item || !infoPop) return;
        infoPop.querySelector('.item-info-img').innerHTML = this.itemIconHtml(item);
        infoPop.querySelector('.item-info-name').textContent = item.name;
        infoPop.querySelector('.item-info-desc').textContent = item.desc;
        infoPop.hidden = false;
        sfx.click();
      }));
    });

    // خرید
    panel.querySelectorAll('.shop-buy').forEach(btn => {
      btn.addEventListener('click', () => this.safe(() => {
        const id = btn.dataset.buy;
        if (this.buyItem(id, qtyOf(id))) {
          this.refreshHud();
          syncRow(id);
          btn.classList.add('pulse');
          setTimeout(() => btn.classList.remove('pulse'), 350);
        }
      }));
    });

    // فروش از موجودی
    panel.querySelectorAll('.shop-sell').forEach(btn => {
      btn.addEventListener('click', () => this.safe(() => {
        const id = btn.dataset.sell;
        if (this.sellItem(id, qtyOf(id))) {
          syncRow(id);
          btn.classList.add('pulse');
          setTimeout(() => btn.classList.remove('pulse'), 350);
        }
      }));
    });
  }

  openMail() {
    const rows = state.mails.map(m => `
      <div class="mail-row ${m.claimed ? 'claimed' : ''}">
        <div class="mail-info">
          <div class="mail-title">${m.title}</div>
          <div class="mail-body">${m.body}</div>
          <div class="mail-reward">🎁 ${Object.entries(m.reward).map(([k, v]) =>
            k === 'coins' ? `${fmt(v)} سکه` : k === 'dew' ? `${fmt(v)} شبنم` : `${fmt(v)} تجربه`
          ).join(' + ')}</div>
        </div>
        <button class="mail-claim" data-claim="${m.id}" ${m.claimed ? 'disabled' : ''}>
          ${m.claimed ? 'دریافت شد' : 'دریافت'}
        </button>
      </div>
    `).join('');
    const panel = this.openModal(`
      <div class="shop-header"><h2>پیام‌ها</h2><button class="modal-close">✕</button></div>
      <div class="mail-list">${rows}</div>
    `, 'panel-mail panel-full');
    panel.querySelector('.modal-close').addEventListener('click', () => this.safe(() => this.closeModal()));
    panel.querySelectorAll('[data-claim]').forEach(btn => {
      btn.addEventListener('click', () => this.safe(() => {
        const m = state.mails.find(x => x.id === btn.dataset.claim);
        if (!m || m.claimed) return;
        m.claimed = true;
        if (m.reward.coins) addCoins(m.reward.coins);
        if (m.reward.dew) addDew(m.reward.dew);
        if (m.reward.xp) { if (addXp(m.reward.xp)) this.levelUp(); }
        save();
        sfx.coin();
        this.toast('پاداش دریافت شد! 🎁');
        this.closeModal();
        this.openMail();
        this.refreshHud();
      }));
    });
    this.refreshHud();
  }

  openFriends() {
    const rows = state.friends.map(f => `
      <div class="friend-row">
        <div class="friend-avatar">${f.name[0]}</div>
        <div class="friend-info">
          <div class="friend-name">${f.name}</div>
          <div class="friend-level">لول ${fmt(f.level)}</div>
        </div>
        <button class="friend-visit">دیدن شهر</button>
      </div>
    `).join('');
    const panel = this.openModal(`
      <div class="shop-header"><h2>دوستان</h2><button class="modal-close">✕</button></div>
      <div class="mail-list">${rows}</div>
    `, 'panel-mail panel-full');
    panel.querySelector('.modal-close').addEventListener('click', () => this.safe(() => this.closeModal()));
    panel.querySelectorAll('.friend-visit').forEach((btn, i) => {
      btn.addEventListener('click', () => this.safe(() => {
        this.toast(`بزودی می‌توانی شهر «${state.friends[i].name}» را ببینی! 😉`);
        sfx.click();
      }));
    });
  }

  openSettings() {
    const panel = this.openModal(`
      <div class="shop-header"><h2>تنظیمات</h2><button class="modal-close">✕</button></div>
      <div class="settings-list">
        <label class="setting-row">
          <span>صدای بازی</span>
          <input type="checkbox" id="sound-toggle" ${state.sound ? 'checked' : ''}>
        </label>
        <button class="danger-btn" id="reset-btn">شروع دوباره‌ی بازی</button>
        <div class="about">شهر لوکو 🌳 — نسخه‌ی ۴.۰ (شهر سه‌بعدی: ساختمان‌های اصلی، ماشین‌ها و آدمک‌های در حال رفت‌وآمد)</div>
      </div>
    `, 'panel-settings');
    panel.querySelector('.modal-close').addEventListener('click', () => this.safe(() => this.closeModal()));
    panel.querySelector('#sound-toggle').addEventListener('change', (e) => this.safe(() => {
      state.sound = e.target.checked;
      save();
      if (state.sound) sfx.click();
    }));
    panel.querySelector('#reset-btn').addEventListener('click', () => this.safe(() => {
      if (confirm('همه‌ی پیشرفت‌ها پاک می‌شود. مطمئنی؟')) resetGame();
    }));
  }

  // ---------- پنل ساختمان ----------
  openBuilding(building) {
    const cd = building.action ? building.action.cooldown : 0;
    const ready = buildingReady(building.id, cd);
    const left = cooldownLeft(building.id, cd) / 1000;
    const btnHtml = building.action
      ? `<button class="building-action" id="building-action-btn" ${ready ? '' : 'disabled'}>
           ${ready ? building.action.label : `⏳ ${fmt(Math.ceil(left))} ثانیه`}
         </button>`
      : '';

    const panel = this.openModal(`
      <div class="shop-header">
        <h2>${building.name}</h2>
        <button class="modal-close">✕</button>
      </div>
      <div class="building-body">
        <img class="building-img" src="${ASSET(building.tex)}" alt="${building.name}">
        <p class="building-desc">${building.desc}</p>
        ${btnHtml}
      </div>
    `, 'panel-building');

    panel.querySelector('.modal-close').addEventListener('click', () => this.safe(() => this.closeModal()));

    const actBtn = panel.querySelector('#building-action-btn');
    if (actBtn) {
      actBtn.addEventListener('click', () => this.safe(() => {
        if (!buildingReady(building.id, cd)) return;
        const a = building.action;
        if (a.coins) addCoins(a.coins);
        if (a.dew) addDew(a.dew);
        if (a.xp) { if (addXp(a.xp)) this.levelUp(); }
        setBuildingCooldown(building.id);
        sfx.coin();
        const parts = [];
        if (a.coins) parts.push(`+${fmt(a.coins)} سکه`);
        if (a.dew) parts.push(`+${fmt(a.dew)} شبنم`);
        if (a.xp) parts.push(`+${fmt(a.xp)} تجربه`);
        this.toast(`${building.name}: ${parts.join('، ')}`);
        this.bumpCurrencies();
        this.closeModal();
      }));
    }

    const focusBtn = panel.querySelector('#building-focus-btn');
    if (focusBtn) {
      focusBtn.addEventListener('click', () => this.safe(() => {
        this.closeModal();
        this.onFocusFarm && this.onFocusFarm();
      }));
    }

    if (!ready && building.action) {
      const tick = setInterval(() => {
        try {
          if (!document.body.contains(panel)) { clearInterval(tick); return; }
          const l = cooldownLeft(building.id, cd) / 1000;
          const btn = panel.querySelector('#building-action-btn');
          if (btn) {
            if (l <= 0) {
              btn.disabled = false;
              btn.textContent = building.action.label;
              clearInterval(tick);
            } else {
              btn.textContent = `⏳ ${Math.ceil(l)} ثانیه`;
            }
          }
        } catch (e) { clearInterval(tick); }
      }, 500);
    }
  }

  refreshAll() {
    this.refreshHud();
    this.refreshTray();
  }
}
