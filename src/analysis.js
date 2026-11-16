// Núcleo del análisis: probabilidad de ganar, precisión y clasificación de jugadas.
// Es código puro (sin DOM) para poder testearlo con node --test.
import { Chess } from 'chess.js';

export const CLASSES = {
  brilliant: { label: 'Brillante', symbol: '!!', color: '#26c2a3' },
  great: { label: 'Gran jugada', symbol: '!', color: '#5c8fe0' },
  best: { label: 'Mejor', symbol: '★', color: '#7cbf4b' },
  excellent: { label: 'Excelente', symbol: '✓', color: '#9bc25a' },
  good: { label: 'Buena', symbol: '✓', color: '#93a88a' },
  book: { label: 'Teoría', symbol: '≡', color: '#b08c64' },
  forced: { label: 'Forzada', symbol: '→', color: '#8a9099' },
  inaccuracy: { label: 'Imprecisión', symbol: '?!', color: '#f2c14e' },
  mistake: { label: 'Error', symbol: '?', color: '#ef8f2f' },
  miss: { label: 'Oportunidad perdida', symbol: '×', color: '#f2706a' },
  blunder: { label: 'Error grave', symbol: '??', color: '#d63b36' },
};

export const SUMMARY_ORDER = [
  'brilliant', 'great', 'best', 'excellent', 'good', 'book', 'forced',
  'inaccuracy', 'mistake', 'miss', 'blunder',
];

const VALUE = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

/** Probabilidad de ganar (0-100) para el bando cuyo punto de vista tiene `score`. */
export function winPct(score) {
  if (!score) return 50;
  if (score.mate != null) return score.mate > 0 ? 100 : 0;
  const cp = Math.max(-1000, Math.min(1000, score.cp));
  return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * cp)) - 1);
}

/** Precisión de una jugada (0-100) según cuánto bajó la probabilidad de ganar. */
export function moveAccuracy(winBefore, winAfter) {
  const loss = Math.max(0, winBefore - winAfter);
  const acc = 103.1668 * Math.exp(-0.04354 * loss) - 3.1669;
  return Math.max(0, Math.min(100, acc));
}

export const negate = (s) => (s.mate != null ? { mate: -s.mate } : { cp: -s.cp });

/** Texto de evaluación desde el punto de vista de las blancas. */
export function formatScore(scoreWhite) {
  if (!scoreWhite) return '';
  if (scoreWhite.mate != null) {
    if (scoreWhite.mate === 0) return '#';
    return (scoreWhite.mate > 0 ? 'M' : '-M') + Math.abs(scoreWhite.mate);
  }
  const v = scoreWhite.cp / 100;
  return (v > 0 ? '+' : '') + v.toFixed(Math.abs(v) >= 10 ? 0 : 1);
}

/**
 * Evaluación de una posición ya terminada (mate / tablas) sin preguntar al motor.
 * Devuelve null si la partida sigue.
 */
export function terminalScore(fen) {
  const c = new Chess(fen);
  if (c.isCheckmate()) return { mate: 0 }; // el que mueve está mateado
  if (c.isStalemate() || c.isInsufficientMaterial()) return { cp: 0 };
  return null;
}

/** Puntaje de la mejor línea desde el punto de vista del bando que mueve. */
export function bestScore(pos) {
  if (!pos) return null;
  if (pos.terminal) return pos.terminal;
  return pos.lines?.[0]?.score ?? null;
}

/** Convierte un puntaje "del que mueve" a "de las blancas". */
export function toWhite(score, fen) {
  if (!score) return null;
  const white = fen.split(' ')[1] === 'w';
  if (score.mate === 0) return { mate: 0, whiteMated: white };
  return white ? score : negate(score);
}

export function whiteWinPct(pos) {
  const s = bestScore(pos);
  if (!s) return null;
  const stmWin = winPct(s);
  return pos.fen.split(' ')[1] === 'w' ? stmWin : 100 - stmWin;
}

/**
 * ¿La jugada deja material colgando a propósito? Mira las capturas legales del
 * rival después de la jugada y si alguna le gana ≥2 puntos de material neto.
 */
export function isSacrifice(move) {
  const after = new Chess(move.after);
  const me = move.color;
  const gained = move.captured ? VALUE[move.captured] : 0;
  for (const cap of after.moves({ verbose: true })) {
    if (!cap.captured) continue;
    let victim = VALUE[cap.captured];
    if (cap.to === move.to && move.promotion) victim = 1; // coronar y que te la coman = un peón
    if (victim < 3) continue;
    const attacker = VALUE[cap.piece];
    after.move(cap);
    const recapture = after.moves({ verbose: true }).some((m) => m.to === cap.to && m.color === me);
    after.undo();
    const net = victim - (recapture ? attacker : 0) - gained;
    if (net >= 2) return true;
  }
  return false;
}

/** Recaptura obvia: comer en la casilla donde el rival acaba de comer. */
function isRecapture(move, prevMove) {
  return !!(prevMove && prevMove.captured && move.captured && prevMove.to === move.to);
}

