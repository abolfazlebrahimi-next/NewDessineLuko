// ================= صفحه‌ی ورود به شهر =================
// همان حسابِ سایتِ لوکو: شماره ← کدِ پیامکی (یا رمز) ← اگر حساب تازه است رمز و اسم و پایه.
// «فعلاً مهمان» هم هست؛ پیشرفتِ مهمان با اولین ورود به حساب می‌رود.
import { ASSET } from './config.js';
import { sfx } from './audio.js';
import { auth, account } from './net/account.js';
import { fa, esc } from './interior.js';

const GUEST_KEY = 'luko_city_guest';
const GRADES = [1, 2, 3, 4, 5, 6];
const GRADE_NAMES = ['اول', 'دوم', 'سوم', 'چهارم', 'پنجم', 'ششم'];

// ارقامِ فارسی/عربی → انگلیسی، فقط رقم
const digits = (s) => String(s || '').replace(/[۰-۹]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d)).replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/\D/g, '');
const validPhone = (p) => /^09\d{9}$/.test(p);

export const wantsLogin = () => {
  if (account.loggedIn()) return false;
  try { return localStorage.getItem(GUEST_KEY) !== '1'; } catch (e) { return true; }
};

export class Login {
  constructor(ui, { onDone } = {}) {
    this.ui = ui;
    this.onDone = onDone;
    this.phone = '';
  }

  open() {
    const root = document.createElement('div');
    root.id = 'login';
    root.className = 'interior';
    root.innerHTML = `
      <div class="lg-sky"><i></i><i></i><i></i></div>
      <div class="lg-card">
        <img class="lg-hero" src="${ASSET('hall/luki.webp')}" alt="">
        <div class="lg-body"></div>
      </div>
      <button class="lg-x" aria-label="بستن">✕</button>`;
    document.getElementById('game').appendChild(root);
    this.root = root;
    this.body = root.querySelector('.lg-body');
    root.querySelector('.lg-x').addEventListener('click', () => this.guest());
    void root.offsetWidth;
    root.classList.add('show');
    this.stepPhone();
  }

  close() {
    const r = this.root;
    if (!r) return;
    r.classList.remove('show');
    setTimeout(() => r.remove(), 380);
    this.root = null;
    if (this.ui) this.ui.login = null;
  }

  guest() {
    sfx.click();
    try { localStorage.setItem(GUEST_KEY, '1'); } catch (e) { /* بسته */ }
    this.close();
    if (this.onDone) this.onDone(null);
  }

  done() {
    sfx.levelup();
    try { localStorage.removeItem(GUEST_KEY); } catch (e) { /* بسته */ }
    this.render(`
      <h2>خوش اومدی ${esc(account.name())}! 🎉</h2>
      <p class="lg-p">شهرت به حسابت وصل شد؛ هرجا وارد بشی، همین شهر رو داری.</p>
      <button class="cl-btn green lg-go" data-go>بزن بریم! ➜</button>`);
    this.body.querySelector('[data-go]').addEventListener('click', () => {
      this.close();
      if (this.onDone) this.onDone(account.user());
    });
  }

  render(html) {
    this.body.innerHTML = html;
    this.body.classList.remove('in'); void this.body.offsetWidth; this.body.classList.add('in');
    const first = this.body.querySelector('input');
    if (first) setTimeout(() => first.focus(), 60);
  }

  error(msg) {
    sfx.error();
    const el = this.body.querySelector('.lg-err');
    if (el) { el.textContent = msg; el.classList.remove('shake'); void el.offsetWidth; el.classList.add('shake'); }
  }

  // دکمه را تا جوابِ سرور قفل می‌کند و خطای سرور را نشان می‌دهد
  async busy(btn, fn) {
    if (btn.disabled) return;
    const label = btn.textContent;
    btn.disabled = true;
    btn.textContent = '…';
    try { await fn(); } catch (e) {
      this.error((e && e.message) || 'یه مشکلی پیش اومد؛ دوباره امتحان کن.');
    } finally {
      if (btn.isConnected) { btn.disabled = false; btn.textContent = label; }
    }
  }

