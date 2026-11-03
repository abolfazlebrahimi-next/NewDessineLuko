// ================= سینمای لوکو: گیشه‌ی بلیط و سالنِ نمایش =================
// دو نمای داخلی:
//  ۱) گیشه (assets/cinema/booth.webp): روی تابلوی سانس‌ها یک فیلم انتخاب می‌کند و با سکه بلیط
//     می‌خرد؛ بلیط از دستگاهِ کنارِ میز بیرون می‌آید.
//  ۲) سالن (assets/cinema/hall.webp): با بلیط وارد می‌شود، روی یک صندلی می‌نشیند، چراغ‌ها خاموش
//     می‌شوند و فیلم روی پرده پخش می‌شود. آخرِ فیلم جایزه‌ی سینما (همان «تماشای فیلم» قبلی).
//
// هر فیلم اگر `video` داشته باشد همان پخش می‌شود؛ تا آن موقع یک فیلمِ کوتاهِ قصه‌وار با
// کاراکترها و صحنه‌های خودِ شهر لوکو روی پرده می‌آید.
import { state, spend, addCoins, addXp, buildingReady, setBuildingCooldown, cooldownLeft } from './state.js';
import { ASSET } from './config.js';
import { sfx } from './audio.js';
import { Interior, wait, fa, esc } from './interior.js';

const BOOTH = { w: 1671, h: 941 };
const HALL = { w: 1671, h: 941, screen: { x: 450, y: 173, w: 772, h: 280 } };
// ردیف‌های تابلوی سانس (مرکزِ هر ردیف) و دستگاهِ بلیط
const ROWS = [512, 564, 616, 668, 718];
const BOARD = { x: 660, w: 370 };
const MACHINE = { x: 1058, y: 745, w: 122, h: 82 };
const TICKETS_KEY = 'luko_cinema_tickets';

