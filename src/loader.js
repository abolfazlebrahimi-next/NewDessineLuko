// ================= مدیر بارگذاری مشترک =================
// در حالت عادی فایل‌ها از public خوانده می‌شوند؛ در بیلد تک‌فایل (Luko-Game.html)
// همه‌ی مدل‌ها و بافت‌ها داخل خود HTML هستند و این مدیر آدرس‌ها را به آن‌ها وصل می‌کند.
import * as THREE from 'three';

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
