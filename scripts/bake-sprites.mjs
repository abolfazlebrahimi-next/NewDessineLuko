// ================= پختِ شهرِ سه‌بعدی به تصویرهای دو‌بعدی =================
// ساختمان‌ها، درخت‌ها، خیابان‌ها و ماشین‌ها تا حالا همه سه‌بعدی (WebGL) رسم می‌شدند؛
// روی گوشیِ ضعیف و لپ‌تاپِ بی‌کارت‌گرافیک همین باعث کندی و صفحه‌ی سفید بود. این اسکریپت
// همان شهر را در نود، با همان زاویه و نورِ بازی، «از پیش» رندر می‌کند و می‌سازد:
//
//   public/assets/city-2d/ground.webp   ← کفِ کاملِ شهر (خیابان/پیاده‌رو/چمن) یک تصویر
//   public/assets/city-2d/atlas-*.webp  ← اسپریتِ ایزومتریکِ همه‌ی مدل‌ها (هر چرخشِ لازم)
//   public/assets/city-2d/units.json    ← نقشه‌ی قاب‌ها + فهرستِ نمونه‌های ثابتِ شهر
//
// بازی فقط این تصویرها را روی canvas می‌کشد: چند drawImage در هر فریم. نه WebGL، نه
// متریال، نه هزاران مثلث. (نمونه‌های متحرک — ماشین/آدمک — هم از همین قاب‌ها می‌آیند.)
//
//   node scripts/bake-sprites.mjs              → کیفیتِ استاندارد
//   QUALITY=high node scripts/bake-sprites.mjs → اسپریت‌های بزرگ‌تر
import { JSDOM } from 'jsdom';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import * as THREE from 'three';
import { loadAllModels, GLTFLoaderProxy, modelForm } from './lib/models.mjs';
import { renderItems, SRGB2LIN } from './lib/soft-render.mjs';
import { paintGround, groundGeometry } from './lib/ground-paint.mjs';
import { createCanvas, ImageData } from '@napi-rs/canvas';

const ROOT = process.cwd();
const OUT_DIR = process.env.OUTDIR || join(ROOT, 'public/assets/city-2d');
const QUALITY = process.env.QUALITY || 'standard';
const BPP = QUALITY === 'high' ? 64 : QUALITY === 'low' ? 30 : 46;   // پیکسل بر واحدِ شهر
const SS = 2;                                                        // سوپرسمپلینگ
const ATLAS = 2048;     // تکه‌های ۲۰۴۸² — روی گوشیِ کم‌حافظه امن‌تر از یک تصویرِ ۴۰۹۶² است
const ROT_STEP = 15;                                                 // پله‌ی چرخشِ قاب‌ها (درجه)
const GROUND_PX = QUALITY === 'high' ? 4096 : 3200;

// ---------- محیطِ ساختگی برای اجرای city/plan در نود ----------
const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', { url: 'http://localhost/', pretendToBeVisual: true });
global.window = dom.window;
global.document = dom.window.document;
global.HTMLElement = dom.window.HTMLElement;
global.HTMLCanvasElement = dom.window.HTMLCanvasElement;
global.HTMLImageElement = dom.window.HTMLImageElement;
global.MutationObserver = dom.window.MutationObserver;
global.ProgressEvent = dom.window.ProgressEvent;
global.self = globalThis;
global.requestAnimationFrame = (cb) => setTimeout(() => cb(0), 16);
window.matchMedia = window.matchMedia || (() => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
const stub2d = () => {
  const grad = { addColorStop() {} };
  const noop = () => {};
  const ctx = {
    createRadialGradient: () => grad, createLinearGradient: () => grad, createPattern: () => ({}),
    measureText: () => ({ width: 10 }),
    getImageData: (x, y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h }),
    putImageData: noop, save: noop, restore: noop, beginPath: noop, closePath: noop, moveTo: noop,
    lineTo: noop, arc: noop, arcTo: noop, ellipse: noop, rect: noop, fill: noop, stroke: noop,
    clip: noop, fillRect: noop, strokeRect: noop, clearRect: noop, translate: noop, rotate: noop,
    scale: noop, setTransform: noop, resetTransform: noop, setLineDash: noop, fillText: noop,
    drawImage: noop, bezierCurveTo: noop, quadraticCurveTo: noop,
  };
  return new Proxy(ctx, { get(t, p) { return p in t ? t[p] : undefined; }, set() { return true; } });
};
window.HTMLCanvasElement.prototype.getContext = function (type) {
  if (type !== '2d') return null;
  this._ctx = this._ctx || stub2d();
  return this._ctx;
};
Object.defineProperty(window.HTMLImageElement.prototype, 'src', {
  configurable: true,
  set(v) {
    this._src = v;
    setTimeout(() => {
      try { Object.defineProperty(this, 'width', { value: 256, configurable: true }); Object.defineProperty(this, 'height', { value: 256, configurable: true }); } catch (e) { /* ok */ }
      this.dispatchEvent(new window.Event('load'));
    }, 0);
  },
  get() { return this._src || ''; },
});