const C = (f) => ASSET(f);
// فیلم‌های هر سانس. video خالی ← فیلمِ قصه‌وارِ scenes
export const FILMS = [
  {
    id: 'orb', time: '10:00', title: 'لوکی و گوی جادویی', price: 20, poster: 'hall/luki.webp', video: '',
    scenes: [
      { bg: 'hall/hall.webp', pos: '50% 70%', chars: [{ img: 'hall/luki.webp', at: 'r', anim: 'enter' }], text: 'یه روز صبح، لوکی توی تالارِ بزرگِ شهر قدم می‌زد…' },
      { bg: 'hall/hall.webp', pos: '50% 75%', zoom: 1.6, chars: [], text: 'ناگهان گویِ بلوری شروع کرد به درخشیدن! ✨' },
      { bg: 'hall/hall.webp', pos: '50% 70%', chars: [{ img: 'hall/luki.webp', at: 'r', anim: 'hop' }, { img: 'hall/pixel.webp', at: 'l', anim: 'enter' }], text: 'پیکسل از پشتِ گوی بیرون پرید: «بیا بریم توی دنیای بازی‌ها!»' },
      { bg: 'sky', chars: [{ img: 'hall/pixel.webp', at: 'c', anim: 'float' }], text: 'و این‌طوری ماجراجوییِ بزرگشون توی جزیره‌ی ستاره‌ها شروع شد…' },
      { bg: 'sky', chars: [{ img: 'hall/luki.webp', at: 'l', anim: 'wave' }, { img: 'hall/pixel.webp', at: 'r', anim: 'wave' }], text: 'تو هم می‌تونی بیای! فقط کافیه روی گوی بزنی 🔮 — پایان' },
    ],
  },
  {
    id: 'breath', time: '12:30', title: 'نفسِ جادویی', price: 25, poster: 'clinic/nila.webp', video: '',
    scenes: [
      { bg: 'clinic/lobby.webp', pos: '15% 50%', chars: [{ img: 'clinic/nila.webp', at: 'r', anim: 'enter' }], text: 'دکتر نیلا یه راز داشت برای وقتایی که دلمون شلوغه…' },
      { bg: 'clinic/lobby.webp', pos: '15% 50%', chars: [{ img: 'clinic/nila.webp', at: 'c', anim: 'breathe' }], text: 'آروم نفس بکش… یک، دو، سه، چهار 🫧' },
      { bg: 'clinic/lobby.webp', pos: '15% 50%', chars: [{ img: 'clinic/nila.webp', at: 'c', anim: 'breathe' }], text: 'نگهش دار… حالا آروم بیرون بده.' },
      { bg: 'clinic/lobby.webp', pos: '50% 50%', chars: [{ img: 'clinic/nila.webp', at: 'r', anim: 'hop' }], text: 'دیدی؟ دلت سبک شد! هر وقت خواستی بیا مطبم 💙 — پایان' },
    ],
  },
  {
    id: 'rainbow', time: '15:00', title: 'رنگین‌کمونِ گمشده', price: 25, poster: 'clinic/rango.webp', video: '',
    scenes: [
      { bg: 'clinic/lobby.webp', pos: '50% 45%', zoom: 1.8, chars: [{ img: 'clinic/rango.webp', at: 'r', anim: 'enter' }], text: 'رنگو صبح که بیدار شد دید رنگین‌کمونِ تابلوش گم شده! 😮' },
      { bg: 'clinic/lobby.webp', pos: '50% 45%', zoom: 1.8, chars: [{ img: 'clinic/rango.webp', at: 'l', anim: 'hop' }], text: 'قرمز کو؟ نارنجی کو؟ زرد کو؟' },
      { bg: 'paint', chars: [{ img: 'clinic/rango.webp', at: 'c', anim: 'wave' }], text: 'پس تصمیم گرفت خودش یه رنگین‌کمونِ تازه بکشه! 🖍️' },
      { bg: 'paint', chars: [{ img: 'clinic/rango.webp', at: 'r', anim: 'hop' }], text: 'تو هم بیا اتاقِ نقاشی و یکی بکش! 🌈 — پایان' },
    ],
  },
  {
    id: 'secret', time: '17:30', title: 'رازِ آهنین', price: 30, poster: 'clinic/aheneen.webp', video: '',
    scenes: [
      { bg: 'vault', chars: [{ img: 'clinic/aheneen.webp', at: 'c', anim: 'enter' }], text: 'شب بود و آهنین کنارِ گاوصندوق نگهبانی می‌داد… 🌙' },
      { bg: 'vault', chars: [{ img: 'clinic/aheneen.webp', at: 'r', anim: 'hop' }], text: 'یکی در زد! «کیه؟» — «منم، یه راز آوردم!»' },
      { bg: 'vault', chars: [{ img: 'clinic/aheneen.webp', at: 'c', anim: 'wave' }], text: 'آهنین رازِ کوچولو رو با یه رمزِ مخصوص قفل کرد 🔒' },
      { bg: 'vault', chars: [{ img: 'clinic/aheneen.webp', at: 'l', anim: 'breathe' }], text: 'و قول داد هیچ‌وقت، هیچ‌وقت، به هیچ‌کس نگه. — پایان' },
    ],
  },
  {
    id: 'champ', time: '20:00', title: 'چابک، قهرمانِ باشگاه', price: 30, poster: 'club/chabok.webp', video: '',
    scenes: [
      { bg: 'club/gym.webp', pos: '50% 60%', chars: [{ img: 'club/chabok.webp', at: 'c', anim: 'enter' }], text: 'چابک هر روز صبح زودتر از همه می‌اومد باشگاه 🏃' },
      { bg: 'club/gym.webp', pos: '20% 80%', zoom: 1.5, chars: [{ img: 'club/chabok.webp', at: 'l', anim: 'jump' }], text: 'ده تا پروانه! یک… دو… سه… 🦋' },
      { bg: 'club/gym.webp', pos: '80% 40%', zoom: 1.5, chars: [{ img: 'club/chabok.webp', at: 'r', anim: 'hop' }], text: 'روی تابلوی افتخار، اسمش هر روز بالاتر می‌رفت ⭐' },
      { bg: 'club/gym.webp', pos: '50% 60%', chars: [{ img: 'club/chabok.webp', at: 'c', anim: 'wave' }], text: 'راز قهرمانی؟ هر روز یه کم تمرین! بیا با هم ورزش کنیم 💪 — پایان' },
    ],
  },
];
const SCENE_MS = 4800;

