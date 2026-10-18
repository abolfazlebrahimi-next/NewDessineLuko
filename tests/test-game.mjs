// تست منطق بازی: موانع زمین، هزینه‌ها، اندازه‌ی آدمک‌ها و دیالوگ‌ها
import {
  LAYOUT, CHARACTERS, CHAT_DIALOGUES, CUSTOMER_LINES, obstacleCost, OBSTACLES,
  AREAS, STRUCTURES, ANIMALS, ITEMS, isBuildItem, isGroundItem,
  TEST_MODE, ITEM_SELL_RATIO, MAP_BOUNDS,
} from '../src/config.js';
import {
  state, cellPosition, generateObstacles, obstacleAtCell, isCellBlocked, removeObstacle,
  canAfford, spend, markDecorRemoved,
} from '../src/state.js';

let failed = 0;
const check = (name, cond) => {
  console.log(cond ? `✓ ${name}` : `✗ ${name}`);
  if (!cond) failed++;
};

const f = LAYOUT.field;
const totalCells = f.cols * f.rows;
check('زمین کشت بزرگ است (۷۰ سلول)', totalCells === 70);
check('جایگاه‌ها کامل به هم می‌چسبند (فاصله‌ی شبکه ≈ پهنای جایگاه)', f.spacing - 2.05 < 0.1);
check('مزرعه صحنه‌ی جدا دارد (دور از شهر)', AREAS.farm.minZ > AREAS.town.maxZ + 30 && f.cz > AREAS.farm.minZ);
check('ساختمان مزرعه دروازه‌ی رفتن به مزرعه است',
  LAYOUT.buildings.find(b => b.id === 'farm').portal === 'farm');

const cellObstacles = state.obstacles.filter(o => o.cell !== null);
const wildObstacles = state.obstacles.filter(o => o.cell === null);
check('همه‌ی سلول‌های بسته مانع دارند', cellObstacles.length === totalCells - LAYOUT.starterClearedCells.length);
check('موانع وحشی در هر دو صحنه هست',
  wildObstacles.length === OBSTACLES.initialWildTown + OBSTACLES.initialWildFarm &&
  wildObstacles.some(o => o.area === 'town') && wildObstacles.some(o => o.area === 'farm'));
check('جنگل انبوه: بیشتر موانع زمین درخت‌اند',
  cellObstacles.filter(o => o.kind === 'tree').length > cellObstacles.length * 0.6);
check('روی سلول باز مانع نیست', LAYOUT.starterClearedCells.every(c => !isCellBlocked(c)));
check('روی جایگاه اولیه مانع نیست', LAYOUT.starterPlotCells.every(c => !obstacleAtCell(c)));
check('همه‌ی موانع هزینه‌ی سکه دارند', state.obstacles.every(o => o.cost > 0));
check('نوع مانع معتبر است', state.obstacles.every(o => o.kind === 'tree' || o.kind === 'rock'));
check('هم درخت هست هم سنگ', cellObstacles.some(o => o.kind === 'tree') && cellObstacles.some(o => o.kind === 'rock'));
check('موقعیت مانع سلولی = مرکز سلول', cellObstacles.every(o => {
  const p = cellPosition(o.cell);
  return Math.abs(p.x - o.x) < 0.001 && Math.abs(p.z - o.z) < 0.001;
}));
check('سنگ از درخت گران‌تر است', obstacleCost('rock', 2, 0) > obstacleCost('tree', 2, 0));
check('هرچه دورتر، گران‌تر', obstacleCost('tree', 5, 0) > obstacleCost('tree', 1, 0));

// تولید دوباره با بذر ثابت باید پایدار باشد
const again = generateObstacles(LAYOUT.starterClearedCells, LAYOUT.starterPlotCells);
check('تولید موانع پایدار (بذر ثابت)', again.length === state.obstacles.length &&
  again.every((o, i) => o.kind === state.obstacles[i].kind && o.cell === state.obstacles[i].cell));

// پاک‌کردن مانع سلول را برای همیشه باز می‌کند
const sample = cellObstacles[0];
const coinsBefore = state.coins;
removeObstacle(sample.id);
check('بعد از پاک‌کردن، سلول باز می‌شود', !isCellBlocked(sample.cell) && state.clearedCells.includes(sample.cell));
check('حذف مانع خودش سکه کم نمی‌کند (پرداخت در obstacles.js است)', state.coins === coinsBefore);

