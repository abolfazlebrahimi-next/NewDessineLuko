// تست مسیرِ سیزن: همان قاعده‌ی نام‌گذاری و ترتیبِ سرورِ لوکو (backend/apps/games/naming.py)
import { existsSync, readFileSync } from 'node:fs';
import { parseGameName, buildPath } from '../scripts/build-game-path.mjs';

let failed = 0;
const check = (name, cond) => { console.log(cond ? `✓ ${name}` : `✗ ${name}`); if (!cond) failed++; };

check('نامِ فشرده خوانده می‌شود', JSON.stringify(parseGameName('C1KrF1S2g2.html')) ===
  JSON.stringify({ grade: 1, book: 'r', chapter: 1, week: 2, number: 2 }));
check('نامِ خط‌تیره‌دار و G بزرگ هم', parseGameName('C3-Kf-F2-S1-G10.html')?.number === 10);
check('کتابِ ناشناس و نامِ بی‌قاعده کنار گذاشته می‌شوند',
  parseGameName('C1KzF1S1g1.html') === null && parseGameName('copy of game.html') === null && parseGameName('x.js') === null);

const { grades, skipped } = buildPath([
  'C1KnF1S1g1.html', 'C1KrF1S1g2.html', 'C1KrF1S1g1.html', 'C1KoF1S1g1.html',
  'C1KrF1S2g1.html', 'C1KrF2S1g1.html', 'C1KrF1S1g10.html', 'C2KrF1S1g1.html', 'bad.html',
]);
const ids = grades[1].map((s) => s.id);
// ترتیب: فصل ← هفته ← شماره ← جایگاهِ کتاب (r, o, q, n, …)؛ g2 پیش از g10 (عددی، نه رشته‌ای)
check('ترتیبِ مسیر مثلِ سرور است', ids.join(',') ===
  'C1KrF1S1g1,C1KoF1S1g1,C1KnF1S1g1,C1KrF1S1g2,C1KrF1S1g10,C1KrF1S2g1,C1KrF2S1g1');
check('هر (فصل، هفته)ی تازه یک هفته‌ی پشتِ‌سرهم است', grades[1].map((s) => s.week).join('') === '1111123');
check('شماره‌ی مرحله از ۱ و پشتِ‌سرهم', grades[1].every((s, i) => s.order === i + 1));
check('کلاس‌ها جدا و نامِ نامعتبر گزارش می‌شود', grades[2].length === 1 && skipped.includes('bad.html'));

// path.json ساخته‌شده با فایل‌های واقعیِ بازی‌ها هم‌خوان است
if (existsSync('public/game-path.json')) {
  const path = JSON.parse(readFileSync('public/game-path.json', 'utf8')).grades;
  const all = Object.values(path).flat();
  check(`path.json همه‌ی بازی‌ها را دارد و فایلشان هست (${all.length} مرحله)`,
    all.length > 0 && all.every((s) => existsSync(`public/games/${s.file}`)));
}

if (failed) { console.log(`✗ ${failed} تست مسیرِ سیزن رد شد`); process.exit(1); }
console.log('همه‌ی تست‌های مسیرِ سیزن پاس شدند ✓');
