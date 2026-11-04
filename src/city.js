// ================= شهر لوکو (سمتِ بازی، بدونِ WebGL) =================
// چیدمانِ شهر در src/plan.js ساخته می‌شود (همان کدی که ابزارِ پختِ اسپریت اجرا
// می‌کند). این فایل فقط موجوداتِ متحرک را زنده نگه می‌دارد: ترافیک، عابرها،
// اسکیت‌سوارها، چراغ‌های راهنما و رویدادها.
//
// نکته‌ی مهم: هیچ مثلث/متریال/بافتی در مرورگر ساخته نمی‌شود. هر چیزِ ثابت با
// شماره‌ی قابِ پخته‌شده در units.json آدرس داده می‌شود و بازی فقط drawImage می‌زند.
import { CITY } from './config.js';
import { atlas, frameIndexFor } from './scene2d.js';
import { CAM_UP } from './cam.js';
import {
  buildPlan, setSizeTable, rectPoint, roundRectPoint, carScale, PED_LOOKS, SKATER_LOOKS, PED_SCALE,
} from './plan.js';

// مسیرهای حرکت (برای تست‌ها و بقیه‌ی ماژول‌ها)
export { rectPoint, roundRectPoint };

// ================= شکل‌های کدساز =================
// این‌ها هم در نود (پختِ افلاین) و هم در مرورگر (قابِ احتیاطی) قابلِ استفاده‌اند.
const primCache = new Map();
function prims(kind) {
  if (primCache.has(kind)) return primCache.get(kind);
  const TAU = Math.PI * 2;
  let g;
  if (kind === 'box') {
    g = {
      pos: [-0.5, -0.5, 0.5, 0.5, -0.5, 0.5, 0.5, 0.5, 0.5, -0.5, 0.5, 0.5, -0.5, -0.5, -0.5, -0.5, 0.5, -0.5, 0.5, 0.5, -0.5, 0.5, -0.5, -0.5],
      idx: [0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7, 0, 3, 7, 0, 7, 4, 1, 5, 6, 1, 6, 2, 3, 2, 6, 3, 6, 7, 0, 4, 5, 0, 5, 1],
    };
  } else if (kind === 'cyl') {
    const segs = 14, pos = [], idx = [];
    for (let i = 0; i < segs; i++) {
      const a = (i / segs) * TAU, b = ((i + 1) / segs) * TAU;
      const ca = Math.cos(a), sa = Math.sin(a), cb = Math.cos(b), sb = Math.sin(b);
      let base = pos.length / 3;
      pos.push(ca, -0.5, sa, cb, -0.5, sb, cb, 0.5, sb, ca, 0.5, sa);
      idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
      base = pos.length / 3;
      pos.push(0, 0.5, 0, ca, 0.5, sa, cb, 0.5, sb);
      idx.push(base, base + 2, base + 1);
      base = pos.length / 3;
      pos.push(0, -0.5, 0, ca, -0.5, sa, cb, -0.5, sb);
      idx.push(base, base + 1, base + 2);
    }
    g = { pos, idx };
  } else {
    const segs = 10, rings = 6, pos = [], idx = [];
    for (let y = 0; y <= rings; y++) {
      const phi = -Math.PI / 2 + (y / rings) * Math.PI;
      for (let x = 0; x <= segs; x++) {
        const th = (x / segs) * TAU;
        pos.push(Math.cos(phi) * Math.cos(th) * 0.5, Math.sin(phi) * 0.5, Math.cos(phi) * Math.sin(th) * 0.5);
      }
    }
    for (let y = 0; y < rings; y++) {
      for (let x = 0; x < segs; x++) {
        const a = y * (segs + 1) + x, b = a + segs + 1;
        idx.push(a, b, a + 1, a + 1, b, b + 1);
      }
    }
    g = { pos, idx };
  }
  primCache.set(kind, g);
  return g;
}

const rgb = (c) => [((c >> 16) & 255) / 255, ((c >> 8) & 255) / 255, (c & 255) / 255];

function primPart(kind, color, dims, at = [0, 0, 0], basic = false) {
  const g = prims(kind);
  const v = new Float32Array(g.pos.length);
  for (let i = 0; i < g.pos.length; i += 3) {
    v[i] = g.pos[i] * dims[0] + at[0];
    v[i + 1] = g.pos[i + 1] * dims[1] + at[1];
    v[i + 2] = g.pos[i + 2] * dims[2] + at[2];
  }
  const col = typeof color === 'number' ? rgb(color) : color;
  return { v, i: g.idx, uv: null, c: col, b: basic ? 1 : 0, s: 0 };
}

/** اجزای «آدمک» — مکعب‌های کوچک، مثل نسخه‌ی سه‌بعدی */
export function personParts(look, pose = 'walk') {
  const swing = pose === 'walk' ? 0.08 : 0;
  return {
    p: [
      primPart('box', look.pants, [0.11, 0.44, 0.13], [-0.09, 0.24 + swing, 0]),
      primPart('box', look.pants, [0.11, 0.44, 0.13], [0.09, 0.24 - swing, 0]),
      primPart('box', look.shirt, [0.36, 0.42, 0.2], [0, 0.68, 0]),
      primPart('box', look.shirt, [0.09, 0.38, 0.11], [-0.24, 0.69, 0]),
      primPart('box', look.shirt, [0.09, 0.38, 0.11], [0.24, 0.69, 0]),
      primPart('sphere', look.skin, [0.3, 0.3, 0.3], [0, 1.03, 0]),
      primPart('sphere', look.hair, [0.32, 0.2, 0.32], [0, 1.1, 0]),
    ],
  };
}

export class City {
  constructor(world, ui) {
    this.world = world;
    this.ui = ui;
    this.P = CITY.pitch;
    this.B = CITY.block;
    this.R = CITY.road;
    this.time = 0;
    this.cars = [];
    this.peds = [];
    this.crossers = [];
    this.visitors = [];
    this.skaters = [];
    this.labels = [];
    this.parkingSpots = [];
    this.cafeStanders = [];
    this.parkedStatic = [];
    this.accident = null;
    this.parkEvent = null;
    this.plan = null;
    this._visitT = 6;
    this._kindMap = null;
    this._carFree = new Map();
    this._rounds = (CITY.roundabouts || []).map(([x, z]) => ({ x: x * this.P, z: z * this.P }));
    this._lights = (CITY.trafficLights || []).map(([x, z], i) => ({ x: x * this.P, z: z * this.P, t: i * 7, heads: [] }));
    this._exitR = 78;
    this._outsideCount = 0;
    this._accidentT = 9999;
    this._parkT = 9999;
    this.coreReady = Promise.resolve();
  }

  // ---------- کمکی ----------
  _toWorld(x, z) {
    const c = Math.SQRT1_2;
    return { x: (x + z) * c, z: (z - x) * c };
  }

  blockKind(c, r) {
    const k = this._kindMap && this._kindMap.get(c + ',' + r);
    return k || 'suburb';
  }

  _segKey(vert, line, along) {
    const a = Math.round(line / this.P - 0.5), k = Math.round(along / this.P);
    return `${vert ? 'v' : 'h'}:${a}:${k}`;
  }

  _carFreeAt(vert, line, along) {
    return this._carFree.get(this._segKey(vert, line, along));
  }

  // ---------- ساختِ شهر ----------
  async init() {
    // تا atlas آماده نشود (units.json + تصویرها) هیچ اسپریتی کشیده نمی‌شود
    await this.world.atlasReady;
    // اندازه‌ی مدل‌ها از units.json می‌آید (همان جدولی که پخت استفاده کرده)
    const table = {};
    for (const [k, v] of Object.entries(atlas.models || {})) table[k] = v.size;
    setSizeTable(table);

    const plan = buildPlan();
    this.plan = plan;
    this._kindMap = new Map(Object.entries(plan.blockKindMap || {}));
    this._carFree = this._buildCarFree();
    this.parkingSpots = plan.parkingSpots || [];
    this.cafeStanders = plan.cafeStanders || [];

    this._buildStatics(plan);
    this._buildLandmarks(plan);
    this._buildCars(plan);
    this._buildPedestrians(plan);
    this._buildSkatepark();
    this._buildJunctions(plan);
    // یک فریم تا همه چیز کشیده شود
    this.world.markStaticDirty();
  }

