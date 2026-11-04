// ================= نمایشِ شهر با تصویرهای پخته‌شده =================
// منطقِ شهر همان کدِ قبلی است؛ این فایل فقط «چشم» شهر است: به‌جای WebGL، تصویرهای
// ایزومتریکی روی canvas کشیده می‌شوند که scripts/bake-sprites.mjs از پیش از همان
// مدل‌های سه‌بعدی ساخته است.
//
// units.json (نسخه‌ی ۳):
//   { version, bpp, rotStep, atlases:{name:{file,w,h}}, ground:{file,x0,z0,size},
//     frames:[[atlas,x,y,w,h,ox,oy,kind,rot,scale,y]], models:{type:{size,kit}},
//     instances:[{f,t,x,y,z,r,s}] }
import { VIEW_HEIGHT, CAM_UP, project, CAM_PITCH_SIN } from './cam.js';
import { ASSET } from './config.js';

export const atlas = {
  ready: false,
  failed: false,
  meta: null,
  bpp: 46,
  rotStep: 15,
  images: [],
  frames: [],          // [{ img, sx, sy, sw, sh, ox, oy }]
  models: {},
  instances: [],
  byType: new Map(),   // نوع → [شماره‌ی قاب]
  ground: null,
};

/** تصویر را می‌آورد؛ createImageBitmap اگر بود (سریع‌تر و حافظه‌ی کمتر). */
function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = 'async';
    // عمداً Image خام نگه داشته می‌شود (نه ImageBitmap): بعضی مرورگرهای قدیمی
    // ImageBitmap را برای تصویرِ بزرگ قبول نمی‌کنند و drawImage هم با Image ساده
    // سریع‌تر از تبدیلِ مداوم است.
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(url));
    img.src = url;
  });
}

const imgW = (img) => (img && (img.width || img._w)) || 1;
const imgH = (img) => (img && (img.height || img._h)) || 1;

/**
 * بارگذاریِ atlas. زمین اول (تا صفحه از همان ثانیه‌ی اول تصویر داشته باشد) و بعد
 * اتلس‌ها. نتیجه: true/false — هرگز throw نمی‌کند تا بوتِ بازی گیر نکند.
 */
/** آدرسِ مطلق (چون fetch در بعضی محیط‌ها آدرسِ نسبی را نمی‌شناسد) */
function absUrl(path) {
  try {
    const base = (typeof document !== 'undefined' && document.baseURI) || (typeof location !== 'undefined' ? location.href : null);
    return base ? new URL(path, base).href : path;
  } catch (e) { return path; }
}

export function loadAtlas(onStep) {
  if (atlas.promise) return atlas.promise;
  atlas.promise = (async () => {
    const res = await fetch(absUrl(ASSET('city-2d/units.json')), { cache: 'force-cache' });
    if (!res.ok) throw new Error('units.json ' + res.status);
    const meta = await res.json();
    atlas.meta = meta;
    atlas.bpp = meta.bpp || 46;
    atlas.rotStep = meta.rotStep || 15;
    atlas.models = meta.models || {};
    atlas.instances = meta.instances || [];

    const names = Object.keys(meta.atlases || {}).sort();
    atlas.images = new Array(names.length);
    const order = meta.ground ? ['ground', ...names] : names;
    for (const name of order) {
      if (name === 'ground') {
        const g = meta.ground;
        if (!g) continue;
        const img = await loadImage(absUrl(ASSET(g.file)));
        atlas.ground = { img, iw: imgW(img), ih: imgH(img), x0: g.x0, y0: g.y0, w: g.w, h: g.h };
        if (onStep) onStep('ground');
        continue;
      }
      const a = meta.atlases[name];
      const img = await loadImage(absUrl(ASSET(a.file)));
      const idx = names.indexOf(name);
      atlas.images[idx] = img;
      a.img = img;
      a.iw = imgW(img); a.ih = imgH(img);
      if (onStep) onStep('atlas');
    }

    atlas.frames = meta.frames.map((f) => {
      const a = meta.atlases[names[f[0]]];
      // scale = پیکسل → واحدِ شهر (قاب با «مقیاسِ نامیِ نوعش» پخته شده؛ نسبتِ
      // مقیاسِ خودِ شیء هنگامِ کشیدن ضرب می‌شود)
      return { img: a.img, sx: f[1], sy: f[2], sw: f[3], sh: f[4], ox: f[5], oy: f[6], scale: 1 / atlas.bpp, nominal: f[9] || 1 };
    });
    // فهرستِ قاب‌های هر نوع (برای نزدیک‌ترین چرخش). نوع‌ها در units.types هستند تا
    // بازیگرانِ متحرک (ماشین/آدمک) هم که در instances نیستند قاب داشته باشند.
    atlas.byType.clear();
    const typeNames = meta.typeNames || [];
    meta.frames.forEach((f, i) => {
      const t = typeNames[meta.types ? meta.types[i] : -1] || '';
      let list = atlas.byType.get(t);
      if (!list) { list = []; atlas.byType.set(t, list); }
      list.push(i);
    });
    atlas.meta._frameRot = meta.frames.map((f) => f[8] || 0);
    atlas.ready = true;
    return true;
  })().catch((e) => {
    console.warn('[luko] atlas:', e && e.message ? e.message : e);
    atlas.failed = true;
    return false;
  });
  return atlas.promise;
}

