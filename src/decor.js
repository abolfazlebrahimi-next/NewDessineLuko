// ================= دکور محیط: جنگل انبوه + وسایل تزیینی + حصار آغل =================
// دور هر دو صحنه (شهر و مزرعه) و فضای بینشان پر از درخت‌های پشت‌به‌پشت است
// تا حس جنگل واقعی بدهد. برای کارایی، درخت‌ها با InstancedMesh کشیده می‌شوند
// و بر اساس نوار عمق (z) گروه‌بندی شده‌اند تا ترتیب نمایش با بقیه درست بماند.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OBSTACLES, STRUCTURES, LAYOUT, FARM_CENTER } from './config.js';

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const PROP_SPECS = [
  // صحنه‌ی شهر
  { file: 'barrel.glb', x: -13.6, z: 2.9, w: 0.55 }, { file: 'barrel.glb', x: -13.05, z: 3.35, w: 0.5 },
  { file: 'workbench.glb', x: -13.3, z: 0.1, w: 1.15, rot: 0.4 },
  { file: 'box.glb', x: 4.7, z: -0.4, w: 0.6 }, { file: 'box.glb', x: 5.25, z: -0.1, w: 0.5 },
  { file: 'chest.glb', x: -4.9, z: -0.8, w: 0.85, rot: -0.3 },
  { file: 'campfire-pit.glb', x: -4.4, z: 4.8, w: 1.0 },
  { file: 'signpost.glb', x: 6.6, z: 3.5, h: 0.95, rot: -0.5 },
  { file: 'bucket.glb', x: -12.6, z: -1.4, w: 0.4 },
  // صحنه‌ی مزرعه (دور خانه‌ی مزرعه و سر زمین)
  { file: 'barrel.glb', x: -5.8, z: 67.7, w: 0.55 }, { file: 'barrel.glb', x: -5.3, z: 68.15, w: 0.5 },
  { file: 'box.glb', x: -11.5, z: 68.2, w: 0.62 }, { file: 'box.glb', x: -10.95, z: 68.5, w: 0.5 },
  { file: 'workbench.glb', x: -11.9, z: 67.1, w: 1.15, rot: 0.8 },
  { file: 'bucket.glb', x: -2.1, z: 68.7, w: 0.42 },
  { file: 'chest.glb', x: -6.4, z: 68.3, w: 0.85, rot: 0.4 },
  { file: 'signpost.glb', x: 10.9, z: 73.7, h: 1.0, rot: 0.7 },
  { file: 'campfire-pit.glb', x: -12.8, z: 71.5, w: 1.0 },
  { file: 'resource-wood.glb', x: -12.1, z: 68.6, w: 0.9 },
  { file: 'resource-planks.glb', x: 3.4, z: 68.5, w: 0.9, rot: 0.5 },
];

export class Decor {
  constructor(world) {
    this.world = world;
    this.loader = new GLTFLoader();
    this.group = new THREE.Group();
    this.world.scene.add(this.group);
    this.ready = false;
  }

  _load(path, file) {
    return new Promise((resolve) => {
      let done = false;
      const finish = (v) => { if (!done) { done = true; resolve(v); } };
      const timer = setTimeout(() => finish(null), 8000);
      try {
        this.loader.load(encodeURI(path + file),
          (g) => { clearTimeout(timer); finish(g.scene); },
          undefined,
          () => { clearTimeout(timer); finish(null); });
      } catch (e) { clearTimeout(timer); finish(null); }
    });
  }

  async init() {
    try {
      const [trees, rocks, grasses, fence, ...props] = await Promise.all([
        Promise.all(OBSTACLES.models.tree.map(f => this._load(OBSTACLES.basePath, f))),
        Promise.all(OBSTACLES.models.rock.map(f => this._load(OBSTACLES.basePath, f))),
        Promise.all(OBSTACLES.models.grass.map(f => this._load(OBSTACLES.basePath, f))),
        this._load(STRUCTURES.basePath, 'fence.glb'),
        ...PROP_SPECS.map(p => this._load(STRUCTURES.basePath, p.file)),
      ]);
      const treeTpls = trees.filter(Boolean);
      const rockTpls = rocks.filter(Boolean);
      const grassTpls = grasses.filter(Boolean);

      if (treeTpls.length || rockTpls.length) this._buildForest(treeTpls, rockTpls);
      if (grassTpls.length) this._buildGrass(grassTpls);
      this._buildPenFence(fence);
      PROP_SPECS.forEach((spec, i) => {
        if (props[i]) this._placeProp(props[i], spec);
      });
      this._buildPath(); // مسیر کف‌پوش جلوی خانه‌ی مزرعه
    } catch (e) {
      console.warn('decor:', e);
      this._buildPenFence(null);
    }
    this.ready = true;
  }

  // مسیر کف‌پوش از خانه‌ی مزرعه تا سر زمین
  async _buildPath() {
    const floor = await this._load(STRUCTURES.basePath, 'floor.glb');
    if (!floor) return;
    for (let i = 0; i < 7; i++) {
      this._placeProp(floor, { x: -4.2 + i * 1.55, z: 68.55, w: 1.5, rot: (i % 2) * 0.06 });
    }
  }

