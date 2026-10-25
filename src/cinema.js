import { ASSET } from './config.js';
import { sfx } from './audio.js';

// Artwork is local so the selection screen also works in the offline single-file build.
export const MOVIES = [
  { id: 'space', title: 'ماجراجویی در فضا', genre: 'یک سفر تا ستاره‌ها', description: 'با یک فضانورد کوچک و دوست رباتش، به کشف سیاره‌های رنگارنگ برو!' },
  { id: 'forest', title: 'دوستان جنگل', genre: 'دوستی و ماجراجویی', description: 'خرس کوچولو و دوستانش برای یک ماجراجویی شاد در دل جنگل منتظرت هستند.' },
  { id: 'ocean', title: 'دنیای زیر آب', genre: 'سفر به اعماق آبی', description: 'همراه دلفین بازیگوش، شگفتی‌های اقیانوس و دنیای رنگارنگ مرجان‌ها را کشف کن.' },
  { id: 'dinosaurs', title: 'دایناسورهای شگفت‌انگیز', genre: 'یک ماجراجویی بزرگ', description: 'به سرزمین دایناسورها سفر کن؛ جایی که هر گوشه‌اش یک کشف تازه است!' },
  { id: 'castle', title: 'قلعه جادویی', genre: 'پر از خیال و جادو', description: 'پشت درهای این قلعه، یک دنیای جادویی و اژدهایی دوست‌داشتنی منتظر توست.' },
];

const playIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 4.5c-.8-.5-1.8.1-1.8 1v13c0 .9 1 1.5 1.8 1l11-6.5c.8-.5.8-1.5 0-2z" fill="currentColor"/></svg>';

export function openCinema(ui) {
  const previousFocus = document.activeElement;
  const panel = ui.openModal(`
    <img class="cinema-scenery" src="${ASSET('cinema/stage.webp')}" alt="گیشه و راهنمای سینما، جلوی ساختمان سینمای لوکو" draggable="false">
    <div class="cinema-shade" aria-hidden="true"></div>
    <button class="cinema-close" type="button" aria-label="بازگشت به شهر" title="بازگشت به شهر">✕</button>
    <header class="cinema-heading">
      <div class="cinema-marquee"><span aria-hidden="true">★</span><h1 id="cinema-title">چه فیلمی دوست داری ببینی؟</h1><span aria-hidden="true">★</span></div>
      <p class="cinema-subtitle">یک فیلم انتخاب کن</p>
    </header>
    <picture class="cinema-mobile-art"><img src="${ASSET('cinema/booth-mobile.webp')}" alt="گیشه و راهنمای خوش‌آمدگوی سینما" draggable="false"></picture>
    <section class="cinema-program" aria-label="فیلم‌های سینما">
      <div class="cinema-program-top"><span>روی پردهٔ خیال</span><span class="cinema-count">۵ فیلم دیدنی</span></div>
      <div class="cinema-film-scroll" role="list" aria-label="فهرست فیلم‌ها، برای دیدن همه به پایین برو" tabindex="0">
        ${MOVIES.map((movie) => `
          <div role="listitem" class="cinema-film-item">
            <button type="button" class="cinema-film" data-movie="${movie.id}" aria-label="انتخاب ${movie.title}">
              <img src="${ASSET(`cinema/${movie.id}.webp`)}" alt="" draggable="false">
              <span class="cinema-film-copy"><strong><span class="cinema-star" aria-hidden="true">★</span> ${movie.title}</strong><small>${movie.genre}</small></span>
              <span class="cinema-play">${playIcon}</span>
            </button>
          </div>`).join('')}
      </div>
      <div class="cinema-scroll-hint" aria-hidden="true"><span>برای دیدن فیلم‌ها ورق بزن</span><span>⌄</span></div>
    </section>
    <section class="cinema-ticket" aria-label="فیلم انتخاب‌شده" hidden></section>
    <div class="cinema-announcement" role="status" aria-live="polite"></div>
    <div class="cinema-curtains" aria-hidden="true"><div class="cinema-curtain cinema-curtain-left"></div><div class="cinema-curtain cinema-curtain-right"></div><span class="cinema-curtain-emblem">★</span></div>
  `, 'panel-cinema');
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'true');
  panel.setAttribute('aria-labelledby', 'cinema-title');
  panel.tabIndex = -1;
  const program = panel.querySelector('.cinema-program');
  const ticket = panel.querySelector('.cinema-ticket');
  const announcement = panel.querySelector('.cinema-announcement');
  let selectedButton = null;
  let selectedMovie = null;
  let confirmed = false;

  function backToList() {
    ticket.hidden = true;
    program.hidden = false;
    selectedMovie = null;
    announcement.textContent = '';
    selectedButton?.focus();
  }
  panel.querySelector('.cinema-close').addEventListener('click', () => ui.closeModal());
  panel.querySelectorAll('[data-movie]').forEach((button) => {
    button.addEventListener('click', () => {
      selectedButton = button;
      selectedMovie = MOVIES.find((movie) => movie.id === button.dataset.movie);
      confirmed = false;
      sfx.click();
      const movie = selectedMovie;
      program.hidden = true;
      ticket.hidden = false;
      ticket.innerHTML = `
        <button class="cinema-ticket-back" type="button">→ فیلم‌های دیگر</button>
        <img class="cinema-ticket-art" src="${ASSET(`cinema/${movie.id}.webp`)}" alt="${movie.title}">
        <span class="cinema-ticket-eyebrow">بلیت یک سفر خیالی</span>
        <h2>${movie.title}</h2><p>${movie.description}</p>
        <button class="cinema-confirm" type="button">این فیلم رو انتخاب می‌کنم <span aria-hidden="true">★</span></button>
        <small class="cinema-video-note">این بخش برای انتخاب فیلم است؛ پخش فیلم هنوز فعال نیست.</small>`;
      ticket.querySelector('.cinema-ticket-back').addEventListener('click', backToList);
      ticket.querySelector('.cinema-confirm').addEventListener('click', (event) => {
        if (confirmed) return;
        confirmed = true;
        sfx.click();
        panel.dataset.selectedMovie = movie.id;
        event.currentTarget.textContent = '✓ فیلمت انتخاب شد!';
        event.currentTarget.disabled = true;
        announcement.textContent = `فیلم «${movie.title}» انتخاب شد.`;
      });
      ticket.querySelector('.cinema-ticket-back').focus();
    });
  });

  function onKeydown(event) {
    if (!panel.isConnected || ui.activeModal !== panel) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      if (selectedMovie) backToList(); else ui.closeModal();
    }
    if (event.key === 'Tab') {
      const focusable = [...panel.querySelectorAll('button:not(:disabled), [tabindex="0"]')]
        .filter((element) => !element.closest('[hidden]'));
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === panel)) {
        event.preventDefault(); last?.focus();
      } else if (!event.shiftKey && (document.activeElement === last || document.activeElement === panel)) {
        event.preventDefault(); first?.focus();
      }
    }
  }
  document.addEventListener('keydown', onKeydown);
  panel.focus();
  const timer = setTimeout(() => {
    panel.classList.add('cinema-ready');
    if (ui.activeModal === panel && document.activeElement === panel) panel.querySelector('.cinema-close').focus();
  }, window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 0 : 1550);
  ui.modalCleanup = () => {
    clearTimeout(timer);
    document.removeEventListener('keydown', onKeydown);
    if (previousFocus?.isConnected) previousFocus.focus();
  };
  return panel;
}
