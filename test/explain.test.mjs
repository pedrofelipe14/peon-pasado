import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Chess } from 'chess.js';
import { classifyMoves, terminalScore } from '../src/analysis.js';
import { explainMove, evalWords, whatItDoes } from '../src/explain.js';

const setup = (pgn) => {
  const c = new Chess();
  c.loadPgn(pgn);
  const moves = c.history({ verbose: true });
  const pos = [moves[0].before, ...moves.map((m) => m.after)].map((fen) => ({
    fen, legalCount: new Chess(fen).moves().length, terminal: terminalScore(fen), lines: null,
  }));
  return { moves, pos };
};

test('evalWords', () => {
  assert.equal(evalWords({ cp: 10 }), 'Posición igualada');
  assert.equal(evalWords({ cp: 80 }), 'Ligera ventaja de las blancas');
  assert.equal(evalWords({ cp: -200 }), 'Ventaja clara de las negras');
  assert.equal(evalWords({ cp: 900 }), 'Ganan las blancas');
  assert.equal(evalWords({ mate: -3 }), 'Mate en 3 para las negras');
});

test('whatItDoes', () => {
  const { moves } = setup('1. e4 d5 2. exd5 Qxd5 3. Nc3 Qe5+ 4. Be2 Qxe2#');
  assert.equal(whatItDoes(moves[2]), 'Come un peón.');
  assert.equal(whatItDoes(moves[5]), 'Da jaque.');
  assert.equal(whatItDoes(moves.at(-1)), 'Come un alfil y da jaque.');
  assert.equal(whatItDoes(setup('1. f3 e5 2. g4 Qh4#').moves.at(-1)), '¡Jaque mate!');
});

test('explica el error grave del mate del pastor y la mejor jugada', () => {
  const { moves, pos } = setup('1. e4 e5 2. Bc4 Nc6 3. Qh5 Nf6');
  const S = (cp, pv) => [{ score: { cp }, pv }];
  pos[0].lines = S(30, ['e2e4']);
  pos[1].lines = S(-30, ['e7e5']);
  pos[2].lines = S(30, ['g1f3']);
  pos[3].lines = S(-20, ['b8c6']);
  pos[4].lines = S(20, ['g1f3']);
  pos[5].lines = S(-10, ['g7g6', 'h5f3']);
  pos[6].lines = [{ score: { mate: 1 }, pv: ['h5f7'] }];
  const r = classifyMoves(moves, pos);
  assert.equal(r[5].cls, 'blunder');
  const ex = explainMove(moves[5], r[5], pos[5], pos[6]);
  assert.equal(ex.why, 'Ahora el rival tiene mate en 1, empezando por Qxf7#.');
  assert.equal(ex.better, 'Lo mejor era g6.');
});

test('avisa cuando dejas una pieza colgada', () => {
  const { moves, pos } = setup('1. e4 e5 2. Nf3 Nc6 3. Ng5');
  pos[4].lines = [{ score: { cp: 20 }, pv: ['f1c4'] }];
  pos[5].lines = [{ score: { cp: 250 }, pv: ['d8g5'] }];
  const r = classifyMoves(moves, pos);
  const ex = explainMove(moves[4], r[4], pos[4], pos[5]);
  assert.equal(ex.why, 'Ahora el rival puede comer tu caballo con Qxg5.');
});