/**
 * شماره‌ی نزدیک‌ترین قابِ پخته‌شده برای یک نوع در یک چرخش.
 * rotDeg = چرخشِ شیء روی نقشه (درجه). پخت هم با همان عدد چرخانده، پس مستقیم
 * مقایسه می‌شود (پخت حولِ y می‌چرخاند و تصویرِ ایزومتریک را می‌سازد).
 */
export function frameIndexFor(type, rotDeg) {
  const meta = atlas.meta;
  if (!meta) return -1;
  const list = atlas.byType.get(type);
  if (!list || !list.length) return -1;
  const rots = meta._frameRot || [];
  const deg = ((rotDeg % 360) + 360) % 360;
  const seen = list._cache || (list._cache = new Map());
  const key = Math.round(deg / 5) * 5;
  const hit = seen.get(key);
  if (hit != null) return hit;
  let best = list[0], bd = 1e9;
  for (const fi of list) {
    const r = rots[fi] || 0;
    const d = Math.abs(r - deg);
    const dd = Math.min(d, 360 - d);
    if (dd < bd) { bd = dd; best = fi; }
  }
  seen.set(key, best);
  return best;
}

// ---------- دوربین / دید ----------
export class View {
  constructor() {
    this.pan = { x: 0, z: 0 };
    this.zoom = 1;
    this.cw = 1;
    this.ch = 1;
    this.dpr = 1;
    this.scale = 1;
    this.wx = 0;
    this.wy = 0;
    this.dirty = true;
  }

  resize(cssW, cssH, dpr) {
    this.cssW = cssW;
    this.cssH = cssH;
    this.dpr = dpr;
    this.cw = Math.max(1, Math.round(cssW * dpr));
    this.ch = Math.max(1, Math.round(cssH * dpr));
    this.dirty = true;
  }

  set(pan, zoom) {
    if (pan) { this.pan.x = pan.x; this.pan.z = pan.z; }
    if (zoom != null) this.zoom = zoom;
    this.dirty = true;
  }

  update() {
    // سقفِ وضوح: بالای ۱۲۰۰ پیکسلِ عمودی، جزئیاتِ بیشتری لازم نیست و حافظه/زمان
    // کشیدن چند برابر می‌شود (روی گوشی همین باعثِ کندی بود).
    const refH = Math.min(this.ch, 1200);
    this.scale = refH / (VIEW_HEIGHT / this.zoom);
    const p = project(this.pan.x, 0, this.pan.z);
    this.wx = this.cw / 2 - p.sx * this.scale;
    this.wy = this.ch / 2 - p.sy * this.scale;
    this.dirty = false;
  }

  screen(x, y, z) {
    const p = project(x, y, z);
    return { x: p.sx * this.scale + this.wx, y: p.sy * this.scale + this.wy, depth: p.depth };
  }

  css(x, y, z) {
    const p = this.screen(x, y, z);
    return { x: p.x / this.dpr, y: p.y / this.dpr, depth: p.depth };
  }

  /** پیکسلِ صفحه (CSS) → نقطه روی زمین (معکوسِ دقیقِ project) */
  groundAt(cx, cy) {
    const sx = (cx * this.dpr - this.wx) / this.scale;
    const sy = (cy * this.dpr - this.wy) / this.scale;
    const S2 = Math.SQRT1_2;
    // project: sx = (x+z)·S2 ،  sy = (z−x)·S2·(−UP.z)
    const sum = sx / S2;                        // x + z
    const diff = sy / (S2 * -CAM_UP.z);         // z − x
    return { x: (sum - diff) / 2, z: (sum + diff) / 2 };
  }
}

export { VIEW_HEIGHT, CAM_PITCH_SIN };
