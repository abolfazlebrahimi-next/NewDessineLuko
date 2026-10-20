// ================= شهر لوکو =================
// هسته‌ی شهر با ساختمان‌های اصلی (عکس‌های ایزومتریک)، پشتش مرکز شهر و آسمان‌خراش‌های
// Kenney City Kit Commercial، دورش محله‌های مسکونی با خانه‌های Kenney City Kit Suburban
// و حاشیه‌ی صنعتی با Kenney City Kit Industrial؛ خیابان‌ها،
// ماشین‌های Kenney Car Kit در حال تردد، درخت‌های پکیج Survival Kit و آدمک‌ها.
//
// نکته‌ی کارایی: همه‌ی خانه‌ها، وسایل حیاط، درخت‌ها و سایه‌ها به‌صورت InstancedMesh
// ساخته می‌شوند (هر مدل یک draw call) و مدل‌ها با Meshopt فشرده‌اند تا شهر سریع لود شود.
import * as THREE from 'three';
import { makeGLTFLoader } from './loader.js';
import { CITY, LAYOUT, assetUrl } from './config.js';

// تصادفیِ ثابت (چیدمان شهر هر بار یکی باشد)
function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry(20261019);
const pickOf = (arr) => arr[Math.floor(rand() * arr.length)];

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

const _m4 = new THREE.Matrix4();
const _m4b = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _v = new THREE.Vector3();
const _s = new THREE.Vector3();
const _e = new THREE.Euler();
const _c = new THREE.Color();

export class City {
  constructor(world, ui) {
    this.world = world;
    this.ui = ui;
    this.group = new THREE.Group();
    // کل شهر ۴۵ درجه می‌چرخد تا مثل تصویر مرجع، ایزومتریکِ لوزی دیده شود
    this.group.rotation.y = Math.PI / 4;
    world.scene.add(this.group);
    this.loader = makeGLTFLoader();
    this.cars = [];
    this.peds = [];
    this.labels = [];
    this.time = 0;
    this.P = CITY.pitch;
    this.B = CITY.block;
    this.R = CITY.road;
    this._shadowMat = null;
    this._modelCache = new Map();
    // تا ساختمان‌های اصلی (عکس‌ها) نیامده‌اند، صفحه‌ی لودینگ می‌ماند
    this.coreReady = Promise.resolve();
  }

  // مختصات محلی شهر ← مختصات جهان (برای اسپریت‌ها و برچسب‌هایی که بیرون گروه‌اند)
  _toWorld(x, z) {
    const c = Math.SQRT1_2, s = Math.SQRT1_2; // cos/sin ۴۵ درجه
    return { x: x * c + z * s, z: -x * s + z * c };
  }

  // نوع هر بلوک شهر
  //  core: ساختمان اصلی | lawn: فضای سبز | commercial: مرکز شهر/آسمان‌خراش (Commercial)
  //  suburb: محله‌ی مسکونی (Suburban) | industrial: حاشیه‌ی صنعتی (Industrial)
  //  water/containers: بلوک‌های ویژه‌ی صنعتی
  // چیدمان از دید دوربین (جنوب): جلو خانه‌ها، وسط ساختمان‌های اصلی، پشت مرکز شهر و خطِ آسمان
  blockKind(c, r) {
    const ring = Math.max(Math.abs(c), Math.abs(r));
    if (ring <= 1) {
      if ((c === -1 && r === 1) || (c === 0 && r === -1) || (c === 0 && r === 1)) return 'lawn';
      return 'core';
    }
    if (c === -3 && r === -3) return 'water';
    if (c === 3 && r === 3) return 'containers';
    if (ring === 2) return r < 0 ? 'commercial' : 'suburb';
    if (r === -3) return 'commercial';
    if (r >= 2) return 'suburb';
    return 'industrial';
  }

  async init() {
    this._buildGround();
    this.coreReady = this._buildLandmarks().catch((e) => console.warn('[city] landmarks', e));
    this._buildGarden();
    this._buildGreenSquare();
    this._buildPocketPark();
    this._buildPedestrians();
    this._buildLamps();
    // مدل‌ها موازی و تدریجی می‌آیند تا شهر از همان ثانیه‌های اول پر شود
    const jobs = [
      this._buildSuburbs(),
      this._buildCommercial(),
      this._buildIndustrial(),
      this._buildCars(),
      this._buildNature(),
    ].map((p, i) => p.catch((e) => console.warn('[city] job', i, e)));
    await Promise.allSettled([this.coreReady, ...jobs]);
  }

