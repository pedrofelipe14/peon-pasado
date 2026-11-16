import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Chess } from 'chess.js';
import { TRAPS, TrapRun, step, mateReply } from '../src/traps.js';

test('trampas: todas las líneas son legales y coherentes', () => {
  const ids = new Set();
  for (const t of TRAPS) {
    assert.ok(!ids.has(t.id), `id repetido ${t.id}`);
    ids.add(t.id);
    const c = new Chess();
    t.moves.map(step).forEach((st, i) => {
      const fen = c.fen();
      const mine = c.turn() === t.side;
      for (const san of Object.keys(st.w ?? {})) {
        assert.ok(mine, `${t.id}: w en jugada del rival (${i})`);
        assert.doesNotThrow(() => new Chess(fen).move(san), `${t.id}: ${san} ilegal (w)`);
      }
      for (const san of Object.keys(st.alt ?? {})) {
        assert.ok(mine, `${t.id}: alt en jugada del rival (${i})`);
        assert.doesNotThrow(() => new Chess(fen).move(san), `${t.id}: ${san} ilegal (alt)`);
      }
      const m = c.move(st.s); // tira si es ilegal
      assert.ok(m, `${t.id}: ${st.s}`);
    });
    if (t.mate) assert.ok(c.isCheckmate(), `${t.id} debería terminar en mate`);
    // la primera jugada del usuario llega en `start`
    const r = new TrapRun(t);
    while (!r.myTurn) r.auto();
    assert.equal(r.i, t.start, `${t.id}: start no cae en una jugada tuya`);
  }
});

test('trampas: se puede jugar entera una de cada tipo', () => {
  for (const id of ['legal', 'def-caro']) {
    const r = new TrapRun(TRAPS.find((t) => t.id === id));
    while (!r.done) {
      if (r.myTurn) assert.ok(r.play(r.expected).ok);
      else r.auto();
    }
  }
});

test('trampas: el error tentador se explica', () => {
  const r = new TrapRun(TRAPS.find((t) => t.id === 'def-caro'));
  const bad = r.play('g8f6');
  assert.equal(bad.ok, false);
  assert.match(bad.why, /mate/);
  const r2 = new TrapRun(TRAPS.find((t) => t.id === 'def-pastor'));
  const bad2 = r2.play('d7d6'); // permite Qxf7#
  assert.match(bad2.why, /Qxf7#/);
  const alt = r2.play('d8e7');
  assert.ok(alt.ok && alt.alt && r2.done);
  assert.equal(mateReply(new Chess().fen()), null);
});