  _buildCarFree() {
    const m = new Map();
    for (const s of CITY.carFree || []) {
      const [c1, r1] = s.a, [c2, r2] = s.b;
      if (r1 === r2 && Math.abs(c1 - c2) === 1) m.set(`v:${Math.min(c1, c2)}:${r1}`, s.style);
      else if (c1 === c2 && Math.abs(r1 - r2) === 1) m.set(`h:${Math.min(r1, r2)}:${c1}`, s.style);
    }
    return m;
  }

  // نمونه‌های ثابتِ پخته‌شده: هر ردیفِ units.json یک آیتمِ نمایشی می‌شود
  _buildStatics(plan) {
    const inst = atlas.instances || [];
    const items = this.world.staticItems;
    items.length = 0;
    for (const it of inst) {
      const w = this._toWorld(it.x, it.z);
      items.push({
        frameIndex: it.f,
        type: it.t,
        pos: { x: w.x, y: it.y || 0, z: w.z },
        rot: it.r || 0,
        scale: it.s || 1,
      });
    }
  }

  // ---------- ساختمان‌های اصلی (تصویرهای ایزومتریکِ خودشان) ----------
  _buildLandmarks(plan) {
    const { P } = this;
    const labelBox = typeof document !== 'undefined' ? document.getElementById('labels') : null;
    const sinP = Math.abs(CAM_UP.z) || 0.75;
    for (const b of plan.landmarks || []) {
      const center = this._toWorld(b.x, b.z);
      const footDepth = (b.fd ?? 0.5) * b.w / sinP;
      if (b.id !== 'garden') {
        this.world.addSprite({
          tag: `building:${b.id}`, file: b.tex,
          x: center.x, z: center.z + footDepth / 2, y: 0.04, width: b.w,
          clickable: true,
          shadow: { x: center.x, z: center.z, w: b.w * 1.02, d: footDepth * 1.1, opacity: 0.9 },
        });
      }
      if (labelBox) {
        const el = document.createElement('div');
        el.className = 'city-label';
        el.textContent = b.id;
        labelBox.appendChild(el);
        const sp = this.world.getSprite(`building:${b.id}`);
        const h = sp && sp.aspect ? (b.w / sp.aspect) : 2.4;
        this.labels.push({ el, sp, x: center.x, z: center.z + footDepth / 2, h: h + 0.4 });
      }
    }
  }

  // ---------- ترافیک ----------
  _placeOnRoad(c, outer = false) {
    const L = this._roadLines();
    const pool = outer ? L.filter((l) => Math.abs(l) >= 2 * this.P) : L;
    let line, vert, along;
    for (let k = 0; k < 20; k++) {
      line = pool[Math.floor(Math.random() * pool.length)];
      vert = Math.random() < 0.5;
      along = (Math.random() * 2 - 1) * (3.5 * this.P - 3);
      if (!this._carFreeAt(vert, line, along)) break;
    }
    const sgn = Math.random() < 0.5 ? 1 : -1;
    if (vert) { c.hx = 0; c.hz = sgn; c.x = line - sgn * this.LANE; c.z = along; }
    else { c.hx = sgn; c.hz = 0; c.x = along; c.z = line + sgn * this.LANE; }
    c.nextC = this._nextCross(c.x, c.z, c.hx, c.hz);
    c.angle = Math.atan2(c.hx, c.hz);
    this._syncObj(c);
    c._p = { x: c.x, z: c.z, hx: c.hx, hz: c.hz };
  }

  _roadLines() {
    if (!this._lines) {
      this._lines = [];
      for (let i = -CITY.range - 1; i <= CITY.range; i++) this._lines.push((i + 0.5) * this.P);
    }
    return this._lines;
  }

  get LANE() { return 1.16; }
  get D_IN() { return this.R / 2 + 2.1; }

  _nearestLine(v) {
    let best = this._roadLines()[0], bd = Infinity;
    for (const l of this._roadLines()) {
      const d = Math.abs(l - v);
      if (d < bd) { bd = d; best = l; }
    }
    return best;
  }

  _nextCross(x, z, hx, hz) {
    let best = null, bd = Infinity;
    if (Math.abs(hx) > 0.5) {
      for (const l of this._roadLines()) {
        const d = (l - x) * hx;
        if (d > 0.6 && d < bd) { bd = d; best = { x: l, z }; }
      }
    } else {
      for (const l of this._roadLines()) {
        const d = (l - z) * hz;
        if (d > 0.6 && d < bd) { bd = d; best = { x, z: l }; }
      }
    }
    return best;
  }

  _syncObj(c) {
    const w = this._toWorld(c.x, c.z);
    const a = c.actor || c.obj;
    if (!a) return;
    a.pos.x = w.x;
    a.pos.z = w.z;
    a.rot = c.angle;
  }

  _buildCars(plan) {
    const CAR_SCALE = new Map();
    const actorFor = (name, x, z, rot) => {
      if (!CAR_SCALE.has(name)) CAR_SCALE.set(name, carScale(name));
      const s = CAR_SCALE.get(name);
      const sz = (atlas.models['car:' + name] || {}).size || [1, 1, 1];
      const a = {
        type: 'car:' + name,
        frameIndex: -1,
        _live: true,
        pos: { x: 0, y: 0.07, z: 0 },
        rot, scale: s,
        shadow: { w: Math.max(1.0, sz[0] * s * 1.15), d: Math.max(0.8, sz[2] * s), opacity: 0.8 },
      };
      this.world.addActor(a);
      return a;
    };
    const SPEED = (n) => (/kart/.test(n) ? 2.6 + Math.random() * 0.6
      : /race/.test(n) ? 3.1 + Math.random() * 0.7
        : /tractor/.test(n) ? 1.6
          : /police/.test(n) ? 2.6
            : /truck|van|firetruck|garbage|delivery|suv/.test(n) ? 1.9 + Math.random() * 0.5
              : 2.4 + Math.random() * 0.7);
    const TWICE = new Set(['sedan', 'taxi', 'suv', 'hatchback-sports', 'van', 'sedan-sports', 'suv-luxury']);
    for (const name of CITY.cars) {
      const make = () => {
        const actor = actorFor(name, 0, 0, 0);
        const car = {
          obj: actor, actor, name,
          speed: SPEED(name), cur: 0, state: 'straight',
          x: 0, z: 0, hx: 1, hz: 0, angle: 0,
          wheelR: 0.2, _target: 0, _decidedFor: null, _turnBack: null,
          nextC: null, _dest: null, _p: { x: 0, z: 0, hx: 1, hz: 0 },
        };
        this.cars.push(car);
        this._placeOnRoad(car, /kart|race/.test(name));
      };
      make();
      if (TWICE.has(name)) make();
    }
    // ماشین‌های پارک‌شده (ثابت‌اند، پس همان قابِ ایستا کافی است)
    for (const p of plan.parked || []) {
      if (!CITY.cars.includes(p.name) && !/tractor|truck/.test(p.name)) continue;
      const w = this._toWorld(p.x, p.z);
      const s = carScale(p.name);
      this.world.addStaticActor({
        type: 'car:' + p.name,
        pos: { x: w.x, y: 0.05, z: w.z },
        rot: p.rot,
        scale: s,
        shadow: { w: 1.8, d: 1.3, opacity: 0.7 },
      });
      this.parkedStatic.push({ x: p.x, z: p.z });
    }
    this._outsideCount = 0;
    // اولین رویدادها کمی بعد از ورودِ بازیکن (که ناگهانی نباشد)
    this._accidentT = 24 + Math.random() * 20;
    this._parkT = 12 + Math.random() * 14;
  }

  // ---------- عابرها ----------
  _lookFor(i) {
    return PED_LOOKS[i % PED_LOOKS.length];
  }