  form(selector, fn) {
    const f = this.body.querySelector(selector);
    f.addEventListener('submit', (e) => { e.preventDefault(); this.busy(f.querySelector('button[type=submit]'), fn); });
  }

  // ---------- گام‌ها ----------
  stepPhone() {
    this.render(`
      <h2>ورود به شهر لوکو</h2>
      <p class="lg-p">با همون شماره‌ای که توی سایتِ لوکو داری وارد شو.</p>
      <form class="lg-form" data-f="phone">
        <label>شماره‌ی موبایل<input inputmode="numeric" autocomplete="tel" dir="ltr" placeholder="09xxxxxxxxx" value="${esc(this.phone)}" maxlength="14"></label>
        <p class="lg-err"></p>
        <button class="cl-btn green" type="submit">گرفتنِ کد ✉️</button>
      </form>
      <button class="lg-link" data-pass>با رمز وارد می‌شم</button>
      <button class="lg-link soft" data-guest>فعلاً مهمان بازی می‌کنم</button>`);
    this.body.querySelector('[data-pass]').addEventListener('click', () => { this.phone = digits(this.body.querySelector('input').value); this.stepPassword(); });
    this.body.querySelector('[data-guest]').addEventListener('click', () => this.guest());
    this.form('[data-f="phone"]', async () => {
      const phone = digits(this.body.querySelector('input').value);
      if (!validPhone(phone)) { this.error('شماره باید ۱۱ رقم باشه و با ۰۹ شروع بشه.'); return; }
      this.phone = phone;
      const r = await auth.requestOtp(phone);
      this.stepCode(r || {});
    });
  }

  stepCode({ codeLength = 5, resendIn = 60, devCode }) {
    this.render(`
      <h2>کد رو وارد کن</h2>
      <p class="lg-p">یه کدِ ${fa(codeLength)} رقمی به <b dir="ltr">${esc(this.phone)}</b> فرستادیم.</p>
      <form class="lg-form" data-f="code">
        <input class="lg-code" inputmode="numeric" autocomplete="one-time-code" dir="ltr" maxlength="${codeLength + 2}" placeholder="${'•'.repeat(codeLength)}" value="${devCode ? esc(devCode) : ''}">
        <p class="lg-err"></p>
        <button class="cl-btn green" type="submit">ورود ✅</button>
      </form>
      <button class="lg-link" data-resend disabled>ارسالِ دوباره (<span>${fa(resendIn)}</span>)</button>
      <button class="lg-link soft" data-back>شماره رو اشتباه زدم</button>`);
    const resend = this.body.querySelector('[data-resend]');
    let left = resendIn;
    clearInterval(this._t);
    this._t = setInterval(() => {
      if (!resend.isConnected) { clearInterval(this._t); return; }
      left--;
      if (left <= 0) { clearInterval(this._t); resend.disabled = false; resend.textContent = 'ارسالِ دوباره‌ی کد'; }
      else resend.querySelector('span').textContent = fa(left);
    }, 1000);
    resend.addEventListener('click', () => this.busy(resend, async () => this.stepCode((await auth.requestOtp(this.phone)) || {})));
    this.body.querySelector('[data-back]').addEventListener('click', () => this.stepPhone());
    this.form('[data-f="code"]', async () => {
      const code = digits(this.body.querySelector('input').value);
      if (code.length < 4) { this.error('کد کامل نیست.'); return; }
      const r = await auth.verifyOtp(this.phone, code);
      if (r.chooseFrom) { this.stepChoose(r); return; }
      this.afterLogin(r);
    });
  }