/**
 * Clasifica todas las jugadas que ya tienen análisis de la posición anterior y posterior.
 * @param moves   jugadas verbose de chess.js (con before/after/lan…)
 * @param positions positions[i] = { fen, lines:[{score,pv}], terminal, legalCount } para i = 0..N
 * @param book    book[i] = true si la jugada i (0-index) es teoría
 */
export function classifyMoves(moves, positions, book = []) {
  const out = [];
  for (let i = 0; i < moves.length; i++) {
    const move = moves[i];
    const pre = positions[i];
    const post = positions[i + 1];
    const sBefore = bestScore(pre);
    const sAfterOpp = bestScore(post);
    if (!sBefore || !sAfterOpp) {
      out.push(null);
      continue;
    }
    const winBefore = winPct(sBefore);
    const winAfter = 100 - winPct(sAfterOpp);
    const bestUci = pre.lines?.[0]?.pv?.[0];
    const isBest = bestUci === move.lan;
    let loss = isBest ? 0 : Math.max(0, winBefore - winAfter);
    // Si la jugada es la del motor pero a más profundidad se ve distinto, no la castigamos.
    const accuracy = moveAccuracy(winBefore, winBefore - loss);

    let cls;
    if (pre.legalCount === 1) cls = 'forced';
    else if (book[i]) cls = 'book';
    else if (isBest || loss < 0.5) cls = 'best';
    else if (loss < 2) cls = 'excellent';
    else if (loss < 5) cls = 'good';
    else if (loss < 10) cls = 'inaccuracy';
    else if (loss < 20) cls = 'mistake';
    else cls = 'blunder';

    const prev = out[i - 1];
    // Oportunidad perdida: el rival se equivocó y no lo aprovechaste.
    if (
      ['inaccuracy', 'mistake', 'blunder'].includes(cls) &&
      prev && ['mistake', 'blunder', 'miss'].includes(prev.cls) &&
      loss >= 10 && winBefore >= 60 && winAfter >= 30
    ) {
      cls = 'miss';
    }

    if (cls === 'best' || cls === 'excellent') {
      const second = pre.lines?.[1]?.score;
      // Brillante: sacrificio que funciona, sin estar ya completamente ganado.
      if (winAfter >= 45 && winBefore < 97 && isSacrifice(move)) {
        cls = 'brilliant';
      } else if (
        isBest && second && pre.legalCount > 1 && !new Chess(move.before).inCheck() &&
        winPct(sBefore) - winPct(second) >= 15 &&
        winBefore >= 25 && winBefore < 97 &&
        !isRecapture(move, moves[i - 1])
      ) {
        // Gran jugada: la única que sostiene la posición.
        cls = 'great';
      }
    }

    out.push({ cls, loss, accuracy, winBefore, winAfter, bestUci, isBest, color: move.color });
  }
  return out;
}

function stdDev(arr) {
  const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
  return Math.sqrt(arr.reduce((a, b) => a + (b - mean) ** 2, 0) / arr.length);
}

/**
 * Precisión de la partida por bando (igual que el método de lichess: media
 * ponderada por volatilidad + media armónica).
 * @param whiteWins probabilidad de ganar de las blancas para cada posición 0..N
 * @param results  salida de classifyMoves
 */
export function gameAccuracy(whiteWins, results) {
  const n = results.length;
  if (n < 2 || whiteWins.some((w) => w == null) || results.some((r) => !r)) return null;
  const windowSize = Math.max(2, Math.min(8, Math.floor(n / 10)));
  const windows = [];
  for (let i = 0; i < Math.min(windowSize - 2, whiteWins.length); i++) {
    windows.push(whiteWins.slice(0, windowSize));
  }
  for (let i = 0; i + windowSize <= whiteWins.length; i++) {
    windows.push(whiteWins.slice(i, i + windowSize));
  }
  const weights = windows.map((w) => Math.max(0.5, Math.min(12, stdDev(w))));
  const per = { w: [], b: [] };
  results.forEach((r, i) => {
    const color = r.color;
    per[color].push({ acc: r.accuracy, weight: weights[i] ?? weights[weights.length - 1] });
  });
  const calc = (list) => {
    if (!list.length) return null;
    const wSum = list.reduce((a, x) => a + x.weight, 0);
    const weighted = list.reduce((a, x) => a + x.acc * x.weight, 0) / wSum;
    const harmonic = list.length / list.reduce((a, x) => a + 1 / Math.max(x.acc, 1), 0);
    return (weighted + harmonic) / 2;
  };
  return { w: calc(per.w), b: calc(per.b) };
}

/** Pasa una línea UCI a SAN partiendo de una FEN. */
export function pvToSan(fen, pv, max = 8) {
  const c = new Chess(fen);
  const out = [];
  for (const uci of pv.slice(0, max)) {
    try {
      const m = c.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
      out.push(m.san);
    } catch {
      break;
    }
  }
  return out;
}
