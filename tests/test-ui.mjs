// تست شبیه‌سازی UI بدون مرورگر — پیدا کردن باگ کرش
import { JSDOM } from 'jsdom';

const html = `
<!DOCTYPE html>
<html><body>
  <div id="game">
    <canvas id="scene"></canvas>
    <div id="overlay">
      <div id="labels"></div>
      <div id="toasts"></div>
      <div id="drag-ghost"></div>
    </div>
  </div>
</body></html>
`;

const dom = new JSDOM(html, { url: 'http://localhost/', pretendToBeVisual: true });
const { window } = dom;
global.window = window;
global.document = window.document;
global.HTMLElement = window.HTMLElement;
global.localStorage = window.localStorage;
global.performance = window.performance;
global.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 16);
global.cancelAnimationFrame = (id) => clearTimeout(id);
window.matchMedia = window.matchMedia || (() => ({ matches: false, addListener() {}, removeListener() {} }));

const errors = [];
window.addEventListener('error', (e) => errors.push('window.onerror: ' + e.message));
process.on('uncaughtException', (e) => errors.push('uncaught: ' + e.stack));
process.on('unhandledRejection', (e) => errors.push('unhandledRejection: ' + e));

// استاب دنیای سه‌بعدی
const fakeWorld = {
  worldToScreen: () => ({ x: 10, y: 10 }),
  showHighlight() {}, hideHighlight() {},
  pick() { return null; }, pickGround() { return null; },
  focusOn() {}, getSprite() { return null; },
  addSprite() { return { material: {}, scale: { y: 3 }, position: {} }; },
  removeSprite() {}, setSpriteTexture() {},
  explode() {}, coinBurst() {},
};

const { UI } = await import('../src/ui.js');
const { LAYOUT } = await import('../src/config.js');

console.log('--- ساخت UI ---');
const ui = new UI(fakeWorld);
console.log('UI ساخته شد ✓');

const tryIt = (name, fn) => {
  try {
    fn();
    console.log(name, '✓ بدون خطا');
  } catch (e) {
    console.log(name, '✗ خطا:', e.stack ? e.stack.split('\n').slice(0, 4).join('\n') : e);
  }
};

tryIt('openMail (کلیک پیام‌ها)', () => ui.openMail());
tryIt('closeModal', () => ui.closeModal());
tryIt('openFriends (کلیک دوستان)', () => ui.openFriends());
tryIt('closeModal', () => ui.closeModal());
tryIt('openShop (کلیک فروشگاه)', () => ui.openShop());
tryIt('closeModal', () => ui.closeModal());
tryIt('openSettings (کلیک تنظیمات)', () => ui.openSettings());
tryIt('closeModal', () => ui.closeModal());
for (const b of LAYOUT.buildings) {
  tryIt(`openBuilding: ${b.id}`, () => ui.openBuilding(b));
  tryIt('closeModal', () => ui.closeModal());
}
tryIt('toast', () => ui.toast('تست'));
tryIt('buyItem soil', () => ui.buyItem('soil'));
tryIt('refreshAll', () => ui.refreshAll());

setTimeout(() => {
  console.log('--- خطاهای async ---');
  console.log(errors.length ? errors.join('\n---\n') : '(بدون خطا)');
  process.exit(0);
}, 800);
