// ================= ساخت‌وساز: حصار، دیوار، چادر و خانه =================
// سازه‌ها روی یک شبکه‌ی ریز می‌نشینند و کامل به هم می‌چسبند،
// پس می‌شود دور مزرعه یا هرجا دیوار و حصار کشید.
// کارت سازه را از سینی روی زمین بینداز تا ساخته شود؛
// کلیک روی حصار/دیوار = چرخش ۹۰ درجه، دوبار کلیک سریع = برداشتن (برگشت به کارت‌ها).
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { STRUCTURES, AREAS, LAYOUT, ITEMS } from './config.js';
import {
  state, addStructure, removeStructure, getStructure,
  takeItem, addItem, cellPosition, save,
} from './state.js';
import { sfx } from './audio.js';

const ORIGINS = { town: { x: 0, z: 2 }, farm: { x: 0, z: 75 } };

export class Constructions {
  constructor(world, ui) {
    this.world = world;
    this.ui = ui;
    this.loader = new GLTFLoader();
    this.templates = {};       // kindId -> scene
    this.modelsReady = false;
    this.modelsFailed = false;
    this.visuals = new Map();  // structureId -> { group }
    this.lastClick = { id: null, time: 0 };
    this._transparentTex = null;
  }

  // ---------- شبکه ----------
  originOf(area) { return ORIGINS[area] || ORIGINS.town; }

  anchorFor(itemId, point, area) {
    const spec = STRUCTURES.kinds[itemId];
    if (!spec || !point) return null;
    const o = this.originOf(area);
    const cell = STRUCTURES.cell;
    const baseX = Math.floor((point.x - o.x) / cell);
    const baseZ = Math.floor((point.z - o.z) / cell);
    const off = Math.floor((spec.cells - 1) / 2);
    return { gx: baseX - off, gz: baseZ - off };
  }

  centerOf(st) {
    const spec = STRUCTURES.kinds[st.kind];
    const o = this.originOf(st.area);
    const cell = STRUCTURES.cell;
    return {
      x: o.x + (st.gx + spec.cells / 2) * cell,
      z: o.z + (st.gz + spec.cells / 2) * cell,
    };
  }

  cellsOf(kind, gx, gz) {
    const n = STRUCTURES.kinds[kind].cells;
    const out = [];
    for (let x = gx; x < gx + n; x++) for (let z = gz; z < gz + n; z++) out.push(x + ',' + z);
    return out;
  }

  occupiedCells(area, exceptId = null) {
    const set = new Set();
    for (const st of state.structures) {
      if (st.area !== area || st.id === exceptId) continue;
      for (const c of this.cellsOf(st.kind, st.gx, st.gz)) set.add(c);
    }
    return set;
  }

  // برای جلوگیری از هم‌پوشانی هنگام جابجایی ساختمان/جایگاه
  occupiedRects() {
    return state.structures.map((st) => {
      const c = this.centerOf(st);
      const half = (STRUCTURES.kinds[st.kind].cells * STRUCTURES.cell) / 2;
      return { x: c.x, z: c.z, rx: half, rz: half };
    });
  }

  // ---------- اعتبار جا ----------
  check(itemId, point, area) {
    const spec = STRUCTURES.kinds[itemId];
    if (!spec || !point) return 'bad';
    const anchor = this.anchorFor(itemId, point, area);
    const bounds = AREAS[area];
    const o = this.originOf(area);
    const cell = STRUCTURES.cell;
    const mine = this.cellsOf(itemId, anchor.gx, anchor.gz);
    const occupied = this.occupiedCells(area);

    const f = LAYOUT.field;
    const fieldRect = {
      minX: f.cx - (f.cols * f.spacing) / 2 - 0.3, maxX: f.cx + (f.cols * f.spacing) / 2 + 0.3,
      minZ: f.cz - (f.rows * f.spacing) / 2 - 0.3, maxZ: f.cz + (f.rows * f.spacing) / 2 + 0.3,
    };
    const pen = LAYOUT.animalPen;

    for (const key of mine) {
      if (occupied.has(key)) return 'overlap';
      const [gx, gz] = key.split(',').map(Number);
      const cx = o.x + (gx + 0.5) * cell;
      const cz = o.z + (gz + 0.5) * cell;
      if (cx < bounds.minX || cx > bounds.maxX || cz < bounds.minZ || cz > bounds.maxZ) return 'bounds';
      if (area === 'farm') {
        if (cx > fieldRect.minX && cx < fieldRect.maxX && cz > fieldRect.minZ && cz < fieldRect.maxZ) return 'field';
        if (cx > pen.minX && cx < pen.maxX && cz > pen.minZ && cz < pen.maxZ) return 'pen';
        if (Math.hypot(cx - LAYOUT.farmhouse.x, cz - LAYOUT.farmhouse.z) < 2.9) return 'overlap';
      }
      // روی جایگاه کشت نه
      for (const p of state.plots) {
        const pp = cellPosition(p.cell);
        if (Math.hypot(pp.x - cx, pp.z - cz) < 1.35) return 'overlap';
      }
      // روی درخت/سنگ نه
      for (const ob of state.obstacles) {
        if (Math.hypot(ob.x - cx, ob.z - cz) < 0.95) return 'obstacle';
      }
      // روی ساختمان‌های شهر نه
      if (area === 'town') {
        for (const b of LAYOUT.buildings) {
          const sp = this.world.getSprite('building:' + b.id);
          if (!sp) continue;
          if (Math.abs(sp.position.x - cx) < b.w * 0.42 && Math.abs(sp.position.z - cz) < 1.15) return 'overlap';
        }
      }
    }
    return null; // مجاز
  }

