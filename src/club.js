// ================= باشگاه لوکو =================
// نقاشیِ assets/club/gym.webp؛ چابک (قهرمانِ ورزشِ شهر) وسطِ باشگاه روی ستاره ایستاده:
//  - تابلوی افتخار ← مأموریت‌های روزانه، استریکِ هفته و مدال‌ها (همان باشگاهِ پروژه‌ی اصلی)
//  - تشکِ آبی ← تمرین‌های هدایت‌شده با چابک؛ زمان فقط وقتی صفحه جلوی چشم است جلو می‌رود
//  - در ← فروشگاهِ شهر
// تصویرِ چابک در CLUB.coach است؛ وقتی کاراکترِ تازه رسید فقط همان یک خط عوض می‌شود.
import { addXp, buildingReady, setBuildingCooldown } from './state.js';
import { ASSET } from './config.js';
import { sfx } from './audio.js';
import { Interior, fa, esc } from './interior.js';
import { DAILY_MISSIONS, SPORT_TASKS, cityReward, clubState, streakOf, weekDays, medals, completeSport, onProgress } from './progress.js';

const IMG = { w: 1672, h: 941 };
export const CLUB = { coach: 'club/chabok.webp', coachName: 'چابک', coachRole: 'قهرمانِ ورزشِ شهر لوکو' };
const SPOTS = {
  board: { x: 1080, y: 205, w: 255, h: 295, name: 'تابلوی افتخار', icon: '🏅' },
  mat: { x: 125, y: 715, w: 485, h: 145, name: 'تمرین با چابک', icon: '🤸' },
  door: { x: 678, y: 300, w: 242, h: 278, name: 'فروشگاه', icon: '🛍️' },
};
const VIEWS = { board: [990, 150, 1430, 560], mat: [40, 520, 760, 920] };
const TICK_MS = 250;
const MAX_STEP_S = 1.5;      // تبِ پس‌زمینه یا خوابِ دستگاه پرشِ ناگهانی نسازد

const CHEERS = [
  'هر روز یه کم تمرین، قهرمانت می‌کنه! 💪',
  'بیا روی تشک، با هم بدوییم! 🏃',
  'تابلوی افتخار رو دیدی؟ جای اسمت خالیه! 🏅',
  'آب بخور، نفس عمیق بکش، بزن بریم! 💧',
];

export class Club extends Interior {
  constructor(ui, building) {
    super(ui, building, {
      id: 'club',
      img: { src: ASSET('club/gym.webp'), w: IMG.w, h: IMG.h },
      title: 'باشگاه لوکو',
      avatar: ASSET(CLUB.coach),
      views: VIEWS,
      spots: [SPOTS.mat, SPOTS.door, SPOTS.board],
    });
    this._cheer = 0;
  }

  stageHtml() {
    return `
      ${Object.entries(SPOTS).map(([id, d]) => `
        <button class="cl-door cb-spot" data-spot="${id}" aria-label="${d.name}"
          style="left:${d.x}px;top:${d.y}px;width:${d.w}px;height:${d.h}px">
          <span class="cl-door-tag cb-tag ${id}"><b>${d.icon}</b>${d.name}</span>
        </button>`).join('')}
      <img class="cb-coach" src="${ASSET(CLUB.coach)}" alt="${CLUB.coachName}" draggable="false">`;
  }

  onOpen() {
    const root = this.root;
    root.querySelectorAll('.cb-spot').forEach((b) => this.tap(b, () => this.enter(b.dataset.spot)));
    this.tap(root.querySelector('.cb-coach'), () => this._cheerUp());
    this._off = onProgress(() => { if (this.view === 'board') this._renderBoard(); });
    this.say(`سلام قهرمان! من ${CLUB.coachName}م 💪 روی تشک بیا تا با هم تمرین کنیم، یا تابلوی افتخار رو ببین.`, 4500);
  }

  onLeaveRoom() { this._stopSession(); }
  onClose() { this._stopSession(); if (this._off) this._off(); this.ui.club = null; }
  toLobby(hint = 'تشک، تابلو یا فروشگاه؟ 🏟️') { super.toLobby(hint); }

  _cheerUp() {
    sfx.pop();
    const c = this.root.querySelector('.cb-coach');
    c.classList.remove('hop'); void c.offsetWidth; c.classList.add('hop');
    this.say(`${CLUB.coachName}: «${CHEERS[this._cheer++ % CHEERS.length]}»`, 3000);
  }

