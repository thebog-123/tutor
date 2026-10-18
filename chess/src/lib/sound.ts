// Short synthesized board sounds (no audio files needed).
let ctx: AudioContext | null = null;
let muted = (() => { try { return localStorage.getItem('cl.muted') === '1'; } catch { return false; } })();

export function isMuted() { return muted; }
export function setMuted(v: boolean) {
  muted = v;
  try { localStorage.setItem('cl.muted', v ? '1' : '0'); } catch { /* private mode */ }
}

type Kind = 'move' | 'move-opp' | 'capture' | 'check' | 'correct' | 'wrong' | 'success' | 'start';

function tone(freq: number, start: number, dur: number, type: OscillatorType, gain: number) {
  if (!ctx) return;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, ctx.currentTime + start);
  g.gain.setValueAtTime(gain, ctx.currentTime + start);
  g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + start + dur);
  o.connect(g).connect(ctx.destination);
  o.start(ctx.currentTime + start);
  o.stop(ctx.currentTime + start + dur + 0.02);
}

function knock(start: number, freq: number, gain: number) {
  if (!ctx) return;
  const len = Math.floor(ctx.sampleRate * 0.06);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 6);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const f = ctx.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = freq;
  f.Q.value = 1.2;
  const g = ctx.createGain();
  g.gain.value = gain;
  src.connect(f).connect(g).connect(ctx.destination);
  src.start(ctx.currentTime + start);
}

export function playSound(kind: Kind) {
  if (muted) return;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
  } catch { return; }
  switch (kind) {
    case 'move': knock(0, 900, 2.2); break;
    case 'move-opp': knock(0, 700, 2.2); break;
    case 'capture': knock(0, 600, 2.6); knock(0.035, 1100, 1.6); break;
    case 'check': knock(0, 800, 2); tone(880, 0.01, 0.12, 'triangle', 0.08); break;
    case 'correct': tone(660, 0, 0.12, 'sine', 0.12); tone(990, 0.08, 0.16, 'sine', 0.1); break;
    case 'wrong': tone(220, 0, 0.22, 'square', 0.05); break;
    case 'success': [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.08, 0.2, 'sine', 0.1)); break;
    case 'start': tone(440, 0, 0.1, 'sine', 0.08); tone(660, 0.1, 0.12, 'sine', 0.08); break;
  }
}
