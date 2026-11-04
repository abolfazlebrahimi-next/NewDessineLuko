// ================= جهانِ بازی روی canvas دو‌بعدی =================
// این فایل همان کاری را می‌کند که نسخه‌ی سه‌بعدی می‌کرد (دوربین، پن/زوم، انتخاب،
// برچسب‌ها)، ولی بدونِ WebGL: هر فریم یک تصویرِ زمین + چند هزار drawImage از
// اتلسِ اسپریت‌ها. همان‌جا که نسخه‌ی قبلی mesh و متریال می‌ساخت، این‌جا فقط شماره‌ی
// قابِ پخته‌شده جابه‌جا می‌شود.
import {
  VIEW_HEIGHT, CAM_UP, CAM_RIGHT, ZOOM_MIN, ZOOM_MAX, project, depthOf, cityToWorld,
} from './cam.js';
import { ASSET, AREAS, MAP_BOUNDS } from './config.js';
import { loadAtlas, atlas, View, frameIndexFor } from './scene2d.js';

// لایه‌ها: عددِ کمتر = پایین‌تر
const LAYER = { GROUND: 0, SHADOW: 1, STATIC: 2, ACTOR: 3, SPRITE: 4, EFFECT: 5 };

export class World {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.view = new View();
    this.isTouch = 'ontouchstart' in window || (window.matchMedia && matchMedia('(pointer: coarse)').matches);
    this.lowMem = !!(navigator.deviceMemory && navigator.deviceMemory <= 4);

    // ---------- وضعیتِ دوربین ----------
    this.zoom = 1;
    this.panTarget = { x: 0, z: 0 };
    this.area = AREAS.town;
    this.pitchSin = -CAM_UP.z;

    // ---------- اشیای نمایشی ----------
    this.staticItems = [];        // نمونه‌های ثابتِ پخته‌شده (از city)
    this.staticActors = [];       // ماشین‌های پارک‌شده و چیزهای ثابتِ غیرِ نقشه
    this.dynamic = [];            // متحرک‌ها (ماشین/آدمک/اسکیت‌سوار)
    this.sprites = [];            // ساختمان‌های اصلی (تصویرهای ایزومتریک)
    this.byTag = new Map();
    this.clickables = [];
    this.effects = [];
    this.labels = [];
    this._staticDirty = true;
    this._sortedStatic = [];
    this._sortedKey = '';
    this.renderCount = 0;

    this._makeTextures();
    this._resize();
    window.addEventListener('resize', () => this._resize());
    if (window.visualViewport) visualViewport.addEventListener('resize', () => this._resize());