  _buildPedestrians(plan) {
    const mk = (lookIdx) => {
      const a = {
        type: 'ped:' + lookIdx,
        frameIndex: -1, _live: true,
        pos: { x: 0, y: 0.06, z: 0 },
        rot: 0, scale: PED_SCALE,
        shadow: { w: 0.55, d: 0.34, opacity: 0.7 },
      };
      this.world.addActor(a);
      return a;
    };
    let li = 0;
    for (const L of plan.pedLoops || []) {
      for (let i = 0; i < (L.n || 3); i++) {
        const look = li++ % PED_LOOKS.length;
        const g = mk(look);
        this.peds.push({
          lie: look, g,
          cx: L.cx, cz: L.cz, hx: L.hx, hz: L.hz,
          dir: Math.random() < 0.5 ? 1 : -1,
          dist: Math.random() * 4 * (L.hx + L.hz),
          speed: 1.05 + Math.random() * 0.65,
          angle: 0,
        });
      }
    }
    for (const st of plan.cafeStanders || []) this._addStander(st.x, st.z, st.rot);

    // عابرهای خط عابرِ تقاطع‌ها
    const roadLines = [];
    for (let i = -3; i <= 2; i++) roadLines.push((i + 0.5) * this.P);
    const CW = this.R / 2 + 0.62;
    const pick = (a) => a[Math.floor(Math.random() * a.length)];
    for (let i = 0; i < 12; i++) {
      let lx, lz, vert, cwSide;
      for (let k = 0; k < 10; k++) {
        lx = pick(roadLines); lz = pick(roadLines);
        vert = Math.random() < 0.5;
        cwSide = Math.random() < 0.5 ? -1 : 1;
        const closed = vert
          ? this._carFreeAt(false, lz, lx + (cwSide * this.P) / 2)
          : this._carFreeAt(true, lx, lz + (cwSide * this.P) / 2);
        if (!closed) break;
      }
      const ax = vert ? lx + cwSide * CW : lx - CW - 0.95;
      const az = vert ? lz - CW - 0.95 : lz + cwSide * CW;
      const bx = vert ? ax : lx + CW + 0.95;
      const bz = vert ? lz + CW + 0.95 : az;
      const look = li++ % PED_LOOKS.length;
      const g = mk(look);
      this.crossers.push({
        lie: look, g, lx, lz, vert, ax, az, bx, bz, x: ax, z: az,
        phase: 'wait', t: 1 + Math.random() * 5, prog: 0, back: false,
        speed: 0.85 + Math.random() * 0.35,
      });
    }
  }

  /** یک آدمکِ تازه روی نقشه (بازیگرِ اسپریتی، نه مِش) */
  _spawnPerson(x, z, rot = 0) {
    const look = Math.floor(Math.random() * PED_LOOKS.length);
    const w = this._toWorld(x, z);
    const g = {
      type: 'ped:' + look,
      frameIndex: -1, _live: true,
      pos: { x: w.x, y: 0.06, z: w.z },
      rot, scale: PED_SCALE,
      shadow: { w: 0.55, d: 0.34, opacity: 0.7 },
    };
    this.world.addActor(g);
    return { lie: look, g };
  }

  /** جابه‌جاییِ آدمک در مختصاتِ شهر + چرخشِ رو به مسیرِ حرکت */
  _movePerson(p, rot) {
    const w = this._toWorld(p.x, p.z);
    p.g.pos.x = w.x;
    p.g.pos.z = w.z;
    p.g.pos.y = 0.06 + Math.abs(Math.sin(this.time * 9 + p.x)) * 0.035;
    p.g.rot = rot;
  }

  _addStander(x, z, ry) {
    const look = Math.floor(Math.random() * PED_LOOKS.length);
    const w = this._toWorld(x, z);
    const a = {
      type: 'ped:' + look,
      frameIndex: -1, _live: true,
      pos: { x: w.x, y: 0.06, z: w.z },
      rot: ry, scale: PED_SCALE,
      shadow: { w: 0.55, d: 0.34, opacity: 0.7 },
    };
    this.world.addActor(a);
    this.peds.push({ lie: look, g: a, stand: true, phase: Math.random() * 6 });
    return a;
  }

  // ---------- اسکیت‌سوارها ----------
  _buildSkatepark() {
    const sp = CITY.skatepark;
    if (!sp) return;
    const T = CITY.skateScale;
    const cx = sp.col * this.P, cz = sp.row * this.P;
    const X = (i) => cx + (i - 2.5) * T, Z = (k) => cz + (k - 2.5) * T;
    const deck = 0.06 + 0.8 * T;
    const loopHx = 1.95 * T, loopHz = 1.05 * T;
    const lap = 4 * (Math.PI * 0.9 * T / 2) + 4 * (loopHx + loopHz - 2 * 0.9 * T);
    const mk = (x, z, rot, y, look) => {
      const w = this._toWorld(x, z);
      const a = {
        type: 'skater:' + look,
        frameIndex: -1, _live: true,
        pos: { x: w.x, y, z: w.z }, rot, scale: 1,
        shadow: { w: 0.9, d: 0.55, opacity: 0.8 },
      };
      this.world.addActor(a);
      this.skaters.push({ a, x, z, rot, y, lap, dist: 0, cx: X(2), cz: Z(3.5), hx: loopHx, hz: loopHz, rad: 0.9 * T, moving: true });
      return a;
    };
    mk(X(2), Z(3.5), 0, 0.06, 0);
    mk(X(2), Z(3.5), 0, 0.06, 1);
    if (this.skaters[1]) this.skaters[1].dist = lap / 2;
    const sit = mk(X(0.4), Z(5.15), Math.PI, 0.06 + 0.2 * T, 1);
    sit.scale = 1;
    if (this.skaters[2]) this.skaters[2].moving = false;
    mk(X(5), Z(0), -Math.PI / 2, deck, 0);
    if (this.skaters[3]) this.skaters[3].moving = false;
  }

  _updateSkaters(dt) {
    for (const s of this.skaters) {
      if (!s.moving) continue;
      s.dist += 1.6 * dt;
      const p = roundRectPoint(s.hx, s.hz, s.rad, s.dist);
      const world = this._toWorld(s.cx + p.x, s.cz + p.z);
      s.a.pos.x = world.x;
      s.a.pos.z = world.z;
      const target = Math.atan2(p.hx, p.hz);
      let d = target - s.rot;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      s.rot += d * Math.min(1, dt * 10);
      s.a.rot = s.rot;
    }
  }

  // ---------- چراغ‌های راهنما ----------
  _buildJunctions() {
    if (!this._lights.length) return;
    const APPROACH = [[0, 1], [0, -1], [1, 0], [-1, 0]];
    const faceTo = (hx, hz) => Math.atan2(-hz, hx);
    for (const L of this._lights) {
      for (const [hx, hz] of APPROACH) {
        const w = this._toWorld(L.x - hx * 3.95 - hz * 2.6, L.z - hz * 3.95 + hx * 2.6);
        const a = {
          type: 'r:traffic-light-hanging',
          frameIndex: -1, _live: true,
          pos: { x: w.x, y: 0.05, z: w.z },
          rot: faceTo(hx, hz), scale: 4.5,
          state: null,
          shadow: { w: 3.6, d: 1.1, opacity: 0.5 },
        };
        this.world.addActor(a);
        L.heads.push({ axis: Math.abs(hz) > 0.5 ? 'ns' : 'ew', actor: a, state: null });
      }
    }
    this._updateLights(0);
  }

  // چرخه‌ی ۲۶ ثانیه: شمال/جنوب سبز ۱۰، زرد ۲، همه قرمز ۱؛ بعد همین برای شرق/غرب
  _lightState(L, axis) {
    const CYCLE = 26, t = ((L.t % CYCLE) + CYCLE) % CYCLE;
    const ph = axis === 'ns' ? t : (t + 13) % CYCLE;
    return ph < 10 ? 'green' : ph < 12 ? 'yellow' : 'red';
  }

  _updateLights(dt) {
    for (const L of this._lights) {
      L.t += dt;
      for (const hd of L.heads) {
        const st = this._lightState(L, hd.axis);
        if (st === hd.state) continue;
        hd.state = st;
        if (hd.actor) hd.actor.state = st;
      }
    }
  }

  // آیا تقاطع توسط ماشینِ در حال پیچیدنِ دیگری اشغال است؟
  _turnBusy(C, self) {
    for (const o of this.cars) {
      if (o === self || o.state !== 'turning' || !o._turnC) continue;
      if (Math.hypot(o._turnC.x - C.x, o._turnC.z - C.z) < 5) return true;
    }
    return false;
  }

  // شروع پیچ: بزیه‌ی نرم از لاین ورودی به لاین خروجی (نه پیچِ ناگهانی وسط میدان)
  _startTurn(c, C, dir) {
    const rhx = -c.hz, rhz = c.hx;
    const s = dir === 'right' ? 1 : -1;
    const nx = rhx * s, nz = rhz * s;          // جهت جدید
    const rnx = -nz, rnz = nx;                 // راستِ جهت جدید
    const ex = C.x + nx * this.D_IN + rnx * this.LANE;
    const ez = C.z + nz * this.D_IN + rnz * this.LANE;
    const k = this.D_IN * 0.8;
    c._turnC = C;
    c._turnBack = c.state;
    c._turn = {
      t: 0,
      x0: c.x, z0: c.z,
      x1: c.x + c.hx * k, z1: c.z + c.hz * k,
      x2: ex - nx * k, z2: ez - nz * k,
      x3: ex, z3: ez,
      nx, nz,
      len: Math.hypot(ex - c.x, ez - c.z) * 0.8 + 3.2,
    };
    c.state = 'turning';
  }

