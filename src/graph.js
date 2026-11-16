// Gráfico de la evaluación a lo largo de la partida (canvas).
import { CLASSES, whiteWinPct } from './analysis.js';

const MARK = new Set(['brilliant', 'great', 'miss', 'mistake', 'blunder']);
const PAD = 6;

function xOf(i, n, w) {
  return n <= 0 ? 0 : PAD + (i / n) * (w - PAD * 2);
}

export function drawGraph(canvas, state) {
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  if (!w || !h) return;
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
  }
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const css = getComputedStyle(canvas);
  const dark = css.getPropertyValue('--graph-dark').trim() || '#2a2f36';
  const light = css.getPropertyValue('--graph-light').trim() || '#e9e6dd';
  const accent = css.getPropertyValue('--accent').trim() || '#7cbf4b';

  ctx.fillStyle = dark;
  ctx.fillRect(0, 0, w, h);
  const n = state.positions.length - 1;
  const wins = state.positions.map(whiteWinPct);
  const yOf = (pct) => h - (pct / 100) * h;
  const flip = state.orientation === 'black';
  const Y = (pct) => yOf(flip ? 100 - pct : pct);

  // área de las blancas (abajo si se ve desde las blancas)
  ctx.beginPath();
  ctx.moveTo(0, flip ? 0 : h);
  let last = 50;
  for (let i = 0; i <= n; i++) {
    const v = wins[i] ?? last;
    last = v;
    ctx.lineTo(xOf(i, n, w), Y(v));
  }
  ctx.lineTo(w, Y(last));
  ctx.lineTo(w, flip ? 0 : h);
  ctx.closePath();
  ctx.fillStyle = light;
  ctx.fill();

  ctx.strokeStyle = 'rgba(128,128,128,.45)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, h / 2);
  ctx.lineTo(w, h / 2);
  ctx.stroke();

  // jugada actual
  const cx = xOf(state.ply, n, w);
  ctx.strokeStyle = accent;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx, 0);
  ctx.lineTo(cx, h);
  ctx.stroke();

  // marcas de jugadas importantes
  state.results.forEach((r, i) => {
    if (!r || !MARK.has(r.cls) || wins[i + 1] == null) return;
    ctx.beginPath();
    ctx.arc(xOf(i + 1, n, w), Y(wins[i + 1]), 4, 0, Math.PI * 2);
    ctx.fillStyle = CLASSES[r.cls].color;
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = 'rgba(0,0,0,.5)';
    ctx.stroke();
  });
}

export function graphPlyAt(canvas, state, clientX) {
  const n = state.positions.length - 1;
  if (n <= 0) return null;
  const rect = canvas.getBoundingClientRect();
  const x = clientX - rect.left;
  return Math.round(((x - PAD) / (rect.width - PAD * 2)) * n);
}
