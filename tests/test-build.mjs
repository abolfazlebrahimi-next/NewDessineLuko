// تست دارایی‌های شهر: مدل‌های Kenney سر جایشان هستند + ریاضی مسیر مستطیلی ماشین‌ها/آدمک‌ها
import { existsSync, statSync, readFileSync } from 'node:fs';
import { CITY, LAYOUT, STRUCTURES } from '../src/config.js';
import { rectPoint } from '../src/city.js';

let failed = 0;
const check = (name, cond) => {
  console.log(cond ? `✓ ${name}` : `✗ ${name}`);
  if (!cond) failed++;
};
const isGLB = (p) => existsSync(p) && statSync(p).size > 4000 &&
  readFileSync(p).slice(0, 4).toString() === 'glTF';

check('همه‌ی ساختمان‌های پرکننده (Kenney City Kit) سالم‌اند',
  CITY.filler.every(n => isGLB(`public/models/city/${n}.glb`)));
check('مدل‌های جانبی شهر (برج آب/کانتینر/تانک) سالم‌اند',
  ['water-tower', 'detail-tank', 'detail-tank-large', 'shipping-container-a', 'shipping-container-b', 'shipping-container-c', 'chimney-basic', 'solar-panel-flat', 'windmill']
    .every(n => isGLB(`public/models/city/${n}.glb`)));
check('همه‌ی ماشین‌ها (Kenney Car Kit) سالم‌اند',
  CITY.cars.every(n => isGLB(`public/models/cars/${n}.glb`)));
check('بافت colormap مدل‌های شهر و ماشین هست',
  existsSync('public/models/city/Textures/colormap.png') &&
  existsSync('public/models/cars/Textures/colormap.png'));
check('همه‌ی خانه‌های محله‌ها (Kenney City Kit Suburban) سالم‌اند',
  CITY.houses.length >= 20 && CITY.houses.every(n => isGLB(`public/models/suburban/${n}.glb`)));
check('ساختمان‌های مرکز شهر و آسمان‌خراش‌ها (Kenney City Kit Commercial) سالم‌اند',
  CITY.shops.length >= 10 && CITY.towers.length >= 5 &&
  [...CITY.shops, ...CITY.towers, 'detail-parasol-a', 'detail-parasol-b'].every(n => isGLB(`public/models/commercial/${n}.glb`)));
check('وسایل حیاط (ماشین‌رو/مسیر/نرده/گلدان) هست',
  ['driveway-long', 'path-short', 'path-stones-short', 'fence', 'planter']
    .every(n => isGLB(`public/models/suburban/${n}.glb`)));
check('درخت‌های پکیج Survival Kit (سبز و پاییزی) هست',
  CITY.trees.every(n => isGLB(`public/models/nature/${n}.glb`)) &&
  ['rock-a', 'rock-b', 'rock-c', 'grass', 'grass-large'].every(n => isGLB(`public/models/nature/${n}.glb`)));
check('مدل‌های سازه‌های ساخت‌وساز (پکیج Suburban 2.0 / nn) هست و فشرده‌اند', (() => {
  const files = [
    `public/models/build/${STRUCTURES.kinds.fence.model}`,
    `public/models/build/${STRUCTURES.kinds.tent.model}`,
    ...STRUCTURES.kinds.house.model.map((n) => `public/models/build/${n}`),
  ];
  return files.every((f) =>
    isGLB(f) && readFileSync(f).toString('latin1', 0, 4000).includes('EXT_meshopt_compression'));
})());
check('بافت colormap مدل‌های ساخت‌وساز هست',
  existsSync('public/models/build/Textures/colormap.png'));
check('مدل‌ها فشرده‌اند (Meshopt) تا سریع لود شوند', (() => {
  const files = ['public/models/city/building-a.glb', 'public/models/cars/sedan.glb', 'public/models/suburban/building-type-a.glb', 'public/models/commercial/building-skyscraper-a.glb'];
  return files.every(f => readFileSync(f).toString('latin1', 0, 4000).includes('EXT_meshopt_compression') && statSync(f).size < 80000);
})());

check('عکس ساختمان‌های اصلی (WebP سبک) سالم‌اند', LAYOUT.buildings
  .filter(b => b.tex.startsWith('city-'))
  .every(b => {
    const p = 'public/assets/' + b.tex;
    if (!existsSync(p)) return false;
    const sig = readFileSync(p).slice(0, 12).toString('latin1');
    return sig.startsWith('RIFF') && sig.slice(8, 12) === 'WEBP' && statSync(p).size < 120000;
  }));
check('تابلوی لیدربرد روی نقشه نیست و بقیه‌ی ۷ ساختمان روی نقشه‌اند', (() => {
  const lb = LAYOUT.buildings.find(b => b.id === 'leaderboard');
  return lb && lb.onMap === false && LAYOUT.buildings.filter(b => b.onMap !== false).length === 7;
})());

// --- مسیر مستطیلی: شروع، جهت حرکت، خط راست/چپ، حلقه‌ی کامل ---
{
  const p0 = rectPoint(10, 10, 0, 1, 0);
  check('مسیر از گوشه شروع می‌شود و جهت اول +x است',
    p0.x === -10 && p0.z === -10 && p0.hx === 1 && p0.hz === 0);
  const pLane = rectPoint(10, 10, 0, 1, 1.2);
  check('خط حرکت سمت راست مسیر است', Math.abs(pLane.z - (-10 + 1.2)) < 1e-9);
  const pTurn = rectPoint(10, 10, 20.5, 1, 0);
  check('بعد از گوشه جهت عوض می‌شود', pTurn.hz === 1 && Math.abs(pTurn.x - 10) < 1e-9);
  const pWrap = rectPoint(10, 10, 80, 1, 0);
  check('یک دور کامل به نقطه‌ی شروع برمی‌گردد', pWrap.x === -10 && pWrap.z === -10);
  const pRev = rectPoint(10, 10, 0, -1, 0);
  check('جهت مخالف از ضلع روبه‌رو شروع می‌شود', pRev.z === 10 && pRev.hx === 1);
}

if (failed) {
  console.log(`✗ ${failed} تست ساخت‌وساز شهر رد شد`);
  process.exit(1);
}
console.log('همه‌ی تست‌های دارایی‌های شهر پاس شدند ✓');
