// Explicaciones en lenguaje simple de cada jugada (sin DOM, testeable).
import { Chess } from 'chess.js';
import { toWhite } from './analysis.js';

export const PIECE = { p: 'peón', n: 'caballo', b: 'alfil', r: 'torre', q: 'dama', k: 'rey' };
const UN = { p: 'un peón', n: 'un caballo', b: 'un alfil', r: 'una torre', q: 'la dama', k: 'el rey' };

/** Jugada de chess.js a partir de una UCI, o null si no es legal. */
export function uciMove(fen, uci) {
  if (!uci) return null;
  try {
    return new Chess(fen).move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
  } catch {
    return null;
  }
}

/** La evaluación en palabras, desde el punto de vista de las blancas. */
export function evalWords(scoreWhite) {
  if (!scoreWhite) return '';
  if (scoreWhite.mate === 0) return scoreWhite.whiteMated ? 'Ganaron las negras' : 'Ganaron las blancas';
  if (scoreWhite.mate != null) {
    const who = scoreWhite.mate > 0 ? 'las blancas' : 'las negras';
    return `Mate en ${Math.abs(scoreWhite.mate)} para ${who}`;
  }
  const cp = scoreWhite.cp;
  const who = cp > 0 ? 'las blancas' : 'las negras';
  const a = Math.abs(cp);
  if (a < 35) return 'Posición igualada';
  if (a < 110) return `Ligera ventaja de ${who}`;
  if (a < 300) return `Ventaja clara de ${who}`;
  return `Ganan ${who}`;
}

/** Qué hace una jugada, en una frase corta ("Come un caballo y da jaque."). */
export function whatItDoes(m) {
  if (!m) return '';
  if (m.san.includes('#')) return '¡Jaque mate!';
  const parts = [];
  if (m.isKingsideCastle?.() || m.isQueensideCastle?.()) parts.push('Enroca y pone el rey a salvo');
  if (m.promotion) parts.push(`Corona ${m.promotion === 'q' ? 'una dama' : `${UN[m.promotion]}`}`);
  if (m.captured) parts.push(`Come ${UN[m.captured]}`);
  if (m.san.includes('+')) parts.push(parts.length ? 'da jaque' : 'Da jaque');
  return parts.length ? `${parts.join(' y ')}.` : '';
}

/**
 * Frases que explican la jugada `move` (índice i) con su resultado `r`.
 * Devuelve { why, better } en texto plano (los SAN no llevan caracteres HTML).
 */
export function explainMove(move, r, pre, post, opening) {
  const out = { why: '', better: '' };
  const best = uciMove(pre.fen, r.bestUci);
  const bad = ['inaccuracy', 'mistake', 'blunder', 'miss'].includes(r.cls);

  if (r.cls === 'book') {
    out.why = opening ? `Es una jugada conocida de la apertura ${opening}.` : 'Es una jugada conocida de la teoría de aperturas.';
    return out;
  }
  if (r.cls === 'forced') {
    out.why = 'No había otra jugada legal.';
    return out;
  }
  if (r.cls === 'brilliant') {
    out.why = `${whatItDoes(move)} Entrega material, pero el motor confirma que funciona.`.trim();
    return out;
  }
  if (r.cls === 'great') {
    const keep = r.winAfter >= 60 ? 'la ventaja' : r.winAfter >= 40 ? 'el equilibrio' : 'la defensa';
    out.why = `Era la única jugada que mantenía ${keep}. ${whatItDoes(move)}`.trim();
    return out;
  }
  if (r.cls === 'best' || r.cls === 'excellent') {
    out.why = whatItDoes(move);
    return out;
  }

  // Lo que hacía la mejor jugada.
  if (best) {
    const bs = pre.lines?.[0]?.score;
    if (bs?.mate > 0) out.better = `Con ${best.san} tenías mate en ${bs.mate}.`;
    else if (best.captured) out.better = `${best.san} ganaba ${UN[best.captured]}.`;
    else if (r.cls === 'miss') out.better = `${best.san} aprovechaba el error del rival.`;
    else out.better = `Lo mejor era ${best.san}.`;
  }
  if (r.cls === 'good') {
    out.why = `Está bien, pero ${best ? best.san : 'otra jugada'} era un poco mejor.`;
    out.better = '';
    return out;
  }
  if (!bad) return out;

  // Qué le permite al rival.
  if (post.terminal) return out;
  const replyUci = post.lines?.[0]?.pv?.[0];
  const reply = uciMove(post.fen, replyUci);
  const ps = post.lines?.[0]?.score;
  if (ps?.mate > 0) {
    out.why = `Ahora el rival tiene mate en ${ps.mate}${reply ? `, empezando por ${reply.san}` : ''}.`;
  } else if (reply?.captured && reply.captured !== 'p') {
    out.why = `Ahora el rival puede comer tu ${PIECE[reply.captured]} con ${reply.san}.`;
  } else if (r.cls === 'miss') {
    out.why = 'El rival se acababa de equivocar y esta jugada lo deja escapar.';
  } else if (reply) {
    out.why = `La respuesta fuerte del rival es ${reply.san}.`;
  }
  return out;
}

/** "Antes → Después" en palabras, para el bando que movió. */
export function swingWords(pre, post, bestScoreFn) {
  const a = toWhite(bestScoreFn(pre), pre.fen);
  const b = toWhite(bestScoreFn(post), post.fen);
  return { before: evalWords(a), after: evalWords(b) };
}
