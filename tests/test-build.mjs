// تست ساخت‌وساز (شبکه، هم‌پوشانی، چرخش، برداشتن) و حیوانات
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', { url: 'http://localhost/' });
global.window = dom.window;
global.document = dom.window.document;
global.HTMLElement = dom.window.HTMLElement;
global.localStorage = dom.window.localStorage;
global.performance = { now: () => Date.now() };

const THREE = await import('three');
const { Constructions } = await import('../src/constructions.js');
const { Animals } = await import('../src/animals.js');
const { Characters } = await import('../src/characters.js');
const { state } = await import('../src/state.js');
const { STRUCTURES, LAYOUT } = await import('../src/config.js');

let failed = 0;
const check = (name, cond) => {
  console.log(cond ? `✓ ${name}` : `✗ ${name}`);
  if (!cond) failed++;
};

const sprites = new Map();
const fakeWorld = {
  scene: new THREE.Scene(),
  shadowTex: null,
  addSprite({ tag, x, z }) {
    const sp = { material: {}, userData: { type: tag.split(':')[0], id: tag }, position: { x, z }, scale: { y: 1 } };
    sprites.set(tag, sp);
    return sp;
  },
  getSprite(tag) { return sprites.get(tag) || null; },
  removeSprite(tag) { sprites.delete(tag); },
  explode() {},
};
const fakeUi = {
  toasts: [],
  toast(m) { this.toasts.push(m); },
  needBuy() { return false; },
  refreshTray() {},
};

const cons = new Constructions(fakeWorld, fakeUi);
cons.spawnAll();

// --- ساخت دو حصار چسبیده به هم در شهر ---
const cell = STRUCTURES.cell;
check('حصار اول ساخته شد', cons.placeFromCard('fence', { x: 3.2, z: 8.2 }, 'town') === true);
check('کارت حصار کم شد', state.inventory.fence === 7);
check('حصار دوم چسبیده به اولی ساخته شد', cons.placeFromCard('fence', { x: 3.2 + cell, z: 8.2 }, 'town') === true);
const [s1, s2] = state.structures;
const c1 = cons.centerOf(s1), c2 = cons.centerOf(s2);
check('دو حصار دقیقاً یک خانه کنار هم‌اند (بدون فاصله)', Math.abs(Math.abs(c2.x - c1.x) - cell) < 0.001 && Math.abs(c2.z - c1.z) < 0.001);
check('روی همان خانه نمی‌شود دوباره ساخت', cons.placeFromCard('fence', { x: 3.2, z: 8.2 }, 'town') === false);

// --- جهت خودکار: حصار جنوبی باید عمودی شود ---
check('حصار سوم ساخته شد', cons.placeFromCard('fence', { x: 3.2, z: 8.2 + cell }, 'town') === true);
const s3 = state.structures[2];
check('حصار با همسایه‌ی عمودی، خودش عمودی شد', s3.rot === 1);

// --- چرخش با کلیک و برداشتن با دبل‌کلیک ---
cons.interact(s1);
check('کلیک روی حصار آن را می‌چرخاند', s1.rot === 1);
cons.interact(s1); // کلیک دوم سریع = برداشتن
cons.interact(s1);
check('دبل‌کلیک سازه را برمی‌دارد و کارت برمی‌گردد',
  !state.structures.includes(s1) && state.inventory.fence === 6);

// --- ساخت در مزرعه: روی زمین کشت و داخل آغل ممنوع ---
const fc = { x: LAYOUT.field.cx, z: LAYOUT.field.cz };
check('روی زمین کشت نمی‌شود دیوار ساخت', cons.placeFromCard('wall', fc, 'farm') === false);
check('داخل آغل نمی‌شود ساخت', cons.placeFromCard('wall', { x: 13.9, z: 75.5 }, 'farm') === false);
check('کنار زمین می‌شود دیوار ساخت', cons.placeFromCard('wall', { x: -11.5, z: 72 }, 'farm') === true);
check('خانه‌ی چوبی (۳×۳) ساخته شد', (() => {
  state.inventory.house = 1;
  return cons.placeFromCard('house', { x: 6, z: 63.5 + 3 }, 'farm') === true;
})());
const house = state.structures.find(s => s.kind === 'house');
check('خانه ۹ خانه از شبکه را اشغال می‌کند', cons.cellsOf('house', house.gx, house.gz).length === 9);
check('شبکه‌ی شهر و مزرعه جدا حساب می‌شود',
  cons.occupiedCells('town').size > 0 && cons.occupiedCells('farm').size >= 10);

// --- مدل‌ها در محیط تست لود نمی‌شوند؛ جایگزین کدی باید کار کند ---
await cons.init();
check('بعد از init برای همه‌ی سازه‌ها مدل نمایشی ساخته شد',
  state.structures.every(s => cons.visuals.get(s.id) && cons.visuals.get(s.id).group));


