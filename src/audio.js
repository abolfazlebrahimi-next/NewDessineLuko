// ================= صداهای بازی (WebAudio) — کاملاً ضدخطا =================
// هیچ‌وقت throw نمی‌کند؛ اگر محیط (مثل iframe) صدا را مسدود کند، بی‌صدا ادامه می‌دهیم.
import { state } from './state.js';

let ctx = null;
let ctxBroken = false;

function ac() {
  if (ctxBroken) return null;
  if (!ctx) {
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) { ctxBroken = true; return null; }
      ctx = new AC();
    } catch (e) {
      ctxBroken = true;
      return null;
    }
  }
  try {
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  } catch (e) { /* بی‌خیال */ }
  return ctx;
}

function tone(freq, dur = 0.12, type = 'sine', gain = 0.16, slideTo = null) {
  try {
    if (!state.sound) return;
    const a = ac();
    if (!a) return;
    const t0 = a.currentTime || 0;
    const o = a.createOscillator();
    const g = a.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo), t0 + dur);
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    o.connect(g).connect(a.destination);
    o.start(t0);
    o.stop(t0 + dur + 0.02);
  } catch (e) { /* صدا مهم نیست */ }
}

function noise(dur = 0.25, gain = 0.25) {
  try {
    if (!state.sound) return;
    const a = ac();
    if (!a) return;
    const len = Math.floor(a.sampleRate * dur);
    const buf = a.createBuffer(1, len, a.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = a.createBufferSource();
    const g = a.createGain();
    g.gain.value = gain;
    src.buffer = buf;
    src.connect(g).connect(a.destination);
    src.start();
  } catch (e) { /* صدا مهم نیست */ }
}

export const sfx = {
  click: () => tone(660, 0.07, 'triangle', 0.12),
  buy: () => { tone(720, 0.08, 'triangle', 0.14); setTimeout(() => tone(980, 0.1, 'triangle', 0.14), 70); },
  coin: () => { tone(880, 0.07, 'square', 0.1); setTimeout(() => tone(1175, 0.1, 'square', 0.1), 60); },
  drop: () => tone(420, 0.14, 'sine', 0.14, 240),
  water: () => { tone(520, 0.18, 'sine', 0.12, 300); setTimeout(() => tone(360, 0.16, 'sine', 0.1, 220), 80); },
  boom: () => { noise(0.35, 0.3); tone(140, 0.3, 'sawtooth', 0.18, 50); },
  levelup: () => {
    [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => tone(f, 0.16, 'triangle', 0.16), i * 110));
  },
  ready: () => { tone(659, 0.12, 'triangle', 0.14); setTimeout(() => tone(880, 0.16, 'triangle', 0.14), 100); },
  error: () => tone(180, 0.18, 'square', 0.12, 120),
  pop: () => tone(520, 0.06, 'triangle', 0.1, 760),
  whoosh: () => tone(300, 0.12, 'sine', 0.1, 520),
};
