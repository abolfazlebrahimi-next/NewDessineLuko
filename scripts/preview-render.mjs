// پیش‌نمایش نرم‌افزاری شهر بدون مرورگر (برای بررسی چیدمان در محیط توسعه):
//   node scripts/preview-render.mjs            → /tmp/preview.png
//   OUT=city.png ZOOM=1.1 PANX=-30 PANZ=-6 node scripts/preview-render.mjs
// رندر ساده‌ی CPU است (بدون WebGL): مدل‌های Kenney با colormap، اسپریت‌های ساختمان‌های اصلی، زمین تقریبی.
import { JSDOM } from 'jsdom';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import sharp from 'sharp';

const W = parseInt(process.env.PW || '1600', 10), H = parseInt(process.env.PH || '900', 10);
const ZOOM = parseFloat(process.env.ZOOM || '0.5');
const PAN = { x: parseFloat(process.env.PANX || '0'), z: parseFloat(process.env.PANZ || '1.5') };
const OUT = process.env.OUT || '/tmp/preview.png';

const dom = new JSDOM('<!DOCTYPE html><html><body><div id="labels"></div></body></html>', { url: 'http://localhost/', pretendToBeVisual: true });
const { window } = dom;
global.window = window; global.document = window.document; global.HTMLElement = window.HTMLElement;
global.HTMLCanvasElement = window.HTMLCanvasElement; global.MutationObserver = window.MutationObserver;
global.ProgressEvent = window.ProgressEvent; global.self = globalThis;
global.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 16);
function make2D() {
  const gradient = { addColorStop() {} };
  return new Proxy({}, { get(t, prop) {
    if (prop === 'createRadialGradient' || prop === 'createLinearGradient') return () => gradient;
    if (prop === 'measureText') return () => ({ width: 10 });
    if (prop === 'canvas') return { width: 128, height: 128 };
    if (typeof prop === 'string') return () => undefined;
    return undefined;
  }, set() { return true; } });
}
window.HTMLCanvasElement.prototype.getContext = function (type) { return type === '2d' ? make2D() : null; };
Object.defineProperty(window.HTMLImageElement.prototype, 'src', {
  configurable: true,
  set(v) { this._src = v; setTimeout(() => { try {
    Object.defineProperty(this, 'width', { value: 256, configurable: true });
    Object.defineProperty(this, 'height', { value: 256, configurable: true });
  } catch (e) {} this.dispatchEvent(new window.Event('load')); }, 0); },
  get() { return this._src || ''; },
});
function walk(dir, out = []) { for (const n of readdirSync(dir)) { const p = join(dir, n); if (statSync(p).isDirectory()) walk(p, out); else out.push(p); } return out; }
const map = {};
for (const f of walk('public/models')) {
  const rel = relative('public', f).split('\\').join('/');
  const mime = f.endsWith('.glb') ? 'model/gltf-binary' : f.endsWith('.png') ? 'image/png' : null;
  if (mime) map[rel] = `data:${mime};base64,${readFileSync(f).toString('base64')}`;
}
globalThis.__ASSET_MAP__ = map;

const THREE = await import('three');
const { City } = await import('../src/city.js');
const { CITY } = await import('../src/config.js');

// colormap هر پکیج
const colormaps = {};
async function colormapFor(dir) {
  if (colormaps[dir] !== undefined) return colormaps[dir];
  const p = join('public', dir, 'Textures/colormap.png');
  if (!existsSync(p)) { colormaps[dir] = null; return null; }
  const { data, info } = await sharp(p).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  colormaps[dir] = { data, w: info.width, h: info.height };
  return colormaps[dir];
}

const sprites = [];
const fakeWorld = {
  scene: new THREE.Scene(), clickables: [], shadowTex: new THREE.Texture(), pitchSin: 13.5 / Math.hypot(13.5, 11.8),
  addSprite: (o) => { const sp = { scale: { y: 3 }, userData: {} }; sprites.push({ ...o, sp }); return sp; },
  worldToScreen: () => ({ x: 10, y: 10 }), texture: () => new THREE.Texture(),
  loadTexture: async () => new THREE.Texture(),
};
const city = new City(fakeWorld, null);
const origLoad = city._loadGLB.bind(city);
city._loadGLB = async (path) => {
  const scene = await origLoad(path);
  const dir = path.startsWith('data:') ? 'models/cars' : dirname(path);
  scene.traverse((o) => { if (o.isMesh) { const ms = Array.isArray(o.material) ? o.material : [o.material]; for (const m of ms) m.userData.kit = dir; } });
  return scene;
};
// آدرس واقعی را نگه می‌داریم: assetUrl به data: تبدیل می‌کند، پس قبلش در _model/_buildCars مسیر را بگیریم
const origModel = city._model.bind(city);
city._model = async (path) => { const m = await origModel(path); if (m) m.scene.traverse((o) => { if (o.isMesh) { const ms = Array.isArray(o.material) ? o.material : [o.material]; for (const mm of ms) mm.userData.kit = dirname(path); } }); return m; };
globalThis.__CAR_DIR__ = CITY.carBase;
await city.init();
city.update(0.016);