  stepPassword() {
    this.render(`
      <h2>ورود با رمز</h2>
      <form class="lg-form" data-f="pass">
        <label>شماره‌ی موبایل<input inputmode="numeric" dir="ltr" placeholder="09xxxxxxxxx" value="${esc(this.phone)}" maxlength="14"></label>
        <label>رمز<input type="password" dir="ltr" autocomplete="current-password"></label>
        <p class="lg-err"></p>
        <button class="cl-btn green" type="submit">ورود ✅</button>
      </form>
      <button class="lg-link soft" data-back>با کدِ پیامکی وارد می‌شم</button>`);
    this.body.querySelector('[data-back]').addEventListener('click', () => this.stepPhone());
    this.form('[data-f="pass"]', async () => {
      const [p, w] = this.body.querySelectorAll('input');
      const phone = digits(p.value);
      if (!validPhone(phone)) { this.error('شماره باید ۱۱ رقم باشه و با ۰۹ شروع بشه.'); return; }
      if (!w.value) { this.error('رمز رو بنویس.'); return; }
      this.phone = phone;
      this.afterLogin(await auth.login(phone, w.value));
    });
  }

  stepChoose({ chooseFrom, ticket }) {
    this.render(`
      <h2>کدوم بچه‌ای؟ 🙂</h2>
      <p class="lg-p">با این شماره چند تا حساب هست؛ مالِ خودت رو بزن.</p>
      <div class="lg-kids">${chooseFrom.map((k) => `<button class="lg-kid" data-id="${esc(k.id)}"><b>${esc(k.firstName || 'بی‌نام')}</b><small>کلاسِ ${GRADE_NAMES[(k.grade || 1) - 1] || fa(k.grade)}</small></button>`).join('')}</div>
      <p class="lg-err"></p>`);
    this.body.querySelectorAll('.lg-kid').forEach((b) => b.addEventListener('click', () => this.busy(b, async () => {
      this.afterLogin(await auth.choose(ticket, b.dataset.id));
    })));
  }

  afterLogin(r) {
    if (r.needsPassword) return this.stepNewPassword(r);
    if (r.needsProfile || !account.user().firstName) return this.stepProfile();
    return this.done();
  }

  stepNewPassword(r) {
    this.render(`
      <h2>یه رمز برای خودت بساز 🔑</h2>
      <p class="lg-p">دفعه‌های بعد اگه پیامک نرسید، با همین رمز وارد می‌شی.</p>
      <form class="lg-form" data-f="np">
        <label>رمزِ تازه (حداقل ۶ حرف)<input type="password" dir="ltr" autocomplete="new-password"></label>
        <p class="lg-err"></p>
        <button class="cl-btn green" type="submit">ذخیره ✅</button>
      </form>`);
    this.form('[data-f="np"]', async () => {
      const v = this.body.querySelector('input').value;
      if (v.length < 6) { this.error('رمز باید حداقل ۶ حرف باشه.'); return; }
      await auth.setPassword(v);
      if (r.needsProfile || !account.user().firstName) this.stepProfile(); else this.done();
    });
  }

  stepProfile() {
    const u = account.user() || {};
    this.render(`
      <h2>خودت رو معرفی کن ✏️</h2>
      <form class="lg-form" data-f="prof">
        <label>اسمِ کوچیکت<input maxlength="30" autocomplete="given-name" value="${esc(u.firstName || '')}"></label>
        <div class="lg-gl">کلاسِ چندمی؟</div>
        <div class="lg-grades">${GRADES.map((g) => `<button type="button" class="lg-grade ${(u.grade || 1) === g ? 'on' : ''}" data-g="${g}">${GRADE_NAMES[g - 1]}</button>`).join('')}</div>
        <p class="lg-err"></p>
        <button class="cl-btn green" type="submit">تموم شد ✅</button>
      </form>`);
    let grade = u.grade || 1;
    this.body.querySelectorAll('.lg-grade').forEach((b) => b.addEventListener('click', () => {
      sfx.click();
      grade = Number(b.dataset.g);
      this.body.querySelectorAll('.lg-grade').forEach((x) => x.classList.toggle('on', x === b));
    }));
    this.form('[data-f="prof"]', async () => {
      const firstName = this.body.querySelector('input').value.trim();
      if (firstName.length < 2) { this.error('اسمت رو بنویس (حداقل دو حرف).'); return; }
      await auth.saveProfile({ firstName, grade });
      this.done();
    });
  }
}

export function openLogin(ui, opts) {
  if (ui && ui.login) return ui.login;
  const l = new Login(ui, opts);
  if (ui) ui.login = l;
  l.open();
  return l;
}