  async enter(spot) {
    if (this.view !== 'lobby' || this._busy) return;
    sfx.click();
    if (spot === 'door') {
      // فروشگاهِ خودِ شهر (پنجره‌اش روی همین صفحه باز می‌شود)
      this.say('فروشگاهِ شهر باز شد 🛍️', 2000);
      this.ui.openShop();
      return;
    }
    this._busy = true;
    try {
      await this.zoomInto(spot, () => (spot === 'board' ? this._renderBoard() : this._renderMat()));
    } finally { this._busy = false; }
  }

  // ================= تابلوی افتخار =================
  _renderBoard() {
    const st = clubState();
    const streak = streakOf(st.days);
    const week = weekDays(st.days);
    const ms = medals();
    const got = ms.filter((m) => m.unlocked).length;
    this.sceneEl.className = 'cl-scene room-board show';
    this.sceneEl.innerHTML = `
      <div class="cb-panel">
        <section class="cb-card cb-streak">
          <h3>🔥 ${streak ? `${fa(streak)} روزِ پشتِ‌سرهم!` : 'استریکت رو شروع کن!'}</h3>
          <div class="cb-week">${week.map((d) => `<span class="${d.done ? 'done' : ''} ${d.today ? 'today' : ''}">${d.done ? '🔥' : d.future ? '·' : '○'}<i>${d.label}</i></span>`).join('')}</div>
        </section>
        <section class="cb-card">
          <h3>🎯 مأموریت‌های امروز <small>${fa(st.doneToday.length)} از ${fa(DAILY_MISSIONS.length)}</small></h3>
          <ul class="cb-missions">
            ${DAILY_MISSIONS.map((m) => {
              const done = st.doneToday.includes(m.id);
              return `<li class="${done ? 'done' : ''}"><b>${m.icon}</b><span>${esc(m.title)}<small>${done ? 'انجام شد ✅' : esc(m.where)}</small></span><em>🪙 ${fa(cityReward(m))}</em></li>`;
            }).join('')}
          </ul>
          <p class="cb-note">مأموریت‌ها خودشون تیک می‌خورن؛ کافیه کار رو واقعاً انجام بدی!</p>
        </section>
        <section class="cb-card cb-medals-card">
          <h3>🏅 مدال‌ها <small>${fa(got)} از ${fa(ms.length)}</small></h3>
          <div class="cb-medals">
            ${ms.map((m) => `<div class="cb-medal ${m.tier} ${m.unlocked ? 'on' : ''}" title="${esc(m.description)}">
              <span class="disc">${m.icon}</span><b>${esc(m.title)}</b>
              ${m.unlocked ? '' : `<i class="bar"><i style="width:${Math.round(m.ratio * 100)}%"></i></i><small>${fa(m.current)}/${fa(m.target)}</small>`}
            </div>`).join('')}
          </div>
        </section>
      </div>`;
  }

  // ================= تشک: تمرین با چابک =================
  _renderMat() {
    const st = clubState();
    this.sceneEl.className = 'cl-scene room-mat show';
    this.sceneEl.innerHTML = `
      <div class="cb-mat">
        <div class="cb-coachbox"><img class="cb-big" src="${ASSET(CLUB.coach)}" alt=""></div>
        <div class="cb-side">
          <div class="cb-bubble"><b>${CLUB.coachName}، ${CLUB.coachRole}</b><p>یه تمرین انتخاب کن؛ من باهات انجامش می‌دم! هر تمرین تا آخر بری، سکه می‌گیری 🪙</p></div>
          <div class="cb-tasks">
            ${SPORT_TASKS.map((t) => {
              const done = st.sportToday.includes(t.id);
              return `<button class="cb-task ${done ? 'done' : ''}" data-task="${t.id}">
                <b>${t.icon}</b><span>${esc(t.title)}<small>${t.reps ? `${fa(t.reps)} تا · ` : ''}${fa(t.seconds)} ثانیه</small></span>
                <em>${done ? '✅ امروز رفتی' : `🪙 ${fa(cityReward(t))}`}</em></button>`;
            }).join('')}
          </div>
        </div>
      </div>`;
    this.sceneEl.querySelectorAll('.cb-task').forEach((b) => b.addEventListener('click', () => this.safe(() => this._startSession(b.dataset.task))));
  }

