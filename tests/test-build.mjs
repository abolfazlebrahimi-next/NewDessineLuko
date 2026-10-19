// تست دارایی‌های شهر: مدل‌های Kenney سر جایشان هستند + ریاضی مسیر مستطیلی ماشین‌ها/آدمک‌ها
import { existsSync, statSync, readFileSync } from 'node:fs';
import { CITY, LAYOUT } from '../src/config.js';
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
  ['water-tower', 'detail-tank', 'shipping-container-a', 'shipping-container-b']
    .every(n => isGLB(`public/models/city/${n}.glb`)));
check('همه‌ی ماشین‌ها (Kenney Car Kit) سالم‌اند',
  CITY.cars.every(n => isGLB(`public/models/cars/${n}.glb`)));
check('بافت colormap مدل‌های شهر و ماشین هست',
  existsSync('public/models/city/Textures/colormap.png') &&
  existsSync('public/models/cars/Textures/colormap.png'));
check('مدل درخت برای فضای سبز شهر هست', isGLB('public/models/nature/tree.glb'));

check('عکس ساختمان‌های اصلی PNG سالم‌اند', LAYOUT.buildings
  .filter(b => b.tex.startsWith('city-'))
  .every(b => {
    const p = 'public/assets/' + b.tex;
    if (!existsSync(p)) return false;
    const sig = readFileSync(p).slice(0, 8);
    return sig[0] === 0x89 && sig[1] === 0x50 && sig[2] === 0x4e && sig[3] === 0x47;
  }));

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