    this.atlasReady = loadAtlas();
    this.atlasReady.then(() => { this._staticDirty = true; });
    this.view.set(this.panTarget, this.zoom);
    this.view.update();
  }

  markStaticDirty() { this._staticDirty = true; }

  // ---------- بافت‌های کوچکِ ساخته‌شده در مرورگر (سایه/حلقه/پد) ----------
  _makeTextures() {
    this.shadowTex = makeBlob(128, [
      [0, 'rgba(20,50,15,0.42)'], [0.62, 'rgba(20,50,15,0.2)'], [1, 'rgba(20,50,15,0)'],
    ]);
    this.ringTex = makeRing('#5adc6e');
    this.ghostTex = makeBlob(128, [
      [0, 'rgba(255,255,255,0.62)'], [0.75, 'rgba(255,255,255,0.28)'], [1, 'rgba(255,255,255,0)'],
    ], true);
  }

  _resize() {
    const cssW = this.canvas.clientWidth || window.innerWidth;
    const cssH = this.canvas.clientHeight || window.innerHeight;
    // وضوح: روی گوشی و دستگاهِ کم‌حافظه پایین‌تر تا حافظه/پردازنده کم نیاورد
    const cap = this.lowMem ? 1.5 : this.isTouch ? 2 : 2;
    const dpr = Math.max(1, Math.min(window.devicePixelRatio || 1, cap));
    const w = Math.round(cssW * dpr), h = Math.round(cssH * dpr);
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    this.view.resize(cssW, cssH, dpr);
    this.view.set(this.panTarget, this.zoom);
    this.view.update();
    this.cssW = cssW;
    this.cssH = cssH;
    this.ctx.imageSmoothingEnabled = true;
    this.ctx.imageSmoothingQuality = 'low';
  }

  // ---------- APIِ سازگار با بقیه‌ی بازی ----------
  addSprite({ tag, file, texture = null, x, z, width, y = 0, clickable = true, anchorBottom = true, shadow = null }) {
    const img = (texture && texture.image) || null;
    const item = {
      tag, file, img,
      pos: { x, y, z },
      anchorBottom,
      width,
      aspect: img && img.width ? img.width / img.height : 1.5,
      scale: 1,
      clickable,
      shadowSpec: shadow,
      isMainBuilding: true,
      depth: depthOf(x, y, z),
    };
    if (!img) this.texture(file, item);
    this.sprites.push(item);
    if (clickable) this.clickables.push(item);
    this.byTag.set(tag, item);
    this._staticDirty = true;
    return item;
  }

  /** تصویرِ یک ساختمان اصلی: کشِ سراسری + بارگذاریِ تنبل */
  texture(file, target = null) {
    this._texImages = this._texImages || new Map();
    let ent = this._texImages.get(file);
    if (!ent) {
      ent = { img: null, waiting: [], w: 0, h: 0 };
      this._texImages.set(file, ent);
      const img = new Image();
      img.decoding = 'async';
      img.onload = () => {
        ent.img = img;
        ent.w = img.naturalWidth || img.width || 1;
        ent.h = img.naturalHeight || img.height || 1;
        for (const w of ent.waiting) w();
        ent.waiting.length = 0;
        this._staticDirty = true;
      };
      img.src = ASSET(file);
    }
    const apply = (t) => { t.img = ent.img; t.aspect = ent.w / Math.max(1, ent.h); };
    if (target) {
      if (ent.img) apply(target);
      else ent.waiting.push(() => apply(target));
    }
    return { image: ent.img };
  }

  loadTexture(file) { return Promise.resolve(this.texture(file)); }

  setSpriteTexture(sp, file, width, scaleMul = 1) {
    if (!sp) return;
    sp.file = file;
    sp.width = width * scaleMul;
    this.texture(file, sp);
  }

  removeSprite(tag) {
    const sp = this.byTag.get(tag);
    if (!sp) return;
    this.sprites = this.sprites.filter((i) => i !== sp);
    this.clickables = this.clickables.filter((o) => o !== sp);
    this.byTag.delete(tag);
    this._staticDirty = true;
  }

  getSprite(tag) { return this.byTag.get(tag); }

  addActor(actor) { this.dynamic.push(actor); return actor; }

  addStaticActor(actor) {
    if (actor.frameIndex == null) actor.frameIndex = -1;
    this.staticActors.push(actor);
    this._staticDirty = true;
    return actor;
  }

  removeActor(actor) { this.dynamic = this.dynamic.filter((a) => a !== actor); }

  // ---------- برچسب‌های HTML ----------
  worldToScreen(x, y, z) {
    if (this.view.dirty) this.view.update();
    const p = this.view.css(x, y, z);
    const rect = this.canvas.getBoundingClientRect();
    return { x: p.x + rect.left, y: p.y + rect.top, depth: p.depth };
  }

  // ---------- دوربین ----------
  /**
   * کشیدنِ نقشه با انگشت: محتوا دقیقاً به اندازه‌ی حرکتِ انگشت جابه‌جا می‌شود.
   * (تغییرِ pan در فضای شهر حساب می‌شود، بعد به محورهای دید تبدیل می‌گردد.)
   */
  panBy(dx, dy) {
    const s = this.view.scale || 1;
    const S2 = Math.SQRT1_2;
    const a = dx / (S2 * s);
    const b = dy / (S2 * Math.abs(CAM_UP.z) * s);
    this.panTarget.x += (b - a) / 2;
    this.panTarget.z += (-a - b) / 2;
    const B = MAP_BOUNDS;
    this.panTarget.x = clamp(this.panTarget.x, B.panMinX, B.panMaxX);
    this.panTarget.z = clamp(this.panTarget.z, B.panMinZ, B.panMaxZ);
  }

  zoomBy(delta) { this.zoom = clamp(this.zoom * (delta > 0 ? 0.93 : 1.07), ZOOM_MIN, ZOOM_MAX); }
  zoomTo(z) { this.zoom = clamp(z, ZOOM_MIN, ZOOM_MAX); }

  focusOn(x, z, zoom = 1.15) {
    const B = MAP_BOUNDS;
    this.panTarget.x = clamp(x, B.panMinX, B.panMaxX);
    this.panTarget.z = clamp(z - 1.2, B.panMinZ, B.panMaxZ);
    this.zoom = clamp(zoom, ZOOM_MIN, ZOOM_MAX);
  }

  setArea(areaKey) {
    this.area = AREAS[areaKey] || AREAS.town;
    const f = this.area.focus;
    this.panTarget.x = f.x;
    this.panTarget.z = f.z;
    this.zoom = clamp(f.zoom, ZOOM_MIN, ZOOM_MAX);
  }

  // ---------- انتخاب ----------
  /** همه‌ی چیزهایی که در این نقطه‌ی صفحه دیده می‌شوند، از نزدیک به دور */
  pickItems(px, py) {
    if (this.view.dirty) this.view.update();
    const rect = this.canvas.getBoundingClientRect();
    const x = (px - rect.left) * this.view.dpr;
    const y = (py - rect.top) * this.view.dpr;
    const hits = [];
    const test = (it) => {
      if (!it || !it.pos) return;
      const p = this.view.screen(it.pos.x, it.pos.y || 0, it.pos.z);
      const box = this._screenBox(it, p);
      if (!box) return;
      if (x < box.x0 || x > box.x1 || y < box.y0 || y > box.y1) return;
      hits.push({ it, d: p.depth });
    };
    for (const a of this.dynamic) test(a);
    for (const a of this.staticActors) test(a);
    for (const s of this.sprites) test(s);
    // ساختمان‌ها در اولویت‌اند (لمسِ آدمکِ جلوی در، نباید ساختمان را بپوشاند)
    hits.sort((a, b) => b.d - a.d);
    return hits.map((h) => h.it);
  }

  pick(px, py) {
    const hits = this.pickItems(px, py);
    // ساختمانِ کلیک‌پذیر جلوتر از بقیه بررسی می‌شود
    return hits.find((h) => h.clickable && h.tag) || hits[0] || null;
  }

  _screenBox(it, p) {
    const frame = it.gFrame || (it.frameIndex >= 0 ? atlas.frames[it.frameIndex] : null);
    if (!frame) {
      // اسپریتِ ساختمانِ اصلی (تصویرِ کامل) — عرضِ آن با واحدِ شهر داده می‌شود
      if (!it.img || !it.width) return null;
      const w = it.width * this.view.scale;
      const h = w / Math.max(0.1, it.aspect || 1.5);
      return { x0: p.x - w / 2, x1: p.x + w / 2, y0: p.y - h, y1: p.y, w, h };
    }
    const k = this.view.scale * frame.scale;
    const x0 = p.x - frame.ox * k, y0 = p.y - frame.oy * k;
    return { x0, x1: x0 + frame.sw * k, y0, y1: y0 + frame.sh * k };
  }

  pickGround(px, py) {
    if (this.view.dirty) this.view.update();
    const rect = this.canvas.getBoundingClientRect();
    const g = this.view.groundAt(px - rect.left, py - rect.top);
    const B = MAP_BOUNDS;
    if (g.x < B.minX || g.x > B.maxX || g.z < B.minZ || g.z > B.maxZ) return null;
    return g;
  }

  // ---------- هایلایت و پدِ جانمایی ----------
  showHighlight(x, z, size = 1.6, color = 0x5adc6e) { this.highlight = { x, z, size, color: '#' + hex(color) }; }
  hideHighlight() { this.highlight = null; }

  showPlacementGhost(x, z, size, valid) {
    this.ghost = { x, z, w: size, d: size * 0.72, color: valid ? '#62e57a' : '#ff5b52' };
  }

  showPlacementGhostRect(x, z, w, d, valid) {
    this.ghost = { x, z, w, d, color: valid ? '#62e57a' : '#ff5b52' };
  }

  hidePlacementGhost() { this.ghost = null; }

  hoverSprite(tag, on) {
    const sp = this.byTag.get(tag);
    if (sp) sp.hover = on;
  }

  shakeSprite(tag, strength = 1) {
    const sp = this.byTag.get(tag);
    if (sp) sp.shake = { t: 0, s: strength };
  }

  // ---------- افکت‌ها ----------
  explode(x, y, z, colorHex = 0xffd070) {
    const colors = [colorHex, 0xffffff, 0xffb347, 0x9be15d];
    for (let i = 0; i < 14; i++) {
      const ang = Math.random() * Math.PI * 2, speed = 1.4 + Math.random() * 2.4;
      this.effects.push({
        x, y, z,
        vx: Math.cos(ang) * speed, vz: Math.sin(ang) * speed,
        vy: 2.2 + Math.random() * 2.2,
        size: 0.18 + Math.random() * 0.28,
        color: '#' + hex(colors[i % colors.length]),
        age: 0, life: 0.55 + Math.random() * 0.5,
      });
    }
  }

  coinBurst(x, y, z) { this.explode(x, y, z, 0xffe27a); }

  // ---------- حلقه‌ی رندر ----------
  update(dt) {
    const view = this.view;
    view.set(this.panTarget, this.zoom);
    view.update();
    const ctx = this.ctx;
    const W = view.cw, H = view.ch;

    // هیچ‌جا سفید نماند: اول چمن، بعد زمینِ پخته‌شده
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#7ec850';
    ctx.fillRect(0, 0, W, H);

    this._drawGround(ctx);

    // مرتب‌سازیِ یک‌باره‌ی چیزهای ثابت (وقتی دوربین یا فهرست عوض شد)
    this._prepareStatic();

    this._shadowPass(ctx);

    // همه‌ی چیزهای ثابت + متحرک‌ها در یک گذرِ مرتب‌شده (تا عمق درست بماند)
    this._drawSorted(ctx);

    if (this.highlight) this._drawRing(ctx, this.highlight);
    if (this.ghost) this._drawGhost(ctx);
    this._drawEffects(ctx, dt);

    this.renderCount++;
  }

  // زمین: یک تصویرِ بزرگ که از پیش با همان زاویه/رنگ پخته شده
  _drawGround(ctx) {
    const g = atlas.ground;
    if (!g || !g.img) return;
    const view = this.view;
    const k = view.scale;
    // x0/y0 در «واحدِ دید» هستند؛ تبدیلشان با دوربین یعنی فقط یک جمع و ضرب
    const x = g.x0 * k + view.wx;
    const y = g.y0 * k + view.wy;
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(g.img, 0, 0, g.iw || g.img.width, g.ih || g.img.height, x, y, g.w * k, g.h * k);
  }

  _shadowPass(ctx) {
    const view = this.view;
    const W = view.cw, H = view.ch;
    ctx.globalAlpha = 1;
    const blob = (x, z, w, d, op) => {
      const p = view.screen(x, 0.01, z);
      const pw = w * view.scale, pd = d * view.scale;
      if (p.x + pw < 0 || p.x - pw > W || p.y + pd < 0 || p.y - pd > H) return;
      ctx.globalAlpha = op == null ? 1 : op;
      ctx.drawImage(this.shadowTex, p.x - pw / 2, p.y - pd / 2, pw, pd);
    };
    for (const a of this.dynamic) if (a.shadow) blob(a.pos.x, a.pos.z, a.shadow.w, a.shadow.d, a.shadow.opacity);
    for (const a of this.staticActors) if (a.shadow) blob(a.pos.x, a.pos.z, a.shadow.w, a.shadow.d, a.shadow.opacity);
    for (const s of this.sprites) if (s.shadowSpec) {
      const sh = s.shadowSpec;
      blob(sh.x ?? s.pos.x, sh.z ?? s.pos.z, sh.w || 2, sh.d || 1, sh.opacity);
    }
    // سایه‌ی نمونه‌های ثابت: از روی مدل‌ها (به‌صورتِ دسته‌ای و فقط وقتی دوربین عوض شد)
    for (const it of this._sortedStatic) {
      if (!it.shadowSpec) continue;
      blob(it.pos.x, it.pos.z, it.shadowSpec.w, it.shadowSpec.d, it.shadowSpec.opacity);
    }
    ctx.globalAlpha = 1;
  }

  /** فهرستِ مرتب‌شده‌ی همه‌ی چیزهای قابلِ کشیدن، از دور به نزدیک */
  _prepareStatic() {
    const key = this._camStamp();
    if (!this._staticDirty && this._sortedKey === key) return;
    const list = [];
    // نمونه‌های ثابت از نقشه
    for (const it of this.staticItems) {
      it.depth = depthOf(it.pos.x, it.pos.y || 0, it.pos.z);
      list.push(it);
    }
    // ماشین‌ها/چیزهای ثابتِ اضافه
    for (const it of this.staticActors) {
      it.depth = depthOf(it.pos.x, it.pos.y || 0, it.pos.z);
      list.push(it);
    }
    // ساختمان‌های اصلی
    for (const it of this.sprites) {
      it.depth = depthOf(it.pos.x, it.pos.y || 0, it.pos.z);
      list.push(it);
    }
    for (const it of list) {
      const fi = it.frameIndex != null && it.frameIndex >= 0 ? it.frameIndex : -1;
      if (fi < 0) it.frameIndex = this._resolveFrame(it);
      it.gFrame = it.frameIndex >= 0 ? atlas.frames[it.frameIndex] : null;
      // سایه‌ی نمونه‌های پخته‌شده از اندازه‌ی خودِ مدل می‌آید
      if (!it.shadowSpec && it.type && it.gFrame) {
        const sz = (atlas.models[it.type] || {}).size;
        if (sz) {
          // سایه‌ی بیضی زیرِ پای مدل — کوچک و کم‌رنگ تا زیرِ ساختمان‌های بزرگ لکه نشود
          const sc = it.scale || 1;
          it.shadowSpec = {
            w: Math.max(0.5, Math.min(3.2, sz[0] * sc * 0.8)),
            d: Math.max(0.35, Math.min(2.4, sz[2] * sc * 0.5)),
            opacity: 0.5,
          };
        }
      }
    }
    list.sort((a, b) => a.depth - b.depth);
    this._sortedStatic = list;
    this._sortedKey = key;
    this._staticDirty = false;
  }

  _resolveFrame(it) {
    if (!it.type) return -1;
    if (it.frameIndex != null && it.frameIndex >= 0) return it.frameIndex;
    // چرخشِ شیء روی نقشه (رادیان، فضای شهر) → همان عددی که پخت با آن چرخانده
    const deg = ((it.rot || 0) * 180) / Math.PI;
    return frameIndexFor(it.type, deg);
  }

  _camStamp() {
    const v = this.view;
    return `${v.pan.x.toFixed(2)},${v.pan.z.toFixed(2)},${v.zoom.toFixed(3)},${v.cw}x${v.ch}`;
  }

  _drawSorted(ctx) {
    const view = this.view;
    const W = view.cw, H = view.ch;
    // متحرک‌ها هر فریم مرتب می‌شوند و در فهرستِ ثابت (که از قبل مرتب است) ادغام
    // می‌شوند — ادغام به‌جای sort سراسری، چون فهرستِ ثابت هزار ردیف است.
    const dyn = this.dynamic;
    for (const a of dyn) a.depth = depthOf(a.pos.x, a.pos.y || 0, a.pos.z);
    dyn.sort((a, b) => a.depth - b.depth);
    const statics = this._sortedStatic;
    ctx.imageSmoothingQuality = 'low';
    let i = 0, j = 0;
    while (i < statics.length || j < dyn.length) {
      // (هر دو فهرست مرتب‌اند؛ ادغامِ ساده)
      const a = statics[i], b = dyn[j];
      const it = (!b || (a && a.depth <= b.depth)) ? (i++, a) : (j++, b);
      if (it.isMainBuilding) { this._drawMain(ctx, it, W, H); continue; }
      const frame = this._frameOf(it);
      if (!frame || !frame.img) continue;
      const p = view.screen(it.pos.x, it.pos.y || 0, it.pos.z);
      const k = view.scale * frame.scale * ((it.scale || 1) / (frame.nominal || 1));
      const w = frame.sw * k, h = frame.sh * k;
      const x0 = p.x - frame.ox * k, y0 = p.y - frame.oy * k;
      if (x0 + w < -4 || x0 > W + 4 || y0 + h < -4 || y0 > H + 4) continue;
      ctx.drawImage(frame.img, frame.sx, frame.sy, frame.sw, frame.sh, x0, y0, w, h);
      if (it.state === 'yellow' || it.state === 'green' || it.state === 'red') this._drawSignal(ctx, it, x0, y0, w, h);
    }
  }

  /**
   * قابِ یک شیء. برای نمونه‌های ثابت فقط یک‌بار حساب می‌شود؛ برای متحرک‌ها
   * (ماشین/آدمک) هر بار که چرخش بیش از نیم‌پله عوض شود دوباره جست‌وجو می‌شود.
   */
  _frameOf(it) {
    if (it.frameIndex >= 0) {
      it.gFrame = it.gFrame || atlas.frames[it.frameIndex];
      // متحرک: چرخش عوض شده؟
      if (it._live) {
        const deg = ((it.rot || 0) * 180) / Math.PI;
        if (it._frameDeg == null || Math.abs(((deg - it._frameDeg + 540) % 360) - 180) > atlas.rotStep * 0.5) {
          it._frameDeg = deg;
          const fi = frameIndexFor(it.type, deg);
          if (fi >= 0) { it.frameIndex = fi; it.gFrame = atlas.frames[fi]; }
        }
      }
      return it.gFrame;
    }
    const fi = this._resolveFrame(it);
    if (fi < 0) return null;
    it.frameIndex = fi;
    it.gFrame = atlas.frames[fi];
    return it.gFrame;
  }

  _drawMain(ctx, it, W, H) {
    if (!it.img || !it.width) return;
    const view = this.view;
    const p = view.screen(it.pos.x, it.pos.y || 0, it.pos.z);
    // «width» در واحدِ شهر است (مثلِ نسخه‌ی سه‌بعدی)، پس فقط در مقیاسِ دید ضرب می‌شود
    const w = it.width * view.scale * (it.scale || 1);
    const h = w / Math.max(0.1, it.aspect || 1.5);
    const y0 = p.y - h, x0 = p.x - w / 2;
    if (x0 + w < -4 || x0 > W + 4 || y0 + h < -4 || y0 > H + 4) return;
    ctx.drawImage(it.img, x0, y0, w, h);
  }

  /** چراغِ کوچکِ راهنما روی تابلوی چراغ راهنما (سه نقطه‌ی رنگی) */
  _drawSignal(ctx, it, x0, y0, w, h) {
    const colors = { red: '#ff3b30', yellow: '#ffc12e', green: '#2fe07a' };
    const c = colors[it.state];
    if (!c) return;
    const r = Math.max(2, w * 0.06);
    const cx = x0 + w * 0.5, cy = y0 + h * (it.state === 'red' ? 0.30 : it.state === 'yellow' ? 0.36 : 0.42);
    ctx.save();
    ctx.fillStyle = c;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  _drawRing(ctx, h) {
    const view = this.view;
    const p = view.screen(h.x, 0.02, h.z);
    const s = (h.size || 1.6) * view.scale;
    ctx.save();
    ctx.globalAlpha = 0.95;
    ctx.strokeStyle = h.color;
    ctx.lineWidth = Math.max(2, s * 0.06);
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, s / 2, (s / 2) * 0.55, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  _drawGhost(ctx) {
    const g = this.ghost;
    const view = this.view;
    const p = view.screen(g.x, 0.02, g.z);
    const w = g.w * view.scale, d = g.d * view.scale;
    ctx.save();
    ctx.globalAlpha = 0.9;
    ctx.drawImage(this.ghostTex, p.x - w / 2, p.y - d / 2, w, d);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = g.color;
    ctx.lineWidth = Math.max(2, w * 0.04);
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, w / 2, d / 2, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  _drawEffects(ctx, dt) {
    const view = this.view;
    for (let i = this.effects.length - 1; i >= 0; i--) {
      const e = this.effects[i];
      e.age += dt;
      if (e.age >= e.life) { this.effects.splice(i, 1); continue; }
      e.vy -= 6.5 * dt;
      e.x += e.vx * dt;
      e.y = Math.max(0.05, e.y + e.vy * dt);
      e.z += e.vz * dt;
      const k = 1 - e.age / e.life;
      const p = view.screen(e.x, e.y, e.z);
      const s = e.size * view.scale * (0.5 + k);
      ctx.globalAlpha = k;
      ctx.fillStyle = e.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(1, s / 2), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
}

// ---------- کمکی‌ها ----------
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const hex = (n) => (n | 0).toString(16).padStart(6, '0').slice(-6);

function makeBlob(size, stops, ring = false) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const h = size / 2;
  const grd = g.createRadialGradient(h, h, size * 0.05, h, h, h * 0.97);
  for (const [at, col] of stops) grd.addColorStop(at, col);
  g.fillStyle = grd;
  g.fillRect(0, 0, size, size);
  if (ring) {
    g.strokeStyle = 'rgba(255,255,255,0.9)';
    g.lineWidth = size * 0.05;
    g.beginPath();
    g.arc(h, h, h * 0.84, 0, Math.PI * 2);
    g.stroke();
  }
  return c;
}

function makeRing(color) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.strokeStyle = color;
  g.lineWidth = 10;
  g.beginPath();
  g.arc(64, 64, 52, 0, Math.PI * 2);
  g.stroke();
  return c;
}
