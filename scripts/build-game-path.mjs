// مسیرِ سیزنِ تالار بازی‌ها از روی نامِ فایل‌های public/games — همان قاعده‌ی سرورِ لوکو
// (backend/apps/games/naming.py و services.game_path):
//
//   C1-Kr-F1-S2-G2.html  یا فشرده: C1KrF1S2g2.html
//   C کلاس | K کتاب | F فصل | S هفته در فصل | G شماره‌ی بازی در همان کتاب
//
// ترتیب: کلاس ← فصل ← هفته ← شماره ← جایگاهِ کتاب؛ هر (فصل، هفته)ی تازه یک «هفته»ی
// پشتِ‌سرهمِ نقشه است. خروجی public/game-path.json است و عنوانِ هر مرحله از <title> فایل.
// public/games یک پیوند (symlink) به پوشه‌ی بازی‌های پروژه‌ی اصلیِ لوکوست تا ۸۸ مگابایت دوبار جا نگیرد؛
// برای همین خروجی بیرونِ آن پوشه نوشته می‌شود.
//
// استفاده:  node scripts/build-game-path.mjs   (بعد از اضافه/حذفِ هر بازی)
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const DIR = process.argv[2] || 'public/games';
const OUT = process.argv[3] || 'public/game-path.json';
const BOOKS = ['r', 'o', 'q', 'n', 'h', 'f'];   // ریاضی، علوم، قرآن، نگارش، هنر، فارسی (ترتیبِ BOOKS سرور)
const COIN_REWARD = 10;                           // پیش‌فرضِ Game.coin_reward
const MAX_STARS = 3;

// «C1KrF1S2g2» یا «C1-Kr-F1-S2-G2» → { grade, book, chapter, week, number }
export function parseGameName(file) {
  if (!file.endsWith('.html')) return null;
  const stem = file.slice(0, -5);
  const m = /^C(\d+)-?K([a-z])-?F(\d+)-?S(\d+)-?G(\d+)$/i.exec(stem);
  if (!m) return null;
  const [, c, k, f, s, g] = m;
  const book = k.toLowerCase();
  if (!BOOKS.includes(book)) return null;
  return { grade: +c, book, chapter: +f, week: +s, number: +g };
}

function titleOf(path, fallback) {
  try {
    const head = readFileSync(path, 'utf8').slice(0, 6000);
    const t = /<title>([^<]{1,120})<\/title>/i.exec(head);
    if (t) return t[1].trim();
  } catch (e) { /* فایلِ خراب ← نامِ پیش‌فرض */ }
  return fallback;
}

export function buildPath(files, readTitle = () => '') {
  const games = [];
  const skipped = [];
  for (const file of files) {
    const code = parseGameName(file);
    if (!code) { if (file.endsWith('.html')) skipped.push(file); continue; }
    games.push({ file, ...code });
  }
  games.sort((a, b) => a.grade - b.grade || a.chapter - b.chapter || a.week - b.week ||
    a.number - b.number || BOOKS.indexOf(a.book) - BOOKS.indexOf(b.book));
  const grades = {};
  for (const g of games) {
    const list = (grades[g.grade] ||= { stages: [], last: null, week: 0 });
    if (list.last !== `${g.chapter}:${g.week}`) { list.last = `${g.chapter}:${g.week}`; list.week += 1; }
    list.stages.push({
      id: g.file.slice(0, -5),
      file: g.file,
      title: readTitle(g.file) || `مرحله‌ی ${list.stages.length + 1}`,
      order: list.stages.length + 1,
      week: list.week,
      coinReward: COIN_REWARD,
      maxStars: MAX_STARS,
    });
  }
  const out = {};
  for (const [grade, v] of Object.entries(grades)) out[grade] = v.stages;
  return { grades: out, skipped };
}

// اجرای مستقیم (مسیرِ پروژه فاصله دارد، پس با pathToFileURL مقایسه می‌شود)
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const files = readdirSync(DIR);
  const { grades, skipped } = buildPath(files, (f) => titleOf(join(DIR, f), ''));
  writeFileSync(OUT, JSON.stringify({ generatedAt: new Date().toISOString(), grades }, null, 1));
  for (const [g, s] of Object.entries(grades)) {
    console.log(`کلاس ${g}: ${s.length} مرحله در ${Math.max(...s.map((x) => x.week))} هفته`);
  }
  if (skipped.length) console.log('نامِ نامعتبر (کنار گذاشته شد):', skipped.join(', '));
}
