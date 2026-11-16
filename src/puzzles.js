// Ejercicios: lógica pura (sin DOM). Sirve para los de lichess y para los
// que salen de los errores de tus propias partidas.
import { Chess } from 'chess.js';
import { winPct } from './analysis.js';

export const THEMES = [
  ['mix', 'Mezcla'],
  ['mateIn1', 'Mate en 1'],
  ['mateIn2', 'Mate en 2'],
  ['mateIn3', 'Mate en 3'],
  ['fork', 'Ataque doble'],
  ['pin', 'Clavada'],
  ['skewer', 'Pincho'],
  ['discoveredAttack', 'Ataque a la descubierta'],
  ['hangingPiece', 'Pieza colgada'],
  ['sacrifice', 'Sacrificio'],
  ['deflection', 'Desviación'],
  ['trappedPiece', 'Pieza atrapada'],
  ['backRankMate', 'Mate del pasillo'],
  ['smotheredMate', 'Mate de la coz'],
  ['anastasiaMate', 'Mate de Anastasia'],
  ['arabianMate', 'Mate árabe'],
  ['bodenMate', 'Mate de Boden'],
  ['opening', 'Apertura'],
  ['middlegame', 'Medio juego'],
  ['endgame', 'Final'],
];

const THEME_NAMES = {
  ...Object.fromEntries(THEMES),
  short: 'Corto', long: 'Largo', veryLong: 'Muy largo', oneMove: 'Una jugada', mate: 'Mate',
  crushing: 'Aplastante', advantage: 'Ventaja', equality: 'Igualdad', master: 'Partida de maestro',
  kingsideAttack: 'Ataque al flanco de rey', queensideAttack: 'Ataque al flanco de dama',
  attraction: 'Atracción', defensiveMove: 'Jugada defensiva', quietMove: 'Jugada tranquila',
  intermezzo: 'Jugada intermedia', clearance: 'Despeje', interference: 'Interferencia',
  xRayAttack: 'Rayos X', zugzwang: 'Zugzwang', promotion: 'Coronación', underPromotion: 'Subcoronación',
  enPassant: 'Al paso', castling: 'Enroque', capturingDefender: 'Eliminar al defensor',
  exposedKing: 'Rey expuesto', doubleCheck: 'Jaque doble',
  hookMate: 'Mate del gancho', dovetailMate: 'Mate de la cola de golondrina', mateIn4: 'Mate en 4',
  mateIn5: 'Mate en 5', rookEndgame: 'Final de torres', pawnEndgame: 'Final de peones',
  bishopEndgame: 'Final de alfiles', knightEndgame: 'Final de caballos', queenEndgame: 'Final de damas',
  queenRookEndgame: 'Final de dama y torre', advancedPawn: 'Peón avanzado', masterVsMaster: 'Maestro contra maestro',
  superGM: 'Súper GM', doubleBishopMate: 'Mate con dos alfiles', killBoxMate: 'Mate de la caja',
  vukovicMate: 'Mate de Vukovic', balestraMate: 'Mate de ballesta', blindSwineMate: 'Mate de los cerdos ciegos',
  cornerMate: 'Mate en la esquina', epauletteMate: 'Mate de las charreteras', triangleMate: 'Mate del triángulo',
};
export const themeName = (t) => THEME_NAMES[t] ?? t;

/** Ejercicio de la API de lichess -> formato interno. */
export function fromLichess(json) {
  const sans = json.game.pgn.trim().split(/\s+/);
  const c = new Chess();
  sans.slice(0, -1).forEach((s) => c.move(s));
  const fenBefore = c.fen();
  const last = c.move(sans.at(-1));
  const white = json.game.players.find((p) => p.color === 'white');
  const black = json.game.players.find((p) => p.color === 'black');
  return {
    id: `li:${json.puzzle.id}`,
    source: 'lichess',
    fenBefore,
    lastMove: last.lan,
    fen: c.fen(),
    solution: json.puzzle.solution,
    alternatives: [],
    rating: json.puzzle.rating,
    themes: json.puzzle.themes,
    url: `https://lichess.org/training/${json.puzzle.id}`,
    subtitle: `${white?.name ?? '?'} (${white?.rating ?? '?'}) vs ${black?.name ?? '?'} (${black?.rating ?? '?'})`,
  };
}

