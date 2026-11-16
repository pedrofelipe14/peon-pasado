// Integración: corre Stockfish (lite) de verdad sobre el mate del pastor.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { Chess } from 'chess.js';
import { classifyMoves, terminalScore } from '../src/analysis.js';

const require = createRequire(import.meta.url);

function analyze(engine, fen, depth) {
  return new Promise((resolve) => {
    const lines = [];
    engine.onLine = (line) => {
      if (line.startsWith('info') && line.includes(' pv ') && !line.includes('bound')) {
        const t = line.split(' ');
        const at = (k) => t.indexOf(k);
        const mpv = at('multipv') >= 0 ? +t[at('multipv') + 1] : 1;
        const kind = t[at('score') + 1];
        const val = +t[at('score') + 2];
        lines[mpv - 1] = { score: kind === 'mate' ? { mate: val } : { cp: val }, pv: t.slice(at('pv') + 1) };
      }
      if (line.startsWith('bestmove')) resolve(lines.filter(Boolean));
    };
    engine.sf.processCommand(`position fen ${fen}`);
    engine.sf.processCommand(`go depth ${depth}`);
  });
}

test('Stockfish clasifica el mate del pastor', { timeout: 120000 }, async () => {
  const engine = { onLine: null };
  await new Promise((resolve) => {
    engine.sf = require('stockfish')('lite-single', (line) => {
      if (line === 'uciok') resolve();
      engine.onLine?.(line);
    });
    engine.sf.processCommand('uci');
  });
  engine.sf.processCommand('setoption name MultiPV value 2');

  const c = new Chess();
  c.loadPgn('1. e4 e5 2. Bc4 Nc6 3. Qh5 Nf6 4. Qxf7#');
  const moves = c.history({ verbose: true });
  const pos = [moves[0].before, ...moves.map((m) => m.after)].map((fen) => ({
    fen, legalCount: new Chess(fen).moves().length, terminal: terminalScore(fen), lines: null,
  }));
  for (const p of pos) if (!p.terminal) p.lines = await analyze(engine, p.fen, 12);
  engine.sf.terminate?.();

  const r = classifyMoves(moves, pos, [true, true]);
  assert.equal(r[5].cls, 'blunder', `Nf6 debería ser error grave, fue ${r[5].cls}`);
  assert.equal(r[6].cls, 'best');
  assert.deepEqual(pos[6].lines[0].score, { mate: 1 });
});