// ---------- دوربین ----------
const VIEW_HEIGHT = 18.5;
const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 200);
const hh = VIEW_HEIGHT / 2 / ZOOM, hw = hh * W / H;
cam.left = -hw; cam.right = hw; cam.top = hh; cam.bottom = -hh; cam.updateProjectionMatrix();
cam.position.set(PAN.x, 13.5, 11.8 + PAN.z); cam.lookAt(new THREE.Vector3(PAN.x, 0, PAN.z)); cam.updateMatrixWorld(true);
const VP = new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);

// ---------- بافر ----------
const color = new Float32Array(W * H * 3).fill(0);
const zbuf = new Float32Array(W * H).fill(Infinity);
// پس‌زمینه چمن
for (let i = 0; i < W * H; i++) { color[i * 3] = 0x7e / 255; color[i * 3 + 1] = 0xc8 / 255; color[i * 3 + 2] = 0x50 / 255; }
const light = new THREE.Vector3(6, 14, 7).normalize();

function project(v, out) { out.copy(v).applyMatrix4(VP); return out; }
const pa = new THREE.Vector3(), pb = new THREE.Vector3(), pc = new THREE.Vector3();
const va = new THREE.Vector3(), vb = new THREE.Vector3(), vc = new THREE.Vector3();
const n = new THREE.Vector3(), e1 = new THREE.Vector3(), e2 = new THREE.Vector3();
let triCount = 0;

// رسم یک مثلث با رنگ ثابت (یا بافت) — shade: ضریب نور
function rasterTri(ax, ay, az, bx, by, bz, cx, cy, cz, colFn, alpha = 1) {
  const minX = Math.max(0, Math.floor(Math.min(ax, bx, cx))), maxX = Math.min(W - 1, Math.ceil(Math.max(ax, bx, cx)));
  const minY = Math.max(0, Math.floor(Math.min(ay, by, cy))), maxY = Math.min(H - 1, Math.ceil(Math.max(ay, by, cy)));
  if (minX > maxX || minY > maxY) return;
  const area = (bx - ax) * (cy - ay) - (cx - ax) * (by - ay);
  if (Math.abs(area) < 1e-9) return;
  const inv = 1 / area;
  for (let y = minY; y <= maxY; y++) {
    const py = y + 0.5;
    for (let x = minX; x <= maxX; x++) {
      const px = x + 0.5;
      let w0 = ((bx - px) * (cy - py) - (cx - px) * (by - py)) * inv;
      let w1 = ((cx - px) * (ay - py) - (ax - px) * (cy - py)) * inv;
      let w2 = 1 - w0 - w1;
      if (w0 < -1e-6 || w1 < -1e-6 || w2 < -1e-6) continue;
      const z = w0 * az + w1 * bz + w2 * cz;
      const idx = y * W + x;
      if (z >= zbuf[idx]) continue;
      const c = colFn(w0, w1, w2);
      if (!c) continue;
      const a = c[3] === undefined ? alpha : c[3] * alpha;
      if (a >= 0.999) { zbuf[idx] = z; color[idx * 3] = c[0]; color[idx * 3 + 1] = c[1]; color[idx * 3 + 2] = c[2]; }
      else if (a > 0.01) { color[idx * 3] += (c[0] - color[idx * 3]) * a; color[idx * 3 + 1] += (c[1] - color[idx * 3 + 1]) * a; color[idx * 3 + 2] += (c[2] - color[idx * 3 + 2]) * a; }
    }
  }
}

const toScreen = (v) => { v.x = (v.x * 0.5 + 0.5) * W; v.y = (-v.y * 0.5 + 0.5) * H; };

