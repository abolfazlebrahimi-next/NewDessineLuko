// ================= منطق مزرعه: جایگاه‌ها، کاشت، رشد، فروش =================
import * as THREE from 'three';
import {
  CROPS, PLOT_TEX, TIMING, LAYOUT, ITEMS,
} from './config.js';
import {
  state, getPlot, addPlot, isCellTaken, addCoins, addXp, addItem,
  takeItem, spend, canAfford, save, removePlot,
} from './state.js';
import { sfx } from './audio.js';

export class Farm {
  constructor(world, ui) {
    this.world = world;
    this.ui = ui;
    this.customers = [];   // مشتری‌های در حال فروش
    this.onPlotChange = null;
  }

  // ---------- ساخت بصری جایگاه‌ها ----------
  cellPosition(cell) {
    const f = LAYOUT.field;
    const col = cell % f.cols;
    const row = Math.floor(cell / f.cols);
    const x = f.cx + (col - (f.cols - 1) / 2) * f.spacing;
    const z = f.cz + (row - (f.rows - 1) / 2) * f.spacing;
    return { x, z };
  }

  // نزدیک‌ترین سلول آزاد مزرعه به یک نقطه (برای درگ‌اندراپ جایگاه)
  nearestFreeCell(x, z, selfPlotId = null) {
    const f = LAYOUT.field;
    let best = null, bestD = Infinity;
    for (let cell = 0; cell < f.cols * f.rows; cell++) {
      const cp = this.cellPosition(cell);
      const d = (cp.x - x) ** 2 + (cp.z - z) ** 2;
      if (d > 10) continue; // فقط نزدیک مزرعه
      // سلول اشغالی؟ (به‌جز خود جایگاه در حال جابجایی)
      const taken = state.plots.some(p => p.cell === cell && p.id !== selfPlotId);
      if (taken) continue;
      if (d < bestD) { bestD = d; best = cell; }
    }
    return best;
  }

  spawnAllPlots() {
    for (const p of state.plots) this.syncPlot(p.id);
  }

  plotTag(id) { return 'plot:' + id; }

  syncPlot(id) {
    const p = getPlot(id);
    if (!p) return;
    const tag = this.plotTag(id);
    const { x, z } = this.cellPosition(p.cell);
    let sp = this.world.getSprite(tag);
    const W = 2.05;

    let file = PLOT_TEX.empty;
    let scaleMul = 1;
    if (p.state === 'tilled') file = PLOT_TEX.tilled;
    if (p.state === 'growing' || p.state === 'ready') {
      const crop = CROPS[p.crop];
      const ph = crop.phases[Math.min(p.phase, crop.phases.length - 1)];
      file = ph.tex;
      scaleMul = ph.scale;
    }

    if (!sp) {
      sp = this.world.addSprite({ tag, file, x, z, width: W, y: 0.02 });
    } else {
      this.world.setSpriteTexture(sp, file, W, scaleMul);
    }

    // برچسب «آماده فروش»
    if (p.state === 'ready') {
      this.ui.showPlotLabel(id, x, z + 0.2, 'آماده فروش 🤑');
    } else {
      this.ui.hidePlotLabel(id);
    }
  }

  // ---------- تعامل با جایگاه ----------
  interactPlot(id) {
    const p = getPlot(id);
    if (!p) return;
    if (p.state === 'ready') {
      this.sellPlot(id, true);
      return;
    }
    // نمایش اطلاعات
    let msg = '';
    if (p.state === 'empty') {
      msg = p.soilCount > 0
        ? `خاک‌ریزی: ${p.soilCount} از ${TIMING.soilNeeded} — کارت خاک را اینجا بینداز.`
        : 'یک جایگاه خالی است. اول خاک بریز (۳ بار)، بعد دانه بکار.';
    } else if (p.state === 'tilled') {
      msg = 'خاک آماده‌ی کاشت است. یک کارت دانه اینجا بینداز.';
    } else if (p.state === 'growing') {
      const crop = CROPS[p.crop];
      const status = [];
      if (p.moisture < 25) status.push('تشنه‌ست! 💧');
      if (!p.fertilized) status.push('کود می‌خواهد');
      msg = `${crop.name} — مرحله ${p.phase + 1} از ${crop.phases.length}` +
        (status.length ? ' | ' + status.join('، ') : ' | حالش خوب است 🌱');
    }
    this.ui.toast(msg);
    sfx.click();
  }

