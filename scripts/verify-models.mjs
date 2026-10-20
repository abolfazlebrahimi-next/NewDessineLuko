// راستی‌آزمایی استفاده از پکیج‌های Kenney: کل شهر با نقشه‌ی داراییِ تک‌فایل بوت می‌شود
// و شمرده می‌شود چند ساختمان پرکننده، ماشین و آدمک واقعاً در صحنه قرار گرفته‌اند.
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

// استاب canvas دوبعدی (مثل تست بوت)
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

// jsdom عکس واقعی لود نمی‌کند؛ setter را طوری می‌کنیم که رویداد load بدهد
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

// نقشه‌ی دارایی مثل بیلد تک‌فایل — همه‌ی مدل‌های شهر/ماشین/درخت
function walk(dir, out = []) {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}
const map = {};
for (const dir of ['public/models/city', 'public/models/cars', 'public/models/suburban', 'public/models/nature']) {
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

let failed = 0;
const check = (n, c) => { console.log(c ? '✓ ' + n : '✗ ' + n); if (!c) failed++; };

const city = new City(fakeWorld, null);
await city.init();

let meshes = 0, instanced = 0, textured = 0;
fakeWorld.scene.traverse((o) => {
  if (o.isMesh) { meshes++; if (o.material && o.material.map) textured++; }
  if (o.isInstancedMesh) instanced++;
});
let instancedCount = 0;
fakeWorld.scene.traverse((o) => { if (o.isInstancedMesh) instancedCount += o.count; });
check(`صحنه پر است (${meshes} مش، ${instanced} اینستنس‌مش با ${instancedCount} نمونه)`, meshes > 120 && instancedCount > 400);
check(`مش‌های بافت‌دار مدل‌های Kenney در صحنه‌اند (${textured})`, textured > 40);
check(`خانه‌های محله‌ها از City Kit Suburban چیده شده‌اند (${city.suburbCount} قطعه)`, city.suburbCount >= 200);
check(`درخت‌های Survival Kit کاشته شده‌اند (${city.treeCount})`, city.treeCount >= 200);
check(`همه‌ی ماشین‌های پکیج در حال ترددند (${city.cars.length})`, city.cars.length >= 24);
check(`آدمک‌ها در شهرند (${city.peds.length})`, city.peds.length >= 40);
check('برچسب ۷ ساختمان اصلی روی نقشه ساخته شد (تابلو حذف شد)', city.labels.length === 7);
{
  city.group.updateMatrixWorld(true);
  const w = city.group.localToWorld(new THREE.Vector3(10, 0, 4));
  const mine = city._toWorld(10, 4);
  check('تبدیل مختصات شهر چرخیده درست است', Math.abs(w.x - mine.x) < 1e-6 && Math.abs(w.z - mine.z) < 1e-6);
}

// یک فریم آپدیت بدون خطا
try {
  city.update(0.016);
  city.update(0.5);
  check('آپدیت شهر (ماشین/آدمک/برچسب) بدون خطاست', true);
} catch (e) {
  check('آپدیت شهر بدون خطاست', false);
  console.log('   ', e.message);
}

console.log(failed ? `✗ ${failed} مورد رد شد` : '✓ پکیج‌های Kenney واقعاً در شهر استفاده شده‌اند');
process.exit(failed ? 1 : 0);
