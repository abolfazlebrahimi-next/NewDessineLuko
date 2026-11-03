// ================= مطب دکتر نیلا: لابی و سه اتاقش =================
// با کلیک روی ساختمانِ «مطب دکتر نیلا» در شهر باز می‌شود. لابی همان نقاشیِ
// assets/clinic/lobby.webp است و دوربینِ صحنه رویش زوم می‌کند:
//  - درِ آهنی ← اتاق رازها: آهنین گاوصندوق را باز می‌کند و راز با رمزِ خودِ بچه قفل می‌شود
//  - درِ شیشه‌ای وسط ← اتاق نقاشی: نمای پشتِ میز، برگه‌ی نقاشی و مدادشمعی‌ها
//  - درِ دکتر ← زومِ در؛ دکمه‌ی قرمز را می‌زند، سبز که شد می‌رود تو و حالش را به دکتر نیلا می‌گوید
//
// داده‌ها همان کلیدها و قالبِ پروژه‌ی اصلی لوکو را دارند (luko_secrets، luko_art_log،
// luko_last_mood و luko_last_mood_time) تا موقعِ یکی‌شدن دو پروژه چیزی از بچه گم نشود.
import { addCoins, addDew, addXp, buildingReady, setBuildingCooldown, cooldownLeft } from './state.js';
import { ASSET } from './config.js';
import { sfx } from './audio.js';
import { Interior, wait, fa, esc } from './interior.js';
import { completeMission } from './progress.js';
// استایل‌ها در src/clinic.css هستند (در index.html لینک شده تا تست‌های Node هم بالا بیایند)


// ---------- مختصاتِ نقاشیِ لابی (پیکسلِ خودِ عکس ۱۶۷۲×۹۴۱) ----------
const IMG = { w: 1672, h: 941 };
// جای کلیک هر در
const DOORS = {
  doctor: { x: 150, y: 120, w: 230, h: 500, name: 'مطب دکتر نیلا', icon: '🩺' },
  paint: { x: 525, y: 140, w: 625, h: 500, name: 'اتاق نقاشی', icon: '🎨' },
  vault: { x: 1235, y: 130, w: 345, h: 495, name: 'اتاق رازها', icon: '🔐' },
};
// قابی که دوربین موقع رفتن به هر در رویش زوم می‌کند [x0, y0, x1, y1]
const VIEWS = {
  doctor: [60, 95, 520, 650],
  paint: [520, 220, 1150, 645],
  vault: [1150, 120, 1650, 690],
};
const LIGHT = { red: [417, 402], green: [417, 432], r: 12 };
const DOCTOR_DOOR = { x: 165, y: 290, w: 195, h: 330 };

// ---------- حال‌ها (همان مقدارهای پروژه‌ی اصلی) ----------
const MOODS = [
  { value: 'happy', label: 'خوشحال', face: '😄', reply: 'آخ جون! خوشحالیِ تو کلِ مطب رو روشن کرد. همین‌طوری بخند!' },
  { value: 'calm', label: 'آروم', face: '😌', reply: 'چه خوب که آرومی. آرامش مثل یه دریاچه‌ی صافه؛ قدرش رو بدون.' },
  { value: 'tired', label: 'خسته', face: '🥱', reply: 'خستگی یعنی بدنت استراحت می‌خواد. یه نفس جادویی بکشیم تا انرژی بگیری؟' },
  { value: 'sad', label: 'ناراحت', face: '😢', reply: 'ناراحت بودن اشکالی نداره، من پیشتم. بیا با هم یه نفس جادویی بکشیم.' },
  { value: 'angry', label: 'عصبانی', face: '😠', reply: 'عصبانیت مثل یه آتشفشانه! بیا با نفس جادویی آرومش کنیم.' },
];
const MOOD_KEY = 'luko_last_mood';
const MOOD_TIME_KEY = 'luko_last_mood_time';

// ---------- نقاشی ----------
const COLORS = ['#e5484d', '#f2994a', '#f2c230', '#2e9e5b', '#4696e5', '#8f6bc9', '#e56fa7', '#1d2128'];
const BRUSHES = [4, 9, 16];
const ART_KEY = 'luko_art_log';
const ART_MAX = 30;