const readTickets = () => { try { return JSON.parse(localStorage.getItem(TICKETS_KEY) || '[]'); } catch (e) { return []; } };
const writeTickets = (t) => { try { localStorage.setItem(TICKETS_KEY, JSON.stringify(t)); } catch (e) { /* بسته */ } };

export class Cinema extends Interior {
  constructor(ui, building) {
    super(ui, building, {
      id: 'cinema',
      img: { src: ASSET('cinema/booth.webp'), w: BOOTH.w, h: BOOTH.h },
      title: 'سینمای لوکو',
      avatar: ASSET('hall/luki.webp'),
      views: { board: [560, 380, 1200, 860] },
      spots: [{ x: BOARD.x, w: BOARD.w }],
    });
  }

  stageHtml() {
    return `
      ${FILMS.map((f, i) => `
        <button class="cn-row" data-film="${f.id}" style="left:${BOARD.x}px;top:${ROWS[i] - 24}px;width:${BOARD.w}px" aria-label="${esc(f.title)}">
          <span class="cn-film">${esc(f.title)}</span><span class="cn-price">🪙 ${fa(f.price)}</span>
        </button>`).join('')}
      <div class="cn-board-tag cl-door-tag">🎬 روی یه فیلم بزن</div>
      <button class="cn-machine" aria-label="بلیط‌های من" style="left:${MACHINE.x}px;top:${MACHINE.y}px;width:${MACHINE.w}px;height:${MACHINE.h}px">
        <span class="cn-ticket" aria-hidden="true"><b>🎟️</b><i></i></span>
      </button>`;
  }

  onOpen() {
    const root = this.root;
    root.querySelectorAll('.cn-row').forEach((b) => this.tap(b, () => this._pick(b.dataset.film)));
    this.tap(root.querySelector('.cn-machine'), () => this._toHall());
    this._refreshTickets();
    this.say('به سینمای لوکو خوش اومدی 🍿 از تابلوی سانس‌ها یه فیلم انتخاب کن و بلیطش رو بخر!', 4200);
  }

  onLeaveRoom() { this._stopFilm(); }
  onClose() { this._stopFilm(); this.ui.cinema = null; }
  toLobby(hint = 'یه فیلم دیگه انتخاب کن 🎬') { super.toLobby(hint); this._refreshTickets(); }

  // بلیطِ خریده‌شده از شکافِ دستگاه بیرون زده و منتظرِ برداشتن است
  _refreshTickets() {
    const n = readTickets().length;
    this.root.classList.toggle('has-ticket', n > 0);
    const t = this.root.querySelector('.cn-ticket i');
    if (t) t.textContent = n > 1 ? `×${fa(n)}` : '';
  }

