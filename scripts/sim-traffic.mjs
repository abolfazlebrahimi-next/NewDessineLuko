// شبیه‌سازی بلند مدت: چند دقیقه‌ی مجازی از update شهر — رویدادها (تصادف/پارک/
// خروج از شهر/عابر) باید اجرا و کامل شوند بدون خطا و بدون NaN.
import { JSDOM } from 'jsdom';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

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
global.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 16);
global.cancelAnimationFrame = (id) => clearTimeout(id);

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
window.HTMLCanvasElement.prototype.getContext = function (type) {
  return type === '2d' ? make2D() : null;
};
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

function walk(dir, out = []) {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}
const map = {};
for (const dir of ['public/models/city', 'public/models/cars', 'public/models/suburban', 'public/models/commercial', 'public/models/nature', 'public/models/build']) {
  for (const f of walk(dir)) {
    const rel = relative('public', f).split('\\').join('/');
    const mime = f.endsWith('.glb') ? 'model/gltf-binary' : f.endsWith('.png') ? 'image/png' : null;
    if (mime) map[rel] = `data:${mime};base64,${readFileSync(f).toString('base64')}`;
  }
}
globalThis.__ASSET_MAP__ = map;

const THREE = await import('three');
const { City } = await import('../src/city.js');

const fakeWorld = {
  scene: new THREE.Scene(),
  clickables: [],
  shadowTex: new THREE.Texture(),
  addSprite: () => ({ scale: { y: 3 }, userData: {} }),
  loadTexture: async () => new THREE.Texture(),
  pitchSin: 0.75,
  worldToScreen: () => ({ x: 10, y: 10 }),
  texture: () => new THREE.Texture(),
};

const toasts = [];
const fakeUi = { toast: (m) => toasts.push(m) };
const city = new City(fakeWorld, fakeUi);
await city.init();

// ---------- شبیه‌سازی ----------
const DT = 1 / 30;
const SECONDS = process.env.SIM_SECONDS ? parseInt(process.env.SIM_SECONDS) : 600; // ۱۰ دقیقه‌ی مجازی
const seen = {
  exiting: 0, reentered: 0, accidents: 0, accidentsDone: 0,
  parks: 0, parksDone: 0,
  crossPhases: new Set(),
  carStates: new Set(),
};
let frames = SECONDS / DT;
let t = 0;
for (let i = 0; i < frames; i++) {
  t += DT;
  city.update(DT);
  const ocBefore = city._outsideCount;
  for (const c of city.cars) {
    seen.carStates.add(c.state);
    if (city._outsideCount > ocBefore) seen.exiting++;
    if (!Number.isFinite(c.x) || !Number.isFinite(c.z) || !Number.isFinite(c.obj.position.x)) {
      console.error(`NaN car position! state=${c.state} name=${c.name}`); process.exit(1);
    }
    // ماشین باید روی جاده باشد (به‌جز حالت‌های خاص)
    if (c.state === 'straight' || c.state === 'exiting' || c.state === 'dispatch') {
      const lx = city._nearestLine(Math.abs(c.hz) > 0.5 ? c.x : c.z);
      const lat = Math.abs((Math.abs(c.hz) > 0.5 ? c.x : c.z) - lx);
      if (lat > 1.9) {
        console.error(`ماشین از جاده خارج شد! ${c.name} state=${c.state} lat=${lat.toFixed(2)}`); process.exit(1);
      }
    } else if (c.state === 'turning' && c._turnC) {
      // در حال پیچیدن: باید داخل محدوده‌ی تقاطع باشد
      const d = Math.hypot(c.x - c._turnC.x, c.z - c._turnC.z);
      if (d > 8) {
        console.error(`پیچ از تقاطع خارج شد! ${c.name} d=${d.toFixed(2)}`); process.exit(1);
      }
    }
  }
  // دیتیکتور بن‌بست: ماشین سالم که مدت زیادی سرعتش صفر است
  for (const c of city.cars) {
    if (!c._still) c._still = { t: 0, x: c.obj.position.x, z: c.obj.position.z };
    const moved = Math.hypot(c.obj.position.x - c._still.x, c.obj.position.z - c._still.z) > 0.05;
    if (moved) { c._still = { t: 0, x: c.obj.position.x, z: c.obj.position.z }; }
    else c._still.t += DT;
    const legit = c.state === 'crashed' || c.state === 'parked' || c.state === 'toPark' ||
      (city.accident && c._still.t < 55);
    if (!legit && c._still.t > 45) {
      console.error(`بن‌بست! ${c.name} state=${c.state} به مدت ${c._still.t.toFixed(0)}s ثابت است`);
      console.error(`  pos=(${c.x.toFixed(1)},${c.z.toFixed(1)}) h=(${c.hx},${c.hz}) cur=${c.cur.toFixed(2)} target=${(c._target ?? -1).toFixed(2)} speed=${c.speed.toFixed(2)}`);
      if (c.nextC) {
        const dc = (c.nextC.x - c.x) * c.hx + (c.nextC.z - c.z) * c.hz;
        console.error(`  nextC=(${c.nextC.x.toFixed(1)},${c.nextC.z.toFixed(1)}) dc=${dc.toFixed(2)} D_IN=${city.D_IN}`);
      } else console.error('  nextC=null');
      for (const o of city.cars) {
        if (o === c) continue;
        const rx = o.x - c.x, rz = o.z - c.z;
        const fwd = rx * c.hx + rz * c.hz;
        if (fwd <= 0 || fwd > 12) continue;
        const lat = Math.abs(rx * c.hz - rz * c.hx);
        if (lat > 1.5) continue;
        console.error(`  جلو: ${o.name} state=${o.state} fwd=${fwd.toFixed(1)} lat=${lat.toFixed(2)} cur=${o.cur.toFixed(2)}`);
      }
      // وضعیت همه‌ی ماشین‌های نزدیک
      for (const o of city.cars) {
        const d = Math.hypot(o.x - c.x, o.z - c.z);
        if (d > 14 || o === c) continue;
        const tc = o._turnC ? ` turnC=(${o._turnC.x.toFixed(0)},${o._turnC.z.toFixed(0)}) t=${(o._turn ? o._turn.t : -1).toFixed(2)} still=${(o._turnStill || 0).toFixed(1)}` : '';
        const nc = o.nextC ? ` nextC=(${o.nextC.x.toFixed(0)},${o.nextC.z.toFixed(0)})` : ' nextC=null';
        console.error(`  نزدیک: ${o.name} state=${o.state} pos=(${o.x.toFixed(1)},${o.z.toFixed(1)}) cur=${o.cur.toFixed(2)}${tc}${nc}`);
      }
      if (city.parkEvent) console.error(`  parkEvent: phase=${city.parkEvent.phase} car=${city.parkEvent.car.name}`);
      if (city.accident) console.error(`  accident: phase=${city.accident.phase}`);
      process.exit(1);
    }
  }
  if (city._outsideCount < (city._ocPrev ?? 0)) seen.reentered++;
  city._ocPrev = city._outsideCount;
  if (city.accident) { if (city.accident._counted !== true) { city.accident._counted = true; seen.accidents++; } }
  else if (seen.accidents > seen.accidentsDone) seen.accidentsDone = seen.accidents;
  if (city.parkEvent) { if (!city.parkEvent._c) { city.parkEvent._c = 1; seen.parks++; } }
  else if (seen.parks > seen.parksDone) seen.parksDone = seen.parks;
  for (const cr of city.crossers) {
    seen.crossPhases.add(cr.phase);
    if (!Number.isFinite(cr.x) || !Number.isFinite(cr.z)) { console.error('NaN crosser!'); process.exit(1); }
  }
}