// ---------- رازها: AES-256-GCM با کلیدِ PBKDF2 از رمزِ بچه (همان روشِ پروژه‌ی اصلی) ----------
const SECRETS_KEY = 'luko_secrets';
const PBKDF2_ITER = 150_000;
const enc = new TextEncoder();
const dec = new TextDecoder();
const cryptoReady = () => !!(globalThis.crypto && crypto.subtle);

async function deriveKey(password, salt) {
  const material = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITER, hash: 'SHA-256' },
    material, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'],
  );
}
export async function encryptText(plain, password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt);
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(plain)));
  const out = new Uint8Array(salt.length + iv.length + cipher.length);
  out.set(salt, 0); out.set(iv, 16); out.set(cipher, 28);
  return btoa(String.fromCharCode(...out));
}
// رمز اشتباه یا داده‌ی خراب ← null
export async function decryptText(payload, password) {
  try {
    const bytes = Uint8Array.from(atob(payload), (c) => c.charCodeAt(0));
    const key = await deriveKey(password, bytes.slice(0, 16));
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes.slice(16, 28) }, key, bytes.slice(28));
    return dec.decode(plain);
  } catch (e) { return null; }
}

const readJSON = (key, fallback) => {
  try { const raw = localStorage.getItem(key); if (raw) return JSON.parse(raw); } catch (e) { /* خراب ← پیش‌فرض */ }
  return fallback;
};
const writeJSON = (key, v) => { try { localStorage.setItem(key, JSON.stringify(v)); } catch (e) { /* پر یا بسته */ } };
const newId = () => (crypto.randomUUID ? crypto.randomUUID() : 's' + Date.now().toString(36) + Math.random().toString(36).slice(2));

export class Clinic extends Interior {
  constructor(ui, building) {
    super(ui, building, {
      id: 'clinic',
      img: { src: ASSET('clinic/lobby.webp'), w: IMG.w, h: IMG.h },
      title: 'مطب دکتر نیلا',
      avatar: ASSET('clinic/nila.webp'),
      views: VIEWS,
      spots: Object.values(DOORS),
    });
  }

  stageHtml() {
    return `
      <div class="cl-sign">اتاق رازها</div>
      ${Object.entries(DOORS).map(([id, d]) => `
        <button class="cl-door" data-door="${id}" aria-label="${d.name}"
          style="left:${d.x}px;top:${d.y}px;width:${d.w}px;height:${d.h}px">
          <span class="cl-door-tag"><b>${d.icon}</b>${d.name}</span>
        </button>`).join('')}
      <img class="cl-aheneen" src="${ASSET('clinic/aheneen.webp')}" alt="آهنین" draggable="false">
      <button class="cl-light red" aria-label="دکمه‌ی قرمز" style="left:${LIGHT.red[0] - LIGHT.r}px;top:${LIGHT.red[1] - LIGHT.r}px"></button>
      <button class="cl-light green" aria-label="دکمه‌ی سبز" style="left:${LIGHT.green[0] - LIGHT.r}px;top:${LIGHT.green[1] - LIGHT.r}px"></button>
      <button class="cl-ddoor" aria-label="درِ مطب" style="left:${DOCTOR_DOOR.x}px;top:${DOCTOR_DOOR.y}px;width:${DOCTOR_DOOR.w}px;height:${DOCTOR_DOOR.h}px"></button>
      <div class="cl-arrow" aria-hidden="true"></div>`;
  }

  onOpen() {
    const root = this.root;
    root.querySelectorAll('.cl-door').forEach((b) => this.tap(b, () => this.enter(b.dataset.door)));
    this.tap(root.querySelector('.cl-aheneen'), () => this.enter('vault'));
    root.querySelector('.cl-light.red').addEventListener('click', () => this.safe(() => this._pressRed()));
    root.querySelector('.cl-light.green').addEventListener('click', () => this.safe(() => this._tryDoctorDoor()));
    root.querySelector('.cl-ddoor').addEventListener('click', () => this.safe(() => this._tryDoctorDoor()));
    this.say(root.classList.contains('narrow')
      ? 'سلام! به مطب دکتر نیلا خوش اومدی 💙 با فلش‌ها یا کشیدنِ انگشت، درهای دیگه رو ببین.'
      : 'سلام! به مطب دکتر نیلا خوش اومدی 💙 روی یکی از درها بزن.', 3800);
  }

