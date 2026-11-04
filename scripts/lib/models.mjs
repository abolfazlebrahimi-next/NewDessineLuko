// ================= خواندنِ مدل‌های Kenney برای پختِ اسپریت =================
// هر GLB یک‌بار در نود خوانده می‌شود و به «فرمول» تبدیل می‌شود:
// قطعه‌های هندسی (با colormap)، جعبه و اندازه. خودِ مدل در مرورگر لود نمی‌شود.
import { readdirSync, statSync } from 'node:fs';
import { join, basename } from 'node:path';
import * as THREE from 'three';

// پوشه‌ی مدل‌ها → پیشوندِ کلید. (پوشه‌ها هم‌نامِ «سرویس» نیستند: suburban، cars…)
const PREFIX = {
  suburban: 's:', commercial: 'c:', city: 'i:', nature: 'n:',
  skate: 'k:', cars: 'car:', roads: 'r:', build: 'b:',
};

export function loadAllModels(publicDir) {
  const loader = new GLTFLoaderProxy();
  const models = {};
  for (const [kit, prefix] of Object.entries(PREFIX)) {
    const dir = join(publicDir, 'models', kit);
    let files = [];
    try { files = readdirSync(dir).filter((f) => f.endsWith('.glb')); } catch (e) { continue; }
    for (const f of files) {
      const name = prefix + basename(f, '.glb');
      const file = join(dir, f);
      models[name] = { file, kit: `models/${kit}/`, key: name, name };
    }
  }
  return models;
}

// GLTFLoaderِ three بدونِ DOM: صحنه را می‌خواند و هندسه/متریال می‌دهد
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { readFileSync } from 'node:fs';

// در نود تصویر و ImageBitmap واقعی نیست؛ GLTFLoader فقط اندازه‌ی بافت را لازم دارد
// (رنگ هر تکسچر از colormap.png خوانده می‌شود). پس لودرِ بافت را بی‌اثر می‌کنیم تا
// parse گیر نکند و مدل بدونِ تصویر آماده شود.
const fakeImage = { width: 256, height: 256, naturalWidth: 256, naturalHeight: 256, addEventListener() {}, removeEventListener() {} };
function neutralTexture() {
  const t = new THREE.Texture();
  t.image = fakeImage;
  t.needsUpdate = false;
  return t;
}
for (const LoaderName of ['TextureLoader', 'ImageBitmapLoader']) {
  const L = THREE[LoaderName];
  if (L && L.prototype) {
    L.prototype.load = function (url, onLoad) { const t = neutralTexture(); if (onLoad) setTimeout(() => onLoad(t), 0); return t; };
    L.prototype.loadAsync = async function () { return neutralTexture(); };
  }
}

class GLTFLoaderProxy {
  constructor() {
    this.loader = new GLTFLoader();
    try { this.loader.setMeshoptDecoder(MeshoptDecoder); } catch (e) { /* ok */ }
  }

  async load(file) {
    const buf = readFileSync(file);
    const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    return new Promise((resolve, reject) => {
      this.loader.parse(ab, '', resolve, reject);
    });
  }
}

/**
 * فرمولِ یک مدل: قطعه‌های هندسی + جعبه + اندازه + رنگ‌ها.
 * قطعه‌ها با ماتریسِ محلی‌شان نگه داشته می‌شوند تا رندرِ آفلاین دقیقاً مثل three باشد.
 */
export async function modelForm(loader, file, { simplifyMs = 0 } = {}) {
  const gltf = await loader.load(file);
  const scene = gltf.scene;
  scene.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(scene);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const parts = [];
  scene.traverse((o) => {
    if (!o.isMesh) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of mats) {
      if (!m) continue;
      const color = m.color ? [m.color.r, m.color.g, m.color.b] : [1, 1, 1];
      parts.push({
        geo: o.geometry,
        mat: m,
        color,
        basic: !!m.isMeshBasicMaterial,
        side: m.side,
        m: o.matrixWorld.clone(),
      });
    }
  });
  return { scene, box, size, center, parts, animations: gltf.animations };
}

export { GLTFLoaderProxy };
