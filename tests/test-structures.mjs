// تست عملکردی سازه‌های ساخت‌وساز: خانه‌ها/کلبه/حصار باید از مدل‌های پکیج
// Kenney City Kit Suburban 2.0 (پوشه‌ی nn) ساخته شوند — نه جایگزین‌های مکعبیِ کد.
// محیط مثل verify-models با نقشه‌ی دارایی بوت می‌شود تا مطمئن شویم مسیر
// لود مدل‌ها (assetUrl) در بیلد تک‌فایل هم کار می‌کند.
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

// نقشه‌ی دارایی مثل بیلد تک‌فایل — همه‌ی مدل‌های ساخت‌وساز
function walk(dir, out = []) {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}
const map = {};
for (const f of walk('public/models/build')) {
  const rel = relative('public', f).split('\\').join('/');
  const mime = f.endsWith('.glb') ? 'model/gltf-binary' : f.endsWith('.png') ? 'image/png' : null;
  if (mime) map[rel] = `data:${mime};base64,${readFileSync(f).toString('base64')}`;
}
globalThis.__ASSET_MAP__ = map;

const THREE = await import('three');
const { Constructions } = await import('../src/constructions.js');
const { STRUCTURES } = await import('../src/config.js');
const { state, addStructure } = await import('../src/state.js');

let failed = 0;
const check = (n, c) => { console.log(c ? '✓ ' + n : '✗ ' + n); if (!c) failed++; };

const fakeWorld = {
  scene: new THREE.Scene(),
  addSprite: () => ({ material: {}, userData: {}, position: { set() {} }, scale: { y: 3 } }),
  getSprite: () => null,
  removeSprite: () => {},
  explode: () => {},
};

// ۱۴ خانه + ۳ کلبه + ۴ حصار بچین (آیدی‌های مختلف تا پخش مدل‌ها هم تست شود)
state.structures = [];
const mk = (id, kind, gx, gz) => addStructure({ id, kind, area: 'farm', gx, gz, rot: 0 });
for (let i = 0; i < 14; i++) mk('st_h' + i, 'house', -6 + (i % 7) * 3, -6 + Math.floor(i / 7) * 4);
for (let i = 0; i < 3; i++) mk('st_t' + i, 'tent', -6 + i * 3, 4);
for (let i = 0; i < 4; i++) mk('st_f' + i, 'fence', -6 + i, 7);

const cons = new Constructions(fakeWorld, null);
await cons.init();
cons.spawnAll(); // مثل بازی: ساخت ویژوال هر سازه (اسپریت + مدل)

check('مدل‌های پکیج از نقشه‌ی دارایی لود شدند (fallback نه)', cons.modelsReady && !cons.modelsFailed);
check('هر ۷ مدل خانه در حافظه است', (cons.templates.house || []).length === STRUCTURES.kinds.house.model.length);

// همه‌ی سازه‌ها باید مشِ بافت‌دار (مدل Kenney) داشته باشند، نه مکعب ساده
let modelled = 0, fallback = 0;
const houseSizes = new Set();
for (const st of state.structures) {
  const v = cons.visuals.get(st.id);
  if (!v || !v.group) { fallback++; continue; }
  let textured = false;
  v.group.traverse((o) => { if (o.isMesh && o.material && o.material.map) textured = true; });
  if (!textured) { fallback++; continue; }
  modelled++;
  if (st.kind === 'house') {
    const box = new THREE.Box3().setFromObject(v.group);
    const s = box.getSize(new THREE.Vector3());
    houseSizes.add(`${s.x.toFixed(1)}×${s.y.toFixed(1)}×${s.z.toFixed(1)}`);
    const cell3 = STRUCTURES.kinds.house.cells * STRUCTURES.cell;
    check(`خانه‌ی ${st.id} داخل ۳×۳ خانه شبکه می‌نشیند (${s.x.toFixed(2)}×${s.z.toFixed(2)}×${s.y.toFixed(2)})`,
      s.x <= cell3 + 0.35 && s.z <= cell3 + 0.35 && s.y <= STRUCTURES.kinds.house.targetH + 0.05);
  }
  if (st.kind === 'tent') {
    const box = new THREE.Box3().setFromObject(v.group);
    const s = box.getSize(new THREE.Vector3());
    check(`کلبه‌ی ${st.id} اندازه‌ی درست دارد (${s.x.toFixed(2)}×${s.y.toFixed(2)}×${s.z.toFixed(2)})`,
      s.y <= STRUCTURES.kinds.tent.targetH + 0.05 && Math.max(s.x, s.z) <= STRUCTURES.kinds.tent.targetW + 0.05);
  }
  if (st.kind === 'fence') {
    const box = new THREE.Box3().setFromObject(v.group);
    const s = box.getSize(new THREE.Vector3());
    check(`حصار ${st.id} یک قطعه‌ی کاملِ خانه‌ی شبکه است (${s.x.toFixed(2)}×${s.y.toFixed(2)})`,
      Math.abs(s.x - STRUCTURES.cell) < 0.25 && s.y > 0.4 && s.y < 0.8);
  }
}
check(`همه‌ی ${state.structures.length} سازه از مدل پکیج ساخته شدند (${modelled} مدل، ${fallback} جایگزین)`,
  modelled === state.structures.length && fallback === 0);
check(`خانه‌ها تنوع دارند (${houseSizes.size} اندازه‌ی متفاوت از ${state.structures.filter(s => s.kind === 'house').length} خانه)`,
  houseSizes.size >= 3);

// چرخش خانه با کلیک
const h0 = state.structures[0];
const g0 = cons.visuals.get(h0.id).group;
cons.interact(h0);
check('کلیک روی خانه می‌چرخاندش (مدل‌های پکیج قابل چرخش‌اند)', Math.abs(g0.rotation.y - Math.PI / 2) < 1e-6);

console.log(failed ? `✗ ${failed} مورد رد شد` : '✓ سازه‌های ساخت‌وساز از پکیج nn ساخته می‌شوند');
process.exit(failed ? 1 : 0);