  // نزدیک تقاطع: یک بار تصمیم می‌گیرد و تا باز بودن راه (حق تقدم/پیچ آزاد) سر خط می‌ایستد
  _approachIntersection(c, dt) {
    const C = c.nextC;
    if (c._decidedFor !== C) {
      c._decidedFor = C;
      c._yieldT = 0;
      const hx = c.hx, hz = c.hz;
      const rhx = -hz, rhz = hx;
      const straightRaw = this._nextCross(C.x + hx * 2, C.z + hz * 2, hx, hz);
      const rightRaw = this._nextCross(C.x + rhx * 2, C.z + rhz * 2, rhx, rhz);
      const leftRaw = this._nextCross(C.x - rhx * 2, C.z - rhz * 2, -rhx, -rhz);
      const last = !straightRaw;    // دیگر تقاطعی در ادامه نیست → لبه‌ی شهر
      // پیاده‌راه‌ها انتخاب نمی‌شوند؛ اگر هیچ راهی نماند (پیکربندی غلط) همان راه‌های خام
      let straightNext = straightRaw && this._segOpen(C, hx, hz) ? straightRaw : null;
      let rightNext = rightRaw && this._segOpen(C, rhx, rhz) ? rightRaw : null;
      let leftNext = leftRaw && this._segOpen(C, -rhx, -rhz) ? leftRaw : null;
      if (!straightNext && !rightNext && !leftNext && !last) {
        straightNext = straightRaw; rightNext = rightRaw; leftNext = leftRaw;
      }
      if (c._dest) {
        // پلیسِ اعزامی همیشه به سمت مقصدش می‌پیچد
        let bd = Infinity, pick = null;
        for (const [nm, pnt] of [['straight', straightNext], ['right', rightNext], ['left', leftNext]]) {
          if (!pnt) continue;
          const d = Math.hypot(pnt.x - c._dest.x, pnt.z - c._dest.z);
          if (d < bd) { bd = d; pick = nm; }
        }
        c._choice = pick || 'exit';
      } else {
        const w = [];
        if (straightNext) w.push(['straight', 0.56]);
        if (rightNext) w.push(['right', 0.24]);
        if (leftNext) w.push(['left', 0.2]);
        // در آخرین تقاطع: یا می‌پیچد یا در مه از شهر بیرون می‌رود
        if (last && this._outsideCount < 2) w.push(['exit', 0.4]);
        if (!w.length) w.push(['exit', 1]);
        let r = Math.random() * w.reduce((a, o) => a + o[1], 0), pick = null;
        for (const [nm, ww] of w) { r -= ww; if (r <= 0) { pick = nm; break; } }
        c._choice = pick || w[w.length - 1][0];
      }
    }

    // اجرای تصمیم وقتی راه باز است
    const choice = c._choice;
    // C روی لاین خود ماشین است؛ مرکز واقعی تقاطع (برای میدان و چراغ) از خط‌های جاده می‌آید
    const J = { x: this._nearestLine(C.x), z: this._nearestLine(C.z) };
    // میدان گردان: به ماشین‌های داخل میدان راه می‌دهد، بعد دور جزیره می‌چرخد
    if (choice !== 'exit' && this._roundAt(J)) {
      if (!this._roundClear(c, J)) return;
      c._decidedFor = null;
      if (choice === 'right') this._startTurn(c, C, 'right');   // خروجی اول: پیچ کوتاه بدون دور زدن
      else this._startRound(c, J, choice);
      return;
    }
    // چراغ راهنما: قرمز و زرد یعنی ایست پشت خط؛ سبز یعنی حق تقدم دیگر لازم نیست
    const signal = this._signalFor(J, c);
    if (signal && signal !== 'green') { c._yieldT = 0; return; }
    if (choice !== 'exit' && !signal) {
      // حق تقدم با ماشینِ سمت راست (تقاطع بدون چراغ!) — بعد از چند ثانیه رد می‌شود
      c._yieldT += dt;
      if (c._yieldT < 5 && this._yieldRight(c, C)) return;
    }
    c._decidedFor = null;
    if (choice === 'exit') {
      c.state = 'exiting';
      this._outsideCount++;
    } else if (choice === 'right' || choice === 'left') {
      if (!this._turnBusy(C, c)) this._startTurn(c, C, choice);
      else c._decidedFor = C;   // تقاطع اشغال است؛ کمی بعد دوباره
    } else {
      c.nextC = this._nextCross(C.x + c.hx * 2, C.z + c.hz * 2, c.hx, c.hz);
    }
  }

  // ---------- میدان گردان ----------
  get ROUND_R() { return 1.85; }            // شعاع لاین گردش دور جزیره (جزیره ۱.۰)

  _roundAt(C) {
    return this._rounds.find((r) => Math.abs(r.x - C.x) < 0.5 && Math.abs(r.z - C.z) < 0.5) || null;
  }

  // زاویه‌ی نقطه‌ای که لاین ورودیِ ماشین (با جهت h) به حلقه می‌رسد، حول مرکز تقاطع
  _roundEntryAngle(hx, hz) {
    const L = this.LANE, k = Math.sqrt(this.ROUND_R ** 2 - L * L);
    return Math.atan2(hx * L - hz * k, -hz * L - hx * k);
  }

  // ورود آزاد است؟ ماشینی نزدیک نقطه‌ی ورودم نباشد و از بالادست حلقه به آن نرسد
  // (ماشین‌های داخل میدان حق تقدم دارند؛ گردش در جهت کاهش زاویه است)
  _roundClear(c, C) {
    const aIn = this._roundEntryAngle(c.hx, c.hz);
    for (const o of this.cars) {
      // _turnC پیچ‌های کوتاه روی لاین است (تا ۱.۲ از مرکز)؛ دور زدن‌ها خود مرکزند
      if (o === c || o.state !== 'turning' || !o._turnC) continue;
      if (Math.hypot(o._turnC.x - C.x, o._turnC.z - C.z) > 2) continue;
      const ox = o.x - C.x, oz = o.z - C.z;
      if (Math.hypot(ox, oz) > 4.6) continue;   // دارد از میدان دور می‌شود
      let d = Math.atan2(oz, ox) - aIn;
      while (d <= -Math.PI) d += Math.PI * 2;
      while (d > Math.PI) d -= Math.PI * 2;
      if (d > -0.6 && d < 2.0) return false;
    }
    return true;
  }

  // دور زدن جزیره (رانندگی از راست ← گردش پادساعت‌گرد از بالا): لاین ورودی ← کمان ← لاین خروجی.
  // مسیر یک چندخطیِ نمونه‌برداری‌شده است و ماشین بر حسب طول رویش جلو می‌رود.
  _startRound(c, C, dir) {
    const RR = this.ROUND_R, L = this.LANE, D = this.D_IN, MERGE = 0.35, K = 1.3;
    const h = [c.hx, c.hz], r = [-c.hz, c.hx];
    const out = dir === 'straight' ? h : [-r[0], -r[1]];         // مستقیم یا چپ (راست = پیچ کوتاه)
    const outR = [-out[1], out[0]];
    const k = Math.sqrt(RR * RR - L * L);
    const a0 = this._roundEntryAngle(c.hx, c.hz) - MERGE;          // کمی بعد از برخورد لاین با حلقه
    let a1 = Math.atan2(outR[1] * L + out[1] * k, outR[0] * L + out[0] * k) + MERGE;
    while (a1 >= a0) a1 -= Math.PI * 2;
    const ring = (a) => [C.x + Math.cos(a) * RR, C.z + Math.sin(a) * RR];
    const tan = (a) => [Math.sin(a), -Math.cos(a)];               // جهت حرکت روی حلقه
    const pts = [];
    const bez = (p0, p1, p2, p3, from) => {
      for (let i = from; i <= 10; i++) {
        const t = i / 10, u = 1 - t;
        pts.push([0, 1].map((j) => u * u * u * p0[j] + 3 * u * u * t * p1[j] + 3 * u * t * t * p2[j] + t * t * t * p3[j]));
      }
    };
    const S = [c.x, c.z], Q0 = ring(a0), Q1 = ring(a1), t0 = tan(a0), t1 = tan(a1);
    const E = [C.x + outR[0] * L + out[0] * D, C.z + outR[1] * L + out[1] * D];
    bez(S, [S[0] + h[0] * K, S[1] + h[1] * K], [Q0[0] - t0[0] * 0.9, Q0[1] - t0[1] * 0.9], Q0, 0);
    const n = Math.max(2, Math.ceil((a0 - a1) / 0.1));
    for (let i = 1; i <= n; i++) pts.push(ring(a0 - ((a0 - a1) * i) / n));
    bez(Q1, [Q1[0] + t1[0] * 0.9, Q1[1] + t1[1] * 0.9], [E[0] - out[0] * K, E[1] - out[1] * K], E, 1);
    const cum = [0];
    for (let i = 1; i < pts.length; i++) {
      cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    }
    c._turnC = C;
    c._turnBack = c.state;
    c._turn = { t: 0, pts, cum, len: cum[cum.length - 1], nx: out[0], nz: out[1], x3: E[0], z3: E[1] };
    c.state = 'turning';
  }