const { CITY } = await import('../src/config.js');
const planMod = await import('../src/plan.js');

// ---------- ۱) مدل‌ها و اندازه‌ها ----------
const t0 = Date.now();
const models = loadAllModels(join(ROOT, 'public'));
const loader = new GLTFLoaderProxy();
const forms = new Map();
async function formOf(key) {
  if (forms.has(key)) return forms.get(key);
  const m = models[key];
  if (!m) { forms.set(key, null); return null; }
  const f = await modelForm(loader, m.file);
  f.key = key;
  f.kit = m.kit;
  forms.set(key, f);
  return f;
}
const sizeTable = {};
for (const key of Object.keys(models)) {
  const f = await formOf(key);
  if (f) sizeTable[key] = [f.size.x, f.size.y, f.size.z];
}
planMod.setSizeTable(sizeTable);
const plan = planMod.buildPlan();
console.log(`مدل‌ها: ${Object.keys(models).length}، نمونه‌های شهر: ${plan.instances.length} — ${Date.now() - t0}ms`);

// ---------- ۲) colormap هر پکیج ----------
const cmapCache = new Map();
async function colormapFor(kit) {
  if (cmapCache.has(kit)) return cmapCache.get(kit);
  let cm = null;
  try {
    const { data, info } = await sharp(join(ROOT, 'public', kit, 'Textures/colormap.png')).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    cm = { data, w: info.width, h: info.height, linear: SRGB2LIN };
  } catch (e) { cm = null; }
  cmapCache.set(kit, cm);
  return cm;
}

// ---------- ۳) شکل‌های ساختِ کد (نیمکت، فواره، لامپ…) ----------
const prim = (() => {
  const TAU = Math.PI * 2;
  const box = () => ({
    verts: new Float32Array([-0.5, -0.5, 0.5, 0.5, -0.5, 0.5, 0.5, 0.5, 0.5, -0.5, 0.5, 0.5, -0.5, -0.5, -0.5, -0.5, 0.5, -0.5, 0.5, 0.5, -0.5, 0.5, -0.5, -0.5]),
    idx: [0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7, 0, 3, 7, 0, 7, 4, 1, 5, 6, 1, 6, 2, 3, 2, 6, 3, 6, 7, 0, 4, 5, 0, 5, 1],
  });
  const cyl = (segs = 16) => {
    const verts = [], idx = [];
    for (let i = 0; i < segs; i++) {
      const a = (i / segs) * TAU, b = ((i + 1) / segs) * TAU;
      const ca = Math.cos(a), sa = Math.sin(a), cb = Math.cos(b), sb = Math.sin(b);
      let base = verts.length / 3;
      verts.push(ca, -0.5, sa, cb, -0.5, sb, cb, 0.5, sb, ca, 0.5, sa);
      idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
      base = verts.length / 3;
      verts.push(0, 0.5, 0, ca, 0.5, sa, cb, 0.5, sb);
      idx.push(base, base + 2, base + 1);
      base = verts.length / 3;
      verts.push(0, -0.5, 0, ca, -0.5, sa, cb, -0.5, sb);
      idx.push(base, base + 1, base + 2);
    }
    return { verts: new Float32Array(verts), idx };
  };
  const sph = (segs = 12, rings = 8) => {
    const verts = [], idx = [];
    for (let y = 0; y <= rings; y++) {
      const phi = -Math.PI / 2 + (y / rings) * Math.PI;
      for (let x = 0; x <= segs; x++) {
        const th = (x / segs) * TAU;
        verts.push(Math.cos(phi) * Math.cos(th) * 0.5, Math.sin(phi) * 0.5, Math.cos(phi) * Math.sin(th) * 0.5);
      }
    }
    for (let y = 0; y < rings; y++) {
      for (let x = 0; x < segs; x++) {
        const a = y * (segs + 1) + x, b = a + segs + 1;
        idx.push(a, b, a + 1, a + 1, b, b + 1);
      }
    }
    return { verts: new Float32Array(verts), idx };
  };
  return { box, cyl, sph };
})();

