// ================= موانع: درخت‌ها و سنگ‌های روی زمین =================
// از اول بازی زمین کشت و دور شهر پر از درخت و سنگ است.
// کلیک اول روی مانع = نمایش هزینه، کلیک دوم = پرداخت سکه و پاک‌شدن → زمین باز می‌شود.
// مدل‌های سه‌بعدی از پکیج Kenney Survival Kit در public/models/nature خوانده می‌شوند؛
// اگر بارگذاری نشدند، خودکار از تصاویر دوبعدی استفاده می‌شود.
import * as THREE from 'three';
import { makeGLTFLoader } from './loader.js';
import { OBSTACLES, TIMING, REWARDS, LAYOUT, assetUrl } from './config.js';
import {
  state, addObstacle, removeObstacle, makeWildObstacle, cellPosition,
  addDew, addXp, spend, canAfford, save,
} from './state.js';
import { sfx } from './audio.js';

const TREE_FILES = ['Tree1.png', 'Tree2.png', 'Tree3.png'];
const TREE_FALLBACK_W = [1.3, 2.2, 2.3]; // پهنای تصویر جایگزین (ارتفاع‌ها ~۱.۸ می‌شود)
const fmt = (n) => Math.round(n).toLocaleString('fa-IR');

export class Obstacles {
  constructor(world, ui) {
    this.world = world;
    this.ui = ui;
    this.visuals = new Map();   // obstacleId -> { group, fallback, shake, baseScaleY }
    this.templates = { tree: [], rock: [], grass: [] };
    this.modelsReady = false;
    this.modelsFailed = false;
    this.selected = null;       // { id, until }
    this.hovered = null;
    this.regrowTimer = 0;
    this.loader = makeGLTFLoader(); // با دیکدر Meshopt — مدل‌های فشرده هم لود می‌شوند
    this._transparentTex = null;
    this._rockTex = null;
  }

  // ---------- ساخت اولیه ----------
  spawnAll() {
    for (const ob of state.obstacles) this.syncObstacle(ob);
  }

  syncObstacle(ob) {
    const tag = 'obstacle:' + ob.id;
    if (this.world.getSprite(tag)) return;
    // مانع روی سلول زمین همیشه دقیق وسط سلول خودش است
    if (ob.cell !== null && ob.cell !== undefined) {
      const p = cellPosition(ob.cell);
      ob.x = p.x; ob.z = p.z;
    }
    // پروکسی نامرئی برای کلیک (مدل سه‌بعدی جدا روی آن سوار می‌شود)
    const sp = this.world.addSprite({
      tag,
      texture: this.transparentTexture(),
      x: ob.x, z: ob.z,
      width: ob.kind === 'tree' ? 1.8 : 1.5,
      y: 0.02,
    });
    sp.material.opacity = 0;
    sp.material.colorWrite = false;
    sp.userData.sway = false; // فقط وقتی تصویر جایگزین نمایش داده شود
    if (sp.userData.shadow) {
      const sw = ob.kind === 'tree' ? 1.15 : 1.05;
      sp.userData.shadow.scale.set(sw, sw * 0.45, 1);
    }
    this.visuals.set(ob.id, { group: null, fallback: false, shake: 0 });
    if (this.modelsReady) this.attachModel(ob);
    else if (this.modelsFailed) this.attachFallback(ob);
  }

  obstacleAt(mesh) {
    if (!mesh || mesh.userData.type !== 'obstacle') return null;
    const id = mesh.userData.id.slice('obstacle:'.length);
    return state.obstacles.find(o => o.id === id) || null;
  }

  // ---------- بارگذاری مدل‌های پکیج ----------
  async init() {
    const loadOne = (file) => new Promise((resolve) => {
      let done = false;
      const finish = (v) => { if (!done) { done = true; resolve(v); } };
      const timer = setTimeout(() => finish(null), 7000);
      try {
        this.loader.load(
          encodeURI(assetUrl(OBSTACLES.basePath + file)),
          (gltf) => { clearTimeout(timer); finish(gltf.scene); },
          undefined,
          () => { clearTimeout(timer); finish(null); },
        );
      } catch (e) { clearTimeout(timer); finish(null); }
    });

    try {
      for (const kind of ['tree', 'rock']) {
        const scenes = await Promise.all(OBSTACLES.models[kind].map(loadOne));
        this.templates[kind] = scenes.filter(Boolean);
      }
    } catch (e) { /* می‌رویم سراغ جایگزین دوبعدی */ }

    if (this.templates.tree.length || this.templates.rock.length) {
      this.modelsReady = true;
      for (const ob of state.obstacles) this.attachModel(ob);
    } else {
      this.modelsFailed = true;
      for (const ob of state.obstacles) this.attachFallback(ob);
    }
  }

