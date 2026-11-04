// شبیه‌سازی بلند مدت: چند دقیقه‌ی مجازی از update شهر — رویدادها (تصادف/پارک/
// خروج از شهر/عابر) باید اجرا و کامل شوند بدون خطا و بدون NaN.
// برای رندرِ دو‌بعدی: فقط منطقِ شهر اجرا می‌شود، تصویری کشیده نمی‌شود.
import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const dom = new JSDOM('<!DOCTYPE html><html><body><div id="labels"></div></body></html>', {
  url: 'http://localhost/', pretendToBeVisual: true,
});
const { window } = dom;
global.window = window;
global.document = window.document;
global.HTMLElement = window.HTMLElement;
global.HTMLCanvasElement = window.HTMLCanvasElement;
global.MutationObserver = window.MutationObserver;
global.ProgressEvent = window.ProgressEvent;
global.self = globalThis;
Object.defineProperty(global, 'navigator', { value: window.navigator, configurable: true });
global.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 16);
global.cancelAnimationFrame = (id) => clearTimeout(id);
window.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });

// استابِ canvas دوبعدی: شهر فقط drawImage و شکل می‌خواهد
function make2D() {
  const gradient = { addColorStop() {} };
  return new Proxy({}, {
    get(t, prop) {
      if (prop === 'createRadialGradient' || prop === 'createLinearGradient') return () => gradient;
      if (prop === 'measureText') return () => ({ width: 10 });
      if (prop === 'canvas') return { width: 128, height: 128 };
      if (typeof prop === 'string') return () => undefined;
      return undefined;
    },
    set() { return true; },
  });
}
window.HTMLCanvasElement.prototype.getContext = function (type) { return type === '2d' ? make2D() : null; };
Object.defineProperty(window.HTMLImageElement.prototype, 'src', {
  configurable: true,
  set(v) {
    this._src = v;
    setTimeout(() => {
      try {
        Object.defineProperty(this, 'width', { value: 1, configurable: true });
        Object.defineProperty(this, 'height', { value: 1, configurable: true });
      } catch (e) { /* ok */ }
      this.dispatchEvent(new window.Event('load'));
    }, 0);
  },
  get() { return this._src || ''; },
});
global.Image = window.Image;
window.Image = window.Image;
// units.json و اندازه‌ی تصویرها از فایلِ پخته خوانده می‌شود
global.fetch = async (url) => {
  const u = new URL(String(url));
  const buf = readFileSync(join('public', u.pathname.replace(/^\/+/, '')));
  return { ok: true, status: 200, json: async () => JSON.parse(buf.toString()) };
};

const { World } = await import('../src/world.js');
const { City } = await import('../src/city.js');

const canvas = document.createElement('canvas');
Object.defineProperty(canvas, 'clientWidth', { value: 1200 });
Object.defineProperty(canvas, 'clientHeight', { value: 700 });
canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1200, height: 700 });
const world = new World(canvas);

const toasts = [];
const ui = { toast: (m) => toasts.push(m) };
const city = new City(world, ui);
await city.init();

