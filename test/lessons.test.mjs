import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Chess } from 'chess.js';
import { BASIC_MATES, PATTERNS } from '../src/mates.js';
import { FAMILIES, buildTree, mainMove, OpeningDrill, matchesFamily } from '../src/openingDrill.js';
import { PuzzleRun } from '../src/puzzles.js';

test('cada patrón de mate es legal y su solución termina en mate', () => {
  for (const p of PATTERNS) {
    const c = new Chess(p.fen);
    assert.equal(c.inCheck(), false, `${p.id}: no debe empezar en jaque`);
    for (const uci of p.solution) c.move({ from: uci.slice(0, 2), to: uci.slice(2, 4) });
    assert.equal(c.isCheckmate(), true, `${p.id}: la solución no da mate`);
    // y se resuelve con PuzzleRun
    const run = new PuzzleRun({ fen: p.fen, solution: p.solution, alternatives: [] });
    for (let i = 0; i < p.solution.length; i += 2) assert.equal(run.play(p.solution[i]).ok, true);
    assert.equal(run.solved, true);
  }
});

test('en la coz, la dama en g8 obliga a comer con la torre', () => {
  const p = PATTERNS.find((x) => x.id === 'coz');
  const c = new Chess(p.fen);
  c.move('Qg8+');
  assert.deepEqual(c.moves(), ['Rxg8']);
});

test('los mates básicos empiezan en posiciones legales y sin jaque', () => {
  for (const m of BASIC_MATES) {
    const c = new Chess(m.fen);
    assert.equal(c.inCheck(), false, m.id);
    assert.equal(c.turn(), 'w');
    assert.ok(c.moves().length > 5);
  }
});

const lines = JSON.parse(readFileSync(new URL('../public/opening-lines.json', import.meta.url)));

test('cada apertura tiene líneas y empieza con la jugada correcta', () => {
  const first = { italiana: 'e2e4', siciliana: 'e2e4', 'gambito-dama': 'd2d4', inglesa: 'c2c4', londres: 'd2d4', 'india-rey': 'd2d4' };
  for (const f of FAMILIES) {
    const tree = buildTree(lines, f);
    assert.ok(tree.count >= 3, `${f.id} tiene ${tree.count} líneas`);
    if (first[f.id]) assert.equal(mainMove(tree), first[f.id], f.id);
  }
  assert.equal(matchesFamily(FAMILIES.find((f) => f.id === 'gambito-dama'), "Queen's Gambit Declined: Exchange Variation"), true);
  assert.equal(matchesFamily(FAMILIES.find((f) => f.id === 'gambito-rey'), "King's Indian Defense"), false);
});

test('entrenar la Italiana con blancas: teoría, error y respuesta del rival', () => {
  const tree = buildTree(lines, FAMILIES.find((f) => f.id === 'italiana'));
  const d = new OpeningDrill(tree, 'w', () => 0.5);
  assert.equal(d.myTurn, true);
  assert.equal(d.play('d2d4'), false); // no es Italiana
  assert.equal(d.errors, 1);
  assert.equal(d.play('e2e4'), true);
  assert.equal(d.reply(), 'e7e5');
  assert.equal(d.play('g1f3'), true);
  assert.equal(d.reply(), 'b8c6');
  assert.equal(d.play('f1c4'), true);
  let guard = 0;
  while (!d.finished && guard++ < 60) {
    if (d.myTurn) assert.equal(d.play(d.expected), true);
    else d.reply();
  }
  assert.equal(d.finished, true);
  // la línea es legal
  const c = new Chess();
  d.moves.forEach((u) => c.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] }));
});