const C = (hex) => {
  const c = new THREE.Color(hex).convertSRGBToLinear();
  return [c.r, c.g, c.b];
};

function piece(shape, colorHex, dims, pos = [0, 0, 0], { basic = false } = {}) {
  const src = shape.verts;
  const v = new Float32Array(src.length);
  for (let i = 0; i < v.length; i += 3) {
    v[i] = src[i] * dims[0] + pos[0];
    v[i + 1] = src[i + 1] * dims[1] + pos[1];
    v[i + 2] = src[i + 2] * dims[2] + pos[2];
  }
  return { verts: v, idx: shape.idx, color: C(colorHex), basic, side: 2 };
}

// شکل‌های «ساختِ کد» با همان ابعادِ نسخه‌ی سه‌بعدی
function codeParts(type) {
  const B = prim.box(), CY = prim.cyl(), SP = prim.sph();
  switch (type) {
    case '@bench': return [
      piece(B, 0x8a5a2b, [1.15, 0.09, 0.42], [0, 0.42, 0]),
      piece(B, 0x8a5a2b, [1.15, 0.42, 0.08], [0, 0.68, -0.2]),
      piece(B, 0x8a5a2b, [0.09, 0.42, 0.4], [-0.48, 0.21, 0]),
      piece(B, 0x8a5a2b, [0.09, 0.42, 0.4], [0.48, 0.21, 0]),
    ];
    case '@bollard': return [
      piece(CY, 0x4a505c, [0.17, 0.5, 0.17], [0, 0.31, 0]),
      piece(SP, 0xf2f2ee, [0.18, 0.18, 0.18], [0, 0.58, 0]),
    ];
    case '@lamp': return [
      piece(CY, 0x3f4652, [0.09, 1.9, 0.09], [0, 0.95, 0]),
      piece(SP, 0xfff3c4, [0.26, 0.26, 0.26], [0, 1.95, 0], { basic: true }),
    ];
    case '@fountain': return [
      piece(CY, 0xb9b3a8, [2.8, 0.4, 2.8], [0, 0.2, 0]),
      piece(CY, 0x57b7e8, [2.24, 0.04, 2.24], [0, 0.41, 0], { basic: true }),
      piece(CY, 0xb9b3a8, [0.4, 0.35, 0.4], [0, 0.58, 0]),
      piece(CY, 0xb9b3a8, [0.28, 0.75, 0.28], [0, 1.13, 0]),
      piece(SP, 0xb9b3a8, [0.44, 0.44, 0.44], [0, 1.6, 0]),
    ];
    case '@pond': return [
      piece(CY, 0xb9b3a8, [2.1, 0.3, 2.1], [0, 0.15, 0]),
      piece(CY, 0x57b7e8, [1.64, 0.04, 1.64], [0, 0.31, 0], { basic: true }),
    ];
    case '@planterRing': return [
      piece(CY, 0xb9b3a8, [2.2, 0.34, 2.2], [0, 0.17, 0]),
      piece(CY, 0x4f8f3a, [1.96, 0.05, 1.96], [0, 0.36, 0]),
    ];
    case '@flower': return [piece(SP, 0xffffff, [0.2, 0.2, 0.2], [0, 0.1, 0])];
    case '@hedge': return [piece(B, 0x3e7d33, [2.0, 0.84, 0.6], [0, 0.42, 0])];
    case '@pathX': return [piece(B, 0xe8dfc4, [11, 0.03, 1.5], [0, 0.02, 0], { basic: true })];
    case '@pathZ': return [piece(B, 0xe8dfc4, [1.5, 0.03, 11], [0, 0.02, 0], { basic: true })];
    case '@roundabout': return [
      piece(CY, 0xb9b3a8, [2.1, 0.3, 2.1], [0, 0.16, 0]),
      piece(CY, 0x5f9e46, [1.84, 0.06, 1.84], [0, 0.29, 0]),
    ];
    default: return null;
  }
}