  // نقطه و جهت روی چندخطی در طول s
  _pathAt(T, s) {
    const { pts, cum } = T;
    let i = 1;
    while (i < pts.length - 1 && cum[i] < s) i++;
    const f = Math.min(1, Math.max(0, (s - cum[i - 1]) / ((cum[i] - cum[i - 1]) || 1)));
    const [x0, z0] = pts[i - 1], [x1, z1] = pts[i];
    return [x0 + (x1 - x0) * f, z0 + (z1 - z0) * f, x1 - x0, z1 - z0];
  }

  // ---------- چراغ راهنما ----------
  _lightAt(C) {
    return this._lights.find((l) => Math.abs(l.x - C.x) < 0.5 && Math.abs(l.z - C.z) < 0.5) || null;
  }

  // چرخه‌ی ۲۶ ثانیه: شمال/جنوب سبز ۱۰، زرد ۲، همه قرمز ۱؛ بعد همین برای شرق/غرب
  _lightState(L, axis) {
    const CYCLE = 26, t = ((L.t % CYCLE) + CYCLE) % CYCLE;
    const ph = axis === 'ns' ? t : (t + 13) % CYCLE;
    return ph < 10 ? 'green' : ph < 12 ? 'yellow' : 'red';
  }

  // وضعیت چراغِ تقاطع C برای ماشین c (null = تقاطع چراغ ندارد)
  _signalFor(C, c) {
    const L = this._lightAt(C);
    return L ? this._lightState(L, Math.abs(c.hz) > 0.5 ? 'ns' : 'ew') : null;
  }

  // تکه‌ی بعد از تقاطع C در جهت (hx,hz) ماشین‌رو است؟ (پیاده‌راه‌ها بسته‌اند)
  _segOpen(C, hx, hz) {
    if (!this._carFree.size) return true;
    const vert = Math.abs(hz) > 0.5;
    const along = vert ? C.z + (hz * this.P) / 2 : C.x + (hx * this.P) / 2;
    return !this._carFreeAt(vert, vert ? C.x : C.z, along);
  }

  // آیا ماشین داخل محدوده‌ی تقاطع است؟
  _nearIntersection(o) {
    return Math.hypot(o.x - this._nearestLine(o.x), o.z - this._nearestLine(o.z)) < 6;
  }

  // آیا کسی از سمت راستِ من به همین تقاطع نزدیک می‌شود؟
  _yieldRight(c, C) {
    for (const o of this.cars) {
      if (o === c) continue;
      let same = false;
      if (o.nextC && Math.abs(o.nextC.x - C.x) < 1 && Math.abs(o.nextC.z - C.z) < 1) same = true;
      if (o.state === 'turning' && o._turnC && Math.abs(o._turnC.x - C.x) < 1 && Math.abs(o._turnC.z - C.z) < 1) same = true;
      if (!same) continue;
      const ox = o.x - C.x, oz = o.z - C.z;
      if (Math.hypot(ox, oz) > this.D_IN + 4.5) continue;   // خیلی دور است
      const rd = ox * (-c.hz) + oz * (c.hx);   // سمت راست من؟
      const fd = ox * c.hx + oz * c.hz;        // جلوی من نباشد
      if (rd > 2 && fd < 2 && (o.cur > 0.05 || o.state === 'turning')) return true;
    }
    return false;
  }

  // فاصله‌ی نقطه‌ی محلیِ شهر از مرکزِ دید (بر حسبِ واحدِ شهر).
  // ماشین فقط وقتی از نقشه بیرون می‌رود که از مرکزِ دید خیلی دور شده باشد؛
  // با همین معیار هم «دورترین نقطه‌ی دید» برای ورودِ دوباره انتخاب می‌شود.
  _camDist(p) {
    const pan = this.world && this.world.view ? this.world.view.pan : null;
    return pan ? Math.hypot(p.x - pan.x, p.z - pan.z) : Math.hypot(p.x, p.z);
  }

  _startEnter(c) {
    const L = this._roadLines();
    const D = 95;
    let best = null, bd = -1;
    for (let k = 0; k < 6; k++) {
      const line = L[Math.floor(Math.random() * L.length)];
      const vert = Math.random() < 0.5;
      const sgn = Math.random() < 0.5 ? 1 : -1;   // به سمت شهر
      const cand = vert
        ? { vert, sgn, line, x: line - sgn * this.LANE, z: -sgn * D }
        : { vert, sgn, line, x: -sgn * D, z: line + sgn * this.LANE };
      const d = this._camDist(cand);
      if (d > bd) { bd = d; best = cand; }
    }
    const { vert, sgn, line } = best;
    c.hx = vert ? 0 : sgn;
    c.hz = vert ? sgn : 0;
    c.x = best.x;
    c.z = best.z;
    c.cur = Math.min(c.speed, 2.6);
    c.angle = Math.atan2(c.hx, c.hz);
    this._syncObj(c);
    c.state = 'straight';
    c.nextC = this._nextCross(c.x, c.z, c.hx, c.hz);
    this._outsideCount = Math.max(0, this._outsideCount - 1);
  }

