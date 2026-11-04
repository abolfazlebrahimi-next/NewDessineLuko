// ================= رندرِ نرم‌افزاری ایزومتریک (برای پختِ اسپریت) =================
// همان زاویه‌ی دوربین، همان نورپردازی و همان سایه‌زنیِ نسخه‌ی سه‌بعدی، ولی بدون WebGL:
// مثلث‌ها روی بافرِ رنگ/عمق پرشده می‌شوند. ورودی «فرمولِ» مدل‌هاست (رأس + ایندکس +
// colormap) و خروجی یک تصویرِ آماده‌ی ایزومتریک است.
import * as THREE from 'three';
import { CAM_BACK, CAM_RIGHT, CAM_UP as CAM_UP_V } from '../../src/cam.js';

// پایه‌های دوربین — دقیقاً همان چیزی که بازی هم استفاده می‌کند (یک منبعِ حقیقت)
export const CAM = {
  r: CAM_RIGHT,
  u: CAM_UP_V,
  b: CAM_BACK,
};
export const CAM_UP = CAM.u;

// ---------- نور (هم‌ارزِ MeshStandardMaterial + HemisphereLight + DirectionalLight) ----------
const lin = (hex) => {
  const c = new THREE.Color(hex).convertSRGBToLinear();
  return [c.r, c.g, c.b];
};
const SKY = lin(0xeaf6ff), GRND = lin(0x4a7a34), SUNCOL = lin(0xfff2d8);
const HEMI = 1.9, SUNC = 1.6;
const S = new THREE.Vector3(6, 14, 7).normalize();
const INV_PI = 1 / Math.PI;
const SRGB2LIN = new Float32Array(256);
for (let i = 0; i < 256; i++) {
  const v = i / 255;
  SRGB2LIN[i] = v < 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}
const lin2srgb = (v) => (v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(Math.max(0, v), 1 / 2.4) - 0.055);

function skyColor(nx, ny, nz) {
  const mix = 0.5 * ny + 0.5;
  const d = nx * S.x + ny * S.y + nz * S.z;
  const k = d > 0 ? d * SUNC : 0;
  return [
    ((GRND[0] + (SKY[0] - GRND[0]) * mix) * HEMI + SUNCOL[0] * k) * INV_PI,
    ((GRND[1] + (SKY[1] - GRND[1]) * mix) * HEMI + SUNCOL[1] * k) * INV_PI,
    ((GRND[2] + (SKY[2] - GRND[2]) * mix) * HEMI + SUNCOL[2] * k) * INV_PI,
  ];
}

const _m = new THREE.Matrix4();
const _v = new THREE.Vector3();

/**
 * رندرِ مجموعه‌ای از نمونه‌ها.
 * items: [{ parts:[{geo|verts,idx,uv,color,basic,side,matrix}], matrix, tint:[r,g,b]|null }]
 * opts:  { bpp, margin, ss, colormapOf(part) }
 * خروجی: { data(RGBA), w, h, ox, oy }  — ox/oy = پیکسلِ مبدأِ فضای شهر در همین تصویر
 */