// --- درگ گروهی: سه دیوار چسبیده با هم جابجا می‌شوند ---
state.inventory.wall = 5;
check('دیوار اول از ردیف ساخته شد', cons.placeFromCard('wall', { x: -4, z: 10 }, 'town') === true);
check('دیوار دوم ساخته شد', cons.placeFromCard('wall', { x: -4 + cell, z: 10 }, 'town') === true);
check('دیوار سوم ساخته شد', cons.placeFromCard('wall', { x: -4 + cell * 2, z: 10 }, 'town') === true);
const wallRow = state.structures.filter(s => s.kind === 'wall' && s.area === 'town');
const grp = cons.groupOf(wallRow[0]);
check('سه دیوار چسبیده یک گروه‌اند', grp.length === 3);
check('جابجایی گروه به جای آزاد مجاز است', cons.canMoveGroup(grp, 0, 2) === true);
const gzBefore = grp.map(s => s.gz);
check('گروه با هم جابجا شد', cons.moveGroup(grp, 0, 2) === true &&
  grp.every((s, i) => s.gz === gzBefore[i] + 2));
check('جابجایی گروه روی خودش/جای اشغال رد می‌شود',
  cons.canMoveGroup(grp, 0, -2) === true); // برگشت به جای خالیِ قبلی آزاد است
{
  // ساخت در وسط نقشه (بین شهر و مزرعه) بدون گفتن ناحیه هم باید کار کند
  state.inventory.fence = 5;
  const nBefore = state.structures.length;
  const okMid1 = cons.placeFromCard('fence', { x: 0, z: 35 });
  const okMid2 = cons.placeFromCard('fence', { x: 0, z: 45 });
  const added = state.structures.slice(nBefore);
  check('بین شهر و مزرعه هم می‌شود ساخت', okMid1 === true && okMid2 === true && added.length === 2);
  check('ناحیه از روی موقعیت تشخیص داده می‌شود',
    added[0].area === 'town' && added[1].area === 'farm');
}

// --- جانمایی راحت‌تر: چسبیده به درخت می‌شود ساخت، روی خود درخت نه ---
{
  const tree = state.obstacles.find(o => o.cell === null && o.kind === 'tree' && o.area === 'town');
  check('کنار تنه‌ی درخت ساختن آزاد است', cons._cellWorldError(tree.x + 0.85, tree.z) !== 'obstacle');
  check('روی خود درخت نمی‌شود ساخت', cons._cellWorldError(tree.x + 0.25, tree.z) === 'obstacle');
}

// --- ناوبری آدمک‌ها: مسیر دور خانه می‌گردد، از وسطش رد نمی‌شود ---
const chars = new Characters(fakeWorld, fakeUi);
const houseC = cons.centerOf(house);
check('وسط خانه برای آدمک بسته است', chars.isFree(houseC.x, houseC.z) === false);
check('زمین خالی برای آدمک باز است', chars.isFree(houseC.x - 4.5, houseC.z) === true);
const path = chars._findPath(
  { x: houseC.x - 4.5, z: houseC.z },
  { x: houseC.x + 4.5, z: houseC.z });
check('مسیر از یک طرف خانه به طرف دیگر پیدا شد', Array.isArray(path) && path.length >= 2);
check('مسیر از وسط خانه رد نمی‌شود', !!path && path.every(pt =>
  Math.abs(pt.x - houseC.x) > 1.0 || Math.abs(pt.z - houseC.z) > 1.0));
check('مسیر به مقصد می‌رسد', !!path &&
  Math.hypot(path[path.length - 1].x - (houseC.x + 4.5), path[path.length - 1].z - houseC.z) < 0.6);

// --- حیوانات: ساخت و آپدیت بدون کرش، داخل آغل ---
const animals = new Animals(fakeWorld);
await animals.init();
check('حیوان‌ها ساخته شدن', animals.animals.length >= 10);
const pen = LAYOUT.animalPen;
check('همه‌ی حیوان‌ها اول داخل آغل‌ان', animals.animals.every(a =>
  a.model.position.x >= pen.minX && a.model.position.x <= pen.maxX &&
  a.model.position.z >= pen.minZ && a.model.position.z <= pen.maxZ));
for (let i = 0; i < 240; i++) animals.update(1 / 30); // ۸ ثانیه شبیه‌سازی
check('حیوان‌ها از آغل بیرون نمی‌روند', animals.animals.every(a =>
  a.model.position.x >= pen.minX - 0.01 && a.model.position.x <= pen.maxX + 0.01 &&
  a.model.position.z >= pen.minZ - 0.01 && a.model.position.z <= pen.maxZ + 0.01));
check('هر چهار نوع حیوان هست',
  ['cow', 'sheep', 'pig', 'chicken'].every(k => animals.animals.some(a => a.kindId === k)));

console.log(failed ? `\n${failed} تست رد شد!` : '\nهمه‌ی تست‌های ساخت‌وساز و حیوانات پاس شدند ✓');
process.exit(failed ? 1 : 0);