/**
 * Convierte los errores de una partida analizada en ejercicios de una jugada.
 * @param onlyColor 'w' | 'b' | null — si sabemos quién eres, solo tus errores
 */
export function mistakesFromGame(moves, positions, results, { onlyColor = null, label = '' } = {}) {
  const out = [];
  results.forEach((r, i) => {
    if (!r || !['mistake', 'blunder', 'miss'].includes(r.cls)) return;
    if (onlyColor && r.color !== onlyColor) return;
    const pre = positions[i];
    const best = pre.lines?.[0];
    if (!best?.pv?.[0]) return;
    const bestWin = winPct(best.score);
    if (bestWin < 30) return; // estabas perdido de todos modos: no es buen ejercicio
    const alternatives = (pre.lines ?? []).slice(1)
      .filter((l) => l.pv?.[0] && winPct(l.score) >= bestWin - 3)
      .map((l) => l.pv[0]);
    const prev = moves[i - 1];
    out.push({
      id: `me:${hash(pre.fen + best.pv[0])}`,
      source: 'mine',
      fenBefore: prev ? prev.before : null,
      lastMove: prev ? prev.lan : null,
      fen: pre.fen,
      solution: [best.pv[0]],
      alternatives,
      mateIn: best.score.mate > 0 ? best.score.mate : null,
      played: moves[i].san,
      cls: r.cls,
      subtitle: label,
      themes: [],
    });
  });
  return out;
}

function hash(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0).toString(36);
}

/**
 * Sesión de un ejercicio. Lleva el paso actual de la solución y decide si cada
 * jugada del usuario es correcta.
 */
export class PuzzleRun {
  constructor(puzzle) {
    this.p = puzzle;
    this.chess = new Chess(puzzle.fen);
    this.step = 0; // índice en solution de la próxima jugada esperada
    this.mistakes = 0;
    this.hinted = false;
    this.revealed = false;
  }

  get color() {
    return new Chess(this.p.fen).turn();
  }
  get fen() {
    return this.chess.fen();
  }
  get done() {
    return this.step >= this.p.solution.length;
  }
  get expected() {
    return this.p.solution[this.step];
  }

  /** ¿Jugada legal? Devuelve el objeto de chess.js o null. */
  legal(uci) {
    try {
      const c = new Chess(this.fen);
      return c.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] || 'q' });
    } catch {
      return null;
    }
  }

  /**
   * El usuario juega `uci`. Devuelve:
   *  { ok: true, reply?: uci, done } si estuvo bien (y la respuesta del rival si sigue)
   *  { ok: false } si no.
   */
  play(uci) {
    const exp = this.expected;
    const m = this.legal(uci.length === 4 && exp?.startsWith(uci) ? exp : uci);
    if (!m) return { ok: false, illegal: true };
    const isLastMove = this.step === this.p.solution.length - 1;
    const correct = m.lan === exp
      || (this.step === 0 && this.p.alternatives?.includes(m.lan))
      || (isLastMove && m.san.includes('#'));
    if (!correct) {
      this.mistakes++;
      return { ok: false, san: m.san };
    }
    this.chess.move(m.san);
    if (m.lan !== exp) {
      // Alternativa válida: la solución termina acá.
      this.step = this.p.solution.length;
      return { ok: true, san: m.san, done: true };
    }
    this.step++;
    if (this.done) return { ok: true, san: m.san, done: true };
    const reply = this.p.solution[this.step];
    const r = this.chess.move({ from: reply.slice(0, 2), to: reply.slice(2, 4), promotion: reply[4] });
    this.step++;
    return { ok: true, san: m.san, reply, replySan: r.san, done: this.done };
  }

  /** Juega la próxima jugada de la solución (y la respuesta) para "ver solución". */
  advance() {
    if (this.done) return null;
    const uci = this.expected;
    const m = this.chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
    this.step++;
    return { uci, san: m.san };
  }

  get solved() {
    return this.done && this.mistakes === 0 && !this.revealed;
  }
}

/** Rating tipo Elo para los ejercicios. */
export function updateRating(rating, puzzleRating, won, games = 0) {
  const k = games < 20 ? 40 : 20;
  const expected = 1 / (1 + 10 ** ((puzzleRating - rating) / 400));
  return Math.round(rating + k * ((won ? 1 : 0) - expected));
}
