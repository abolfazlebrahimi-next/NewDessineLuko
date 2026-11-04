// رندرِ واقعیِ World با canvasِ نودی (همان کدی که مرورگر اجرا می‌کند)
//   node scripts/preview-world.mjs   → /tmp/world.png
import { JSDOM } from 'jsdom';
import { createCanvas, Image } from '@napi-rs/canvas';
import { readFileSync } from 'node:fs';
import sharp from 'sharp';

const W = +(process.env.PW || 1280), H = +(process.env.PH || 760);
const ZOOM = +(process.env.ZOOM || 0.75);
const PANX = +(process.env.PANX || 0), PANZ = +(process.env.PANZ || 0);
const OUT = process.env.OUT || '/tmp/world.png';

const dom = new JSDOM('<!DOCTYPE html><html><body><div id="labels"></div></body></html>', { url: 'http://localhost:5173/', pretendToBeVisual: true });
const { window } = dom;
const main = createCanvas(W, H);
window.document.createElement = ((orig) => (tag) => {
  if (tag === 'canvas') { const c = createCanvas(16, 16); return c; }
  return orig.call(window.document, tag);
})(window.document.createElement);
window.HTMLCanvasElement.prototype.getContext = function (t) {
  if (t !== '2d') return null;
  if (!this._napi) this._napi = this.getContext ? null : null;
  return null;
};
// از خودِ napi استفاده می‌کنیم: getContext واقعی
const gcanvasProto = Object.getPrototypeOf(main);
window.HTMLCanvasElement.prototype.getContext = function (t) { return gcanvasProto.getContext.call(this, t); };

global.window = window; global.document = window.document;
global.HTMLElement = window.HTMLElement; global.HTMLCanvasElement = window.HTMLCanvasElement;
global.MutationObserver = window.MutationObserver; global.ProgressEvent = window.ProgressEvent;
global.self = globalThis;
Object.defineProperty(global, 'navigator', { value: window.navigator, configurable: true });
global.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 16);
window.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {} });
// napi Image فقط مسیرِ فایل را می‌شناسد؛ آدرس‌های http را به فایل نگاشت می‌کنیم
class FileImage extends Image {
  set src(v) {
    let p = String(v).replace(/\?.*$/, '').replace(/^https?:\/\/[^/]+\//, '');
    super.src = 'public/' + p;
  }
  get src() { return super.src; }
}
global.Image = FileImage; window.Image = FileImage;
global.createImageBitmap = undefined;
const f = async (url) => {
  const u = new URL(String(url));
  const p = 'public/' + u.pathname.replace(/^\/+/, '');
  const buf = readFileSync(p);
  return { ok: true, status: 200, json: async () => JSON.parse(buf.toString()), arrayBuffer: async () => buf };
};
global.fetch = f; window.fetch = f;

const { World } = await import('../src/world.js');
const { City } = await import('../src/city.js');
const canvas = main;
Object.defineProperty(canvas, 'clientWidth', { value: W });
Object.defineProperty(canvas, 'clientHeight', { value: H });
Object.defineProperty(canvas, 'width', { value: W, writable: true });
Object.defineProperty(canvas, 'height', { value: H, writable: true });
canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: W, height: H });
const world = new World(canvas);
const city = new City(world, null);
await city.init();
await new Promise((r) => setTimeout(r, 600));   // تصویر ساختمان‌های اصلی
world.zoomTo(ZOOM);
world.panTarget = { x: PANX, z: PANZ };
for (let i = 0; i < 30; i++) { city.update(1/60); world.update(1/60); }
await sharp(canvas.toBuffer('image/png')).toFile(OUT);
console.log('✓', OUT, 'statics', world.staticItems.length, 'sprites', world.sprites.length, 'dyn', world.dynamic.length);
process.exit(0);
