// راستی‌آزمایی نقشه‌ی شهر برای رندرِ دو‌بعدی: همه‌ی نمونه‌های چیده‌شده در atlas
// قاب دارند، تصویرِ کف و اتلس‌ها موجودند و اجرای شهر بدونِ WebGL کار می‌کند.
//   node scripts/verify-models.mjs
import { JSDOM } from 'jsdom';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';

const dom = new JSDOM('<!DOCTYPE html><html><body><div id="labels"></div></body></html>', {
  url: 'http://localhost/', pretendToBeVisual: true,
});
const { window } = dom;
global.window = window;
global.document = window.document;
global.HTMLElement = window.HTMLElement;
global.HTMLCanvasElement = window.HTMLCanvasElement;
global.MutationObserver = window.MutationObserver;
global.ProgressEvent = window.ProgressEvent;
global.self = globalThis;
Object.defineProperty(global, 'navigator', { value: window.navigator, configurable: true });
global.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 16);
global.cancelAnimationFrame = (id) => clearTimeout(id);
window.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });

// استاب canvas دوبعدی — شهر فقط drawImage و شکل می‌خواهد
function make2D() {
  const gradient = { addColorStop() {} };
  return new Proxy({}, {
    get(t, prop) {
      if (prop === 'createRadialGradient' || prop === 'createLinearGradient') return () => gradient;
      if (prop === 'measureText') return () => ({ width: 10 });
      if (prop === 'canvas') return { width: 128, height: 128 };
      if (typeof prop === 'string') return () => undefined;
      return undefined;
    },
    set() { return true; },
  });
}
window.HTMLCanvasElement.prototype.getContext = function (type) { return type === '2d' ? make2D() : null; };
Object.defineProperty(window.HTMLImageElement.prototype, 'src', {
  configurable: true,
  set(v) {
    this._src = v;
    setTimeout(() => {
      try {
        Object.defineProperty(this, 'width', { value: 256, configurable: true });
        Object.defineProperty(this, 'height', { value: 256, configurable: true });
        Object.defineProperty(this, 'naturalWidth', { value: 256, configurable: true });
        Object.defineProperty(this, 'naturalHeight', { value: 256, configurable: true });
      } catch (e) { /* ok */ }
      this.dispatchEvent(new window.Event('load'));
    }, 0);
  },
  get() { return this._src || ''; },
});
global.Image = window.Image;
window.Image = window.Image;
global.fetch = async (url) => {
  const u = new URL(String(url));
  const file = join('public', u.pathname.replace(/^\/+/, ''));
  try {
    const buf = readFileSync(file);
    return {
      ok: true, status: 200,
      json: async () => JSON.parse(buf.toString()),
      arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
    };
  } catch (e) {
    return { ok: false, status: 404, json: async () => ({}), arrayBuffer: async () => new ArrayBuffer(0) };
  }
};

const { World } = await import('../src/world.js');
const { City } = await import('../src/city.js');

let failed = 0;
const check = (n, c) => { console.log((c ? '✓ ' : '✗ ') + n); if (!c) failed++; };

// ---------- ۱) فایل‌های پخته‌شده ----------
const dir = 'public/assets/city-2d';
const meta = JSON.parse(readFileSync(join(dir, 'units.json'), 'utf8'));
check(`units.json نسخه‌ی ۳ است (${meta.frames.length} قاب، ${meta.instances.length} نمونه)`,
  meta.version === 3 && meta.frames.length > 500 && meta.instances.length > 900);
let bytes = statSync(join(dir, 'ground.webp')).size;
for (const a of Object.values(meta.atlases)) bytes += statSync(join('public/assets', a.file)).size;
check(`حجمِ تصویرهای شهر ${(bytes / 1024 / 1024).toFixed(1)} مگابایت (زیرِ ۵)`, bytes < 5 * 1024 * 1024);
check('زمین در فضای دیدِ ایزو پخته شده (نه نقشه‌ی مربعی)', meta.ground && meta.ground.h > 0 && meta.ground.y0 < 0);
for (const a of Object.values(meta.atlases)) check(`اتلس ${a.file} هست و اندازه‌اش درست است`, existsSync(join('public/assets', a.file)) && a.w > 0 && a.h > 0);