async function drawMesh(geo, mat, matrixWorld, instColor) {
  const pos = geo.getAttribute('position'); if (!pos) return;
  const uv = geo.getAttribute('uv');
  const index = geo.getIndex();
  const count = index ? index.count : pos.count;
  const isShadow = mat && mat.map === fakeWorld.shadowTex;
  if (mat && mat.map && mat.map.isCanvasTexture) return; // زمین نقاشی‌شده (با quadهای خودمان جایگزین شده)
  const cm = mat && mat.map && !isShadow ? await colormapFor((mat.userData && mat.userData.kit) || 'models/cars') : null;
  const base = mat && mat.color ? [mat.color.r, mat.color.g, mat.color.b] : [1, 1, 1];
  if (instColor) { base[0] *= instColor.r; base[1] *= instColor.g; base[2] *= instColor.b; }
  const unlit = mat && (mat.isMeshBasicMaterial || isShadow);
  const nm = new THREE.Matrix3().getNormalMatrix(matrixWorld);
  for (let i = 0; i < count; i += 3) {
    const ia = index ? index.getX(i) : i, ib = index ? index.getX(i + 1) : i + 1, ic = index ? index.getX(i + 2) : i + 2;
    va.fromBufferAttribute(pos, ia).applyMatrix4(matrixWorld);
    vb.fromBufferAttribute(pos, ib).applyMatrix4(matrixWorld);
    vc.fromBufferAttribute(pos, ic).applyMatrix4(matrixWorld);
    e1.subVectors(vb, va); e2.subVectors(vc, va); n.crossVectors(e1, e2).normalize();
    let shade = 1;
    if (!unlit) shade = 0.55 + 0.5 * Math.max(0, n.dot(light)) + 0.1 * Math.max(0, n.y);
    project(va, pa); project(vb, pb); project(vc, pc);
    toScreen(pa); toScreen(pb); toScreen(pc);
    triCount++;
    let ua, ub, uc;
    if ((cm || isShadow) && uv) { ua = [uv.getX(ia), uv.getY(ia)]; ub = [uv.getX(ib), uv.getY(ib)]; uc = [uv.getX(ic), uv.getY(ic)]; }
    rasterTri(pa.x, pa.y, pa.z, pb.x, pb.y, pb.z, pc.x, pc.y, pc.z, (w0, w1, w2) => {
      if (isShadow) {
        if (!uv) return [0.08, 0.2, 0.06, 0.3];
        const u = w0 * ua[0] + w1 * ub[0] + w2 * uc[0] - 0.5, v = w0 * ua[1] + w1 * ub[1] + w2 * uc[1] - 0.5;
        const d = Math.hypot(u, v) * 2;
        return [0.08, 0.2, 0.06, d > 1 ? 0 : 0.38 * (1 - d * d)];
      }
      if (cm && ua) {
        const u = w0 * ua[0] + w1 * ub[0] + w2 * uc[0], v = w0 * ua[1] + w1 * ub[1] + w2 * uc[1];
        const tx = Math.min(cm.w - 1, Math.max(0, Math.floor(u * cm.w))), ty = Math.min(cm.h - 1, Math.max(0, Math.floor(v * cm.h)));
        const k = (ty * cm.w + tx) * 4;
        return [cm.data[k] / 255 * base[0] * shade, cm.data[k + 1] / 255 * base[1] * shade, cm.data[k + 2] / 255 * base[2] * shade];
      }
      return [base[0] * shade, base[1] * shade, base[2] * shade];
    });
  }
}