  _startSession(id) {
    const task = SPORT_TASKS.find((t) => t.id === id);
    if (!task) return;
    sfx.ready();
    this._stopSession();
    const side = this.sceneEl.querySelector('.cb-side');
    const big = this.sceneEl.querySelector('.cb-big');
    big.className = `cb-big m-${task.move}`;
    side.innerHTML = `
      <div class="cb-session">
        <h3>${task.icon} ${esc(task.title)}</h3>
        <div class="cb-ring" style="--p:0"><div><b class="sec">${fa(task.seconds)}</b><small>ثانیه</small></div></div>
        ${task.reps ? `<p class="cb-reps">تکرار: <b>۰</b> از ${fa(task.reps)}</p>` : ''}
        <p class="cb-cue">${esc(task.cue)}</p>
        <p class="cb-paused">⏸️ تمرین مکث کرده؛ برگرد تا ادامه بدیم</p>
        <button class="cl-btn ghost" data-stop>بسه، برمی‌گردم</button>
      </div>`;
    side.querySelector('[data-stop]').addEventListener('click', () => this.safe(() => { this._stopSession(); this._renderMat(); }));
    // زمانِ واقعی شمرده می‌شود و فقط وقتی صفحه دیده می‌شود (مثلِ useSportSession پروژه‌ی اصلی)
    let elapsed = 0, last = Date.now(), lastRep = 0;
    this._session = setInterval(() => {
      const now = Date.now();
      const step = Math.min((now - last) / 1000, MAX_STEP_S);
      last = now;
      const hidden = document.visibilityState !== 'visible';
      side.querySelector('.cb-session').classList.toggle('paused', hidden);
      if (hidden) return;
      elapsed = Math.min(task.seconds, elapsed + step);
      const p = elapsed / task.seconds;
      side.querySelector('.cb-ring').style.setProperty('--p', p.toFixed(3));
      side.querySelector('.sec').textContent = fa(Math.ceil(task.seconds - elapsed));
      if (task.reps) {
        const rep = Math.min(task.reps, Math.floor(p * task.reps + 0.0001));
        if (rep !== lastRep) { lastRep = rep; sfx.pop(); side.querySelector('.cb-reps b').textContent = fa(rep); }
      }
      if (elapsed >= task.seconds) { this._stopSession(); this._finishSession(task); }
    }, TICK_MS);
  }

  _stopSession() {
    clearInterval(this._session);
    this._session = null;
  }

  _finishSession(task) {
    sfx.levelup();
    const first = completeSport(task.id, this.ui);
    // جایزه‌ی ساختمانِ باشگاه (همان «تمرین» قبلی) اگر وقتش رسیده باشد
    const b = this.building, a = b && b.action;
    let extra = '';
    if (a && buildingReady(b.id, a.cooldown)) {
      if (a.xp && addXp(a.xp)) this.ui.levelUp();
      setBuildingCooldown(b.id);
      this.ui.bumpCurrencies();
      extra = `+${fa(a.xp)} تجربه`;
    }
    const big = this.sceneEl.querySelector('.cb-big');
    if (big) big.className = 'cb-big m-win';
    const side = this.sceneEl.querySelector('.cb-side');
    side.innerHTML = `
      <div class="cb-session done">
        <h3>🏆 آفرین قهرمان!</h3>
        <p>«${esc(task.title)}» رو تا آخر رفتی!</p>
        ${first ? `<p class="cb-win">🪙 +${fa(cityReward(task))} سکه</p>` : '<p>امروز سکه‌ی این تمرین رو گرفته بودی؛ ولی ورزش همیشه خوبه! 😄</p>'}
        ${extra ? `<p class="cb-win">⭐ ${extra}</p>` : ''}
        <div class="vt-row"><button class="cl-btn green" data-more>یه تمرین دیگه</button><button class="cl-btn ghost" data-out>برگشت</button></div>
      </div>`;
    side.querySelector('[data-more]').addEventListener('click', () => this.safe(() => this._renderMat()));
    side.querySelector('[data-out]').addEventListener('click', () => this.safe(() => this.toLobby()));
  }
}

export function openClub(ui, building) {
  if (ui.club) return ui.club;
  ui.club = new Club(ui, building);
  ui.club.open();
  return ui.club;
}