  // ---------- گیشه ----------
  _pick(id) {
    if (this.view !== 'lobby' && this.view !== 'board') return;
    const f = FILMS.find((x) => x.id === id);
    if (!f) return;
    sfx.click();
    this.hush();   // حبابِ خوش‌آمد روی دکمه‌های کارتِ بلیط نیفتد (روی گوشیِ افقی دقیقاً رویشان است)
    this.setView('board');
    const have = readTickets().includes(f.id);
    this.sceneEl.className = 'cl-scene room-ticket show';
    this.sceneEl.innerHTML = `
      <div class="cn-card">
        <div class="cn-poster"><img src="${C(f.poster)}" alt=""><span>${esc(f.time)}</span></div>
        <div class="cn-info">
          <small>سانسِ ${esc(f.time)}</small>
          <h3>${esc(f.title)}</h3>
          <p class="cn-cost">قیمتِ بلیط: <b>🪙 ${fa(f.price)}</b> <span>(سکه‌هات: ${fa(state.coins)})</span></p>
          <p class="cn-err"></p>
          <div class="vt-row">
            ${have ? '<button class="cl-btn green" data-go>🎟️ بلیطش رو داری! برو سالن</button>'
              : `<button class="cl-btn red" data-buy>🎟️ بلیط بخر</button>`}
            <button class="cl-btn ghost" data-back>یه فیلم دیگه</button>
          </div>
        </div>
      </div>`;
    const card = this.sceneEl.querySelector('.cn-card');
    card.querySelector('[data-back]').addEventListener('click', () => this.safe(() => this._closeCard()));
    const go = card.querySelector('[data-go]');
    if (go) go.addEventListener('click', () => this.safe(() => { this._closeCard(true); this._toHall(); }));
    const buy = card.querySelector('[data-buy]');
    if (buy) buy.addEventListener('click', () => this.safe(() => this._buy(f, card)));
  }

  _closeCard(silent) {
    this.sceneEl.classList.remove('show');
    setTimeout(() => { if (!this.root.classList.contains('in-room')) this.sceneEl.innerHTML = ''; }, 300);
    this.setView('lobby');
    if (!silent) sfx.click();
  }

  async _buy(f, card) {
    if (!spend('coins', f.price)) {
      sfx.error();
      card.querySelector('.cn-err').textContent = `سکه‌هات کمه! ${fa(f.price - state.coins)} سکه‌ی دیگه لازم داری 🪙`;
      card.classList.remove('shake'); void card.offsetWidth; card.classList.add('shake');
      return;
    }
    this.ui.bumpCurrencies();
    writeTickets([...readTickets(), f.id]);
    sfx.coin();
    this._closeCard(true);
    await wait(350);
    // بلیط از دستگاه چاپ می‌شود
    this._refreshTickets();
    this.root.classList.remove('printed'); void this.root.offsetWidth; this.root.classList.add('printed');
    sfx.ready();
    this.say(`بلیطِ «${esc(f.title)}» چاپ شد! 🎟️ روی بلیط بزن تا بری توی سالن.`);
  }

  // ---------- سالن ----------
  async _toHall() {
    if (this._busy || this.root.classList.contains('in-room')) return;
    const tickets = readTickets();
    if (!tickets.length) {
      sfx.error();
      this.say('هنوز بلیط نداری! از تابلوی سانس‌ها یه فیلم انتخاب کن 🎬');
      return;
    }
    this._busy = true;
    sfx.whoosh();
    try {
      this.hush();
      await this.zoomInto('lobby', () => this._renderHall(tickets));
    } finally { this._busy = false; }
  }