  // ---------- استفاده از کارت‌ها ----------
  /**
   * @returns {boolean} آیا کارت مصرف شد؟
   */
  applyItem(itemId, targetPlotId, worldPoint) {
    const item = ITEMS[itemId];
    if (!item) return false;

    // جایگاه کشت جدید → روی زمین خالی مزرعه
    if (itemId === 'plot') {
      return this.placeNewPlot(worldPoint);
    }

    // آب‌پاش کامل → همه‌ی جایگاه‌ها
    if (itemId === 'wateringCan') {
      if (!takeItem('wateringCan')) return this.ui.needBuy('wateringCan');
      for (const p of state.plots) {
        if (p.state === 'growing' || p.state === 'ready') {
          p.moisture = Math.min(100, p.moisture + TIMING.moisturePerWater + 25);
        } else {
          p.moisture = Math.min(100, p.moisture + 15);
        }
        this.syncPlot(p.id);
      }
      sfx.water();
      this.ui.toast('همه‌ی جایگاه‌ها آبیاری شدند! 💦');
      this.ui.bumpCurrencies();
      save();
      return true;
    }

    const p = getPlot(targetPlotId);
    if (!p) return false;

    // خاک
    if (itemId === 'soil') {
      if (p.state !== 'empty') {
        this.ui.toast('اینجا قبلاً خاک‌ریزی شده.');
        sfx.error();
        return false;
      }
      if (p.soilCount >= TIMING.soilNeeded) return false;
      if (!takeItem('soil')) return this.ui.needBuy('soil');
      p.soilCount += 1;
      sfx.drop();
      const { x, z } = this.cellPosition(p.cell);
      this.world.explode(x, 0.4, z, 0xb98a56);
      if (p.soilCount >= TIMING.soilNeeded) {
        p.state = 'tilled';
        this.ui.toast('خاک آماده شد! حالا دانه بکار 🌱');
      } else {
        this.ui.toast(`خاک‌ریزی: ${p.soilCount} از ${TIMING.soilNeeded}`);
      }
      this.syncPlot(p.id);
      save();
      return true;
    }

    // دانه‌ها
    if (item.crop) {
      if (p.state !== 'tilled') {
        this.ui.toast(p.state === 'empty' ? 'اول باید خاک بریزی.' : 'اینجا قبلاً کاشته شده.');
        sfx.error();
        return false;
      }
      if (!takeItem(itemId)) return this.ui.needBuy(itemId);
      p.crop = item.crop;
      p.state = 'growing';
      p.phase = 0;
      p.progress = 0;
      p.fertilized = false;
      p.moisture = Math.min(100, p.moisture + 20);
      const crop = CROPS[item.crop];
      this.ui.toast(`${crop.name} کاشته شد! 🌱`);
      sfx.drop();
      this.syncPlot(p.id);
      save();
      return true;
    }

    // آب
    if (itemId === 'water') {
      if (p.state === 'empty' && p.soilCount === 0) {
        this.ui.toast('اینجا چیزی نیست که آب بخورد.');
        sfx.error();
        return false;
      }
      if (!takeItem('water')) return this.ui.needBuy('water');
      p.moisture = Math.min(100, p.moisture + TIMING.moisturePerWater);
      sfx.water();
      const { x, z } = this.cellPosition(p.cell);
      this.world.explode(x, 0.5, z, 0x7ec8ff);
      this.syncPlot(p.id);
      save();
      return true;
    }

    // کود
    if (itemId === 'fertilizer') {
      if (p.state !== 'growing') {
        this.ui.toast('کود فقط برای گیاه در حال رشد است.');
        sfx.error();
        return false;
      }
      if (p.fertilized) {
        this.ui.toast('قبلاً کود داده‌ای؛ تا مرحله‌ی بعد کافی است.');
        sfx.error();
        return false;
      }
      if (!takeItem('fertilizer')) return this.ui.needBuy('fertilizer');
      p.fertilized = true;
      sfx.drop();
      const { x, z } = this.cellPosition(p.cell);
      this.world.explode(x, 0.5, z, 0x9be15d);
      this.ui.toast('کود داده شد — رشد سریع‌تر می‌شود! ✨');
      this.syncPlot(p.id);
      save();
      return true;
    }

    return false;
  }

