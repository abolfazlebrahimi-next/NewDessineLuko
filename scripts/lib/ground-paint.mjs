// ================= کشیدنِ کفِ شهر (خیابان، پیاده‌رو، چمن، خط‌کشی) =================
// همه‌ی این‌ها در نسخه‌ی سه‌بعدی با هندسه/بافت زنده ساخته می‌شدند. حالا یک‌بار در
// نود کشیده می‌شوند و بازی فقط تصویرِ آماده را می‌کشد.
//
// نکته‌ی مهم: کف در «فضای دیدِ ایزومتریک» پخته می‌شود، نه نقشه‌ی از بالا. برای همین
// یک تبدیلِ خطی روی بوم می‌گذاریم تا همان کدهای نقشه‌ای (x,z) مستقیم روی تصویرِ
// لوزی‌شکل بنشینند. نتیجه: تصویر در بازی فقط یک drawImage بدونِ چرخش است.
import { CAM_UP } from '../../src/cam.js';

const S2 = Math.SQRT1_2;
const KSIN = -CAM_UP.z;     // ۰٫۷۵ — له‌شدگیِ محورِ عمق در نمای ایزو

/** اندازه‌ی ناحیه‌ی شهری و مستطیلِ دیدِ آن (واحدِ دید) */
export function groundGeometry(CITY) {
  const P = CITY.pitch, R = CITY.road, range = CITY.range;
  const E = (range * 2 + 1) * P + R;         // ضلعِ نقشه (واحدِ شهر)
  const w = E * 2 * S2;                       // عرضِ لوزیِ ایزو
  const h = E * 2 * S2 * KSIN;                // ارتفاعِ لوزیِ ایزو
  return { E, viewW: w, viewH: h, x0: -w / 2, y0: -h / 2 };
}

/**
 * نقاشیِ کف روی یک بوم (۲بعدی). نقطه‌ی نقشه (x,z) → پیکسل:
 *   px = ( (x+z)*S2 − x0 ) * ppu
 *   py = ( (x−z)*S2*KSIN − y0 ) * ppu
 * رسم با مختصاتِ نقشه انجام می‌شود و تبدیلِ بالا خودش اعمال می‌گردد.
 */
