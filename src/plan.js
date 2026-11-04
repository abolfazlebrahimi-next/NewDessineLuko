// ================= نقشه‌ی شهر (فقط داده، بدونِ گرافیک) =================
// چیدمانِ شهر یک‌بار این‌جا ساخته می‌شود: خانه‌ها، مغازه‌ها، کارخانه‌ها، درخت‌ها،
// نیمکت‌ها، لامپ‌ها، فواره… هیچ مثلث/متریال/تصویری در کار نیست، فقط چند هزار ردیفِ
// کوچک. این ماژول هم در نود (ابزارِ پختِ اسپریت) اجرا می‌شود و هم در مرورگر (بازی)،
// تا اسپریت‌ها دقیقاً روی همان چیزی بنشینند که شهر انتظار دارد.
import { CITY, LAYOUT } from './config.js';

// تصادفیِ ثابت (چیدمان شهر هر بار یکی باشد)
export function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// نقطه روی محیط مستطیل (مسیر ماشین‌ها و آدمک‌ها) — lane: فاصله به سمت راست حرکت
export function rectPoint(hx, hz, dist, dir, lane) {
  const corners = [[-hx, -hz], [hx, -hz], [hx, hz], [-hx, hz]];
  if (dir < 0) corners.reverse();
  const segs = [];
  let total = 0;
  for (let i = 0; i < 4; i++) {
    const a = corners[i], b = corners[(i + 1) % 4];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    segs.push({ a, b, len });
    total += len;
  }
  let d = ((dist % total) + total) % total;
  for (const s of segs) {
    if (d <= s.len) {
      const t = s.len ? d / s.len : 0;
      const x = s.a[0] + (s.b[0] - s.a[0]) * t;
      const z = s.a[1] + (s.b[1] - s.a[1]) * t;
      const ux = (s.b[0] - s.a[0]) / s.len, uz = (s.b[1] - s.a[1]) / s.len;
      return { x: x - uz * lane, z: z + ux * lane, hx: ux, hz: uz };
    }
    d -= s.len;
  }
  return { x: corners[0][0], z: corners[0][1], hx: 1, hz: 0 };
}

// نقطه روی مستطیلِ گردگوشه بر حسب طول پیموده‌شده (مسیر نرم اسکیت‌سوارها)
export function roundRectPoint(hx, hz, rad, dist) {
  const ax = hx - rad, az = hz - rad;
  const sides = [[2 * ax, 1, 0], [2 * az, 0, 1], [2 * ax, -1, 0], [2 * az, 0, -1]];
  const corners = [[ax, -az], [ax, az], [-ax, az], [-ax, -az]];
  const arc = Math.PI * rad / 2;
  const total = 4 * arc + 4 * (ax + az);
  let d = ((dist % total) + total) % total;
  let x = -ax, z = -hz;
  for (let j = 0; j < 4; j++) {
    const [len, ux, uz] = sides[j];
    if (d <= len) return { x: x + ux * d, z: z + uz * d, hx: ux, hz: uz };
    d -= len;
    const [ox, oz] = corners[j];
    const f0 = -Math.PI / 2 + j * Math.PI / 2;
    if (d <= arc) {
      const f = f0 + d / rad;
      return { x: ox + rad * Math.cos(f), z: oz + rad * Math.sin(f), hx: -Math.sin(f), hz: Math.cos(f) };
    }
    d -= arc;
    x = ox + rad * Math.cos(f0 + Math.PI / 2);
    z = oz + rad * Math.sin(f0 + Math.PI / 2);
  }
  return { x, z, hx: 1, hz: 0 };
}

// رنگ‌های لباس و پوست آدمک‌ها (فقط عدد — مدلشان در نود پخته شده)
export const SKIN = [0xf2c69d, 0xe0ac82, 0xc98d64, 0x9c6b4a];
export const SHIRT = [0xe5484d, 0x3a86ff, 0x57b83e, 0xffb703, 0x9b5de5, 0x00b4d8, 0xff70a6, 0xf77f00];
export const PANTS = [0x355070, 0x6d597a, 0x403d39, 0x5f6c37];
export const HAIR = [0x2b2b2b, 0x5b3a1a, 0x8a5a2b, 0xd9b166, 0x777777];

/**
 * ساختِ کاملِ نقشه‌ی شهر.
 * خروجی: { instances: [{ type, x, z, y, rot, scale, tint }], ... }
 * نوع‌ها با پیشوندِ پکیج می‌آیند (s:building-type-a، n:tree، car:sedan، …) و
 * نوع‌های شهریِ ساختِ کد (lamps، bench، fountain…) با پیشوندِ '@'.
 */