// بررسی نهایی
let fail = 0;
const check = (n, c) => { console.log((c ? '✓ ' : '✗ ') + n); if (!c) fail++; };
check('هیچ خطایی در ۱۰ دقیقه مجازی رخ نداد', true);
check('ماشین‌ها فاصله‌گیری می‌کنند (سرعت لحظه‌ای < پایه اتفاق می‌افتد)', city.cars.some((c) => c.cur < c.speed * 0.95));
check('خروج از شهر دیده شد', seen.carStates.has('exiting'));
check('ورود دوباره به شهر دیده شد', seen.reentered >= 1);
check('پیچیدن ماشین‌ها دیده شد (مسیر غیرتکراری)', seen.carStates.has('turning'));
// پخش‌شدگی: ماشین و آدمک فقط وسط شهر جمع نشده باشند
const farCars = city.cars.filter((c) => Math.hypot(c.x, c.z) > 30).length;
const farPeds = [...city.peds, ...city.crossers].filter((p) =>
  Math.hypot(p.g.position.x, p.g.position.z) > 25).length;
check(`ماشین‌ها پخش هستند (${farCars} تا بیرونِ شعاع ۳۰)`, farCars >= 6);
check(`آدمک‌ها پخش هستند (${farPeds} تا بیرونِ شعاع ۲۵)`, farPeds >= 8);
check('رویداد تصادف اجرا و تمام شد', seen.accidents >= 1 && seen.accidentsDone >= 1);
check('رویداد پارک اجرا و تمام شد', seen.parks >= 1 && seen.parksDone >= 1);
check('عابرها صبر/عبور کردند', seen.crossPhases.has('cross') && seen.crossPhases.size >= 2);
check('توست تصادف آمد', toasts.some((m) => m.includes('تصادف')));
check('هیچ ماشینی گم نشده (همه صحنه‌اند)', city.cars.every((c) => c.obj.parent));
const maxCur = Math.max(...city.cars.map((c) => c.cur));
check(`سرعت‌ها معقول‌اند (بیشینه ${maxCur.toFixed(2)})`, maxCur < 4.5);
console.log('states دیده‌شده:', [...seen.carStates].join(', '));
console.log('phases عابر:', [...seen.crossPhases].join(', '));
console.log(`تصادف‌ها: ${seen.accidents} (کامل‌شده ${seen.accidentsDone}) | پارک‌ها: ${seen.parks} (کامل‌شده ${seen.parksDone})`);
console.log(`بیرون شهر: ${city._outsideCount} | توست‌ها: ${toasts.length}`);
process.exit(fail ? 1 : 0);