// ---------- ۴) خوشه‌بندیِ نمونه‌ها (هر چرخش/رنگ یک قاب) ----------
// برای هر نوع یک «مقیاسِ نامی» می‌گیریم (بزرگ‌ترین مقیاسِ لازم) تا اسپریت با
// وضوحِ کافی پخته شود؛ هنگامِ کشیدن، نسبتِ مقیاسِ خودِ شیء اعمال می‌شود.
const quantRot = (rad) => {
  const d = ((rad * 180) / Math.PI) % 360;
  const q = Math.round((((d % 360) + 360) % 360) / ROT_STEP) * ROT_STEP;
  return q % 360;
};
const nominal = new Map();      // type → بزرگ‌ترین مقیاس
for (const it of plan.instances) {
  const s0 = it.scale || 1;
  if (!nominal.has(it.type) || nominal.get(it.type) < s0) nominal.set(it.type, s0);
}
const dynamic = planMod.buildDynamic();
for (const d of dynamic) {
  if (!nominal.has(d.type) || nominal.get(d.type) < d.scale) nominal.set(d.type, d.scale);
}
const nomOf = (type) => +(nominal.get(type) || 1).toFixed(3);

const defs = new Map();
const addDef = (type, deg, tint, items = []) => {
  const key = `${type}|${deg}|${tint == null ? '' : tint.toString(16)}`;
  let d = defs.get(key);
  if (!d) {
    d = { key, type, deg, scale: nomOf(type), tint, items: [] };
    defs.set(key, d);
  }
  d.items.push(...items);
  return d;
};
for (const it of plan.instances) addDef(it.type, quantRot(it.rot || 0), it.tint, [it]);
// بازیگرانِ متحرک: همه‌ی چرخش‌ها (چون هر لحظه می‌چرخند)
for (const d of dynamic) {
  for (let deg = 0; deg < 360; deg += ROT_STEP) addDef(d.type, deg, null);
}
console.log(`قاب‌های یکتا: ${defs.size} (${dynamic.length} نوعِ متحرک)`);

// ---------- ۵) رندرِ هر قاب ----------
const PED = (await import('../src/city.js')).personParts;
const planLooks = planMod;

async function bakeShape(def) {
  const parts = [];
  if (def.type.startsWith('@')) {
    const code = codeParts(def.type);
    if (!code) return null;
    for (const p of code) parts.push(p);
  } else if (def.type.startsWith('ped:') || def.type.startsWith('skater:')) {
    const isPed = def.type.startsWith('ped:');
    const look = isPed
      ? planLooks.PED_LOOKS[+def.type.slice(4)]
      : planLooks.SKATER_LOOKS[+def.type.slice(7)];
    if (!look) return null;
    const shape = PED(look, isPed ? 'walk' : 'stand');
    for (const p of shape.p) {
      // رنگ‌ها در personParts به‌صورتِ sRGB خام‌اند؛ به خطی تبدیل می‌شوند
      const lin = [0, 1, 2].map((i) => {
        const v = p.c[i];
        return v < 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
      });
      parts.push({ verts: p.v, idx: p.i, color: lin, basic: !!p.b, side: 2 });
    }
  } else {
    const f = await formOf(def.type);
    if (!f) return null;
    for (const p of f.parts) {
      parts.push({
        geo: p.geo, matrix: p.m, color: p.color, basic: p.basic, side: p.side,
        cm: await colormapFor(f.kit),
      });
    }
  }
  const rad = (def.deg * Math.PI) / 180;
  // چرخشِ ۴۵ درجه‌ی شهر روی خودِ مدل اعمال می‌شود تا بازی فقط x/z محلی بداند
  const M = new THREE.Matrix4().compose(
    new THREE.Vector3(0, 0, 0),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rad + Math.PI / 4, 0)),
    new THREE.Vector3(def.scale, def.scale, def.scale),
  );
  const res = renderItems([{ parts, matrix: M, tint: null }], {
    bpp: BPP, ss: SS, margin: 1.5,
    colormapOf: (part) => part.cm,
  });
  if (!res) return null;
  // رنگِ تنوع (tint): مثل material.color در three، روی رنگ ضرب می‌شود
  if (def.tint != null && def.tint !== 0xffffff) {
    const mul = [((def.tint >> 16) & 255) / 255, ((def.tint >> 8) & 255) / 255, (def.tint & 255) / 255];
    for (let i = 0; i < res.data.length; i += 4) {
      res.data[i] = Math.min(255, res.data[i] * mul[0]);
      res.data[i + 1] = Math.min(255, res.data[i + 1] * mul[1]);
      res.data[i + 2] = Math.min(255, res.data[i + 2] * mul[2]);
    }
  }
  return res;
}