  _updateTraffic(dt, t) {
    const cars = this.cars;

    // ۱) تصمیم‌های تقاطع (ایست سر خط تا باز شدن راه)
    for (const c of cars) {
      if ((c.state === 'straight' || c.state === 'dispatch') && c.nextC) {
        const dc = (c.nextC.x - c.x) * c.hx + (c.nextC.z - c.z) * c.hz;
        // تصمیمی که بیرون از محدوده‌ی تقاطع معلق مانده → باطل (ضدِ قفل دائمی)
        if (dc > this.D_IN + 0.3 && c._decidedFor === c.nextC) c._decidedFor = null;
        if (dc <= this.D_IN) this._approachIntersection(c, dt);
      } else if (c.state === 'straight' && !c.nextC) {
        // ایمنی: جاده تمام شد → از شهر خارج شو
        c.state = 'exiting';
        this._outsideCount++;
      }
    }

    // ۲) هدف سرعت هر ماشین
    for (const c of cars) {
      if (c.state === 'crashed' || c.state === 'parked') { c._target = 0; continue; }
      if (c.state !== 'straight' && c.state !== 'turning' && c.state !== 'exiting' && c.state !== 'dispatch') continue;
      let target = c.speed;
      if (c.state === 'dispatch' && c._dest) target = Math.min(target * 1.7, 4.0);

      // فاصله با جلوییِ هم‌جهت در همان جاده (ماشین از ماشین رد نمی‌شود)
      let gap = Infinity;
      for (const o of cars) {
        if (o === c) continue;
        const rx = o.x - c.x, rz = o.z - c.z;
        const fwd = rx * c.hx + rz * c.hz;
        if (fwd <= 0 || fwd > 34) continue;
        const lat = Math.abs(rx * c.hz - rz * c.hx);
        if (lat > 0.95) continue;
        if (o.hx * c.hx + o.hz * c.hz < 0.7) continue;
        if (fwd - 2.2 < gap) gap = fwd - 2.2;
      }
      if (gap < 0.4) target = 0;
      else target = Math.min(target, gap * 1.7);

      // مانع‌های جلو: بر اساس «باند جاده‌ی خودم» — نه هر چیزی که زاویه‌دار جلو است
      if (c.state === 'turning') {
        // در حال پیچ: فقط مانع چسبیده (تا وسط تقاطع گیر نکند)
        if (c._p) {
          for (const o of cars) {
            if (o === c) continue;
            const rx = o.x - c.x, rz = o.z - c.z;
            const fwd = rx * c._p.hx + rz * c._p.hz;
            if (fwd <= 0.15 || fwd > 2.4) continue;
            const lat = Math.abs(rx * c._p.hz - rz * c._p.hx);
            if (lat < 1.15) { target = 0; break; }
          }
        }
      } else if (c._p) {
        const horiz = Math.abs(c.hx) > 0.5;
        const myLine = horiz ? this._nearestLine(c.z) : this._nearestLine(c.x);
        for (const o of cars) {
          if (o === c) continue;
          const rx = o.x - c.x, rz = o.z - c.z;
          const fwd = rx * c.hx + rz * c.hz;
          if (fwd <= 0.15) continue;
          const laneDist = Math.abs(horiz ? rz : rx);                       // فاصله از لاین خودم
          const strip = Math.abs(horiz ? o.z - myLine : o.x - myLine);     // فاصله از باند جاده‌ام
          const dot = o.hx * c.hx + o.hz * c.hz;
          // ماشینِ ایستاده داخل تقاطع: فقط اگر من حق تقدمِ قطعی نداشته باشم منتظرش می‌مانم
          // (اولویت قطعی = یا در حال حرکتم، یا ضرب‌جهت‌ها به نفعم است) — تا دو ماشینِ روبه‌رویی
          // همزمان برای هم نایستند و قفل نشوند
          const oStuckInBox = o.cur < 0.05 && this._nearIntersection(o);
          const iGo = c.cur > 0.3 || (c.hx * o.hz - c.hz * o.hx) > 0;
          let block = false;
          if (dot > 0.7) block = laneDist < 1.0 && fwd < 3.6 + c.cur * 0.9;          // هم‌جهت در لاینم
          else if (dot < -0.7) block = laneDist < 0.9 && fwd < 3.0;                 // روبه‌رو وارد لاینم شده
          else block = strip < 1.35 && fwd < 3.6 + c.cur * 0.9 &&
            !(oStuckInBox && laneDist > 0.6 && iGo);                                // عرضی/در حال پیچ
          // خیلی نزدیک و در مسیرم — به‌جز ایستاده‌ی داخل تقاطع که من اولویت دارم
          if (!block && fwd < 1.7 && laneDist < 0.95 && !oStuckInBox) block = true;
          if (block) { target = 0; break; }
        }
      }

      // عابر روی خط عابر → توقف کامل
      if (c._p) {
        for (const cr of this.crossers) {
          if (cr.phase !== 'cross') continue;
          if (cr.vert ? Math.abs(cr.z - cr.lz) > this.R / 2 + 0.55 : Math.abs(cr.x - cr.lx) > this.R / 2 + 0.55) continue;
          const dx = cr.x - c.x, dz = cr.z - c.z;
          const fwd = dx * c._p.hx + dz * c._p.hz;
          const lat = Math.abs(dx * c._p.hz - dz * c._p.hx);
          if (fwd > 0.1 && fwd < 3.4 + c.cur * 0.85 && lat < 1.7) { target = 0; break; }
        }
      }

      // پلیس کنار محل تصادف می‌ایستد
      if (c.state === 'dispatch' && this.accident) {
        const d = Math.hypot(c.x - this.accident.x, c.z - this.accident.z);
        if (d < 6.0) target = 0;
      }

      // تصمیمِ تقاطع هنوز اجرا نشده → ایست سر خط (قبل از خط عابر)
      if ((c.state === 'straight' || c.state === 'dispatch') && c._decidedFor && c._decidedFor === c.nextC) target = 0;
      c._target = target;
    }

    // ۳) حرکت
    for (const c of cars) {
      const rate = c._target > c.cur ? 1.7 : 6.5;   // گاز نرم، ترمز تند
      c.cur += (c._target - c.cur) * Math.min(1, dt * rate);
      if (Math.abs(c._target - c.cur) < 0.015) c.cur = c._target;

      if (c.state === 'turning') {
        const T = c._turn;
        T.t = Math.min(1, T.t + (c.cur * dt) / T.len);
        // اگر بیش از حد مجاز وسط تقاطع ایستاد (صف/تصادف) پیچ را کامل می‌کند
        c._turnStill = c.cur < 0.05 ? (c._turnStill || 0) + dt : 0;
        if (c._turnStill > 7) T.t = 1;
        let bx, bz, tx, tz;
        if (T.pts) {
          // دور میدان گردان: چندخطیِ نمونه‌برداری‌شده، پیشروی بر حسب طول مسیر
          [bx, bz, tx, tz] = this._pathAt(T, T.t * T.len);
        } else {
          const u = 1 - T.t;
          bx = u * u * u * T.x0 + 3 * u * u * T.t * T.x1 + 3 * u * T.t * T.t * T.x2 + T.t * T.t * T.t * T.x3;
          bz = u * u * u * T.z0 + 3 * u * u * T.t * T.z1 + 3 * u * T.t * T.t * T.z2 + T.t * T.t * T.t * T.z3;
          tx = 3 * u * u * (T.x1 - T.x0) + 6 * u * T.t * (T.x2 - T.x1) + 3 * T.t * T.t * (T.x3 - T.x2);
          tz = 3 * u * u * (T.z1 - T.z0) + 6 * u * T.t * (T.z2 - T.z1) + 3 * T.t * T.t * (T.z3 - T.z2);
        }
        const tl = Math.hypot(tx, tz) || 1;
        c.x = bx; c.z = bz;
        c._p = { x: bx, z: bz, hx: tx / tl, hz: tz / tl };
        this._syncObj(c);
        const ta = Math.atan2(c._p.hx, c._p.hz);
        let d = ta - c.angle;
        while (d > Math.PI) d -= Math.PI * 2;
        while (d < -Math.PI) d += Math.PI * 2;
        c.angle += d * Math.min(1, dt * 10);
        if (T.t >= 1) {
          c._turnStill = 0;
          c.hx = T.nx; c.hz = T.nz;
          c.x = T.x3; c.z = T.z3;
          c.nextC = this._nextCross(c.x, c.z, c.hx, c.hz);
          // پلیس اگر هنوز مأموریت دارد dispatch می‌ماند، وگرنه عادی می‌شود
          c.state = c._turnBack === 'dispatch' && c._dest ? 'dispatch' : 'straight';
          c._p = { x: c.x, z: c.z, hx: c.hx, hz: c.hz };
        }
      } else if (c.state !== 'crashed' && c.state !== 'parked' && c.state !== 'toPark' && c.state !== 'away') {
        if (c.state !== 'parked') {
          const adv = c.cur * dt;
          c.x += c.hx * adv;
          c.z += c.hz * adv;
        }
        if (c.state === 'exiting' && this._camDist(c) > 112) {
          // فقط وقتی از دید دوربین کاملاً در مه است — نه اینکه روی صفحه محو شود
          this._startEnter(c);
        }
        c._p = { x: c.x, z: c.z, hx: c.hx, hz: c.hz };
        this._syncObj(c);
        const ta = Math.atan2(c.hx, c.hz);
        let d = ta - c.angle;
        while (d > Math.PI) d -= Math.PI * 2;
        while (d < -Math.PI) d += Math.PI * 2;
        c.angle += d * Math.min(1, dt * 7);
      }
      // toPark/away در _updateParking حرکت می‌کنند | crashed/parked سر جایشان می‌مانند
    }
  }

  // ---------- رویدادها: تصادف و پارک منزل ----------
  _updateEvents(dt, t) {
    if (!this.accident) {
      this._accidentT -= dt;
      if (this._accidentT <= 0) {
        this._accidentT = 30 + Math.random() * 35;
        this._startAccident();
      }
    } else {
      this._updateAccident(dt, t);
    }
    if (!this.parkEvent) {
      this._parkT -= dt;
      if (this._parkT <= 0) {
        this._parkT = 16 + Math.random() * 22;
        this._startParking();
      }
    } else {
      this._updateParking(dt, t);
    }
    // آدمک‌هایی که به درِ خانه می‌روند و داخل می‌شوند
    this._visitT -= dt;
    if (this._visitT <= 0) {
      this._visitT = 7 + Math.random() * 9;
      this._startVisit();
    }
    this._updateVisitors(dt, t);
  }