  // ---------- زمین شهر: یک بافت بزرگ نقاشی‌شده (خیابان/پیاده‌رو/بلوک) ----------
  _buildGround() {
    const { P, B, R } = this;
    const range = CITY.range;
    const E = (range * 2 + 1) * P + R;        // اندازه‌ی ناحیه‌ی شهری
    const S = 2048, k = S / E;
    const X = (x) => (x + E / 2) * k;
    const Y = (z) => (z + E / 2) * k;
    const U = (u) => u * k;

    const c = document.createElement('canvas');
    c.width = c.height = S;
    const g = c.getContext('2d');

    // سنگفرش پایه
    g.fillStyle = '#bcc0c9';
    g.fillRect(0, 0, S, S);

    const grassDots = (bx, by, bs, n) => {
      for (let i = 0; i < n; i++) {
        g.fillStyle = `rgba(${40 + rand() * 40 | 0},${110 + rand() * 50 | 0},40,${0.12 + rand() * 0.15})`;
        g.beginPath();
        g.arc(bx + rand() * bs, by + rand() * bs, 2 + rand() * 7, 0, 7);
        g.fill();
      }
    };

    // کف بلوک‌ها
    const tones = ['#ccd0d8', '#c3c8d3', '#d3d6de'];
    for (let col = -range; col <= range; col++) {
      for (let row = -range; row <= range; row++) {
        const bx = X(col * P - B / 2), by = Y(row * P - B / 2), bs = U(B);
        const kind = this.blockKind(col, row);
        if (kind === 'lawn') {
          g.fillStyle = '#5f9e46';
          g.fillRect(bx, by, bs, bs);
          grassDots(bx, by, bs, 130);
        } else if (kind === 'suburb') {
          // محله‌ی مسکونی: چمن حیاط‌ها + پیاده‌روی دور بلوک
          g.fillStyle = '#c9ccd2';
          g.fillRect(bx, by, bs, bs);
          const sw = U(0.7);
          g.fillStyle = '#72b052';
          g.fillRect(bx + sw, by + sw, bs - sw * 2, bs - sw * 2);
          grassDots(bx + sw, by + sw, bs - sw * 2, 90);
          // کوچه‌ی باریک وسط بلوک بین حیاط‌ها
          g.fillStyle = 'rgba(230,226,214,.55)';
          g.fillRect(bx + bs / 2 - U(0.35), by + sw, U(0.7), bs - sw * 2);
        } else {
          g.fillStyle = kind === 'core' ? '#ded7c5' : kind === 'commercial' ? '#c7cbd3' : tones[Math.abs(col * 3 + row * 7) % 3];
          g.fillRect(bx, by, bs, bs);
          // کاشی‌بندی ملایم
          g.strokeStyle = 'rgba(100,102,95,.14)';
          g.lineWidth = 2;
          for (let t = 1; t < 4; t++) {
            g.beginPath();
            g.moveTo(bx + (bs / 4) * t, by); g.lineTo(bx + (bs / 4) * t, by + bs);
            g.moveTo(bx, by + (bs / 4) * t); g.lineTo(bx + bs, by + (bs / 4) * t);
            g.stroke();
          }
          if (kind === 'core') { // میدان روشن زیر ساختمان اصلی
            g.fillStyle = 'rgba(255,250,232,.4)';
            const inset = U(1.35);
            g.fillRect(bx + inset, by + inset, bs - inset * 2, bs - inset * 2);
          }
        }
        // حاشیه‌ی پیاده‌رو (جدول)
        g.strokeStyle = 'rgba(255,255,255,.55)';
        g.lineWidth = U(0.32);
        g.strokeRect(bx + U(0.16), by + U(0.16), bs - U(0.32), bs - U(0.32));
        g.strokeStyle = 'rgba(70,72,66,.5)';
        g.lineWidth = 3;
        g.strokeRect(bx, by, bs, bs);
      }
    }

    // آسفالت خیابان‌ها
    const lines = [];
    for (let i = -range - 1; i <= range; i++) lines.push((i + 0.5) * P);
    g.fillStyle = '#525762';
    for (const l of lines) {
      g.fillRect(X(l - R / 2), 0, U(R), S);
      g.fillRect(0, Y(l - R / 2), S, U(R));
    }
    // بافت آسفالت
    for (let i = 0; i < 2600; i++) {
      g.fillStyle = `rgba(255,255,255,${0.02 + rand() * 0.04})`;
      g.fillRect(rand() * S, rand() * S, 2.5, 2.5);
    }

    // بازه‌های آزاد بین تقاطع‌ها (برای خط‌کشی تمیز)
    const spans = lines.map(l => [l - R / 2, l + R / 2]);
    const gaps = [];
    let cursor = -E / 2;
    for (const [a, b] of spans) { if (a > cursor) gaps.push([cursor, a]); cursor = Math.max(cursor, b); }
    if (cursor < E / 2) gaps.push([cursor, E / 2]);

    // خط کناری + خط‌چین وسط (فقط بین تقاطع‌ها)
    for (const l of lines) {
      for (const [g0, g1] of gaps) {
        if (g1 - g0 < 0.6) continue;
        g.fillStyle = 'rgba(242,243,245,.92)';
        g.fillRect(X(l - R / 2 + 0.2), Y(g0), U(0.14), U(g1 - g0));
        g.fillRect(X(l + R / 2 - 0.34), Y(g0), U(0.14), U(g1 - g0));
        g.fillRect(X(g0), Y(l - R / 2 + 0.2), U(g1 - g0), U(0.14));
        g.fillRect(X(g0), Y(l + R / 2 - 0.34), U(g1 - g0), U(0.14));
        g.fillStyle = '#f0f0ea';
        for (let d = g0 + 0.35; d + 1.05 < g1; d += 2.0) {
          g.fillRect(X(l - 0.09), Y(d), U(0.18), U(1.05));
          g.fillRect(X(d), Y(l - 0.09), U(1.05), U(0.18));
        }
      }
    }

    // خط عابر پیاده
    g.fillStyle = 'rgba(245,245,240,.92)';
    for (const lx of lines) for (const lz of lines) {
      if (Math.abs(lx) > 2.5 * P + 0.1 || Math.abs(lz) > 2.5 * P + 0.1) continue;
      const sw = (R - 0.8) / 4;
      for (let i = 0; i < 4; i++) {
        const off = -R / 2 + 0.4 + i * sw;
        g.fillRect(X(lx + off), Y(lz - R / 2 - 1.05), U(sw * 0.62), U(0.85));
        g.fillRect(X(lx + off), Y(lz + R / 2 + 0.2), U(sw * 0.62), U(0.85));
        g.fillRect(X(lx - R / 2 - 1.05), Y(lz + off), U(0.85), U(sw * 0.62));
        g.fillRect(X(lx + R / 2 + 0.2), Y(lz + off), U(0.85), U(sw * 0.62));
      }
    }

    // حاشیه‌ی شهر
    g.strokeStyle = '#8f9286';
    g.lineWidth = U(0.55);
    g.strokeRect(U(0.27), U(0.27), S - U(0.54), S - U(0.54));

    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = Math.min(8, this.world.renderer?.capabilities?.getMaxAnisotropy?.() || 4);
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(E, E),
      new THREE.MeshBasicMaterial({ map: tex }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = 0.02;
    ground.renderOrder = -990;
    this.group.add(ground);
  }

  // سایه‌ی نرم زیر مدل‌ها تا روی زمین بنشینند
  _shadowMaterial() {
    if (!this._shadowMat) {
      this._shadowMat = new THREE.MeshBasicMaterial({
        map: this.world.shadowTex, transparent: true, depthWrite: false,
      });
      this._shadowGeo = new THREE.PlaneGeometry(1, 1);
    }
    return this._shadowMat;
  }

  _blob(x, z, w, d, parent) {
    const mat = this._shadowMaterial();
    const m = new THREE.Mesh(this._shadowGeo, mat);
    m.rotation.x = -Math.PI / 2;
    m.scale.set(w, d, 1);
    m.position.set(x, parent ? -0.03 : 0.035, z);
    m.renderOrder = 2;
    (parent || this.group).add(m);
    return m;
  }

  // یک‌جا: همه‌ی سایه‌های یک دسته در یک InstancedMesh
  _blobs(list) {
    if (!list.length) return null;
    const mat = this._shadowMaterial();
    const inst = new THREE.InstancedMesh(this._shadowGeo, mat, list.length);
    list.forEach(([x, z, w, d], i) => {
      _e.set(-Math.PI / 2, 0, 0);
      _m4.compose(_v.set(x, 0.035, z), _q.setFromEuler(_e), _s.set(w, d, 1));
      inst.setMatrixAt(i, _m4);
    });
    inst.instanceMatrix.needsUpdate = true;
    inst.renderOrder = 2;
    inst.computeBoundingSphere();
    this.group.add(inst);
    return inst;
  }

  // ---------- ساختمان‌های اصلی + برچسب ----------
  // عکس‌ها ایزومتریک‌اند و پایین‌ترین پیکسلشان گوشه‌ی جلوی ساختمان است. اسپریت طوری
  // جابه‌جا می‌شود که «وسطِ کف» ساختمان دقیقاً وسط بلوک بیفتد و سایه‌ی تماس زیر کف
  // باشد (نه جلوی آن) — این‌طوری ساختمان روی زمین می‌نشیند، نه معلق در هوا.
  async _buildLandmarks() {
    const { P } = this;
    const labelBox = document.getElementById('labels');
    const sinP = this.world.pitchSin || 0.75;
    const onMap = LAYOUT.buildings.filter((b) => b.onMap !== false);
    await Promise.all(onMap.map(async (b, i) => {
      const x = b.col * P, z = b.row * P;
      const center = this._toWorld(x, z);
      let sp = null;
      let footDepth = 0;
      if (b.id !== 'garden') {
        const tex = this.world.loadTexture ? await this.world.loadTexture(b.tex) : null;
        const fd = b.fd ?? 0.5;
        footDepth = (fd * b.w) / sinP;             // عمق کف روی زمین
        sp = this.world.addSprite({
          tag: `building:${b.id}`, file: b.tex, texture: tex || undefined,
          x: center.x, z: center.z + footDepth / 2, y: 0.04, width: b.w, depthTest: true,
          shadow: { x: center.x, z: center.z, w: b.w * 1.02, d: footDepth * 1.1, opacity: 0.9 },
        });
      }
      if (labelBox) {
        const el = document.createElement('div');
        el.className = 'city-label';
        el.textContent = `${i + 1}. ${b.name}`;
        labelBox.appendChild(el);
        this.labels.push({ el, sp, x: center.x, z: center.z + footDepth / 2, h: 2.4 });
      }
    }));
  }

  _bench(x, z, rotY) {
    const g = new THREE.Group();
    const wood = new THREE.MeshStandardMaterial({ color: 0x8a5a2b });
    const seat = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.09, 0.42), wood);
    seat.position.y = 0.42;
    const back = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.42, 0.08), wood);
    back.position.set(0, 0.68, -0.2);
    const legL = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.42, 0.4), wood);
    legL.position.set(-0.48, 0.21, 0);
    const legR = legL.clone(); legR.position.x = 0.48;
    g.add(seat, back, legL, legR);
    g.position.set(x, 0.06, z);
    g.rotation.y = rotY;
    this.group.add(g);
    return g;
  }

  _buildGarden() {
    const { P, B } = this;
    const cx = -P, cz = P;
    const stone = new THREE.MeshStandardMaterial({ color: 0xb9b3a8 });
    const waterMat = new THREE.MeshBasicMaterial({ color: 0x57b7e8 });
    const hedgeMat = new THREE.MeshStandardMaterial({ color: 0x3e7d33 });

    const pathMat = new THREE.MeshBasicMaterial({ color: 0xe8dfc4 });
    const p1 = new THREE.Mesh(new THREE.PlaneGeometry(B - 1, 1.5), pathMat);
    p1.rotation.x = -Math.PI / 2; p1.position.set(cx, 0.045, cz); p1.renderOrder = -978;
    const p2 = new THREE.Mesh(new THREE.PlaneGeometry(1.5, B - 1), pathMat);
    p2.rotation.x = -Math.PI / 2; p2.position.set(cx, 0.045, cz); p2.renderOrder = -978;
    this.group.add(p1, p2);

    const half = B / 2 - 0.55;
    const hedgeGeoLong = new THREE.BoxGeometry(3.6, 0.62, 0.55);
    const hedgeGeoSide = new THREE.BoxGeometry(0.55, 0.62, 3.6);
    for (const sgn of [-1, 1]) {
      for (const off of [-2.9, 2.9]) {
        const hN = new THREE.Mesh(hedgeGeoLong, hedgeMat);
        hN.position.set(cx + off, 0.37, cz + sgn * half);
        const hS = new THREE.Mesh(hedgeGeoSide, hedgeMat);
        hS.position.set(cx + sgn * half, 0.37, cz + off);
        this.group.add(hN, hS);
      }
    }

    const base = new THREE.Mesh(new THREE.CylinderGeometry(1.25, 1.4, 0.4, 20), stone);
    base.position.set(cx, 0.26, cz);
    const water = new THREE.Mesh(new THREE.CircleGeometry(1.12, 20), waterMat);
    water.rotation.x = -Math.PI / 2;
    water.position.set(cx, 0.47, cz);
    const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.2, 0.75, 10), stone);
    pillar.position.set(cx, 0.8, cz);
    const topBall = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 10), stone);
    topBall.position.set(cx, 1.28, cz);
    this.group.add(base, water, pillar, topBall);
    base.userData = { type: 'building', id: 'building:garden' };
    this.world.clickables.push(base);
    this.fountainWater = water;

    this._bench(cx - 3.1, cz - 2.6, Math.PI / 5);
    this._bench(cx + 3.1, cz + 2.6, -Math.PI * 0.8);
    this._bench(cx + 3.0, cz - 3.0, -Math.PI / 4);

    const flowerGeo = new THREE.SphereGeometry(0.1, 8, 6);
    const colors = [0xff6b81, 0xffd166, 0xc77dff, 0xff8fab, 0xffffff];
    const flowers = new THREE.InstancedMesh(flowerGeo, new THREE.MeshStandardMaterial({ color: 0xffffff }), 64);
    for (let i = 0; i < 64; i++) {
      let fx, fz;
      do { fx = cx + (rand() - 0.5) * (B - 2); fz = cz + (rand() - 0.5) * (B - 2); }
      while (Math.abs(fx - cx) < 1.7 && Math.abs(fz - cz) < 1.7);
      _m4.makeTranslation(fx, 0.16, fz);
      flowers.setMatrixAt(i, _m4);
      flowers.setColorAt(i, _c.setHex(pickOf(colors)));
    }
    this.group.add(flowers);
  }

  _lawnPaths(cx, cz, len, w) {
    const pathMat = new THREE.MeshBasicMaterial({ color: 0xe8dfc4 });
    const p1 = new THREE.Mesh(new THREE.PlaneGeometry(len, w), pathMat);
    p1.rotation.x = -Math.PI / 2; p1.position.set(cx, 0.045, cz); p1.renderOrder = -978;
    const p2 = new THREE.Mesh(new THREE.PlaneGeometry(w, len), pathMat);
    p2.rotation.x = -Math.PI / 2; p2.position.set(cx, 0.045, cz); p2.renderOrder = -978;
    this.group.add(p1, p2);
  }

  _buildGreenSquare() {
    const { P } = this;
    const cx = 0, cz = -P;
    this._lawnPaths(cx, cz, 9, 1.4);
    this._bench(cx - 2.8, cz + 2.4, Math.PI / 6);
    this._bench(cx + 2.8, cz - 2.4, -Math.PI * 0.85);
  }

  // پارک کوچک جلوی تالار (جای تابلوی قبلی): چمن، مسیر، نیمکت — درخت‌ها و سنگ‌ها در _buildNature
  _buildPocketPark() {
    const { P } = this;
    const cx = 0, cz = P;
    this._lawnPaths(cx, cz, 9, 1.3);
    this._bench(cx - 2.6, cz - 2.5, Math.PI / 4);
    this._bench(cx + 2.6, cz - 2.5, -Math.PI / 4);
    this._bench(cx - 2.6, cz + 2.5, Math.PI * 0.75);
    this._bench(cx + 2.6, cz + 2.5, -Math.PI * 0.75);
    // حوضچه‌ی کوچک وسط پارک
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 1.05, 0.3, 18),
      new THREE.MeshStandardMaterial({ color: 0xb9b3a8 }));
    rim.position.set(cx, 0.2, cz);
    const water = new THREE.Mesh(new THREE.CircleGeometry(0.82, 18), new THREE.MeshBasicMaterial({ color: 0x57b7e8 }));
    water.rotation.x = -Math.PI / 2;
    water.position.set(cx, 0.36, cz);
    this.group.add(rim, water);
  }

  // ---------- مدل‌ها ----------
  _loadGLB(path) {
    return new Promise((resolve, reject) => {
      this.loader.load(path, (g) => resolve(g.scene), undefined, reject);
    });
  }

  // مدل آماده‌ی اینستنس: قطعات مش + ماتریس محلی و جعبه‌ی مدل (کش می‌شود)
  async _model(path) {
    if (this._modelCache.has(path)) return this._modelCache.get(path);
    const p = (async () => {
      let scene = null;
      try { scene = await this._loadGLB(assetUrl(path)); } catch (e) { return null; }
      scene.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(scene);
      const parts = [];
      scene.traverse((o) => {
        if (!o.isMesh) return;
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of mats) if (m && m.map) m.map.anisotropy = 4;
        parts.push({ geo: o.geometry, mat: o.material, m: o.matrixWorld.clone() });
      });
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      if (!size.x || !size.y || !parts.length) return null;
      return { scene, box, parts, size, center };
    })();
    this._modelCache.set(path, p);
    return p;
  }

  // مقیاس یک آیتم: یا مقیاس ثابت، یا برازش داخل foot × maxH
  _itemScale(model, it) {
    if (it.scale) return it.scale;
    return Math.min((it.foot || 99) / Math.max(model.size.x, model.size.z), (it.maxH || 99) / model.size.y);
  }

  // ماتریس قرارگیری: مدل روی زمین و وسط می‌نشیند، مقیاس می‌گیرد، می‌چرخد و به (x,z) می‌رود
  _placeMatrix(model, it, out) {
    const s = this._itemScale(model, it);
    _e.set(0, it.rot || 0, 0);
    out.compose(_v.set(it.x, it.y ?? 0.06, it.z), _q.setFromEuler(_e), _s.set(s, s, s));
    out.multiply(_m4b.makeTranslation(-model.center.x, -model.box.min.y, -model.center.z));
    return out;
  }

  // همه‌ی نمونه‌های یک مدل در یک (چند) InstancedMesh
  _spawn(model, items) {
    const n = items.length;
    if (!model || !n) return [];
    const mats = items.map((it) => this._placeMatrix(model, it, new THREE.Matrix4()));
    const out = [];
    for (const part of model.parts) {
      const inst = new THREE.InstancedMesh(part.geo, part.mat, n);
      for (let i = 0; i < n; i++) {
        inst.setMatrixAt(i, _m4.multiplyMatrices(mats[i], part.m));
        if (items[i].tint != null) inst.setColorAt(i, _c.setHex(items[i].tint));
      }
      inst.instanceMatrix.needsUpdate = true;
      if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
      inst.computeBoundingSphere();
      this.group.add(inst);
      out.push(inst);
    }
    return out;
  }

  // یک نسخه‌ی تکی (برای ماشین‌ها که جداگانه حرکت می‌کنند)
  _normalized(scene, targetFoot, maxH) {
    const wrap = new THREE.Group();
    wrap.add(scene);
    const box = new THREE.Box3().setFromObject(scene);
    const size = box.getSize(new THREE.Vector3());
    if (!size.x || !size.y) return wrap;
    const s = Math.min(targetFoot / Math.max(size.x, size.z), maxH / size.y);
    scene.scale.setScalar(s);
    const c = box.getCenter(new THREE.Vector3());
    scene.position.set(-c.x * s, -box.min.y * s, -c.z * s);
    return wrap;
  }

  // ساختمان جایگزین ساده اگر مدلی لود نشد (شهر هیچ‌وقت خالی نمی‌ماند)
  _fallbackBuilding(foot, maxH) {
    if (!this._winTex) {
      const c = document.createElement('canvas');
      c.width = 128; c.height = 256;
      const g = c.getContext('2d');
      g.fillStyle = '#f0e9db'; g.fillRect(0, 0, 128, 256);
      g.fillStyle = '#42566b';
      for (let r = 0; r < 8; r++) for (let col = 0; col < 4; col++) {
        if (rand() < 0.18) continue;
        g.fillRect(10 + col * 30, 14 + r * 30, 20, 20);
      }
      this._winTex = new THREE.CanvasTexture(c);
      this._winTex.colorSpace = THREE.SRGBColorSpace;
    }
    const h = maxH * (0.55 + rand() * 0.4);
    const w = foot * 0.8;
    const grp = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(w, h, w),
      new THREE.MeshStandardMaterial({ map: this._winTex, color: pickOf([0xffffff, 0xf3e2c2, 0xd8e2e8, 0xe8d0c0]) }),
    );
    body.position.y = h / 2;
    const roof = new THREE.Mesh(
      new THREE.BoxGeometry(w * 1.05, 0.22, w * 1.05),
      new THREE.MeshStandardMaterial({ color: 0x5a5e66 }),
    );
    roof.position.y = h + 0.1;
    grp.add(body, roof);
    return grp;
  }

  // ---------- محله‌های مسکونی (Kenney City Kit Suburban) ----------
  async _buildSuburbs() {
    const { P } = this;
    const K = CITY.suburbScale;
    const base = CITY.suburbBase;
    const plan = new Map();               // name -> items
    const put = (name, it) => { if (!plan.has(name)) plan.set(name, []); plan.get(name).push(it); };
    const blobs = [];
    this.yardTreeSpots = [];              // درخت‌های حیاط (در _buildNature کاشته می‌شوند)
    const houseTints = [0xffffff, 0xffffff, 0xffffff, 0xfbf0dc, 0xe8eef5, 0xf6e3d9, 0xe9f2e0];

    for (let c = -CITY.range; c <= CITY.range; c++) {
      for (let r = -CITY.range; r <= CITY.range; r++) {
        if (this.blockKind(c, r) !== 'suburb') continue;
        const cx = c * P, cz = r * P;
        // چهار قطعه‌ی ۵×۵ در هر بلوک؛ هر خانه رو به خیابانِ نزدیکش
        for (const lx of [-2.55, 2.55]) {
          for (const lz of [-2.55, 2.55]) {
            const face = lz < 0 ? -1 : 1;                // خیابان در این سمت
            const side = lx < 0 ? -1 : 1;                // سمت بیرونی قطعه
            const hx = cx + lx + (rand() - 0.5) * 0.3;
            const hz = cz + lz - face * 0.95;            // خانه عقبِ قطعه، حیاط جلو
            const rot = face < 0 ? 0 : Math.PI;          // مدل‌ها رو به -z ساخته شده‌اند
            const name = pickOf(CITY.houses);
            put(name, { x: hx, z: hz, rot, scale: K, tint: pickOf(houseTints) });
            blobs.push([hx, hz, 4.6, 3.9]);
            // راه ماشین‌رو (دو قطعه تا خیابان) و مسیر پیاده تا در خانه
            const dwx = hx + side * 1.45;
            put('driveway-long', { x: dwx, z: cz + face * 3.75, rot, scale: K, y: 0.05 });
            put('driveway-long', { x: dwx, z: cz + face * 4.95, rot, scale: K, y: 0.05 });
            put(rand() < 0.5 ? 'path-long' : 'path-stones-long', { x: hx - side * 0.35, z: cz + face * 3.75, rot, scale: K, y: 0.05 });
            // نرده‌ی چوبی لب حیاط (با جای خالی برای ماشین‌رو)
            const fz = cz + face * 4.4;
            for (const fx of [-2.0, -0.55, 0.9]) {
              const px = hx - side * 0.2 + (side < 0 ? -fx : fx);
              if (Math.abs(px - dwx) < 0.95) continue;
              put('fence', { x: px, z: fz, rot, scale: K, y: 0.05 });
            }
            // گلدان جلوی در یا باغچه‌ی کنار خانه
            if (rand() < 0.45) put('planter', { x: hx - side * 1.6, z: cz + face * 3.4, rot: rot + (rand() < 0.5 ? 0 : Math.PI / 2), scale: K, y: 0.05 });
            // درخت حیاط
            if (rand() < 0.75) this.yardTreeSpots.push([hx + side * 2.15, hz + face * (rand() * 1.2 - 0.2)]);
            if (rand() < 0.35) this.yardTreeSpots.push([hx - side * 1.9 + (rand() - 0.5) * 0.6, hz - face * 1.9]);
          }
        }
        // ماشین پارک‌شده در بعضی ماشین‌روها (در _buildCars)
      }
    }

    this._blobs(blobs);
    let placed = 0;
    await Promise.allSettled([...plan.entries()].map(async ([name, items]) => {
      const model = await this._model(base + name + '.glb');
      if (!model) {
        if (name.startsWith('building')) {
          for (const it of items) {
            const obj = this._fallbackBuilding(4.2, 3.6);
            obj.position.set(it.x, 0.06, it.z);
            obj.rotation.y = it.rot;
            this.group.add(obj);
          }
        }
        return;
      }
      this._spawn(model, items);
      placed += items.length;
    }));
    this.suburbCount = placed;
  }

  // ---------- مرکز شهر و خط آسمان (Kenney City Kit Commercial) ----------
  // هر بلوک دو ردیف ساختمان رو به خیابان‌های شمالی/جنوبی دارد که با پهنای واقعی مدل‌ها
  // کنار هم چیده می‌شوند؛ ردیف پشتی شهر (شمال) برج و آسمان‌خراش می‌گیرد.
  async _buildCommercial() {
    const { P } = this;
    const K = CITY.commercialScale;
    const base = CITY.commercialBase;
    const names = [...CITY.shops, ...CITY.towers];
    const models = {};
    await Promise.allSettled(names.map(async (n) => { models[n] = await this._model(base + n + '.glb'); }));
    const have = (list) => list.filter((n) => models[n]);
    const shops = have(CITY.shops), towers = have(CITY.towers);
    if (!shops.length && !towers.length) return;

    const plan = new Map();
    const put = (name, it) => { if (!plan.has(name)) plan.set(name, []); plan.get(name).push(it); };
    const blobs = [];
    const tints = [0xffffff, 0xffffff, 0xffffff, 0xf4ebdc, 0xe4ebf3, 0xf1dfd6];
    const HALF = 4.75;          // لبه‌ی ساختمان‌ها (داخل پیاده‌رو)
    let placed = 0;

    for (let c = -CITY.range; c <= CITY.range; c++) {
      for (let r = -CITY.range; r <= CITY.range; r++) {
        if (this.blockKind(c, r) !== 'commercial') continue;
        const cx = c * P, cz = r * P;
        const back = r === -CITY.range;              // ردیف پشتی شهر: برج‌ها
        for (const face of [-1, 1]) {
          // ردیف رو به خیابانِ face؛ از چپ به راست با پهنای واقعی پر می‌شود
          let x = -HALF + 0.15 + rand() * 0.4;
          let guard = 0;
          while (x < HALF - 1.6 && guard++ < 12) {
            const towerP = back ? (face < 0 ? 0.75 : 0.45) : (r === -2 && face < 0 ? 0.3 : 0.12);
            const pool = rand() < towerP && towers.length ? towers : shops;
            const name = pickOf(pool);
            const m = models[name];
            const w = m.size.x * K, d = Math.min(m.size.z * K, 4.6);
            if (x + w > HALF + 0.2) { // جا نشد: یک مدل باریک‌تر امتحان کن
              const slim = shops.map((n) => [n, models[n].size.x * K]).filter(([, ww]) => x + ww <= HALF + 0.2);
              if (!slim.length) break;
              const [n2] = pickOf(slim);
              const m2 = models[n2];
              const w2 = m2.size.x * K, d2 = Math.min(m2.size.z * K, 4.6);
              const bx = cx + x + w2 / 2, bz = cz + face * (HALF - d2 / 2);
              put(n2, { x: bx, z: bz, rot: face < 0 ? 0 : Math.PI, scale: K, tint: pickOf(tints) });
              blobs.push([bx, bz, w2 * 1.1, d2 * 1.1]);
              placed++;
              break;
            }
            const bx = cx + x + w / 2, bz = cz + face * (HALF - d / 2);
            put(name, { x: bx, z: bz, rot: face < 0 ? 0 : Math.PI, scale: K, tint: pickOf(tints) });
            blobs.push([bx, bz, w * 1.1, d * 1.1]);
            placed++;
            x += w + 0.25 + rand() * 0.35;
          }
          // چتر آفتابی کافه روی پیاده‌رو جلوی مغازه‌ها
          if (rand() < 0.6) {
            const px = cx + (rand() - 0.5) * 7;
            const pz = cz + face * (HALF + 0.45);
            put(rand() < 0.5 ? 'detail-parasol-a' : 'detail-parasol-b', { x: px, z: pz, rot: rand() * 6.28, scale: K, y: 0.05 });
            put(rand() < 0.5 ? 'detail-parasol-a' : 'detail-parasol-b', { x: px + 1.3, z: pz, rot: rand() * 6.28, scale: K, y: 0.05 });
          }
        }
      }
    }

    this._blobs(blobs);
    await Promise.allSettled([...plan.entries()].map(async ([name, items]) => {
      const model = models[name] || await this._model(base + name + '.glb');
      if (!model) return;
      this._spawn(model, items);
    }));
    this.commercialCount = placed;
  }

  // ---------- حاشیه‌ی صنعتی (Kenney City Kit Industrial) ----------
  async _buildIndustrial() {
    const { P } = this;
    const base = CITY.cityBase;
    const plan = [];
    const add = (name, x, z, foot, maxH, rot) => plan.push({ name, x, z, foot, maxH, rot });
    const faceRot = (c, r) => {
      const b = Math.abs(c) > Math.abs(r) ? Math.PI / 2 : 0;
      return b + (rand() < 0.5 ? Math.PI : 0);
    };
    for (let c = -CITY.range; c <= CITY.range; c++) {
      for (let r = -CITY.range; r <= CITY.range; r++) {
        const kind = this.blockKind(c, r);
        const x = c * P, z = r * P;
        if (kind === 'water') {
          add('water-tower', x - 1.5, z - 1, 5.5, 10, 0.4);
          add('detail-tank', x + 2.6, z + 2.2, 3.2, 3.6, 0);
          add('detail-tank-large', x + 2.2, z - 2.6, 3.6, 4.2, 0);
          continue;
        }
        if (kind === 'containers') {
          add('shipping-container-a', x - 1.8, z - 1.4, 4.8, 3, 0.15);
          add('shipping-container-b', x + 1.6, z + 1.2, 4.8, 3, -0.1);
          add('shipping-container-c', x + 2.2, z - 2.4, 4.8, 3, 1.65);
          add('windmill', x - 3.4, z + 2.8, 3.4, 7, 0.3);
          continue;
        }
        if (kind !== 'industrial') continue;
        const roll = rand();
        if (roll < 0.42) {
          add(pickOf(CITY.filler), x, z - 0.8, 8.3, 8.4, faceRot(c, r));
          if (rand() < 0.5) add(pickOf(CITY.filler), x + 3.1, z + 3.2, 3.9, 4.6, faceRot(c, r) + Math.PI / 2);
        } else if (roll < 0.78) {
          add(pickOf(CITY.filler), x - 2.55, z - 1.4, 4.7, 6.2, faceRot(c, r));
          add(pickOf(CITY.filler), x + 2.55, z - 1.4, 4.7, 6.2, faceRot(c, r));
          add(pickOf(CITY.filler), x - 1.4, z + 2.9, 4.3, 5, faceRot(c, r) + Math.PI);
        } else {
          add(pickOf(['shipping-container-a', 'shipping-container-b', 'shipping-container-c']), x - 2.2, z + 1.8, 4.6, 3.2, rand() * 0.5 - 0.25);
          add(pickOf(['detail-tank', 'detail-tank-large']), x + 3.2, z + 2.4, 3.1, 3.8, 0);
          add(pickOf(CITY.filler), x + 0.6, z - 2.2, 6.4, 7, faceRot(c, r));
        }
      }
    }

    const byName = new Map();
    for (const it of plan) {
      if (!byName.has(it.name)) byName.set(it.name, []);
      byName.get(it.name).push(it);
    }
    const tints = [0xffffff, 0xffffff, 0xf7ead2, 0xdfe9ee, 0xf3ddcb, 0xe6eedd];
    const blobs = [];
    const roof = { 'chimney-basic': [], 'chimney-medium': [], 'solar-panel-flat': [], 'solar-panel-landscape': [] };
    const roofNames = Object.keys(roof);

    await Promise.allSettled([...byName.entries()].map(async ([name, items]) => {
      const model = await this._model(base + name + '.glb');
      if (!model) {
        for (const it of items) {
          const obj = this._fallbackBuilding(it.foot, it.maxH);
          obj.position.set(it.x, 0.06, it.z);
          obj.rotation.y = it.rot;
          this.group.add(obj);
          blobs.push([it.x, it.z + it.foot * 0.06, it.foot * 1.04, it.foot * 0.66]);
        }
        return;
      }
      for (const it of items) {
        it.tint = pickOf(tints);
        blobs.push([it.x, it.z + it.foot * 0.06, it.foot * 1.04, it.foot * 0.66]);
        // گاهی دودکش یا پنل خورشیدی روی بام (مثل تصویر Kenney)
        if (it.foot >= 4.5 && rand() < 0.42) {
          const s = this._itemScale(model, it);
          const top = 0.06 + model.size.y * s;
          if (top > 1.2) {
            const propName = pickOf(roofNames);
            const isChimney = propName.startsWith('chimney');
            const ox = (rand() - 0.5) * it.foot * 0.4, oz = (rand() - 0.5) * it.foot * 0.4;
            const cr = Math.cos(it.rot), sr = Math.sin(it.rot);
            roof[propName].push({
              x: it.x + ox * cr + oz * sr, z: it.z - ox * sr + oz * cr, y: top - 0.04,
              rot: isChimney ? 0 : (rand() < 0.5 ? 0 : Math.PI / 2),
              foot: isChimney ? 0.85 : 2.1, maxH: isChimney ? 1.7 : 0.6,
            });
          }
        }
      }
      this._spawn(model, items);
    }));
    this._blobs(blobs);
    await Promise.allSettled(roofNames.map(async (n) => {
      if (!roof[n].length) return;
      const model = await this._model(base + n + '.glb');
      this._spawn(model, roof[n]);
    }));
  }

  // ---------- ماشین‌ها ----------
  async _buildCars() {
    const { P, B } = this;
    const loops = [0.5 * P, 1.5 * P, 2.5 * P, 3.5 * P];
    const SPEED = (n) => (/kart/.test(n) ? 7 + rand() * 2.5
      : /race/.test(n) ? 8.5 + rand() * 2.5
      : /tractor/.test(n) ? 2.6
      : /truck|van|firetruck|garbage|delivery|suv/.test(n) ? 3.6 + rand() * 1.3
      : 4.6 + rand() * 2.4);
    const TWICE = new Set(['sedan', 'taxi', 'suv', 'hatchback-sports', 'van', 'sedan-sports', 'suv-luxury']);
    // ماشین موضوعی جلوی هر ساختمان اصلی
    const THEMED = [
      { car: 'ambulance', col: -1, row: -1, dx: -2.4 },     // جلوی مطب دکتر نیلا
      { car: 'police', col: 1, row: -1, dx: 2.4 },          // جلوی شورای شهر
      { car: 'firetruck', col: 0, row: 0, dx: 3.6 },        // جلوی تالار اصلی
      { car: 'taxi', col: 1, row: 0, dx: -2.6 },            // جلوی سینما
      { car: 'garbage-truck', col: -1, row: 0, dx: 3.2 },   // کنار کلاب ورزشی
      { car: 'race', col: 0, row: 1, dx: 3.4 },             // کنار پارک
      { car: 'delivery', col: 1, row: 1, dx: -2.8 },        // جلوی خونه یوزر
      { car: 'tractor', col: -1, row: 1, dx: 3.6 },         // کنار باغچه
    ];
    const CAR_LEN = (name) => (/kart/.test(name) ? 1.3 : /truck|firetruck|garbage|delivery|van/.test(name) ? 2.4 : 2.0);

    const scenes = {};
    const makeCar = (scene, name, i) => {
      const obj = this._normalized(scene.clone(true), CAR_LEN(name), 9);
      obj.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(obj);
      const inner = new THREE.Group();
      inner.add(obj);
      obj.position.set(-(box.min.x + box.max.x) / 2, -box.min.y, -(box.min.z + box.max.z) / 2);
      const wheels = [];
      let wheelR = 0.2;
      inner.traverse((o) => {
        if ((o.name || '').startsWith('wheel')) {
          wheels.push(o);
          const wb = new THREE.Box3().setFromObject(o);
          wheelR = Math.max(0.05, (wb.max.y - wb.min.y) / 2);
        }
      });
      const g = new THREE.Group();
      g.add(inner);
      this.group.add(g);
      const h = /kart/.test(name) ? loops[0] : loops[i % loops.length];
      const per = 8 * h;
      this.cars.push({
        obj: g, wheels, wheelR, h,
        dist: per / CITY.cars.length * i + rand() * 6,
        angle: 0,
        speed: SPEED(name),
        dir: i % 2 === 0 ? 1 : -1,
        lane: this.R / 4 - 0.12,
      });
    };
    const parkedBlobs = [];
    const makeParked = (scene, x, z, rot, name = 'sedan') => {
      const obj = this._normalized(scene.clone(true), CAR_LEN(name), 9);
      obj.position.set(x, 0.05, z);
      obj.rotation.y = rot;
      this.group.add(obj);
      parkedBlobs.push([x, z, 2.2, 3.4]);
    };

    await Promise.allSettled(CITY.cars.map(async (name, i) => {
      let scene = null;
      try { scene = await this._loadGLB(assetUrl(CITY.carBase + name + '.glb')); } catch (e) { return; }
      scenes[name] = scene;
      makeCar(scene, name, i);
      if (TWICE.has(name)) makeCar(scene, name, i + 3 + CITY.cars.length);
    }));

    for (const t of THEMED) {
      if (!scenes[t.car]) continue;
      makeParked(scenes[t.car], t.col * P + t.dx, t.row * P + B / 2 - 1.6, t.dx > 0 ? -0.1 : 0.1, t.car);
    }
    // ماشین‌های پارک‌شده در ماشین‌روی خانه‌ها
    const family = ['sedan', 'suv', 'hatchback-sports', 'van', 'sedan-sports', 'suv-luxury'].filter((n) => scenes[n]);
    if (family.length) {
      for (let c = -CITY.range; c <= CITY.range; c++) {
        for (let r = -CITY.range; r <= CITY.range; r++) {
          if (this.blockKind(c, r) !== 'suburb') continue;
          for (const lx of [-2.55, 2.55]) {
            for (const lz of [-2.55, 2.55]) {
              if (rand() > 0.4) continue;
              const face = lz < 0 ? -1 : 1, side = lx < 0 ? -1 : 1;
              const x = c * P + lx + side * 1.45, z = r * P + face * 4.3;
              makeParked(scenes[pickOf(family)], x, z, (face < 0 ? 0 : Math.PI) + (rand() - 0.5) * 0.08, 'sedan');
            }
          }
        }
      }
    }
    if (scenes.van) makeParked(scenes.van, 3 * P - 3.2, -3 * P + B / 2 - 1.4, Math.PI + 0.05, 'van');
    this._blobs(parkedBlobs);

    // مخروط‌های راهنمایی از پکیج ماشین
    try {
      const cone = await this._loadGLB(assetUrl(CITY.carBase + 'cone.glb'));
      [[0.5 * P + 1.1, -0.5 * P], [0.5 * P + 1.1, -0.5 * P + 1.3], [-1.5 * P - 1.1, 0.5 * P], [-1.5 * P - 1.1, 0.5 * P - 1.3]]
        .forEach(([x, z]) => {
          const o = this._normalized(cone.clone(true), 0.34, 9);
          o.position.set(x, 0.05, z);
          this.group.add(o);
        });
    } catch (e) { /* ok */ }
  }

  // ---------- درخت‌ها، سنگ‌ها و علف (Kenney Survival Kit — همان پکیج محصول قبلی) ----------
  async _buildNature() {
    const { P, R } = this;
    const street = [];
    // ردیف‌های منظم درخت در دو طرف هر خیابان
    for (const l of [-2.5, -1.5, -0.5, 0.5, 1.5, 2.5]) {
      const line = l * P;
      let k = 0;
      for (let t = -3 * P + 2; t <= 3 * P - 1.5; t += 3.9, k++) {
        const off = (k % 2) * 1.95;
        street.push([line - R / 2 - 0.75, t + off]);
        street.push([line + R / 2 + 0.75, t + 1.95 - off]);
        street.push([t + off, line - R / 2 - 0.75]);
        street.push([t + 1.95 - off, line + R / 2 + 0.75]);
      }
    }
    // حلقه‌ی درخت روی چمن بیرون شهر
    const outer = [];
    for (let i = 0; i < 70; i++) {
      const a = rand() * Math.PI * 2;
      const rad = CITY.half + 7 + rand() * 18;
      outer.push([Math.cos(a) * rad, Math.sin(a) * rad]);
    }
    // درخت‌های پارک‌ها (سه فضای سبز هسته)
    const parks = [];
    for (const [cx, cz] of [[0, -P], [0, P], [-P, P]]) {
      for (const [dx, dz] of [[-3.6, -3.6], [3.6, -3.6], [-3.6, 3.6], [3.6, 3.6], [-3.9, 0.9], [3.9, -0.9], [0.9, 3.9], [-0.9, -3.9]]) {
        parks.push([cx + dx + (rand() - 0.5) * 0.5, cz + dz + (rand() - 0.5) * 0.5]);
      }
    }
    const yard = this.yardTreeSpots || [];

    // توزیع بین چهار مدل درخت: خیابان‌ها درخت سبز، حیاط‌ها و پارک‌ها مخلوط با پاییزی
    const variants = {
      'tree': { h: 1.9, items: [] },
      'tree-tall': { h: 2.45, items: [] },
      'tree-autumn': { h: 1.85, items: [] },
      'tree-autumn-tall': { h: 2.35, items: [] },
    };
    const addTree = (name, [x, z], i) => {
      const v = variants[name];
      v.items.push({ x, z, y: 0.03, rot: ((i * 137) % 360) * Math.PI / 180, maxH: v.h * (0.9 + ((i * 29) % 10) * 0.025) });
    };
    street.forEach((sp, i) => addTree(i % 2 ? 'tree-tall' : 'tree', sp, i));
    outer.forEach((sp, i) => addTree(['tree', 'tree-tall', 'tree-autumn', 'tree-tall'][i % 4], sp, i + 7));
    parks.forEach((sp, i) => addTree(['tree-autumn', 'tree', 'tree-autumn-tall', 'tree-tall'][i % 4], sp, i + 3));
    yard.forEach((sp, i) => addTree(['tree', 'tree-autumn', 'tree-tall', 'tree', 'tree-autumn-tall'][i % 5], sp, i + 11));

    let anyModel = false;
    const blobs = [];
    await Promise.allSettled(Object.entries(variants).map(async ([name, v]) => {
      if (!v.items.length) return;
      const model = await this._model(CITY.natureBase + name + '.glb');
      if (!model) return;
      anyModel = true;
      this._spawn(model, v.items);
      for (const it of v.items) blobs.push([it.x, it.z, 1.1, 0.8]);
    }));
    this.treeCount = anyModel ? Object.values(variants).reduce((n, v) => n + v.items.length, 0) : 0;

    // سنگ و علف در پارک‌ها و حاشیه‌ی شهر
    const rocks = [], grass = [];
    for (const [cx, cz] of [[0, -P], [0, P], [-P, P]]) {
      for (let i = 0; i < 4; i++) rocks.push({ x: cx + (rand() - 0.5) * 8.5, z: cz + (rand() - 0.5) * 8.5, y: 0.03, rot: rand() * 6.28, foot: 0.5 + rand() * 0.4 });
      for (let i = 0; i < 14; i++) grass.push({ x: cx + (rand() - 0.5) * 9, z: cz + (rand() - 0.5) * 9, y: 0.03, rot: rand() * 6.28, scale: 1.2 + rand() * 0.8 });
    }
    for (let i = 0; i < 26; i++) {
      const a = rand() * Math.PI * 2, rad = CITY.half + 5 + rand() * 22;
      rocks.push({ x: Math.cos(a) * rad, z: Math.sin(a) * rad, y: 0, rot: rand() * 6.28, foot: 0.7 + rand() * 0.9 });
    }
    for (let i = 0; i < 60; i++) {
      const a = rand() * Math.PI * 2, rad = CITY.half + 4 + rand() * 24;
      grass.push({ x: Math.cos(a) * rad, z: Math.sin(a) * rad, y: 0, rot: rand() * 6.28, scale: 1.4 + rand() * 1.2 });
    }
    await Promise.allSettled([
      ...['rock-a', 'rock-b', 'rock-c'].map(async (n, k) => {
        const model = await this._model(CITY.natureBase + n + '.glb');
        this._spawn(model, rocks.filter((_, i) => i % 3 === k));
      }),
      ...['grass', 'grass-large'].map(async (n, k) => {
        const model = await this._model(CITY.natureBase + n + '.glb');
        this._spawn(model, grass.filter((_, i) => i % 2 === k));
      }),
    ]);

    if (!anyModel) {
      // جایگزین: درخت‌های کاجی ساده
      const spots = [...street, ...outer, ...parks, ...yard];
      const trunkG = new THREE.CylinderGeometry(0.07, 0.1, 0.5, 6);
      const crownG = new THREE.ConeGeometry(0.55, 1.4, 8);
      const trunkM = new THREE.MeshLambertMaterial({ color: 0x7a5a3e });
      const crownM = new THREE.MeshLambertMaterial({ color: 0x4e8c3f });
      const trunks = new THREE.InstancedMesh(trunkG, trunkM, spots.length);
      const crowns = new THREE.InstancedMesh(crownG, crownM, spots.length);
      const dummy = new THREE.Object3D();
      spots.forEach(([x, z], i) => {
        dummy.rotation.set(0, 0, 0);
        dummy.scale.setScalar(0.9 + ((i * 17) % 10) * 0.06);
        dummy.position.set(x, 0.25, z);
        dummy.updateMatrix();
        trunks.setMatrixAt(i, dummy.matrix);
        dummy.position.set(x, 1.05, z);
        dummy.updateMatrix();
        crowns.setMatrixAt(i, dummy.matrix);
      });
      this.group.add(trunks, crowns);
    }
    this._blobs(blobs);
  }

  // ---------- چراغ‌های خیابان ----------
  _buildLamps() {
    const { P, R } = this;
    const dummy = new THREE.Object3D();
    const poleG = new THREE.CylinderGeometry(0.045, 0.06, 1.9, 6);
    const headG = new THREE.SphereGeometry(0.13, 8, 6);
    const poleM = new THREE.MeshLambertMaterial({ color: 0x3f4652 });
    const headM = new THREE.MeshBasicMaterial({ color: 0xfff3c4 });
    const lampAt = [];
    for (const l of [-2.5, -1.5, -0.5, 0.5, 1.5, 2.5]) {
      for (const m of [-2.5, -1.5, -0.5, 0.5, 1.5, 2.5]) {
        lampAt.push([l * P + R / 2 + 0.5, m * P + R / 2 + 0.5]);
        lampAt.push([l * P - R / 2 - 0.5, m * P - R / 2 - 0.5]);
      }
    }
    const poles = new THREE.InstancedMesh(poleG, poleM, lampAt.length);
    const heads = new THREE.InstancedMesh(headG, headM, lampAt.length);
    lampAt.forEach(([x, z], i) => {
      dummy.rotation.set(0, 0, 0);
      dummy.scale.setScalar(1);
      dummy.position.set(x, 0.95, z);
      dummy.updateMatrix();
      poles.setMatrixAt(i, dummy.matrix);
      dummy.position.set(x, 1.95, z);
      dummy.updateMatrix();
      heads.setMatrixAt(i, dummy.matrix);
    });
    this.group.add(poles, heads);
  }

  // ---------- آدمک‌ها ----------
  _person() {
    const skin = pickOf([0xf2c69d, 0xe0ac82, 0xc98d64, 0x9c6b4a]);
    const shirt = pickOf([0xe5484d, 0x3a86ff, 0x57b83e, 0xffb703, 0x9b5de5, 0x00b4d8, 0xff70a6, 0xf77f00]);
    const pants = pickOf([0x355070, 0x6d597a, 0x403d39, 0x5f6c37]);
    const hair = pickOf([0x2b2b2b, 0x5b3a1a, 0x8a5a2b, 0xd9b166, 0x777777]);
    const mat = (c) => new THREE.MeshStandardMaterial({ color: c });
    const g = new THREE.Group();
    const legGeo = new THREE.BoxGeometry(0.11, 0.44, 0.13);
    legGeo.translate(0, -0.22, 0);
    const legL = new THREE.Mesh(legGeo, mat(pants)); legL.position.set(-0.09, 0.46, 0);
    const legR = new THREE.Mesh(legGeo, mat(pants)); legR.position.set(0.09, 0.46, 0);
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.42, 0.2), mat(shirt));
    torso.position.y = 0.68;
    const armGeo = new THREE.BoxGeometry(0.09, 0.38, 0.11);
    armGeo.translate(0, -0.17, 0);
    const armL = new THREE.Mesh(armGeo, mat(shirt)); armL.position.set(-0.24, 0.86, 0);
    const armR = new THREE.Mesh(armGeo, mat(shirt)); armR.position.set(0.24, 0.86, 0);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.15, 12, 10), mat(skin));
    head.position.y = 1.03;
    const hairM = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat(hair));
    hairM.position.y = 1.05;
    g.add(legL, legR, torso, armL, armR, head, hairM);
    g.scale.setScalar(0.92);
    return { g, legL, legR, armL, armR };
  }

  _buildPedestrians() {
    const { P, B } = this;
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
    ];
    for (const L of loops) {
      for (let i = 0; i < L.n; i++) {
        const p = this._person();
        this.group.add(p.g);
        this.peds.push({
          ...p, cx: L.cx, cz: L.cz, h: L.h,
          dir: rand() < 0.5 ? 1 : -1,
          dist: rand() * 8 * L.h,
          speed: 1.05 + rand() * 0.65,
          angle: 0,
        });
      }
    }
    const standers = [
      [0.8, P + 1.6, Math.PI], [-0.7, P + 1.9, Math.PI],
      [-P - 2.2, P - 1.6, 0.7], [-P + 2.4, P + 1.8, -2.2],
      [1.6, 4.4, Math.PI], [-2.1, 4.8, Math.PI + 0.4],
    ];
    for (const [x, z, ry] of standers) {
      const p = this._person();
      p.g.position.set(x, 0.06, z);
      p.g.rotation.y = ry;
      this.group.add(p.g);
      this.peds.push({ ...p, stand: true, baseRy: ry, phase: rand() * 6 });
    }
  }

  // ---------- حلقه‌ی بازی ----------
  update(dt) {
    this.time += dt;
    const t = this.time;

    for (const car of this.cars) {
      car.dist += car.speed * dt;
      const p = rectPoint(car.h, car.h, car.dist, car.dir, car.lane);
      car.obj.position.set(p.x, 0.07, p.z);
      const target = Math.atan2(p.hx, p.hz);
      let d = target - car.angle;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      car.angle += d * Math.min(1, dt * 7);
      car.obj.rotation.y = car.angle;
      if (car.wheels.length) {
        const spin = (car.speed * dt) / Math.max(0.05, car.wheelR);
        for (const w of car.wheels) w.rotation.x += spin;
      }
    }

    for (const ped of this.peds) {
      if (ped.stand) {
        ped.g.rotation.y = ped.baseRy + Math.sin(t * 0.6 + ped.phase) * 0.1;
        ped.g.position.y = 0.06 + Math.abs(Math.sin(t * 1.4 + ped.phase)) * 0.012;
        continue;
      }
      ped.dist += ped.speed * dt;
      const p = rectPoint(ped.h, ped.h, ped.dist, ped.dir, 0);
      const swing = Math.sin(ped.dist * 5.2);
      ped.g.position.set(ped.cx + p.x, 0.06 + Math.abs(Math.cos(ped.dist * 5.2)) * 0.035, ped.cz + p.z);
      const target = Math.atan2(p.hx, p.hz);
      let d = target - ped.angle;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      ped.angle += d * Math.min(1, dt * 8);
      ped.g.rotation.y = ped.angle;
      ped.legL.rotation.x = swing * 0.55;
      ped.legR.rotation.x = -swing * 0.55;
      ped.armL.rotation.x = -swing * 0.42;
      ped.armR.rotation.x = swing * 0.42;
    }

    if (this.fountainWater) {
      const s = 1 + Math.sin(t * 2.2) * 0.02;
      this.fountainWater.scale.set(s, s, 1);
    }

    const w = window.innerWidth, h = window.innerHeight;
    for (const L of this.labels) {
      const topY = L.sp ? L.sp.scale.y + 0.55 : L.h;
      const s = this.world.worldToScreen(L.x, topY, L.z);
      if (s.x < -90 || s.y < -40 || s.x > w + 90 || s.y > h + 40) {
        L.el.style.display = 'none';
      } else {
        L.el.style.display = '';
        L.el.style.left = s.x + 'px';
        L.el.style.top = s.y + 'px';
      }
    }
  }
}
