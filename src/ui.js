// ================= رابط کاربری: HUD، برچسب‌ها، توست‌ها =================
import { state, addCoins, addDew, addXp, resetGame, save, buildingReady, setBuildingCooldown, cooldownLeft } from './state.js';
import { LAYOUT, ASSET, ITEMS, TRAY_ORDER, CATEGORIES, CROPS, PRICES, xpForLevel } from './config.js';
import { sfx } from './audio.js';

const fmt = (n) => Math.round(n).toLocaleString('fa-IR');

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
    // بالا چپ: لول + نوار تجربه
    const tl = document.createElement('div');
    tl.id = 'hud-topleft';
    tl.innerHTML = `
      <div class="level-badge" id="level-badge"><span id="level-num">1</span></div>
      <div class="xp-wrap">
        <div class="xp-bar"><div class="xp-fill" id="xp-fill"></div></div>
        <div class="xp-text" id="xp-text">0 / 500 XP</div>
      </div>`;
    document.getElementById('overlay').appendChild(tl);

    // بالا راست: تنظیمات + سکه + شبنم
    const tr = document.createElement('div');
    tr.id = 'hud-topright';
    tr.innerHTML = `
      <button class="hud-icon-btn" id="btn-settings" title="تنظیمات">
        <svg viewBox="0 0 24 24" class="ico"><path fill="currentColor" d="M19.14 12.94a7.9 7.9 0 0 0 .06-.94 7.9 7.9 0 0 0-.06-.94l2.03-1.58a.5.5 0 0 0 .12-.62l-1.92-3.32a.5.5 0 0 0-.6-.22l-2.39.96a7.2 7.2 0 0 0-1.62-.94l-.36-2.54a.5.5 0 0 0-.5-.42h-3.84a.5.5 0 0 0-.5.42l-.36 2.54c-.59.24-1.13.56-1.62.94l-2.39-.96a.5.5 0 0 0-.6.22L2.7 8.86a.5.5 0 0 0 .12.62l2.03 1.58a7.9 7.9 0 0 0 0 1.88l-2.03 1.58a.5.5 0 0 0-.12.62l1.92 3.32c.12.22.38.3.6.22l2.39-.96c.49.38 1.03.7 1.62.94l.36 2.54c.04.24.25.42.5.42h3.84c.25 0 .46-.18.5-.42l.36-2.54a7.2 7.2 0 0 0 1.62-.94l2.39.96c.22.08.48 0 .6-.22l1.92-3.32a.5.5 0 0 0-.12-.62l-2.03-1.58ZM12 15.6A3.6 3.6 0 1 1 12 8.4a3.6 3.6 0 0 1 0 7.2Z"/></svg>
      </button>
      <div class="currency-row" id="coins-row">
        <img src="${ASSET('coin.png')}" alt="سکه">
        <span id="coins-val">${fmt(state.coins)}</span>
      </div>
      <div class="currency-row dew" id="dew-row">
        <img src="${ASSET('Dew.png')}" alt="شبنم">
        <span id="dew-val">${fmt(state.dew)}</span>
      </div>`;
    document.getElementById('overlay').appendChild(tr);
    tr.querySelector('#btn-settings').addEventListener('click', () => this.openSettings());

    // پایین راست: فروشگاه / پیام‌ها / دوستان
    const side = document.createElement('div');
    side.id = 'hud-side';
    side.innerHTML = `
      <button class="side-btn" id="btn-mail">
        <span class="side-ico">✉️</span><span>پیام‌ها</span>
        <span class="badge" id="mail-badge">3</span>
      </button>
      <button class="side-btn" id="btn-friends">
        <span class="side-ico">👥</span><span>دوستان</span>
      </button>
      <button class="side-btn gold" id="btn-shop">
        <span class="side-ico">🏪</span><span>فروشگاه</span>
      </button>`;
    document.getElementById('overlay').appendChild(side);
    side.querySelector('#btn-shop').addEventListener('click', () => this.openShop());
    side.querySelector('#btn-mail').addEventListener('click', () => this.openMail());
    side.querySelector('#btn-friends').addEventListener('click', () => this.openFriends());
  }

  refreshHud() {
    document.getElementById('level-num').textContent = fmt(state.level);
    const need = xpForLevel(state.level);
    document.getElementById('xp-fill').style.width = Math.min(100, (state.xp / need) * 100) + '%';
    document.getElementById('xp-text').textContent = `${fmt(state.xp)} / ${fmt(need)} XP`;
    document.getElementById('coins-val').textContent = fmt(state.coins);
    document.getElementById('dew-val').textContent = fmt(state.dew);
    const unclaimed = state.mails.filter(m => !m.claimed).length;
    const badge = document.getElementById('mail-badge');
    badge.textContent = fmt(unclaimed);
    badge.style.display = unclaimed ? 'block' : 'none';
  }

  bumpCurrencies() {
    this.refreshHud();
    for (const id of ['coins-row', 'dew-row']) {
      const el = document.getElementById(id);
      el.classList.remove('bump');
      void el.offsetWidth;
      el.classList.add('bump');
    }
  }

  levelUp() {
    sfx.levelup();
    this.toast(`🎉 لول آپ! حالا لول ${fmt(state.level)} هستی — ۱۵۰ سکه جایزه گرفتی!`);
    const badge = document.getElementById('level-badge');
    badge.classList.remove('bump');
    void badge.offsetWidth;
    badge.classList.add('bump');
    this.refreshHud();
  }

  // ================= برچسب‌های شناور روی جایگاه‌ها =================
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

  positionLabel(el, x, z, y = null) {
    const wy = y !== null ? y : (+el.dataset.wy || 1.9);
    const p = this.world.worldToScreen(x, wy, z);
    el.style.left = p.x + 'px';
    el.style.top = p.y + 'px';
  }

  refreshLabels() {
    for (const [id, el] of this.plotLabels) {
      if (el.style.display === 'none') continue;
      this.positionLabel(el, +el.dataset.wx, +el.dataset.wz);
    }
  }

  // متن شناور پس از فروش
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

  // حلقه‌ی نگه‌داشتن درخت
  showHoldRing() {
    if (!this.holdEl) {
      this.holdEl = document.createElement('div');
      this.holdEl.id = 'hold-ring';
      this.holdEl.innerHTML = `
        <svg viewBox="0 0 72 72">
          <circle cx="36" cy="36" r="30" class="hold-bg"/>
          <circle cx="36" cy="36" r="30" class="hold-fg" id="hold-fg"/>
        </svg>
        <div class="hold-text">نگه دار!</div>`;
      document.getElementById('labels').appendChild(this.holdEl);
    }
    this.holdEl.style.display = 'block';
    const fg = this.holdEl.querySelector('#hold-fg');
    const circ = 2 * Math.PI * 30;
    fg.style.strokeDasharray = circ;
    fg.style.strokeDashoffset = circ;
    this.holdCirc = circ;
  }

  updateHoldRing(k, x, z) {
    const fg = this.holdEl.querySelector('#hold-fg');
    fg.style.strokeDashoffset = this.holdCirc * (1 - k);
    const p = this.world.worldToScreen(x, 1.7, z);
    this.holdEl.style.left = p.x + 'px';
    this.holdEl.style.top = p.y + 'px';
  }

  hideHoldRing() {
    if (this.holdEl) this.holdEl.style.display = 'none';
  }

  // ================= توست =================
  toast(msg) {
    const box = document.getElementById('toasts');
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = msg;
    box.appendChild(el);
    setTimeout(() => el.classList.add('show'), 16);
    setTimeout(() => {
      el.classList.remove('show');
      setTimeout(() => el.remove(), 350);
    }, 3200);
    while (box.children.length > 3) box.firstChild.remove();
  }

  needBuy(itemId) {
    const item = ITEMS[itemId];
    this.toast(`از «${item.name}» نداری! اول از فروشگاه بخر.`);
    sfx.error();
    return false;
  }

  // ================= سینی کارت‌ها =================
  buildTray() {
    const tray = document.createElement('div');
    tray.id = 'tray';
    tray.innerHTML = `
      <button class="tray-arrow" id="tray-prev" aria-label="قبلی">◀</button>
      <div class="tray-scroll" id="tray-scroll"></div>
      <button class="tray-arrow" id="tray-next" aria-label="بعدی">▶</button>`;
    document.getElementById('overlay').appendChild(tray);

    const scroll = tray.querySelector('#tray-scroll');
    for (const id of TRAY_ORDER) {
      const item = ITEMS[id];
      const card = document.createElement('div');
      card.className = 'card';
      card.dataset.item = id;
      card.innerHTML = `
        <div class="card-title">${item.name}</div>
        <div class="card-count" data-count="${id}">۰</div>
        <div class="card-img"><img src="${ASSET(item.icon)}" alt="${item.name}" draggable="false"></div>
        <div class="card-buy">
          <span class="price"><img src="${ASSET(item.currency === 'dew' ? 'Dew.png' : 'coin.png')}" alt=""> ${fmt(item.price)}</span>
          <button class="buy-btn">خرید</button>
        </div>`;
      scroll.appendChild(card);

      card.querySelector('.buy-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        this.buyItem(id);
      });

      // درگ کارت
      card.addEventListener('pointerdown', (e) => this.onCardPointerDown(e, id));
    }

    tray.querySelector('#tray-prev').addEventListener('click', () => {
      scroll.scrollBy({ left: 320, behavior: 'smooth' }); // RTL: left = بعدی
    });
    tray.querySelector('#tray-next').addEventListener('click', () => {
      scroll.scrollBy({ left: -320, behavior: 'smooth' });
    });

    this.refreshTray();
  }

  refreshTray() {
    for (const id of TRAY_ORDER) {
      const el = document.querySelector(`[data-count="${id}"]`);
      if (el) {
        const n = state.inventory[id] || 0;
        el.textContent = fmt(n);
        el.classList.toggle('empty', n === 0);
      }
    }
  }

  buyItem(id, silent = false) {
    const item = ITEMS[id];
    const wallet = item.currency === 'dew' ? state.dew : state.coins;
    if (wallet < item.price) {
      if (!silent) this.toast(item.currency === 'dew' ? 'شبنم کافی نیست!' : 'سکه کافی نیست!');
      sfx.error();
      return false;
    }
    if (item.currency === 'dew') state.dew -= item.price;
    else state.coins -= item.price;
    state.inventory[id] = (state.inventory[id] || 0) + 1;
    save();
    sfx.buy();
    if (!silent) {
      this.toast(`«${item.name}» خریداری شد! ✅`);
      this.bumpCurrencies();
      this.refreshTray();
    }
    return true;
  }

  // ---------- درگ‌اندراپ کارت‌ها ----------
  onCardPointerDown(e, itemId) {
    if (e.target.closest('.buy-btn')) return;
    e.preventDefault();
    const ghost = document.getElementById('drag-ghost');
    const item = ITEMS[itemId];
    ghost.innerHTML = `<img src="${ASSET(item.icon)}" alt=""><span>${item.name}</span>`;
    ghost.style.display = 'flex';
    this.dragItem = itemId;
    this.dragMoved = false;
    const move = (ev) => {
      this.dragMoved = true;
      ghost.style.left = ev.clientX + 'px';
      ghost.style.top = ev.clientY + 'px';
      // هایلایت هدف
      const mesh = this.world.pick(ev.clientX, ev.clientY);
      const ground = this.world.pickGround(ev.clientX, ev.clientY);
      if (mesh && mesh.userData.type === 'plot') {
        this.world.showHighlight(mesh.position.x, mesh.position.z, 1.9);
        this.dropTarget = { plotId: mesh.userData.id.slice(5), point: null };
      } else if (itemId === 'plot' && ground) {
        this.world.showHighlight(ground.x, ground.z, 2.2, 0xffd070);
        this.dropTarget = { plotId: null, point: ground };
      } else {
        this.world.hideHighlight();
        this.dropTarget = null;
      }
    };
    const up = (ev) => {
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', up);
      ghost.style.display = 'none';
      this.world.hideHighlight();
      const target = this.dropTarget;
      this.dropTarget = null;
      this.dragItem = null;

      if (!this.dragMoved) {
        // کلیک ساده روی کارت = اطلاعات
        this.toast(`«${item.name}» — ${item.desc} (بخر و روی زمین بینداز)`);
        return;
      }
      if (!target) {
        // انداختن روی هدف نامعتبر
        const mesh = this.world.pick(ev.clientX, ev.clientY);
        if (mesh && mesh.userData.type === 'building') {
          this.toast('این کارت روی ساختمان کار نمی‌کند؛ روی مزرعه بینداز.');
        } else {
          this.toast('اینجا نمی‌توانی بیندازی؛ روی جایگاه کشت بینداز.');
        }
        sfx.error();
        return;
      }
      // اگر موجودی نداشت، تلاش برای خودکار خرید
      if ((state.inventory[itemId] || 0) <= 0) {
        if (!this.buyItem(itemId, true)) {
          this.needBuy(itemId);
          return;
        }
        this.refreshTray();
        this.bumpCurrencies();
      }
      this.onDropItem(itemId, target);
    };
    ghost.style.left = e.clientX + 'px';
    ghost.style.top = e.clientY + 'px';
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', up);
  }

  onDropItem(itemId, target) {
    // توسط main پر می‌شود
  }

  // ================= فروشگاه (استایل کلش) =================
  buildModals() {
    const wrap = document.createElement('div');
    wrap.id = 'modal-root';
    wrap.innerHTML = `<div class="modal-backdrop" id="modal-backdrop"></div>`;
    document.getElementById('overlay').appendChild(wrap);
    wrap.querySelector('#modal-backdrop').addEventListener('click', () => this.closeModal());
    this.modalRoot = wrap;

    // پنل ساختمان‌ها
    const b = document.createElement('div');
    b.className = 'modal panel-building';
    b.id = 'building-panel';
    b.style.display = 'none';
    wrap.appendChild(b);
    this.buildingPanel = b;
  }

  openModal(html, cls = '') {
    const back = this.modalRoot.querySelector('#modal-backdrop');
    back.style.display = 'block';
    const panel = document.createElement('div');
    panel.className = 'modal ' + cls;
    panel.innerHTML = html;
    this.modalRoot.appendChild(panel);
    this.activeModal = panel;
    requestAnimationFrame(() => {
      back.classList.add('show');
      panel.classList.add('show');
    });
    sfx.click();
    return panel;
  }

  closeModal() {
    const back = this.modalRoot.querySelector('#modal-backdrop');
    back.classList.remove('show');
    if (this.activeModal) {
      const p = this.activeModal;
      p.classList.remove('show');
      setTimeout(() => p.remove(), 220);
      this.activeModal = null;
    }
  }

  openShop(category = 'seeds') {
    const panel = this.openModal('', 'panel-shop');
    this.renderShop(panel, category);
  }

  renderShop(panel, category) {
    const cats = CATEGORIES.map(c => `
      <button class="shop-cat ${c.id === category ? 'active' : ''}" data-cat="${c.id}">${c.name}</button>
    `).join('');
    const items = Object.values(ITEMS).filter(i => i.category === category).map(i => `
      <div class="shop-item">
        <div class="shop-item-img"><img src="${ASSET(i.icon)}" alt="${i.name}"></div>
        <div class="shop-item-name">${i.name}</div>
        <div class="shop-item-desc">${i.desc}</div>
        <button class="shop-buy" data-buy="${i.id}">
          <img src="${ASSET(i.currency === 'dew' ? 'Dew.png' : 'coin.png')}" alt="">
          <span>${fmt(i.price)}</span>
        </button>
      </div>
    `).join('');
    panel.innerHTML = `
      <div class="shop-header">
        <h2>🏪 فروشگاه لوکو</h2>
        <button class="modal-close">✕</button>
      </div>
      <div class="shop-body">
        <div class="shop-cats">${cats}</div>
        <div class="shop-grid">${items}</div>
      </div>`;
    panel.querySelector('.modal-close').addEventListener('click', () => this.closeModal());
    panel.querySelectorAll('.shop-cat').forEach(btn => {
      btn.addEventListener('click', () => this.renderShop(panel, btn.dataset.cat));
    });
    panel.querySelectorAll('.shop-buy').forEach(btn => {
      btn.addEventListener('click', () => {
        if (this.buyItem(btn.dataset.buy)) {
          this.refreshTray();
          this.refreshHud();
          btn.classList.add('pulse');
          setTimeout(() => btn.classList.remove('pulse'), 350);
        }
      });
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
      <div class="shop-header"><h2>✉️ پیام‌ها</h2><button class="modal-close">✕</button></div>
      <div class="mail-list">${rows}</div>
    `, 'panel-mail');
    panel.querySelector('.modal-close').addEventListener('click', () => this.closeModal());
    panel.querySelectorAll('[data-claim]').forEach(btn => {
      btn.addEventListener('click', () => {
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
      });
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
      <div class="shop-header"><h2>👥 دوستان</h2><button class="modal-close">✕</button></div>
      <div class="mail-list">${rows}</div>
    `, 'panel-mail');
    panel.querySelector('.modal-close').addEventListener('click', () => this.closeModal());
    panel.querySelectorAll('.friend-visit').forEach((btn, i) => {
      btn.addEventListener('click', () => {
        this.toast(`بزودی می‌توانی شهر «${state.friends[i].name}» را ببینی! 😉`);
        sfx.click();
      });
    });
  }

  openSettings() {
    const panel = this.openModal(`
      <div class="shop-header"><h2>⚙️ تنظیمات</h2><button class="modal-close">✕</button></div>
      <div class="settings-list">
        <label class="setting-row">
          <span>صدای بازی</span>
          <input type="checkbox" id="sound-toggle" ${state.sound ? 'checked' : ''}>
        </label>
        <button class="danger-btn" id="reset-btn">شروع دوباره‌ی بازی</button>
        <div class="about">شهر لوکو 🌳 — نسخه‌ی ۱.۰</div>
      </div>
    `, 'panel-settings');
    panel.querySelector('.modal-close').addEventListener('click', () => this.closeModal());
    panel.querySelector('#sound-toggle').addEventListener('change', (e) => {
      state.sound = e.target.checked;
      save();
      if (state.sound) sfx.click();
    });
    panel.querySelector('#reset-btn').addEventListener('click', () => {
      if (confirm('همه‌ی پیشرفت‌ها پاک می‌شود. مطمئنی؟')) resetGame();
    });
  }

  // ---------- پنل ساختمان ----------
  openBuilding(building) {
    const ready = buildingReady(building.id);
    const cd = building.action ? building.action.cooldown : 0;
    const left = cooldownLeft(building.id) / 1000;
    const btnHtml = building.action
      ? `<button class="building-action" id="building-action-btn" ${ready ? '' : 'disabled'}>
           ${ready ? building.action.label : `⏳ ${fmt(Math.ceil(left))} ثانیه`}
         </button>`
      : `<button class="building-action" id="building-focus-btn">برو به مزرعه 🌾</button>`;

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

    panel.querySelector('.modal-close').addEventListener('click', () => this.closeModal());

    const actBtn = panel.querySelector('#building-action-btn');
    if (actBtn) {
      actBtn.addEventListener('click', () => {
        if (!buildingReady(building.id)) return;
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
      });
    }

    const focusBtn = panel.querySelector('#building-focus-btn');
    if (focusBtn) {
      focusBtn.addEventListener('click', () => {
        this.closeModal();
        this.onFocusFarm && this.onFocusFarm();
      });
    }

    // شمارش معکوس زمان آماده‌شدن
    if (!ready && building.action) {
      const tick = setInterval(() => {
        if (!document.body.contains(panel)) { clearInterval(tick); return; }
        const l = cooldownLeft(building.id) / 1000;
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
      }, 500);
    }
  }

  refreshAll() {
    this.refreshHud();
    this.refreshTray();
  }
}
