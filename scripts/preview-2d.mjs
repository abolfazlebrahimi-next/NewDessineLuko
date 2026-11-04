// پیش‌نمایشِ رندرِ دو‌بعدی (همان کاری که بازی در مرورگر می‌کند) بدونِ مرورگر:
//   node scripts/preview-2d.mjs            → /tmp/city2d.png
//   PW=1600 PH=900 ZOOM=0.8 PANX=0 PANZ=0 OUT=...
import { readFileSync } from 'node:fs';
import { createCanvas, ImageData } from '@napi-rs/canvas';
import sharp from 'sharp';
import { project, VIEW_HEIGHT } from '../src/cam.js';

const W = +(process.env.PW || 1400), H = +(process.env.PH || 800);
const ZOOM = +(process.env.ZOOM || 0.75);
const PANX = +(process.env.PANX || 0), PANZ = +(process.env.PANZ || 0);
const OUT = process.env.OUT || '/tmp/city2d.png';

const dir = 'public/assets/city-2d/';
const units = JSON.parse(readFileSync(dir + 'units.json', 'utf8'));
const names = Object.keys(units.atlases).sort();
const atlasImgs = [];
for (const n of names) {
  const { data, info } = await sharp(dir + units.atlases[n].file.split('/').pop()).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  atlasImgs.push({ data, w: info.width, h: info.height });
}
const gnd = await sharp(dir + 'ground.webp').ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const gndCanvas = (() => { const c = createCanvas(gnd.info.width, gnd.info.height); c.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(gnd.data), gnd.info.width, gnd.info.height), 0, 0); return c; })();

const canvas = createCanvas(W, H);
const ctx = canvas.getContext('2d');
const scale = Math.min(H, 1200) / (VIEW_HEIGHT / ZOOM);
const p0 = project(PANX, 0, PANZ);
const wx = W / 2 - p0.sx * scale, wy = H / 2 - p0.sy * scale;

// چمن
ctx.fillStyle = '#7ec850';
ctx.fillRect(0, 0, W, H);

// زمین: تصویر را روی بومِ کمکی می‌کشیم چون drawImage از raw لازم است
// زمین
{
  const g = units.ground;
  // x0/y0 در «واحدِ دید» هستند، پس مستقیم به پیکسل تبدیل می‌شوند
  ctx.drawImage(gndCanvas, g.x0 * scale + wx, g.y0 * scale + wy, g.w * scale, g.h * scale);
}
// قاب‌ها
const frameImg = (f) => atlasImgs[f[0]];
const tiles = new Map();
function tileFor(f) {
  const key = f[0] + ':' + f[1] + ',' + f[2] + ',' + f[3] + ',' + f[4];
  let t = tiles.get(key);
  if (t) return t;
  const src = frameImg(f);
  const c = createCanvas(f[3], f[4]);
  const cd = c.getContext('2d');
  const buf = new Uint8ClampedArray(f[3] * f[4] * 4);
  for (let y = 0; y < f[4]; y++) {
    const so = ((f[2] + y) * src.w + f[1]) * 4;
    buf.set(src.data.subarray(so, so + f[3] * 4), y * f[3] * 4);
  }
  cd.putImageData(new ImageData(buf, f[3], f[4]), 0, 0);
  tiles.set(key, c);
  return c;
}
const items = units.instances.map((it) => {
  const f = units.frames[it.f];
  const px = it.x, pz = it.z;
  const pr = project(px, it.y || 0, pz);
  return { it, f, depth: pr.depth, sx: pr.sx * scale + wx, sy: pr.sy * scale + wy };
}).sort((a, b) => a.depth - b.depth);
let drawn = 0;
for (const o of items) {
  const f = o.f;
  const k = scale / (units.bpp || 46) * (o.it.s / (f[9] || 1));
  const w = f[3] * k, h = f[4] * k;
  const x = o.sx - f[5] * k, y = o.sy - f[6] * k;
  if (x + w < 0 || x > W || y + h < 0 || y > H) continue;
  ctx.drawImage(tileFor(f), x, y, w, h);
  drawn++;
}
await sharp(canvas.toBuffer('image/png')).toFile(OUT);
console.log('✓', OUT, 'items', items.length, 'drawn', drawn, 'scale', scale.toFixed(1));