  // ---------- جایگاه جدید ----------
  placeNewPlot(worldPoint) {
    if (!worldPoint) {
      this.ui.toast('کارت را روی زمین خالی مزرعه بینداز.');
      return false;
    }
    const f = LAYOUT.field;
    // نزدیک‌ترین سلول خالی داخل مزرعه
    let best = null, bestD = Infinity;
    for (let cell = 0; cell < f.cols * f.rows; cell++) {
      if (isCellTaken(cell)) continue;
      const { x, z } = this.cellPosition(cell);
      const d = (x - worldPoint.x) ** 2 + (z - worldPoint.z) ** 2;
      if (d < bestD) { bestD = d; best = cell; }
    }
    if (best === null || bestD > 36) {
      this.ui.toast('کارت را داخل مزرعه و نزدیک‌تر جای خالی بینداز.');
      sfx.error();
      return false;
    }
    if (!takeItem('plot')) return this.ui.needBuy('plot');
    const id = addPlot(best);
    this.syncPlot(id);
    const { x, z } = this.cellPosition(best);
    this.world.explode(x, 0.4, z, 0xffe28a);
    this.ui.toast('جایگاه کشت جدید ساخته شد! 🎉');
    sfx.buy();
    return true;
  }

  // ---------- رشد ----------
  update(dt) {
    for (const p of state.plots) {
      if (p.state !== 'growing') continue;

      // کاهش رطوبت
      p.moisture = Math.max(0, p.moisture - TIMING.moistureDecay * dt);

      // رشد فقط با رطوبت مثبت
      if (p.moisture > 0) {
        const speed = p.fertilized ? TIMING.fertilizerBoost : 1;
        p.progress += dt * speed;
        const crop = CROPS[p.crop];
        if (p.progress >= TIMING.phaseDuration) {
          p.progress = 0;
          if (p.phase < crop.phases.length - 1) {
            p.phase += 1;
            p.fertilized = false; // هر مرحله کود تازه می‌خواهد
            this.syncPlot(p.id);
            sfx.ready();
          } else {
            p.state = 'ready';
            p.progress = 0;
            this.syncPlot(p.id);
            sfx.ready();
            this.spawnCustomer(p.id);
          }
          save();
        }
      }
    }

    // حرکت مشتری‌ها
    for (const c of this.customers) {
      if (c.state === 'walking') {
        c.t = Math.min(1, c.t + dt / 1.8);
        const k = easeOut(c.t);
        const sp = this.world.getSprite(c.tag);
        if (sp) {
          sp.position.x = c.from.x + (c.to.x - c.from.x) * k;
          sp.position.z = c.from.z + (c.to.z - c.from.z) * k;
        }
        if (c.t >= 1) {
          c.state = 'waiting';
          c.wait = 0;
          const p = getPlot(c.plotId);
          if (p) this.ui.showPlotLabel(c.plotId, c.to.x, c.to.z + 0.2, 'مشتری دست به نقد! 💰');
        }
      } else if (c.state === 'waiting') {
        c.wait += dt;
        if (c.wait >= TIMING.customerSellDelay) {
          this.sellPlot(c.plotId, false);
        }
      }
    }
    this.customers = this.customers.filter(c => {
      if (c.state !== 'done') return true;
      this.world.removeSprite(c.tag);
      return false;
    });
  }

