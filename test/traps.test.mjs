import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Chess } from 'chess.js';
import { TRAPS, TrapRun, step, mateReply, trapLines, VARIANTS } from '../src/traps.js';

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

test('trampas: todas las variantes son legales, se desvían en una jugada del rival y se pueden jugar enteras', () => {
  for (const id of Object.keys(VARIANTS)) assert.ok(TRAPS.some((t) => t.id === id), `variante de trampa inexistente: ${id}`);
  for (const t of TRAPS) {
    const lines = trapLines(t);
    lines.forEach((line, li) => {
      if (li > 0) {
        const at = VARIANTS[t.id][li - 1].at;
        const c = new Chess();
        line.steps.slice(0, at).forEach((st) => c.move(st.s));
        assert.notEqual(c.turn(), t.side, `${t.id}: la variante ${li} no es del rival`);
      }
      const c = new Chess();
      line.steps.forEach((st) => {
        const fen = c.fen();
        for (const san of [...Object.keys(st.w ?? {}), ...Object.keys(st.alt ?? {})]) {
          assert.equal(c.turn(), t.side, `${t.id}/${li}: w/alt en jugada del rival`);
          assert.doesNotThrow(() => new Chess(fen).move(san), `${t.id}/${li}: ${san}`);
        }
        assert.doesNotThrow(() => c.move(st.s), `${t.id}/${li}: ${st.s} ilegal`);
      });
      // la línea termina con una jugada tuya o con una nota que explica qué hacer
      const last = line.steps.at(-1);
      assert.ok(last.n, `${t.id}/${li}: la última jugada necesita una explicación`);
      const r = new TrapRun(t, li);
      let guard = 0;
      while (!r.done && guard++ < 100) {
        if (r.myTurn) assert.ok(r.play(r.expected).ok, `${t.id}/${li}`);
        else r.auto();
      }
      assert.ok(r.done);
    });
  }
});