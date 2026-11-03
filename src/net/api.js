// ================= کلاینتِ API بک‌اندِ لوکو =================
// همان قراردادِ فرانتِ اصلی (New LUKO/frontend/src/lib/api.ts):
//  - پایه‌ی نسبیِ /api/v1 (در dev پروکسیِ Vite، روی سرور nginx؛ هم‌ریشه و بی CORS)
//  - بدنه‌ی camelCase و پاکتِ { data | error }
//  - همان کلیدهای توکن، تا بچه‌ای که در سایتِ اصلی وارد شده این‌جا هم وارد باشد
//  - توکنِ نیم‌ساعته با توکنِ تمدید نو می‌شود؛ قطعیِ شبکه هرگز بچه را بیرون نمی‌اندازد
const API_URL = (import.meta.env && import.meta.env.VITE_API_URL) || '/api/v1';

const KEYS = {
  token: 'luko_access_token',
  refresh: 'luko_refresh_token',
  user: 'luko_session_user',
  guest: 'luko_guest',
};

const get = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
const set = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* پر یا بسته */ } };
const del = (k) => { try { localStorage.removeItem(k); } catch (e) { /* بسته */ } };

export const tokens = {
  access: () => get(KEYS.token),
  refresh: () => get(KEYS.refresh),
  user() {
    try {
      const u = JSON.parse(get(KEYS.user) || 'null');
      return u && typeof u.id === 'string' && u.id ? u : null;
    } catch (e) { return null; }
  },
  store({ accessToken, refreshToken }) {
    if (accessToken) set(KEYS.token, accessToken);
    if (refreshToken) set(KEYS.refresh, refreshToken);
    del(KEYS.guest);
  },
  setUser(u) { if (u) set(KEYS.user, JSON.stringify(u)); },
  clear() {
    del(KEYS.token); del(KEYS.refresh); del(KEYS.user);
    window.dispatchEvent(new Event('luko:session-ended'));
  },
};

// خطایی که از سرور آمده (status دارد) یا شبکه (status صفر)
export class ApiError extends Error {
  constructor(status, message, data) {
    super(message || 'خطا در ارتباط با سرور');
    this.status = status;
    this.data = data;
  }
  // قطعی، کندی یا خرابیِ موقتِ سرور — درباره‌ی نشست چیزی نمی‌گوید
  get transient() { return this.status === 0 || this.status >= 500 || this.status === 408 || this.status === 429; }
}

async function raw(method, path, { body, params, token, timeout = 30000 } = {}) {
  let url = API_URL + path;
  if (params) {
    const q = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined && v !== null));
    if (String(q)) url += '?' + q;
  }
  const headers = { 'Content-Type': 'application/json' };
  const t = token === undefined ? tokens.access() : token;
  if (t) headers.Authorization = `Bearer ${t}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  let res;
  try {
    res = await fetch(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal: ctrl.signal });
  } catch (e) {
    throw new ApiError(0, 'اینترنت وصل نیست یا سرور جواب نداد.');
  } finally { clearTimeout(timer); }
  let json = null;
  try { json = await res.json(); } catch (e) { /* بدنه‌ی خالی یا HTML */ }
  if (!res.ok) {
    const msg = json && json.error && json.error.message;
    throw new ApiError(res.status, typeof msg === 'string' ? msg : `خطای سرور (${res.status})`, json);
  }
  // پاسخِ HTML (مثلاً سرورِ استاتیک بدونِ بک‌اند) یعنی API در دسترس نیست
  if (json === null && res.status !== 204) throw new ApiError(0, 'سرورِ لوکو در دسترس نیست.');
  return json ? json.data : null;
}

// تمدیدِ هم‌زمان فقط یک بار؛ بقیه‌ی درخواست‌های ۴۰۱ منتظرِ همان می‌مانند
let renewing = null;
const UNREACHABLE = 'unreachable';
function renew() {
  if (!renewing) {
    renewing = (async () => {
      const refresh = tokens.refresh();
      if (!refresh) return null;
      try {
        const d = await raw('POST', '/auth/refresh', { body: { refreshToken: refresh }, token: null, timeout: 15000 });
        if (!d || !d.accessToken) return null;
        tokens.store({ accessToken: d.accessToken, refreshToken: d.refreshToken });
        return d.accessToken;
      } catch (e) {
        return e.transient ? UNREACHABLE : null;
      }
    })().finally(() => { renewing = null; });
  }
  return renewing;
}

export async function api(method, path, opts = {}) {
  try {
    return await raw(method, path, opts);
  } catch (e) {
    // ۴۰۱ِ لینکِ بازی یعنی «مهمانی و این مرحله رایگان نیست»، نه پایانِ نشست
    if (e.status !== 401 || opts.token !== undefined || path.includes('/play-link') || path.startsWith('/auth/')) throw e;
    const t = await renew();
    if (t === UNREACHABLE) { e.status = 0; throw e; }
    if (t) return raw(method, path, { ...opts, token: t });
    // نشست واقعاً تمام شده (یا از دستگاهِ دیگری وارد شده‌اند)
    tokens.clear();
    throw e;
  }
}

export const http = {
  get: (p, params, o) => api('GET', p, { ...o, params }),
  post: (p, body, o) => api('POST', p, { ...o, body }),
  patch: (p, body, o) => api('PATCH', p, { ...o, body }),
  del: (p, o) => api('DELETE', p, o),
};

export { API_URL };