  onLeaveRoom() {
    this._stopBreathing();
    if (this._ro) { this._ro.disconnect(); this._ro = null; }
  }

  onClose() { this.ui.clinic = null; }

  toLobby(hint = 'روی یکی از درها بزن.') { super.toLobby(hint); }

  // ================= رفتن به هر در =================
  async enter(door) {
    if (this.view !== 'lobby' || this._busy) return;
    sfx.click();
    this._busy = true;
    try {
      if (door === 'doctor') {
        // زوم روی در؛ خودِ همین نما صحنه‌ی «دکمه‌ها» است
        this.setView('doctor');
        this._doctorState = 'idle';
        this.root.classList.remove('lit-red', 'lit-green');
        await wait(650);
        this.say('دکمه‌ی <b class="r">قرمز</b> رو بزن تا دکتر نیلا خبردار بشه 🔔');
        return;
      }
      await this.zoomInto(door, () => (door === 'vault' ? this._renderVault() : this._renderPaint()));
    } finally {
      this._busy = false;
    }
  }

  // ================= درِ دکتر: قرمز ← صبر ← سبز ← ورود =================
  async _pressRed() {
    if (this.view !== 'doctor' || this._doctorState !== 'idle') return;
    this._doctorState = 'waiting';
    sfx.ready();
    this.root.classList.add('lit-red');
    this.say('زنگ زدی! دکتر نیلا داره آماده می‌شه… صبر کن تا چراغ سبز بشه ⏳');
    await wait(2600);
    if (!this.root || this.view !== 'doctor') return;
    this.root.classList.remove('lit-red');
    this.root.classList.add('lit-green');
    this._doctorState = 'green';
    sfx.levelup();
    this.say('چراغ <b class="g">سبز</b> شد! حالا برو تو 🚪');
  }

  async _tryDoctorDoor() {
    if (this.view !== 'doctor') return;
    if (this._doctorState !== 'green') {
      sfx.error();
      const d = this.root.querySelector('.cl-ddoor');
      d.classList.remove('shake'); void d.offsetWidth; d.classList.add('shake');
      this.say(this._doctorState === 'waiting' ? 'هنوز قرمزه! یه کم صبر کن ⏳' : 'اول دکمه‌ی <b class="r">قرمز</b> رو بزن 🔔');
      return;
    }
    this._doctorState = 'in';
    sfx.whoosh();
    this.root.classList.add('door-open');
    await wait(520);
    this.flash();
    this.root.classList.remove('door-open', 'lit-green');
    this.root.classList.add('in-room');
    this.view = 'doctor-room';
    this.root.dataset.view = 'doctor-room';
    this._renderDoctorRoom();
    this.sceneEl.classList.add('show');
    this.hush();
  }

  // ================= اتاق دکتر نیلا: «حالت چطوره؟» =================
  _renderDoctorRoom() {
    const last = localStorage.getItem(MOOD_KEY);
    const lastMood = MOODS.find((m) => m.value === last);
    this.sceneEl.className = 'cl-scene room-doctor';
    this.sceneEl.innerHTML = `
      <div class="dr-window"><span></span><span></span></div>
      <div class="dr-chart">❤️ ۸۰<br>🌡️ ۳۷</div>
      <div class="dr-desk"></div>
      <img class="dr-nila" src="${ASSET('clinic/nila.webp')}" alt="دکتر نیلا" draggable="false">
      <div class="dr-panel">
        <div class="dr-bubble">
          <b>دکتر نیلا</b>
          <p class="dr-text">سلام عزیزم! خوشحالم اومدی 😊 الان چه حسی داری؟</p>
          ${lastMood ? `<small>دفعه‌ی قبل گفتی «${lastMood.label}» بودی</small>` : ''}
        </div>
        <div class="dr-moods">
          ${MOODS.map((m, i) => `
            <button class="dr-mood" data-mood="${m.value}" style="--d:${i * 70}ms">
              <span class="face">${m.face}</span><span class="lbl">${m.label}</span>
            </button>`).join('')}
        </div>
        <div class="dr-after"></div>
      </div>`;
    this.sceneEl.querySelectorAll('.dr-mood').forEach((b) => b.addEventListener('click', () => this.safe(() => this._recordMood(b.dataset.mood))));
  }