// آدمک‌ها از همه‌ی خانه‌ها کوچک‌ترند
const minBuildingH = Math.min(...LAYOUT.buildings.map(b => b.w / 1.6));
check(`قد آدمک (${CHARACTERS.height}) از کوچک‌ترین خانه (${minBuildingH.toFixed(2)}) خیلی کمتر است`,
  CHARACTERS.height < minBuildingH / 2.5);
check('درخت سه‌بعدی هم از خانه کوچک‌تر است', OBSTACLES.treeHeight < minBuildingH);

// دیالوگ‌ها
check('دیالوگ گپ اهالی وجود دارد', CHAT_DIALOGUES.length >= 4 && CHAT_DIALOGUES.every(d => d.length >= 2));
check('جمله‌های مشتری کامل‌اند',
  ['arrive', 'inspect', 'reject', 'buy', 'thanks', 'gone'].every(k => CUSTOMER_LINES[k].length >= 2));
check('جمله‌ی وارسی مشتری جای اسم محصول دارد', CUSTOMER_LINES.inspect.some(s => s.includes('{crop}')));
check('گپ دونفره زمان‌بندی دارد', CHARACTERS.chat.everyMax > CHARACTERS.chat.everyMin);
check('مشتری از دروازه‌ی مزرعه می‌آید', CHARACTERS.gate.z > AREAS.farm.minZ);
check('در مزرعه هم آدمک هست', CHARACTERS.farmCount >= 2 && CHARACTERS.wanderFarm.minZ > AREAS.farm.minZ);

// ساخت‌وساز و حیوانات
check('آیتم‌های ساخت‌وساز در فروشگاه هستن',
  ['fence', 'wall', 'tent', 'house'].every(id => ITEMS[id] && isBuildItem(id) && isGroundItem(id)));
check('مدل هر سازه تعریف شده',
  Object.keys(STRUCTURES.kinds).length === 4 && Object.values(STRUCTURES.kinds).every(k => k.model.endsWith('.glb')));
check('حصار و دیوار قابل چرخش‌اند',
  STRUCTURES.kinds.fence.rotatable && STRUCTURES.kinds.wall.rotatable);
check('چهار حیوان مزرعه تعریف شدن',
  ['cow', 'sheep', 'pig', 'chicken'].every(k => ANIMALS.kinds[k] && ANIMALS.kinds[k].count > 0));
check('حیوان‌ها از آدمک کوتاه‌ترند', Object.values(ANIMALS.kinds).every(k => k.height < CHARACTERS.height));
check('جای شروع سازه‌ای ساخته نشده', Array.isArray(state.structures) && state.structures.length === 0);

// اقتصاد واقعی: سکه و شبنم محدودند
check('اقتصاد واقعی فعال است (پول محدود)', TEST_MODE.infiniteMoney === false);
check('خرید گران‌تر از موجودی ممکن نیست', !canAfford('coins', 10 ** 12) && !canAfford('dew', 10 ** 12));
check('موجودی شروع برای شروع بازی کافی است', state.coins >= 1000 && state.dew >= 50);
{
  const before = state.coins;
  check('خرج‌کردن از سکه کم می‌کند', spend('coins', 100) === true && state.coins === before - 100);
  check('خرج بیشتر از موجودی رد می‌شود', spend('coins', 10 ** 9) === false);
}

// نقشه‌ی یکپارچه: دوربین می‌تواند از شهر تا مزرعه کشیده شود
check('محدوده‌ی حرکت دوربین هر دو صحنه و بینشان را پوشش می‌دهد',
  MAP_BOUNDS.panMinZ <= AREAS.town.focus.z && MAP_BOUNDS.panMaxZ >= AREAS.farm.focus.z);

// فروش آیتم‌ها و آیکون بدون استیکر
check('نسبت فروش آیتم‌ها تعریف شده', ITEM_SELL_RATIO > 0 && ITEM_SELL_RATIO < 1);
check('آیتم‌های ساخت آیکون برداری دارند، نه ایموجی',
  ['fence', 'wall', 'tent', 'house'].every(id => ITEMS[id].svg && !ITEMS[id].emoji));

// پاک‌کردن جنگل ذخیره می‌شود
markDecorRemoved(424242);
check('درخت پاک‌شده‌ی جنگل در وضعیت ذخیره شد', state.removedDecor.includes(424242));

check('همه‌ی آیتم‌های فروشگاه توضیح دارند (برای دکمه‌ی !)',
  Object.values(ITEMS).every(i => i.desc && i.desc.length > 3));

console.log(failed ? `\n${failed} تست رد شد!` : '\nهمه‌ی تست‌های منطق بازی پاس شدند ✓');
process.exit(failed ? 1 : 0);