// ---------- ۶) اطلس‌بندی ----------
mkdirSync(OUT_DIR, { recursive: true });
const atlases = [];
let cur = null;
function newAtlas() {
  cur = { id: atlases.length, x: 0, y: 0, rowH: 0, w: 1, h: 1, frames: [] };
  atlases.push(cur);
  return cur;
}
function alloc(w, h) {
  if (!cur) newAtlas();
  if (cur.x + w + 1 > ATLAS) { cur.x = 0; cur.y += cur.rowH + 1; cur.rowH = 0; }
  if (cur.y + h + 1 > ATLAS) newAtlas();
  const f = { x: cur.x, y: cur.y, w, h, atlas: cur.id };
  cur.x += w + 1;
  cur.rowH = Math.max(cur.rowH, h);
  cur.w = Math.max(cur.w, f.x + w);
  cur.h = Math.max(cur.h, f.y + h);
  cur.frames.push(f);
  return f;
}

const baked = [];
let skipped = 0;
const t1 = Date.now();
let done = 0;
for (const def of defs.values()) {
  const res = await bakeShape(def);
  done++;
  if (done % 60 === 0) process.stdout.write(`\r  ${done}/${defs.size}…`);
  if (!res) { skipped++; if (skipped < 8) console.log('  رد:', def.type, def.deg); continue; }
  const placed = alloc(res.w, res.h);
  baked.push({ def, res, placed, index: baked.length });
}
console.log(`\nرندر ${baked.length} قاب (${skipped} رد) در ${((Date.now() - t1) / 1000).toFixed(1)}s`);

// ---------- ۷) نوشتنِ تصویرهای اطلس ----------
for (const a of atlases) {
  const c = createCanvas(Math.max(1, a.w), Math.max(1, a.h));
  const g = c.getContext('2d');
  for (const b of baked) {
    const f = b.placed;
    if (f.atlas !== a.id) continue;
    const fw = Math.min(f.w, a.w - f.x), fh = Math.min(f.h, a.h - f.y);
    if (fw <= 0 || fh <= 0) continue;
    const idata = new ImageData(new Uint8ClampedArray(b.res.data), f.w, f.h);
    // روی برشِ کوچک‌تر: ابتدا یک canvasِ دقیقاً هم‌اندازه، بعد drawImage
    const tile = createCanvas(f.w, f.h);
    tile.getContext('2d').putImageData(idata, 0, 0);
    g.drawImage(tile, 0, 0, fw, fh, f.x, f.y, fw, fh);
  }
  const name = `atlas-${a.id}`;
  a.file = `city-2d/${name}.webp`;
  a.name = name;
  await sharp(c.toBuffer('image/png')).webp({ quality: 88, alphaQuality: 92, effort: 5 }).toFile(join(OUT_DIR, `${name}.webp`));
}

// ---------- ۸) کفِ شهر (در فضای دیدِ ایزو، آماده برای یک drawImage) ----------
const geo = groundGeometry(CITY);
let gp = null, ground = null;
{
  const ppu = GROUND_PX / geo.viewW;              // پیکسل بر واحدِ دید
  const gW = Math.round(geo.viewW * ppu), gH = Math.round(geo.viewH * ppu);
  const c = createCanvas(gW, gH);
  const g2 = c.getContext('2d');
  paintGround(g2, { CITY, ppu, x0: geo.x0, y0: geo.y0 });
  const buf = c.toBuffer('image/png');
  gp = await sharp(buf).webp({ quality: 92 }).toFile(join(OUT_DIR, 'ground.webp'));
  ground = { x0: geo.x0, y0: geo.y0, w: geo.viewW, h: geo.viewH, wpx: gW, hpx: gH };
  console.log(`  زمین: ${gW}x${gH} پیکسل برای ${geo.viewW.toFixed(1)}x${geo.viewH.toFixed(1)} واحدِ دید`);
}