export function paintGround(ctx, { CITY, ppu, x0, y0 }) {
  const P = CITY.pitch, B = CITY.block, R = CITY.road, range = CITY.range;
  const E = (range * 2 + 1) * P + R;

  ctx.save();
  ctx.setTransform(ppu * S2, ppu * S2 * KSIN, ppu * S2, -ppu * S2 * KSIN, -x0 * ppu, -y0 * ppu);

  const rand = mulberry(77213);
  const pickOf = (a) => a[Math.floor(rand() * a.length)];
  const rrect = (x, y, w, h, r) => {
    r = Math.max(0, Math.min(r, w / 2, h / 2));
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  };
  const grassDots = (bx, by, bs, n, bh = bs) => {
    for (let i = 0; i < n; i++) {
      ctx.fillStyle = `rgba(${40 + rand() * 40 | 0},${110 + rand() * 50 | 0},40,${0.12 + rand() * 0.15})`;
      ctx.beginPath();
      ctx.arc(bx + rand() * bs, by + rand() * bh, 0.12 + rand() * 0.3, 0, 7);
      ctx.fill();
    }
  };
  const bricks = (x, y, w, h, bw, bh, color) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = 0.05;
    ctx.beginPath();
    let row = 0;
    for (let yy = y; yy < y + h; yy += bh, row++) {
      ctx.moveTo(x, yy); ctx.lineTo(x + w, yy);
      for (let xx = x + ((row % 2) * bw) / 2; xx < x + w; xx += bw) {
        ctx.moveTo(xx, yy); ctx.lineTo(xx, Math.min(yy + bh, y + h));
      }
    }
    ctx.stroke();
  };

  // ---------- انواع بلوک ----------
  const kindMap = new Map();
  const rk = mulberry(20261019);
  for (let c = -range; c <= range; c++) {
    for (let r = -range; r <= range; r++) {
      const ring = Math.max(Math.abs(c), Math.abs(r));
      let kind;
      if (ring <= 1) kind = ((c === -1 && r === 1) || (c === 0 && r === -1) || (c === 0 && r === 1)) ? 'lawn' : 'core';
      else if (c === -range && r === -range) kind = 'water';
      else if (c === range && r === range) kind = 'containers';
      else { const x = rk(); kind = x < 0.48 ? 'suburb' : x < 0.82 ? 'commercial' : 'industrial'; }
      const sk = CITY.skatepark;
      if (sk && c === sk.col && r === sk.row && ring >= 2) kind = 'skate';
      kindMap.set(c + ',' + r, kind);
    }
  }
  const blockKind = (c, r) => kindMap.get(c + ',' + r) || 'suburb';

  const carFree = new Map();
  for (const s of CITY.carFree || []) {
    const [c1, r1] = s.a, [c2, r2] = s.b;
    if (r1 === r2 && Math.abs(c1 - c2) === 1) carFree.set(`v:${Math.min(c1, c2)}:${r1}`, s.style);
    else if (c1 === c2 && Math.abs(r1 - r2) === 1) carFree.set(`h:${Math.min(r1, r2)}:${c1}`, s.style);
  }
  const segKey = (vert, line, along) => `${vert ? 'v' : 'h'}:${Math.round(line / P - 0.5)}:${Math.round(along / P)}`;
  const carFreeAt = (vert, line, along) => carFree.get(segKey(vert, line, along));
  const streetClass = (vert, line, along) => {
    const cf = carFreeAt(vert, line, along);
    if (cf) return cf;
    const a = Math.round(line / P - 0.5), k = Math.round(along / P);
    const near = vert ? [blockKind(a, k), blockKind(a + 1, k)] : [blockKind(k, a), blockKind(k, a + 1)];
    if (Math.abs(line) <= P) return 'core';
    if (near.includes('industrial') || near.includes('containers') || near.includes('water')) return 'industrial';
    if (near.every((x) => x === 'suburb' || x === 'lawn')) return 'residential';
    if (Math.abs(Math.abs(line) - 1.5 * P) < 0.1) return 'avenue';
    return 'street';
  };

  // ---------- چمنِ زیرِ همه چیز ----------
  const M = E / 2 + 16;
  ctx.fillStyle = '#7ec850';
  ctx.fillRect(-M, -M, M * 2, M * 2);
  // لکه‌های نرمِ چمن برای این‌که یکدست نباشد
  for (let i = 0; i < 900; i++) {
    const gx = (rand() - 0.5) * M * 2, gz = (rand() - 0.5) * M * 2;
    if (Math.abs(gx) < E / 2 + 6 && Math.abs(gz) < E / 2 + 6) continue;
    ctx.fillStyle = `rgba(${30 + rand() * 30 | 0},${130 + rand() * 40 | 0},${50 + rand() * 30 | 0},${0.15 + rand() * 0.2})`;
    ctx.beginPath();
    ctx.arc(gx, gz, 0.8 + rand() * 2.4, 0, 7);
    ctx.fill();
  }

  // ---------- خیابان‌ها ----------
  const lines = [];
  for (let i = -range - 1; i <= range; i++) lines.push((i + 0.5) * P);
  const SW = 0.85;
  // پیاده‌روهای کنارِ خیابان (بیرونِ شهر هم ادامه دارند تا افق یکدست باشد)
  const OUT = E / 2 + 12;
  ctx.fillStyle = '#c6cad2';
  for (const l of lines) {
    for (const s of [-1, 1]) {
      ctx.fillRect(l + s * (R / 2 + 0.05), -OUT, SW, OUT * 2);
      ctx.fillRect(-OUT, l + s * (R / 2 + 0.05), OUT * 2, SW);
    }
  }
  ctx.fillStyle = 'rgba(255,255,255,.4)';
  for (const l of lines) {
    for (const s of [-1, 1]) {
      ctx.fillRect(l + s * (R / 2 + SW), -OUT, 0.12, OUT * 2);
      ctx.fillRect(-OUT, l + s * (R / 2 + SW), OUT * 2, 0.12);
    }
  }
  // آسفالت
  ctx.save();
  ctx.fillStyle = '#474b54';
  for (const l of lines) {
    ctx.fillRect(l - R / 2, -OUT, R, OUT * 2);
    ctx.fillRect(-OUT, l - R / 2, OUT * 2, R);
  }
  ctx.restore();
  // نویز و لکه روی آسفالت
  for (let i = 0; i < 2600; i++) {
    const l = pickOf(lines), vert = rand() < 0.5;
    const off = (rand() - 0.5) * (R - 0.5), along = (rand() - 0.5) * E;
    const x = vert ? l + off : along, z = vert ? along : l + off;
    ctx.fillStyle = `rgba(255,255,255,${0.02 + rand() * 0.04})`;
    ctx.fillRect(x, z, 0.07, 0.07);
  }
  for (let i = 0; i < 70; i++) {
    const l = pickOf(lines), along = (rand() - 0.5) * E, vert = rand() < 0.5;
    const off = (rand() - 0.5) * (R - 0.9);
    ctx.fillStyle = `rgba(20,22,26,${0.1 + rand() * 0.12})`;
    if (vert) ctx.fillRect(l + off, along, 0.2 + rand() * 0.4, 0.8 + rand() * 2);
    else ctx.fillRect(along, l + off, 0.8 + rand() * 2, 0.2 + rand() * 0.4);
  }

  // ---------- کفِ بلوک‌ها ----------
  ctx.fillStyle = '#bcc0c9';
  ctx.fillRect(-E / 2, -E / 2, E, E);
  const CORE = 1.5 * P - R / 2;
  ctx.fillStyle = '#d6cab2';
  ctx.fillRect(-CORE, -CORE, CORE * 2, CORE * 2);
  bricks(-CORE, -CORE, CORE * 2, CORE * 2, 0.9, 0.45, 'rgba(130,108,78,.2)');
  const tones = ['#ccd0d8', '#c3c8d3', '#d3d6de'];
  for (let col = -range; col <= range; col++) {
    for (let row = -range; row <= range; row++) {
      const bx = col * P - B / 2, by = row * P - B / 2, bs = B;
      const kind = blockKind(col, row);
      const rad = CITY.cornerRadius?.[kind] ?? 0.8;
      ctx.save();
      rrect(bx, by, bs, bs, rad);
      ctx.clip();
      if (kind === 'lawn') {
        ctx.fillStyle = '#5f9e46';
        ctx.fillRect(bx, by, bs, bs);
        grassDots(bx, by, bs, 110);
      } else if (kind === 'suburb') {
        ctx.fillStyle = '#c9ccd2';
        ctx.fillRect(bx, by, bs, bs);
        ctx.save();
        rrect(bx + 0.7, by + 0.7, bs - 1.4, bs - 1.4, Math.max(0.1, rad - 0.7));
        ctx.clip();
        ctx.fillStyle = '#72b052';
        ctx.fillRect(bx + 0.7, by + 0.7, bs - 1.4, bs - 1.4);
        grassDots(bx + 0.7, by + 0.7, bs - 1.4, 80);
        ctx.fillStyle = 'rgba(230,226,214,.5)';
        ctx.fillRect(bx + bs / 2 - 0.35, by + 0.7, 0.7, bs - 1.4);
        ctx.restore();
      } else if (kind === 'skate') {
        ctx.fillStyle = '#c9ccd4';
        ctx.fillRect(bx, by, bs, bs);
        const T = CITY.skateScale, n = 6;
        const tx = col * P - (n * T) / 2, ty = row * P - (n * T) / 2, ts = n * T;
        ctx.fillStyle = '#a5a2bd';
        ctx.fillRect(tx, ty, ts, ts);
        ctx.strokeStyle = 'rgba(60,56,90,.28)';
        ctx.lineWidth = 0.08;
        for (let t = 1; t < n; t++) {
          ctx.beginPath();
          ctx.moveTo(tx + T * t, ty); ctx.lineTo(tx + T * t, ty + ts);
          ctx.moveTo(tx, ty + T * t); ctx.lineTo(tx + ts, ty + T * t);
          ctx.stroke();
        }
        ctx.strokeStyle = 'rgba(255,255,255,.6)';
        ctx.lineWidth = 0.12;
        ctx.strokeRect(tx, ty, ts, ts);
      } else {
        ctx.fillStyle = kind === 'core' ? '#ded7c5' : kind === 'commercial' ? '#c7cbd3' : tones[Math.abs(col * 3 + row * 7) % 3];
        ctx.fillRect(bx, by, bs, bs);
        ctx.strokeStyle = 'rgba(100,102,95,.14)';
        ctx.lineWidth = 0.1;
        for (let t = 1; t < 4; t++) {
          ctx.beginPath();
          ctx.moveTo(bx + (bs / 4) * t, by); ctx.lineTo(bx + (bs / 4) * t, by + bs);
          ctx.moveTo(bx, by + (bs / 4) * t); ctx.lineTo(bx + bs, by + (bs / 4) * t);
          ctx.stroke();
        }
        if (kind === 'core') {
          ctx.fillStyle = 'rgba(255,250,232,.4)';
          const inset = 1.35;
          ctx.fillRect(bx + inset, by + inset, bs - inset * 2, bs - inset * 2);
        }
      }
      ctx.strokeStyle = 'rgba(255,255,255,.55)';
      ctx.lineWidth = 0.32;
      rrect(bx + 0.16, by + 0.16, bs - 0.32, bs - 0.32, Math.max(0.1, rad - 0.16));
      ctx.stroke();
      ctx.strokeStyle = 'rgba(70,72,66,.5)';
      ctx.lineWidth = 0.16;
      rrect(bx, by, bs, bs, rad);
      ctx.stroke();
      ctx.restore();
    }
  }

  // ---------- خط‌کشی و تکه‌خیابان‌ها ----------
  const segs = [];
  for (const l of lines) {
    for (const vert of [true, false]) {
      for (let kk = -range; kk <= range; kk++) {
        const mid = kk * P;
        segs.push({ vert, line: l, mid, t0: mid - B / 2, t1: mid + B / 2, cls: streetClass(vert, l, mid) });
      }
    }
  }
  const segRect = (s, o0, o1, t0, t1) => {
    if (s.vert) ctx.fillRect(s.line + o0, t0, o1 - o0, t1 - t0);
    else ctx.fillRect(t0, s.line + o0, t1 - t0, o1 - o0);
  };
  const segDot = (s, o, t, r) => {
    const x = s.vert ? s.line + o : t, z = s.vert ? t : s.line + o;
    ctx.beginPath();
    ctx.arc(x, z, r, 0, 7);
    ctx.fill();
  };
  const plainMarks = (s, t0, t1) => {
    if (t1 - t0 < 0.7) return;
    ctx.fillStyle = 'rgba(242,243,245,.92)';
    segRect(s, -R / 2 + 0.2, -R / 2 + 0.34, t0, t1);
    segRect(s, R / 2 - 0.34, R / 2 - 0.2, t0, t1);
    ctx.fillStyle = '#f0f0ea';
    for (let d = t0 + 0.4; d + 1.0 < t1; d += 1.9) segRect(s, -0.09, 0.09, d, d + 1.0);
  };
  const CAR_FREE = ['square', 'park', 'promenade'];
  const CW_OFF = R / 2 + 0.62;
  const CUT = 1.3;
  for (const s of segs) {
    const m0 = s.t0 + CUT, m1 = s.t1 - CUT;
    const cls = s.cls;
    if (cls === 'street') plainMarks(s, m0, m1);
    else if (cls === 'avenue') {
      ctx.fillStyle = '#f2f1ea';
      segRect(s, -0.42, 0.42, m0, m1);
      ctx.fillStyle = '#74ad55';
      segRect(s, -0.34, 0.34, m0, m1);
      ctx.fillStyle = 'rgba(40,92,36,.6)';
      for (let d = m0 + 0.6; d < m1 - 0.4; d += 1.1) segDot(s, 0, d, 0.2);
      ctx.fillStyle = '#d4927f';
      segRect(s, -2.22, -1.76, m0, m1);
      segRect(s, 1.76, 2.22, m0, m1);
      ctx.fillStyle = 'rgba(245,245,240,.92)';
      segRect(s, -1.78, -1.7, m0, m1);
      segRect(s, 1.7, 1.78, m0, m1);
      for (let d = m0 + 1.2; d < m1 - 0.5; d += 4.2) { segDot(s, -1.99, d, 0.11); segDot(s, 1.99, d, 0.11); }
    } else if (cls === 'residential') {
      ctx.fillStyle = '#80b862';
      segRect(s, -R / 2, -1.86, m0, m1);
      segRect(s, 1.86, R / 2, m0, m1);
      ctx.fillStyle = 'rgba(245,245,240,.85)';
      segRect(s, -1.86, -1.79, m0, m1);
      segRect(s, 1.79, 1.86, m0, m1);
      ctx.fillStyle = 'rgba(250,238,205,.92)';
      segRect(s, -1.75, 1.75, s.mid - 0.32, s.mid + 0.32);
      ctx.fillStyle = 'rgba(205,160,60,.6)';
      for (let o = -1.55; o < 1.5; o += 0.62) segRect(s, o, o + 0.26, s.mid - 0.32, s.mid + 0.32);
    } else if (cls === 'industrial') {
      ctx.fillStyle = '#cbc4b5';
      segRect(s, -R / 2, R / 2, s.t0, s.t1);
      ctx.fillStyle = 'rgba(95,85,65,.22)';
      for (let d = s.t0 + 2.2; d < s.t1; d += 2.2) segRect(s, -R / 2, R / 2, d, d + 0.06);
      segRect(s, -0.03, 0.03, s.t0, s.t1);
      ctx.fillStyle = '#e0b23e';
      segRect(s, -R / 2 + 0.22, -R / 2 + 0.36, m0, m1);
      segRect(s, R / 2 - 0.36, R / 2 - 0.22, m0, m1);
    } else if (cls === 'core') {
      ctx.fillStyle = 'rgba(120,98,70,.3)';
      segRect(s, -R / 2 + 0.12, -R / 2 + 0.22, s.t0, s.t1);
      segRect(s, R / 2 - 0.22, R / 2 - 0.12, s.t0, s.t1);
    }
  }

  // ---------- پیاده‌راه‌ها (میدان/پارک/راسته) ----------
  for (const s of segs) {
    if (!CAR_FREE.includes(s.cls)) continue;
    const { t0, t1, mid } = s;
    const W = R / 2 + 0.45;
    ctx.save();
    ctx.beginPath();
    if (s.vert) { ctx.rect(s.line - R / 2, t0, R, t1 - t0); ctx.rect(s.line - W, t0 + 1.6, W * 2, t1 - t0 - 3.2); }
    else { ctx.rect(t0, s.line - R / 2, t1 - t0, R); ctx.rect(t0 + 1.6, s.line - W, t1 - t0 - 3.2, W * 2); }
    ctx.clip();
    const bx = s.vert ? s.line - W : t0, by = s.vert ? t0 : s.line - W;
    const bw = s.vert ? W * 2 : t1 - t0, bh = s.vert ? t1 - t0 : W * 2;
    if (s.cls === 'square') {
      ctx.fillStyle = '#e7dcc4';
      ctx.fillRect(bx, by, bw, bh);
      bricks(bx, by, bw, bh, 0.6, 0.3, 'rgba(150,122,88,.18)');
      ctx.strokeStyle = 'rgba(165,130,90,.38)';
      ctx.lineWidth = 0.14;
      if (s.vert) ctx.strokeRect(s.line - R / 2 + 0.35, t0 + 0.35, R - 0.7, t1 - t0 - 0.7);
      else ctx.strokeRect(t0 + 0.35, s.line - R / 2 + 0.35, t1 - t0 - 0.7, R - 0.7);
      const cx = s.vert ? s.line : mid, cz = s.vert ? mid : s.line;
      ctx.fillStyle = '#d6bf98';
      ctx.beginPath(); ctx.arc(cx, cz, 1.5, 0, 7); ctx.fill();
      ctx.strokeStyle = 'rgba(165,130,90,.55)';
      ctx.lineWidth = 0.2;
      ctx.beginPath(); ctx.arc(cx, cz, 2.05, 0, 7); ctx.stroke();
      ctx.lineWidth = 0.08;
      ctx.beginPath();
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2;
        ctx.moveTo(cx + Math.cos(a) * 1.5, cz + Math.sin(a) * 1.5);
        ctx.lineTo(cx + Math.cos(a) * 2.05, cz + Math.sin(a) * 2.05);
      }
      ctx.stroke();
    } else if (s.cls === 'park') {
      ctx.fillStyle = '#5f9e46';
      ctx.fillRect(bx, by, bw, bh);
      grassDots(bx, by, bw, 90, bh);
      const L = t1 - t0;
      ctx.strokeStyle = '#e8dfc4';
      ctx.lineWidth = 1.0;
      ctx.lineCap = 'round';
      ctx.beginPath();
      if (s.vert) {
        ctx.moveTo(s.line, t0);
        ctx.bezierCurveTo(s.line + 1.6, t0 + L * 0.34, s.line - 1.6, t0 + L * 0.66, s.line, t1);
      } else {
        ctx.moveTo(t0, s.line);
        ctx.bezierCurveTo(t0 + L * 0.34, s.line + 1.6, t0 + L * 0.66, s.line - 1.6, t1, s.line);
      }
      ctx.stroke();
      ctx.lineCap = 'butt';
    } else {
      ctx.fillStyle = '#ddceb1';
      ctx.fillRect(bx, by, bw, bh);
      ctx.strokeStyle = 'rgba(140,115,80,.22)';
      ctx.lineWidth = 0.05;
      ctx.beginPath();
      const step = 1.1, span = bw + bh;
      for (let d = -span; d < span; d += step) {
        ctx.moveTo(bx + d, by); ctx.lineTo(bx + d + bh, by + bh);
        ctx.moveTo(bx + d + bh, by); ctx.lineTo(bx + d, by + bh);
      }
      ctx.stroke();
      ctx.fillStyle = '#cdb893';
      segRect(s, -0.55, 0.55, t0 + 0.8, t1 - 0.8);
    }
    ctx.restore();
    if (s.cls === 'park') {
      ctx.fillStyle = '#e8dfc4';
      if (s.vert) ctx.fillRect(s.line - W - 0.6, mid - 0.65, (W + 0.6) * 2, 1.3);
      else ctx.fillRect(mid - 0.65, s.line - W - 0.6, 1.3, (W + 0.6) * 2);
    }
    ctx.fillStyle = 'rgba(255,255,255,.75)';
    segRect(s, -R / 2, R / 2, t0, t0 + 0.12);
    segRect(s, -R / 2, R / 2, t1 - 0.12, t1);
  }

  // ---------- خط عابر، خط توقف، میدانِ گردان ----------
  const approach = (s, cross, side) => {
    const cls = streetClass(s.vert, s.line, cross + (side * P) / 2);
    if (CAR_FREE.includes(cls)) return;
    const c0 = cross + side * CW_OFF;
    if (cls === 'core') {
      ctx.fillStyle = 'rgba(250,244,228,.92)';
      segRect(s, -R / 2 + 0.25, R / 2 - 0.25, c0 - 0.42, c0 + 0.42);
      return;
    }
    ctx.fillStyle = 'rgba(247,247,242,.95)';
    if (cls === 'residential') {
      segRect(s, -1.75, 1.75, c0 - 0.42, c0 - 0.32);
      segRect(s, -1.75, 1.75, c0 + 0.32, c0 + 0.42);
      return;
    }
    const stripes = 5, sw = (R - 0.9) / stripes;
    for (let i = 0; i < stripes; i++) {
      const off = -R / 2 + 0.45 + i * sw;
      segRect(s, off, off + sw * 0.6, c0 - 0.42, c0 + 0.42);
    }
    const toward = -side;
    const lane = s.vert ? -toward : toward;
    const a = cls === 'avenue' ? 0.48 : 0.25, b = cls === 'avenue' ? 1.66 : R / 2 - 0.3;
    const t = cross + side * (CW_OFF + 0.75);
    ctx.fillStyle = 'rgba(242,243,245,.9)';
    if (lane > 0) segRect(s, a, b, t - 0.11, t + 0.11);
    else segRect(s, -b, -a, t - 0.11, t + 0.11);
  };
  const inCity = (v) => Math.abs(v) <= 3.5 * P + 0.1;
  const rounds = (CITY.roundabouts || []).map(([x, z]) => ({ x: x * P, z: z * P }));
  for (const lx of lines) {
    for (const lz of lines) {
      if (!inCity(lx) || !inCity(lz)) continue;
      const isRound = rounds.some((r) => Math.hypot(r.x - lx, r.z - lz) < 0.5);
      if (isRound) {
        ctx.fillStyle = 'rgba(95,82,62,.2)';
        ctx.beginPath(); ctx.arc(lx, lz, 2.45, 0, 7); ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,.88)';
        ctx.lineWidth = 0.1;
        ctx.setLineDash([0.45, 0.32]);
        ctx.beginPath(); ctx.arc(lx, lz, 2.42, 0, 7); ctx.stroke();
        ctx.setLineDash([]);
        ctx.strokeStyle = 'rgba(255,255,255,.7)';
        ctx.beginPath(); ctx.arc(lx, lz, 1.18, 0, 7); ctx.stroke();
      } else if (Math.abs(lx) < P && Math.abs(lz) < P) {
        ctx.fillStyle = 'rgba(255,248,230,.55)';
        ctx.beginPath(); ctx.arc(lx, lz, 1.55, 0, 7); ctx.fill();
        ctx.strokeStyle = 'rgba(150,120,85,.45)';
        ctx.lineWidth = 0.14;
        ctx.beginPath(); ctx.arc(lx, lz, 1.55, 0, 7); ctx.stroke();
        ctx.beginPath(); ctx.arc(lx, lz, 0.85, 0, 7); ctx.stroke();
      }
      for (const side of [-1, 1]) {
        approach({ vert: true, line: lx }, lz, side);
        approach({ vert: false, line: lz }, lx, side);
      }
    }
  }

  // حاشیه‌ی شهر
  ctx.strokeStyle = '#8f9286';
  ctx.lineWidth = 0.28;
  ctx.strokeRect(-E / 2 + 0.14, -E / 2 + 0.14, E - 0.28, E - 0.28);

  ctx.restore();
}

// تصادفیِ ثابت
function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