  canPlace(itemId, point, area) {
    return this.check(itemId, point, area) === null;
  }

  // ---------- ساخت از روی کارت ----------
  placeFromCard(itemId, point, area) {
    const err = this.check(itemId, point, area);
    if (err) {
      const msgs = {
        field: 'روی زمین کشت نمی‌شود ساخت؛ دورش بساز! 🌾',
        pen: 'داخل آغل حیوانات نمی‌شود ساخت 🐄',
        obstacle: 'اینجا درخت/سنگ است؛ اول با سکه پاکش کن 🪓',
        bounds: 'خارج از محدوده‌ی این صحنه است.',
        overlap: 'اینجا قبلاً چیزی هست!',
        bad: 'اینجا نمی‌شود ساخت.',
      };
      this.ui.toast(msgs[err] || msgs.bad);
      sfx.error();
      return false;
    }
    if (!takeItem(itemId)) return this.ui.needBuy(itemId);

    const anchor = this.anchorFor(itemId, point, area);
    // جهت حصار/دیوار: اگر همسایه‌ی افقی دارد افقی، اگر عمودی دارد عمودی
    let rot = 0;
    const spec = STRUCTURES.kinds[itemId];
    if (spec.rotatable) {
      const occ = this.occupiedCells(area);
      const horiz = occ.has((anchor.gx - 1) + ',' + anchor.gz) || occ.has((anchor.gx + 1) + ',' + anchor.gz);
      const vert = occ.has(anchor.gx + ',' + (anchor.gz - 1)) || occ.has(anchor.gx + ',' + (anchor.gz + 1));
      rot = vert && !horiz ? 1 : 0;
    }
    const st = addStructure({
      id: 'st_' + Math.random().toString(36).slice(2, 8),
      kind: itemId, area, gx: anchor.gx, gz: anchor.gz, rot,
    });
    this.syncStructure(st);
    const c = this.centerOf(st);
    this.world.explode(c.x, 0.35, c.z, 0xd8b083);
    sfx.drop();
    const item = ITEMS[itemId];
    this.ui.toast(spec.rotatable
      ? `${item.name} ساخته شد! 🔨 کلیک رویش = چرخش، دوبار کلیک سریع = برداشتن`
      : `${item.name} ساخته شد! 🏠 دوبار کلیک سریع رویش = برداشتن`);
    save();
    return true;
  }

  // ---------- کلیک روی سازه ----------
  structureAt(mesh) {
    if (!mesh || mesh.userData.type !== 'structure') return null;
    return getStructure(mesh.userData.id.slice('structure:'.length));
  }

  interact(st) {
    if (!st) return;
    const now = performance.now();
    if (this.lastClick.id === st.id && now - this.lastClick.time < 450) {
      // برداشتن سازه و برگرداندن به کارت‌ها
      this.lastClick = { id: null, time: 0 };
      const v = this.visuals.get(st.id);
      if (v && v.group) this.world.scene.remove(v.group);
      this.visuals.delete(st.id);
      this.world.removeSprite('structure:' + st.id);
      removeStructure(st.id);
      addItem(st.kind, 1);
      this.ui.refreshTray();
      sfx.pop();
      this.ui.toast('سازه برداشته شد و به کارت‌ها برگشت ↩️');
      return;
    }
    this.lastClick = { id: st.id, time: now };
    const spec = STRUCTURES.kinds[st.kind];
    if (spec.rotatable) {
      st.rot = st.rot ? 0 : 1;
      const v = this.visuals.get(st.id);
      if (v && v.group) v.group.rotation.y = st.rot ? Math.PI / 2 : 0;
      save();
      sfx.click();
    } else {
      this.ui.toast(`${ITEMS[st.kind].name} — برای برداشتن، دوبار سریع رویش کلیک کن.`);
      sfx.click();
    }
  }

  // ---------- نمایش ----------
  spawnAll() {
    for (const st of state.structures) this.syncStructure(st);
  }

  syncStructure(st) {
    const tag = 'structure:' + st.id;
    if (this.world.getSprite(tag)) return;
    const c = this.centerOf(st);
    const w = Math.max(1.1, STRUCTURES.kinds[st.kind].cells * STRUCTURES.cell);
    const sp = this.world.addSprite({
      tag, texture: this.transparentTexture(), x: c.x, z: c.z, width: w, y: 0.02,
    });
    sp.material.opacity = 0;
    sp.material.colorWrite = false;
    this.visuals.set(st.id, { group: null });
    if (this.modelsReady) this.attachModel(st);
    else if (this.modelsFailed) this.attachFallback(st);
  }