  _renderHall(tickets) {
    this.view = 'hall';
    this.root.dataset.view = 'hall';
    const S = HALL.screen;
    const options = [...new Set(tickets)].map((id) => FILMS.find((f) => f.id === id)).filter(Boolean);
    this.sceneEl.className = 'cl-scene room-hall';
    this.sceneEl.innerHTML = `
      <div class="ch-view"><div class="ch-stage" style="width:${HALL.w}px;height:${HALL.h}px">
        <img class="cl-bg" src="${ASSET('cinema/hall.webp')}" alt="" draggable="false">
        <div class="ch-screen" style="left:${S.x}px;top:${S.y}px;width:${S.w}px;height:${S.h}px">
          <div class="ch-title"><b>🎬</b><span>${options.length > 1 ? 'کدوم فیلم؟' : esc(options[0].title)}</span></div>
        </div>
        <div class="ch-dark"></div>
        ${[[300, 690], [560, 690], [835, 690], [1110, 690], [1380, 690], [450, 820], [835, 820], [1220, 820]].map(([x, y], i) =>
          `<button class="ch-seat" data-seat="${i}" style="left:${x - 90}px;top:${y - 70}px" aria-label="صندلی"></button>`).join('')}
      </div></div>
      <div class="ch-pick">
        ${options.length > 1 ? options.map((f) => `<button class="cl-btn ${f === options[0] ? 'red' : 'ghost'}" data-film="${f.id}">${esc(f.title)}</button>`).join('') : ''}
      </div>`;
    this._hallFilm = options[0];
    this._fitHall();
    this._hallResize = () => this._fitHall();
    window.addEventListener('resize', this._hallResize);
    this.sceneEl.querySelectorAll('.ch-pick [data-film]').forEach((b) => b.addEventListener('click', () => this.safe(() => {
      this._hallFilm = FILMS.find((f) => f.id === b.dataset.film);
      this.sceneEl.querySelectorAll('.ch-pick [data-film]').forEach((x) => x.className = `cl-btn ${x === b ? 'red' : 'ghost'}`);
      this.sceneEl.querySelector('.ch-title span').textContent = this._hallFilm.title;
      sfx.click();
    })));
    this.sceneEl.querySelectorAll('.ch-seat').forEach((b) => b.addEventListener('click', () => this.safe(() => this._sit(b))));
    this.say('یه صندلی انتخاب کن و بشین 💺', 0);
  }

  // سالن هم مثلِ لابی کلِ صفحه را می‌پوشاند؛ موقعِ تماشا روی پرده زوم می‌کند
  _fitHall(watch = false) {
    const st = this.sceneEl.querySelector('.ch-stage');
    if (!st) return;
    const vw = this.root.clientWidth, vh = this.root.clientHeight;
    let k, x, y;
    if (watch) {
      const S = HALL.screen;
      k = Math.min(vw / (S.w + 80), vh / (S.h + 140));
      x = vw / 2 - k * (S.x + S.w / 2);
      y = vh / 2 - k * (S.y + S.h / 2) + 10;
    } else {
      k = Math.max(vw / HALL.w, vh / HALL.h);
      x = (vw - HALL.w * k) / 2;
      y = (vh - HALL.h * k) / 2;
    }
    st.style.transform = `translate(${x}px, ${y}px) scale(${k})`;
  }

  async _sit(seat) {
    if (this._playing) return;
    const film = this._hallFilm;
    if (!film) return;
    // بلیطِ همین فیلم مصرف می‌شود
    const t = readTickets();
    const i = t.indexOf(film.id);
    if (i < 0) return;
    t.splice(i, 1);
    writeTickets(t);
    this._playing = true;
    sfx.pop();
    this.hush();
    seat.classList.add('taken');
    this.sceneEl.querySelector('.ch-pick').innerHTML = '';
    await wait(350);
    this.root.classList.add('lights-off');
    this._fitHall(true);
    await wait(900);
    this._playFilm(film);
  }