export function buildPlan() {
  const rand = mulberry(20261019);
  const pickOf = (arr) => arr[Math.floor(rand() * arr.length)];
  const P = CITY.pitch, B = CITY.block, R = CITY.road;

  const instances = [];
  const add = (type, x, z, { y = 0.06, rot = 0, scale = 1, tint = null } = {}) => {
    instances.push({ type, x, z, y, rot, scale, tint });
  };
  const addMany = (type, list) => { for (const it of list) add(type, it.x, it.z, it); };

  // ---------- انواع بلوک ----------
  const kindMap = new Map();
  for (let c = -CITY.range; c <= CITY.range; c++) {
    for (let r = -CITY.range; r <= CITY.range; r++) {
      const ring = Math.max(Math.abs(c), Math.abs(r));
      let kind;
      if (ring <= 1) {
        kind = ((c === -1 && r === 1) || (c === 0 && r === -1) || (c === 0 && r === 1)) ? 'lawn' : 'core';
      } else if (c === -CITY.range && r === -CITY.range) kind = 'water';
      else if (c === CITY.range && r === CITY.range) kind = 'containers';
      else {
        const x = rand();
        kind = x < 0.48 ? 'suburb' : x < 0.82 ? 'commercial' : 'industrial';
      }
      const sk = CITY.skatepark;
      if (sk && c === sk.col && r === sk.row && ring >= 2) kind = 'skate';
      kindMap.set(c + ',' + r, kind);
    }
  }
  const blockKind = (c, r) => kindMap.get(c + ',' + r) || 'suburb';

  // ---------- تکه‌های پیاده‌راه ----------
  const carFree = new Map();
  for (const s of CITY.carFree || []) {
    const [c1, r1] = s.a, [c2, r2] = s.b;
    if (r1 === r2 && Math.abs(c1 - c2) === 1) carFree.set(`v:${Math.min(c1, c2)}:${r1}`, s.style);
    else if (c1 === c2 && Math.abs(r1 - r2) === 1) carFree.set(`h:${Math.min(r1, r2)}:${c1}`, s.style);
  }
  const segKey = (vert, line, along) => `${vert ? 'v' : 'h'}:${Math.round(line / P - 0.5)}:${Math.round(along / P)}`;
  const carFreeAt = (vert, line, along) => carFree.get(segKey(vert, line, along));

  // ============ ۱) باغچه (بلوک lawn با فواره، پرچین و گل) ============
  {
    const cx = -P, cz = P;
    const y = 0.05;
    add('@pathX', cx, cz, { y, length: B - 1, width: 1.5 });
    add('@pathZ', cx, cz, { y, length: B - 1, width: 1.5 });
    for (const d of [-B / 2 + 0.45, B / 2 - 0.45]) {
      for (let k = -B / 2 + 0.9; k <= B / 2 - 0.9; k += 1.15) {
        add('@hedge', cx + k, cz + d, { rot: 0 });
        add('@hedge', cx + d, cz + k, { rot: Math.PI / 2 });
      }
    }
    add('@fountain', cx, cz);
    const colors = [0xff6b81, 0xffd166, 0xc77dff, 0xff8fab, 0xffffff];
    for (let i = 0; i < 64; i++) {
      let fx, fz;
      do { fx = cx + (rand() - 0.5) * (B - 2); fz = cz + (rand() - 0.5) * (B - 2); }
      while (Math.abs(fx - cx) < 1.7 && Math.abs(fz - cz) < 1.7);
      add('@flower', fx, fz, { y: 0.16, tint: pickOf(colors), scale: 0.6 + rand() * 0.7 });
    }
    for (const [dx, dz, rot] of [[-2.7, 0, Math.PI / 2], [2.7, 0, -Math.PI / 2], [0, -2.7, 0], [0, 2.7, Math.PI]]) {
      add('@bench', cx + dx, cz + dz, { rot });
    }
  }

  // ============ ۲) پارک کوچک (بلوک lawn شمالی: حوض، درخت، نیمکت) ============
  {
    const cx = 0, cz = P;
    add('@pond', cx + 1.6, cz + 1.2);
    add('@bench', cx - 2.2, cz - 1.4, { rot: Math.PI / 2 });
    add('@bench', cx + 2.4, cz - 2.2, { rot: -Math.PI / 2 });
    for (let i = 0; i < 7; i++) {
      add('n:tree', cx + (rand() - 0.5) * 9, cz + (rand() - 0.5) * 9, { rot: rand() * 6.28, scale: 1.2 + rand() * 0.4 });
    }
  }

  // ============ ۳) میدان سبزِ غرب ============
  {
    const cx = -P, cz = -P;
    for (let i = 0; i < 6; i++) {
      add(pickOf(['n:tree', 'n:tree-tall', 'n:tree-autumn']), cx + (rand() - 0.5) * 9, cz + (rand() - 0.5) * 9, { rot: rand() * 6.28, scale: 1.2 + rand() * 0.4 });
    }
    add('@bench', cx + 2.4, cz + 2.6, { rot: Math.PI });
  }

  // ============ ۴) چراغ‌های کنارِ هر تقاطع ============
  {
    for (const l of [-2.5, -1.5, -0.5, 0.5, 1.5, 2.5]) {
      for (const m of [-2.5, -1.5, -0.5, 0.5, 1.5, 2.5]) {
        add('@lamp', l * P + R / 2 + 0.5, m * P + R / 2 + 0.5);
        add('@lamp', l * P - R / 2 - 0.5, m * P - R / 2 - 0.5);
      }
    }
  }

  // ============ ۵) محله‌های مسکونی ============
  const parkingSpots = [];
  const yardTreeSpots = [];
  {
    const K = CITY.suburbScale;
    const houseTints = [0xffffff, 0xffffff, 0xffffff, 0xfbf0dc, 0xe8eef5, 0xf6e3d9, 0xe9f2e0];
    const fenceTints = [0xffffff, 0xf2ead8, 0xe8e2d2];
    for (let c = -CITY.range; c <= CITY.range; c++) {
      for (let r = -CITY.range; r <= CITY.range; r++) {
        if (blockKind(c, r) !== 'suburb') continue;
        const cx = c * P, cz = r * P;
        for (const lx of [-2.55, 2.55]) {
          for (const lz of [-2.55, 2.55]) {
            const face = lz < 0 ? -1 : 1;
            const side = lx < 0 ? -1 : 1;
            const hx = cx + lx + (rand() - 0.5) * 0.3;
            const hz = cz + lz - face * 0.95;
            const rot = face < 0 ? 0 : Math.PI;
            const name = pickOf(CITY.houses);
            add('s:' + name, hx, hz, { rot, scale: K, tint: pickOf(houseTints) });
            const dwx = hx + side * 1.45;
            add('s:driveway-long', dwx, cz + face * 3.75, { rot, scale: K });
            add('s:driveway-long', dwx, cz + face * 4.95, { rot, scale: K });
            parkingSpots.push({ x: dwx, z: cz + face * 4.85, rot, door: { x: hx - side * 0.55, z: hz + face * 0.75 } });
            add(rand() < 0.5 ? 's:path-long' : 's:path-stones-long', hx - side * 0.35, cz + face * 3.75, { rot, scale: K });
            const fz = cz + face * 4.4;
            for (const fx of [-2.0, -0.55, 0.9]) {
              const px = hx - side * 0.2 + (side < 0 ? -fx : fx);
              if (Math.abs(px - dwx) < 0.95) continue;
              add('s:fence', px, fz, { rot, scale: K, tint: pickOf(fenceTints) });
            }
            if (rand() < 0.45) add('s:planter', hx - side * 1.6, cz + face * 3.4, { rot: rot + (rand() < 0.5 ? 0 : Math.PI / 2), scale: K });
            if (rand() < 0.75) yardTreeSpots.push([hx + side * 2.15, hz + face * (rand() * 1.2 - 0.2)]);
            if (rand() < 0.35) yardTreeSpots.push([hx - side * 1.9 + (rand() - 0.5) * 0.6, hz - face * 1.9]);
          }
        }
      }
    }
  }

  // ============ ۶) مرکز شهر (مغازه‌ها و آسمان‌خراش‌ها) ============
  {
    const K = CITY.commercialScale;
    const tints = [0xffffff, 0xffffff, 0xffffff, 0xf4ebdc, 0xe4ebf3, 0xf1dfd6];
    const HALF = 4.75;
    for (let c = -CITY.range; c <= CITY.range; c++) {
      for (let r = -CITY.range; r <= CITY.range; r++) {
        if (blockKind(c, r) !== 'commercial') continue;
        const cx = c * P, cz = r * P;
        const back = r === -CITY.range;
        for (const face of [-1, 1]) {
          let x = -HALF + 0.15 + rand() * 0.4;
          let guard = 0;
          while (x < HALF - 1.6 && guard++ < 12) {
            const towerP = back ? (face < 0 ? 0.75 : 0.45) : (r === -2 && face < 0 ? 0.3 : 0.12);
            const pool = rand() < towerP ? CITY.towers : CITY.shops;
            const name = pickOf(pool);
            // عرضِ واقعیِ مدل از جدولِ اندازه‌ها می‌آید (در نود از GLB، در مرورگر از atlas)
            const w = cityWidth('c:' + name) * K;
            const d = Math.min(cityDepth('c:' + name) * K, 4.6);
            if (x + w > HALF + 0.2) {
              const slim = CITY.shops.filter((n) => x + cityWidth('c:' + n) * K <= HALF + 0.2);
              if (!slim.length) break;
              const n2 = pickOf(slim);
              const w2 = cityWidth('c:' + n2) * K, d2 = Math.min(cityDepth('c:' + n2) * K, 4.6);
              add('c:' + n2, cx + x + w2 / 2, cz + face * (HALF - d2 / 2), { rot: face < 0 ? 0 : Math.PI, scale: K, tint: pickOf(tints) });
              break;
            }
            add('c:' + name, cx + x + w / 2, cz + face * (HALF - d / 2), { rot: face < 0 ? 0 : Math.PI, scale: K, tint: pickOf(tints) });
            x += w + 0.25 + rand() * 0.35;
          }
          if (rand() < 0.6) {
            const px = cx + (rand() - 0.5) * 7;
            const pz = cz + face * (HALF + 0.45);
            const par = rand() < 0.5 ? 'c:detail-parasol-a' : 'c:detail-parasol-b';
            add(par, px, pz, { rot: rand() * 6.28, scale: K, y: 0.05 });
            add(par, px + 1.3, pz, { rot: rand() * 6.28, scale: K, y: 0.05 });
          }
        }
      }
    }
  }

  // ============ ۷) حاشیه‌ی صنعتی ============
  {
    const faceRot = (c, r) => {
      const b = Math.abs(c) > Math.abs(r) ? Math.PI / 2 : 0;
      return b + (rand() < 0.5 ? Math.PI : 0);
    };
    const plan = [];
    const put = (name, x, z, foot, maxH, rot) => plan.push({ name: 'i:' + name, x, z, foot, maxH, rot });
    for (let c = -CITY.range; c <= CITY.range; c++) {
      for (let r = -CITY.range; r <= CITY.range; r++) {
        const kind = blockKind(c, r);
        const x = c * P, z = r * P;
        if (kind === 'water') {
          put('water-tower', x - 1.5, z - 1, 5.5, 10, 0.4);
          put('detail-tank', x + 2.6, z + 2.2, 3.2, 3.6, 0);
          put('detail-tank-large', x + 2.2, z - 2.6, 3.6, 4.2, 0);
          continue;
        }
        if (kind === 'containers') {
          put('shipping-container-a', x - 1.8, z - 1.4, 4.8, 3, 0.15);
          put('shipping-container-b', x + 1.6, z + 1.2, 4.8, 3, -0.1);
          put('shipping-container-c', x + 2.2, z - 2.4, 4.8, 3, 1.65);
          put('windmill', x - 3.4, z + 2.8, 3.4, 7, 0.3);
          continue;
        }
        if (kind !== 'industrial') continue;
        const roll = rand();
        if (roll < 0.42) {
          put(pickOf(CITY.filler), x, z - 0.8, 8.3, 8.4, faceRot(c, r));
          if (rand() < 0.5) put(pickOf(CITY.filler), x + 3.1, z + 3.2, 3.9, 4.6, faceRot(c, r) + Math.PI / 2);
        } else if (roll < 0.78) {
          put(pickOf(CITY.filler), x - 2.55, z - 1.4, 4.7, 6.2, faceRot(c, r));
          put(pickOf(CITY.filler), x + 2.55, z - 1.4, 4.7, 6.2, faceRot(c, r));
          put(pickOf(CITY.filler), x - 1.4, z + 2.9, 4.3, 5, faceRot(c, r) + Math.PI);
        } else {
          put(pickOf(['shipping-container-a', 'shipping-container-b', 'shipping-container-c']), x - 2.2, z + 1.8, 4.6, 3.2, rand() * 0.5 - 0.25);
          put(pickOf(['detail-tank', 'detail-tank-large']), x + 3.2, z + 2.4, 3.1, 3.8, 0);
          put(pickOf(CITY.filler), x + 0.6, z - 2.2, 6.4, 7, faceRot(c, r));
        }
      }
    }
    const tints = [0xffffff, 0xffffff, 0xf7ead2, 0xdfe9ee, 0xf3ddcb, 0xe6eedd];
    const roof = { 'i:chimney-basic': [], 'i:chimney-medium': [], 'i:solar-panel-flat': [], 'i:solar-panel-landscape': [] };
    const roofNames = Object.keys(roof);
    for (const it of plan) {
      const sz = citySize(it.name) || [1, 1, 1];
      const s = Math.min(it.foot / Math.max(sz[0], sz[2]), it.maxH / sz[1]);
      const tint = pickOf(tints);
      add(it.name, it.x, it.z, { rot: it.rot, scale: s, tint });
      if (it.foot >= 4.5 && rand() < 0.42 && sz[1] * s > 1.2) {
        const top = 0.06 + sz[1] * s;
        const propName = pickOf(roofNames);
        const isChimney = propName.includes('chimney');
        const ox = (rand() - 0.5) * it.foot * 0.4, oz = (rand() - 0.5) * it.foot * 0.4;
        const cr = Math.cos(it.rot), sr = Math.sin(it.rot);
        roof[propName].push({
          x: it.x + ox * cr + oz * sr, z: it.z - ox * sr + oz * cr, y: top - 0.04,
          rot: isChimney ? 0 : (rand() < 0.5 ? 0 : Math.PI / 2),
          foot: isChimney ? 0.85 : 2.1, maxH: isChimney ? 1.7 : 0.6,
        });
      }
    }
    for (const n of roofNames) {
      if (!roof[n].length) continue;
      const sz = citySize(n) || [1, 1, 1];
      for (const it of roof[n]) {
        const s = Math.min(it.foot / Math.max(sz[0], sz[2]), it.maxH / sz[1]);
        add(n, it.x, it.z, { y: it.y, rot: it.rot, scale: s });
      }
    }
  }

  // ============ ۸) زمین اسکیت ============
  {
    const sp = CITY.skatepark;
    if (sp && blockKind(sp.col, sp.row) === 'skate') {
      const T = CITY.skateScale;
      const cx = sp.col * P, cz = sp.row * P;
      const X = (i) => cx + (i - 2.5) * T, Z = (k) => cz + (k - 2.5) * T;
      const HI = { nz: 0, px: -Math.PI / 2, pz: Math.PI, nx: Math.PI / 2 };
      const deck = 0.06 + 0.8 * T;
      const put = (name, i, k, rot = 0, y = 0.06) => add('k:' + name, X(i), Z(k), { rot, y, scale: T });
      put('bowl-corner-inner', 0, 0, HI.nz);
      for (let i = 1; i <= 3; i++) put('half-pipe', i, 0, HI.nz);
      put('bowl-corner-inner', 4, 0, HI.px);
      put('half-pipe', 0, 1, HI.nx);
      put('half-pipe', 4, 1, HI.px);
      for (let i = 0; i <= 5; i++) put('fence', i, -0.45, 0, deck);
      for (const k of [0, 1]) put('fence', -0.45, k, Math.PI / 2, deck);
      put('structure-wood-platform', 5, 0);
      put('fence', 5.45, 0, Math.PI / 2, deck);
      put('slope-smooth', 5, 1.5, HI.nz);
      put('obstacle-box', 5, 3.6);
      put('benches', 5, 5, HI.px);
      put('obstacle-end', 0.75, 3.5, HI.px);
      put('obstacle-middle-rail', 1.5, 3.5, Math.PI / 2);
      put('obstacle-middle', 2.5, 3.5, Math.PI / 2);
      put('obstacle-end', 3.25, 3.5, HI.nx);
      put('bench', 0.4, 5.25, Math.PI);
      put('rail-low', 2.4, 5.2, Math.PI / 2);
      put('rail-low', 3.4, 5.2, Math.PI / 2);
      put('pallet', 4.1, 5.25, 0.2);
      put('pallet', 4.1, 5.25, 0.55, 0.06 + 0.158 * T);
      put('scooter', 1.3, 5.2, 0.5);
      put('skateboard', 2.2, 1.95, 1.2);
    }
  }

  // ============ ۹) پیاده‌راه‌ها (میدان، پارک خطی، راسته‌ی خرید) ============
  const cafeStanders = [];
  {
    const rnd = mulberry(9017);
    const trees = { 'n:tree': [], 'n:tree-tall': [], 'n:tree-autumn': [] };
    const parasols = { 'c:detail-parasol-a': [], 'c:detail-parasol-b': [] };
    for (const [key, style] of carFree) {
      const [o, a, k] = key.split(':');
      const vert = o === 'v', line = (+a + 0.5) * P, mid = +k * P;
      const t0 = mid - B / 2, t1 = mid + B / 2;
      const at = (oo, t) => (vert ? [line + oo, t] : [t, line + oo]);
      const faceO = (sg) => (vert ? (sg * Math.PI) / 2 : sg > 0 ? 0 : Math.PI);
      for (const t of [t0 + 0.3, t1 - 0.3]) for (const oo of [-1.65, -0.55, 0.55, 1.65]) {
        const [x, z] = at(oo, t);
        add('@bollard', x, z);
      }
      const tree = (name, oo, t, maxH, y = 0.03) => {
        const [x, z] = at(oo, t);
        trees[name].push({ x, z, y, rot: rnd() * 6.28, maxH });
      };
      if (style === 'square') {
        const [cx, cz] = at(0, mid);
        add('@planterRing', cx, cz);
        tree('n:tree', 0, mid, 2.4, 0.4);
        for (const sg of [-1, 1]) {
          for (const d of [-2.4, 2.4]) { const [x, z] = at(sg * 1.9, mid + d); add('@bench', x, z, { rot: faceO(-sg) }); }
          for (const d of [-4.4, 4.4]) { const [x, z] = at(sg * 1.95, mid + d); add('@lamp', x, z); }
        }
      } else if (style === 'park') {
        tree('n:tree', -1.7, mid - 3.6, 2.1);
        tree('n:tree-autumn', 1.75, mid - 1.9, 2.0);
        tree('n:tree-tall', -1.75, mid + 2.2, 2.5);
        tree('n:tree', 1.6, mid + 3.8, 2.1);
        const b1 = at(1.3, mid - 3.6), b2 = at(-1.3, mid + 3.9);
        add('@bench', b1[0], b1[1], { rot: faceO(-1) });
        add('@bench', b2[0], b2[1], { rot: faceO(1) });
      } else {
        [-3.6, -1.8, 0, 1.8, 3.6].forEach((d, i) => {
          if (i % 2 === 0) {
            const [x, z] = at(0, mid + d);
            add('@planterRing', x, z, { scale: 0.45 });
            const nm = i === 2 ? 'n:tree-tall' : 'n:tree';
            trees[nm].push({ x, z, y: 0.3, rot: rnd() * 6.28, maxH: 2.2 });
          } else {
            const [x, z] = at(0, mid + d);
            add('s:planter', x, z, { y: 0.05, rot: vert ? Math.PI / 2 : 0, scale: CITY.suburbScale });
          }
        });
        for (const [sg, ds] of [[-1, [-3.2, -0.9, 2.4]], [1, [-2.4, 0.9, 3.2]]]) {
          for (const d of ds) {
            const [x, z] = at(sg * 2.0, mid + d);
            parasols[rnd() < 0.5 ? 'c:detail-parasol-a' : 'c:detail-parasol-b'].push({ x, z, y: 0.05, rot: rnd() * 6.28, scale: CITY.commercialScale });
          }
          const [x, z] = at(sg * 2.75, mid + sg * 2.05);
          cafeStanders.push({ x, z, rot: faceO(-sg) });
        }
      }
    }
    for (const [name, items] of Object.entries(trees)) {
      for (const it of items) {
        const s = (it.maxH || 2.4) / treeHeight(name);
        add(name, it.x, it.z, { y: it.y, rot: it.rot, scale: s });
      }
    }
    for (const [name, items] of Object.entries(parasols)) for (const it of items) add(name, it.x, it.z, it);
  }

  // ============ ۱۰) درخت‌های خیابان، حیاط، سنگ و علف، جنگلِ لبه ============
  {
    const street = [];
    const roadLines = [];
    for (let i = -4; i <= 3; i++) roadLines.push((i + 0.5) * P);
    const nearCross = (v) => roadLines.some((l) => Math.abs(v - l) < R / 2 + 1.85);
    for (const l of [-2.5, -1.5, -0.5, 0.5, 1.5, 2.5]) {
      const line = l * P;
      let k = 0;
      for (let t = -3 * P + 2; t <= 3 * P - 1.5; t += 3.9, k++) {
        const off = (k % 2) * 1.95;
        for (const sgn of [-1, 1]) {
          const x = line + sgn * (R / 2 + 1.15 + off * 0.25);
          const z = t + off * sgn;
          if (nearCross(x) || nearCross(z)) continue;
          if (carFreeAt(false, line, z) || carFreeAt(true, x, line)) continue;
          street.push({ x, z, rot: rand() * 6.28 });
        }
      }
    }
    for (const [x, z] of yardTreeSpots) street.push({ x, z, rot: rand() * 6.28 });
    for (const it of street) {
      add('n:' + pickOf(CITY.trees), it.x, it.z, { rot: it.rot, scale: 1.15 + rand() * 0.5 });
    }
    // سنگ و علف لابه‌لای درخت‌ها
    for (const it of street.slice(0, 240)) {
      if (rand() < 0.2) add('n:' + pickOf(['rock-a', 'rock-b', 'rock-c']), it.x + (rand() - 0.5) * 2, it.z + (rand() - 0.5) * 2, { rot: rand() * 6.28, scale: 1.0 + rand() * 0.8 });
      if (rand() < 0.3) add('n:' + pickOf(['grass', 'grass-large']), it.x + (rand() - 0.5) * 2.4, it.z + (rand() - 0.5) * 2.4, { rot: rand() * 6.28, scale: 1.4 + rand() * 1.0 });
    }
    // جنگلِ لبه‌ی شهر (افق سبزِ بی‌پایان)
    for (let i = 0; i < 150; i++) {
      const ang = rand() * Math.PI * 2, rad = 3.9 * P + rand() * 3.4 * P;
      add('n:' + pickOf(CITY.trees), Math.cos(ang) * rad, Math.sin(ang) * rad, { rot: rand() * 6.28, scale: 1.3 + rand() * 0.6 });
    }
  }

  // ============ ۱۱) میدان گردان و چراغ راهنما ============
  const signalHeads = [];
  {
    const rounds = (CITY.roundabouts || []).map(([x, z]) => ({ x: x * P, z: z * P }));
    const lights = (CITY.trafficLights || []).map(([x, z], i) => ({ x: x * P, z: z * P, t: i * 7 }));
    const APPROACH = [[0, 1], [0, -1], [1, 0], [-1, 0]];
    const faceTo = (hx, hz) => Math.atan2(-hz, hx);
    for (const C of rounds) {
      add('@roundabout', C.x, C.z);
      add('r:light-curved-cross', C.x, C.z, { y: 0.26, rot: Math.PI / 4, scale: 3.2 });
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2;
        add('@flower', C.x + Math.cos(a) * 0.72, C.z + Math.sin(a) * 0.72, { y: 0.33, tint: [0xff6b81, 0xffd166, 0xffffff, 0xc77dff][i % 4], scale: 0.5 });
      }
      for (const [hx, hz] of APPROACH) {
        add('r:road-sign-warning', C.x - hx * 4.7 - hz * 2.65, C.z - hz * 4.7 + hx * 2.65, { y: 0.05, rot: faceTo(hx, hz), scale: 3.6 });
      }
    }
    for (const L of lights) {
      for (const [hx, hz] of APPROACH) {
        signalHeads.push({
          x: L.x - hx * 3.95 - hz * 2.6, z: L.z - hz * 3.95 + hx * 2.6,
          rot: faceTo(hx, hz), axis: Math.abs(hz) > 0.5 ? 'ns' : 'ew',
        });
      }
    }
  }

  // ============ ۱۲) ماشین‌های پارک‌شده ============
  const parked = [];
  {
    const THEMED = [
      { car: 'ambulance', col: -1, row: -1, dx: -2.4 },
      { car: 'police', col: 1, row: -1, dx: 2.4 },
      { car: 'firetruck', col: 0, row: 0, dx: 3.6 },
      { car: 'taxi', col: 1, row: 0, dx: -2.6 },
      { car: 'garbage-truck', col: -1, row: 0, dx: 3.2 },
      { car: 'race', col: 0, row: 1, dx: 3.4 },
      { car: 'delivery', col: 1, row: 1, dx: -2.8 },
      { car: 'tractor', col: -1, row: 1, dx: 3.6 },
    ];
    for (const t of THEMED) parked.push({ name: t.car, x: t.col * P + t.dx, z: t.row * P + B / 2 - 1.6, rot: t.dx > 0 ? -0.1 : 0.1 });
    const family = ['sedan', 'suv', 'hatchback-sports', 'van', 'sedan-sports', 'suv-luxury'];
    for (let c = -CITY.range; c <= CITY.range; c++) {
      for (let r = -CITY.range; r <= CITY.range; r++) {
        if (blockKind(c, r) !== 'suburb') continue;
        for (const lx of [-2.55, 2.55]) {
          for (const lz of [-2.55, 2.55]) {
            if (rand() > 0.4) continue;
            const face = lz < 0 ? -1 : 1, side = lx < 0 ? -1 : 1;
            parked.push({ name: pickOf(family), x: c * P + lx + side * 1.45, z: r * P + face * 4.3, rot: (face < 0 ? 0 : Math.PI) + (rand() - 0.5) * 0.08 });
          }
        }
      }
    }
    parked.push({ name: 'van', x: 3 * P - 3.2, z: -3 * P + B / 2 - 1.4, rot: Math.PI + 0.05 });
  }

  // ============ ۱۳) ساختمان‌های اصلی (عکس‌های ایزومتریک) ============
  const landmarks = LAYOUT.buildings.filter((b) => b.onMap !== false).map((b) => ({
    id: b.id, tex: b.tex, w: b.w, fd: b.fd ?? 0.5, col: b.col, row: b.row,
    x: b.col * P, z: b.row * P,
  }));

  // ============ ۱۴) مسیرهای آدمک‌ها و ماشین‌ها (منطق) ============
  const pedLoops = [];
  {
    const inset = B / 2 - 0.85;
    const loops = [
      { cx: 0, cz: 0, h: P + inset, n: 13 },
      { cx: 0, cz: 0, h: inset, n: 5 },
      { cx: -P, cz: P, h: inset, n: 5 },
      { cx: 0, cz: P, h: inset, n: 5 },
      { cx: P, cz: 0, h: inset, n: 4 },
      { cx: P, cz: -P, h: inset, n: 4 },
      { cx: -P, cz: -P, h: inset, n: 4 },
      { cx: 0, cz: 0, h: 2 * P + inset, n: 9 },
      { cx: -2 * P, cz: 2 * P, h: inset, n: 3 },
      { cx: 2 * P, cz: 2 * P, h: inset, n: 3 },
      { cx: -2 * P, cz: -2 * P, h: inset, n: 3 },
      { cx: 2 * P, cz: -2 * P, h: inset, n: 3 },
      { cx: 0, cz: -2 * P, h: inset, n: 3 },
      { cx: 0, cz: 2 * P, h: inset, n: 3 },
      { cx: -2 * P, cz: 0, h: inset, n: 3 },
      { cx: 2 * P, cz: 0, h: inset, n: 3 },
    ];
    for (const L of loops) pedLoops.push({ cx: L.cx, cz: L.cz, hx: L.h, hz: L.h, n: L.n });
    for (const [key, style] of carFree) {
      const [o, a, k] = key.split(':');
      const vert = o === 'v', line = (+a + 0.5) * P, mid = +k * P;
      const across = style === 'park' ? 0.45 : style === 'square' ? 1.3 : 1.2;
      const along = style === 'square' ? 3.6 : 4.4;
      pedLoops.push({
        cx: vert ? line : mid, cz: vert ? mid : line,
        hx: vert ? across : along, hz: vert ? along : across,
        n: style === 'promenade' ? 5 : 3,
      });
    }
  }

  return {
    instances,
    landmarks,
    parkingSpots,
    parked,
    pedLoops,
    cafeStanders,
    signalHeads,
    blockKindMap: Object.fromEntries(kindMap),
    rand,     // همان دنباله‌ی تصادفی برای ادامه‌ی ساخت (عابرها/ماشین‌ها)
    P, B, R,
    // برای استفاده‌ی بعدی در city.js
    carFreeAt,
    blockKind,
  };
}