  async init() {
    const loadOne = (file) => new Promise((resolve) => {
      let done = false;
      const finish = (v) => { if (!done) { done = true; resolve(v); } };
      const timer = setTimeout(() => finish(null), 7000);
      try {
        this.loader.load(encodeURI(STRUCTURES.basePath + file),
          (g) => { clearTimeout(timer); finish(g.scene); },
          undefined,
          () => { clearTimeout(timer); finish(null); });
      } catch (e) { clearTimeout(timer); finish(null); }
    });
    try {
      const ids = Object.keys(STRUCTURES.kinds);
      const scenes = await Promise.all(ids.map(id => loadOne(STRUCTURES.kinds[id].model)));
      ids.forEach((id, i) => { if (scenes[i]) this.templates[id] = scenes[i]; });
    } catch (e) { /* fallback */ }

    if (Object.keys(this.templates).length) {
      this.modelsReady = true;
      for (const st of state.structures) this.attachModel(st);
    } else {
      this.modelsFailed = true;
      for (const st of state.structures) this.attachFallback(st);
    }
  }

  _cloneNormalized(tplScene, spec, renderZ) {
    const inner = tplScene.clone(true);
    const box = new THREE.Box3().setFromObject(inner);
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);
    if (size.y <= 0.001) return null;
    const s = spec.targetH ? spec.targetH / size.y : spec.targetW / Math.max(size.x, size.z);
    inner.scale.setScalar(s);
    inner.position.set(-center.x * s, -box.min.y * s, -center.z * s);
    inner.traverse((o) => { if (o.isMesh) o.renderOrder = 1000 + renderZ * 10 + 1; });
    const holder = new THREE.Group();
    holder.add(inner);
    return holder;
  }

  attachModel(st) {
    const v = this.visuals.get(st.id);
    if (!v || v.group) return;
    const tpl = this.templates[st.kind];
    if (!tpl) { this.attachFallback(st); return; }
    const spec = STRUCTURES.kinds[st.kind];
    const c = this.centerOf(st);
    const group = new THREE.Group();
    const pieces = spec.pieces || 1;
    for (let i = 0; i < pieces; i++) {
      const part = this._cloneNormalized(tpl, spec, c.z);
      if (!part) continue;
      part.position.x = (i - (pieces - 1) / 2) * (STRUCTURES.cell / pieces);
      group.add(part);
    }
    if (!group.children.length) { this.attachFallback(st); return; }
    group.position.set(c.x, 0, c.z);
    group.rotation.y = st.rot ? Math.PI / 2 : 0;
    this.world.scene.add(group);
    v.group = group;
  }

  // سازه‌ی ساده با کد، اگر مدل بارگذاری نشد
  attachFallback(st) {
    const v = this.visuals.get(st.id);
    if (!v || v.group) return;
    const c = this.centerOf(st);
    const cell = STRUCTURES.cell;
    const g = new THREE.Group();
    const M = (color) => new THREE.MeshLambertMaterial({ color });
    const B = (w, h, d, color, x, y, z) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), M(color));
      m.position.set(x, y, z);
      m.renderOrder = 1000 + c.z * 10 + 1;
      g.add(m);
      return m;
    };
    if (st.kind === 'fence') {
      B(0.08, 0.52, 0.08, 0x8a5a2b, -cell / 2 + 0.05, 0.26, 0);
      B(0.08, 0.52, 0.08, 0x8a5a2b, cell / 2 - 0.05, 0.26, 0);
      B(cell, 0.08, 0.05, 0xa06a35, 0, 0.4, 0);
      B(cell, 0.08, 0.05, 0xa06a35, 0, 0.2, 0);
    } else if (st.kind === 'wall') {
      B(cell, 1.0, 0.1, 0x9aa4ae, 0, 0.5, 0);
      B(cell, 0.08, 0.14, 0x7e8894, 0, 1.02, 0);
    } else if (st.kind === 'tent') {
      const cone = new THREE.Mesh(new THREE.ConeGeometry(1.05, 1.15, 4), M(0xd8c9a3));
      cone.position.y = 0.58;
      cone.rotation.y = Math.PI / 4;
      cone.renderOrder = 1000 + c.z * 10 + 1;
      g.add(cone);
    } else { // house
      B(2.4, 1.35, 2.4, 0xb98a56, 0, 0.68, 0);
      const roof = new THREE.Mesh(new THREE.ConeGeometry(1.95, 1.1, 4), M(0xa8542f));
      roof.position.y = 1.9;
      roof.rotation.y = Math.PI / 4;
      roof.renderOrder = 1000 + c.z * 10 + 1;
      g.add(roof);
      B(0.55, 0.95, 0.06, 0x5f3b17, 0, 0.48, 1.21);
    }
    g.position.set(c.x, 0, c.z);
    g.rotation.y = st.rot ? Math.PI / 2 : 0;
    this.world.scene.add(g);
    v.group = g;
  }

  transparentTexture() {
    if (!this._transparentTex) {
      const c = document.createElement('canvas');
      c.width = c.height = 2;
      this._transparentTex = new THREE.CanvasTexture(c);
    }
    return this._transparentTex;
  }
}
