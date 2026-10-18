// تست منطق بازی: موانع زمین، هزینه‌ها، اندازه‌ی آدمک‌ها و دیالوگ‌ها
import {
  LAYOUT, CHARACTERS, CHAT_DIALOGUES, CUSTOMER_LINES, obstacleCost, OBSTACLES,
} from '../src/config.js';
import {
  state, cellPosition, generateObstacles, obstacleAtCell, isCellBlocked, removeObstacle,
} from '../src/state.js';

let failed = 0;
const check = (name, cond) => {
  console.log(cond ? `✓ ${name}` : `✗ ${name}`);
  if (!cond) failed++;
};

const f = LAYOUT.field;
const totalCells = f.cols * f.rows;
check('زمین کشت بزرگ است (۴۰ سلول)', totalCells === 40);

const cellObstacles = state.obstacles.filter(o => o.cell !== null);
const wildObstacles = state.obstacles.filter(o => o.cell === null);
check('همه‌ی سلول‌های بسته مانع دارند', cellObstacles.length === totalCells - LAYOUT.starterClearedCells.length);
check('موانع وحشی دور شهر هست', wildObstacles.length === OBSTACLES.initialWild);
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

console.log(failed ? `\n${failed} تست رد شد!` : '\nهمه‌ی تست‌های منطق بازی پاس شدند ✓');
process.exit(failed ? 1 : 0);
