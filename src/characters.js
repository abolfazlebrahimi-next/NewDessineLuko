// ================= آدمک‌های شهر لوکو =================
// اهالی شهر: پرسه‌زنی، رفتن داخل ساختمان‌ها، و هرازگاهی گپ دونفره با حباب حرف 💬
// مشتری‌ها هم از همین آدمک‌ها هستند: می‌آیند محصول را وارسی می‌کنند،
// شاید اولی را نپسندند و دومی را بخرند، بعد خداحافظی می‌کنند و می‌روند 🛒
//
// قد همه‌ی آدمک‌ها دقیقاً روی CHARACTERS.height تنظیم می‌شود (۰.۹۵ واحد)
// تا خیلی کوچک‌تر از خانه‌ها (۳ تا ۵ واحد) باشند.
// اگر مدل character-*.glb در public/models/characters باشد از آن استفاده می‌شود،
// وگرنه آدمک مکعبی با کد ساخته می‌شود.
import * as THREE from 'three';
import { makeGLTFLoader } from './loader.js';
import { clone as skeletonClone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { CHARACTERS, LAYOUT, CHAT_DIALOGUES, CUSTOMER_LINES, STRUCTURES, assetUrl } from './config.js';
import { state, getBuildingPos, cellPosition } from './state.js';

// مبدا شبکه‌ی سازه‌ها (مثل constructions.js) برای محاسبه‌ی برخورد دیوار/حصار
const STRUCT_ORIGINS = { town: { x: 0, z: 2 }, farm: { x: 0, z: 75 } };

const S = {
  IDLE: 'idle',
  WALK: 'walk',
  INSIDE: 'inside',
  TO_CHAT: 'toChat',
  CHAT: 'chat',
  CUST_WALK: 'custWalk',
  CUST_ACT: 'custAct',
  CUST_LEAVE: 'custLeave',
};

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const fill = (tpl, crop) => (tpl || '').replace('{crop}', crop || 'محصول');

const SKINS = [0xf6c79a, 0xe8b088, 0xc98a5e, 0x8a5a3b];
const SHIRTS = [0x5b8fd6, 0xe2574c, 0x58c470, 0xf0b84e, 0x9b6dd6, 0x38b6b0, 0xe87fb0, 0xf2f0e4];
const PANTS = [0x3d4a66, 0x6b4a2f, 0x4a4a4a, 0x71806a, 0x8c4a56];
const HAIRS = [0x33261a, 0x6b421c, 0xd9a441, 0x222222, 0xb0483a, 0x888888];

export class Characters {
  constructor(world, ui) {
    this.world = world;
    this.ui = ui;
    this.group = new THREE.Group();
    this.world.scene.add(this.group);
    this.loader = makeGLTFLoader(); // با دیکدر Meshopt — مدل‌های فشرده هم لود می‌شوند
    this.people = [];
    this.templates = [];      // [{ scene, animations }]
    this.tplCursor = 0;
    this.ready = false;
    this.seq = 0;
    this.customer = null;
    this.chatTimer = 5 + Math.random() * 4;
    this._colliders = null;     // کش مستطیل‌های برخورد (ساختمان/جایگاه/دیوار/…)
    this._collidersAt = 0;
  }

  async init() {
    const loadOne = (v) => new Promise((resolve) => {
      let done = false;
      const finish = (val) => { if (!done) { done = true; resolve(val); } };
      const timer = setTimeout(() => finish(null), 6000);
      try {
        this.loader.load(
          encodeURI(assetUrl(`${CHARACTERS.modelPath}character-${v}.glb`)),
          (gltf) => { clearTimeout(timer); finish({ scene: gltf.scene, animations: gltf.animations }); },
          undefined,
          () => { clearTimeout(timer); finish(null); },
        );
      } catch (e) { clearTimeout(timer); finish(null); }
    });

    try {
      const loaded = await Promise.all(CHARACTERS.variants.map(loadOne));
      this.templates = loaded.filter(Boolean);
    } catch (e) {
      this.templates = [];
    }

    this.ready = true;
    for (let i = 0; i < CHARACTERS.count; i++) {
      const p = this._randomPointIn(CHARACTERS.wander);
      this.createPerson('villager', p.x, p.z, 'town');
    }
    for (let i = 0; i < (CHARACTERS.farmCount || 0); i++) {
      const p = this._randomPointIn(CHARACTERS.wanderFarm);
      this.createPerson('villager', p.x, p.z, 'farm');
    }
  }

  // ---------- ساخت یک آدمک ----------
  createPerson(role, x, z, area = 'town') {
    const heightMul = 0.92 + Math.random() * 0.14;
    let model, mixer = null, actions = null, limbs = null;

    if (this.templates.length) {
      const tpl = this.templates[this.tplCursor++ % this.templates.length];
      model = skeletonClone(tpl.scene);
      model.traverse((o) => {
        if (o.isMesh || o.isSkinnedMesh) {
          o.castShadow = false;
          o.frustumCulled = true;
          o.material = o.material.clone();
          o.material.transparent = true;
          o.material.depthWrite = true;
        }
      });
      // تنظیم دقیق قد — آدمک نباید از خانه بزرگ‌تر شود!
      const box = new THREE.Box3().setFromObject(model);
      const size = new THREE.Vector3();
      box.getSize(size);
      const s = size.y > 0.01 ? (CHARACTERS.height * heightMul) / size.y : 0.5;
      model.scale.setScalar(s);
      model.position.set(x, -box.min.y * s, z);

      mixer = new THREE.AnimationMixer(model);
      actions = {};
      for (const clip of tpl.animations) actions[clip.name] = mixer.clipAction(clip);
      for (const name of ['walk', 'idle', 'sprint']) {
        if (actions[name]) actions[name].setLoop(THREE.LoopRepeat, Infinity);
      }
    } else {
      const built = this._buildBlocky(heightMul);
      model = built.group;
      limbs = built.limbs;
      model.position.set(x, 0, z);
    }

    const sh = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ map: this.world.shadowTex, transparent: true, depthWrite: false })
    );
    sh.rotation.x = -Math.PI / 2;
    sh.scale.set(0.55, 0.28, 1);
    sh.position.set(x, 0.025, z);
    this.group.add(sh);
    this.group.add(model);

    // اگر نقطه‌ی ظاهرشدن داخل ساختمان/جایگاه/دیوار بود، به نزدیک‌ترین جای آزاد هلش بده
    if (!this.isFree(model.position.x, model.position.z)) {
      const free = this._nearestFreePoint(model.position.x, model.position.z);
      model.position.x = free.x;
      model.position.z = free.z;
      sh.position.set(free.x, 0.025, free.z);
    }

    const person = {
      id: 'person_' + (this.seq++),
      role, area, model, mixer, actions, limbs, shadow: sh,
      state: S.IDLE,
      target: null,
      path: null,        // مسیر محاسبه‌شده دور موانع (نقطه‌های راه)
      stuckT: 0,
      replanAt: 0,
      timer: 0.5 + Math.random() * 2.5,
      speed: CHARACTERS.speed * (0.85 + Math.random() * 0.35),
      insideTimer: 0,
      enterBuilding: null,
      currentAction: null,
      currentName: null,
      moving: false,
      walkPhase: Math.random() * Math.PI * 2,
      talking: false,
      groundY: model.position.y,
      bubbleTimer: 0,
      chat: null,
      chatIdx: 0,
      chatSlot: null,
      cust: null,
    };
    this.people.push(person);
    this._playAction(person, 'idle');
    return person;
  }

  // آدمک مکعبی با کد (وقتی مدل GLB نیست) — قد کل ~۰.۹۵ واحد
  _buildBlocky(heightMul) {
    const skin = pick(SKINS), shirt = pick(SHIRTS), pants = pick(PANTS), hair = pick(HAIRS);
    const mat = (c) => new THREE.MeshLambertMaterial({ color: c });
    const box = (w, h, d, c, x, y, z) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(c));
      m.position.set(x, y, z);
      return m;
    };

    const group = new THREE.Group();
    const body = new THREE.Group();
    group.add(body);
    group.scale.setScalar(heightMul * (CHARACTERS.height / 0.97));

    // پاها (محور در لگن، برای تاب‌خوردن هنگام راه‌رفتن)
    const makeLeg = (sx) => {
      const g = new THREE.Group();
      g.position.set(sx * 0.085, 0.32, 0);
      g.add(box(0.11, 0.32, 0.13, pants, 0, -0.16, 0));
      g.add(box(0.11, 0.06, 0.19, 0x3a2a1c, 0, -0.30, 0.03)); // کفش
      body.add(g);
      return g;
    };
    const makeArm = (sx) => {
      const g = new THREE.Group();
      g.position.set(sx * 0.225, 0.66, 0);
      g.add(box(0.09, 0.34, 0.11, shirt, 0, -0.15, 0));
      g.add(box(0.09, 0.07, 0.11, skin, 0, -0.33, 0)); // دست
      body.add(g);
      return g;
    };

    const legL = makeLeg(-1), legR = makeLeg(1);
    body.add(box(0.36, 0.36, 0.2, shirt, 0, 0.5, 0));           // تنه
    const armL = makeArm(-1), armR = makeArm(1);
    const head = new THREE.Group();
    head.position.set(0, 0.68, 0);
    head.add(box(0.27, 0.24, 0.25, skin, 0, 0.12, 0));          // سر
    head.add(box(0.29, 0.07, 0.27, hair, 0, 0.255, 0));         // مو
    head.add(box(0.035, 0.05, 0.012, 0x26201c, -0.06, 0.13, 0.128)); // چشم‌ها
    head.add(box(0.035, 0.05, 0.012, 0x26201c, 0.06, 0.13, 0.128));
    body.add(head);

    return { group, limbs: { legL, legR, armL, armR, head, body } };
  }

  _despawn(person) {
    this._hideBubble(person);
    this.group.remove(person.model);
    this.group.remove(person.shadow);
    this.people = this.people.filter(p => p !== person);
    if (this.customer === person) this.customer = null;
  }

  _playAction(person, name) {
    if (!person.actions) return;
    const a = person.actions[name] || person.actions[name === 'walk' ? 'walk' : 'idle'];
    if (!a || person.currentAction === a) return;
    if (person.currentAction) person.currentAction.fadeOut(0.22);
    a.reset().fadeIn(0.22).play();
    person.currentAction = a;
    person.currentName = name;
  }

  // ---------- حباب حرف ----------
  _say(person, text, sec = 2) {
    if (!this.ui || !text) return;
    const pos = person.model.position;
    this.ui.showBubble('bubble_' + person.id, pos.x, pos.z, text, CHARACTERS.height + 0.32);
    person.bubbleTimer = sec;
  }

  _hideBubble(person) {
    person.bubbleTimer = 0;
    if (this.ui) this.ui.hideBubble('bubble_' + person.id);
  }

  // ---------- حرکت ----------
  _randomPointIn(w) {
    return {
      x: w.minX + Math.random() * (w.maxX - w.minX),
      z: w.minZ + Math.random() * (w.maxZ - w.minZ),
    };
  }

  _wanderOf(person) {
    return person && person.area === 'farm' ? CHARACTERS.wanderFarm : CHARACTERS.wander;
  }

  _randomPoint(person) {
    return this._randomPointIn(this._wanderOf(person));
  }

  _buildingDoor(b) {
    const sp = this.world.getSprite('building:' + b.id);
    const x = sp ? sp.position.x : b.x;
    const z = sp ? sp.position.z : b.z;
    return { x, z: z + 1.6 };
  }

  // ---------- ناوبری: آدمک‌ها از وسط اشیا رد نمی‌شوند ----------
  // مستطیل‌های برخوردِ همه‌ی چیزهای روی نقشه: ساختمان‌ها، خانه‌ی مزرعه،
  // جایگاه‌های کشت، درخت/سنگ‌ها، سازه‌های بازیکن (دیوار/حصار/چادر/خانه) و آغل.
  _colliderRects() {
    const now = performance.now();
    if (this._colliders && now - this._collidersAt < 1000) return this._colliders;
    const rects = [];
    const add = (x, z, rx, rz) => rects.push({ x, z, rx, rz });

    for (const b of LAYOUT.buildings) {
      const pos = getBuildingPos(b.id, b.x, b.z);
      add(pos.x, pos.z, b.w * 0.42, Math.max(0.7, b.w * 0.17));
    }
    const fh = LAYOUT.farmhouse;
    add(fh.x, fh.z, fh.w * 0.42, Math.max(0.7, fh.w * 0.17));

    for (const p of state.plots) {
      const cp = cellPosition(p.cell);
      add(cp.x, cp.z, 0.88, 0.62);
    }
    for (const ob of state.obstacles) {
      if (ob.kind === 'tree') add(ob.x, ob.z, 0.72, 0.52);
      else add(ob.x, ob.z, 0.58, 0.44);
    }
    const scell = STRUCTURES.cell;
    for (const st of state.structures) {
      const spec = STRUCTURES.kinds[st.kind];
      if (!spec) continue;
      const o = STRUCT_ORIGINS[st.area] || STRUCT_ORIGINS.town;
      const cx = o.x + (st.gx + spec.cells / 2) * scell;
      const cz = o.z + (st.gz + spec.cells / 2) * scell;
      if (spec.rotatable) {
        // حصار/دیوار باریک‌اند؛ ضخامت کم، طول یک خانه
        if (st.rot) add(cx, cz, 0.2, scell / 2);
        else add(cx, cz, scell / 2, 0.2);
      } else {
        const h = (spec.cells * scell) / 2 * 0.82;
        add(cx, cz, h, h);
      }
    }
    const pen = LAYOUT.animalPen; // آدم‌ها داخل آغل نمی‌روند
    add((pen.minX + pen.maxX) / 2, (pen.minZ + pen.maxZ) / 2,
      (pen.maxX - pen.minX) / 2, (pen.maxZ - pen.minZ) / 2);

    this._colliders = rects;
    this._collidersAt = now;
    return rects;
  }

  // آیا نقطه آزاد است؟ (با حاشیه‌ی شعاع بدن آدمک)
  isFree(x, z, pad = 0.26) {
    for (const r of this._colliderRects()) {
      if (Math.abs(x - r.x) < r.rx + pad && Math.abs(z - r.z) < r.rz + pad) return false;
    }
    return true;
  }

  _nearestFreePoint(x, z) {
    if (this.isFree(x, z)) return { x, z };
    for (let r = 0.4; r <= 3.4; r += 0.4) {
      const steps = Math.max(8, Math.floor(r * 10));
      for (let i = 0; i < steps; i++) {
        const a = (i / steps) * Math.PI * 2;
        const nx = x + Math.cos(a) * r;
        const nz = z + Math.sin(a) * r;
        if (this.isFree(nx, nz)) return { x: nx, z: nz };
      }
    }
    return { x, z };
  }

  _randomFreePoint(person) {
    const w = this._wanderOf(person);
    let pt = this._randomPointIn(w);
    for (let i = 0; i < 14; i++) {
      if (this.isFree(pt.x, pt.z)) return pt;
      pt = this._randomPointIn(w);
    }
    return this._nearestFreePoint(pt.x, pt.z);
  }

  // مسیریابی A* روی شبکه‌ی کل نقشه — دور همه‌ی موانع
  _findPath(from, to) {
    const CELL = 0.8, MINX = -20, MINZ = -11, W = 50, H = 132;
    const idx = (cx, cz) => cz * W + cx;
    const clampI = (v, m) => Math.max(0, Math.min(m - 1, v));
    const toCell = (x, z) => ({
      cx: clampI(Math.floor((x - MINX) / CELL), W),
      cz: clampI(Math.floor((z - MINZ) / CELL), H),
    });
    const center = (cx, cz) => ({ x: MINX + (cx + 0.5) * CELL, z: MINZ + (cz + 0.5) * CELL });

    const blocked = new Uint8Array(W * H);
    for (const r of this._colliderRects()) {
      const x0 = clampI(Math.floor((r.x - r.rx - 0.3 - MINX) / CELL), W);
      const x1 = clampI(Math.floor((r.x + r.rx + 0.3 - MINX) / CELL), W);
      const z0 = clampI(Math.floor((r.z - r.rz - 0.3 - MINZ) / CELL), H);
      const z1 = clampI(Math.floor((r.z + r.rz + 0.3 - MINZ) / CELL), H);
      for (let cz = z0; cz <= z1; cz++) {
        for (let cx = x0; cx <= x1; cx++) blocked[idx(cx, cz)] = 1;
      }
    }

    const findFreeCell = (c) => {
      if (!blocked[idx(c.cx, c.cz)]) return c;
      const seen = new Uint8Array(W * H);
      const queue = [idx(c.cx, c.cz)];
      seen[queue[0]] = 1;
      while (queue.length) {
        const cur = queue.shift();
        const cx = cur % W, cz = Math.floor(cur / W);
        if (!blocked[cur]) return { cx, cz };
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = cx + dx, nz = cz + dz;
          if (nx < 0 || nz < 0 || nx >= W || nz >= H) continue;
          const ni = idx(nx, nz);
          if (!seen[ni]) { seen[ni] = 1; queue.push(ni); }
        }
        if (queue.length > 900) break;
      }
      return null;
    };

    let s = toCell(from.x, from.z);
    let g0 = toCell(to.x, to.z);
    const goalBlocked = blocked[idx(g0.cx, g0.cz)] === 1;
    s = findFreeCell(s);
    const g = findFreeCell(g0);
    if (!s || !g) return null;
    const finalPoint = goalBlocked ? center(g.cx, g.cz) : { x: to.x, z: to.z };

    const gScore = new Float32Array(W * H).fill(Infinity);
    const came = new Int32Array(W * H).fill(-1);
    const closed = new Uint8Array(W * H);
    const heapF = [], heapI = [];
    const push = (f, i) => {
      heapF.push(f); heapI.push(i);
      let c = heapF.length - 1;
      while (c > 0) {
        const p = (c - 1) >> 1;
        if (heapF[p] <= heapF[c]) break;
        [heapF[p], heapF[c]] = [heapF[c], heapF[p]];
        [heapI[p], heapI[c]] = [heapI[c], heapI[p]];
        c = p;
      }
    };
    const pop = () => {
      const top = heapI[0];
      const lf = heapF.pop(), li = heapI.pop();
      if (heapF.length) {
        heapF[0] = lf; heapI[0] = li;
        let c = 0;
        for (;;) {
          const l = c * 2 + 1, r = l + 1;
          let m = c;
          if (l < heapF.length && heapF[l] < heapF[m]) m = l;
          if (r < heapF.length && heapF[r] < heapF[m]) m = r;
          if (m === c) break;
          [heapF[m], heapF[c]] = [heapF[c], heapF[m]];
          [heapI[m], heapI[c]] = [heapI[c], heapI[m]];
          c = m;
        }
      }
      return top;
    };
    const heuristic = (cx, cz) => {
      const dx = Math.abs(cx - g.cx), dz = Math.abs(cz - g.cz);
      return (dx + dz) + (Math.SQRT2 - 2) * Math.min(dx, dz);
    };

    const startI = idx(s.cx, s.cz), goalI = idx(g.cx, g.cz);
    gScore[startI] = 0;
    push(heuristic(s.cx, s.cz), startI);
    let found = startI === goalI;
    let guard = 0;
    while (heapF.length && guard++ < 9000) {
      const cur = pop();
      if (cur === goalI) { found = true; break; }
      if (closed[cur]) continue;
      closed[cur] = 1;
      const cx = cur % W, cz = Math.floor(cur / W);
      for (let dz = -1; dz <= 1; dz++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dz) continue;
          const nx = cx + dx, nz = cz + dz;
          if (nx < 0 || nz < 0 || nx >= W || nz >= H) continue;
          const ni = idx(nx, nz);
          if (blocked[ni] || closed[ni]) continue;
          // حرکت قطری از گوشه‌ی دیوار رد نمی‌شود
          if (dx && dz && (blocked[idx(cx + dx, cz)] || blocked[idx(cx, cz + dz)])) continue;
          const cost = gScore[cur] + (dx && dz ? Math.SQRT2 : 1);
          if (cost < gScore[ni]) {
            gScore[ni] = cost;
            came[ni] = cur;
            push(cost + heuristic(nx, nz), ni);
          }
        }
      }
    }
    if (!found && came[goalI] === -1 && goalI !== startI) return null;

    // بازسازی + ساده‌سازی مسیر (حذف نقطه‌های هم‌راستا)
    const cells = [];
    let cur = goalI;
    while (cur !== -1) {
      cells.push(cur);
      if (cur === startI) break;
      cur = came[cur];
    }
    cells.reverse();
    const pts = [];
    let prevDir = null;
    for (let i = 1; i < cells.length; i++) {
      const cx = cells[i] % W, cz = Math.floor(cells[i] / W);
      const px = cells[i - 1] % W, pz = Math.floor(cells[i - 1] / W);
      const dir = Math.sign(cx - px) + ',' + Math.sign(cz - pz);
      if (dir !== prevDir || i === cells.length - 1) {
        pts.push(center(cx, cz));
        prevDir = dir;
      }
    }
    if (!pts.length) pts.push(finalPoint);
    else pts[pts.length - 1] = finalPoint;
    return pts;
  }

  // مقصد جدید با مسیر دور موانع
  _setDest(p, x, z) {
    const pos = p.model.position;
    const pts = this._findPath({ x: pos.x, z: pos.z }, { x, z });
    if (pts && pts.length) {
      p.path = pts;
      p.target = { ...pts[pts.length - 1] };
    } else {
      p.path = null;
      p.target = { x, z };
    }
    p.stuckT = 0;
    p.replanAt = 0;
  }

  _moveToward(p, dt, arriveDist = 0.24) {
    if (!p.target) { p.moving = false; return true; }
    const pos = p.model.position;

    let wp = (p.path && p.path.length) ? p.path[0] : p.target;
    let dx = wp.x - pos.x;
    let dz = wp.z - pos.z;
    let d = Math.hypot(dx, dz);
    while (p.path && p.path.length > 1 && d < 0.22) {
      p.path.shift();
      wp = p.path[0];
      dx = wp.x - pos.x;
      dz = wp.z - pos.z;
      d = Math.hypot(dx, dz);
    }

    const distFinal = Math.hypot(p.target.x - pos.x, p.target.z - pos.z);
    if ((!p.path || p.path.length <= 1) && distFinal < arriveDist) {
      p.moving = false;
      p.path = null;
      return true;
    }
    if (d < 0.04) {
      if (p.path && p.path.length > 1) { p.path.shift(); return false; }
      p.moving = false;
      return true;
    }

    const stepLen = Math.min(d, p.speed * dt);
    const nx = pos.x + (dx / d) * stepLen;
    const nz = pos.z + (dz / d) * stepLen;
    if (this.isFree(nx, nz)) {
      pos.x = nx; pos.z = nz; p.stuckT = 0;
    } else if (this.isFree(nx, pos.z)) {
      pos.x = nx; p.stuckT = 0; // سرخوردن کنار مانع
    } else if (this.isFree(pos.x, nz)) {
      pos.z = nz; p.stuckT = 0;
    } else {
      // گیر کرده: یک بار مسیر تازه حساب کن؛ اگر باز نشد این پا را رها کن
      p.stuckT = (p.stuckT || 0) + dt;
      const now = performance.now();
      if (now > (p.replanAt || 0)) {
        p.replanAt = now + 1500;
        const pts = this._findPath({ x: pos.x, z: pos.z }, p.target);
        if (pts && pts.length) p.path = pts;
      }
      if (p.stuckT > 1.4) {
        p.moving = false;
        p.path = null;
        return true;
      }
      p.moving = false;
      return false;
    }
    p.moving = true;
    this._faceToward(p, wp.x, wp.z, dt);
    return false;
  }

  _faceToward(p, x, z, dt) {
    const pos = p.model.position;
    const dx = x - pos.x, dz = z - pos.z;
    if (Math.hypot(dx, dz) < 0.01) return;
    const targetRot = Math.atan2(dx, dz);
    let diff = targetRot - p.model.rotation.y;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    p.model.rotation.y += diff * Math.min(1, dt * 9);
  }

  _fade(person, visible) {
    person.model.traverse((o) => {
      if (o.isMesh || o.isSkinnedMesh) {
        o.visible = visible;
        if (o.material && 'opacity' in o.material) o.material.opacity = visible ? 1 : 0;
      }
    });
    person.shadow.visible = visible;
  }

  _pickTarget(person) {
    // فقط اهالی شهر داخل ساختمان‌ها می‌روند؛ اهالی مزرعه دور زمین می‌گردند
    if (person.area === 'town' && Math.random() < CHARACTERS.enterChance) {
      const b = pick(LAYOUT.buildings);
      const door = this._buildingDoor(b);
      this._setDest(person, door.x, door.z);
      person.enterBuilding = b;
      return;
    }
    person.enterBuilding = null;
    { const pt = this._randomFreePoint(person); this._setDest(person, pt.x, pt.z); }
  }

  // ---------- گپ دونفره ----------
  _tryStartChat() {
    const free = this.people.filter(p =>
      p.role === 'villager' && !p.chat && (p.state === S.IDLE || p.state === S.WALK));
    if (free.length < 2) return;
    const a = pick(free);
    let b = null, best = Infinity;
    for (const p of free) {
      if (p === a || p.area !== a.area) continue; // گپ فقط داخل همان صحنه
      const d = (p.model.position.x - a.model.position.x) ** 2 +
                (p.model.position.z - a.model.position.z) ** 2;
      if (d < best) { best = d; b = p; }
    }
    if (!b) return;

    const w = this._wanderOf(a);
    const mx = THREE.MathUtils.clamp((a.model.position.x + b.model.position.x) / 2, w.minX, w.maxX);
    const mz = THREE.MathUtils.clamp((a.model.position.z + b.model.position.z) / 2, w.minZ, w.maxZ);
    let dx = b.model.position.x - a.model.position.x;
    let dz = b.model.position.z - a.model.position.z;
    const len = Math.hypot(dx, dz) || 1;
    dx /= len; dz /= len;

    const chat = {
      lines: pick(CHAT_DIALOGUES),
      lineIdx: -1,
      lineTimer: 0,
      started: false,
      dur: CHARACTERS.chat.durMin + Math.random() * (CHARACTERS.chat.durMax - CHARACTERS.chat.durMin),
      a, b,
    };
    a.chat = chat; a.chatIdx = 0; a.enterBuilding = null;
    b.chat = chat; b.chatIdx = 1; b.enterBuilding = null;
    a.chatSlot = { x: mx - dx * 0.38, z: mz - dz * 0.38 };
    b.chatSlot = { x: mx + dx * 0.38, z: mz + dz * 0.38 };
    this._setDest(a, a.chatSlot.x, a.chatSlot.z);
    this._setDest(b, b.chatSlot.x, b.chatSlot.z);
    a.state = S.TO_CHAT; b.state = S.TO_CHAT;
  }

  _endChat(chat) {
    for (const p of [chat.a, chat.b]) {
      if (!p) continue;
      p.chat = null;
      p.chatSlot = null;
      p.talking = false;
      this._hideBubble(p);
      if (p.state === S.CHAT || p.state === S.TO_CHAT) {
        p.state = S.IDLE;
        p.timer = 0.6 + Math.random() * 1.4;
        this._playAction(p, 'idle');
      }
    }
  }

  _updateChatTalk(chat, dt) {
    // فقط نفر اول ساعت دیالوگ را جلو می‌برد
    if (!chat.started) {
      if (chat.a.state !== S.CHAT || chat.b.state !== S.CHAT) return;
      chat.started = true;
      chat.lineTimer = 0.35;
    }
    chat.dur -= dt;
    chat.lineTimer -= dt;
    if (chat.lineTimer <= 0) {
      chat.lineIdx += 1;
      if (chat.lineIdx >= chat.lines.length || chat.dur <= 0) {
        this._endChat(chat);
        return;
      }
      chat.lineTimer = CHARACTERS.chat.lineSec;
      const speaker = chat.lineIdx % 2 === 0 ? chat.a : chat.b;
      const other = speaker === chat.a ? chat.b : chat.a;
      // فقط کنار هم می‌ایستند و با حرکت دست گپ می‌زنند — بدون حباب متن
      other.talking = false;
      this._playAction(other, 'idle');
      speaker.talking = true;
      this._playAction(speaker, speaker.actions && speaker.actions['emote-yes'] ? 'emote-yes' : 'idle');
    }
    if (chat.dur <= 0) this._endChat(chat);
  }

  // ================= مشتری =================
  /**
   * stops: [{ plotId, x, z, faceX, faceZ, cropName, decision: 'buy'|'reject' }]
   * مشتری به نوبت سر هر ایستگاه می‌رود، محصول را وارسی می‌کند و طبق decision
   * یا رد می‌کند و سراغ بعدی می‌رود یا می‌خرد و خداحافظی می‌کند.
   */
  requestCustomer({ stops, isReady, onBuy, onDone }) {
    if (!this.ready || this.customer || !stops || !stops.length) return false;
    const side = Math.random() < 0.5 ? -1 : 1;
    const gateX = CHARACTERS.gate.x * side;
    const person = this.createPerson('customer', gateX, CHARACTERS.gate.z, 'farm');
    person.speed = CHARACTERS.speed * 1.2;
    person.cust = {
      stops, idx: 0, isReady, onBuy, onDone, gateX,
      phase: 'go', timer: 0, bought: false,
    };
    person.state = S.CUST_WALK;
    this._setDest(person, stops[0].x, stops[0].z);
    this.customer = person;
    this._say(person, pick(CUSTOMER_LINES.arrive), 2.4);
    return true;
  }

  get customerActive() { return !!this.customer; }

  _custNextStop(p) {
    const c = p.cust;
    c.idx += 1;
    if (c.idx < c.stops.length) {
      c.phase = 'go';
      p.state = S.CUST_WALK;
      this._setDest(p, c.stops[c.idx].x, c.stops[c.idx].z);
    } else {
      p.state = S.CUST_LEAVE;
      this._setDest(p, c.gateX, CHARACTERS.gate.z);
    }
  }

  _updateCustomer(p, dt) {
    const c = p.cust;
    if (!c) return;
    const stop = c.stops[c.idx];

    if (p.state === S.CUST_WALK) {
      if (!stop) { this._custNextStop(p); return; }
      if (this._moveToward(p, dt, 0.28)) {
        p.state = S.CUST_ACT;
        p.moving = false;
        if (!c.isReady(stop.plotId)) {
          c.phase = 'gone';
          c.timer = 1.3;
          this._say(p, pick(CUSTOMER_LINES.gone), 1.3);
        } else {
          c.phase = 'inspect';
          c.timer = 1.6;
          this._say(p, fill(pick(CUSTOMER_LINES.inspect), stop.cropName), 1.6);
        }
        this._playAction(p, 'idle');
      } else {
        this._playAction(p, 'walk');
      }
      return;
    }

    if (p.state === S.CUST_ACT) {
      if (stop) this._faceToward(p, stop.faceX, stop.faceZ, dt);
      c.timer -= dt;
      if (c.timer > 0) return;

      if (c.phase === 'gone') { this._custNextStop(p); return; }

      if (c.phase === 'inspect') {
        if (!c.isReady(stop.plotId)) {
          c.phase = 'gone';
          c.timer = 1.2;
          this._say(p, pick(CUSTOMER_LINES.gone), 1.2);
          return;
        }
        if (stop.decision === 'buy') {
          c.phase = 'buy';
          c.timer = 1.7;
          p.talking = true;
          this._say(p, fill(pick(CUSTOMER_LINES.buy), stop.cropName), 1.7);
          this._playAction(p, p.actions && p.actions['emote-yes'] ? 'emote-yes' : 'idle');
        } else {
          c.phase = 'reject';
          c.timer = 1.7;
          this._say(p, fill(pick(CUSTOMER_LINES.reject), stop.cropName), 1.7);
          this._playAction(p, p.actions && p.actions['emote-no'] ? 'emote-no' : 'idle');
        }
        return;
      }

      if (c.phase === 'reject') {
        p.talking = false;
        this._custNextStop(p);
        return;
      }

      if (c.phase === 'buy') {
        p.talking = false;
        if (c.isReady(stop.plotId)) {
          c.bought = true;
          try { c.onBuy(stop.plotId); } catch (e) { console.error('[customer buy]', e); }
        }
        c.phase = 'thanks';
        c.timer = 1.4;
        this._say(p, pick(CUSTOMER_LINES.thanks), 1.4);
        this._playAction(p, 'idle');
        return;
      }

      if (c.phase === 'thanks') {
        p.state = S.CUST_LEAVE;
        this._setDest(p, c.gateX, CHARACTERS.gate.z);
      }
      return;
    }

    if (p.state === S.CUST_LEAVE) {
      if (this._moveToward(p, dt, 0.4)) {
        const done = c.onDone;
        this._despawn(p);
        if (done) { try { done(); } catch (e) { /* ok */ } }
      } else {
        this._playAction(p, 'walk');
      }
    }
  }

  // ================= حلقه‌ی اصلی =================
  update(dt) {
    if (!this.ready) return;
    const step = Math.min(dt, 0.08);
    const t = performance.now() / 1000;

    // زمان‌بندی گپ‌های دونفره
    this.chatTimer -= step;
    if (this.chatTimer <= 0) {
      this.chatTimer = CHARACTERS.chat.everyMin +
        Math.random() * (CHARACTERS.chat.everyMax - CHARACTERS.chat.everyMin);
      this._tryStartChat();
    }

    for (const p of [...this.people]) {
      if (p.mixer) p.mixer.update(step);
      const pos = p.model.position;

      switch (p.state) {
        case S.IDLE: {
          p.moving = false;
          if (p.currentName !== 'idle' && !p.chat) this._playAction(p, 'idle');
          p.timer -= step;
          if (p.timer <= 0 && p.role === 'villager') {
            this._pickTarget(p);
            p.state = S.WALK;
            this._playAction(p, 'walk');
          }
          break;
        }
        case S.WALK: {
          if (this._moveToward(p, step)) {
            if (p.enterBuilding) {
              p.state = S.INSIDE;
              p.insideTimer = CHARACTERS.insideMin +
                Math.random() * (CHARACTERS.insideMax - CHARACTERS.insideMin);
              p.enterBuilding = null;
              this._hideBubble(p);
              this._fade(p, false);
              this._playAction(p, 'idle');
            } else {
              p.state = S.IDLE;
              p.timer = CHARACTERS.idleMin + Math.random() * (CHARACTERS.idleMax - CHARACTERS.idleMin);
              this._playAction(p, Math.random() < 0.2 && p.actions && p.actions['emote-yes'] ? 'emote-yes' : 'idle');
            }
          } else if (p.currentName !== 'walk') {
            this._playAction(p, 'walk');
          }
          break;
        }
        case S.INSIDE: {
          p.moving = false;
          p.insideTimer -= step;
          if (p.insideTimer <= 0) {
            this._fade(p, true);
            p.enterBuilding = null;
            { const pt = this._randomFreePoint(p); this._setDest(p, pt.x, pt.z); }
            p.state = S.WALK;
            this._playAction(p, 'walk');
          }
          break;
        }
        case S.TO_CHAT: {
          if (!p.chat) { p.state = S.IDLE; break; }
          if (this._moveToward(p, step, 0.16)) {
            p.state = S.CHAT;
            p.moving = false;
            this._playAction(p, 'idle');
          } else if (p.currentName !== 'walk') {
            this._playAction(p, 'walk');
          }
          break;
        }
        case S.CHAT: {
          p.moving = false;
          if (!p.chat) { p.state = S.IDLE; break; }
          const partner = p.chatIdx === 0 ? p.chat.b : p.chat.a;
          if (partner) this._faceToward(p, partner.model.position.x, partner.model.position.z, step);
          if (p.chatIdx === 0) this._updateChatTalk(p.chat, step);
          break;
        }
        case S.CUST_WALK:
        case S.CUST_ACT:
        case S.CUST_LEAVE: {
          this._updateCustomer(p, step);
          break;
        }
      }

      // انیمیشن آدمک مکعبی
      if (p.limbs) {
        const L = p.limbs;
        if (p.moving) {
          p.walkPhase += step * p.speed * 7.5;
          const s = Math.sin(p.walkPhase);
          L.legL.rotation.x = s * 0.65;
          L.legR.rotation.x = -s * 0.65;
          L.armL.rotation.x = -s * 0.5;
          L.armR.rotation.x = s * 0.5;
          L.body.position.y = Math.abs(Math.cos(p.walkPhase)) * 0.03;
        } else {
          const k = Math.min(1, step * 10);
          L.legL.rotation.x *= (1 - k);
          L.legR.rotation.x *= (1 - k);
          L.armL.rotation.x *= (1 - k);
          if (p.talking) {
            // ژست حرف‌زدن: دست تکان می‌خورد و بدن کمی بالا-پایین می‌شود
            L.armR.rotation.x = -0.7 + Math.sin(t * 9 + p.walkPhase) * 0.3;
            L.body.position.y = Math.abs(Math.sin(t * 7 + p.walkPhase)) * 0.02;
            L.head.rotation.y = Math.sin(t * 2.2 + p.walkPhase) * 0.12;
          } else {
            L.armR.rotation.x *= (1 - k);
            L.body.position.y = Math.sin(t * 1.8 + p.walkPhase) * 0.008;
            L.head.rotation.y *= (1 - k);
          }
        }
      }

      // حباب حرف: دنبال‌کردن آدمک و اتمام زمان
      if (p.bubbleTimer > 0) {
        p.bubbleTimer -= step;
        if (this.ui) this.ui.moveBubble('bubble_' + p.id, pos.x, pos.z);
        if (p.bubbleTimer <= 0) this._hideBubble(p);
      }

      // سایه و ترتیب رندر
      p.shadow.position.set(pos.x, 0.025, pos.z);
      p.model.traverse((o) => {
        if (o.isMesh || o.isSkinnedMesh) o.renderOrder = 1000 + pos.z * 10 + 2;
      });
    }
  }
}