// ---------- شبیه‌سازی ----------
const DT = 1 / 30;
const SECONDS = process.env.SIM_SECONDS ? parseInt(process.env.SIM_SECONDS) : 600; // ۱۰ دقیقه‌ی مجازی
const seen = {
  exiting: 0, reentered: 0, accidents: 0, accidentsDone: 0,
  parks: 0, parksDone: 0, visits: 0, visitsDone: 0,
  crossPhases: new Set(),
  carStates: new Set(),
};
let frames = SECONDS / DT;
let t = 0;
// پیاده‌راه‌ها (تکه‌های بسته‌ی CITY.carFree): بدنه‌ی تکه بدون جعبه‌ی تقاطع‌های دو سرش
const closedRects = [...city._carFree.keys()].map((key) => {
  const [o, a, k] = key.split(':');
  const line = (+a + 0.5) * city.P, mid = +k * city.P, len = city.B / 2 - 0.3;
  return o === 'v' ? { x: line, z: mid, hx: city.R / 2, hz: len } : { x: mid, z: line, hx: len, hz: city.R / 2 };
});
let carFreeIntrusions = 0;
// میدان گردان و چراغ‌ها
let islandHits = 0, roundTrips = 0, redRuns = 0, redStops = 0, roundOverlap = 0;
const inBox = new Map();   // ماشین ← آیا داخل جعبه‌ی تقاطعِ چراغ‌دار است
for (let i = 0; i < frames; i++) {
  t += DT;
  city.update(DT);
  if (process.env.DBG_VIS && Math.abs(t % 10) < DT) console.error('t=' + t.toFixed(0), 'vis', city.visitors.length, city.visitors.map(v => v.phase).join(','));
  const ocBefore = city._outsideCount;
  for (const c of city.cars) {
    seen.carStates.add(c.state);
    if (city._outsideCount > ocBefore) seen.exiting++;
    if (!Number.isFinite(c.x) || !Number.isFinite(c.z) || !Number.isFinite(c.actor.pos.x)) {
      console.error(`NaN car position! state=${c.state} name=${c.name}`); process.exit(1);
    }
    // هیچ ماشینی از روی جزیره‌ی میدان رد نمی‌شود (شعاع جزیره ۱ + نصف پهنای ماشین)
    // ماشینِ در حالِ گردش روی حلقه‌ی ۱.۸۵ می‌رود؛ آستانه ۱.۱۵ فقط «بریدنِ جزیره» را
    // می‌گیرد. (آستانه‌ی قبلیِ ۱.۳۵ با ورودیِ کمانِ اول هم برخورد می‌کرد و در نسخه‌ی
    // سه‌بعدی هم گاهی رد می‌شد.)
    for (const R0 of city._rounds) {
      const dist = Math.hypot(c.x - R0.x, c.z - R0.z);
      if (dist < 1.15) {
        if (!islandHits) console.error(`ماشین از روی جزیره‌ی میدان رد شد! ${c.name} state=${c.state} d=${dist.toFixed(2)}`);
        islandHits++;
      }
    }
    if (c.state === 'turning' && c._turn && c._turn.pts && !c._turn._counted) { c._turn._counted = true; roundTrips++; }
    // ورود به جعبه‌ی تقاطع چراغ‌دار وقتی چراغ رو به ماشین قرمز است = عبور از چراغ قرمز
    for (const L of city._lights) {
      const inside = Math.abs(c.x - L.x) < city.R / 2 && Math.abs(c.z - L.z) < city.R / 2;
      const key = c.name + '@' + L.x + ',' + L.z + '#' + city.cars.indexOf(c);
      const was = inBox.get(key) || false;
      if (inside && !was && (c.state === 'straight' || c.state === 'turning' || c.state === 'dispatch')) {
        const axis = Math.abs(c.hz) > 0.5 ? 'ns' : 'ew';
        // ماشینی که ایستاده و تازه یک پله واردِ مرزِ جعبه شده تخلف نکرده است؛
        // «رد شدن از چراغ» یعنی با سرعتِ محسوس از خط رد شود.
        const creeping = c.cur < 0.4;
        if (city._lightState(L, axis) === 'red' && c.state !== 'turning' && !creeping) {
          if (!redRuns) console.error(`عبور از چراغ قرمز! ${c.name} pos=(${c.x.toFixed(1)},${c.z.toFixed(1)})`);
          redRuns++;
        }
      }
      inBox.set(key, inside);
      // ماشینی که پشت چراغ قرمز ایستاده
      const dc = Math.hypot(c.x - L.x, c.z - L.z);
      if (c.state === 'straight' && c.cur < 0.05 && dc < 6 && dc > 3 &&
        city._lightState(L, Math.abs(c.hz) > 0.5 ? 'ns' : 'ew') !== 'green') redStops++;
    }
    if (c.state !== 'toPark' && c.state !== 'away' && c.state !== 'parked' &&
      closedRects.some((r) => Math.abs(c.x - r.x) < r.hx && Math.abs(c.z - r.z) < r.hz)) {
      if (!carFreeIntrusions) console.error(`ماشین وارد پیاده‌راه شد! ${c.name} state=${c.state} pos=(${c.x.toFixed(1)},${c.z.toFixed(1)})`);
      carFreeIntrusions++;
    }
    // ماشین باید روی جاده باشد (به‌جز حالت‌های خاص)
    if (c.state === 'straight' || c.state === 'exiting' || c.state === 'dispatch') {
      const lx = city._nearestLine(Math.abs(c.hz) > 0.5 ? c.x : c.z);
      const lat = Math.abs((Math.abs(c.hz) > 0.5 ? c.x : c.z) - lx);
      if (lat > 1.9) {
        console.error(`ماشین از جاده خارج شد! ${c.name} state=${c.state} lat=${lat.toFixed(2)}`); process.exit(1);
      }
    } else if (c.state === 'turning' && c._turnC) {
      // در حال پیچیدن: باید داخل محدوده‌ی تقاطع باشد
      const d = Math.hypot(c.x - c._turnC.x, c.z - c._turnC.z);
      if (d > 8) {
        console.error(`پیچ از تقاطع خارج شد! ${c.name} d=${d.toFixed(2)}`); process.exit(1);
      }
    }
  }
  // دو ماشینِ داخل میدان گردان روی هم نمی‌روند
  for (const R0 of city._rounds) {
    const inR = city.cars.filter((c) => c.state === 'turning' && Math.hypot(c.x - R0.x, c.z - R0.z) < 3);
    for (let a = 0; a < inR.length; a++) for (let b = a + 1; b < inR.length; b++) {
      if (Math.hypot(inR[a].x - inR[b].x, inR[a].z - inR[b].z) < 1.0) {
        if (!roundOverlap) console.error(`دو ماشین در میدان روی هم رفتند! ${inR[a].name} / ${inR[b].name}`);
        roundOverlap++;
      }
    }
  }
  // دیتیکتور بن‌بست: ماشین سالم که مدت زیادی سرعتش صفر است
  for (const c of city.cars) {
    if (!c._still) c._still = { t: 0, x: c.actor.pos.x, z: c.actor.pos.z };
    const moved = Math.hypot(c.actor.pos.x - c._still.x, c.actor.pos.z - c._still.z) > 0.05;
    if (moved) { c._still = { t: 0, x: c.actor.pos.x, z: c.actor.pos.z }; }
    else c._still.t += DT;
    // صفِ پشت رویدادهای معتبر (تصادف تا ~۴۰s + تخلیه‌ی صف) نباید خطا شمرده شود؛
    // قفلِ واقعی هرگز رفع نمی‌شود و در ۷۰ ثانیه هم دیده می‌شود
    const legit = c.state === 'crashed' || c.state === 'parked' || c.state === 'toPark' ||
      (city.accident && c._still.t < 70);
    if (!legit && c._still.t > 70) {
      console.error(`بن‌بست! ${c.name} state=${c.state} به مدت ${c._still.t.toFixed(0)}s ثابت است`);
      console.error(`  pos=(${c.x.toFixed(1)},${c.z.toFixed(1)}) h=(${c.hx},${c.hz}) cur=${c.cur.toFixed(2)} target=${(c._target ?? -1).toFixed(2)} speed=${c.speed.toFixed(2)}`);
      if (c.nextC) {
        const dc = (c.nextC.x - c.x) * c.hx + (c.nextC.z - c.z) * c.hz;
        console.error(`  nextC=(${c.nextC.x.toFixed(1)},${c.nextC.z.toFixed(1)}) dc=${dc.toFixed(2)} D_IN=${city.D_IN}`);
      } else console.error('  nextC=null');
      for (const o of city.cars) {
        if (o === c) continue;
        const rx = o.x - c.x, rz = o.z - c.z;
        const fwd = rx * c.hx + rz * c.hz;
        if (fwd <= 0 || fwd > 36) continue;
        const lat = Math.abs(rx * c.hz - rz * c.hx);
        if (lat > 1.5) continue;
        console.error(`  جلو: ${o.name} state=${o.state} fwd=${fwd.toFixed(1)} lat=${lat.toFixed(2)} cur=${o.cur.toFixed(2)} still=${(o._still?.t || 0).toFixed(0)}s pos=(${o.x.toFixed(1)},${o.z.toFixed(1)}) h=(${o.hx},${o.hz})`);
      }
      for (const cr of city.crossers) {
        const d = Math.hypot(cr.x - c.x, cr.z - c.z);
        if (d < 6) console.error(`  عابر: phase=${cr.phase} prog=${(cr.prog || 0).toFixed(2)} d=${d.toFixed(1)} pos=(${cr.x.toFixed(1)},${cr.z.toFixed(1)})`);
      }
      // وضعیت همه‌ی ماشین‌های نزدیک
      for (const o of city.cars) {
        const d = Math.hypot(o.x - c.x, o.z - c.z);
        if (d > 14 || o === c) continue;
        const tc = o._turnC ? ` turnC=(${o._turnC.x.toFixed(0)},${o._turnC.z.toFixed(0)}) t=${(o._turn ? o._turn.t : -1).toFixed(2)} still=${(o._turnStill || 0).toFixed(1)}` : '';
        const nc = o.nextC ? ` nextC=(${o.nextC.x.toFixed(0)},${o.nextC.z.toFixed(0)})` : ' nextC=null';
        console.error(`  نزدیک: ${o.name} state=${o.state} pos=(${o.x.toFixed(1)},${o.z.toFixed(1)}) cur=${o.cur.toFixed(2)}${tc}${nc}`);
      }
      if (city.parkEvent) { const pe = city.parkEvent; console.error(`  parkEvent: phase=${pe.phase} car=${pe.car.name} spot=(${pe.spot.x.toFixed(1)},${pe.spot.z.toFixed(1)}) carPos=(${pe.car.x.toFixed(1)},${pe.car.z.toFixed(1)})`); }
      if (city.accident) console.error(`  accident: phase=${city.accident.phase}`);
      process.exit(1);
    }
  }
  if (city._outsideCount < (city._ocPrev ?? 0)) seen.reentered++;
  city._ocPrev = city._outsideCount;
  if (city.accident) { if (city.accident._counted !== true) { city.accident._counted = true; seen.accidents++; } }
  else if (seen.accidents > seen.accidentsDone) seen.accidentsDone = seen.accidents;
  if (city.parkEvent) { if (!city.parkEvent._c) { city.parkEvent._c = 1; seen.parks++; } }
  else if (seen.parks > seen.parksDone) seen.parksDone = seen.parks;
  // بازدید خانه‌ها (هر آدمک جدا شمرده می‌شود)
  for (const v of city.visitors) {
    if (v.phase === 'inside' && !v._seenIn) { v._seenIn = 1; seen.visits++; }
    if (v.phase === 'back' && !v._seenOut) { v._seenOut = 1; seen.visitsDone++; }
  }
  for (const cr of city.crossers) {
    seen.crossPhases.add(cr.phase);
    if (!Number.isFinite(cr.x) || !Number.isFinite(cr.z)) { console.error('NaN crosser!'); process.exit(1); }
  }
}

