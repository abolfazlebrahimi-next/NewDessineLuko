// ================= شهر لوکو =================
// هسته‌ی شهر با ۸ ساختمان اصلی (مثل تصویر مرجع)، خیابان‌ها و بلوک‌ها روی یک
// بافت زمینِ نقاشی‌شده، ساختمان‌ها و ماشین‌های Kenney و آدمک‌های در حال رفت‌وآمد.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { sharedManager } from './loader.js';
import { CITY, LAYOUT } from './config.js';

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

export class City {
  constructor(world, ui) {
    this.world = world;
    this.ui = ui;
    this.group = new THREE.Group();
    world.scene.add(this.group);
    this.loader = new GLTFLoader(sharedManager);
    this.cars = [];
    this.peds = [];
    this.labels = [];
    this.time = 0;
    this.P = CITY.pitch;
    this.B = CITY.block;
    this.R = CITY.road;
    this._shadowMat = null;
  }

  async init() {
    this._buildGround();
    this._buildLandmarks();
    this._buildGarden();
    this._buildGreenSquare();
    this._buildPedestrians();
    // مدل‌ها موازی و تدریجی می‌آیند تا شهر از همان ثانیه‌های اول پر شود
    const jobs = [
      this._buildFiller(),
      this._buildCars(),
      this._buildTreesLamps(),
    ].map((p, i) => p.catch((e) => console.warn('[city] job', i, e)));
    await Promise.allSettled(jobs);
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
    g.fillStyle = '#b7bab0';
    g.fillRect(0, 0, S, S);

    // کف بلوک‌ها
    const tones = ['#c9ccc0', '#c2c6ba', '#cdd0c2'];
    for (let col = -range; col <= range; col++) {
      for (let row = -range; row <= range; row++) {
        const bx = X(col * P - B / 2), by = Y(row * P - B / 2), bs = U(B);
        const isCore = Math.abs(col) <= 1 && Math.abs(row) <= 1;
        const isLawn = (col === -1 && row === 1) || (col === 0 && row === -1);
        if (isLawn) {
          g.fillStyle = '#6cab4c';
          g.fillRect(bx, by, bs, bs);
          for (let i = 0; i < 130; i++) {
            g.fillStyle = `rgba(${40 + rand() * 40 | 0},${110 + rand() * 50 | 0},40,${0.12 + rand() * 0.15})`;
            g.beginPath();
            g.arc(bx + rand() * bs, by + rand() * bs, 2 + rand() * 7, 0, 7);
            g.fill();
          }
        } else {
          g.fillStyle = isCore ? '#ded7c5' : tones[Math.abs(col * 3 + row * 7) % 3];
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
          if (isCore) { // میدان روشن زیر ساختمان اصلی
            g.fillStyle = 'rgba(255,250,232,.4)';
            const inset = U(1.35);
            g.fillRect(bx + inset, by + inset, bs - inset * 2, bs - inset * 2);
          }
        }
        // حاشیه‌ی پیاده‌رو (جدول)
        g.strokeStyle = 'rgba(255,255,255,.35)';
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
    g.fillStyle = '#454954';
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

    // خط زرد کناری + خط‌چین وسط (فقط بین تقاطع‌ها)
    for (const l of lines) {
      for (const [g0, g1] of gaps) {
        if (g1 - g0 < 0.6) continue;
        g.fillStyle = '#d9a92f';
        g.fillRect(X(l - R / 2 + 0.22), Y(g0), U(0.15), U(g1 - g0));
        g.fillRect(X(l + R / 2 - 0.37), Y(g0), U(0.15), U(g1 - g0));
        g.fillRect(X(g0), Y(l - R / 2 + 0.22), U(g1 - g0), U(0.15));
        g.fillRect(X(g0), Y(l + R / 2 - 0.37), U(g1 - g0), U(0.15));
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
  _blob(x, z, w, d, parent) {
    if (!this._shadowMat) {
      this._shadowMat = new THREE.MeshBasicMaterial({
        map: this.world.shadowTex, transparent: true, depthWrite: false,
      });
      this._shadowGeo = new THREE.PlaneGeometry(1, 1);
    }
    const m = new THREE.Mesh(this._shadowGeo, this._shadowMat);
    m.rotation.x = -Math.PI / 2;
    m.scale.set(w, d, 1);
    m.position.set(x, parent ? -0.03 : 0.035, z);
    m.renderOrder = 2;
    (parent || this.group).add(m);
    return m;
  }

  // ---------- ساختمان‌های اصلی + برچسب ----------
  _buildLandmarks() {
    const { P } = this;
    const labelBox = document.getElementById('labels');
    LAYOUT.buildings.forEach((b, i) => {
      const x = b.col * P, z = b.row * P;
      let sp = null;
      if (b.id !== 'garden') {
        sp = this.world.addSprite({
          tag: `building:${b.id}`, file: b.tex,
          x, z: z - 1.15, width: b.w, depthTest: true,
        });
      }
      if (labelBox) {
        const el = document.createElement('div');
        el.className = 'city-label';
        el.textContent = `${i + 1}. ${b.name}`;
        labelBox.appendChild(el);
        this.labels.push({ el, sp, x, z: z - 1.15, h: 2.4 });
      }
    });
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
    const m4 = new THREE.Matrix4();
    const col = new THREE.Color();
    for (let i = 0; i < 64; i++) {
      let fx, fz;
      do { fx = cx + (rand() - 0.5) * (B - 2); fz = cz + (rand() - 0.5) * (B - 2); }
      while (Math.abs(fx - cx) < 1.7 && Math.abs(fz - cz) < 1.7);
      m4.makeTranslation(fx, 0.16, fz);
      flowers.setMatrixAt(i, m4);
      flowers.setColorAt(i, col.setHex(pickOf(colors)));
    }
    this.group.add(flowers);
  }

  _buildGreenSquare() {
    const { P } = this;
    const cx = 0, cz = -P;
    const pathMat = new THREE.MeshBasicMaterial({ color: 0xe8dfc4 });
    const p1 = new THREE.Mesh(new THREE.PlaneGeometry(9, 1.4), pathMat);
    p1.rotation.x = -Math.PI / 2; p1.position.set(cx, 0.045, cz); p1.renderOrder = -978;
    const p2 = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 9), pathMat);
    p2.rotation.x = -Math.PI / 2; p2.position.set(cx, 0.045, cz); p2.renderOrder = -978;
    this.group.add(p1, p2);
    this._bench(cx - 2.8, cz + 2.4, Math.PI / 6);
    this._bench(cx + 2.8, cz - 2.4, -Math.PI * 0.85);
  }

  // ---------- مدل‌ها ----------
  _loadGLB(path) {
    return new Promise((resolve, reject) => {
      this.loader.load(path, (g) => resolve(g.scene), undefined, reject);
    });
  }

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

  async _buildFiller() {
    const { P } = this;
    // برنامه‌ی چیدمان از قبل مشخص است؛ هر مدل که رسید جاهایش پر می‌شود
    const plan = [];
    const add = (name, x, z, foot, maxH, rot) => plan.push({ name, x, z, foot, maxH, rot });
    const faceRot = (c, r) => {
      const base = Math.abs(c) > Math.abs(r) ? Math.PI / 2 : 0;
      return base + (rand() < 0.5 ? Math.PI : 0);
    };
    for (let c = -CITY.range; c <= CITY.range; c++) {
      for (let r = -CITY.range; r <= CITY.range; r++) {
        if (Math.abs(c) <= 1 && Math.abs(r) <= 1) continue;
        const x = c * P, z = r * P;
        if (c === -3 && r === -3) {
          add('water-tower', x - 1.5, z - 1, 5.5, 10, 0.4);
          add('detail-tank', x + 2.6, z + 2.2, 3.2, 3.6, 0);
          continue;
        }
        if (c === 3 && r === 3) {
          add('shipping-container-a', x - 1.8, z - 1.4, 4.8, 3, 0.15);
          add('shipping-container-b', x + 1.6, z + 1.2, 4.8, 3, -0.1);
          add('shipping-container-c', x + 2.2, z - 2.4, 4.8, 3, 1.65);
          continue;
        }
        const nearCore = Math.abs(c) === 2 || Math.abs(r) === 2;
        const roll = rand();
        if (nearCore || roll < 0.5) {
          add(pickOf(CITY.filler), x, z - 0.7, 7.9, 8.2, faceRot(c, r));
        } else if (roll < 0.85) {
          add(pickOf(CITY.filler), x - 2.55, z - 1.1, 4.6, 6, faceRot(c, r));
          add(pickOf(CITY.filler), x + 2.55, z - 1.1, 4.6, 6, faceRot(c, r));
          add(pickOf(CITY.filler), x + 0.2, z + 2.9, 4.2, 5, faceRot(c, r) + Math.PI);
        } else {
          add(pickOf(['shipping-container-a', 'shipping-container-b', 'detail-tank']), x - 1.6, z + 0.4, 4.6, 3.2, rand() * 0.6 - 0.3);
          add(pickOf(CITY.filler), x + 2.2, z - 1.6, 5.2, 6, faceRot(c, r));
        }
      }
    }

    const byName = new Map();
    for (const it of plan) {
      if (!byName.has(it.name)) byName.set(it.name, []);
      byName.get(it.name).push(it);
    }
    const tints = [0xffffff, 0xffffff, 0xf7ead2, 0xdfe9ee, 0xf3ddcb, 0xe6eedd];
    await Promise.allSettled([...byName.entries()].map(async ([name, items]) => {
      let scene = null;
      try { scene = await this._loadGLB(CITY.cityBase + name + '.glb'); } catch (e) { /* جایگزین */ }
      for (const it of items) {
        let obj;
        if (scene) {
          obj = this._normalized(scene.clone(true), it.foot, it.maxH);
          const tint = pickOf(tints);
          if (tint !== 0xffffff) {
            obj.traverse((o) => {
              if (o.isMesh && o.material && o.material.map) {
                o.material = o.material.clone();
                o.material.color.setHex(tint);
              }
            });
          }
        } else {
          obj = this._fallbackBuilding(it.foot, it.maxH);
        }
        obj.position.set(it.x, 0.06, it.z);
        obj.rotation.y = it.rot;
        this.group.add(obj);
        this._blob(it.x, it.z + it.foot * 0.06, it.foot * 1.04, it.foot * 0.66);
      }
    }));
  }

  // ---------- درخت‌ها و چراغ‌ها ----------
  async _buildTreesLamps() {
    const { P, B, R } = this;
    const spots = [];
    const cornerSpots = (cx, cz, inset) => {
      for (const dx of [-1, 1]) for (const dz of [-1, 1]) spots.push([cx + dx * inset, cz + dz * inset]);
    };
    for (const b of LAYOUT.buildings) cornerSpots(b.col * P, b.row * P, B / 2 - 1.1);
    cornerSpots(0, -P, B / 2 - 1.2);
    // ردیف درخت دو طرف خیابان‌های اصلی هسته
    for (const line of [-0.5, 0.5]) {
      for (let t = -2; t <= 2; t++) {
        spots.push([line * P - R / 2 - 0.85, t * P + 2]);
        spots.push([line * P + R / 2 + 0.85, t * P - 2]);
        spots.push([t * P + 2, line * P - R / 2 - 0.85]);
        spots.push([t * P - 2, line * P + R / 2 + 0.85]);
      }
    }
    for (let i = 0; i < 110; i++) {
      const ang = rand() * Math.PI * 2;
      const rad = 62 + rand() * 38;
      spots.push([Math.cos(ang) * rad, Math.sin(ang) * rad]);
    }
    for (let c = -CITY.range; c <= CITY.range; c++) for (let r = -CITY.range; r <= CITY.range; r++) {
      if (Math.abs(c) <= 1 && Math.abs(r) <= 1) continue;
      if (rand() < 0.45) spots.push([c * P + (rand() - 0.5) * 7.5, r * P + B / 2 - 1]);
    }

    let treeScene = null;
    try { treeScene = await this._loadGLB('models/nature/tree.glb'); } catch (e) { /* جایگزین */ }

    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const eul = new THREE.Euler();
    if (treeScene) {
      const meshes = [];
      treeScene.updateMatrixWorld(true);
      treeScene.traverse((o) => { if (o.isMesh) meshes.push(o); });
      const box = new THREE.Box3().setFromObject(treeScene);
      const h = Math.max(0.001, box.max.y - box.min.y);
      const baseScale = 2.7 / h;
      const mats = spots.map(([x, z]) => {
        const s = baseScale * (0.8 + rand() * 0.55);
        eul.set(0, rand() * Math.PI * 2, 0);
        q.setFromEuler(eul);
        return new THREE.Matrix4().compose(
          new THREE.Vector3(x, -box.min.y * s + 0.03, z), q, new THREE.Vector3(s, s, s),
        );
      });
      for (const mesh of meshes) {
        const geo = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);
        const inst = new THREE.InstancedMesh(geo, mesh.material, mats.length);
        mats.forEach((m, i) => inst.setMatrixAt(i, m));
        inst.instanceMatrix.needsUpdate = true;
        this.group.add(inst);
      }
    } else {
      // درخت ساده‌ی جایگزین
      const trunkGeo = new THREE.CylinderGeometry(0.09, 0.13, 0.8, 6);
      trunkGeo.translate(0, 0.4, 0);
      const crownGeo = new THREE.IcosahedronGeometry(0.85, 1);
      crownGeo.translate(0, 1.55, 0);
      const trunks = new THREE.InstancedMesh(trunkGeo, new THREE.MeshStandardMaterial({ color: 0x7a4a26 }), spots.length);
      const crowns = new THREE.InstancedMesh(crownGeo, new THREE.MeshStandardMaterial({ color: 0x4d9440 }), spots.length);
      spots.forEach(([x, z], i) => {
        const s = 0.9 + rand() * 0.6;
        m4.compose(new THREE.Vector3(x, 0.03, z), q.identity(), new THREE.Vector3(s, s, s));
        trunks.setMatrixAt(i, m4);
        crowns.setMatrixAt(i, m4);
      });
      this.group.add(trunks, crowns);
    }

    // چراغ‌های خیابان دور هسته
    const poleGeo = new THREE.CylinderGeometry(0.045, 0.06, 1.9, 6);
    poleGeo.translate(0, 0.95, 0);
    const headGeo = new THREE.SphereGeometry(0.13, 8, 6);
    headGeo.translate(0, 1.95, 0);
    const lampSpots = [];
    for (const line of [-1.5, -0.5, 0.5, 1.5]) {
      for (let t = -2.5; t <= 2.5; t++) {
        lampSpots.push([line * P + (R / 2 + 0.45), t * P + P / 2]);
        lampSpots.push([t * P + P / 2, line * P - (R / 2 + 0.45)]);
      }
    }
    const poles = new THREE.InstancedMesh(poleGeo, new THREE.MeshStandardMaterial({ color: 0x3a3f45 }), lampSpots.length);
    const heads = new THREE.InstancedMesh(headGeo, new THREE.MeshBasicMaterial({ color: 0xffe9a8 }), lampSpots.length);
    lampSpots.forEach(([x, z], i) => {
      m4.makeTranslation(x, 0.06, z);
      poles.setMatrixAt(i, m4);
      heads.setMatrixAt(i, m4);
    });
    this.group.add(poles, heads);
  }

  // ---------- ماشین‌ها ----------
  _makeCar(scene, name) {
    const raw = scene.clone(true);
    const front = new THREE.Vector3(), back = new THREE.Vector3();
    let nf = 0, nb = 0;
    const tmp = new THREE.Vector3();
    raw.updateMatrixWorld(true);
    raw.traverse((o) => {
      if (/front/i.test(o.name)) { o.getWorldPosition(tmp); front.add(tmp); nf++; }
      else if (/back|rear/i.test(o.name)) { o.getWorldPosition(tmp); back.add(tmp); nb++; }
    });
    let innerRot = 0;
    if (nf && nb) {
      innerRot = -Math.atan2(front.x / nf - back.x / nb, front.z / nf - back.z / nb);
    }
    const big = /truck|van|firetruck|garbage|delivery/.test(name);
    const wrap = this._normalized(raw, big ? 2.6 : 2.15, big ? 1.5 : 1.1);
    wrap.children[0].rotation.y = innerRot;
    return wrap;
  }

  async _buildCars() {
    const { P, R } = this;
    const lane = R / 4 + 0.15;
    const loops = [
      { h: 0.5 * P, dir: 1 }, { h: 0.5 * P, dir: -1 },
      { h: 1.5 * P, dir: 1 }, { h: 1.5 * P, dir: -1 },
      { h: 2.5 * P, dir: 1 }, { h: 2.5 * P, dir: -1 },
    ];
    const parkedSpots = [
      { x: -6.5, z: 0.5 * P + R / 2 - 0.85, rot: Math.PI / 2 },
      { x: 5.2, z: 0.5 * P + R / 2 - 0.85, rot: Math.PI / 2 },
      { x: 0.5 * P + R / 2 - 0.85, z: -4.5, rot: 0 },
    ];
    let idx = 0;
    await Promise.allSettled(CITY.cars.map(async (name) => {
      let scene = null;
      try { scene = await this._loadGLB(CITY.carBase + name + '.glb'); } catch (e) { return; }
      const i = idx++;
      const wrap = this._makeCar(scene, name);
      this._blob(0, 0, 1.5, 2.6, wrap);
      this.group.add(wrap);
      const loop = loops[i % loops.length];
      const per = 8 * loop.h;
      this.cars.push({
        obj: wrap, h: loop.h, dir: loop.dir, lane,
        dist: (per * (0.17 * i + 0.05)) % per,
        speed: 4.2 + rand() * 2.6,
        angle: 0,
      });
      // چند ماشین پارک‌شده کنار خیابان‌های هسته
      if (i < parkedSpots.length) {
        const parked = this._makeCar(scene, name);
        parked.position.set(parkedSpots[i].x, 0.07, parkedSpots[i].z);
        parked.rotation.y = parkedSpots[i].rot;
        this._blob(0, 0, 1.5, 2.6, parked);
        this.group.add(parked);
      }
    }));

    // مخروط‌های ترافیکی پکیج جلوی سینما و کلاب
    try {
      const cone = await this._loadGLB(CITY.carBase + 'cone.glb');
      const spots = [
        [P - 2.2, 3.4], [P - 0.6, 3.9], [P + 1.2, 3.5],
        [-P + 1.8, 3.6], [-P + 3.2, 3.2],
      ];
      for (const [x, z] of spots) {
        const m = this._normalized(cone.clone(true), 0.34, 0.55);
        m.position.set(x, 0.06, z);
        this.group.add(m);
      }
    } catch (e) { /* ok */ }
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
      { cx: 0, cz: 0, h: P + inset, n: 9 },
      { cx: 0, cz: 0, h: inset, n: 3 },
      { cx: -P, cz: P, h: inset, n: 3 },
      { cx: P, cz: 0, h: inset, n: 2 },
      { cx: P, cz: -P, h: inset, n: 2 },
      { cx: 0, cz: 0, h: 2 * P + inset, n: 6 },
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
      [0.8, P + 2.6, Math.PI], [-0.7, P + 2.9, Math.PI],
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