  // ---------- پخشِ فیلم روی پرده ----------
  _playFilm(film) {
    const screen = this.sceneEl.querySelector('.ch-screen');
    screen.innerHTML = `<div class="ch-film"></div><div class="ch-bar"><i></i></div>
      <button class="ch-exit cl-btn ghost">✕</button>`;
    screen.querySelector('.ch-exit').addEventListener('click', () => this.safe(() => this._endFilm(film, false)));
    const box = screen.querySelector('.ch-film');
    const bar = screen.querySelector('.ch-bar i');
    if (film.video) {
      box.innerHTML = `<video src="${film.video}" autoplay playsinline></video>`;
      const v = box.querySelector('video');
      v.addEventListener('timeupdate', () => { if (v.duration) bar.style.width = `${(v.currentTime / v.duration) * 100}%`; });
      v.addEventListener('ended', () => this.safe(() => this._endFilm(film, true)));
      return;
    }
    let n = 0;
    const total = film.scenes.length * SCENE_MS;
    const t0 = Date.now();
    const show = () => {
      const sc = film.scenes[n];
      const el = document.createElement('div');
      el.className = 'ch-scene';
      el.style.setProperty('--z', sc.zoom || 1.1);
      const bg = sc.bg.includes('/') ? `background-image:url('${C(sc.bg)}');background-position:${sc.pos || '50% 50%'}` : '';
      el.innerHTML = `<div class="ch-bg ${sc.bg.includes('/') ? '' : 'bg-' + sc.bg}" style="${bg}"></div>
        ${sc.chars.map((ch) => `<img class="ch-char at-${ch.at} a-${ch.anim}" src="${C(ch.img)}" alt="">`).join('')}
        <p class="ch-sub">${esc(sc.text)}</p>`;
      box.appendChild(el);
      requestAnimationFrame(() => el.classList.add('in'));
      const old = box.children.length > 1 ? box.firstElementChild : null;
      if (old) setTimeout(() => old.remove(), 700);
      sfx.pop();
    };
    show();
    this._filmT = setInterval(() => {
      const el = Date.now() - t0;
      bar.style.width = `${Math.min(100, (el / total) * 100)}%`;
      const want = Math.floor(el / SCENE_MS);
      if (want >= film.scenes.length) { this.safe(() => this._endFilm(film, true)); return; }
      if (want !== n) { n = want; show(); }
    }, 200);
  }

  _stopFilm() {
    clearInterval(this._filmT);
    this._filmT = null;
    if (this._hallResize) { window.removeEventListener('resize', this._hallResize); this._hallResize = null; }
    const v = this.sceneEl && this.sceneEl.querySelector('video');
    if (v) v.pause();
    this._playing = false;
    if (this.root) this.root.classList.remove('lights-off', 'printed');
  }

  // آخرِ فیلم: چراغ‌ها روشن، جایزه‌ی سینما (اگر وقتش رسیده)
  _endFilm(film, finished) {
    clearInterval(this._filmT);
    this._filmT = null;
    const v = this.sceneEl.querySelector('video');
    if (v) v.pause();
    this.root.classList.remove('lights-off');
    this._fitHall(false);
    const screen = this.sceneEl.querySelector('.ch-screen');
    const reward = finished ? this._claim() : '';
    if (finished) sfx.levelup();
    screen.innerHTML = `<div class="ch-end">
      <h3>${finished ? '🎉 پایانِ فیلم!' : 'فیلم رو نصفه ول کردی 😮'}</h3>
      ${finished ? `<p>«${esc(film.title)}» رو دیدی 👏</p>` : '<p>دفعه‌ی بعد تا آخرش ببین!</p>'}
      ${reward ? `<p class="ch-reward">${reward}</p>` : ''}
      <div class="vt-row"><button class="cl-btn red" data-lobby>🎟️ برگشت به گیشه</button></div></div>`;
    screen.querySelector('[data-lobby]').addEventListener('click', () => this.safe(() => {
      this._playing = false;
      this.toLobby();
    }));
  }

  _claim() {
    const b = this.building, a = b && b.action;
    if (!a) return '';
    if (!buildingReady(b.id, a.cooldown)) return `جایزه‌ی بعدیِ سینما ${fa(Math.ceil(cooldownLeft(b.id, a.cooldown) / 1000))} ثانیه‌ی دیگه`;
    if (a.coins) addCoins(a.coins);
    if (a.xp && addXp(a.xp)) this.ui.levelUp();
    setBuildingCooldown(b.id);
    this.ui.bumpCurrencies();
    const parts = [];
    if (a.xp) parts.push(`+${fa(a.xp)} تجربه`);
    if (a.coins) parts.push(`+${fa(a.coins)} سکه`);
    return '🍿 ' + parts.join('، ');
  }
}

export function openCinema(ui, building) {
  if (ui.cinema) return ui.cinema;
  ui.cinema = new Cinema(ui, building);
  ui.cinema.open();
  return ui.cinema;
}
