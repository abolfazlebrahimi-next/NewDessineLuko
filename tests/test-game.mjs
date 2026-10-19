// تست منطق شهر لوکو: ساختمان‌های اصلی هسته‌ی شهر، اقتصاد محدود، کول‌داون ساختمان‌ها
import { existsSync, statSync } from 'node:fs';
import { LAYOUT, CITY, MAP_BOUNDS, TEST_MODE } from '../src/config.js';
import {
  state, canAfford, spend, addCoins,
  buildingReady, setBuildingCooldown, cooldownLeft,
} from '../src/state.js';

let failed = 0;
const check = (name, cond) => {
  console.log(cond ? `✓ ${name}` : `✗ ${name}`);
  if (!cond) failed++;
};

// --- هسته‌ی شهر: ۸ ساختمان اصلی مثل تصویر مرجع ---
const expected = ['hall', 'clinic', 'council', 'cinema', 'gym', 'garden', 'leaderboard', 'house'];
check('هشت ساختمان اصلی شهر تعریف شده‌اند',
  LAYOUT.buildings.length === 8 && expected.every((id, i) => LAYOUT.buildings[i].id === id));
check('تالار اصلی وسط شهر است', (() => {
  const h = LAYOUT.buildings[0];
  return h.col === 0 && h.row === 0;
})());
check('بلوک ساختمان‌ها یکتا و داخل هسته‌ی ۳×۳ هستند', (() => {
  const seen = new Set();
  for (const b of LAYOUT.buildings) {
    const k = b.col + ',' + b.row;
    if (seen.has(k)) return false;
    seen.add(k);
    if (Math.abs(b.col) > 1 || Math.abs(b.row) > 1) return false;
  }
  return true;
})());
check('عکس همه‌ی ساختمان‌های اصلی وجود دارد', LAYOUT.buildings.every(b =>
  b.tex && existsSync('public/assets/' + b.tex) && statSync('public/assets/' + b.tex).size > 5000));
check('همه‌ی ساختمان‌ها اسم، توضیح و فعالیت با کول‌داون دارند', LAYOUT.buildings.every(b =>
  b.name && b.desc && b.action && b.action.cooldown > 0 &&
  (b.action.coins || b.action.dew || b.action.xp)));

// --- شبکه‌ی شهر ---
check('شبکه‌ی شهر ۷×۷ بلوک است', CITY.range === 3 && CITY.pitch > CITY.block && CITY.road > 0);
check('دوربین می‌تواند کل شهر را بگردد',
  MAP_BOUNDS.panMaxX >= CITY.range * CITY.pitch - CITY.pitch / 2 &&
  MAP_BOUNDS.panMinX <= -CITY.range * CITY.pitch + CITY.pitch / 2);
check('۲۰ ساختمان پرکننده و دست‌کم ۱۲ ماشین تعریف شده', CITY.filler.length === 20 && CITY.cars.length >= 12);

// --- اقتصاد واقعی (محدود) ---
check('اقتصاد واقعی فعال است (پول محدود)', TEST_MODE.infiniteMoney === false);
check('خرید گران‌تر از موجودی ممکن نیست', !canAfford('coins', 10 ** 12) && !canAfford('dew', 10 ** 12));
check('موجودی شروع برای شروع بازی کافی است', state.coins >= 1000 && state.dew >= 50);
{
  const before = state.coins;
  check('خرج‌کردن از سکه کم می‌کند', spend('coins', 100) === true && state.coins === before - 100);
  addCoins(100);
  check('افزودن سکه موجودی را زیاد می‌کند', state.coins === before);
  check('خرج بیشتر از موجودی رد می‌شود', spend('coins', 10 ** 9) === false);
}

// --- کول‌داون ساختمان‌ها ---
check('ساختمان در ابتدا آماده‌ی فعالیت است', buildingReady('hall', 300) === true);
setBuildingCooldown('hall');
check('بعد از فعالیت وارد کول‌داون می‌شود',
  buildingReady('hall', 300) === false && cooldownLeft('hall', 300) > 0);

if (failed) {
  console.log(`✗ ${failed} تست منطق بازی رد شد`);
  process.exit(1);
}
console.log('همه‌ی تست‌های منطق بازی پاس شدند ✓');