  // یک آدمک از کنار جاده به درِ خانه می‌رود، چند لحظه داخل می‌ماند و برمی‌گردد
  _startVisit() {
    if (this.visitors.length >= 4) return;
    if (!this._spotsReady) {
      this._spotsReady = true;
      this.parkingSpots = this.parkingSpots.filter((sp) =>
        !this.parkedStatic.some((p) => Math.hypot(p.x - sp.x, p.z - sp.z) < 2.6));
    }
    if (!this.parkingSpots.length) return;
    const sp = this.parkingSpots[Math.floor(Math.random() * this.parkingSpots.length)];
    const x = sp.x + (Math.random() - 0.5) * 0.8;
    const z = sp.z + (Math.random() < 0.5 ? -1 : 1) * (0.6 + Math.random() * 0.6);
    const per = this._spawnPerson(x, z, 0);
    this.visitors.push({
      ...per, x, z,
      tx: sp.door.x + (Math.random() - 0.5) * 0.5,
      tz: sp.door.z,
      sx: x, sz: z,
      phase: 'toDoor', t: 0, stay: 12 + Math.random() * 38,
    });
  }

  _updateVisitors(dt, t) {
    for (let i = this.visitors.length - 1; i >= 0; i--) {
      const v = this.visitors[i];
      v.t += dt;
      let tx = v.tx, tz = v.tz;
      if (v.phase === 'toDoor' || v.phase === 'back') {
        if (v.phase === 'back') { tx = v.sx; tz = v.sz; }
        const d = Math.hypot(tx - v.x, tz - v.z);
        if (d > 0.12) {
          const st = Math.min((0.85 + Math.random() * 0.001) * dt, d);
          v.x += (tx - v.x) / d * st;
          v.z += (tz - v.z) / d * st;
          this._movePerson(v, Math.atan2(tx - v.x, tz - v.z));
        } else if (v.phase === 'toDoor') {
          v.g.pos.y = -0.6;             // وارد خانه شد
          v.phase = 'inside'; v.t = 0;
        } else {
          this.world.removeActor(v.g);  // رفت
          this.visitors.splice(i, 1);
          continue;
        }
      } else if (v.phase === 'inside') {
        if (v.t > v.stay) {
          v.g.pos.y = 0.06;             // از خانه آمد بیرون
          v.phase = 'back'; v.t = 0;
        }
      }
    }
  }

  _startAccident() {
    const police = this.cars.find((c) => c.name === 'police' && (c.state === 'straight' || c.state === 'dispatch'));
    if (!police) return;
    const ok = (c) => c.state === 'straight' && c !== police &&
      !/kart|race|police|tractor|truck|firetruck|garbage|delivery|ambulance/.test(c.name);
    // جفت طبیعی: ماشین و پشتِ سرش در همان لاین (بدون تلپورت)
    let a = null, b = null, bg = Infinity;
    for (const c of this.cars) {
      if (!ok(c)) continue;
      // نه وسط تقاطع — تصادف وسط خیابان باشد
      if (c.nextC && (c.nextC.x - c.x) * c.hx + (c.nextC.z - c.z) * c.hz < 5.5) continue;
      for (const o of this.cars) {
        if (!ok(o) || o === c) continue;
        const rx = o.x - c.x, rz = o.z - c.z;
        const fwd = rx * c.hx + rz * c.hz;
        if (fwd <= 1.5 || fwd > 10) continue;
        const lat = Math.abs(rx * c.hz - rz * c.hx);
        if (lat > 1.0) continue;
        if (o.hx * c.hx + o.hz * c.hz < 0.7) continue;
        if (fwd < bg) { bg = fwd; a = c; b = o; }
      }
    }
    if (!a) {
      // جفت طبیعی نبود: یک ماشینِ آزاد، تمیز و بی‌خطر پشتِ سرِ ماشین اول می‌نشیند
      const cands = this.cars.filter(ok);
      if (cands.length < 2) return;
      a = cands[Math.floor(Math.random() * cands.length)];
      if (a.nextC && (a.nextC.x - a.x) * a.hx + (a.nextC.z - a.z) * a.hz < 5.5) return;
      const bx = a.x - a.hx * 2.45, bz = a.z - a.hz * 2.45;
      // جای نشستن کاملاً خالی باشد (که سه‌تا ماشین تو هم نروند)
      for (const o of this.cars) {
        if (o !== a && Math.hypot(o.x - bx, o.z - bz) < 3.4) return;
      }
      const rest = cands.filter((o) => o !== a);
      if (!rest.length) return;
      b = rest[Math.floor(Math.random() * rest.length)];
      b.x = bx; b.z = bz;
      b.hx = a.hx; b.hz = a.hz;
      b.angle = a.angle;
      this._syncObj(b);
      b.nextC = this._nextCross(bx, bz, b.hx, b.hz);
      b._p = { x: bx, z: bz, hx: b.hx, hz: b.hz };
      b._decidedFor = null;
    }
    a.state = 'crashed'; b.state = 'crashed';
    a.cur = 0; b.cur = 0; a._target = 0; b._target = 0;
    // سرنشین‌ها پیاده می‌شوند و کنار جاده می‌ایستند
    const people = [];
    for (const car of [a, b]) {
      const rx = -car.hz, rz = car.hx;   // سمت راست → لبه‌ی جاده
      const px = car.x + rx * 2.15 + (Math.random() - 0.5) * 0.6;
      const pz = car.z + rz * 2.15 + (Math.random() - 0.5) * 0.6;
      const per = this._spawnPerson(px, pz, Math.atan2(car.x - px, car.z - pz));
      people.push({ ...per, x: px, z: pz });
    }
    // پلیس اعزام می‌شود (در گرید به سمت محل می‌پیچد)
    police.state = 'dispatch';
    police._dest = { x: a.x, z: a.z };
    this.accident = { a, b, people, police, x: a.x, z: a.z, phase: 'wait', t: 0 };
  }

  _updateAccident(dt, t) {
    const A = this.accident;
    A.t += dt;

    for (const p of A.people) {
      p.g.pos.y = 0.06 + Math.abs(Math.sin(t * 1.3 + p.z)) * 0.012;
    }
    if (A.phase === 'wait') {
      const d = Math.hypot(A.police.x - A.x, A.police.z - A.z);
      if (d < 6.5 || A.t > 30) { A.phase = 'fixing'; A.t = 0; }
    } else if (A.phase === 'fixing') {
      if (A.t > 4.5) { A.phase = 'leave'; A.t = 0; }
    } else if (A.phase === 'leave') {
      // سرنشین‌ها برمی‌گردند و سوار ماشینشان می‌شوند
      let all = true;
      for (let i = 0; i < A.people.length; i++) {
        const p = A.people[i];
        const car = i === 0 ? A.a : A.b;
        const rx = -car.hz, rz = car.hx;
        const tx = car.x + rx * 1.15, tz = car.z + rz * 1.15;
        const d = Math.hypot(tx - p.x, tz - p.z);
        if (d > 0.12) {
          all = false;
          const st = Math.min(1.05 * dt, d);
          p.x += (tx - p.x) / d * st;
          p.z += (tz - p.z) / d * st;
          this._movePerson(p, Math.atan2(tx - p.x, tz - p.z));
        }
      }
      if (all && A.t > 3) {
        for (const p of A.people) this.world.removeActor(p.g);
        for (const car of [A.a, A.b]) {
          car.state = 'straight';
          car.cur = 0.35;
          car._target = car.speed;
          // مسیر و تصمیم تازه — وگرنه تصمیمِ معلقِ قدیمی ماشین را برای همیشه نگه می‌دارد
          car.nextC = this._nextCross(car.x, car.z, car.hx, car.hz);
          car._decidedFor = null;
        }
        A.police._dest = null;
        if (A.police.state === 'dispatch') A.police.state = 'straight';
        A.police.nextC = this._nextCross(A.police.x, A.police.z, A.police.hx, A.police.hz);
        A.police._decidedFor = null;
        this.accident = null;
      }
    }
  }

  _startParking() {
    if (!this._spotsReady) {
      this._spotsReady = true;
      this.parkingSpots = this.parkingSpots.filter((sp) =>
        !this.parkedStatic.some((p) => Math.hypot(p.x - sp.x, p.z - sp.z) < 2.6));
    }
    if (!this.parkingSpots.length) return;
    // جفتِ (ماشین، جای پارک): جای پارک باید در همان جاده‌ی ماشین و جلویش باشد
    // تا مانور کوتاه و طبیعی باشد (نه پرواز از وسط شهر!)
    let car = null, spot = null, bd = Infinity;
    for (const c of this.cars) {
      if (c.state !== 'straight' ||
        !/^(sedan|sedan-sports|suv|suv-luxury|van|hatchback-sports|taxi)$/.test(c.name)) continue;
      const vertRoad = Math.abs(c.hz) > 0.5;
      for (const sp of this.parkingSpots) {
        let d;
        if (vertRoad) {
          const lx = this._nearestLine(c.x);
          if (Math.abs(sp.x - lx) > 4.6 || Math.abs(sp.x - lx) < 2.0) continue;
          d = (sp.z - c.z) * c.hz;
        } else {
          const lz = this._nearestLine(c.z);
          if (Math.abs(sp.z - lz) > 4.6 || Math.abs(sp.z - lz) < 2.0) continue;
          d = (sp.x - c.x) * c.hx;
        }
        if (d <= 1 || d > 34) continue;
        if (d < bd) { bd = d; car = c; spot = sp; }
      }
    }
    if (!car) return;
    car.state = 'toPark';
    car._target = 0;
    car.cur = 0;
    car._from = { x: car.x, z: car.z };
    const dx = spot.x - car.x, dz = spot.z - car.z;
    const sgn = Math.random() < 0.5 ? 1 : -1;
    car._park = {
      spot, prog: 0,
      mx: car.x + dx * 0.5 - dz * 0.22 * sgn,
      mz: car.z + dz * 0.5 + dx * 0.22 * sgn,
    };
    this.parkEvent = { car, spot, phase: 'drive', t: 0, driver: null, stay: 0 };
  }

