// ================= پایه‌ی صحنه‌های داخلِ ساختمان‌ها =================
// هر ساختمانی که صفحه‌ی بازیِ خودش را دارد (مطب، تالار، …) از این ساخته می‌شود:
// یک نقاشیِ بزرگ (لابی) که دوربین رویش جابه‌جا و زوم می‌کند، نقطه‌های کلیک روی آن،
// یک لایه‌ی «اتاق» برای صحنه‌های جدا، نوارِ بالا (برگشت + عنوان) و حبابِ گفتگوی پایین.
// ظاهرِ مشترک در src/clinic.css با کلاس‌های cl-* است.
import { sfx } from './audio.js';

export const wait = (ms) => new Promise((r) => setTimeout(r, ms));
export const fa = (n) => Math.round(n).toLocaleString('fa-IR');
export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export class Interior {
  /**
   * @param {object} opts
   *  id        شناسه‌ی ریشه‌ی DOM (clinic / hall)
   *  img       نقاشیِ لابی و اندازه‌ی واقعی‌اش { src, w, h }
   *  title     نوشته‌ی نوارِ بالا، avatar تصویرِ کنارش
   *  views     قابِ هر نما روی نقاشی { name: [x0, y0, x1, y1] }
   *  spots     نقطه‌هایی که فلش‌های گوشی بینشان جابه‌جا می‌کنند [{ x, w }]
   */
  constructor(ui, building, opts) {
    this.ui = ui;
    this.building = building;
    this.opts = opts;
    this.cam = { k: 1, x: 0, y: 0 };
    this.view = 'lobby';
    this._onKey = (e) => { if (e.key === 'Escape') this.back(); };
    this._onResize = () => this._applyCamera(false);
  }

  // ---------- برای زیرکلاس‌ها ----------
  stageHtml() { return ''; }        // نقطه‌های کلیک و تزئیناتِ روی نقاشی
  onOpen() {}                        // بعد از ساخته شدنِ DOM
  onLeaveRoom() {}                   // برگشت از یک اتاق به لابی (توقفِ تایمرها و …)
  onClose() {}

  open() {
    const { id, img, title, avatar } = this.opts;
    const root = document.createElement('div');
    root.id = id;
    root.className = 'interior';
    root.innerHTML = `
      <div class="cl-viewport">
        <div class="cl-stage" style="width:${img.w}px;height:${img.h}px">
          <img class="cl-bg" src="${img.src}" alt="" draggable="false">
          ${this.stageHtml()}
        </div>
      </div>
      <div class="cl-scene"></div>
      <div class="cl-flash"></div>
      <div class="cl-hud">
        <button class="cl-back" aria-label="برگشت"><span>➜</span></button>
        <div class="cl-title"><img src="${avatar}" alt=""><span>${title}</span></div>
      </div>
      <div class="cl-say"></div>
      <button class="cl-pan prev" aria-label="قبلی">❯</button>
      <button class="cl-pan next" aria-label="بعدی">❮</button>
    `;
    document.getElementById('game').appendChild(root);
    this.root = root;
    this.stage = root.querySelector('.cl-stage');
    this.sceneEl = root.querySelector('.cl-scene');

    root.querySelector('.cl-back').addEventListener('click', () => this.safe(() => this.back()));
    this._bindPan();
    // فلشِ راست نما را به راست می‌برد (نقاشی به چپ می‌لغزد) و برعکس
    root.querySelector('.cl-pan.prev').addEventListener('click', () => this.safe(() => this._panStep(-1)));
    root.querySelector('.cl-pan.next').addEventListener('click', () => this.safe(() => this._panStep(1)));
    window.addEventListener('keydown', this._onKey);
    window.addEventListener('resize', this._onResize);

    this.setView('lobby', false);
    this.onOpen();
    void root.offsetWidth;
    root.classList.add('show');
    sfx.whoosh();
  }

  close() {
    window.removeEventListener('keydown', this._onKey);
    window.removeEventListener('resize', this._onResize);
    this.onLeaveRoom();
    this.onClose();
    const root = this.root;
    if (!root) return;
    root.classList.remove('show');
    setTimeout(() => root.remove(), 380);
    this.root = null;
  }

  // هیچ خطایی نباید بازی را بکشد
  safe(fn) {
    const fail = (e) => { console.error(`[${this.opts.id}]`, e); this.ui.toast('خطایی پیش آمد؛ دوباره تلاش کن.'); };
    try { const r = fn(); if (r && r.catch) r.catch(fail); } catch (e) { fail(e); }
  }

  // دکمه‌ی برگشت و Esc: از اتاق‌ها به لابی، از لابی به شهر
  back() {
    sfx.click();
    if (this.view === 'lobby') this.close();
    else this.toLobby();
  }

  toLobby(hint = '') {
    this.onLeaveRoom();
    this.sceneEl.classList.remove('show');
    setTimeout(() => { if (this.view === 'lobby') this.sceneEl.innerHTML = ''; }, 350);
    this.root.classList.remove('in-room');
    this.setView('lobby', true);
    if (hint) this.say(hint, 2200);
  }

  // نما را عوض می‌کند و بعد (اگر اتاق دارد) با فلشِ سفید وارد اتاق می‌شود
  async zoomInto(view, render) {
    this.setView(view);
    await wait(620);
    if (!render) return;
    this.flash();
    this.root.classList.add('in-room');
    render();
    this.sceneEl.classList.add('show');
  }

  // ---------- دوربین ----------
  // lobby: کلِ نقاشی صفحه را پر می‌کند (روی گوشیِ ایستاده با کشیدنِ انگشت جابه‌جا می‌شود)
  // بقیه‌ی نماها: قابِ خودشان وسطِ صفحه، بی‌آنکه بیرونِ نقاشی دیده شود
  setView(view, animate = true) {
    this.view = view;
    this.root.dataset.view = view;
    this._applyCamera(animate);
  }

  _applyCamera(animate) {
    if (!this.root) return;
    const { img, views } = this.opts;
    const vw = this.root.clientWidth || window.innerWidth, vh = this.root.clientHeight || window.innerHeight;
    let k, x, y;
    const frame = views[this.view];
    if (!frame) {
      k = Math.max(vw / img.w, vh / img.h);
      const minX = vw - img.w * k, minY = vh - img.h * k;
      if (this._pan == null) this._pan = { x: minX / 2, y: minY / 2 };
      this._pan.x = Math.min(0, Math.max(minX, this._pan.x));
      this._pan.y = Math.min(0, Math.max(minY, this._pan.y));
      x = this._pan.x; y = this._pan.y;
      // صفحه از نقاشی باریک‌تر است (گوشیِ ایستاده) ← فلش‌های جابه‌جایی
      this.root.classList.toggle('narrow', minX < -40);
    } else {
      const [x0, y0, x1, y1] = frame;
      k = Math.max(Math.min(vw / (x1 - x0), (vh - 70) / (y1 - y0)), vw / img.w, vh / img.h);
      x = vw / 2 - k * (x0 + x1) / 2;
      y = (vh + 40) / 2 - k * (y0 + y1) / 2;
      x = Math.min(0, Math.max(vw - img.w * k, x));
      y = Math.min(0, Math.max(vh - img.h * k, y));
    }
    this.cam = { k, x, y };
    this.stage.classList.toggle('cl-anim', animate);
    this.stage.style.transform = `translate(${x}px, ${y}px) scale(${k})`;
  }

  // کشیدنِ لابی وقتی نقاشی از صفحه بزرگ‌تر است
  _bindPan() {
    const vp = this.root.querySelector('.cl-viewport');
    let start = null;
    vp.addEventListener('pointerdown', (e) => {
      if (this.view !== 'lobby') return;
      start = { x: e.clientX, y: e.clientY, px: this._pan.x, py: this._pan.y };
      this._dragged = false;
    });
    vp.addEventListener('pointermove', (e) => {
      if (!start) return;
      const dx = e.clientX - start.x, dy = e.clientY - start.y;
      if (!this._dragged && Math.hypot(dx, dy) < 8) return;
      this._dragged = true;
      this._pan = { x: start.px + dx, y: start.py + dy };
      this._applyCamera(false);
    });
    const end = () => { start = null; setTimeout(() => { this._dragged = false; }, 0); };
    vp.addEventListener('pointerup', end);
    vp.addEventListener('pointercancel', end);
  }

  // کلیکی که در واقع کشیدن بوده نباید چیزی باز کند
  tap(el, fn) {
    el.addEventListener('click', () => this.safe(() => { if (!this._dragged) fn(); }));
  }

  // فلش‌های گوشی: دوربین به مرکزِ نقطه‌ی کناری می‌لغزد (dir=-1 یعنی نما به راست)
  _panStep(dir) {
    if (this.view !== 'lobby') return;
    sfx.whoosh();
    const vw = this.root.clientWidth, k = this.cam.k;
    const centers = (this.opts.spots || []).map((d) => vw / 2 - k * (d.x + d.w / 2)).sort((a, b) => a - b);
    if (!centers.length) return;
    const cur = this._pan.x;
    const pick = dir > 0
      ? centers.find((c) => c > cur + 4) ?? centers[centers.length - 1]
      : [...centers].reverse().find((c) => c < cur - 4) ?? centers[0];
    this._pan.x = pick;
    this._applyCamera(true);
  }

  // ---------- گفتگو و افکت ----------
  say(text, ms = 0) {
    const el = this.root && this.root.querySelector('.cl-say');
    if (!el) return;
    clearTimeout(this._sayT);
    el.innerHTML = `<span>${text}</span>`;
    el.classList.remove('show');
    void el.offsetWidth;
    el.classList.add('show');
    if (ms) this._sayT = setTimeout(() => el.classList.remove('show'), ms);
  }

  hush() {
    const el = this.root && this.root.querySelector('.cl-say');
    if (el) el.classList.remove('show');
  }

  flash() {
    const f = this.root.querySelector('.cl-flash');
    f.classList.remove('go');
    void f.offsetWidth;
    f.classList.add('go');
  }
}
