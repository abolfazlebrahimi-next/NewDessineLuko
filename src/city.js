// ================= شهر لوکو =================
// هسته‌ی شهر با ۸ ساختمان اصلی (مثل تصویر مرجع)، خیابان‌ها و بلوک‌ها،
// ساختمان‌های پرکننده و ماشین‌ها از مدل‌های Kenney، آدمک‌های در حال رفت‌وآمد.
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

function canvasTexture(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

// نقطه روی محیط مستطیل (برای مسیر ماشین‌ها و آدمک‌ها)
// dir=+1: گردش ساعتگرد از بالا؛ lane: فاصله از خط وسط به سمت راست حرکت
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
      const hx2 = (s.b[0] - s.a[0]) / s.len, hz2 = (s.b[1] - s.a[1]) / s.len;
      // سمت راست حرکت
      const rx = -hz2, rz = hx2;
      return { x: x + rx * lane, z: z + rz * lane, hx: hx2, hz: hz2 };
    }
    d -= s.len;
  }
  return { x: corners[0][0], z: corners[0][1], hx: 1, hz: 0 };
}

const rand = mulberry(20261019);
const pickOf = (arr) => arr[Math.floor(rand() * arr.length)];

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
  }

  async init() {
    const safe = async (fn, name) => { try { await fn(); } catch (e) { console.warn('[city]', name, e); } };
    this._buildStreets();
    this._buildLandmarks();
    this._buildGarden();
    this._buildGreenSquare();
    await safe(() => this._buildFiller(), 'filler');
    await safe(() => this._buildTreesLamps(), 'trees');
    await safe(() => this._buildCars(), 'cars');
    this._buildPedestrians();
  }

  // ---------- خیابان‌ها و کف بلوک‌ها ----------
  _buildStreets() {
    const { P, B, R } = this;
    const range = CITY.range;
    const extent = (range * 2 + 1) * P + R; // کل ناحیه‌ی سنگفرش شهر

    const pavementTex = canvasTexture(256, 256, (g, w, h) => {
      g.fillStyle = '#c7c9c4'; g.fillRect(0, 0, w, h);
      g.strokeStyle = 'rgba(90,95,90,.35)'; g.lineWidth = 3;
      g.strokeRect(0, 0, w, h);
      g.strokeStyle = 'rgba(90,95,90,.16)'; g.lineWidth = 2;
      g.beginPath(); g.moveTo(w / 2, 0); g.lineTo(w / 2, h); g.moveTo(0, h / 2); g.lineTo(w, h / 2); g.stroke();
      for (let i = 0; i < 260; i++) {
        g.fillStyle = `rgba(70,75,70,${0.03 + rand() * 0.05})`;
        g.fillRect(rand() * w, rand() * h, 3, 3);
      }
    });
    pavementTex.repeat.set(extent / 5.5, extent / 5.5);
    const pavement = new THREE.Mesh(
      new THREE.PlaneGeometry(extent, extent),
      new THREE.MeshBasicMaterial({ map: pavementTex }),
    );
    pavement.rotation.x = -Math.PI / 2;
    pavement.position.y = 0.02;
    pavement.renderOrder = -990;
    this.group.add(pavement);

    // آسفالت با خط زرد کناری و خط‌چین وسط
    const roadTex = canvasTexture(128, 256, (g, w, h) => {
      g.fillStyle = '#494c54'; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 420; i++) {
        g.fillStyle = `rgba(255,255,255,${0.02 + rand() * 0.045})`;
        g.fillRect(rand() * w, rand() * h, 2, 2);
      }
      g.fillStyle = '#e9b93c';
      g.fillRect(4, 0, 5, h); g.fillRect(w - 9, 0, 5, h);
      g.fillStyle = '#f2f2ee';
      g.fillRect(w / 2 - 3, h * 0.18, 6, h * 0.3);
      g.fillRect(w / 2 - 3, h * 0.68, 6, h * 0.3);
    });
    const roadMat = new THREE.MeshBasicMaterial({ map: roadTex });
    const LEN = extent + R * 2;
    const lines = [];
    for (let i = -range - 1; i <= range; i++) lines.push((i + 0.5) * P);
    for (const lx of lines) {
      const texV = roadTex.clone();
      texV.repeat.set(1, LEN / 9);
      texV.needsUpdate = true;
      const v = new THREE.Mesh(new THREE.PlaneGeometry(R, LEN), new THREE.MeshBasicMaterial({ map: texV }));
      v.rotation.x = -Math.PI / 2;
      v.position.set(lx, 0.04, 0);
      v.renderOrder = -985;
      this.group.add(v);
      const texH = roadTex.clone();
      texH.repeat.set(1, LEN / 9);
      texH.needsUpdate = true;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(R, LEN), new THREE.MeshBasicMaterial({ map: texH }));
      m.rotation.set(-Math.PI / 2, 0, Math.PI / 2);
      m.position.set(0, 0.045, lx);
      m.renderOrder = -985;
      this.group.add(m);
    }

    // خط عابر پیاده در تقاطع‌های هسته‌ی شهر
    const crossTex = canvasTexture(128, 128, (g, w, h) => {
      g.clearRect(0, 0, w, h);
      g.fillStyle = 'rgba(245,245,240,.92)';
      for (let i = 0; i < 4; i++) {
        g.fillRect(8 + i * 30, 4, 18, 26);
        g.fillRect(8 + i * 30, h - 30, 18, 26);
        g.fillRect(4, 8 + i * 30, 26, 18);
        g.fillRect(w - 30, 8 + i * 30, 26, 18);
      }
    });
    const crossMat = new THREE.MeshBasicMaterial({ map: crossTex, transparent: true, depthWrite: false });
    for (const lx of lines) for (const lz of lines) {
      if (Math.abs(lx) > 1.5 * P + 0.1 || Math.abs(lz) > 1.5 * P + 0.1) continue;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(R + 0.6, R + 0.6), crossMat);
      m.rotation.x = -Math.PI / 2;
      m.position.set(lx, 0.06, lz);
      m.renderOrder = -980;
      this.group.add(m);
    }

    // کف هر بلوک
    const blockMats = [
      new THREE.MeshBasicMaterial({ color: 0xdbd7cb }),
      new THREE.MeshBasicMaterial({ color: 0xd2cfc2 }),
      new THREE.MeshBasicMaterial({ color: 0xdcd8ce }),
    ];
    this.lawnMat = new THREE.MeshBasicMaterial({ color: 0x6fae4e });
    const blockGeo = new THREE.PlaneGeometry(B, B);
    for (let c = -range; c <= range; c++) for (let r = -range; r <= range; r++) {
      const isGarden = c === -1 && r === 1;
      const isGreen = c === 0 && r === -1;
      const m = new THREE.Mesh(blockGeo, (isGarden || isGreen) ? this.lawnMat : blockMats[Math.abs(c * 3 + r) % 3]);
      m.rotation.x = -Math.PI / 2;
      m.position.set(c * P, 0.055, r * P);
      m.renderOrder = -982;
      this.group.add(m);
    }
  }

  // ---------- ساختمان‌های اصلی + برچسب ----------
  _buildLandmarks() {
    const { P } = this;
    const labelBox = document.getElementById('labels');
    LAYOUT.buildings.forEach((b, i) => {
      const x = b.col * P, z = b.row * P;
      let anchorObj = null, anchorH = 2.4;
      if (b.id !== 'garden') {
        const sp = this.world.addSprite({
          tag: `building:${b.id}`, file: b.tex,
          x, z: z - 0.7, width: b.w, depthTest: true,
        });
        anchorObj = sp;
      }
      if (labelBox) {
        const el = document.createElement('div');
        el.className = 'city-label';
        el.textContent = `${i + 1}. ${b.name}`;
        labelBox.appendChild(el);
        this.labels.push({ el, sp: anchorObj, x, z: z - 0.7, h: anchorH });
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

  // باغچه (سه‌بعدی): فواره، پرچین، نیمکت، گل
  _buildGarden() {
    const { P, B } = this;
    const cx = -1 * P, cz = 1 * P;
    const stone = new THREE.MeshStandardMaterial({ color: 0xb9b3a8 });
    const waterMat = new THREE.MeshBasicMaterial({ color: 0x57b7e8 });
    const hedgeMat = new THREE.MeshStandardMaterial({ color: 0x3e7d33 });

    const pathMat = new THREE.MeshBasicMaterial({ color: 0xe3d9bd });
    const p1 = new THREE.Mesh(new THREE.PlaneGeometry(B - 1, 1.5), pathMat);
    p1.rotation.x = -Math.PI / 2; p1.position.set(cx, 0.075, cz); p1.renderOrder = -978;
    const p2 = new THREE.Mesh(new THREE.PlaneGeometry(1.5, B - 1), pathMat);
    p2.rotation.x = -Math.PI / 2; p2.position.set(cx, 0.075, cz); p2.renderOrder = -978;
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

    // فواره — قابل کلیک (پنل باغچه)
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

    // گل‌های رنگی
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

  // میدان سبز بالای هسته (بلوک وسط-عقب در تصویر مرجع)
  _buildGreenSquare() {
    const { P } = this;
    const cx = 0, cz = -1 * P;
    const pathMat = new THREE.MeshBasicMaterial({ color: 0xe3d9bd });
    const p1 = new THREE.Mesh(new THREE.PlaneGeometry(9, 1.4), pathMat);
    p1.rotation.x = -Math.PI / 2; p1.position.set(cx, 0.075, cz); p1.renderOrder = -978;
    const p2 = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 9), pathMat);
    p2.rotation.x = -Math.PI / 2; p2.position.set(cx, 0.075, cz); p2.renderOrder = -978;
    this.group.add(p1, p2);
    this._bench(cx - 2.8, cz + 2.4, Math.PI / 6);
    this._bench(cx + 2.8, cz - 2.4, -Math.PI * 0.85);
  }

  // ---------- بارگذاری و نرمال‌سازی مدل‌ها ----------
  _loadGLB(path) {
    return new Promise((resolve, reject) => {
      this.loader.load(path, (g) => resolve(g.scene), undefined, reject);
    });
  }

  // مدل را به اندازه‌ی هدف می‌رساند و پایش را روی زمین و مرکزش را روی مبدأ می‌گذارد
  _normalized(scene, targetFoot, maxH) {
    const wrap = new THREE.Group();
    const inner = scene;
    wrap.add(inner);
    const box = new THREE.Box3().setFromObject(inner);
    const size = box.getSize(new THREE.Vector3());
    if (!size.x || !size.y) return wrap;
    const s = Math.min(targetFoot / Math.max(size.x, size.z), maxH / size.y);
    inner.scale.setScalar(s);
    const c = box.getCenter(new THREE.Vector3());
    inner.position.set(-c.x * s, -box.min.y * s, -c.z * s);
    return wrap;
  }

  async _buildFiller() {
    const { P, B } = this;
    const scenes = {};
    await Promise.allSettled(CITY.filler.map(async (name) => {
      scenes[name] = await this._loadGLB(CITY.cityBase + name + '.glb');
    }));
    const extras = {};
    await Promise.allSettled(['water-tower', 'detail-tank', 'shipping-container-a', 'shipping-container-b'].map(async (name) => {
      extras[name] = await this._loadGLB(CITY.cityBase + name + '.glb');
    }));
    const available = CITY.filler.filter(n => scenes[n]);
    if (!available.length) return;

    const place = (scene, x, z, foot, maxH, rotY) => {
      const m = this._normalized(scene.clone(true), foot, maxH);
      m.position.set(x, 0.06, z);
      m.rotation.y = rotY;
      this.group.add(m);
    };

    for (let c = -CITY.range; c <= CITY.range; c++) {
      for (let r = -CITY.range; r <= CITY.range; r++) {
        if (Math.abs(c) <= 1 && Math.abs(r) <= 1) continue; // هسته‌ی اصلی
        const x = c * P, z = r * P;
        const roll = rand();
        if (c === -3 && r === -3 && extras['water-tower']) {
          place(extras['water-tower'], x, z, 5.5, 9, 0);
          continue;
        }
        if (c === 3 && r === 3 && extras['shipping-container-a']) {
          place(extras['shipping-container-a'], x - 1.6, z - 1, 4.6, 3, 0.2);
          if (extras['shipping-container-b']) place(extras['shipping-container-b'], x + 1.4, z + 1.6, 4.6, 3, -0.15);
          if (extras['detail-tank']) place(extras['detail-tank'], x + 2.4, z - 2.4, 3, 3.4, 0);
          continue;
        }
        if (roll < 0.14) continue; // بعضی بلوک‌ها فضای سبز می‌مانند (درخت می‌گیرند)
        const rot = Math.floor(rand() * 4) * Math.PI / 2;
        if (roll < 0.55) {
          place(scenes[pickOf(available)], x, z, 8.4, 8.5, rot);
        } else {
          for (const dx of [-2.6, 2.6]) for (const dz of [-2.6, 2.6]) {
            place(scenes[pickOf(available)], x + dx, z + dz, 4.3, 5.5, Math.floor(rand() * 4) * Math.PI / 2);
          }
        }
      }
    }
  }

  // ---------- درخت‌ها و چراغ‌های خیابان ----------
  async _buildTreesLamps() {
    const { P, B, R } = this;
    let treeScene = null;
    try { treeScene = await this._loadGLB('models/nature/tree.glb'); } catch (e) { /* ok */ }
    const spots = [];
    // دور بلوک‌های هسته و باغچه و میدان سبز
    const cornerSpots = (cx, cz, inset) => {
      for (const dx of [-1, 1]) for (const dz of [-1, 1]) spots.push([cx + dx * inset, cz + dz * inset]);
    };
    for (const b of LAYOUT.buildings) cornerSpots(b.col * P, b.row * P, B / 2 - 1.1);
    cornerSpots(0, -P, B / 2 - 1.2);
    spots.push([-P - 3.4, P + 3.4], [-P + 3.4, P - 3.4], [3.4, -P + 3.2], [-3.4, -P - 3.2]);
    // حلقه‌ی سبز دور شهر روی چمن
    for (let i = 0; i < 110; i++) {
      const ang = rand() * Math.PI * 2;
      const rad = 62 + rand() * 38;
      spots.push([Math.cos(ang) * rad, Math.sin(ang) * rad]);
    }
    // بلوک‌های خالیِ سبز
    for (let c = -CITY.range; c <= CITY.range; c++) for (let r = -CITY.range; r <= CITY.range; r++) {
      if (Math.abs(c) <= 1 && Math.abs(r) <= 1) continue;
      if (rand() < 0.3) spots.push([c * P + (rand() - 0.5) * 5, r * P + (rand() - 0.5) * 5]);
    }

    if (treeScene) {
      const meshes = [];
      treeScene.updateMatrixWorld(true);
      treeScene.traverse((o) => { if (o.isMesh) meshes.push(o); });
      const box = new THREE.Box3().setFromObject(treeScene);
      const h = Math.max(0.001, box.max.y - box.min.y);
      const baseScale = 2.6 / h;
      const m4 = new THREE.Matrix4();
      const q = new THREE.Quaternion();
      const e = new THREE.Euler();
      const mats = spots.map(([x, z]) => {
        const s = baseScale * (0.8 + rand() * 0.55);
        e.set(0, rand() * Math.PI * 2, 0);
        q.setFromEuler(e);
        return new THREE.Matrix4().compose(
          new THREE.Vector3(x, -box.min.y * s, z), q, new THREE.Vector3(s, s, s),
        );
      });
      for (const mesh of meshes) {
        const geo = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);
        const inst = new THREE.InstancedMesh(geo, mesh.material, mats.length);
        mats.forEach((m, i) => inst.setMatrixAt(i, m));
        inst.instanceMatrix.needsUpdate = true;
        this.group.add(inst);
      }
    }

    // چراغ خیابان دور هسته
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
    const m4 = new THREE.Matrix4();
    lampSpots.forEach(([x, z], i) => {
      m4.makeTranslation(x, 0.06, z);
      poles.setMatrixAt(i, m4);
      heads.setMatrixAt(i, m4);
    });
    this.group.add(poles, heads);
  }

  // ---------- ماشین‌ها ----------
  async _buildCars() {
    const { P, R } = this;
    const scenes = {};
    await Promise.allSettled(CITY.cars.map(async (name) => {
      scenes[name] = await this._loadGLB(CITY.carBase + name + '.glb');
    }));
    const available = CITY.cars.filter(n => scenes[n]);
    if (!available.length) return;

    const lane = R / 4 + 0.15;
    const loops = [
      { h: 0.5 * P, dir: 1 }, { h: 0.5 * P, dir: -1 },
      { h: 1.5 * P, dir: 1 }, { h: 1.5 * P, dir: -1 },
      { h: 2.5 * P, dir: 1 }, { h: 2.5 * P, dir: -1 },
    ];
    const per = (h) => 8 * h;
    available.forEach((name, i) => {
      const raw = scenes[name].clone(true);
      // جهت جلو از روی چرخ‌های جلو/عقب
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
        const fx = front.x / nf - back.x / nb;
        const fz = front.z / nf - back.z / nb;
        innerRot = -Math.atan2(fx, fz);
      }
      const big = /truck|van|firetruck|garbage|delivery/.test(name);
      const wrap = this._normalized(raw, big ? 2.6 : 2.15, big ? 1.5 : 1.1);
      wrap.children[0].rotation.y = innerRot;
      this.group.add(wrap);
      const loop = loops[i % loops.length];
      this.cars.push({
        obj: wrap, h: loop.h, dir: loop.dir, lane,
        dist: (i / available.length) * per(loop.h) * 1.7 % per(loop.h),
        speed: 4.2 + rand() * 2.6,
        angle: 0,
      });
    });
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
    const loops = [];
    // حلقه‌ی بزرگ دور هسته + حلقه دور چند بلوک + حلقه‌ی بیرونی
    loops.push({ cx: 0, cz: 0, h: P + inset, n: 9 });
    loops.push({ cx: 0, cz: 0, h: inset, n: 3 });
    loops.push({ cx: -P, cz: P, h: inset, n: 3 });
    loops.push({ cx: P, cz: 0, h: inset, n: 2 });
    loops.push({ cx: P, cz: -P, h: inset, n: 2 });
    loops.push({ cx: 0, cz: 0, h: 2 * P + inset, n: 6 });
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
    // ایستاده‌ها: جلوی لیدربرد، توی باغچه، پله‌های تالار
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

    // برچسب ساختمان‌های اصلی
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