  _placeProp(tplScene, spec) {
    const inner = tplScene.clone(true);
    const box = new THREE.Box3().setFromObject(inner);
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);
    if (size.y <= 0.001) return;
    const s = spec.h ? spec.h / size.y : (spec.w || 0.8) / Math.max(size.x, size.z);
    inner.scale.setScalar(s);
    inner.position.set(-center.x * s, -box.min.y * s, -center.z * s);
    inner.traverse((o) => { if (o.isMesh) o.renderOrder = 1000 + spec.z * 10 + 1; });
    const g = new THREE.Group();
    g.add(inner);
    g.position.set(spec.x, 0, spec.z);
    g.rotation.y = spec.rot || 0;
    this.group.add(g);
  }

  // ---------- جنگل انبوه ----------
  _forestPositions(rng) {
    const pts = [];
    const belt = (cx, cz, halfW, halfH, thick, spacing, keep) => {
      for (let x = cx - halfW; x <= cx + halfW; x += spacing) {
        for (let z = cz - halfH; z <= cz + halfH; z += spacing) {
          const inside = Math.abs(x - cx) < halfW - thick && Math.abs(z - cz) < halfH - thick;
          if (inside) continue;
          if (rng() > keep) continue;
          pts.push({ x: x + (rng() - 0.5) * 0.7, z: z + (rng() - 0.5) * 0.7 });
        }
      }
    };
    // حلقه‌ی جنگلی دور شهر و دور مزرعه — درخت‌ها کاملاً کنار هم
    belt(0, 2, 19.5, 15.5, 3.4, 1.32, 0.94);
    belt(FARM_CENTER.x, FARM_CENTER.z, 19.5, 15.5, 3.4, 1.32, 0.94);
    // فضای بین دو صحنه هم جنگل است
    for (let x = -19; x <= 19; x += 1.85) {
      for (let z = 19; z <= 57; z += 1.85) {
        if (rng() > 0.78) continue;
        pts.push({ x: x + (rng() - 0.5) * 0.9, z: z + (rng() - 0.5) * 0.9 });
      }
    }
    return pts;
  }

  _firstMesh(tplScene) {
    tplScene.updateMatrixWorld(true);
    let found = null;
    tplScene.traverse((o) => { if (!found && o.isMesh) found = o; });
    return found;
  }

  _buildForest(treeTpls, rockTpls) {
    const rng = mulberry32(987654);
    const pts = this._forestPositions(rng);

    // آماده‌سازی قالب‌ها: هندسه + متریال + ضریب نرمال‌سازی + ماتریس محلی
    const makeKind = (tpl, target, byHeight) => {
      const mesh = this._firstMesh(tpl);
      if (!mesh) return null;
      const box = new THREE.Box3().setFromObject(tpl);
      const size = new THREE.Vector3();
      box.getSize(size);
      if (size.y <= 0.001) return null;
      const norm = byHeight ? target / size.y : target / Math.max(size.x, size.z);
      return { geo: mesh.geometry, mat: mesh.material, local: mesh.matrixWorld.clone(), norm, minY: box.min.y, cx: (box.min.x + box.max.x) / 2, cz: (box.min.z + box.max.z) / 2 };
    };
    const kinds = [
      ...treeTpls.map((t, i) => ({ key: 'tree' + i, ...(makeKind(t, OBSTACLES.treeHeight, true) || {}) })),
      ...rockTpls.map((t, i) => ({ key: 'rock' + i, ...(makeKind(t, OBSTACLES.rockWidth, false) || {}) })),
    ].filter(k => k.geo);

    // توزیع نقطه‌ها بین قالب‌ها و نوارهای عمق
    const buckets = new Map(); // `${band}|${kindKey}` -> {kind, mats:[]}
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const v = new THREE.Vector3();
    const sc = new THREE.Vector3();
    for (const p of pts) {
      const isRock = rng() < 0.12 && kinds.some(k => k.key.startsWith('rock'));
      const pool = kinds.filter(k => k.key.startsWith(isRock ? 'rock' : 'tree'));
      if (!pool.length) continue;
      const kind = pool[Math.floor(rng() * pool.length)];
      const jitter = isRock ? 0.8 + rng() * 0.7 : 0.85 + rng() * 0.55;
      const s = kind.norm * jitter;
      e.set(0, rng() * Math.PI * 2, 0);
      q.setFromEuler(e);
      v.set(p.x, -kind.minY * s, p.z);
      sc.setScalar(s);
      // مرکز مدل روی نقطه بنشیند: آفست مرکز محلی را هم اعمال کن
      const off = new THREE.Matrix4().makeTranslation(-kind.cx, 0, -kind.cz);
      m.compose(v, q, sc).multiply(off).multiply(kind.local);
      const band = Math.floor(p.z / 2.5);
      const key = band + '|' + kind.key;
      if (!buckets.has(key)) buckets.set(key, { kind, band, mats: [] });
      buckets.get(key).mats.push(m.clone());
    }

    for (const { kind, band, mats } of buckets.values()) {
      const im = new THREE.InstancedMesh(kind.geo, kind.mat, mats.length);
      mats.forEach((mtx, i) => im.setMatrixAt(i, mtx));
      im.instanceMatrix.needsUpdate = true;
      im.frustumCulled = false;
      im.renderOrder = 1000 + (band * 2.5) * 10 + 1;
      this.group.add(im);
    }
  }

  _buildGrass(grassTpls) {
    const rng = mulberry32(13579);
    const f = LAYOUT.field;
    const fieldRect = {
      minX: f.cx - (f.cols * f.spacing) / 2 - 0.6, maxX: f.cx + (f.cols * f.spacing) / 2 + 0.6,
      minZ: f.cz - (f.rows * f.spacing) / 2 - 0.6, maxZ: f.cz + (f.rows * f.spacing) / 2 + 0.6,
    };
    const pts = [];
    for (let i = 0; i < 260; i++) {
      const inFarm = rng() < 0.55;
      const x = -16 + rng() * 32;
      const z = inFarm ? 60 + rng() * 30 : -7 + rng() * 23;
      if (x > fieldRect.minX && x < fieldRect.maxX && z > fieldRect.minZ && z < fieldRect.maxZ) continue;
      pts.push({ x, z });
    }
    const tpl = grassTpls[0];
    const mesh = this._firstMesh(tpl);
    if (!mesh) return;
    const box = new THREE.Box3().setFromObject(tpl);
    const size = new THREE.Vector3();
    box.getSize(size);
    const norm = OBSTACLES.grassHeight / Math.max(0.05, size.y);
    const buckets = new Map();
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    for (const p of pts) {
      const s = norm * (0.8 + rng() * 0.9);
      e.set(0, rng() * Math.PI * 2, 0);
      q.setFromEuler(e);
      m.compose(new THREE.Vector3(p.x, -box.min.y * s, p.z), q, new THREE.Vector3(s, s, s)).multiply(mesh.matrixWorld);
      const band = Math.floor(p.z / 2.5);
      if (!buckets.has(band)) buckets.set(band, []);
      buckets.get(band).push(m.clone());
    }
    for (const [band, mats] of buckets) {
      const im = new THREE.InstancedMesh(mesh.geometry, mesh.material, mats.length);
      mats.forEach((mtx, i) => im.setMatrixAt(i, mtx));
      im.instanceMatrix.needsUpdate = true;
      im.frustumCulled = false;
      im.renderOrder = 1000 + (band * 2.5) * 10;
      this.group.add(im);
    }
  }

  // ---------- حصار دور آغل حیوانات ----------
  _buildPenFence(fenceTpl) {
    const pen = LAYOUT.animalPen;
    const group = new THREE.Group();
    const segLen = 0.52;
    const gapMin = 13.2, gapMax = 14.4; // دروازه‌ی آغل در ضلع جنوبی

    const addSeg = (x, z, rotY) => {
      if (fenceTpl) {
        const inner = fenceTpl.clone(true);
        const box = new THREE.Box3().setFromObject(inner);
        const size = new THREE.Vector3();
        const center = new THREE.Vector3();
        box.getSize(size);
        box.getCenter(center);
        const s = 0.52 / Math.max(0.01, size.y);
        inner.scale.setScalar(s);
        inner.position.set(-center.x * s, -box.min.y * s, -center.z * s);
        inner.traverse((o) => { if (o.isMesh) o.renderOrder = 1000 + z * 10 + 1; });
        const g = new THREE.Group();
        g.add(inner);
        g.position.set(x, 0, z);
        g.rotation.y = rotY;
        group.add(g);
      } else {
        // جایگزین ساده‌ی چوبی: تیرک + دو نرده
        const mat = new THREE.MeshLambertMaterial({ color: 0x8a5a2b });
        const g = new THREE.Group();
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.52, 0.07), mat);
        post.position.y = 0.26;
        const rail1 = new THREE.Mesh(new THREE.BoxGeometry(segLen, 0.07, 0.045), mat);
        rail1.position.set(segLen / 2, 0.38, 0);
        const rail2 = rail1.clone();
        rail2.position.y = 0.18;
        g.add(post, rail1, rail2);
        g.position.set(x, 0, z);
        g.rotation.y = rotY;
        group.add(g);
      }
    };

    for (let x = pen.minX; x < pen.maxX; x += segLen) {
      addSeg(x + segLen / 2, pen.minZ, 0);
      if (x + segLen < gapMin || x > gapMax) addSeg(x + segLen / 2, pen.maxZ, 0); // دروازه
    }
    for (let z = pen.minZ; z < pen.maxZ; z += segLen) {
      addSeg(pen.minX, z + segLen / 2, Math.PI / 2);
      addSeg(pen.maxX, z + segLen / 2, Math.PI / 2);
    }
    this.group.add(group);
  }
}