// زمین شهر (تقریبی: بلوک‌ها و خیابان‌ها رنگی)
function groundQuads() {
  const { P, B, R } = city; const range = CITY.range;
  const E = (range * 2 + 1) * P + R;
  const quads = [];
  quads.push({ x0: -E / 2, z0: -E / 2, x1: E / 2, z1: E / 2, c: [0.32, 0.34, 0.38], y: 0.01 });
  for (let c = -range; c <= range; c++) for (let r = -range; r <= range; r++) {
    const kind = city.blockKind(c, r);
    const col = kind === 'lawn' ? [0.37, 0.62, 0.27] : kind === 'suburb' ? [0.45, 0.69, 0.32] : kind === 'core' ? [0.87, 0.84, 0.77] : [0.8, 0.82, 0.85];
    quads.push({ x0: c * P - B / 2, z0: r * P - B / 2, x1: c * P + B / 2, z1: r * P + B / 2, c: col, y: 0.02 });
    if (kind === 'suburb') quads.push({ x0: c * P - B / 2, z0: r * P - B / 2, x1: c * P + B / 2, z1: r * P + B / 2, c: [0.79, 0.8, 0.82], y: 0.015, ring: 0.7 });
  }
  return quads;
}
city.group.updateMatrixWorld(true);
const gm = city.group.matrixWorld;
for (const q of groundQuads()) {
  const quad = (x0, z0, x1, z1, y, c) => {
    const p = [[x0, y, z0], [x1, y, z0], [x1, y, z1], [x0, y, z1]].map(([x, yy, z]) => { const v = new THREE.Vector3(x, yy, z).applyMatrix4(gm); project(v, v); toScreen(v); return v; });
    rasterTri(p[0].x, p[0].y, p[0].z, p[1].x, p[1].y, p[1].z, p[2].x, p[2].y, p[2].z, () => c);
    rasterTri(p[0].x, p[0].y, p[0].z, p[2].x, p[2].y, p[2].z, p[3].x, p[3].y, p[3].z, () => c);
  };
  if (q.ring) { // پیاده‌روی دور بلوک مسکونی: بیرون خاکستری، داخل چمن
    quad(q.x0, q.z0, q.x1, q.z1, q.y + 0.001, q.c);
    quad(q.x0 + q.ring, q.z0 + q.ring, q.x1 - q.ring, q.z1 - q.ring, q.y + 0.002, [0.45, 0.69, 0.32]);
  } else quad(q.x0, q.z0, q.x1, q.z1, q.y, q.c);
}

// همه‌ی مش‌ها
fakeWorld.scene.updateMatrixWorld(true);
const meshes = [];
fakeWorld.scene.traverse((o) => { if (o.isMesh) meshes.push(o); });
const im = new THREE.Matrix4(), mw = new THREE.Matrix4(), ic = new THREE.Color();
for (const o of meshes) {
  const mats = Array.isArray(o.material) ? o.material : [o.material];
  const mat = mats[0];
  if (o.isInstancedMesh) {
    for (let i = 0; i < o.count; i++) {
      o.getMatrixAt(i, im); mw.multiplyMatrices(o.matrixWorld, im);
      let col = null; if (o.instanceColor) { o.getColorAt(i, ic); col = ic; }
      await drawMesh(o.geometry, mat, mw, col);
    }
  } else await drawMesh(o.geometry, mat, o.matrixWorld, null);
}

// اسپریت‌ها
const pxPerUnit = H / (VIEW_HEIGHT / ZOOM);
for (const s of sprites) {
  const file = 'public/assets/' + s.file;
  if (!existsSync(file)) continue;
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const wpx = s.width * pxPerUnit, hpx = wpx * info.height / info.width;
  const anchor = new THREE.Vector3(s.x, s.y || 0, s.z); project(anchor, anchor); toScreen(anchor);
  const depth = anchor.z;
  const x0 = Math.round(anchor.x - wpx / 2), y1 = Math.round(anchor.y), y0 = Math.round(y1 - hpx);
  for (let y = Math.max(0, y0); y < Math.min(H, y1); y++) for (let x = Math.max(0, x0); x < Math.min(W, x0 + wpx); x++) {
    const sx = Math.floor((x - x0) / wpx * info.width), sy = Math.floor((y - y0) / hpx * info.height);
    const k = (sy * info.width + sx) * 4; const a = data[k + 3] / 255; if (a < 0.05) continue;
    const idx = y * W + x; if (depth >= zbuf[idx]) continue;
    color[idx * 3] += (data[k] / 255 - color[idx * 3]) * a; color[idx * 3 + 1] += (data[k + 1] / 255 - color[idx * 3 + 1]) * a; color[idx * 3 + 2] += (data[k + 2] / 255 - color[idx * 3 + 2]) * a;
    if (a > 0.5) zbuf[idx] = depth;
  }
}

const out = Buffer.alloc(W * H * 3);
for (let i = 0; i < W * H * 3; i++) out[i] = Math.max(0, Math.min(255, Math.round(color[i] * 255)));
await sharp(out, { raw: { width: W, height: H, channels: 3 } }).png().toFile(OUT);
console.log('✓', OUT, 'triangles', triCount, 'meshes', meshes.length, 'sprites', sprites.length);
process.exit(0);