  spawnCustomer(plotId) {
    const p = getPlot(plotId);
    if (!p) return;
    if (this.customers.some(c => c.plotId === plotId && c.state !== 'done')) return;
    const to = this.cellPosition(p.cell);
    const from = { x: to.x + 2.2, z: to.z + 2.6 };
    const tag = 'customer:' + plotId + ':' + Date.now();
    this.world.addSprite({
      tag, texture: makeCustomerTexture(), x: from.x, z: from.z, width: 1.15,
    });
    this.customers.push({ plotId, tag, from, to, t: 0, state: 'walking', wait: 0 });
  }

  sellPlot(plotId, manual) {
    const p = getPlot(plotId);
    if (!p || p.state !== 'ready') return;
    const crop = CROPS[p.crop];
    const gain = crop.sell + Math.round(p.moisture * 1.5); // کیفیت بهتر = پول بیشتر
    addCoins(gain);
    const leveled = addXp(40);
    const { x, z } = this.cellPosition(p.cell);
    this.world.coinBurst(x, 0.8, z);
    sfx.coin();
    this.ui.toast(`فروخته شد! ${crop.name} → ${gain.toLocaleString('fa-IR')} سکه 💰`);
    this.ui.floatText(x, z, `+${gain}`);
    this.ui.bumpCurrencies();
    if (leveled) this.ui.levelUp();

    // ✅ کل جایگاه فروخته می‌شود و از مزرعه پاک می‌شود (طبق خواسته‌ی کاربر)
    this.world.removeSprite(this.plotTag(plotId));
    this.ui.hidePlotLabel(plotId);
    removePlot(plotId);

    for (const c of this.customers) {
      if (c.plotId === plotId && c.state !== 'done') {
        c.state = 'done';
      }
    }
    save();
    this.ui.toast('کل جایگاه فروخته شد و از مزرعه پاک شد! 🌾');
  }
}

function easeOut(t) { return 1 - (1 - t) * (1 - t); }

// ---------- بافت مشتری ----------
let customerTex = null;
function makeCustomerTexture() {
  if (customerTex) return customerTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  // کلاه
  ctx.fillStyle = '#e8a33d';
  ctx.beginPath(); ctx.arc(64, 38, 22, 0, Math.PI * 2); ctx.fill();
  ctx.fillRect(40, 38, 48, 10);
  // صورت
  ctx.fillStyle = '#f6c79a';
  ctx.beginPath(); ctx.arc(64, 56, 17, 0, Math.PI * 2); ctx.fill();
  // چشم‌ها
  ctx.fillStyle = '#33261a';
  ctx.beginPath(); ctx.arc(57, 54, 2.6, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(71, 54, 2.6, 0, Math.PI * 2); ctx.fill();
  // لبخند
  ctx.strokeStyle = '#b06a3c'; ctx.lineWidth = 2.4;
  ctx.beginPath(); ctx.arc(64, 58, 7, 0.25 * Math.PI, 0.75 * Math.PI); ctx.stroke();
  // بدن
  ctx.fillStyle = '#5b8fd6';
  ctx.beginPath();
  ctx.moveTo(42, 118); ctx.quadraticCurveTo(42, 76, 64, 76);
  ctx.quadraticCurveTo(86, 76, 86, 118); ctx.closePath(); ctx.fill();
  // کیسه پول
  ctx.fillStyle = '#e8b23d';
  ctx.beginPath(); ctx.arc(92, 104, 13, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#a97b22';
  ctx.beginPath(); ctx.arc(92, 94, 5, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#fff4c2';
  ctx.font = 'bold 13px sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('¢', 92, 106);
  customerTex = new THREE.CanvasTexture(c);
  customerTex.colorSpace = THREE.SRGBColorSpace;
  return customerTex;
}