  _recordMood(value) {
    const mood = MOODS.find((m) => m.value === value);
    if (!mood) return;
    const at = Date.now();
    localStorage.setItem(MOOD_TIME_KEY, String(at));
    localStorage.setItem(MOOD_KEY, value);
    completeMission('mood', this.ui);   // مأموریتِ «حالت رو به دکتر نیلا بگو»
    sfx.pop();
    this.sceneEl.querySelectorAll('.dr-mood').forEach((b) => b.classList.toggle('picked', b.dataset.mood === value));
    this.sceneEl.querySelector('.dr-text').innerHTML = mood.reply;
    this.sceneEl.querySelector('.dr-nila').classList.remove('hop');
    void this.sceneEl.offsetWidth;
    this.sceneEl.querySelector('.dr-nila').classList.add('hop');

    const reward = this._claimReward();
    const calm = ['tired', 'sad', 'angry'].includes(value);
    const after = this.sceneEl.querySelector('.dr-after');
    after.innerHTML = `
      ${reward ? `<div class="dr-reward">🎁 ${reward}</div>` : ''}
      <div class="dr-actions">
        <button class="cl-btn ${calm ? 'blue' : 'ghost'}" data-act="breath">🫧 نفس جادویی</button>
        <button class="cl-btn ${calm ? 'ghost' : 'green'}" data-act="lobby">برگشت به لابی</button>
      </div>`;
    after.querySelector('[data-act="breath"]').addEventListener('click', () => this.safe(() => this._startBreathing()));
    after.querySelector('[data-act="lobby"]').addEventListener('click', () => this.safe(() => this.toLobby()));
  }

  // جایزه‌ی ساختمانِ مطب (همان «دریافت کمک» قبلی) — با گفتنِ حال، اگر وقتش رسیده باشد
  _claimReward() {
    const b = this.building;
    const a = b && b.action;
    if (!a) return '';
    if (!buildingReady(b.id, a.cooldown)) {
      return `جایزه‌ی بعدی ${fa(Math.ceil(cooldownLeft(b.id, a.cooldown) / 1000))} ثانیه‌ی دیگه`;
    }
    if (a.coins) addCoins(a.coins);
    if (a.dew) addDew(a.dew);
    if (a.xp && addXp(a.xp)) this.ui.levelUp();
    setBuildingCooldown(b.id);
    sfx.coin();
    this.ui.bumpCurrencies();
    const parts = [];
    if (a.dew) parts.push(`+${fa(a.dew)} شبنم`);
    if (a.coins) parts.push(`+${fa(a.coins)} سکه`);
    if (a.xp) parts.push(`+${fa(a.xp)} تجربه`);
    return 'دکتر نیلا بهت داد: ' + parts.join('، ');
  }

  // نفسِ جادویی ۴-۴-۴ (دم، نگه داشتن، بازدم) — سه دور
  _startBreathing() {
    this._stopBreathing();
    const panel = this.sceneEl.querySelector('.dr-panel');
    const box = document.createElement('div');
    box.className = 'dr-breath';
    box.innerHTML = `<div class="orb"><span class="phase">آماده…</span><span class="sec"></span></div>
      <p class="cycles">دور ۱ از ۳</p><button class="cl-btn ghost" data-stop>بسه، ممنون</button>`;
    panel.appendChild(box);
    box.querySelector('[data-stop]').addEventListener('click', () => this.safe(() => this._stopBreathing()));
    const phases = [['inhale', 'نفس بکش…'], ['hold', 'نگه دار…'], ['exhale', 'آروم بیرون بده…']];
    let cycle = 0, p = 0, left = 4;
    const orb = box.querySelector('.orb');
    const show = () => {
      orb.dataset.phase = phases[p][0];
      box.querySelector('.phase').textContent = phases[p][1];
      box.querySelector('.sec').textContent = fa(left);
      box.querySelector('.cycles').textContent = `دور ${fa(cycle + 1)} از ۳`;
    };
    show();
    this._breathT = setInterval(() => {
      left -= 1;
      if (left > 0) { box.querySelector('.sec').textContent = fa(left); return; }
      p += 1; left = 4;
      if (p === phases.length) {
        p = 0; cycle += 1;
        // یک دورِ کاملِ دم‌ونگه‌داشتن‌وبازدم = مأموریتِ «نفس جادویی» (مثلِ پروژه‌ی اصلی)
        if (cycle === 1) completeMission('breath', this.ui);
        if (cycle === 3) {
          this._stopBreathing();
          sfx.levelup();
          const t = this.sceneEl.querySelector('.dr-text');
          if (t) t.innerHTML = 'آفرین! سه تا نفس جادوییِ کامل کشیدی 🌟 حالا حس بهتری داری؟';
          return;
        }
      }
      show();
    }, 1000);
  }

