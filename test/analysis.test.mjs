import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Chess } from 'chess.js';
import { winPct, moveAccuracy, classifyMoves, isSacrifice, formatScore, terminalScore, gameAccuracy, pvToSan } from '../src/analysis.js';

const movesOf = (pgn) => { const c = new Chess(); c.loadPgn(pgn); return c.history({ verbose: true }); };
const posFor = (moves) => [moves[0].before, ...moves.map((m) => m.after)].map((fen) => ({
  fen, legalCount: new Chess(fen).moves().length, terminal: terminalScore(fen), lines: null,
}));

test('winPct es simétrica y satura', () => {
  assert.equal(winPct({ cp: 0 }), 50);
  assert.ok(Math.abs(winPct({ cp: 300 }) + winPct({ cp: -300 }) - 100) < 1e-9);
  assert.equal(winPct({ mate: 3 }), 100);
  assert.equal(winPct({ mate: -2 }), 0);
  assert.equal(winPct({ mate: 0 }), 0);
});

test('precisión: 100 sin pérdida, baja con la pérdida', () => {
  assert.ok(moveAccuracy(60, 60) > 99.9);
  assert.ok(moveAccuracy(60, 40) < 50);
  assert.equal(moveAccuracy(90, 0), 0);
});

test('formatScore', () => {
  assert.equal(formatScore({ cp: 123 }), '+1.2');
  assert.equal(formatScore({ cp: -50 }), '-0.5');
  assert.equal(formatScore({ mate: 2 }), 'M2');
  assert.equal(formatScore({ mate: -4 }), '-M4');
});

test('terminalScore detecta mate y ahogado', () => {
  const m = movesOf('1. f3 e5 2. g4 Qh4#');
  assert.deepEqual(terminalScore(m.at(-1).after), { mate: 0 });
  assert.deepEqual(terminalScore('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1'), { cp: 0 });
  assert.equal(terminalScore(m[0].after), null);
});

test('sacrificio: Bxh7+ del sacrificio griego', () => {
  const moves = movesOf('1. e4 e6 2. d4 d5 3. Nc3 Nf6 4. e5 Nfd7 5. Bd3 Be7 6. Nf3 O-O 7. Bxh7+');
  assert.equal(isSacrifice(moves.at(-1)), true);
  const quiet = movesOf('1. e4 e5 2. Nf3');
  assert.equal(isSacrifice(quiet.at(-1)), false);
  // cambio parejo (alfil por caballo) no es sacrificio
  const trade = movesOf('1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Bxc6');
  assert.equal(isSacrifice(trade.at(-1)), false);
});

test('clasificación: mejor, error grave, forzada', () => {
  const moves = movesOf('1. e4 e5 2. Bc4 Nc6 3. Qh5 Nf6 4. Qxf7#');
  const pos = posFor(moves);
  const S = (cp, pv) => [{ score: { cp }, pv: [pv] }];
  pos[0].lines = S(30, 'e2e4');
  pos[1].lines = S(-30, 'e7e5');
  pos[2].lines = S(30, 'g1f3');
  pos[3].lines = S(-20, 'b8c6');
  pos[4].lines = S(20, 'g1f3');
  pos[5].lines = S(-10, 'g7g6');
  pos[6].lines = [{ score: { mate: 1 }, pv: ['h5f7'] }];
  const r = classifyMoves(moves, pos, [true, true]);
  assert.equal(r[0].cls, 'book');
  assert.equal(r[1].cls, 'book');
  assert.equal(r[2].cls, 'excellent'); // Bc4 en vez de Nf3: pierde muy poco
  assert.equal(r[3].cls, 'best');
  assert.equal(r[5].cls, 'blunder'); // Nf6?? permite mate
  assert.equal(r[6].cls, 'best');
  assert.equal(r[6].winAfter, 100);
});

test('precisión de la partida queda en 0..100 y premia al que juega mejor', () => {
  const results = [];
  const wins = [50];
  for (let i = 0; i < 30; i++) {
    const white = i % 2 === 0;
    results.push({ accuracy: white ? 95 : 60, color: white ? 'w' : 'b' });
    wins.push(50 + i);
  }
  const a = gameAccuracy(wins, results);
  assert.ok(a.w > a.b);
  assert.ok(a.w <= 100 && a.b >= 0);
});

test('pvToSan', () => {
  assert.deepEqual(pvToSan(new Chess().fen(), ['e2e4', 'e7e5', 'g1f3']), ['e4', 'e5', 'Nf3']);
  assert.deepEqual(pvToSan(new Chess().fen(), ['e2e4', 'zzzz']), ['e4']);
});
