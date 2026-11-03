// ================= پیشرفتِ بچه: مأموریت‌های روزانه، تمرین‌ها، استریک و مدال‌ها =================
// همان داده‌ها و کلیدهای باشگاهِ پروژه‌ی اصلی (features/club): مأموریت‌ها دکمه‌ی «انجام دادم»
// ندارند و هر بخش وقتی کار واقعاً انجام شد ثبتشان می‌کند (پایانِ بازی، ثبتِ حال، نفسِ جادویی،
// آب دادنِ باغچه). جایزه‌ها روی سکه‌ی همین شهر می‌نشینند.
import { state, addCoins } from './state.js';
import { CITY_COIN_RATE } from './config.js';

export const DAILY_MISSIONS = [
  { id: 'game', title: 'یه بازی رو کامل کن', coinReward: 10, icon: '🎮', where: 'گوی بلوریِ تالار اصلی' },
  { id: 'mood', title: 'حالت رو به دکتر نیلا بگو', coinReward: 5, icon: '😊', where: 'مطب دکتر نیلا' },
  { id: 'breath', title: 'یه دور نفس جادویی برو', coinReward: 5, icon: '🫧', where: 'مطب دکتر نیلا' },
  { id: 'garden', title: 'به باغچه‌ات آب بده', coinReward: 10, icon: '🌱', where: 'باغچه‌ی شهر' },
];

// تمرین‌های هدایت‌شده‌ی چابک: امتیاز فقط وقتی که تمرین تا آخر رفته باشد
export const SPORT_TASKS = [
  { id: 'sport-run', title: 'یه دقیقه درجا بدو', coinReward: 10, icon: '🏃', seconds: 60, cue: 'پاها رو تند بالا بیار!', move: 'run' },
  { id: 'sport-jump', title: 'ده تا پروانه بزن', coinReward: 10, icon: '🦋', seconds: 20, reps: 10, cue: 'دست‌ها بالا، پاها باز!', move: 'jump' },
  { id: 'sport-squat', title: 'هشت بار بشین‌پاشو', coinReward: 10, icon: '🏋️', seconds: 24, reps: 8, cue: 'آروم بشین، آروم پاشو.', move: 'squat' },
  { id: 'sport-stretch', title: 'دو دقیقه کشش با خانواده', coinReward: 15, icon: '🧘', seconds: 120, cue: 'دست‌ها رو بکش بالا و نفس عمیق بکش.', move: 'stretch' },
];

const DAYS_KEY = 'luko_club_days';
const TOTAL_KEY = 'luko_club_total';
const MEDALS_KEY = 'luko_medals_earned';
const doneKey = (day) => `luko_club_done_${day}`;
const sportKey = (day) => `luko_sport_done_${day}`;

export const todayStr = (d = new Date()) => d.toLocaleDateString('en-CA');
const readJSON = (key, fallback) => {
  try { const raw = localStorage.getItem(key); if (raw) return JSON.parse(raw); } catch (e) { /* خراب ← پیش‌فرض */ }
  return fallback;
};
const writeJSON = (key, v) => { try { localStorage.setItem(key, JSON.stringify(v)); } catch (e) { /* پر یا بسته */ } };

// گوش‌دهنده‌ها (مثلاً تابلوی باشگاه اگر باز است) با هر ثبت تازه می‌شوند
const listeners = new Set();
export const onProgress = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };

export function clubState(day = todayStr()) {
  return {
    day,
    doneToday: readJSON(doneKey(day), []),
    sportToday: readJSON(sportKey(day), []),
    days: readJSON(DAYS_KEY, []),
    total: Number(localStorage.getItem(TOTAL_KEY)) || 0,
  };
}

// روزهای پیاپی تا امروز (اگر امروز هنوز کاری نشده، از دیروز شمرده می‌شود)
export function streakOf(days, today = new Date()) {
  const set = new Set(days);
  const d = new Date(today);
  if (!set.has(todayStr(d))) d.setDate(d.getDate() - 1);
  let n = 0;
  while (set.has(todayStr(d))) { n++; d.setDate(d.getDate() - 1); }
  return n;
}

// هفته‌ی جاری از شنبه تا جمعه: هر روز کار شده یا نه
export function weekDays(days, today = new Date()) {
  const set = new Set(days);
  const start = new Date(today);
  start.setDate(start.getDate() - ((start.getDay() + 1) % 7));   // شنبه
  return ['ش', 'ی', 'د', 'س', 'چ', 'پ', 'ج'].map((label, i) => {
    const d = new Date(start); d.setDate(start.getDate() + i);
    const key = todayStr(d);
    return { label, done: set.has(key), today: key === todayStr(today), future: d > today };
  });
}

// جایزه‌ی شهر برای یک کار (coinRewardِ پلتفرم × نسبتِ اقتصادِ شهر)
export const cityReward = (task) => task.coinReward * CITY_COIN_RATE;

