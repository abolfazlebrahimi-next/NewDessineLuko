// ================= منطق مزرعه: جایگاه‌ها، کاشت، رشد، فروش =================
import {
  CROPS, PLOT_TEX, TIMING, LAYOUT, ITEMS, REWARDS,
} from './config.js';
import {
  state, getPlot, addPlot, isCellTaken, isCellBlocked, obstacleAtCell,
  cellPosition as stateCellPosition,
  addCoins, addXp, takeItem, save, removePlot,
} from './state.js';
import { sfx } from './audio.js';

export class Farm {
  constructor(world, ui) {
    this.world = world;
    this.ui = ui;
    this.characters = null;   // از main وصل می‌شود — مشتری‌ها از همین آدمک‌ها هستند
    this.customerTimer = 2.5; // شمارش تا آمدن مشتری بعدی
    this.onPlotChange = null;
  }

  // ---------- ساخت بصری جایگاه‌ها ----------
  cellPosition(cell) {
    return stateCellPosition(cell);
  }

  // نزدیک‌ترین سلول زمین (بدون توجه به اشغال)
  nearestCell(x, z) {
    const f = LAYOUT.field;
    let best = null, bestD = Infinity;
    for (let cell = 0; cell < f.cols * f.rows; cell++) {
      const cp = this.cellPosition(cell);
      const d = (cp.x - x) ** 2 + (cp.z - z) ** 2;
      if (d < bestD) { bestD = d; best = cell; }
    }
    return bestD <= 10 ? best : null;
  }

  // نزدیک‌ترین سلول آزاد و باز (بدون جایگاه و بدون درخت/سنگ) برای درگ‌اندراپ
  nearestFreeCell(x, z, selfPlotId = null) {
    const f = LAYOUT.field;
    let best = null, bestD = Infinity;
    for (let cell = 0; cell < f.cols * f.rows; cell++) {
      const cp = this.cellPosition(cell);
      const d = (cp.x - x) ** 2 + (cp.z - z) ** 2;
      if (d > 10) continue; // فقط نزدیک مزرعه
      if (isCellBlocked(cell)) continue; // اول باید درخت/سنگش پاک شود
      const taken = state.plots.some(p => p.cell === cell && p.id !== selfPlotId);
      if (taken) continue;
      if (d < bestD) { bestD = d; best = cell; }
    }
    return best;
  }

  // برای سایه‌ی سبز/قرمز هنگام انداختن کارت جایگاه
  canPlacePlotAt(point) {
    if (!point) return false;
    const cell = this.nearestCell(point.x, point.z);
    if (cell === null) return false;
    return !isCellTaken(cell) && !isCellBlocked(cell);
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
    // نزدیک‌ترین سلول و نزدیک‌ترین سلول آزادِ باز
    let nearest = null, nearestD = Infinity;
    let best = null, bestD = Infinity;
    for (let cell = 0; cell < f.cols * f.rows; cell++) {
      const { x, z } = this.cellPosition(cell);
      const d = (x - worldPoint.x) ** 2 + (z - worldPoint.z) ** 2;
      if (d < nearestD) { nearestD = d; nearest = cell; }
      if (isCellTaken(cell) || isCellBlocked(cell)) continue;
      if (d < bestD) { bestD = d; best = cell; }
    }
    if (nearest === null || nearestD > 36) {
      this.ui.toast('کارت را داخل مزرعه و نزدیک‌تر جای خالی بینداز.');
      sfx.error();
      return false;
    }
    // کاربر کارت را روی زمینِ بسته انداخته
    const blocker = obstacleAtCell(nearest);
    if (blocker && nearestD <= bestD) {
      const kindName = blocker.kind === 'tree' ? 'درخت' : 'سنگ';
      this.ui.toast(`این زمین با ${kindName} بسته است! 🌳 اول روی آن کلیک کن و با سکه پاکش کن تا باز شود.`);
      sfx.error();
      return false;
    }
    if (best === null) {
      this.ui.toast('همه‌ی زمین‌های باز پر شده‌اند! درخت/سنگ‌های بیشتری را با سکه پاک کن تا جا باز شود 🪓');
      sfx.error();
      return false;
    }
    if (bestD > 36) {
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
            this.ui.toast(`محصول رسید! ${crop.emoji} یک مشتری در راه مزرعه است… 🧺`);
          }
          save();
        }
      }
    }

    // آمدن مشتری (از آدمک‌های شهر) برای محصولات رسیده
    this.customerTimer -= dt;
    if (this.customerTimer <= 0) {
      this.customerTimer = 1;
      this.maybeSendCustomer();
    }
  }

  // یک آدمکِ مشتری می‌آید، چند محصول را نگاه می‌کند، شاید اولی را رد کند و بعدی را بخرد
  maybeSendCustomer() {
    if (!this.characters || !this.characters.ready || this.characters.customerActive) return;
    const ready = state.plots.filter(p => p.state === 'ready');
    if (!ready.length) return;

    const shuffled = [...ready].sort(() => Math.random() - 0.5);
    const chosen = [];
    if (shuffled.length >= 2 && Math.random() < 0.85) {
      // اولی را نمی‌پسندد، دومی را می‌خرد!
      chosen.push({ plot: shuffled[0], decision: 'reject' });
      chosen.push({ plot: shuffled[1], decision: 'buy' });
    } else {
      chosen.push({ plot: shuffled[0], decision: 'buy' });
    }

    const stops = chosen.map(({ plot, decision }) => {
      const at = this.cellPosition(plot.cell);
      const crop = CROPS[plot.crop];
      return {
        plotId: plot.id,
        x: at.x, z: at.z + 1.55,   // جلوی جایگاه می‌ایستد
        faceX: at.x, faceZ: at.z,   // رو به محصول
        cropName: crop ? crop.name : 'محصول',
        decision,
      };
    });

    this.characters.requestCustomer({
      stops,
      isReady: (plotId) => {
        const p = getPlot(plotId);
        return !!p && p.state === 'ready';
      },
      onBuy: (plotId) => this.sellPlot(plotId, false),
      onDone: () => { this.customerTimer = TIMING.customerGapSec; },
    });
  }

  sellPlot(plotId, manual) {
    const p = getPlot(plotId);
    if (!p || p.state !== 'ready') return;
    const crop = CROPS[p.crop];
    const gain = crop.sell + Math.round(p.moisture * 1.5); // کیفیت بهتر = پول بیشتر
    addCoins(gain);
    const leveled = addXp(REWARDS.cropXp);
    const { x, z } = this.cellPosition(p.cell);
    this.world.coinBurst(x, 0.8, z);
    sfx.coin();
    this.ui.toast(`فروخته شد! ${crop.name} → ${gain.toLocaleString('fa-IR')} سکه 💰`);
    this.ui.floatText(x, z, `+${gain.toLocaleString('fa-IR')}`);
    this.ui.bumpCurrencies();
    if (leveled) this.ui.levelUp();

    // ✅ کل جایگاه فروخته می‌شود و از مزرعه پاک می‌شود (طبق خواسته‌ی کاربر)
    this.world.removeSprite(this.plotTag(plotId));
    this.ui.hidePlotLabel(plotId);
    removePlot(plotId);

    save();
    this.ui.toast('کل جایگاه فروخته شد و از مزرعه پاک شد! 🌾');
  }
}
