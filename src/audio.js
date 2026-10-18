// ================= صداهای ساده با WebAudio =================
import { state } from './state.js';

let ctx = null;
function ac() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  return ctx;
}

function tone(freq, dur = 0.12, type = 'sine', gain = 0.16, slideTo = null) {
  if (!state.sound) return;
  const a = ac();
  if (!a) return;
  if (a.state === 'suspended') a.resume();
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, a.currentTime);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, a.currentTime + dur);
  g.gain.setValueAtTime(gain, a.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, a.currentTime + dur);
  o.connect(g).connect(a.destination);
  o.start();
  o.stop(a.currentTime + dur + 0.02);
}

function noise(dur = 0.25, gain = 0.25) {
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
};
