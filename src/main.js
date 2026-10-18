// ================= اتصال همه‌ی بخش‌ها + حلقه‌ی بازی =================
import { World } from './world.js';
import { UI } from './ui.js';
import { Farm } from './farm.js';
import { Trees } from './trees.js';
import { LAYOUT, TIMING } from './config.js';
import { state, load, save } from './state.js';
import { sfx } from './audio.js';

function boot() {
  const canvas = document.getElementById('scene');
  const world = new World(canvas);
  const ui = new UI(world);
  const farm = new Farm(world, ui);
  const trees = new Trees(world, ui);

  // بازیابی ذخیره
  load();
  ui.refreshAll();

  // ---------- ساختمان‌ها ----------
  for (const b of LAYOUT.buildings) {
    world.addSprite({
      tag: 'building:' + b.id,
      file: b.tex,
      x: b.x,
      z: b.z,
      width: b.w,
      y: 0.02,
    });
    // برچسب ساختمان
    const sp = world.getSprite('building:' + b.id);
    const labelY = sp ? sp.scale.y + 0.35 : 3.5;
    ui.showPlotLabel('b_' + b.id, b.x, b.z, b.name, labelY);
    const el = ui.plotLabels.get('b_' + b.id);
    if (el) el.classList.add('building-label');
  }

  // ---------- مزرعه و درخت‌ها ----------
  farm.spawnAllPlots();
  trees.spawnAll();

  // بازیابی مشتری برای جایگاه‌های آماده‌ی ذخیره‌شده
  for (const p of state.plots) {
    if (p.state === 'ready') farm.spawnCustomer(p.id);
  }

  ui.onDropItem = (itemId, target) => {
    farm.applyItem(itemId, target.plotId, target.point);
    ui.refreshTray();
    ui.bumpCurrencies();
    ui.refreshLabels();
  };
  ui.onFocusFarm = () => {
    world.focusOn(LAYOUT.field.cx, LAYOUT.field.z, 1.25);
  };

  // ---------- ورودی‌های صفحه (کلیک / درگ / نگه‌داشتن) ----------
  let down = null;
  let panning = false;

  canvas.addEventListener('pointerdown', (e) => {
    const mesh = world.pick(e.clientX, e.clientY);
    down = {
      x: e.clientX, y: e.clientY,
      time: performance.now(),
      mesh,
      moved: false,
    };
    if (mesh && mesh.userData.type === 'tree') {
      const tree = trees.treeAt(mesh);
      if (tree) trees.startHold(tree);
    } else {
      panning = true;
      canvas.setPointerCapture(e.pointerId);
      canvas.classList.add('grabbing');
    }
  });

  canvas.addEventListener('pointermove', (e) => {
    if (!down) return;
    const dx = e.clientX - down.x;
    const dy = e.clientY - down.y;
    if (Math.abs(dx) + Math.abs(dy) > 8) down.moved = true;
    if (panning && down.moved) {
      world.panBy(dx, dy);
      down.x = e.clientX;
      down.y = e.clientY;
      ui.refreshLabels();
    } else if (trees.hold && down.moved) {
      // اگر موقع نگه‌داشتن دست تکان خورد، لغو
      trees.cancelHold();
    }
  });

  const finishPointer = (e) => {
    if (!down) return;
    const wasHold = !!trees.hold;
    if (trees.hold) trees.cancelHold();
    canvas.classList.remove('grabbing');
    try { canvas.releasePointerCapture(e.pointerId); } catch (_) { /* ok */ }

    const elapsed = performance.now() - down.time;
    const isClick = !down.moved && elapsed < 500;

    if (isClick && down.mesh) {
      const type = down.mesh.userData.type;
      if (type === 'building') {
        const id = down.mesh.userData.id.slice(9);
        const b = LAYOUT.buildings.find(x => x.id === id);
        if (b) {
          sfx.click();
          world.focusOn(b.x, b.z + 1.5, 1.12);
          ui.openBuilding(b);
        }
      } else if (type === 'plot') {
        farm.interactPlot(down.mesh.userData.id.slice(5));
      }
    }

    down = null;
    panning = false;
  };
  canvas.addEventListener('pointerup', finishPointer);
  canvas.addEventListener('pointercancel', finishPointer);

  // زوم با اسکرول
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    world.zoomBy(e.deltaY);
    ui.refreshLabels();
  }, { passive: false });

  // ---------- حلقه‌ی بازی ----------
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;

    trees.update(dt);
    farm.update(dt);
    ui.updateFloats(dt);
    ui.refreshLabels();
    world.update(dt);

    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // ذخیره هنگام خروج
  window.addEventListener('beforeunload', () => save());

  // جلوگیری از اسکرول صفحه در موبایل
  document.addEventListener('touchmove', (e) => {
    if (e.target === canvas) e.preventDefault();
  }, { passive: false });

  // خوش‌آمد
  setTimeout(() => {
    ui.toast('به شهر لوکو خوش آمدی! 🌳 روی ساختمان‌ها کلیک کن و مزرعه‌ات را بساز.');
  }, 600);
  setTimeout(() => {
    ui.toast('نکته: درخت را ۵ ثانیه نگه دار تا بترکد و شبنم بگیری! 💧');
  }, 4200);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
