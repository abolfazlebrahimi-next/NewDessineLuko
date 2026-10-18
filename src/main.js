// ================= اتصال همه‌ی بخش‌ها + حلقه‌ی بازی =================
import * as THREE from 'three';
import { World } from './world.js';
import { UI } from './ui.js';
import { Farm } from './farm.js';
import { Obstacles } from './obstacles.js';
import { Characters } from './characters.js';
import { Decor } from './decor.js';
import { Animals } from './animals.js';
import { Constructions } from './constructions.js';
import { LAYOUT, AREAS, footprintOf, isBuildItem } from './config.js';
import { state, load, save, setBuildingPos, getBuildingPos, setPlotCell } from './state.js';
import { sfx } from './audio.js';

function boot() {
  const canvas = document.getElementById('scene');
  const world = new World(canvas);
  const ui = new UI(world);
  const farm = new Farm(world, ui);
  const obstacles = new Obstacles(world, ui);
  const characters = new Characters(world, ui);
  const decor = new Decor(world);
  const animals = new Animals(world);
  const constructions = new Constructions(world, ui);
  farm.characters = characters; // مشتری‌ها از آدمک‌های شهر ساخته می‌شوند

  // بازیابی ذخیره
  load();
  ui.refreshAll();

  // ---------- ساختمان‌های شهر (با موقعیت ذخیره‌شده) ----------
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
  }

  // ---------- خانه‌ی مزرعه در صحنه‌ی مزرعه (دروازه‌ی برگشت به شهر) ----------
  {
    const fh = LAYOUT.farmhouse;
    world.addSprite({ tag: 'portal:farmhouse', file: 'Farm.png', x: fh.x, z: fh.z, width: fh.w, y: 0.02 });
  }

  // ---------- مزرعه، موانع و سازه‌ها ----------
  farm.spawnAllPlots();
  obstacles.spawnAll();
  constructions.spawnAll();

  // ---------- رفت‌وبرگشت بین شهر و مزرعه ----------
  // نقشه یکپارچه است: با کشیدن روی نقشه هم می‌توانی از شهر به مزرعه بروی
  // (بینشان جنگل است). ابرها فقط راهِ سریع‌اند.
  let currentArea = 'town';
  function syncAreaByCamera() {
    const key = world.panTarget.z > 40 ? 'farm' : 'town';
    if (key !== currentArea) {
      currentArea = key;
      world.area = AREAS[key];
      ui.setAreaButton(key);
    }
    return key;
  }
  function goToArea(areaKey) {
    if (ui.cloudBusy) return;
    sfx.whoosh();
    ui.cloudTransition(() => {
      currentArea = areaKey;
      world.setArea(areaKey);
      ui.setAreaButton(areaKey);
      obstacles.deselect();
      ui.closeModal();
      ui.refreshLabels();
      setTimeout(() => {
        ui.toast(areaKey === 'farm'
          ? 'به مزرعه رسیدی! اینجا زمین زیر جنگله؛ درخت و سنگ‌ها رو پاک کن و کشت کن.'
          : 'به شهر برگشتی!');
      }, 450);
    });
  }
  ui.onAreaToggle = () => goToArea(world.panTarget.z > 40 ? 'town' : 'farm');
  ui.onFocusFarm = () => goToArea('farm');

  ui.onDropItem = (itemId, target) => {
    if (isBuildItem(itemId)) {
      constructions.placeFromCard(itemId, target.point); // ناحیه از روی نقطه معلوم می‌شود
    } else {
      farm.applyItem(itemId, target.plotId, target.point);
    }
    ui.refreshTray();
    ui.bumpCurrencies();
    ui.refreshLabels();
  };
  ui.canPlaceAt = (itemId, point) => {
    if (itemId === 'plot') return farm.canPlacePlotAt(point);
    if (isBuildItem(itemId)) return constructions.canPlace(itemId, point);
    return true;
  };

  // ---------- مدل‌ها و موجودات ----------
  characters.init().catch((e) => console.warn('characters:', e));
  obstacles.init().catch((e) => console.warn('obstacles:', e));
  decor.init().catch((e) => console.warn('decor:', e));
  animals.init().catch((e) => console.warn('animals:', e));
  constructions.init().catch((e) => console.warn('constructions:', e));

  // ---------- هندل امن حلقه‌ی بازی ----------
  let last = performance.now();
  function frame(now) {
    try {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      obstacles.update(dt);
      farm.update(dt);
      characters.update(dt);
      animals.update(dt);
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
  window.__LUKO_BOOTED__ = true; // به صفحه‌ی لودینگ می‌گوید بازی بالا آمده

  // ================= سیستم درگ‌اندراپ و کلیک =================
  let down = null;
  let panning = false;
  let dragging = null; // { kind, id, mesh, from, target, valid, targetCell }
  const activePointers = new Map(); // برای زوم دو انگشتی (پینچ) روی موبایل
  let pinch = null;
  let pinching = false;

  function startMove(d) {
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
  }

  // شروع درگ یک سازه — سازه‌های هم‌نوعِ چسبیده، با هم می‌آیند
  function startStructureMove(mesh, ground) {
    const st = constructions.structureAt(mesh);
    if (!st) return false;
    const grabCell = constructions.anchorCellForPoint(ground, st.area);
    if (!grabCell) return false;
    const group = constructions.groupOf(st);
    dragging = {
      kind: 'structure', st, group, grabCell,
      delta: { gx: 0, gz: 0 }, valid: true,
    };
    panning = false;
    constructions.lastClick = { id: null, time: 0 }; // درگ، دبل‌کلیک حساب نمی‌شود
    canvas.classList.add('grabbing');
    sfx.whoosh();
    return true;
  }

  function moveUpdate(clientX, clientY) {
    if (!dragging) return;
    const ground = world.pickGround(clientX, clientY);
    if (!ground) return;

    if (dragging.kind === 'structure') {
      const cellNow = constructions.anchorCellForPoint(ground, dragging.st.area);
      if (!cellNow) return;
      const dgx = cellNow.gx - dragging.grabCell.gx;
      const dgz = cellNow.gz - dragging.grabCell.gz;
      dragging.delta = { gx: dgx, gz: dgz };
      dragging.valid = constructions.canMoveGroup(dragging.group, dgx, dgz);
      constructions.previewGroup(dragging.group, dgx, dgz);
      const b = constructions.groupBounds(dragging.group, dgx, dgz);
      world.showPlacementGhostRect(b.x, b.z, b.w + 0.35, b.d + 0.35, dragging.valid);
      return;
    }

    let x = ground.x, z = ground.z;
    let valid = true;

    if (dragging.kind === 'plot') {
      const cell = farm.nearestFreeCell(x, z, dragging.id.slice(5));
      if (cell === null) {
        valid = false;
        dragging.targetCell = null;
      } else {
        const cp = farm.cellPosition(cell);
        x = cp.x; z = cp.z;
        dragging.targetCell = cell;
      }
    } else {
      dragging.targetCell = null;
      const a = world.area;
      x = THREE.MathUtils.clamp(x, a.minX, a.maxX);
      z = THREE.MathUtils.clamp(z, a.minZ, a.maxZ);
      valid = !checkOverlap(dragging.kind, dragging.id, x, z);
    }

    dragging.target = { x, z };
    dragging.valid = valid;
    const size = dragging.kind === 'plot' ? 2.3 : 4.4;
    world.showPlacementGhost(x, z, size, valid);

    const sp = dragging.mesh;
    sp.position.x = x;
    sp.position.z = z;
    if (sp.userData.shadow) sp.userData.shadow.position.set(x, 0.03, z + 0.25);
  }

  function checkOverlap(kind, selfId, x, z) {
    const w = kind === 'building'
      ? (LAYOUT.buildings.find(b => 'building:' + b.id === selfId)?.w || 3)
      : 2.05;
    const fp = footprintOf(kind, w);

    for (const b of LAYOUT.buildings) {
      const tag = 'building:' + b.id;
      if (tag === selfId) continue;
      const sp = world.getSprite(tag);
      if (!sp) continue;
      const bfp = footprintOf('building', b.w);
      if (Math.abs(sp.position.x - x) < fp.rx + bfp.rx - 0.4 &&
          Math.abs(sp.position.z - z) < fp.rz + bfp.rz - 0.3) return true;
    }
    for (const ob of state.obstacles) {
      const ofp = footprintOf(ob.kind, ob.kind === 'tree' ? 1.9 : 1.3);
      if (Math.abs(ob.x - x) < fp.rx + ofp.rx - 0.25 &&
          Math.abs(ob.z - z) < fp.rz + ofp.rz - 0.2) return true;
    }
    for (const r of constructions.occupiedRects()) {
      if (Math.abs(r.x - x) < fp.rx + r.rx - 0.2 &&
          Math.abs(r.z - z) < fp.rz + r.rz - 0.15) return true;
    }
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

    if (d.kind === 'structure') {
      const dg = d.delta || { gx: 0, gz: 0 };
      if ((dg.gx || dg.gz) && d.valid && constructions.moveGroup(d.group, dg.gx, dg.gz)) {
        sfx.pop();
        ui.toast(d.group.length > 1 ? 'سازه‌ها با هم جابجا شدند!' : 'سازه جابجا شد!');
      } else {
        constructions.restoreGroup(d.group);
        if (dg.gx || dg.gz) {
          sfx.error();
          ui.toast('اینجا جای مجازی نیست!');
        }
      }
      save();
      ui.refreshLabels();
      return;
    }

    if (!d.valid || !d.target) {
      d.mesh.position.x = d.from.x;
      d.mesh.position.z = d.from.z;
      if (d.mesh.userData.shadow) d.mesh.userData.shadow.position.set(d.from.x, 0.03, d.from.z + 0.25);
      sfx.error();
      ui.toast('اینجا جای مجازی نیست!');
      if (d.kind === 'plot') farm.syncPlot(d.id.slice(5));
      return;
    }

    if (d.kind === 'building') {
      const id = d.id.slice(9);
      setBuildingPos(id, d.target.x, d.target.z);
      sfx.pop();
      ui.toast('ساختمان جابجا شد! 🏗️');
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
      // زوم دو انگشتی (پینچ) روی موبایل
      activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (activePointers.size === 2) {
        const [p1, p2] = [...activePointers.values()];
        pinch = { d: Math.hypot(p1.x - p2.x, p1.y - p2.y) || 1, zoom: world.zoom };
        pinching = true;
        if (dragging) {
          if (dragging.kind === 'structure') constructions.restoreGroup(dragging.group);
          else if (dragging.mesh) {
            dragging.mesh.position.x = dragging.from.x;
            dragging.mesh.position.z = dragging.from.z;
            if (dragging.kind === 'plot') farm.syncPlot(dragging.id.slice(5));
          }
          dragging = null;
        }
        down = null;
        panning = false;
        world.hidePlacementGhost();
        try { canvas.setPointerCapture(e.pointerId); } catch (_) { /* ok */ }
        return;
      }

      const mesh = world.pick(e.clientX, e.clientY);
      down = {
        x: e.clientX, y: e.clientY,
        time: performance.now(),
        mesh,
        ground: world.pickGround(e.clientX, e.clientY),
        moved: false,
      };
      const type = mesh && mesh.userData.type;
      if (type === 'obstacle') {
        const ob = obstacles.obstacleAt(mesh);
        if (ob) obstacles.setHover(ob);
        panning = true;
        canvas.setPointerCapture(e.pointerId);
      } else if (type === 'building' || type === 'plot' || type === 'structure') {
        canvas.setPointerCapture(e.pointerId);
      } else {
        // دروازه و زمین خالی: کلیک یا پن دوربین (کشیدن روی کل نقشه)
        panning = true;
        canvas.setPointerCapture(e.pointerId);
        if (!mesh) canvas.classList.add('grabbing');
      }
    } catch (err) {
      console.error('[pointerdown]', err);
    }
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
        ui.refreshLabels();
        return;
      }

      if (!down && !dragging) {
        const mesh = world.pick(e.clientX, e.clientY);
        obstacles.setHover(mesh ? obstacles.obstacleAt(mesh) : null);
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

      const downType = down.mesh && down.mesh.userData.type;
      if (down.mesh && down.moved && !panning &&
          (downType === 'building' || downType === 'plot' || downType === 'structure')) {
        if (downType === 'structure') {
          if (!startStructureMove(down.mesh, down.ground)) panning = true;
        } else {
          startMove(down);
        }
        if (dragging) moveUpdate(e.clientX, e.clientY);
        down.x = e.clientX; down.y = e.clientY;
      } else if (panning && down.moved) {
        world.panBy(dx, dy);
        down.x = e.clientX;
        down.y = e.clientY;
        ui.refreshLabels();
      }
    } catch (err) {
      console.error('[pointermove]', err);
    }
  });

  const finishPointer = (e) => {
    try {
      activePointers.delete(e.pointerId);
      if (pinching) {
        // پایان ژست دو انگشتی کلیک حساب نمی‌شود
        if (activePointers.size === 0) { pinching = false; pinch = null; }
        down = null;
        panning = false;
        return;
      }
      if (dragging) {
        endMove();
        down = null;
        return;
      }
      if (!down) return;
      obstacles.clearHover();
      canvas.classList.remove('grabbing');
      try { canvas.releasePointerCapture(e.pointerId); } catch (_) { /* ok */ }

      const elapsed = performance.now() - down.time;
      const isClick = !down.moved && elapsed < 600;

      // حالت «کارت انتخاب شده»: ضربه روی زمین یعنی همان‌جا بگذار
      if (isClick && ui.placingItem) {
        ui.tryPlaceSelected(e.clientX, e.clientY);
        down = null;
        panning = false;
        return;
      }

      if (isClick && down.mesh) {
        const type = down.mesh.userData.type;
        if (type === 'building') {
          const id = down.mesh.userData.id.slice(9);
          const b = LAYOUT.buildings.find(x => x.id === id);
          if (b && b.portal) {
            // کلیک روی مزرعه = ابرها می‌آیند و می‌روی به صحنه‌ی مزرعه
            goToArea(b.portal);
          } else if (b) {
            sfx.click();
            world.focusOn(down.mesh.position.x, down.mesh.position.z + 1.5, 1.12);
            ui.openBuilding(b);
          }
        } else if (type === 'portal') {
          goToArea('town');
        } else if (type === 'plot') {
          farm.interactPlot(down.mesh.userData.id.slice(5));
        } else if (type === 'obstacle') {
          const ob = obstacles.obstacleAt(down.mesh);
          if (ob) obstacles.interact(ob);
        } else if (type === 'structure') {
          const st = constructions.structureAt(down.mesh);
          if (st) constructions.interact(st);
          ui.refreshTray();
        }
      } else if (isClick && !down.mesh) {
        // پاک‌کردن درخت/سنگ/علف جنگل با یک کلیک (برای بازکردن راه و جاده)
        const ground = world.pickGround(e.clientX, e.clientY);
        const rec = decor.tryRemoveAt(e.clientX, e.clientY, ground);
        if (rec) {
          world.explode(rec.x, 0.5, rec.z, rec.type === 'rock' ? 0xbfc7cc : 0x7fc95a);
          sfx.boom();
        } else {
          obstacles.deselect();
        }
      }

      syncAreaByCamera(); // اگر با کشیدن نقشه به سمت دیگر رفتی، دکمه هم عوض شود
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
      obstacles.clearHover();
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

  // خوش‌آمد (کوتاه و بی‌سروصدا)
  setTimeout(() => {
    ui.toast('به شهر لوکو خوش آمدی! سکه‌ات فعلاً بی‌نهایت است.');
  }, 600);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
