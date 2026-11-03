// ================= حسابِ بچه: ورود، نشست، گزارش به سرور =================
// ورود همان راه‌های سایتِ اصلی است (کدِ پیامکی یا رمز). بی‌حساب هم می‌شود بازی کرد (مهمان):
// پیشرفت فقط روی همین دستگاه می‌ماند و با اولین ورود به حساب می‌رود (sync.js).
import { http, tokens, ApiError } from './api.js';
import { startAccountSync, syncAccount, leaveAccount } from './sync.js';

const PRESENCE_MS = 60000;
const listeners = new Set();
let online = null;   // null = نمی‌دانیم، true/false بعد از اولین تماس

export const account = {
  user: () => tokens.user(),
  loggedIn: () => Boolean(tokens.access() && tokens.user()),
  isOnline: () => online,
  // نامی که شهر بچه را با آن صدا می‌زند
  name() {
    const u = tokens.user();
    return (u && u.firstName) || 'شهردارِ کوچولو';
  },
  grade() {
    const u = tokens.user();
    return u && u.grade ? Number(u.grade) : null;
  },
  on(fn) { listeners.add(fn); return () => listeners.delete(fn); },
};

function changed() {
  listeners.forEach((fn) => { try { fn(account.user()); } catch (e) { /* گوش‌دهنده */ } });
  window.dispatchEvent(new Event('luko:session-changed'));
}

function setSession(d) {
  tokens.store(d);
  if (d.user) tokens.setUser(d.user);
  online = true;
  changed();
}

// ---------- ورود ----------
export const auth = {
  requestOtp: (phone) => http.post('/auth/request-otp', { phone }),
  async verifyOtp(phone, code) {
    const d = await http.post('/auth/verify-otp', { phone, code, role: 'student' });
    // یک شماره، چند بچه: هنوز وارد نشده‌ایم؛ بچه خودش انتخاب می‌کند
    if (d.chooseFrom) return { chooseFrom: d.chooseFrom, ticket: d.ticket };
    setSession(d);
    return d;
  },
  async choose(ticket, userId) {
    const d = await http.post('/auth/otp-choose', { ticket, userId });
    setSession(d);
    return d;
  },
  async login(phone, password) {
    const d = await http.post('/auth/login', { phone, password, role: 'student' });
    setSession(d);
    return d;
  },
  setPassword: (password) => http.post('/auth/set-password', { password }),
  async saveProfile({ firstName, grade }) {
    const u = await http.patch('/auth/me', { firstName, grade });
    if (u) { tokens.setUser(u); changed(); }
    return u;
  },
  async logout() {
    const refresh = tokens.refresh();
    // آخرین تغییرات پیش از بستنِ نشست (نه بیشتر از چند ثانیه)
    await Promise.race([leaveAccount(), new Promise((r) => setTimeout(r, 4000))]);
    try { await http.post('/auth/logout', { refreshToken: refresh }); } catch (e) { /* بی‌اینترنت: توکن خودش منقضی می‌شود */ }
    // خروجِ خواسته: صدازننده خودش صفحه را تازه می‌کند
    window.__lukoReloading = true;
    tokens.clear();
    changed();
  },
};

// نشستِ ذخیره‌شده را با سرور تازه می‌کند (نام و پایه ممکن است در سایت عوض شده باشد)
async function refreshMe() {
  if (!tokens.access()) return;
  try {
    const u = await http.get('/auth/me');
    online = true;
    if (u && u.role && u.role !== 'student') {
      // حسابِ والد در شهرِ بچه کاری ندارد
      tokens.clear();
    } else if (u) tokens.setUser(u);
    changed();
  } catch (e) {
    if (e instanceof ApiError && e.transient) online = false;
    else if (e instanceof ApiError && e.status === 401) changed();
  }
}

// زمانِ حضور برای گزارشِ پنلِ والدین (فقط وقتی صفحه جلوی چشم است)
function presence() {
  setInterval(() => {
    if (!account.loggedIn() || document.visibilityState !== 'visible') return;
    http.post('/presence/beat', { platform: 'web', device: '' }).catch(() => { /* مهم نیست */ });
  }, PRESENCE_MS);
}

// اولِ کار: نشست با سرور تازه می‌شود و یک دور هم‌رسانی (برای مهمان کاری نمی‌کند)
export async function initAccount() {
  startAccountSync();
  presence();
  await refreshMe();
  return syncAccount();
}

// ---------- داده‌هایی که از سرور خوانده می‌شوند ----------
export const server = {
  // مسیرِ بازی‌های یک کلاس: [{id, title, order, week, coinReward, maxStars}]
  async path(grade) {
    const d = await http.get('/games/path', { grade });
    online = true;
    return d.stages || [];
  },
  grades: async () => (await http.get('/games/grades')).grades || [],
  progress: async () => {
    const d = await http.get('/games/completed');
    return { completed: d.completed || [], stars: d.stars || {} };
  },
  playLink: async (slug) => (await http.get(`/games/${slug}/play-link`)).url,
  complete: (slug, stars) => http.post(`/games/${slug}/complete`, stars === undefined ? {} : { stars }),
  // پیام‌های بچه از پنلِ والدین و تیمِ لوکو: { items: [{id, title, body, link, isRead, at}], unread }
  notices: async () => {
    const d = await http.get('/notices');
    return { items: (d && d.items) || [], unread: (d && d.unread) || 0 };
  },
  readNotices: () => http.post('/notices/read', {}),
  sync: () => syncAccount(),
};