  _stopBreathing() {
    clearInterval(this._breathT);
    this._breathT = null;
    const b = this.sceneEl && this.sceneEl.querySelector('.dr-breath');
    if (b) b.remove();
  }

  // ================= اتاق رازها: آهنین و گاوصندوق =================
  _secrets() { return readJSON(SECRETS_KEY, []); }

  _renderVault() {
    this.sceneEl.className = 'cl-scene room-vault';
    this.sceneEl.innerHTML = `
      <div class="vt-rivets"></div>
      <div class="vt-wrap">
        <div class="vt-safe">
          <div class="vt-inside">
            <div class="vt-shelf"></div>
            <button class="cl-btn cyan vt-new">✏️ راز تازه بنویس</button>
          </div>
          <button class="vt-door" aria-label="گاوصندوق">
            <span class="vt-bolts"></span>
            <span class="vt-wheel"><i></i><i></i><i></i></span>
            <span class="vt-hint">بزن تا باز شه</span>
          </button>
        </div>
      </div>
      <div class="vt-guard">
        <img src="${ASSET('clinic/aheneen.webp')}" alt="آهنین" draggable="false">
        <div class="vt-bubble"><b>آهنین، نگهبان رازها</b><p>سلام! من از رازهات نگهبانی می‌دم. به گاوصندوق بزن تا درش رو برات باز کنم.</p></div>
      </div>
      <div class="vt-modal"></div>`;
    this.sceneEl.querySelector('.vt-door').addEventListener('click', () => this.safe(() => this._toggleVault()));
    this.sceneEl.querySelector('.vt-new').addEventListener('click', () => this.safe(() => this._newSecretForm()));
    this._renderShelf();
  }

  _guardSay(text) {
    const p = this.sceneEl.querySelector('.vt-bubble p');
    if (!p) return;
    p.innerHTML = text;
    const g = this.sceneEl.querySelector('.vt-guard');
    g.classList.remove('nod'); void g.offsetWidth; g.classList.add('nod');
  }

  async _toggleVault(forceOpen) {
    const safe = this.sceneEl.querySelector('.vt-safe');
    const opening = forceOpen ?? !safe.classList.contains('open');
    if (opening === safe.classList.contains('open')) return;
    sfx.drop();
    safe.classList.add('spin');
    await wait(500);
    safe.classList.remove('spin');
    safe.classList.toggle('open', opening);
    sfx.whoosh();
    const n = this._secrets().length;
    if (opening) {
      this._guardSay(n
        ? `گاوصندوق بازه! ${fa(n)} تا راز اینجا قفله. روی هر پاکت بزن و با رمزش بازش کن، یا یه راز تازه بنویس.`
        : 'گاوصندوق خالیه! اولین رازت رو بنویس؛ با یه رمز مخصوص قفلش می‌کنم.');
    } else {
      this._guardSay('درِ گاوصندوق رو بستم. رازهات امنِ امنه 🛡️');
    }
  }

  _renderShelf(flyId) {
    const shelf = this.sceneEl.querySelector('.vt-shelf');
    if (!shelf) return;
    const list = this._secrets();
    shelf.innerHTML = list.length
      ? list.map((s, i) => `
        <button class="vt-env ${s.id === flyId ? 'fly' : ''}" data-id="${esc(s.id)}" style="--r:${((i * 37) % 9) - 4}deg">
          <span class="seal">🔒</span><span class="t">${esc(s.title)}</span>
        </button>`).join('')
      : '<p class="vt-empty">هنوز رازی نسپردی</p>';
    shelf.querySelectorAll('.vt-env').forEach((b) => b.addEventListener('click', () => this.safe(() => this._openSecretForm(b.dataset.id))));
  }

