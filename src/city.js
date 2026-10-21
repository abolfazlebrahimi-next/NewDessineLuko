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
    this.parkingSpots = [];      // جای پارکِ ماشین‌روی خانه‌ها (برای رویداد پارک)
    this.parkedStatic = [];      // ماشین‌های پارک‌شده‌ی ثابت (جای پارک آزاد پیدا شود)
    this.crossers = [];          // عابرهای خط عابر پیاده
    this.accident = null;        // رویداد تصادف + پلیس
    this.parkEvent = null;       // رویداد پارک و پیاده‌شدن راننده
    this.visitors = [];          // آدمک‌هایی که گاهی داخل خانه می‌روند
    this._visitT = 5;
    this._kindMap = this._buildKindMap();
    // پیش‌فرض‌های ترافیک (تا قبل از _buildCars هم update امن باشد)
    this._exitR = 78;
    this._outsideCount = 0;
    this._accidentT = 9999;
    this._parkT = 9999;
    // تا ساختمان‌های اصلی (عکس‌ها) نیامده‌اند، صفحه‌ی لودینگ می‌ماند
    this.coreReady = Promise.resolve();
  }

  // نقشه‌ی انواع بلوک: سبک ساختمان‌ها (مسکونی/تجاری/صنعتی) کاملاً در هم می‌شوند
  // تا شهر یکدست باشد و یک سمتش «سبز» و سمت دیگرش سبکِ دیگر نباشد.
  _buildKindMap() {
    const m = new Map();
    for (let c = -CITY.range; c <= CITY.range; c++) {
      for (let r = -CITY.range; r <= CITY.range; r++) {
        const ring = Math.max(Math.abs(c), Math.abs(r));
        let kind;
        if (ring <= 1) {
          kind = ((c === -1 && r === 1) || (c === 0 && r === -1) || (c === 0 && r === 1)) ? 'lawn' : 'core';
        } else if (c === -CITY.range && r === -CITY.range) {
          kind = 'water';
        } else if (c === CITY.range && r === CITY.range) {
          kind = 'containers';
        } else {
          const x = rand();
          kind = x < 0.48 ? 'suburb' : x < 0.82 ? 'commercial' : 'industrial';
        }
        m.set(c + ',' + r, kind);
      }
    }
    return m;
  }

  // مختصات محلی شهر ← مختصات جهان (برای اسپریت‌ها و برچسب‌هایی که بیرون گروه‌اند)
  _toWorld(x, z) {
    const c = Math.SQRT1_2, s = Math.SQRT1_2; // cos/sin ۴۵ درجه
    return { x: x * c + z * s, z: -x * s + z * c };
  }

  // نوع هر بلوک شهر
  //  core: ساختمان اصلی | lawn: فضای سبز | commercial: تجاری/آسمان‌خراش (Commercial)
  //  suburb: محله‌ی مسکونی (Suburban) | industrial: صنعتی (Industrial)
  //  water/containers: بلوک‌های ویژه‌ی صنعتی
  // سبک‌ها از قبل در _buildKindMap به‌صورت درهم (میکس) انتخاب شده‌اند.
  blockKind(c, r) {
    const k = this._kindMap && this._kindMap.get(c + ',' + r);
    if (k) return k;
    const ring = Math.max(Math.abs(c), Math.abs(r));
    if (ring <= 1) {
      if ((c === -1 && r === 1) || (c === 0 && r === -1) || (c === 0 && r === 1)) return 'lawn';
      return 'core';
    }
    return 'suburb';
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
  // ناحیه‌ی شهری + حاشیه‌ی «بیرون‌پوشه»: جاده‌ها از شهر بیرون می‌روند و در مه و
  // جنگل محو می‌شوند تا پایانشان دیده نشود (زمین بیرون شهر شفاف است و چمنِ خود
  // نقشه از زیرش پیدا می‌شود).
  _buildGround() {
    const { P, B, R } = this;
    const range = CITY.range;
    const E = (range * 2 + 1) * P + R;        // اندازه‌ی ناحیه‌ی شهری
    const EXT = 48;                            // طول بیرون‌پوشه (ادامه‌ی جاده‌ها)
    const E2 = E + EXT * 2;
    const S = 2560, k = S / E2;
    const X = (x) => (x + E2 / 2) * k;
    const Y = (z) => (z + E2 / 2) * k;
    const U = (u) => u * k;

    const c = document.createElement('canvas');
    c.width = c.height = S;
    const g = c.getContext('2d');

    const grassDots = (bx, by, bs, n) => {
      for (let i = 0; i < n; i++) {
        g.fillStyle = `rgba(${40 + rand() * 40 | 0},${110 + rand() * 50 | 0},40,${0.12 + rand() * 0.15})`;
        g.beginPath();
        g.arc(bx + rand() * bs, by + rand() * bs, 2 + rand() * 7, 0, 7);
        g.fill();
      }
    };

    // مسیر همه‌ی خیابان‌ها (تا بیرون شهر ادامه دارند)
    const lines = [];
    for (let i = -range - 1; i <= range; i++) lines.push((i + 0.5) * P);
    const roadRects = [];
    for (const l of lines) {
      roadRects.push([X(l - R / 2), 0, U(R), S]);
      roadRects.push([0, Y(l - R / 2), S, U(R)]);
    }

    // پیاده‌روی کنار جاده‌ها «بیرون شهر» — مثل جدول‌های داخل شهر، تا
    // ادامه‌ی خیابان‌ها همان حس شهری را داشته باشند (بعد آسفالت رویش می‌آید)
    const SW = 0.85;   // پهنای پیاده‌رو
    g.fillStyle = '#c6cad2';
    for (const l of lines) {
      for (const s2 of [-1, 1]) {
        // دو قطعه در هر سمت: بیرون لبه‌ی شهر تا انتهای بوم (که در مه محو می‌شود)
        g.fillRect(X(l + s2 * (R / 2 + 0.05)), 0, U(SW), Y(-E / 2));
        g.fillRect(X(l + s2 * (R / 2 + 0.05)), Y(E / 2), U(SW), S - Y(E / 2));
        g.fillRect(0, Y(l + s2 * (R / 2 + 0.05)), X(-E / 2), U(SW));
        g.fillRect(X(E / 2), Y(l + s2 * (R / 2 + 0.05)), S - X(E / 2), U(SW));
      }
    }
    // خط جدول سفید لبه‌ی پیاده‌روهای بیرونی
    g.fillStyle = 'rgba(255,255,255,.4)';
    for (const l of lines) {
      for (const s2 of [-1, 1]) {
        g.fillRect(X(l + s2 * (R / 2 + SW)), 0, U(0.12), Y(-E / 2));
        g.fillRect(X(l + s2 * (R / 2 + SW)), Y(E / 2), U(0.12), S - Y(E / 2));
        g.fillRect(0, Y(l + s2 * (R / 2 + SW)), X(-E / 2), U(0.12));
        g.fillRect(X(E / 2), Y(l + s2 * (R / 2 + SW)), S - X(E / 2), U(0.12));
      }
    }

    // آسفالت تازه و تیره‌تر روی کل طول جاده‌ها
    g.fillStyle = '#474b54';
    for (const [x, y, w, h] of roadRects) g.fillRect(x, y, w, h);
    // بافت آسفالت + لکه‌های ترمیمی ملایم (فقط روی آسفالت)
    g.save();
    g.beginPath();
    for (const [x, y, w, h] of roadRects) g.rect(x, y, w, h);
    g.clip();
    for (let i = 0; i < 3400; i++) {
      g.fillStyle = `rgba(255,255,255,${0.02 + rand() * 0.045})`;
      g.fillRect(rand() * S, rand() * S, 2.5, 2.5);
    }
    for (let i = 0; i < 90; i++) { // وصله‌های آسفالت تیره‌تر
      const l = pickOf(lines), along = -E2 / 2 + rand() * E2, vert = rand() < 0.5;
      const w = U(0.5 + rand() * 0.9), h = U(2 + rand() * 5);
      g.fillStyle = `rgba(20,22,26,${0.10 + rand() * 0.12})`;
      if (vert) g.fillRect(X(l - R / 2 + rand() * (R - 0.6) + 0.3) - w / 2, Y(along) - h / 2, w, h);
      else g.fillRect(X(along) - h / 2, Y(l - R / 2 + rand() * (R - 0.6) + 0.3) - w / 2, h, w);
    }
    g.restore();

    // کف بلوک‌های شهر (فقط داخل ناحیه‌ی شهری)
    g.save();
    g.beginPath();
    g.rect(X(-E / 2), Y(-E / 2), U(E), U(E));
    g.clip();
    g.fillStyle = '#bcc0c9';
    g.fillRect(X(-E / 2), Y(-E / 2), U(E), U(E));
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
    g.restore();

    // بازه‌های آزاد بین تقاطع‌ها روی کل طول جاده (شهر + بیرون‌پوشه)
    const dashSpans = (l) => {
      // بازه‌های مجاز در راستای عمود بر جاده: همه‌ی طول منهای جعبه‌ی تقاطع‌ها
      const out = [];
      let cursor = -E2 / 2;
      const cuts = lines.map((m) => [m - R / 2 - 1.3, m + R / 2 + 1.3]).sort((a, b) => a[0] - b[0]);
      for (const [a, b] of cuts) {
        if (a > cursor) out.push([cursor, a]);
        cursor = Math.max(cursor, b);
      }
      if (cursor < E2 / 2) out.push([cursor, E2 / 2]);
      return out;
    };

    // خط کناری + خط‌چین وسط
    for (const l of lines) {
      for (const [g0, g1] of dashSpans(l)) {
        if (g1 - g0 < 0.7) continue;
        g.fillStyle = 'rgba(242,243,245,.92)';
        g.fillRect(X(l - R / 2 + 0.2), Y(g0), U(0.14), U(g1 - g0));
        g.fillRect(X(l + R / 2 - 0.34), Y(g0), U(0.14), U(g1 - g0));
        g.fillRect(X(g0), Y(l - R / 2 + 0.2), U(g1 - g0), U(0.14));
        g.fillRect(X(g0), Y(l + R / 2 - 0.34), U(g1 - g0), U(0.14));
        g.fillStyle = '#f0f0ea';
        for (let d = g0 + 0.4; d + 1.0 < g1; d += 1.9) {
          g.fillRect(X(l - 0.09), Y(d), U(0.18), U(1.0));
          g.fillRect(X(d), Y(l - 0.09), U(1.0), U(0.18));
        }
      }
    }

    // خط عابر پیاده‌ی واضح (راه‌راه) + خط توقف — همه‌ی تقاطع‌های شهر
    const CW_OFF = R / 2 + 0.62;   // فاصله‌ی مرکز خط عابر از مرکز جاده
    this._cwOff = CW_OFF;
    g.fillStyle = 'rgba(247,247,242,.95)';
    for (const lx of lines) for (const lz of lines) {
      if (Math.abs(lx) > 3.5 * P + 0.1 || Math.abs(lz) > 3.5 * P + 0.1) continue;
      const stripes = 5;
      const sw = (R - 0.9) / stripes;
      for (let i = 0; i < stripes; i++) {
        const off = -R / 2 + 0.45 + i * sw;
        g.fillRect(X(lx + off), Y(lz - CW_OFF - 0.42), U(sw * 0.6), U(0.84));
        g.fillRect(X(lx + off), Y(lz + CW_OFF - 0.42), U(sw * 0.6), U(0.84));
        g.fillRect(X(lx - CW_OFF - 0.42), Y(lz + off), U(0.84), U(sw * 0.6));
        g.fillRect(X(lx + CW_OFF - 0.42), Y(lz + off), U(0.84), U(sw * 0.6));
      }
      // خط توقف (سمت راستِ هر رویکرد، قبل از خط عابر)
      g.fillStyle = 'rgba(242,243,245,.9)';
      for (const s of [-1, 1]) {
        // عبور از خیابان عمودی lx: توقف جنوبی/شمالی
        g.fillRect(X(lx + (s < 0 ? 0.25 : -R / 2 + 0.3)), Y(lz + s * (CW_OFF + 0.75)), U(R / 2 - 0.55), U(0.22));
        g.fillRect(X(lx + s * (CW_OFF + 0.75)), Y(lz + (s < 0 ? 0.25 : -R / 2 + 0.3)), U(0.22), U(R / 2 - 0.55));
      }
      g.fillStyle = 'rgba(247,247,242,.95)';
    }

    // حاشیه‌ی شهر
    g.strokeStyle = '#8f9286';
    g.lineWidth = U(0.55);
    g.strokeRect(X(-E / 2) + U(0.27), Y(-E / 2) + U(0.27), U(E) - U(0.54), U(E) - U(0.54));

    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = Math.min(8, this.world.renderer?.capabilities?.getMaxAnisotropy?.() || 4);
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(E2, E2),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, alphaTest: 0.05 }),
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
            // جای پارکِ رویداد «راننده می‌آید خانه» + درِ خانه برای پیاده‌شدن
            this.parkingSpots.push({
              x: dwx, z: cz + face * 4.85, rot,
              door: { x: hx - side * 0.55, z: hz + face * 0.75 },
            });
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
    // سرعت پایه — تقریباً نصفِ قبل؛ کارت‌ها تندتر، بقیه آرام شهری
    const SPEED = (n) => (/kart/.test(n) ? 2.6 + rand() * 0.6
      : /race/.test(n) ? 3.1 + rand() * 0.7
      : /tractor/.test(n) ? 1.6
      : /police/.test(n) ? 2.6
      : /truck|van|firetruck|garbage|delivery|suv/.test(n) ? 1.9 + rand() * 0.5
      : 2.4 + rand() * 0.7);
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
      const car = {
        obj: g, wheels, wheelR, name,
        speed: SPEED(name), cur: 0, state: 'straight',
        x: 0, z: 0, hx: 1, hz: 0, angle: 0,
        nextC: null, _dest: null, _p: { x: 0, z: 0, hx: 1, hz: 0 },
      };
      this.cars.push(car);
      // پخش کردن ماشین‌ها روی همه‌ی جاده‌های شبکه؛ کارت‌ها و مسابقه‌ای‌ها
      // روی خیابان‌های بیرونی (که جا برای سرعت دارند)
      this._placeOnRoad(car, /kart|race/.test(name));
      // پلیس: چراغ گردان قرمز/آبی روی سقف
      if (name === 'police') {
        const car = this.cars[this.cars.length - 1];
        const bar = new THREE.Group();
        const mk = (x, color) => {
          const m = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.07, 0.13), new THREE.MeshBasicMaterial({ color }));
          m.position.set(x, 0.62, 0.04);
          return m;
        };
        const red = mk(-0.13, 0xff2d2d), blue = mk(0.13, 0x3a7bff);
        bar.add(red, blue);
        bar.visible = false;
        g.add(bar);
        car.lights = { bar, red, blue };
      }
    };
    const parkedBlobs = [];
    const makeParked = (scene, x, z, rot, name = 'sedan') => {
      const obj = this._normalized(scene.clone(true), CAR_LEN(name), 9);
      obj.position.set(x, 0.05, z);
      obj.rotation.y = rot;
      this.group.add(obj);
      parkedBlobs.push([x, z, 2.2, 3.4]);
      this.parkedStatic.push({ x, z });
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

    // زمان‌بندی رویدادها: خروج از شهر، تصادف، پارک منزل
    this._exitR = 78;             // بعد از این شعاع، ماشین «در مه» است و برمی‌گردد داخل
    this._outsideCount = 0;
    this._accidentT = 14 + Math.random() * 12;
    this._parkT = 8 + Math.random() * 8;
  }

  // ---------- درخت‌ها، سنگ‌ها و علف (Kenney Survival Kit — همان پکیج محصول قبلی) ----------
  async _buildNature() {
    const { P, R } = this;
    const street = [];
    // ردیف‌های منظم درخت در دو طرف هر خیابان — نه روی خط عابر پیاده و نه جلوی آن
    const roadLines = [];
    for (let i = -4; i <= 3; i++) roadLines.push((i + 0.5) * P);
    const nearCross = (v) => roadLines.some((l) => Math.abs(v - l) < R / 2 + 1.85);
    for (const l of [-2.5, -1.5, -0.5, 0.5, 1.5, 2.5]) {
      const line = l * P;
      let k = 0;
      for (let t = -3 * P + 2; t <= 3 * P - 1.5; t += 3.9, k++) {
        const off = (k % 2) * 1.95;
        for (const [sx, sz] of [
          [line - R / 2 - 0.95, t + off], [line + R / 2 + 0.95, t + 1.95 - off],
          [t + off, line - R / 2 - 0.95], [t + 1.95 - off, line + R / 2 + 0.95],
        ]) {
          // کنار تقاطع‌ها (خط عابر و گوشه‌ی روبه‌رو) خالی بماند
          if (nearCross(sx) && nearCross(sz)) continue;
          if (nearCross(sz) && Math.abs(sx - line) < R / 2 + 2.6) continue;
          if (nearCross(sx) && Math.abs(sz - line) < R / 2 + 2.6) continue;
          street.push([sx, sz]);
        }
      }
    }
    // جنگل انبوه بیرون شهر — جاده‌ها از توش رد می‌شوند و در مه محو می‌شوند
    // جنگل واقعی: چند لایه درخت با تراکم بالا — جاده‌ها و پیاده‌روها از توش
    // رد می‌شوند و بقیه در مه محو می‌شود
    const outer = [];
    const onRoad = (x, z) => roadLines.some((l) => Math.abs(x - l) < R / 2 + 1.4) || roadLines.some((l) => Math.abs(z - l) < R / 2 + 1.4);
    const tooClose = (x, z, min) => outer.some(([ox, oz]) => Math.abs(ox - x) < min && Math.abs(oz - z) < min);
    for (let layer = 0; layer < 3; layer++) {
      const n = layer === 0 ? 420 : layer === 1 ? 380 : 300;
      const spread = layer === 0 ? 22 : layer === 1 ? 34 : 48;
      const gap = layer === 0 ? 3.0 : layer === 1 ? 3.6 : 4.4;
      for (let i = 0; i < n; i++) {
        const a = rand() * Math.PI * 2;
        const rad = CITY.half + 5.5 + rand() * spread;
        const x = Math.cos(a) * rad, z = Math.sin(a) * rad;
        if (onRoad(x, z)) continue;
        if (tooClose(x, z, gap)) continue;
        outer.push([x, z]);
      }
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
    for (let i = 0; i < 46; i++) {
      const a = rand() * Math.PI * 2, rad = CITY.half + 6 + rand() * 40;
      rocks.push({ x: Math.cos(a) * rad, z: Math.sin(a) * rad, y: 0, rot: rand() * 6.28, foot: 0.7 + rand() * 0.9 });
    }
    for (let i = 0; i < 110; i++) {
      const a = rand() * Math.PI * 2, rad = CITY.half + 5 + rand() * 42;
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
      // پیاده‌روی بلوک‌های بیرونی — آدمک‌ها فقط وسط شهر جمع نمی‌شوند
      { cx: -2 * P, cz: -2 * P, h: inset, n: 3 },
      { cx: 2 * P, cz: -2 * P, h: inset, n: 3 },
      { cx: 0, cz: -2 * P, h: inset, n: 3 },
      { cx: 0, cz: 2 * P, h: inset, n: 3 },
      { cx: -2 * P, cz: 0, h: inset, n: 3 },
      { cx: 2 * P, cz: 0, h: inset, n: 3 },
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

    // عابرهایی که فقط از خط عابرِ تقاطع‌ها رد می‌شوند و منتظر ماشین می‌مانند
    // (فقط تقاطع‌های داخل شهر — نه خیابان بیرونی که به مه می‌رود)
    const roadLines = [];
    for (let i = -3; i <= 2; i++) roadLines.push((i + 0.5) * P);
    const CW = this.R / 2 + 0.62;
    for (let i = 0; i < 12; i++) {
      const lx = pickOf(roadLines), lz = pickOf(roadLines);
      const vert = rand() < 0.5;                  // عبور در راستای z (از روی جاده‌ی افقی)
      const cwSide = rand() < 0.5 ? -1 : 1;       // کدام خط عابرِ تقاطع
      const ax = vert ? lx + cwSide * CW : lx - CW - 0.95;
      const az = vert ? lz - CW - 0.95 : lz + cwSide * CW;
      const bx = vert ? ax : lx + CW + 0.95;
      const bz = vert ? lz + CW + 0.95 : az;
      const p = this._person();
      p.g.position.set(ax, 0.06, az);
      this.group.add(p.g);
      this.crossers.push({
        ...p, lx, lz, vert, ax, az, bx, bz, x: ax, z: az,
        phase: 'wait', t: 1 + rand() * 5, prog: 0, back: false,
        speed: 0.85 + rand() * 0.35, baseRy: 0,
      });
    }
  }

  // ---------- ترافیک شبکه‌ای: ماشین‌ها روی گرید خیابان‌ها آزادانه می‌گردند ----------
  // هر ماشین روی یک جاده حرکت می‌کند، در هر تقاطع تصادفی می‌پیچد (پیچ نرمِ بزیه)،
  // از ماشین جلویی عقب نمی‌ماند و برای عابر خط عابر کامل می‌ایستد.
  _roadLines() {
    if (!this._lines) {
      this._lines = [];
      for (let i = -CITY.range - 1; i <= CITY.range; i++) this._lines.push((i + 0.5) * this.P);
    }
    return this._lines;
  }

  get LANE() { return 1.16; }               // فاصله‌ی لاین از مرکز جاده (دوطرفه)
  get D_IN() { return this.R / 2 + 2.1; }   // نقطه‌ی تصمیم/توقف قبل از تقاطع

  _nearestLine(v) {
    let best = this._roadLines()[0], bd = Infinity;
    for (const l of this._roadLines()) {
      const d = Math.abs(l - v);
      if (d < bd) { bd = d; best = l; }
    }
    return best;
  }

  // نزدیک‌ترین تقاطعِ جلوتر در جهت حرکت — null یعنی جاده به لبه‌ی شهر رسید
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

  // قرار دادن ماشین روی یک جاده‌ی تصادفی شبکه
  _placeOnRoad(c, outer = false) {
    const L = this._roadLines();
    const pool = outer ? L.filter((l) => Math.abs(l) >= 2 * this.P) : L;
    const line = pool[Math.floor(rand() * pool.length)];
    const vert = rand() < 0.5;
    const along = (rand() * 2 - 1) * (3.5 * this.P - 3);
    const sgn = rand() < 0.5 ? 1 : -1;
    if (vert) {
      c.hx = 0; c.hz = sgn;
      c.x = line - sgn * this.LANE;
      c.z = along;
    } else {
      c.hx = sgn; c.hz = 0;
      c.x = along;
      c.z = line + sgn * this.LANE;
    }
    c.nextC = this._nextCross(c.x, c.z, c.hx, c.hz);
    c.angle = Math.atan2(c.hx, c.hz);
    c.obj.rotation.y = c.angle;
    c.obj.position.set(c.x, 0.07, c.z);
    c._p = { x: c.x, z: c.z, hx: c.hx, hz: c.hz };
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
      const straightNext = this._nextCross(C.x + hx * 2, C.z + hz * 2, hx, hz);
      const rightNext = this._nextCross(C.x + rhx * 2, C.z + rhz * 2, rhx, rhz);
      const leftNext = this._nextCross(C.x - rhx * 2, C.z - rhz * 2, -rhx, -rhz);
      const last = !straightNext;   // دیگر تقاطعی در ادامه نیست → لبه‌ی شهر
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
    if (choice !== 'exit') {
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

  // فاصله‌ی دنیایی نقطه‌ی محلی شهر از دوربین
  _camDist(c) {
    const w = this._toWorld(c.x, c.z);
    const cam = this.world && this.world.camera ? this.world.camera.position : { x: 0, y: 99, z: 0 };
    return Math.hypot(w.x - cam.x, w.z - cam.z, -cam.y);
  }

  // بعد از رفتن در مه، از سمت دیگری وارد شهر می‌شود — همیشه از نقطه‌ای که
  // از دید دوربین دورترین است تا «ظاهر شدن ناگهانی» دیده نشود
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
    c.obj.rotation.y = c.angle;
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
      const spin = (c.cur * dt) / Math.max(0.05, c.wheelR);

      if (c.state === 'turning') {
        const T = c._turn;
        T.t = Math.min(1, T.t + (c.cur * dt) / T.len);
        // اگر بیش از حد مجاز وسط تقاطع ایستاد (صف/تصادف) پیچ را کامل می‌کند
        c._turnStill = c.cur < 0.05 ? (c._turnStill || 0) + dt : 0;
        if (c._turnStill > 7) T.t = 1;
        const u = 1 - T.t;
        const bx = u * u * u * T.x0 + 3 * u * u * T.t * T.x1 + 3 * u * T.t * T.t * T.x2 + T.t * T.t * T.t * T.x3;
        const bz = u * u * u * T.z0 + 3 * u * u * T.t * T.z1 + 3 * u * T.t * T.t * T.z2 + T.t * T.t * T.t * T.z3;
        const tx = 3 * u * u * (T.x1 - T.x0) + 6 * u * T.t * (T.x2 - T.x1) + 3 * T.t * T.t * (T.x3 - T.x2);
        const tz = 3 * u * u * (T.z1 - T.z0) + 6 * u * T.t * (T.z2 - T.z1) + 3 * T.t * T.t * (T.z3 - T.z2);
        const tl = Math.hypot(tx, tz) || 1;
        c.x = bx; c.z = bz;
        c._p = { x: bx, z: bz, hx: tx / tl, hz: tz / tl };
        c.obj.position.set(bx, 0.07, bz);
        const ta = Math.atan2(c._p.hx, c._p.hz);
        let d = ta - c.angle;
        while (d > Math.PI) d -= Math.PI * 2;
        while (d < -Math.PI) d += Math.PI * 2;
        c.angle += d * Math.min(1, dt * 10);
        c.obj.rotation.y = c.angle;
        for (const w of c.wheels) w.rotation.x += spin;
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
        c.obj.position.set(c.x, 0.07, c.z);
        const ta = Math.atan2(c.hx, c.hz);
        let d = ta - c.angle;
        while (d > Math.PI) d -= Math.PI * 2;
        while (d < -Math.PI) d += Math.PI * 2;
        c.angle += d * Math.min(1, dt * 7);
        c.obj.rotation.y = c.angle;
        for (const w of c.wheels) w.rotation.x += spin;
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
    const per = this._person();
    const x = sp.x + (Math.random() - 0.5) * 0.8;
    const z = sp.z + (Math.random() < 0.5 ? -1 : 1) * (0.6 + Math.random() * 0.6);
    per.g.position.set(x, 0.06, z);
    this.group.add(per.g);
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
          v.g.position.set(v.x, 0.06, v.z);
          v.g.rotation.y = Math.atan2(tx - v.x, tz - v.z);
          const swing = Math.sin(t * 8.5);
          v.legL.rotation.x = swing * 0.5; v.legR.rotation.x = -swing * 0.5;
          v.armL.rotation.x = -swing * 0.35; v.armR.rotation.x = swing * 0.35;
        } else if (v.phase === 'toDoor') {
          v.g.visible = false;          // وارد خانه شد
          v.phase = 'inside'; v.t = 0;
        } else {
          this.group.remove(v.g);       // رفت
          this.visitors.splice(i, 1);
          continue;
        }
      } else if (v.phase === 'inside') {
        if (v.t > v.stay) {
          v.g.visible = true;           // از خانه آمد بیرون
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
      b.obj.position.set(bx, 0.07, bz);
      b.obj.rotation.y = b.angle;
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
      const per = this._person();
      per.g.position.set(px, 0.06, pz);
      per.g.rotation.y = Math.atan2(car.x - px, car.z - pz);
      this.group.add(per.g);
      people.push({ ...per, x: px, z: pz });
    }
    // پلیس اعزام می‌شود (در گرید به سمت محل می‌پیچد)
    police.state = 'dispatch';
    police._dest = { x: a.x, z: a.z };
    if (police.lights) police.lights.bar.visible = true;
    this.accident = { a, b, people, police, x: a.x, z: a.z, phase: 'wait', t: 0 };
    if (this.ui?.toast) this.ui.toast('🚨 یه تصادف کوچولو شد؛ پلیس داره می‌رسه!');
  }

  _updateAccident(dt, t) {
    const A = this.accident;
    A.t += dt;
    if (A.police.lights) {
      const on = Math.sin(t * 16) > 0;
      A.police.lights.red.visible = on;
      A.police.lights.blue.visible = !on;
    }
    for (const p of A.people) {
      p.g.position.y = 0.06 + Math.abs(Math.sin(t * 1.3 + p.z)) * 0.012;
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
          p.g.position.set(p.x, 0.06, p.z);
          p.g.rotation.y = Math.atan2(tx - p.x, tz - p.z);
          const swing = Math.sin(t * 9);
          p.legL.rotation.x = swing * 0.5; p.legR.rotation.x = -swing * 0.5;
          p.armL.rotation.x = -swing * 0.35; p.armR.rotation.x = swing * 0.35;
        }
      }
      if (all && A.t > 3) {
        for (const p of A.people) this.group.remove(p.g);
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
        if (A.police.lights) { A.police.lights.bar.visible = false; A.police.lights.red.visible = true; A.police.lights.blue.visible = true; }
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
      car.obj.position.set(x, 0.07, z);
      const ta = Math.atan2(x2 - x, z2 - z);
      let d = ta - car.angle;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      car.angle += d * Math.min(1, dt * 6);
      car.obj.rotation.y = car.angle;
      const spin = Math.hypot(x2 - x, z2 - z) / Math.max(0.05, car.wheelR);
      for (const w of car.wheels) w.rotation.x += spin;
      if (pk.prog >= 1) {
        if (E.phase === 'drive') {
          car.obj.rotation.y = car.angle = spot.rot;
          car.state = 'parked';
          E.phase = 'exit'; E.t = 0;
          // راننده پیاده می‌شود
          const per = this._person();
          per.g.position.set(spot.x + 0.85, 0.06, spot.z);
          this.group.add(per.g);
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
        p.g.position.set(p.x, 0.06, p.z);
        p.g.rotation.y = Math.atan2(tx - p.x, tz - p.z);
        const swing = Math.sin(t * 8.5);
        p.legL.rotation.x = swing * 0.5; p.legR.rotation.x = -swing * 0.5;
        p.armL.rotation.x = -swing * 0.35; p.armR.rotation.x = swing * 0.35;
      } else if (going) {
        p.g.visible = false;          // وارد خانه می‌شود
        E.phase = 'inside'; E.t = 0; E.stay = 40 + Math.random() * 80;
      } else {
        this.group.remove(p.g);       // سوار می‌شود و می‌رود
        car._park.prog = 0;
        E.phase = 'away'; E.t = 0;
      }
    } else if (E.phase === 'inside') {
      if (E.t > E.stay) {
        E.driver.g.visible = true;
        E.driver.x = spot.door.x;
        E.driver.z = spot.door.z;
        E.phase = 'return';
      }
    }
  }

  // ---------- حلقه‌ی بازی ----------
  update(dt) {
    this.time += dt;
    const t = this.time;

    // ترافیک (فاصله‌گیری/توقف برای عابر/خروج از شهر) + رویدادها (تصادف/پارک)
    this._updateTraffic(dt, t);
    this._updateEvents(dt, t);

    // عابرهای خط عابر
    for (const cr of this.crossers) {
      const len = Math.hypot(cr.bx - cr.ax, cr.bz - cr.az) || 1;
      if (cr.phase === 'wait' || cr.phase === 'pause') {
        cr.t -= dt;
        cr.g.rotation.y = cr.baseRy + Math.sin(t * 0.7 + cr.ax) * 0.09;
        cr.g.position.y = 0.06 + Math.abs(Math.sin(t * 1.4 + cr.az)) * 0.012;
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
            if (d < 2.2 || (d < 6.2 && c.cur > 0.25)) {
              // ماشینِ کاملاً ایستاده عابر را برای همیشه نگه نمی‌دارد (ضدِ قفل دایره‌ای:
              // عابرِ ساکن مانعِ ماشین است و ماشینِ ساکن مانعِ عابر — هیچ‌کدام رد نمی‌شدند)
              if (c.cur > 0.05) { hold = true; break; }
            }
          }
          // بعد از ۱۰ ثانیه انتظار، عابر رد می‌شود؛ ماشین‌ها برای عابرِ روی خط می‌ایستند
          if (cr._holdT > 10) hold = false;
        } else cr._holdT = 0;
        if (!hold) cr.prog = Math.min(1, cr.prog + (cr.speed * dt) / len);
        const q = cr.back ? 1 - cr.prog : cr.prog;
        const x = cr.ax + (cr.bx - cr.ax) * q;
        const z = cr.az + (cr.bz - cr.az) * q;
        // پاها به‌آرامی به حالت ایست برمی‌گردند (نه فریزِ وسط قدم)
        cr.moveAmt = (cr.moveAmt ?? 0) + ((hold ? 0 : 1) - (cr.moveAmt ?? 0)) * Math.min(1, dt * 5);
        const swing = Math.sin(t * 8.5) * cr.moveAmt;
        if (!hold) {
          const fx = (cr.bx - cr.ax) * (cr.back ? -1 : 1);
          const fz = (cr.bz - cr.az) * (cr.back ? -1 : 1);
          cr.g.rotation.y = Math.atan2(fx, fz);
          cr.x = x; cr.z = z;
        }
        cr.g.position.set(cr.x, 0.06 + Math.abs(Math.cos(t * 8.5)) * 0.035 * cr.moveAmt + Math.abs(Math.sin(t * 1.4)) * 0.012 * (1 - cr.moveAmt), cr.z);
        cr.legL.rotation.x = swing * 0.55;
        cr.legR.rotation.x = -swing * 0.55;
        cr.armL.rotation.x = -swing * 0.42;
        cr.armR.rotation.x = swing * 0.42;
        if (cr.prog >= 1) {
          cr.back = !cr.back;
          cr.phase = cr.back ? 'pause' : 'wait';
          cr.t = 1.5 + Math.random() * 5;
        }
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
