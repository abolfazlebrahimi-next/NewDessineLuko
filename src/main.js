// ================= اتصال همه‌ی بخش‌ها + حلقه‌ی بازی =================
import * as THREE from 'three';
import { World } from './world.js';
import { UI } from './ui.js';
import { Farm } from './farm.js';
import { Trees } from './trees.js';
import { Characters } from './characters.js';
import { LAYOUT, TIMING, footprintOf } from './config.js';
import { state, load, save, setBuildingPos, getBuildingPos, setPlotCell, isCellTaken } from './state.js';
import { sfx } from './audio.js';

function boot() {
  const canvas = document.getElementById('scene');
  const world = new World(canvas);
  const ui = new UI(world);
  const farm = new Farm(world, ui);
  const trees = new Trees(world, ui);
  const characters = new Characters(world);

  // بازیابی ذخیره
  load();
  ui.refreshAll();

  // ---------- ساختمان‌ها (با موقعیت ذخیره‌شده) ----------
  const buildingByTag = new Map();
  for (const b of LAYOUT.buildings) {
    const pos = getBuildingPos(b.id, b.x, b.z);
    world.addSprite({
      tag: 'building:' + b.id,
      file: b.tex,
      x: pos.x,
      z: pos.z,
      width: b.w,
      y: 0.02,
    });
    buildingByTag.set('building:' + b.id, b);
    const sp = world.getSprite('building:' + b.id);
    const labelY = sp ? sp.scale.y + 0.35 : 3.5;
    ui.showPlotLabel('b_' + b.id, pos.x, pos.z, b.name, labelY);
    const el = ui.plotLabels.get('b_' + b.id);
    if (el) el.classList.add('building-label');
  }

  // ---------- مزرعه و درخت‌ها ----------
  farm.spawnAllPlots();
  trees.spawnAll();

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

  // ---------- آدمک‌ها ----------
  characters.init().catch((e) => console.warn('characters:', e));

  // ---------- هندل امن حلقه‌ی بازی ----------
  let last = performance.now();
  function frame(now) {
    try {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      trees.update(dt);
      farm.update(dt);
      characters.update(dt);
      ui.updateFloats(dt);
      ui.refreshLabels();
      world.update(dt);
    } catch (e) {
      // هیچ خطایی نباید حلقه‌ی بازی را بکشد
      console.error('[LukoFrame]', e);
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // ================= سیستم درگ‌اندراپ و کلیک =================
  let down = null;
  let panning = false;
  let dragging = null; // { kind, id, mesh, offset }
  const rayPoint = new THREE.Vector3();

  function startMove(d) {
    // شروع جابجایی یک شیء
    const mesh = d.mesh;
    dragging = {
      kind: mesh.userData.type,
      id: mesh.userData.id,
      mesh,
      from: { x: mesh.position.x, z: mesh.position.z },
    };
    panning = false;
    canvas.classList.add('grabbing');
    sfx.whoosh();
    ui.toast('بکش و در جای مناسب رها کن ✋ (سبز = مجاز)');
  }

  function moveUpdate(clientX, clientY) {
    if (!dragging) return;
    const ground = world.pickGround(clientX, clientY);
    if (!ground) return;
    let x = ground.x, z = ground.z;
    let valid = true;

    if (dragging.kind === 'plot') {
      // جایگاه فقط روی سلول‌های مزرعه
      const cell = farm.nearestFreeCell(x, z, dragging.id.slice(5));
      if (cell === null) {
        valid = false;
      } else {
        const cp = farm.cellPosition(cell);
        x = cp.x; z = cp.z;
        dragging.targetCell = cell;
      }
    } else {
      dragging.targetCell = null;
      // محدوده‌ی نقشه
      x = THREE.MathUtils.clamp(x, -13, 13);
      z = THREE.MathUtils.clamp(z, -6.5, 9.5);
      // برخورد با بقیه‌ی اشیاء
      valid = !checkOverlap(dragging.kind, dragging.id, x, z);
    }

    dragging.target = { x, z };
    dragging.valid = valid;
    const size = dragging.kind === 'plot' ? 2.5 : dragging.kind === 'tree' ? 2.6 : 4.4;
    world.showPlacementGhost(x, z, size, valid);

    // حرکت موقت اسپریت
    const sp = dragging.mesh;
    sp.position.x = x;
    sp.position.z = z;
    if (sp.userData.shadow) sp.userData.shadow.position.set(x, 0.03, z + 0.25);
  }

  function checkOverlap(kind, selfId, x, z) {
    const w = kind === 'building'
      ? (LAYOUT.buildings.find(b => 'building:' + b.id === selfId)?.w || 3)
      : kind === 'tree' ? 2.3 : 2.05;
    const fp = footprintOf(kind, w);

    // ساختمان‌ها
    for (const b of LAYOUT.buildings) {
      const tag = 'building:' + b.id;
      if (tag === selfId) continue;
      const sp = world.getSprite(tag);
      if (!sp) continue;
      const bfp = footprintOf('building', b.w);
      if (Math.abs(sp.position.x - x) < fp.rx + bfp.rx - 0.4 &&
          Math.abs(sp.position.z - z) < fp.rz + bfp.rz - 0.3) return true;
    }
    // درخت‌ها
    for (const t of state.trees) {
      const tag = 'tree:' + t.id;
      if (tag === selfId) continue;
      const sp = world.getSprite(tag);
      if (!sp) continue;
      const tfp = footprintOf('tree', 2.3);
      if (Math.abs(sp.position.x - x) < fp.rx + tfp.rx - 0.3 &&
          Math.abs(sp.position.z - z) < fp.rz + tfp.rz - 0.25) return true;
    }
    // جایگاه‌ها
    for (const p of state.plots) {
      const tag = 'plot:' + p.id;
      if (tag === selfId) continue;
      const sp = world.getSprite(tag);
      if (!sp) continue;
      const pfp = footprintOf('plot', 2.05);
      if (Math.abs(sp.position.x - x) < fp.rx + pfp.rx - 0.35 &&
          Math.abs(sp.position.z - z) < fp.rz + pfp.rz - 0.3) return true;
    }
    return false;
  }

  function endMove() {
    if (!dragging) return;
    const d = dragging;
    dragging = null;
    world.hidePlacementGhost();
    canvas.classList.remove('grabbing');

    if (!d.valid || !d.target) {
      // برگرداندن به جای قبلی
      d.mesh.position.x = d.from.x;
      d.mesh.position.z = d.from.z;
      if (d.mesh.userData.shadow) d.mesh.userData.shadow.position.set(d.from.x, 0.03, d.from.z + 0.25);
      if (d.targetCell === null && d.kind === 'plot') {
        // noop
      }
      sfx.error();
      ui.toast('اینجا جای مجازی نیست!');
      // ریست وضعیت نمایش
      if (d.kind === 'plot') farm.syncPlot(d.id.slice(5));
      return;
    }

    // ثبت جابجایی
    if (d.kind === 'building') {
      const id = d.id.slice(9);
      setBuildingPos(id, d.target.x, d.target.z);
      ui.hidePlotLabel('b_' + id);
      const sp = world.getSprite(d.id);
      const labelY = sp ? sp.scale.y + 0.35 : 3.5;
      ui.showPlotLabel('b_' + id, d.target.x, d.target.z,
        (LAYOUT.buildings.find(b => b.id === id) || {}).name || id, labelY);
      const el = ui.plotLabels.get('b_' + id);
      if (el) el.classList.add('building-label');
      sfx.pop();
      ui.toast('ساختمان جابجا شد! 🏗️');
    } else if (d.kind === 'tree') {
      trees.moveTree(state.trees.find(t => 'tree:' + t.id === d.id), d.target.x, d.target.z);
      sfx.pop();
      ui.toast('درخت جابجا شد! 🌳');
    } else if (d.kind === 'plot') {
      const plotId = d.id.slice(5);
      if (d.targetCell !== null && d.targetCell !== undefined) {
        setPlotCell(plotId, d.targetCell);
      }
      farm.syncPlot(plotId);
      sfx.pop();
      ui.toast('جایگاه جابجا شد! 🌾');
    }
    save();
    ui.refreshLabels();
  }

  // ---------- ورودی‌های صفحه ----------
  canvas.addEventListener('pointerdown', (e) => {
    try {
      const mesh = world.pick(e.clientX, e.clientY);
      down = {
        x: e.clientX, y: e.clientY,
        time: performance.now(),
        mesh,
        moved: false,
      };
      if (mesh && mesh.userData.type === 'tree') {
        const tree = trees.treeAt(mesh);
        if (tree) {
          trees.startHold(tree);
          trees.setHover(tree, true); // بازخورد لمس
        }
      } else if (mesh && (mesh.userData.type === 'building' || mesh.userData.type === 'plot')) {
        // آماده برای کلیک یا درگ
        canvas.setPointerCapture(e.pointerId);
      } else {
        panning = true;
        canvas.setPointerCapture(e.pointerId);
        canvas.classList.add('grabbing');
      }
    } catch (err) {
      console.error('[pointerdown]', err);
    }
  });

  canvas.addEventListener('pointermove', (e) => {
    try {
      // هاور روی درخت‌ها (وقتی درگ نیست)
      if (!down && !dragging) {
        const mesh = world.pick(e.clientX, e.clientY);
        const tree = mesh ? trees.treeAt(mesh) : null;
        trees.setHover(tree, true);
        if (!tree) trees.clearHover();
        canvas.style.cursor = mesh ? 'pointer' : 'grab';
        return;
      }

      if (dragging) {
        moveUpdate(e.clientX, e.clientY);
        return;
      }

      if (!down) return;
      const dx = e.clientX - down.x;
      const dy = e.clientY - down.y;
      if (Math.abs(dx) + Math.abs(dy) > 8) down.moved = true;

      if (down.mesh && down.moved && !panning &&
          (down.mesh.userData.type === 'building' || down.mesh.userData.type === 'plot' ||
           down.mesh.userData.type === 'tree')) {
        // شروع جابجایی
        if (trees.hold) { trees.cancelHold(); }
        startMove(down);
        moveUpdate(e.clientX, e.clientY);
        down.x = e.clientX; down.y = e.clientY;
      } else if (panning && down.moved) {
        world.panBy(dx, dy);
        down.x = e.clientX;
        down.y = e.clientY;
        ui.refreshLabels();
      } else if (trees.hold && down.moved) {
        trees.cancelHold();
      }
    } catch (err) {
      console.error('[pointermove]', err);
    }
  });

  const finishPointer = (e) => {
    try {
      if (dragging) {
        endMove();
        down = null;
        return;
      }
      if (!down) return;
      if (trees.hold) trees.cancelHold();
      trees.clearHover();
      canvas.classList.remove('grabbing');
      try { canvas.releasePointerCapture(e.pointerId); } catch (_) { /* ok */ }

      const elapsed = performance.now() - down.time;
      const isClick = !down.moved && elapsed < 600;

      if (isClick && down.mesh) {
        const type = down.mesh.userData.type;
        if (type === 'building') {
          const id = down.mesh.userData.id.slice(9);
          const b = LAYOUT.buildings.find(x => x.id === id);
          if (b) {
            sfx.click();
            world.focusOn(down.mesh.position.x, down.mesh.position.z + 1.5, 1.12);
            ui.openBuilding(b);
          }
        } else if (type === 'plot') {
          farm.interactPlot(down.mesh.userData.id.slice(5));
        } else if (type === 'tree') {
          // کلیک کوتاه = تکان + راهنما
          const tree = trees.treeAt(down.mesh);
          if (tree) {
            world.shakeSprite('tree:' + tree.id, 1.4);
            ui.toast('برای گرفتن شبنم، ۵ ثانیه نگه‌دار! 💧');
            sfx.pop();
          }
        }
      }

      down = null;
      panning = false;
    } catch (err) {
      console.error('[pointerup]', err);
      down = null;
      panning = false;
      dragging = null;
    }
  };
  canvas.addEventListener('pointerup', finishPointer);
  canvas.addEventListener('pointercancel', finishPointer);

  canvas.addEventListener('pointerleave', () => {
    try {
      trees.clearHover();
    } catch (e) { /* ok */ }
  });

  canvas.addEventListener('wheel', (e) => {
    try {
      e.preventDefault();
      world.zoomBy(e.deltaY);
      ui.refreshLabels();
    } catch (err) { /* ok */ }
  }, { passive: false });

  window.addEventListener('beforeunload', () => save());

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
  setTimeout(() => {
    ui.toast('همه‌ی ساختمان‌ها، درخت‌ها و جایگاه‌ها را می‌توانی بکشی و جابجا کنی! ✋');
  }, 9000);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