  _modal(html) {
    const m = this.sceneEl.querySelector('.vt-modal');
    m.innerHTML = `<div class="vt-paper">${html}</div>`;
    m.classList.add('show');
    m.addEventListener('click', (e) => { if (e.target === m) this._closeModal(); }, { once: true });
    return m.querySelector('.vt-paper');
  }

  _closeModal() {
    const m = this.sceneEl.querySelector('.vt-modal');
    if (m) { m.classList.remove('show'); m.innerHTML = ''; }
  }

  _noCrypto() {
    this._guardSay('اینجا قفلِ رمزدار کار نمی‌کنه (صفحه باید با https یا روی همین دستگاه باز شده باشه).');
    sfx.error();
  }

  _newSecretForm() {
    if (!cryptoReady()) return this._noCrypto();
    sfx.click();
    const paper = this._modal(`
      <h3>✏️ یه راز تازه</h3>
      <form>
        <input name="title" maxlength="40" placeholder="اسم راز (مثلاً: راز روز جمعه)" required>
        <textarea name="text" rows="4" maxlength="500" placeholder="رازت رو اینجا بنویس…" required></textarea>
        <input name="pass" type="password" minlength="4" autocomplete="new-password" placeholder="یه رمز مخصوص (دست‌کم ۴ حرف)" required>
        <div class="vt-row">
          <button type="submit" class="cl-btn cyan">🔒 بذارش توی گاوصندوق</button>
          <button type="button" class="cl-btn ghost" data-cancel>بی‌خیال</button>
        </div>
      </form>`);
    paper.querySelector('[data-cancel]').addEventListener('click', () => this._closeModal());
    const form = paper.querySelector('form');
    form.querySelector('input').focus();
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      this.safe(async () => {
        const fd = new FormData(form);
        const title = String(fd.get('title')).trim(), text = String(fd.get('text')), pass = String(fd.get('pass'));
        if (!title || !text || pass.length < 4) return;
        form.querySelector('[type=submit]').disabled = true;
        const payload = await encryptText(text, pass);
        const entry = { id: newId(), title, payload, createdAt: Date.now() };
        writeJSON(SECRETS_KEY, [entry, ...this._secrets()]);
        // برگه تا می‌شود و به گاوصندوق می‌پرد
        paper.classList.add('fold');
        sfx.whoosh();
        await wait(520);
        this._closeModal();
        this._renderShelf(entry.id);
        sfx.coin();
        this._guardSay(`«${esc(title)}» رو قفل کردم! بدونِ رمزت هیچ‌کس، حتی من، بازش نمی‌کنه 🛡️`);
      });
    });
  }

  _openSecretForm(id) {
    if (!cryptoReady()) return this._noCrypto();
    const secret = this._secrets().find((s) => s.id === id);
    if (!secret) return;
    sfx.click();
    const paper = this._modal(`
      <h3>🔒 ${esc(secret.title)}</h3>
      <form>
        <input name="pass" type="password" autocomplete="off" placeholder="رمزِ این راز" required>
        <p class="vt-err"></p>
        <div class="vt-row">
          <button type="submit" class="cl-btn cyan">🔓 بازش کن</button>
          <button type="button" class="cl-btn red" data-del aria-label="پاک کردن">🗑️</button>
          <button type="button" class="cl-btn ghost" data-cancel>بستن</button>
        </div>
      </form>
      <p class="vt-revealed"></p>`);
    const form = paper.querySelector('form');
    const err = paper.querySelector('.vt-err');
    const pass = () => form.querySelector('[name=pass]').value;
    form.querySelector('input').focus();
    paper.querySelector('[data-cancel]').addEventListener('click', () => this._closeModal());
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      this.safe(async () => {
        const plain = await decryptText(secret.payload, pass());
        if (plain === null) { err.textContent = 'رمز درست نیست!'; sfx.error(); paper.classList.remove('shake'); void paper.offsetWidth; paper.classList.add('shake'); return; }
        sfx.ready();
        form.remove();
        const out = paper.querySelector('.vt-revealed');
        out.textContent = plain;
        out.classList.add('show');
        const done = document.createElement('button');
        done.className = 'cl-btn cyan';
        done.textContent = '🔒 دوباره قفلش کن';
        done.addEventListener('click', () => { sfx.drop(); this._closeModal(); });
        paper.appendChild(done);
      });
    });
    paper.querySelector('[data-del]').addEventListener('click', () => this.safe(async () => {
      // پاک کردن هم فقط با رمز درست
      if (!pass()) { err.textContent = 'برای پاک کردن هم رمز لازمه!'; return; }
      const plain = await decryptText(secret.payload, pass());
      if (plain === null) { err.textContent = 'برای پاک کردن هم رمز درست لازمه!'; sfx.error(); return; }
      writeJSON(SECRETS_KEY, this._secrets().filter((s) => s.id !== id));
      this._closeModal();
      this._renderShelf();
      sfx.drop();
      this._guardSay('رازت رو برای همیشه پاک کردم.');
    }));
  }

  // ================= اتاق نقاشی: پشتِ میز، روبه‌روی برگه =================
  _renderPaint() {
    this.sceneEl.className = 'cl-scene room-paint';
    const art = readJSON(ART_KEY, []);
    this.sceneEl.innerHTML = `
      <div class="pt-room" style="background-image:url('${ASSET('clinic/lobby.webp')}')"></div>
      <div class="pt-wall">${art.slice(0, 6).map((a, i) => `<img class="pt-pin" src="${a.thumbnail}" alt="" style="--r:${((i * 53) % 11) - 5}deg">`).join('')}</div>
      <div class="pt-table">
        <div class="pt-paper"><canvas></canvas><div class="pt-confirm"></div></div>
        <div class="pt-crayons">
          ${COLORS.map((c, i) => `<button class="pt-crayon ${i === 4 ? 'on' : ''}" data-color="${c}" style="--c:${c}" aria-label="رنگ"></button>`).join('')}
        </div>
        <div class="pt-tools">
          ${BRUSHES.map((b, i) => `<button class="pt-brush ${i === 1 ? 'on' : ''}" data-brush="${b}" aria-label="قلم"><i style="width:${b + 4}px;height:${b + 4}px"></i></button>`).join('')}
          <button class="pt-eraser" aria-label="پاک‌کن">🧽</button>
          <button class="pt-clear" aria-label="برگه‌ی تازه">🗑️</button>
          <button class="cl-btn green pt-save">📌 بزنش به دیوار</button>
        </div>
      </div>
      <div class="pt-rango">
        <img src="${ASSET('clinic/rango.webp')}" alt="رنگو" draggable="false">
        <div class="pt-bubble"><b>رنگو</b><p>سلام نقاش کوچولو! یه مدادشمعی بردار و هرچی تو دلته بکش 🖍️</p></div>
      </div>`;
    this._initCanvas();
  }

  _paintSay(text) {
    const p = this.sceneEl.querySelector('.pt-bubble p');
    if (p) p.innerHTML = text;
  }

  _initCanvas() {
    const scene = this.sceneEl;
    const canvas = scene.querySelector('canvas');
    const ctx = canvas.getContext('2d');
    const tool = { color: COLORS[4], brush: BRUSHES[1], erase: false };
    const used = {};
    let drawn = false;

    // بوم هم‌اندازه‌ی برگه؛ با تغییرِ اندازه نقاشی کش می‌آید و پاک نمی‌شود
    const fit = () => {
      const r = canvas.getBoundingClientRect();
      const dpr = Math.min(2, devicePixelRatio || 1);
      const w = Math.max(1, Math.round(r.width * dpr)), h = Math.max(1, Math.round(r.height * dpr));
      if (canvas.width === w && canvas.height === h) return;
      const prev = drawn ? (() => { const c = document.createElement('canvas'); c.width = canvas.width; c.height = canvas.height; c.getContext('2d').drawImage(canvas, 0, 0); return c; })() : null;
      canvas.width = w; canvas.height = h;
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h);
      if (prev) ctx.drawImage(prev, 0, 0, w, h);
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    };
    requestAnimationFrame(fit);
    this._ro = new ResizeObserver(fit);
    this._ro.observe(canvas);

    const pt = (e) => {
      const r = canvas.getBoundingClientRect();
      return { x: (e.clientX - r.left) * canvas.width / r.width, y: (e.clientY - r.top) * canvas.height / r.height, s: canvas.width / r.width };
    };
    let last = null;
    canvas.addEventListener('pointerdown', (e) => {
      canvas.setPointerCapture(e.pointerId);
      last = pt(e);
      line(last, { x: last.x + 0.01, y: last.y });
      if (!tool.erase) used[tool.color] = (used[tool.color] || 0) + 1;
    });
    canvas.addEventListener('pointermove', (e) => { if (!last) return; const p = pt(e); line(last, p); last = p; });
    const up = () => { last = null; };
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);
    const line = (a, b) => {
      ctx.strokeStyle = tool.erase ? '#fff' : tool.color;
      ctx.lineWidth = (tool.erase ? tool.brush * 2 + 10 : tool.brush) * b.s;
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      if (!tool.erase) drawn = true;
    };

    scene.querySelectorAll('.pt-crayon').forEach((b) => b.addEventListener('click', () => {
      sfx.pop();
      tool.color = b.dataset.color; tool.erase = false;
      scene.querySelectorAll('.pt-crayon').forEach((x) => x.classList.toggle('on', x === b));
      scene.querySelector('.pt-eraser').classList.remove('on');
    }));
    scene.querySelectorAll('.pt-brush').forEach((b) => b.addEventListener('click', () => {
      sfx.pop();
      tool.brush = +b.dataset.brush;
      scene.querySelectorAll('.pt-brush').forEach((x) => x.classList.toggle('on', x === b));
    }));
    scene.querySelector('.pt-eraser').addEventListener('click', (e) => {
      sfx.pop();
      tool.erase = !tool.erase;
      e.currentTarget.classList.toggle('on', tool.erase);
    });
    const confirm = scene.querySelector('.pt-confirm');
    scene.querySelector('.pt-clear').addEventListener('click', () => {
      if (!drawn) return;
      sfx.click();
      confirm.innerHTML = `<span>برگه رو پاک کنم؟</span><button class="cl-btn red" data-yes>آره</button><button class="cl-btn ghost" data-no>نه</button>`;
      confirm.classList.add('show');
      confirm.querySelector('[data-yes]').onclick = () => {
        ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
        drawn = false; for (const k in used) delete used[k];
        confirm.classList.remove('show');
        sfx.whoosh();
      };
      confirm.querySelector('[data-no]').onclick = () => confirm.classList.remove('show');
    });
    scene.querySelector('.pt-save').addEventListener('click', () => this.safe(() => {
      if (!drawn) { sfx.error(); this._paintSay('اول یه چیزی بکش، بعد می‌زنیمش به دیوار! 😉'); return; }
      // بندانگشتی JPEG + حالِ آخر + رنگ‌ها — همان قالبِ لاگِ نقاشیِ پروژه‌ی اصلی
      const t = document.createElement('canvas');
      const k = Math.min(1, 240 / Math.max(canvas.width, canvas.height));
      t.width = Math.round(canvas.width * k); t.height = Math.round(canvas.height * k);
      t.getContext('2d').drawImage(canvas, 0, 0, t.width, t.height);
      const thumbnail = t.toDataURL('image/jpeg', 0.7);
      const entry = { at: Date.now(), mood: localStorage.getItem(MOOD_KEY) || null, colors: { ...used }, thumbnail };
      const log = [entry, ...readJSON(ART_KEY, [])].slice(0, ART_MAX);
      writeJSON(ART_KEY, log);
      const wall = scene.querySelector('.pt-wall');
      const pin = document.createElement('img');
      pin.className = 'pt-pin new';
      pin.src = thumbnail;
      pin.style.setProperty('--r', `${(Math.random() * 10 - 5).toFixed(1)}deg`);
      wall.prepend(pin);
      while (wall.children.length > 6) wall.lastChild.remove();
      sfx.levelup();
      this._paintSay(`واااای چه نقاشیِ قشنگی! زدمش به دیوار 📌 تا حالا ${fa(log.length)} تا نقاشی کشیدی.`);
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
      drawn = false; for (const kk in used) delete used[kk];
    }));
  }
}

export function openClinic(ui, building) {
  if (ui.clinic) return ui.clinic;
  ui.clinic = new Clinic(ui, building);
  ui.clinic.open();
  return ui.clinic;
}
