// Sonidos del tablero, sintetizados con WebAudio (sin archivos de audio).
import { Chess } from 'chess.js';

const KEY = 'pp:sound';
let enabled = (() => {
  try {
    return localStorage.getItem(KEY) !== '0';
  } catch {
    return true;
  }
})();

export const soundOn = () => enabled;
export function setSound(on) {
  enabled = on;
  try {
    localStorage.setItem(KEY, on ? '1' : '0');
  } catch {}
}

let ac = null;
let master = null;
let noiseBuf = null;

function audio() {
  if (!enabled) return null;
  try {
    if (!ac) {
      ac = new (window.AudioContext || window.webkitAudioContext)();
      master = ac.createGain();
      master.gain.value = 0.7;
      master.connect(ac.destination);
      noiseBuf = ac.createBuffer(1, Math.floor(ac.sampleRate * 0.25), ac.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    if (ac.state === 'suspended') ac.resume();
    return ac;
  } catch {
    return null;
  }
}

function env(g, t, peak, decay) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + 0.003);
  g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
}

/** Golpe de madera: ruido filtrado + un tono grave corto. */
function knock(t, { freq = 1300, gain = 0.5, decay = 0.06, tone = 240 } = {}) {
  const n = ac.createBufferSource();
  n.buffer = noiseBuf;
  const bp = ac.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = freq;
  bp.Q.value = 1.4;
  const gn = ac.createGain();
  env(gn, t, gain, decay);
  n.connect(bp).connect(gn).connect(master);
  n.start(t);
  n.stop(t + decay + 0.02);

  const o = ac.createOscillator();
  o.type = 'sine';
  o.frequency.setValueAtTime(tone, t);
  o.frequency.exponentialRampToValueAtTime(tone * 0.7, t + decay);
  const go = ac.createGain();
  env(go, t, gain * 0.7, decay * 1.3);
  o.connect(go).connect(master);
  o.start(t);
  o.stop(t + decay * 1.3 + 0.02);
}

function chime(t, freqs, { gap = 0.09, dur = 0.35, gain = 0.18, type = 'triangle' } = {}) {
  freqs.forEach((f, i) => {
    const s = t + i * gap;
    const o = ac.createOscillator();
    o.type = type;
    o.frequency.value = f;
    const g = ac.createGain();
    env(g, s, gain, dur);
    o.connect(g).connect(master);
    o.start(s);
    o.stop(s + dur + 0.02);
  });
}

function play(fn) {
  const c = audio();
  if (!c) return;
  try {
    fn(c.currentTime + 0.005);
  } catch {}
}

const MOVE = { freq: 1400, gain: 0.45, decay: 0.05, tone: 260 };

export const sfx = {
  move: () => play((t) => knock(t, MOVE)),
  capture: () => play((t) => {
    knock(t, { freq: 850, gain: 0.65, decay: 0.08, tone: 170 });
    knock(t + 0.04, { freq: 1700, gain: 0.35, decay: 0.04, tone: 320 });
  }),
  castle: () => play((t) => {
    knock(t, MOVE);
    knock(t + 0.1, { ...MOVE, tone: 220 });
  }),
  check: () => play((t) => {
    knock(t, MOVE);
    chime(t + 0.01, [988], { dur: 0.22, gain: 0.12, type: 'square' });
  }),
  promote: () => play((t) => {
    knock(t, MOVE);
    chime(t + 0.03, [784, 1175], { gap: 0.07, dur: 0.25, gain: 0.13 });
  }),
  end: () => play((t) => chime(t + 0.08, [523, 659, 784, 1047], { gap: 0.1, dur: 0.6, gain: 0.16 })),
  good: () => play((t) => chime(t, [880, 1319], { gap: 0.08, dur: 0.3, gain: 0.14 })),
  error: () => play((t) => {
    chime(t, [196, 147], { gap: 0.11, dur: 0.22, gain: 0.12, type: 'sawtooth' });
  }),
};

/** Sonido para una jugada de chess.js (`after` = posición resultante). */
export function moveSound(m, after) {
  if (after?.isGameOver?.()) {
    (m.captured ? sfx.capture : sfx.move)();
    sfx.end();
  } else if (after?.inCheck?.()) sfx.check();
  else if (m.flags.includes('k') || m.flags.includes('q')) sfx.castle();
  else if (m.promotion) sfx.promote();
  else if (m.captured) sfx.capture();
  else sfx.move();
}

const board = (fen) => fen.split(' ').slice(0, 4).join(' ');

/**
 * Suena si el tablero pasó de `prev` a `fen` con una sola jugada
 * (hacia adelante con `lastUci`, o un paso hacia atrás). Si no, silencio.
 */
export function transitionSound(prev, fen, lastUci) {
  if (!enabled || !prev || !fen || board(prev) === board(fen)) return;
  if (lastUci) {
    try {
      const c = new Chess(prev);
      const m = c.move({ from: lastUci.slice(0, 2), to: lastUci.slice(2, 4), promotion: lastUci[4] || 'q' });
      if (board(c.fen()) === board(fen)) return moveSound(m, c);
    } catch {}
  }
  try {
    const c = new Chess(fen);
    for (const m of c.moves({ verbose: true })) {
      if (board(m.after) === board(prev)) return (m.captured ? sfx.capture : sfx.move)();
    }
  } catch {}
}