// ---------- ۲) هر نمونه قاب دارد ----------
const badFrames = meta.instances.filter((it) => !meta.frames[it.f]).length;
check('همه‌ی نمونه‌ها قابِ معتبر دارند', badFrames === 0);
const types = new Set(meta.instances.map((i) => i.t));
check(`نمونه‌ها ${types.size} نوعِ متفاوت دارند`, types.size > 60);
const dynamicTypes = ['car:sedan', 'ped:0', 'skater:0'];
for (const t of dynamicTypes) {
  const n = meta.frames.filter((f, i) => (meta.typeNames[meta.types[i]] === t)).length;
  check(`نوعِ متحرکِ ${t} در همه‌ی چرخش‌ها پخته شده (${n} قاب)`, n >= 24);
}

// ---------- ۳) اجرای واقعیِ شهر ----------
const canvas = document.createElement('canvas');
Object.defineProperty(canvas, 'clientWidth', { value: 1200 });
Object.defineProperty(canvas, 'clientHeight', { value: 700 });
canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1200, height: 700 });
const world = new World(canvas);
const city = new City(world, null);
await city.init();
check(`شهر بالا آمد (${world.staticItems.length} نمونه‌ی ثابت، ${city.cars.length} ماشین، ${city.peds.length} آدمک)`,
  world.staticItems.length > 900 && city.cars.length >= 24 && city.peds.length >= 40);
check(`اسکیت‌سوارها روی زمینِ اسکیت‌اند (${city.skaters.length})`, city.skaters.length === 4);
check(`برچسب ۷ ساختمان اصلی روی نقشه ساخته شد (${city.labels.length})`, city.labels.length === 7);
for (let i = 0; i < 30; i++) { city.update(1 / 60); world.update(1 / 60); }
await new Promise((r) => setTimeout(r, 50));   // تصویرِ ساختمان‌های اصلی (استاب)
const liveFrames = world.dynamic.filter((a) => a.frameIndex >= 0).length;
check(`بازیگرانِ متحرک قاب گرفتند (${liveFrames}/${world.dynamic.length})`, liveFrames === world.dynamic.length);
check('نقشه با انگشت/ماوس جابه‌جا می‌شود', typeof world.panBy === 'function');
{
  const before = world.view.screen(0, 0, 0);
  world.panBy(40, 20);
  world.view.set(world.panTarget, world.zoom);
  world.view.update();
  const after = world.view.screen(0, 0, 0);
  check('کشیدنِ نقشه دقیقاً به اندازه‌ی حرکت است', Math.abs(after.x - before.x - 40) < 2 && Math.abs(after.y - before.y - 20) < 2);
  world.panTarget = { x: 0, z: 0 };
}
{
  // انتخاب با انگشت: در نقطه‌ای که ساختمانِ تالار دیده می‌شود باید همان را بدهد
  world.zoomTo(0.9);
  world.view.set(world.panTarget, world.zoom);
  world.view.update();
  const hall = world.sprites.find((s) => s.tag === 'building:hall');
  const box = world._screenBox(hall, world.view.screen(hall.pos.x, hall.pos.y, hall.pos.z));
  const dpr = world.view.dpr;
  const hit = world.pick((box.x0 + box.w / 2) / dpr, (box.y1 - box.h / 2) / dpr);
  check(`ضربه روی ساختمانِ تالار همان را انتخاب می‌کند (${hit && (hit.tag || hit.type)})`, !!hit && hit.tag === 'building:hall');
  const ground = world.pickGround(600, 380);
  check('زمین زیر انگشت حساب می‌شود', !!ground && Number.isFinite(ground.x) && Number.isFinite(ground.z));
}

// ---------- ۴) هیچ WebGL‌ای لازم نیست ----------
const glCalls = [];
window.HTMLCanvasElement.prototype.getContext = function (type) { glCalls.push(type); return type === '2d' ? make2D() : null; };
for (let i = 0; i < 5; i++) { city.update(1 / 60); world.update(1 / 60); }
check('هیچ درخواستِ WebGL‌ای در زمانِ اجرا نیست', !glCalls.some((t) => t && t !== '2d'));

console.log(failed ? `\n${failed} بررسی رد شد ✗` : '\nهمه‌ی بررسی‌های شهرِ دو‌بعدی پاس شدند ✓');
process.exit(failed ? 1 : 0);