// ---------- ۹) units.json ----------
// قاب‌ها: [atlas, x, y, w, h, ox, oy, kind, rot, scale]
// kind: 'c' = ساختِ کد، 'm' = مدلِ سه‌بعدی، 'd' = بازیگرِ متحرک
const frameType = baked.map((b) => b.def.type);
const frames = baked.map((b) => [
  b.placed.atlas, b.placed.x, b.placed.y, b.res.w, b.res.h, b.res.ox, b.res.oy,
  b.def.type.startsWith('@') ? 'c' : (b.def.type.startsWith('car:') || b.def.type.startsWith('ped:') || b.def.type.startsWith('skater:') || b.def.type.startsWith('r:traffic')) ? 'd' : 'm',
  b.def.deg, b.def.scale,
]);
const units = {
  version: 3,
  bpp: BPP,
  rotStep: ROT_STEP,
  atlases: Object.fromEntries(atlases.map((a) => [a.name, { file: a.file, w: a.w, h: a.h }])),
  ground: { file: 'city-2d/ground.webp', x0: +ground.x0.toFixed(3), y0: +ground.y0.toFixed(3), w: +ground.w.toFixed(3), h: +ground.h.toFixed(3), wpx: ground.wpx, hpx: ground.hpx },
  frames,
  // نوعِ هر قاب (شماره در فهرستِ typeNames) — برای نزدیک‌ترین چرخش در بازی
  types: [],
  typeNames: [],
  models: {},
  instances: [],
};
{
  const names = [];
  const idx = new Map();
  for (const t of frameType) {
    if (!idx.has(t)) { idx.set(t, names.length); names.push(t); }
    units.types.push(idx.get(t));
  }
  units.typeNames = names;
}
for (const [k, f] of forms.entries()) {
  if (f) units.models[k] = { size: [+f.size.x.toFixed(3), +f.size.y.toFixed(3), +f.size.z.toFixed(3)], kit: f.kit };
}
// ابعادِ تقریبیِ آدمک‌ها (برای سایه و انتخاب با انگشت)
units.models['@ped'] = { size: [0.6, 1.2, 0.4] };
// قابِ هر نمونه را از روی همان کلیدش پیدا کن
const keyToIndex = new Map(baked.map((b, i) => [b.def.key, i]));
for (const def of defs.values()) {
  const fi = keyToIndex.get(def.key);
  if (fi == null) continue;
  for (const it of def.items) {
    units.instances.push({
      f: fi, t: def.type,
      x: +it.x.toFixed(3), y: +(it.y || 0).toFixed(3), z: +it.z.toFixed(3),
      r: def.deg, s: +(it.scale || 1).toFixed(3),
    });
  }
}
// فقط نمونه‌های ثابتِ نقشه ذخیره می‌شوند؛ قاب‌ها شاملِ همه‌ی چرخش‌ها هستند
writeFileSync(join(OUT_DIR, 'units.json'), JSON.stringify(units));
const bytes = readFileSync(join(OUT_DIR, 'units.json')).length;
console.log(`✓ ${OUT_DIR}`);
console.log(`  units.json ${(bytes / 1024).toFixed(0)}KB — ${units.instances.length} نمونه، ${frames.length} قاب`);
for (const a of atlases) console.log(`  ${a.name}.webp ${a.w}x${a.h}`);
console.log(`  ground.webp ${gp.width}x${gp.height} (${(gp.size / 1024).toFixed(0)}KB)`);
console.log(`  حجمِ کل: ${(atlases.reduce((n, a) => n + (a.bytes || 0), 0) / 1024).toFixed(0)}KB اطلس + ${(gp.size / 1024).toFixed(0)}KB زمین`);
process.exit(0);
