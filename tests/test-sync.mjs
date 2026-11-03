// تستِ قاعده‌های هم‌رسانی با حساب (src/net/sync.js) — همان رفتارِ merge.ts سایتِ اصلی
import { strategyFor, mergeValue, mergeNumber, mergeSet, CITY_SAVE_KEY } from '../src/net/sync.js';

let failed = 0;
const check = (name, ok) => { console.log(`${ok ? '✓' : '✗'} ${name}`); if (!ok) failed++; };
const now = new Date('2026-10-28T12:00:00');

// کدام کلید با چه قاعده‌ای
check('توکن‌ها و نشست هرگز هم‌رسان نمی‌شوند',
  ['luko_access_token', 'luko_refresh_token', 'luko_session_user'].every((k) => strategyFor(k, now) === null));
check('پیشرفتِ بازی‌ها مرجعش سرور است', strategyFor('luko_completed_games', now) === null && strategyFor('luko_game_stars', now) === null);
check('متا و کنارگذاشته‌ها هم‌رسان نمی‌شوند', strategyFor('luko_sync_meta_city', now) === null && strategyFor('luko_sync_cstash_1', now) === null);
check('کیفِ سکه شمارنده است', strategyFor('luko_coins', now) === 'counter');
check('ذخیره‌ی شهر هم‌رسان می‌شود', strategyFor(CITY_SAVE_KEY, now) === 'scalar');
check('مأموریتِ امروز و دیروز هم‌رسان، یک هفته پیش نه',
  strategyFor('luko_club_done_2026-10-28', now) === 'set' && strategyFor('luko_club_done_2026-10-27', now) === 'set'
  && strategyFor('luko_club_done_2026-10-20', now) === null);
check('کلیدِ ناشناسِ luko_ مالِ خودِ اپ است', strategyFor('luko_city_guest', now) === null);
check('ذخیره‌ی بازی‌های داخلِ iframe هم‌رسان می‌شود', strategyFor('golshomar', now) === 'scalar');

// ادغام
check('فقط سرور عوض شده ← سرور', mergeValue('scalar', 'a', 'a', 'b') === 'b');
check('فقط این دستگاه عوض شده ← همین دستگاه', mergeValue('scalar', 'a', 'c', 'a') === 'c');
check('سکه‌ی هر دو دستگاه جمع می‌شود (۱۰۰ ← ۱۳۰ و ۱۵۰ ⇒ ۱۸۰)', mergeValue('counter', '100', '130', '150') === '180');
check('بارِ اول (بی‌پایه) سکه دوبل نمی‌شود', mergeNumber(null, 40, 70) === 70);
check('سکه منفی نمی‌شود', mergeNumber(100, 0, 20) === 0);
check('مجموعه: اضافه‌شده‌های هر دو طرف می‌مانند',
  JSON.stringify(JSON.parse(mergeValue('set', '["a"]', '["a","b"]', '["a","c"]')).sort()) === '["a","b","c"]');
check('مجموعه: حذفِ این دستگاه می‌ماند', JSON.stringify(mergeSet(['a', 'b'], ['a'], ['a', 'b', 'c'], String)) === '["a","c"]');
check('شهرِ مهمان روی حسابی که شهر دارد: شهرِ حساب', mergeValue('scalar', undefined, '{"g":1}', '{"a":1}') === '{"a":1}');
check('حسابِ بی‌شهر: شهرِ همین دستگاه', mergeValue('scalar', undefined, '{"g":1}', null) === '{"g":1}');
check('مقدارِ خراب: نسخه‌ی همین دستگاه', mergeValue('set', '[]', '{bad', '["x"]') === '{bad');

if (failed) { console.log(`✗ ${failed} تستِ هم‌رسانی رد شد`); process.exit(1); }
console.log('همه‌ی تست‌های هم‌رسانی پاس شدند ✓');
