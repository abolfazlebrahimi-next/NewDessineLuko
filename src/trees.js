// ================= درخت‌ها: رشد تصادفی + ترکاندن با نگه‌داشتن =================
import { TIMING, LAYOUT, REWARDS } from './config.js';
import { state, addTree, removeTree, addDew, addXp, save } from './state.js';
import { sfx } from './audio.js';

const TREE_FILES = ['Tree1.png', 'Tree2.png', 'Tree3.png'];

export class Trees {
  constructor(world, ui) {
    this.world = world;
    this.ui = ui;
    this.spawnTimer = 0;
    this.hold = null; // { id, start, x, z }
  }

  spawnAll() {
    for (const t of state.trees) this.syncTree(t);
  }

  syncTree(t) {
    const tag = 'tree:' + t.id;
    if (this.world.getSprite(tag)) return;
    this.world.addSprite({
      tag,
      file: TREE_FILES[(t.type - 1) % 3],
      x: t.x,
      z: t.z,
      width: 2.3 + (t.type === 3 ? 0.35 : 0),
      y: 0.02,
    });
  }

  treeAt(mesh) {
    if (!mesh || mesh.userData.type !== 'tree') return null;
    const id = mesh.userData.id.slice(5);
    return state.trees.find(t => t.id === id) || null;
  }

  // ---------- نگه‌داشتن برای ترکاندن ----------
  startHold(tree) {
    this.hold = {
      id: tree.id,
      start: performance.now(),
      x: tree.x,
      z: tree.z,
    };
    this.ui.showHoldRing();
    sfx.click();
  }

  cancelHold() {
    if (this.hold) {
      this.hold = null;
      this.ui.hideHoldRing();
    }
  }

  tickHold() {
    if (!this.hold) return;
    const elapsed = performance.now() - this.hold.start;
    const k = Math.min(1, elapsed / TIMING.treeHoldMs);
    this.ui.updateHoldRing(k, this.hold.x, this.hold.z);
    if (k >= 1) {
      const tree = state.trees.find(t => t.id === this.hold.id);
      this.cancelHold();
      if (tree) this.boom(tree);
    }
  }

  boom(tree) {
    const tag = 'tree:' + tree.id;
    this.world.explode(tree.x, 1.2, tree.z, 0x8fe07a);
    this.world.removeSprite(tag);
    removeTree(tree.id);

    const dew = REWARDS.treeDew[0] + Math.floor(Math.random() * (REWARDS.treeDew[1] - REWARDS.treeDew[0] + 1));
    addDew(dew);
    const leveled = addXp(REWARDS.treeXp);
    sfx.boom();
    setTimeout(() => sfx.coin(), 120);
    this.ui.toast(`درخت ترکید! 🎉 +${dew} شبنم و +${REWARDS.treeXp} تجربه`);
    this.ui.floatText(tree.x, tree.z, `+${dew} 💧`);
    this.ui.bumpCurrencies();
    if (leveled) this.ui.levelUp();
    save();
  }

  // ---------- درخت‌های جدید با گذشت زمان ----------
  update(dt) {
    this.spawnTimer += dt;
    if (this.spawnTimer >= TIMING.treeSpawnEvery) {
      this.spawnTimer = 0;
      if (state.trees.length < TIMING.maxTrees) this.spawnRandom();
    }
    this.tickHold();
  }

  spawnRandom() {
    // انتخاب جای آزاد از لیست لبه‌ها
    const busy = new Set(state.trees.map(t => `${t.x.toFixed(1)}|${t.z.toFixed(1)}`));
    const free = LAYOUT.treeSpots.filter(s => !busy.has(`${s.x.toFixed(1)}|${s.z.toFixed(1)}`));
    const spot = free.length
      ? free[Math.floor(Math.random() * free.length)]
      : jitter(LAYOUT.treeSpots[Math.floor(Math.random() * LAYOUT.treeSpots.length)]);
    const tree = {
      id: 'tree_' + Math.random().toString(36).slice(2, 8),
      type: 1 + Math.floor(Math.random() * 3),
      x: spot.x + (free.length ? 0 : (Math.random() - 0.5) * 1.2),
      z: spot.z + (free.length ? 0 : (Math.random() - 0.5) * 1.2),
    };
    addTree(tree);
    this.syncTree(tree);
    this.ui.toast('یک درخت تازه در شهر رویید! 🌳');
  }
}

function jitter(s) { return s; }
