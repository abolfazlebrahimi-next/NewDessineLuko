// ================= شهر لوکو — نقطه‌ی شروع =================
import * as THREE from 'three';
import { World } from './world.js';
import { UI } from './ui.js';
import { City } from './city.js';
import { LAYOUT } from './config.js';
import { load, save } from './state.js';
import { sfx } from './audio.js';

load();

const canvas = document.getElementById('scene');
const world = new World(canvas);
const ui = new UI(world);
const city = new City(world, ui);
// init تا آخرِ لودِ همه‌ی مدل‌ها resolve نمی‌شود
const cityReady = city.init().catch((e) => console.warn('city:', e));
ui.city = city;

// نمای آغازین: هسته‌ی شهر از کمی دورتر (روی موبایل عمودی بازتر)
world.focusOn(0, 1.5, window.innerWidth / Math.max(1, window.innerHeight) > 1.15 ? 0.55 : 0.42);

// ---------- حلقه‌ی بازی ----------
let last = performance.now();
function frame(now) {
  try {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    city.update(dt);
    ui.updateFloats(dt);
    world.update(dt);
  } catch (e) {
    console.error('[LukoFrame]', e);
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
// صفحه‌ی لودینگ تا لود کاملِ «همه‌ی» مدل‌ها می‌ماند (درست برای شبکه‌های کند) تا
// هیچ ساختمانِ نصفه‌کاره یا پرشی دیده نشود؛ درصد پیشرفت از loader.js می‌آید.
// اگر شبکه فوق‌العاده کند بود، بعد از ۶۰ ثانیه به‌هرحال بازی باز می‌شود.
const booted = () => { window.__LUKO_BOOTED__ = true; };
Promise.race([
  cityReady,
  new Promise((r) => setTimeout(r, 60000)),
]).then(booted, booted);

// ================= ورودی: کشیدن نقشه، پینچ، کلیک روی ساختمان‌ها =================
const activePointers = new Map();
let down = null;      // { x, y, time, moved, mesh }
let pinching = false;
let pinch = null;     // { d, zoom }
let lastHoverTag = null;

function setHover(mesh) {
  const tag = mesh && mesh.userData && mesh.userData.type === 'building' ? mesh.userData.id : null;
  if (tag === lastHoverTag) return;
  if (lastHoverTag) world.hoverSprite(lastHoverTag, false);
  lastHoverTag = tag;
  if (tag) world.hoverSprite(tag, true);
  canvas.style.cursor = tag ? 'pointer' : 'grab';
}

canvas.addEventListener('pointerdown', (e) => {
  try {
    activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (activePointers.size === 2) {
      const [p1, p2] = [...activePointers.values()];
      pinch = { d: Math.hypot(p1.x - p2.x, p1.y - p2.y), zoom: world.zoom };
      pinching = true;
      down = null;
      return;
    }
    down = {
      x: e.clientX, y: e.clientY,
      time: performance.now(),
      moved: false,
      mesh: world.pick(e.clientX, e.clientY),
    };
    canvas.setPointerCapture(e.pointerId);
    canvas.classList.add('grabbing');
  } catch (err) { console.error('[pointerdown]', err); }
});

canvas.addEventListener('pointermove', (e) => {
  try {
    if (activePointers.has(e.pointerId)) {
      activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    }
    if (pinching && pinch && activePointers.size >= 2) {
      const [p1, p2] = [...activePointers.values()];
      const nd = Math.hypot(p1.x - p2.x, p1.y - p2.y);
      if (nd > 10) world.zoomTo(pinch.zoom * (nd / pinch.d));
      return;
    }
    if (!down) {
      if (e.pointerType === 'mouse') setHover(world.pick(e.clientX, e.clientY));
      return;
    }
    const dx = e.clientX - down.x;
    const dy = e.clientY - down.y;
    if (Math.abs(e.clientX - down.x) + Math.abs(e.clientY - down.y) > 0 && Math.hypot(dx, dy) > 7) down.moved = true;
    if (down.moved) {
      world.panBy(dx, dy);
      down.x = e.clientX;
      down.y = e.clientY;
    }
  } catch (err) { console.error('[pointermove]', err); }
});

const finishPointer = (e) => {
  try {
    activePointers.delete(e.pointerId);
    if (pinching) {
      if (activePointers.size === 0) { pinching = false; pinch = null; }
      down = null;
      return;
    }
    canvas.classList.remove('grabbing');
    try { canvas.releasePointerCapture(e.pointerId); } catch (_) { /* ok */ }
    if (!down) return;
    const isClick = !down.moved && (performance.now() - down.time) < 600;
    const mesh = down.mesh;
    down = null;
    if (isClick && mesh && mesh.userData.type === 'building') {
      const id = mesh.userData.id.slice(9); // 'building:' = 9 حرف
      const b = LAYOUT.buildings.find(x => x.id === id);
      if (b) {
        sfx.click();
        const wp = new THREE.Vector3();
        // مرکز کفِ ساختمان (سایه‌ی تماس) — خود اسپریت کمی جلوتر لنگر دارد
        if (mesh.userData.shadow) mesh.userData.shadow.getWorldPosition(wp);
        else mesh.getWorldPosition(wp); // شهر ۴۵ درجه چرخیده
        world.focusOn(wp.x, wp.z + 1.6, 1.05);
        ui.openBuilding(b);
      }
    }
  } catch (err) {
    console.error('[pointerup]', err);
    down = null;
  }
};
canvas.addEventListener('pointerup', finishPointer);
canvas.addEventListener('pointercancel', finishPointer);
canvas.addEventListener('pointerleave', () => setHover(null));

canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  world.zoomBy(e.deltaY);
}, { passive: false });

document.addEventListener('touchmove', (e) => {
  if (e.target === canvas) e.preventDefault();
}, { passive: false });

window.addEventListener('beforeunload', () => save());

setTimeout(() => {
  ui.toast('به شهر لوکو خوش آمدی! روی ساختمان‌های اصلی بزن تا باهاشون کار کنی.');
}, 700);
