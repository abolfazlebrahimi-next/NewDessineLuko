// ================= مدیر بارگذاری مشترک =================
// در حالت عادی فایل‌ها از public خوانده می‌شوند؛ در بیلد تک‌فایل (Luko-Game.html)
// همه‌ی مدل‌ها و بافت‌ها داخل خود HTML هستند و این مدیر آدرس‌ها را به آن‌ها وصل می‌کند.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

function resolveFromMap(url) {
  const map = globalThis.__ASSET_MAP__;
  if (!map || typeof url !== 'string' || url.startsWith('data:') || url.startsWith('blob:')) return url;
  const clean = url.replace(/^\.?\//, '').split('?')[0];
  if (map[clean]) return map[clean];
  // مسیر نسبی بافت‌های داخل GLB (مثل Textures/colormap.png)
  for (const key of Object.keys(map)) {
    if (key.endsWith('/' + clean)) return map[key];
  }
  // آخرین راه: تطبیق با نام فایل (colormap در هر دو پوشه یکی است)
  const base = clean.split('/').pop();
  for (const key of Object.keys(map)) {
    if (key.endsWith('/' + base)) return map[key];
  }
  return url;
}

export const sharedManager = new THREE.LoadingManager();
sharedManager.setURLModifier(resolveFromMap);

// درصد پیشرفت بارگذاری روی صفحه‌ی لودینگ — برای شبکه‌های کند
sharedManager.onProgress = (url, loaded, total) => {
  if (typeof document === 'undefined' || (globalThis && globalThis.__bootError)) return;
  const el = document.querySelector('#loading .loading-inner div');
  if (!el || !total) return;
  const pct = Math.min(99, Math.round((loaded / total) * 100));
  el.textContent = 'در حال ساخت شهر لوکو… ' + pct + '٪';
};

// لودر GLB با پشتیبانی از مدل‌های فشرده (Meshopt) — همه‌ی مدل‌های public/models
// با scripts/optimize-models.mjs فشرده شده‌اند تا شهر چند برابر سریع‌تر لود شود.
export function makeGLTFLoader() {
  const loader = new GLTFLoader(sharedManager);
  try { loader.setMeshoptDecoder(MeshoptDecoder); } catch (e) { /* مدل‌های معمولی هم لود می‌شوند */ }
  return loader;
}