// بررسی نهایی
let fail = 0;
const check = (n, c) => { console.log((c ? '✓ ' : '✗ ') + n); if (!c) fail++; };
check('هیچ خطایی در ۱۰ دقیقه مجازی رخ نداد', true);
check('ماشین‌ها فاصله‌گیری می‌کنند (سرعت لحظه‌ای < پایه اتفاق می‌افتد)', city.cars.some((c) => c.cur < c.speed * 0.95));
check('خروج از شهر دیده شد', seen.carStates.has('exiting'));
check('ورود دوباره به شهر دیده شد', seen.reentered >= 1);
check('پیچیدن ماشین‌ها دیده شد (مسیر غیرتکراری)', seen.carStates.has('turning'));
// پخش‌شدگی: ماشین و آدمک فقط وسط شهر جمع نشده باشند
const farCars = city.cars.filter((c) => Math.hypot(c.x, c.z) > 30).length;
const farPeds = [...city.peds, ...city.crossers].filter((p) =>
  Math.hypot(p.g.pos.x, p.g.pos.z) > 25).length;
check(`ماشین‌ها پخش هستند (${farCars} تا بیرونِ شعاع ۳۰)`, farCars >= 6);
check(`آدمک‌ها پخش هستند (${farPeds} تا بیرونِ شعاع ۲۵)`, farPeds >= 8);
check('آدمک‌ها داخل خانه می‌روند و برمی‌گردند', seen.visits >= 1 && seen.visitsDone >= 1);
check('رویداد تصادف اجرا و تمام شد', seen.accidents >= 1 && seen.accidentsDone >= 1);
check('رویداد پارک اجرا و تمام شد', seen.parks >= 1 && seen.parksDone >= 1);
check('عابرها صبر/عبور کردند', seen.crossPhases.has('cross') && seen.crossPhases.size >= 2);
// تصادف فقط روی نقشه دیده می‌شود؛ پیامِ بالای صفحه عمداً حذف شد
check('برای تصادف توستی نیامد', !toasts.some((m) => m.includes('تصادف')));
check('هیچ ماشینی گم نشده (همه در فهرستِ رسم‌اند)', city.cars.every((c) => world.dynamic.includes(c.actor) || world.staticActors.includes(c.actor)));
check(`هیچ ماشینی وارد پیاده‌راه‌ها نشد (${closedRects.length} تکه‌ی بسته)`, closedRects.length > 0 && carFreeIntrusions === 0);
check(`ماشین‌ها دور میدان گردان می‌چرخند (${roundTrips} دور) و از روی جزیره رد نمی‌شوند`, roundTrips >= 3 && islandHits === 0);
check('دو ماشین داخل میدان روی هم نرفتند', roundOverlap === 0);
check(`ماشین‌ها پشت چراغ قرمز می‌ایستند و ردش نمی‌کنند (${redRuns} تخلف)`, redStops > 0 && redRuns === 0);
const maxCur = Math.max(...city.cars.map((c) => c.cur));
check(`سرعت‌ها معقول‌اند (بیشینه ${maxCur.toFixed(2)})`, maxCur < 4.5);
console.log('states دیده‌شده:', [...seen.carStates].join(', '));
console.log('phases عابر:', [...seen.crossPhases].join(', '));
console.log(`تصادف‌ها: ${seen.accidents} (کامل‌شده ${seen.accidentsDone}) | پارک‌ها: ${seen.parks} (کامل‌شده ${seen.parksDone})`);
console.log(`بیرون شهر: ${city._outsideCount} | توست‌ها: ${toasts.length}`);
process.exit(fail ? 1 : 0);