function complete(kind, id, ui) {
  const list = kind === 'daily' ? DAILY_MISSIONS : SPORT_TASKS;
  const task = list.find((t) => t.id === id);
  if (!task) return false;
  const st = clubState();
  const key = kind === 'daily' ? doneKey(st.day) : sportKey(st.day);
  const done = kind === 'daily' ? st.doneToday : st.sportToday;
  if (done.includes(id)) return false;
  writeJSON(key, [...done, id]);
  writeJSON(DAYS_KEY, st.days.includes(st.day) ? st.days : [...st.days, st.day]);
  try { localStorage.setItem(TOTAL_KEY, String(st.total + 1)); } catch (e) { /* بسته */ }
  addCoins(cityReward(task));
  if (ui) {
    ui.bumpCurrencies && ui.bumpCurrencies();
    ui.toast && ui.toast(`${task.icon} مأموریت «${task.title}» انجام شد! +${cityReward(task).toLocaleString('fa-IR')} سکه`);
  }
  listeners.forEach((fn) => { try { fn(); } catch (e) { /* گوش‌دهنده نباید ثبت را بشکند */ } });
  return true;
}

// ثبتِ خودکارِ یک مأموریتِ روزانه (تکراری بی‌اثر است)
export const completeMission = (id, ui) => complete('daily', id, ui);
// ثبتِ یک تمرینِ ورزشی — فقط بعد از تمام‌شدنِ واقعیِ تمرین
export const completeSport = (id, ui) => complete('sport', id, ui);

// ---------- مدال‌ها (همان کاتالوگِ پروژه‌ی اصلی؛ آن‌هایی که این‌جا هم قابلِ سنجش‌اند) ----------
const MEDALS = [
  { id: 'first', title: 'اولین قدم', description: 'اولین مأموریتت رو انجام بده', icon: '⭐', tier: 'bronze', target: 1, value: (s) => s.totalTasks },
  { id: 'ten', title: 'ده‌تایی شدی', description: '۱۰ مأموریت کامل کن', icon: '🚀', tier: 'silver', target: 10, value: (s) => s.totalTasks },
  { id: 'fifty', title: 'پنجاه‌کار', description: '۵۰ مأموریت کامل کن', icon: '⚡', tier: 'gold', target: 50, value: (s) => s.totalTasks },
  { id: 'streak3', title: 'سه روز آتشین', description: '۳ روز پشتِ سرِ هم تمرین کن', icon: '🔥', tier: 'bronze', target: 3, value: (s) => s.streak },
  { id: 'streak7', title: 'یک هفته‌ی کامل', description: '۷ روز پشتِ سرِ هم تمرین کن', icon: '☀️', tier: 'silver', target: 7, value: (s) => s.streak },
  { id: 'streak30', title: 'ماهِ بی‌وقفه', description: '۳۰ روز پشتِ سرِ هم تمرین کن', icon: '❤️', tier: 'gold', target: 30, value: (s) => s.streak },
  { id: 'game1', title: 'بازیکنِ تازه', description: 'اولین مرحله‌ی سیزن رو ببر', icon: '✨', tier: 'bronze', target: 1, value: (s) => s.games },
  { id: 'game10', title: 'ماجراجوی مسیر', description: '۱۰ مرحله‌ی سیزن رو ببر', icon: '🏆', tier: 'silver', target: 10, value: (s) => s.games },
  { id: 'stars15', title: 'ستاره‌چین', description: '۱۵ ستاره از مرحله‌ها بگیر', icon: '🌟', tier: 'gold', target: 15, value: (s) => s.stars },
  { id: 'rich', title: 'سکه‌دارِ لوکو', description: '۱۰٬۰۰۰ سکه‌ی شهر جمع کن', icon: '🪙', tier: 'silver', target: 10000, value: (s) => s.coins },
  { id: 'painter', title: 'نقاشِ کوچولو', description: '۳ نقاشی بکش و بزن به دیوار', icon: '🎨', tier: 'bronze', target: 3, value: (s) => s.drawings },
];

export function medalStats() {
  const st = clubState();
  const stars = readJSON('luko_game_stars', {});
  return {
    totalTasks: st.total,
    streak: streakOf(st.days),
    games: readJSON('luko_completed_games', []).length,
    stars: Object.values(stars).reduce((n, v) => n + (Number(v) || 0), 0),
    coins: Math.floor(state.coins),
    drawings: readJSON('luko_art_log', []).length,
  };
}

// مدالِ گرفته‌شده پس گرفته نمی‌شود (سکه یا استریکِ فعلی پایین بیاید هم می‌ماند)
export function medals() {
  const s = medalStats();
  const earned = new Set(readJSON(MEDALS_KEY, []));
  let changed = false;
  const out = MEDALS.map((m) => {
    const raw = Math.max(0, m.value(s));
    const unlocked = raw >= m.target || earned.has(m.id);
    if (unlocked && !earned.has(m.id)) { earned.add(m.id); changed = true; }
    const current = unlocked ? m.target : Math.min(raw, m.target);
    return { ...m, unlocked, current, ratio: current / m.target };
  });
  if (changed) writeJSON(MEDALS_KEY, [...earned]);
  return out;
}