// اندازه‌ی مدل‌ها: در نود از GLB پر می‌شود، در مرورگر از atlas.
let SIZE_TABLE = null;
export function setSizeTable(table) { SIZE_TABLE = table; }
export function citySize(type) { return SIZE_TABLE ? SIZE_TABLE[type] : null; }
export function cityWidth(type) { const s = citySize(type); return s ? Math.max(s[0], 0.1) : 1.2; }
export function cityDepth(type) { const s = citySize(type); return s ? Math.max(s[2], 0.1) : 1.2; }
export function treeHeight(type) { const s = citySize(type); return s ? Math.max(s[1], 0.3) : 1.6; }

// ================= بازیگرانِ متحرک =================
// ماشین‌ها، آدمک‌ها و اسکیټ‌سوارها هر فریم می‌چرخند، پس برای هر نوع چند قاب در
// چرخش‌های مختلف پخته می‌شود. مقیاسِ هر نوع این‌جا (و در ابزارِ پخت) یک‌جور حساب
// می‌شود تا تصویرِ پخته‌شده دقیقاً همان اندازه‌ای باشد که بازی انتظار دارد.
const CAR_LEN = (name) => (/kart/.test(name) ? 1.3 : /truck|firetruck|garbage|delivery|van/.test(name) ? 2.4 : 2.0);