export function renderItems(items, opts) {
  const bpp = opts.bpp || 48;
  const ss = opts.ss || 2;
  const margin = opts.margin == null ? 1 : opts.margin;
  const colormapOf = opts.colormapOf || (() => null);

  // ── ۱) همه‌ی رأس‌ها را به فضای صفحه ببر و کادر را پیدا کن
  const meshes = [];
  let minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9;
  for (const item of items) {
    for (const part of item.parts) {
      const pos = part.verts ? null : part.geo.getAttribute('position');
      const count = pos ? pos.count : part.verts.length / 3;
      const M = new THREE.Matrix4();
      if (item.matrix) M.copy(item.matrix);
      if (part.matrix) M.multiply(part.matrix);
      const e = M.elements;
      const sx = new Float32Array(count), sy = new Float32Array(count), sz = new Float32Array(count);
      for (let i = 0; i < count; i++) {
        const x = pos ? pos.getX(i) : part.verts[i * 3];
        const y = pos ? pos.getY(i) : part.verts[i * 3 + 1];
        const z = pos ? pos.getZ(i) : part.verts[i * 3 + 2];
        const wx = e[0] * x + e[4] * y + e[8] * z + e[12];
        const wy = e[1] * x + e[5] * y + e[9] * z + e[13];
        const wz = e[2] * x + e[6] * y + e[10] * z + e[14];
        const px = wx * CAM.r.x + wy * CAM.r.y + wz * CAM.r.z;
        const py = wx * CAM.u.x + wy * CAM.u.y + wz * CAM.u.z;
        const pz = wx * CAM.b.x + wy * CAM.b.y + wz * CAM.b.z;
        sx[i] = px * bpp; sy[i] = -py * bpp; sz[i] = pz;
        if (sx[i] < minX) minX = sx[i];
        if (sx[i] > maxX) maxX = sx[i];
        if (sy[i] < minY) minY = sy[i];
        if (sy[i] > maxY) maxY = sy[i];
      }
      meshes.push({ item, part, sx, sy, sz, count, e, wx: null });
    }
  }
  if (!meshes.length) return null;
  const x0 = Math.floor(minX - margin), y0 = Math.floor(minY - margin);
  const w = Math.max(1, Math.ceil(maxX + margin - x0)), h = Math.max(1, Math.ceil(maxY + margin - y0));
  const W = w * ss, H = h * ss;
  const color = new Float32Array(W * H * 3);
  const alpha = new Float32Array(W * H);
  // b از صحنه به سمتِ دوربین است → z هرچه بزرگ‌تر، نزدیک‌تر
  const zbuf = new Float32Array(W * H).fill(-Infinity);
  const uvA = [0, 0], uvB = [0, 0], uvC = [0, 0];
  let painted = 0;

  // ── ۲) پرشدن مثلث‌ها (از دور به نزدیک مرتب نیست؛ z-buffer کار را می‌کند)
  for (const M of meshes) {
    const { item, part, sx, sy, sz, count, e } = M;
    const geo = part.geo;
    const idx = part.idx || (geo && geo.getIndex ? geo.getIndex() : null);
    const idxN = idx ? (idx.count != null ? idx.count : idx.length) : 0;
    const idxAt = idx ? (idx.getX ? (i) => idx.getX(i) : (i) => idx[i]) : null;
    const n = idx ? idxN : count;
    const base = part.color || [1, 1, 1];
    const tint = item.tint;
    const tr = base[0] * (tint ? tint[0] : 1), tg = base[1] * (tint ? tint[1] : 1), tb = base[2] * (tint ? tint[2] : 1);
    const uv = part.uv || (geo && geo.getAttribute ? geo.getAttribute('uv') : null);
    const cm = colormapOf(part, item);
    const unlit = !!part.basic;
    const doubleSide = part.side === THREE.DoubleSide || part.side == null;
    const posAttr = part.verts ? null : geo.getAttribute('position');
    const getV = (i, out) => {
      if (posAttr) { out[0] = posAttr.getX(i); out[1] = posAttr.getY(i); out[2] = posAttr.getZ(i); }
      else { out[0] = part.verts[i * 3]; out[1] = part.verts[i * 3 + 1]; out[2] = part.verts[i * 3 + 2]; }
      return out;
    };
    const P0 = [0, 0, 0], P1 = [0, 0, 0], P2 = [0, 0, 0];
    const shade = [1, 1, 1];
    for (let t = 0; t < n; t += 3) {
      const ia = idxAt ? idxAt(t) : t, ib = idxAt ? idxAt(t + 1) : t + 1, ic = idxAt ? idxAt(t + 2) : t + 2;
      const ax = sx[ia], ay = sy[ia], az = sz[ia];
      const bx = sx[ib], by = sy[ib], bz = sz[ib];
      const cx = sx[ic], cy = sy[ic], cz = sz[ic];
      // نرمالِ جهان از رأس‌های اصلی
      getV(ia, P0); getV(ib, P1); getV(ic, P2);
      const w0 = [0, 0, 0], w1 = [0, 0, 0], w2 = [0, 0, 0];
      for (let k = 0; k < 3; k++) {
        w0[k] = e[k] * P0[0] + e[4 + k] * P0[1] + e[8 + k] * P0[2];
        w1[k] = e[k] * P1[0] + e[4 + k] * P1[1] + e[8 + k] * P1[2];
        w2[k] = e[k] * P2[0] + e[4 + k] * P2[1] + e[8 + k] * P2[2];
      }
      const e1 = [w1[0] - w0[0], w1[1] - w0[1], w1[2] - w0[2]];
      const e2 = [w2[0] - w0[0], w2[1] - w0[1], w2[2] - w0[2]];
      let nx = e1[1] * e2[2] - e1[2] * e2[1];
      let ny = e1[2] * e2[0] - e1[0] * e2[2];
      let nz = e1[0] * e2[1] - e1[1] * e2[0];
      const nl = Math.hypot(nx, ny, nz) || 1;
      nx /= nl; ny /= nl; nz /= nl;
      // پشت‌رو؟ (زاویه با محورِ دید)
      // پشت‌روها حذف می‌شوند (مثل backface culling در WebGL): هم سریع‌تر است هم
      // سطحِ داخلی مدل روی سطحِ بیرونی نمی‌افتد.
      const facing = nx * CAM.b.x + ny * CAM.b.y + nz * CAM.b.z;
      // یک‌رویه‌ها (بیشترِ مدل‌های Kenney) پشت‌روی خود را پنهان می‌کنند؛ دوطرفه‌ها
      // (شکل‌های کدساز، برگ/پارچه) از پشت هم دیده می‌شوند و مثل three نرمال برمی‌گردد.
      if (!doubleSide && facing <= 0) continue;
      const flip = doubleSide && facing < 0 ? -1 : 1;
      if (unlit) { shade[0] = shade[1] = shade[2] = 1; }
      else { const c = skyColor(nx * flip, ny * flip, nz * flip); shade[0] = c[0]; shade[1] = c[1]; shade[2] = c[2]; }
      if (uv) {
        uvA[0] = uv.getX(ia); uvA[1] = uv.getY(ia);
        uvB[0] = uv.getX(ib); uvB[1] = uv.getY(ib);
        uvC[0] = uv.getX(ic); uvC[1] = uv.getY(ic);
      }
      const px0 = (ax - x0) * ss, py0 = (ay - y0) * ss;
      const px1 = (bx - x0) * ss, py1 = (by - y0) * ss;
      const px2 = (cx - x0) * ss, py2 = (cy - y0) * ss;
      const minPX = Math.max(0, Math.floor(Math.min(px0, px1, px2)));
      const maxPX = Math.min(W - 1, Math.ceil(Math.max(px0, px1, px2)));
      const minPY = Math.max(0, Math.floor(Math.min(py0, py1, py2)));
      const maxPY = Math.min(H - 1, Math.ceil(Math.max(py0, py1, py2)));
      if (minPX > maxPX || minPY > maxPY) continue;
      const area = (px1 - px0) * (py2 - py0) - (px2 - px0) * (py1 - py0);
      if (Math.abs(area) < 1e-9) continue;
      const inv = 1 / area;
      for (let y = minPY; y <= maxPY; y++) {
        const fy = y + 0.5;
        for (let x = minPX; x <= maxPX; x++) {
          const fx = x + 0.5;
          const b0 = ((px1 - fx) * (py2 - fy) - (px2 - fx) * (py1 - fy)) * inv;
          const b1 = ((px2 - fx) * (py0 - fy) - (px0 - fx) * (py2 - fy)) * inv;
          const b2 = 1 - b0 - b1;
          if (b0 < -1e-5 || b1 < -1e-5 || b2 < -1e-5) continue;
          const k = y * W + x;
          const z = b0 * az + b1 * bz + b2 * cz;
          if (z <= zbuf[k] + 1e-4) continue;
          let r = tr * shade[0], g = tg * shade[1], b = tb * shade[2];
          if (cm) {
            const u = b0 * uvA[0] + b1 * uvB[0] + b2 * uvC[0];
            const v = b0 * uvA[1] + b1 * uvB[1] + b2 * uvC[1];
            // UV‌های این مدل‌ها از قبل در فضایِ تصویر (بالا-چپ) هستند؛ v مستقیم خوانده می‌شود
            const tx = Math.min(cm.w - 1, Math.max(0, (u * cm.w) | 0));
            const ty = Math.min(cm.h - 1, Math.max(0, (v * cm.h) | 0));
            const ti = (ty * cm.w + tx) * 4;
            r = cm.linear[cm.data[ti]] * tr * shade[0];
            g = cm.linear[cm.data[ti + 1]] * tg * shade[1];
            b = cm.linear[cm.data[ti + 2]] * tb * shade[2];
          }
          zbuf[k] = z;
          color[k * 3] = r; color[k * 3 + 1] = g; color[k * 3 + 2] = b;
          alpha[k] = 1;
          painted++;
        }
      }
    }
  }
  if (!painted) return null;

  // ── ۳) سوپرسمپل و خروجی
  const out = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let j = 0; j < ss; j++) {
        for (let i = 0; i < ss; i++) {
          const k = (y * ss + j) * W + (x * ss + i);
          const al = alpha[k];
          r += color[k * 3] * al; g += color[k * 3 + 1] * al; b += color[k * 3 + 2] * al; a += al;
        }
      }
      const o = (y * w + x) * 4;
      if (a > 0.0005) {
        const cov = a / (ss * ss);
        // رنگی که پس می‌دهیم «از پیش ضرب‌شده در آلفا» و در فضای sRGB است تا در
        // canvas با drawImage (که خودش در فضاِ sRGB درهم می‌آمیزد) درست بنشیند.
        out[o] = Math.round(Math.min(255, lin2srgb(r / a) * cov * 255));
        out[o + 1] = Math.round(Math.min(255, lin2srgb(g / a) * cov * 255));
        out[o + 2] = Math.round(Math.min(255, lin2srgb(b / a) * cov * 255));
        out[o + 3] = Math.round(Math.min(255, cov * 255));
      }
    }
  }
  // premultiplied: مصرف‌کننده باید با compositeِ 'source-over' روی بومِ از پیش تمیز
  // (یا با globalCompositeOperation = 'source-over') بکشد؛ در atlas پیکسل‌ها همین‌طور ذخیره می‌شوند
  return { data: out, w, h, ox: -x0, oy: -y0, x0, y0, premultiplied: true };
}

export { SRGB2LIN, lin2srgb };
