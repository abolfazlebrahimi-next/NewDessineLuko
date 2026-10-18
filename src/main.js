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
    const sp = world.getSprite('building:' + b.id);
    const labelY = sp ? sp.scale.y + 0.35 : 3.5;
    ui.showPlotLabel('b_' + b.id, pos.x, pos.z, b.name, labelY);
    const el = ui.plotLabels.get('b_' + b.id);
    if (el) el.classList.add('building-label');
  }

  // ---------- خانه‌ی مزرعه در صحنه‌ی مزرعه (دروازه‌ی برگشت به شهر) ----------
  {
    const fh = LAYOUT.farmhouse;
    world.addSprite({ tag: 'portal:farmhouse', file: 'Farm.png', x: fh.x, z: fh.z, width: fh.w, y: 0.02 });
    const sp = world.getSprite('portal:farmhouse');
    const labelY = sp ? sp.scale.y + 0.35 : 3.5;
    ui.showPlotLabel('farmhouse', fh.x, fh.z, 'خانه‌ی مزرعه — برگشت به شهر 🏘️', labelY);
    const el = ui.plotLabels.get('farmhouse');
    if (el) el.classList.add('building-label');
  }

  // ---------- مزرعه، موانع و سازه‌ها ----------
  farm.spawnAllPlots();
  obstacles.spawnAll();
  constructions.spawnAll();

  // ---------- رفت‌وبرگشت بین شهر و مزرعه با ابرها ----------
  let currentArea = 'town';
  function goToArea(areaKey) {
    if (areaKey === currentArea || ui.cloudBusy) return;
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
          ? 'به مزرعه رسیدی! 🌾 اینجا زمین زیر جنگله؛ درخت و سنگ‌ها رو با سکه پاک کن و کشت کن.'
          : 'به شهر برگشتی! 🏘️');
      }, 450);
    });
  }
  ui.onAreaToggle = () => goToArea(currentArea === 'town' ? 'farm' : 'town');
  ui.onFocusFarm = () => goToArea('farm');

  ui.onDropItem = (itemId, target) => {
    if (isBuildItem(itemId)) {
      constructions.placeFromCard(itemId, target.point, currentArea);
    } else {
      farm.applyItem(itemId, target.plotId, target.point);
    }
    ui.refreshTray();
    ui.bumpCurrencies();
    ui.refreshLabels();
  };
  ui.canPlaceAt = (itemId, point) => {
    if (itemId === 'plot') return farm.canPlacePlotAt(point);
    if (isBuildItem(itemId)) return constructions.canPlace(itemId, point, currentArea);
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

  // ================= سیستم درگ‌اندراپ و کلیک =================
  let down = null;
  let panning = false;
  let dragging = null; // { kind, id, mesh, from, target, valid, targetCell }

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
    ui.toast('بکش و در جای مناسب رها کن ✋ (سبز = مجاز)');
  }

  function moveUpdate(clientX, clientY) {
    if (!dragging) return;
    const ground = world.pickGround(clientX, clientY);
    if (!ground) return;
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
      ui.hidePlotLabel('b_' + id);
      const sp = world.getSprite(d.id);
      const labelY = sp ? sp.scale.y + 0.35 : 3.5;
      ui.showPlotLabel('b_' + id, d.target.x, d.target.z,
        (LAYOUT.buildings.find(b => b.id === id) || {}).name || id, labelY);
      const el = ui.plotLabels.get('b_' + id);
      if (el) el.classList.add('building-label');
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
      const mesh = world.pick(e.clientX, e.clientY);
      down = {
        x: e.clientX, y: e.clientY,
        time: performance.now(),
        mesh,
        moved: false,
      };
      const type = mesh && mesh.userData.type;
      if (type === 'obstacle') {
        const ob = obstacles.obstacleAt(mesh);
        if (ob) obstacles.setHover(ob);
        panning = true;
        canvas.setPointerCapture(e.pointerId);
      } else if (type === 'building' || type === 'plot') {
        canvas.setPointerCapture(e.pointerId);
      } else {
        // سازه، دروازه و زمین خالی: کلیک یا پن دوربین
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

      if (down.mesh && down.moved && !panning &&
          (down.mesh.userData.type === 'building' || down.mesh.userData.type === 'plot')) {
        startMove(down);
        moveUpdate(e.clientX, e.clientY);
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
        obstacles.deselect();
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

  // خوش‌آمد
  setTimeout(() => {
    ui.toast('به شهر لوکو خوش آمدی! 🌳 برای کشاورزی روی ساختمان «مزرعه» کلیک کن تا با ابرها بری به فضای مزرعه ☁️');
  }, 600);
  setTimeout(() => {
    ui.toast('دور شهر و مزرعه جنگل انبوهه! 🌲 درخت/سنگ‌ها رو با کلیک و سکه پاک کن تا جا باز بشه. از فروشگاه هم می‌تونی حصار و دیوار بخری و دیوارکشی کنی 🧱');
  }, 5200);
  setTimeout(() => {
    ui.toast('توی مزرعه حیوانات هم هستن 🐄 و جایگاه‌ها کامل به هم می‌چسبن. با دکمه‌ی سبز کنار صفحه بین شهر و مزرعه جابجا شو.');
  }, 11500);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