  _updateParking(dt, t) {
    const E = this.parkEvent;
    const car = E.car, spot = E.spot;
    E.t += dt;
    const bz = (q, x0, z0, mx, mz, x1, z1) => {
      const u = 1 - q;
      return [u * u * x0 + 2 * u * q * mx + q * q * x1, u * u * z0 + 2 * u * q * mz + q * q * z1];
    };
    if (E.phase === 'drive' || E.phase === 'away') {
      const from = E.phase === 'drive' ? car._from : { x: spot.x, z: spot.z };
      const to = E.phase === 'drive' ? spot : car._from;
      const pk = car._park;
      pk.prog = Math.min(1, pk.prog + dt / 3.0);
      const ease = pk.prog * pk.prog * (3 - 2 * pk.prog);
      const [x, z] = bz(ease, from.x, from.z, pk.mx, pk.mz, to.x, to.z);
      const [x2, z2] = bz(Math.min(1, ease + 0.06), from.x, from.z, pk.mx, pk.mz, to.x, to.z);
      car.x = x; car.z = z;
      this._syncObj(car);
      const ta = Math.atan2(x2 - x, z2 - z);
      let d = ta - car.angle;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      car.angle += d * Math.min(1, dt * 6);
      if (pk.prog >= 1) {
        if (E.phase === 'drive') {
          car.angle = spot.rot;
          this._syncObj(car);
          car.state = 'parked';
          E.phase = 'exit'; E.t = 0;
          // راننده پیاده می‌شود
          const per = this._spawnPerson(spot.x + 0.85, spot.z, 0);
          E.driver = { ...per, x: spot.x + 0.85, z: spot.z };
        } else {
          car.state = 'straight';
          car.cur = 0.3;
          car._p = { x: car.x, z: car.z, hx: car.hx, hz: car.hz };
          car.nextC = this._nextCross(car.x, car.z, car.hx, car.hz);
          this.parkEvent = null;
        }
      }
    } else if (E.phase === 'exit' || E.phase === 'return') {
      // راننده تا درِ خانه می‌رود / برمی‌گردد سر ماشین
      const p = E.driver;
      const going = E.phase === 'exit';
      const tx = going ? spot.door.x : spot.x + 0.85;
      const tz = going ? spot.door.z : spot.z;
      const dist = Math.hypot(tx - p.x, tz - p.z);
      if (dist > 0.12) {
        const st = Math.min(1.0 * dt, dist);
        p.x += (tx - p.x) / dist * st;
        p.z += (tz - p.z) / dist * st;
        this._movePerson(p, Math.atan2(tx - p.x, tz - p.z));
      } else if (going) {
        p.g.pos.y = -0.6;             // وارد خانه می‌شود
        E.phase = 'inside'; E.t = 0; E.stay = 40 + Math.random() * 80;
      } else {
        this.world.removeActor(p.g);  // سوار می‌شود و می‌رود
        car._park.prog = 0;
        E.phase = 'away'; E.t = 0;
      }
    } else if (E.phase === 'inside') {
      if (E.t > E.stay) {
        E.driver.g.pos.y = 0.06;
        E.driver.x = spot.door.x;
        E.driver.z = spot.door.z;
        E.phase = 'return';
      }
    }
  }

  // ---------- حلقه‌ی شهر ----------
  update(dt) {
    this.time += dt;
    const t = this.time;
    if (dt > 0) {
      this._updateLights(dt);
      this._updateTraffic(dt, t);
      this._updateEvents(dt, t);
      this._updateSkaters(dt);
    }

    for (const cr of this.crossers) {
      const len = Math.hypot(cr.bx - cr.ax, cr.bz - cr.az) || 1;
      if (cr.phase === 'wait' || cr.phase === 'pause') {
        cr.t -= dt;
        if (cr.t <= 0) { cr.phase = 'cross'; cr.prog = 0; }
      } else {
        // قبل از پا گذاشتن روی جاده، اگر ماشین نزدیک می‌آید صبر می‌کند
        let hold = false;
        if (cr.prog < 0.3) {
          cr._holdT = (cr._holdT || 0) + dt;
          for (const c of this.cars) {
            if (!c._p) continue;
            if (c.state === 'crashed' || c.state === 'parked' || c.state === 'toPark' || c.state === 'away') continue;
            const d = Math.hypot(c.x - cr.x, c.z - cr.z);
            // ماشینِ کاملاً ایستاده عابر را برای همیشه نگه نمی‌دارد (ضدِ قفل دایره‌ای)
            if ((d < 2.2 || (d < 6.2 && c.cur > 0.25)) && c.cur > 0.05) { hold = true; break; }
          }
          // بعد از ۱۰ ثانیه انتظار، عابر رد می‌شود؛ ماشین‌ها برای عابرِ روی خط می‌ایستند
          if (cr._holdT > 10) hold = false;
        } else cr._holdT = 0;
        if (!hold) cr.prog = Math.min(1, cr.prog + (cr.speed * dt) / len);
        const q = cr.back ? 1 - cr.prog : cr.prog;
        const x = cr.ax + (cr.bx - cr.ax) * q;
        const z = cr.az + (cr.bz - cr.az) * q;
        if (!hold) { cr.x = x; cr.z = z; }
        const w = this._toWorld(cr.x, cr.z);
        cr.g.pos.x = w.x;
        cr.g.pos.z = w.z;
        cr.g.pos.y = 0.06 + (hold ? 0 : Math.abs(Math.cos(t * 8.5)) * 0.035);
        if (!hold) {
          const fx = (cr.bx - cr.ax) * (cr.back ? -1 : 1);
          const fz = (cr.bz - cr.az) * (cr.back ? -1 : 1);
          cr.g.rot = Math.atan2(fx, fz);
        }
        if (cr.prog >= 1) {
          cr.back = !cr.back;
          cr.phase = cr.back ? 'pause' : 'wait';
          cr.t = 1.5 + Math.random() * 5;
        }
      }
    }

    for (const ped of this.peds) {
      if (ped.stand) {
        ped.g.pos.y = 0.06;
        continue;
      }
      ped.dist += ped.speed * dt;
      const p = rectPoint(ped.hx, ped.hz, ped.dist, ped.dir, 0);
      const w = this._toWorld(ped.cx + p.x, ped.cz + p.z);
      ped.g.pos.x = w.x;
      ped.g.pos.z = w.z;
      ped.g.pos.y = 0.06 + Math.abs(Math.cos(ped.dist * 5.2)) * 0.035;
      const target = Math.atan2(p.hx, p.hz);
      let d = target - ped.angle;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      ped.angle += d * Math.min(1, dt * 8);
      ped.g.rot = ped.angle;
    }

    // برچسب‌های ساختمان‌های اصلی (HTML)
    if (typeof document !== 'undefined' && this.labels.length) {
      const w = window.innerWidth, h = window.innerHeight;
      for (const L of this.labels) {
        const s = this.world.worldToScreen(L.x, L.h, L.z);
        if (s.x < -90 || s.y < -40 || s.x > w + 90 || s.y > h + 40) L.el.style.display = 'none';
        else {
          L.el.style.display = '';
          L.el.style.left = s.x + 'px';
          L.el.style.top = s.y + 'px';
        }
      }
    }
  }

  /** نوعِ قابِ یک بازیگر — نزدیک‌ترین چرخشِ پخته‌شده */
  frameFor(actor) {
    const deg = actor.rot || 0;
    const key = actor.type;
    return frameIndexFor(key, (deg * 180) / Math.PI);
  }
}
