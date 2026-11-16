import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Chess } from 'chess.js';
import { fromLichess, PuzzleRun, mistakesFromGame, updateRating, themeName } from '../src/puzzles.js';
import { classifyMoves, terminalScore } from '../src/analysis.js';

const json = JSON.parse(readFileSync(new URL('./fixtures/lichess-puzzle.json', import.meta.url)));

test('convierte un ejercicio de lichess', () => {
  const p = fromLichess(json);
  assert.equal(p.fen.split(' ')[0], json.puzzle.fen.split(' ')[0]);
  assert.equal(p.lastMove, json.puzzle.lastMove);
  assert.deepEqual(p.solution, ['b2h8', 'b8a7', 'h8a8']);
  assert.equal(new Chess(p.fenBefore).move({ from: 'b7', to: 'b8' }).after, p.fen);
  assert.equal(themeName('mateIn2'), 'Mate en 2');
});

test('resolver un mate en 2: error, acierto, respuesta del rival y final', () => {
  const run = new PuzzleRun(fromLichess(json));
  assert.equal(run.color, 'w');
  assert.equal(run.play('a1a2').illegal, true);
  const wrong = run.play('e4b7');
  assert.equal(wrong.ok, false);
  assert.equal(run.mistakes, 1);
  const first = run.play('b2h8');
  assert.equal(first.ok, true);
  assert.equal(first.reply, 'b8a7');
  assert.equal(first.done, false);
  const last = run.play('h8a8');
  assert.equal(last.ok, true);
  assert.equal(last.done, true);
  assert.equal(run.solved, false); // hubo un error antes
});

test('en la última jugada vale cualquier mate', () => {
  // mate en 1 con dos soluciones: Qa8# o Qh8#? usamos una posición con dos mates
  const p = { fen: '6k1/5ppp/8/8/8/8/5PPP/R3R1K1 w - - 0 1', solution: ['e1e8'], alternatives: [] };
  const run = new PuzzleRun(p);
  const r = run.play('a1a8');
  assert.equal(r.ok, true);
  assert.equal(run.solved, true);
});

test('los errores de una partida se vuelven ejercicios', () => {
  const c = new Chess();
  c.loadPgn('1. e4 e5 2. Bc4 Nc6 3. Qh5 Nf6');
  const moves = c.history({ verbose: true });
  const pos = [moves[0].before, ...moves.map((m) => m.after)].map((fen) => ({
    fen, legalCount: new Chess(fen).moves().length, terminal: terminalScore(fen), lines: null,
  }));
  const S = (cp, pv) => [{ score: { cp }, pv: [pv] }];
  pos[0].lines = S(30, 'e2e4'); pos[1].lines = S(-30, 'e7e5'); pos[2].lines = S(30, 'g1f3');
  pos[3].lines = S(-20, 'b8c6'); pos[4].lines = S(20, 'g1f3');
  pos[5].lines = [{ score: { cp: -10 }, pv: ['g7g6'] }, { score: { cp: -40 }, pv: ['d8e7'] }];
  pos[6].lines = [{ score: { mate: 1 }, pv: ['h5f7'] }];
  const results = classifyMoves(moves, pos);
  const all = mistakesFromGame(moves, pos, results, { label: 'test' });
  assert.equal(all.length, 1);
  assert.equal(all[0].played, 'Nf6');
  assert.deepEqual(all[0].solution, ['g7g6']);
  assert.deepEqual(all[0].alternatives, ['d8e7']);
  assert.equal(all[0].lastMove, 'd1h5');
  assert.equal(mistakesFromGame(moves, pos, results, { onlyColor: 'w' }).length, 0);
  const run = new PuzzleRun(all[0]);
  assert.equal(run.play('d8e7').ok, true); // alternativa casi igual de buena
});

test('rating', () => {
  assert.ok(updateRating(1500, 1500, true) > 1500);
  assert.ok(updateRating(1500, 1500, false) < 1500);
  assert.ok(updateRating(1500, 2000, true) - 1500 > 1500 - updateRating(1500, 1000, false) - 1);
});