  // کلون یک مدل با اندازه‌ی نرمال‌شده (ارتفاع یا پهنا) و کف روی زمین
  _cloneNormalized(tplScene, target, byHeight, renderZ) {
    const inner = tplScene.clone(true);
    const box = new THREE.Box3().setFromObject(inner);
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);
    if (size.y <= 0.01) return null;
    const s = byHeight ? target / size.y : target / Math.max(size.x, size.z);
    inner.scale.setScalar(s);
    inner.position.set(-center.x * s, -box.min.y * s, -center.z * s);
    inner.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = false;
        o.renderOrder = 1000 + renderZ * 10 + 1;
      }
    });
    const holder = new THREE.Group();
    holder.add(inner);
    return holder;
  }

  attachModel(ob) {
    const v = this.visuals.get(ob.id);
    if (!v || v.group || v.fallback) return;
    const pool = this.templates[ob.kind];
    if (!pool || !pool.length) { this.attachFallback(ob); return; }
    const tpl = pool[ob.type % pool.length];

    const target = ob.kind === 'tree'
      ? OBSTACLES.treeHeight * (ob.scaleMul || 1)
      : OBSTACLES.rockWidth * (ob.scaleMul || 1);
    const main = this._cloneNormalized(tpl, target, ob.kind === 'tree', ob.z);
    if (!main) { this.attachFallback(ob); return; }

    const group = new THREE.Group();
    group.add(main);

    // 🌲 خوشه‌ی جنگلی: کنار هر مانع چند درخت/سنگ کوچک‌ترِ چسبیده به هم
    // تا زمین واقعاً شبیه جنگلِ پشت‌به‌پشت دیده شود (فقط ظاهر؛ همان یک مانع حساب می‌شود)
    let seed = 0;
    for (const ch of String(ob.id)) seed = (seed * 31 + ch.charCodeAt(0)) % 9973;
    const rnd = () => { seed = (seed * 48271) % 2147483647; return seed / 2147483647; };
    const treePool = this.templates.tree;
    const rockPool = this.templates.rock;
    if (ob.kind === 'tree' && treePool.length) {
      const extras = 2 + Math.floor(rnd() * 2); // ۲ یا ۳ درخت اضافه
      for (let i = 0; i < extras; i++) {
        const h = OBSTACLES.treeHeight * (0.55 + rnd() * 0.3);
        const ex = this._cloneNormalized(treePool[Math.floor(rnd() * treePool.length)], h, true, ob.z);
        if (!ex) continue;
        const ang = (i / extras) * Math.PI * 2 + rnd() * 0.9;
        const r = 0.52 + rnd() * 0.3;
        ex.position.set(Math.cos(ang) * r, 0, Math.sin(ang) * r * 0.8);
        ex.rotation.y = rnd() * Math.PI * 2;
        group.add(ex);
      }
      if (rockPool.length && rnd() < 0.55) {
        const ex = this._cloneNormalized(rockPool[Math.floor(rnd() * rockPool.length)], 0.55 + rnd() * 0.3, false, ob.z);
        if (ex) {
          ex.position.set(0.55 - rnd(), 0, 0.45 - rnd() * 0.5);
          group.add(ex);
        }
      }
    } else if (ob.kind === 'rock') {
      const extras = 1 + Math.floor(rnd() * 2);
      for (let i = 0; i < extras; i++) {
        const src = rnd() < 0.45 && treePool.length ? treePool : rockPool;
        if (!src.length) continue;
        const isTree = src === treePool;
        const ex = this._cloneNormalized(
          src[Math.floor(rnd() * src.length)],
          isTree ? OBSTACLES.treeHeight * 0.5 : 0.6,
          isTree, ob.z);
        if (!ex) continue;
        ex.position.set(0.5 - rnd(), 0, 0.4 - rnd() * 0.6);
        ex.rotation.y = rnd() * Math.PI * 2;
        group.add(ex);
      }
    }

    group.position.set(ob.x, 0, ob.z);
    group.rotation.y = ob.rot || 0;
    this.world.scene.add(group);
    v.group = group;
    v.baseRotZ = 0;
    v.swayPhase = Math.random() * Math.PI * 2;
  }

  attachFallback(ob) {
    const v = this.visuals.get(ob.id);
    if (!v || v.group) return;
    const sp = this.world.getSprite('obstacle:' + ob.id);
    if (!sp) return;
    v.fallback = true;
    sp.material.opacity = 1;
    sp.material.colorWrite = true;
    if (ob.kind === 'tree') {
      this.world.setSpriteTexture(sp, TREE_FILES[ob.type % 3], TREE_FALLBACK_W[ob.type % 3], ob.scaleMul || 1);
      sp.userData.sway = true;
    } else {
      sp.material.map = this.rockTexture();
      sp.material.needsUpdate = true;
      sp.scale.set(1.45 * (ob.scaleMul || 1), 1.15 * (ob.scaleMul || 1), 1);
    }
    sp.userData.baseScale.copy(sp.scale);
  }

  // ---------- هاور ----------
  setHover(ob) {
    const id = ob ? ob.id : null;
    if (this.hovered === id) return;
    this.clearHover();
    this.hovered = id;
    if (!ob) return;
    const v = this.visuals.get(ob.id);
    if (v && v.group) v.group.scale.setScalar(1.08);
    else this.world.hoverSprite('obstacle:' + ob.id, true);
  }

  clearHover() {
    if (!this.hovered) return;
    const v = this.visuals.get(this.hovered);
    if (v && v.group) v.group.scale.setScalar(1);
    else this.world.hoverSprite('obstacle:' + this.hovered, false);
    this.hovered = null;
  }

  // ---------- کلیک: انتخاب ← تأیید با سکه ----------
  interact(ob) {
    if (!ob) return;
    const now = performance.now() / 1000;
    if (this.selected && this.selected.id === ob.id && now < this.selected.until) {
      this.tryClear(ob);
      return;
    }
    this.select(ob);
  }

  select(ob) {
    this.deselect();
    this.selected = { id: ob.id, until: performance.now() / 1000 + TIMING.obstacleSelectSec };
    const labelY = ob.kind === 'tree' ? 2.35 : 1.35;
    this.ui.showPlotLabel('ob_' + ob.id, ob.x, ob.z,
      `🪓 پاک‌کردن: ${fmt(ob.cost)} سکه — دوباره کلیک کن!`, labelY);
    const el = this.ui.plotLabels.get('ob_' + ob.id);
    if (el) el.classList.add('obstacle-price');
    this.world.showHighlight(ob.x, ob.z, ob.kind === 'tree' ? 1.9 : 1.6, 0xf7c948);
    sfx.click();
    const kindName = ob.kind === 'tree' ? 'درخت' : 'سنگ';
    if (!canAfford('coins', ob.cost)) {
      this.ui.toast(`برای پاک‌کردن این ${kindName} ${fmt(ob.cost)} سکه لازم داری؛ سکه‌ات کم است! 😢 محصول بفروش تا سکه جمع کنی.`);
    }
  }

  deselect() {
    if (!this.selected) return;
    this.ui.removePlotLabel('ob_' + this.selected.id);
    this.selected = null;
    this.world.hideHighlight();
  }

  tryClear(ob) {
    if (!spend('coins', ob.cost)) {
      sfx.error();
      this.ui.toast(`سکه کافی نیست! برای این کار ${fmt(ob.cost)} سکه لازم است 🪙`);
      const v = this.visuals.get(ob.id);
      if (v) v.shake = 0.55;
      return;
    }
    this.deselect();
    if (this.hovered === ob.id) this.clearHover();

    const v = this.visuals.get(ob.id);
    if (v && v.group) this.world.scene.remove(v.group);
    this.visuals.delete(ob.id);
    this.world.removeSprite('obstacle:' + ob.id);
    this.world.explode(ob.x, ob.kind === 'tree' ? 1.1 : 0.55, ob.z, ob.kind === 'tree' ? 0x8fe07a : 0xb9a68c);
    removeObstacle(ob.id);

    const dew = REWARDS.obstacleDew[0] +
      Math.floor(Math.random() * (REWARDS.obstacleDew[1] - REWARDS.obstacleDew[0] + 1));
    addDew(dew);
    const leveled = addXp(REWARDS.obstacleXp);
    sfx.boom();
    setTimeout(() => sfx.coin(), 130);
    this.ui.floatText(ob.x, ob.z, `+${fmt(dew)} 💧`);
    this.ui.bumpCurrencies();
    if (leveled) this.ui.levelUp();
    if (ob.cell !== null) {
      this.ui.toast(`زمین باز شد! 🎉 (-${fmt(ob.cost)} سکه) حالا می‌توانی اینجا جایگاه کشت بسازی.`);
    } else {
      this.ui.toast(`پاک شد! (-${fmt(ob.cost)} سکه، +${fmt(dew)} شبنم)`);
    }
    save();
  }

  // ---------- حلقه ----------
  update(dt) {
    // انقضای انتخاب
    if (this.selected && performance.now() / 1000 >= this.selected.until) this.deselect();

    // تکان ملایم درخت‌های سه‌بعدی + لرزش هنگام سکه ناکافی
    const t = performance.now() / 1000;
    for (const [id, v] of this.visuals) {
      if (!v.group) continue;
      const ob = state.obstacles.find(o => o.id === id);
      let rz = 0;
      if (ob && ob.kind === 'tree') rz = Math.sin(t * 1.3 + (v.swayPhase || 0)) * 0.018;
      if (v.shake > 0) {
        v.shake -= dt;
        rz += Math.sin(t * 38) * 0.07 * Math.max(0, v.shake);
      }
      v.group.rotation.z = rz;
    }

    // رویش دوباره‌ی گاه‌به‌گاه در کناره‌های نقشه (فقط وحشی‌ها؛ زمین کشت پاک‌شده دیگر بسته نمی‌شود)
    this.regrowTimer += dt;
    if (this.regrowTimer >= OBSTACLES.regrowEvery) {
      this.regrowTimer = 0;
      const wild = state.obstacles.filter(o => o.cell === null).length;
      if (wild < OBSTACLES.maxWild) this.spawnWild();
    }
  }

  spawnWild() {
    // یک صحنه‌ی تصادفی (شهر یا مزرعه) و یک جای آزاد از نقطه‌های وحشی همان صحنه
    const area = Math.random() < 0.5 ? 'town' : 'farm';
    const spots = area === 'farm' ? LAYOUT.wildSpotsFarm : LAYOUT.wildSpotsTown;
    const free = spots.filter(s => !state.obstacles.some(o => Math.hypot(o.x - s.x, o.z - s.z) < 1.6));
    if (!free.length) return;
    const s = free[Math.floor(Math.random() * free.length)];
    const ob = makeWildObstacle(s.x, s.z, area);
    addObstacle(ob);
    this.syncObstacle(ob);
    if (this.modelsReady) this.attachModel(ob);
    else if (this.modelsFailed) this.attachFallback(ob);
    if (ob.kind === 'tree') {
      this.ui.toast(area === 'farm' ? 'یک درخت تازه دور مزرعه رویید! 🌳' : 'یک درخت تازه کناره‌های شهر رویید! 🌳');
    }
  }

  // ---------- بافت‌های کمکی ----------
  transparentTexture() {
    if (!this._transparentTex) {
      const c = document.createElement('canvas');
      c.width = c.height = 2;
      this._transparentTex = new THREE.CanvasTexture(c);
    }
    return this._transparentTex;
  }

  rockTexture() {
    if (this._rockTex) return this._rockTex;
    const c = document.createElement('canvas');
    c.width = 128; c.height = 96;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#9aa0a6';
    ctx.beginPath();
    ctx.moveTo(14, 86); ctx.lineTo(24, 44); ctx.lineTo(46, 22); ctx.lineTo(76, 14);
    ctx.lineTo(102, 30); ctx.lineTo(114, 86); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#b7bcc2';
    ctx.beginPath();
    ctx.moveTo(46, 22); ctx.lineTo(76, 14); ctx.lineTo(88, 46); ctx.lineTo(58, 52); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#7e858e';
    ctx.beginPath();
    ctx.moveTo(88, 46); ctx.lineTo(102, 30); ctx.lineTo(114, 86); ctx.lineTo(92, 86); ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.35)';
    ctx.beginPath(); ctx.arc(58, 32, 6, 0, Math.PI * 2); ctx.fill();
    this._rockTex = new THREE.CanvasTexture(c);
    this._rockTex.colorSpace = THREE.SRGBColorSpace;
    return this._rockTex;
  }
}