export function carScale(name) {
  const s = citySize('car:' + name);
  if (!s) return 1;
  return Math.min(CAR_LEN(name) / Math.max(s[0], s[2]), 9 / s[1]);
}

/** ظاهرِ آدمک‌ها — شماره‌ی هر ردیف، نامِ نوعِ قابِ پخته‌شده است (ped:0 …) */
export const PED_LOOKS = [
  { skin: 0xf2c69d, shirt: 0xe5484d, pants: 0x355070, hair: 0x2b2b2b },
  { skin: 0xe0ac82, shirt: 0x3a86ff, pants: 0x403d39, hair: 0x8a5a2b },
  { skin: 0xc98d64, shirt: 0x57b83e, pants: 0x6d597a, hair: 0x2b2b2b },
  { skin: 0x9c6b4a, shirt: 0xffb703, pants: 0x5f6c37, hair: 0x2b2b2b },
  { skin: 0xf2c69d, shirt: 0x9b5de5, pants: 0x355070, hair: 0xd9b166 },
  { skin: 0xe0ac82, shirt: 0x00b4d8, pants: 0x403d39, hair: 0x777777 },
  { skin: 0xc98d64, shirt: 0xff70a6, pants: 0x6d597a, hair: 0x5b3a1a },
  { skin: 0x9c6b4a, shirt: 0xf77f00, pants: 0x5f6c37, hair: 0x2b2b2b },
];
export const SKATER_LOOKS = [
  { skin: 0xf2c69d, shirt: 0x2f6fd0, pants: 0x2b2b33, hair: 0x2b2b2b },
  { skin: 0xe0ac82, shirt: 0xe5484d, pants: 0x40405a, hair: 0x8a5a2b },
];
export const PED_SCALE = 0.92;

/**
 * فهرستِ نوع‌هایی که برای بازیگرانِ متحرک باید در همه‌ی چرخش‌ها پخته شوند.
 * خروجی: [{ type, scale }]
 */
export function buildDynamic() {
  const out = [];
  // ماشین‌های در حالِ تردد و پارک‌شده هر دو از همین فهرست انتخاب می‌شوند
  for (const name of CITY.cars) out.push({ type: 'car:' + name, scale: +carScale(name).toFixed(4) });
  PED_LOOKS.forEach((_, i) => out.push({ type: 'ped:' + i, scale: PED_SCALE }));
  SKATER_LOOKS.forEach((_, i) => out.push({ type: 'skater:' + i, scale: 1 }));
  out.push({ type: 'r:traffic-light-hanging', scale: 4.5 });
  // تکراری‌ها را یک‌بار نگه دار
  const seen = new Set();
  return out.filter((d) => (seen.has(d.type) ? false : (seen.add(d.type), true)));
}
