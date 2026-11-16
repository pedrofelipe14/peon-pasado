// Modo "Aperturas" de la pestaña de ejercicios.
import { Chess } from 'chess.js';
import { FAMILIES, buildTree, OpeningDrill } from './openingDrill.js';
import { ABOUT } from './openingAbout.js';
import { createTraps } from './trapsMode.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const epd = (fen) => fen.split(' ').slice(0, 4).join(' ');

export function createOpenings(ctx) {
  const { setBoard, shapes, store, $, sfx } = ctx;
  const traps = createTraps(ctx, $('#op-traps'));
  const st = {
    family: store.get('pp:op:family', 'italiana'),
    mode: store.get('pp:op:mode', 'learn'),
    stats: store.get('pp:op:stats', {}),
    lines: null,
    names: null,
    drill: null,
    chess: null,
    last: null,
    msg: '',
    msgKind: '',
    posName: '',
    busy: false,
  };

  const fam = () => FAMILIES.find((f) => f.id === st.family) ?? FAMILIES[0];
  const sideName = (s) => (s === 'w' ? 'blancas' : 'negras');

  // selector de aperturas
  const group = (side, label) => `<optgroup label="${label}">${FAMILIES.filter((f) => f.side === side).map((f) => `<option value="${f.id}">${esc(f.name)}</option>`).join('')}</optgroup>`;
  $('#op-family').innerHTML = group('w', 'Con blancas') + group('b', 'Con negras');
  $('#op-family').value = st.family;
  $('#op-family').addEventListener('change', (e) => {
    st.family = e.target.value;
    store.set('pp:op:family', st.family);
    start();
  });
  document.querySelectorAll('.op-mode button').forEach((b) => b.addEventListener('click', () => {
    const was = st.mode;
    st.mode = b.dataset.m;
    store.set('pp:op:mode', st.mode);
    if (layout()) return;
    if (was === 'traps' && st.drill && !st.drill.finished) {
      draw(st.drill.myTurn);
      render();
    } else start();
  }));

  /** Muestra la sección de trampas o la de aperturas. Devuelve true si son las trampas. */
  function layout() {
    const t = st.mode === 'traps';
    $('#op-traps').hidden = !t;
    $('#op-drill').hidden = t;
    document.querySelectorAll('.op-mode button').forEach((b) => b.classList.toggle('on', b.dataset.m === st.mode));
    if (t) traps.show();
    return t;
  }
  $('#op-actions').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.a === 'again') start();
    else if (b.dataset.a === 'hint') showHint(true);
  });

  async function load() {
    if (st.lines) return;
    const [lines, names] = await Promise.all([
      fetch('opening-lines.json').then((r) => r.json()),
      fetch('openings.json').then((r) => r.json()),
    ]);
    st.lines = lines;
    st.names = names;
  }

  function sanOf(uci, fen) {
    try {
      return new Chess(fen).move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] }).san;
    } catch {
      return uci;
    }
  }

  function updateName() {
    const hit = st.names?.[epd(st.chess.fen())];
    if (hit) st.posName = hit[1];
  }

  function draw(interactive) {
    if (st.mode === 'traps') return;
    setBoard(st.chess.fen(), st.last, {
      orientation: fam().side === 'w' ? 'white' : 'black',
      movable: interactive ? (fam().side === 'w' ? 'white' : 'black') : null,
    });
    if (interactive && st.mode === 'learn') showHint(false);
  }

  function showHint(full) {
    const exp = st.drill?.expected;
    if (!exp || !st.drill.myTurn) return;
    const others = alternatives().map((u) => ({ orig: u.slice(0, 2), dest: u.slice(2, 4), brush: 'paleBlue' }));
    shapes([...(full ? [] : others), { orig: exp.slice(0, 2), dest: exp.slice(2, 4), brush: 'hint' }]);
    if (full && st.mode === 'practice') {
      st.msg = `Aquí se juega <b>${esc(sanOf(exp, st.chess.fen()))}</b>.`;
      st.msgKind = '';
      render();
    }
  }

  /** Otras jugadas que también son teoría en esta posición (las más jugadas primero). */
  function alternatives() {
    const exp = st.drill?.expected;
    return [...(st.drill?.node.children ?? [])]
      .filter(([u]) => u !== exp)
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 3)
      .map(([u]) => u);
  }

  async function start() {
    st.busy = true;
    st.msg = '';
    st.posName = '';
    render();
    try {
      await load();
    } catch (e) {
      st.msg = `No pude cargar las aperturas (${esc(e.message)}).`;
      st.msgKind = 'wrong';
      st.busy = false;
      render();
      return;
    }
    st.drill = new OpeningDrill(buildTree(st.lines, fam()), fam().side);
    st.chess = new Chess();
    st.last = null;
    st.busy = false;
    draw(false);
    if (!st.drill.myTurn) await opponent();
    else {
      draw(true);
      render();
    }
  }

  async function opponent() {
    await sleep(450);
    const uci = st.drill.reply();
    if (!uci) return finish();
    const m = st.chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
    st.last = m.lan;
    updateName();
    if (st.drill.finished) return finish();
    draw(true);
    render();
  }

  function finish() {
    const s = (st.stats[st.family] ??= { done: 0, perfect: 0 });
    s.done++;
    if (st.drill.errors === 0) s.perfect++;
    store.set('pp:op:stats', st.stats);
    draw(false);
    st.msg = st.drill.errors === 0
      ? '¡Línea completa y sin errores! 🎉'
      : `Línea completa, con ${st.drill.errors} ${st.drill.errors === 1 ? 'error' : 'errores'}.`;
    st.msgKind = 'solved';
    setTimeout(sfx.good, 150);
    render();
  }

  async function onMove(orig, dest) {
    if (st.mode === 'traps') return traps.onMove(orig, dest);
    if (!st.drill || st.busy || !st.drill.myTurn) return;
    const before = st.chess.fen();
    let m;
    try {
      m = new Chess(before).move({ from: orig, to: dest, promotion: 'q' });
    } catch {
      draw(true);
      return;
    }
    if (!st.drill.play(m.lan)) {
      st.msg = `<b>${esc(m.san)}</b> no es parte de la ${esc(fam().name)}. Prueba otra vez${st.mode === 'practice' ? ' (toca «Pista» si no te acuerdas)' : ''}.`;
      st.msgKind = 'wrong';
      sfx.error();
      render();
      await sleep(400);
      draw(true);
      return;
    }
    st.chess.move(m.san);
    st.last = m.lan;
    updateName();
    st.msg = `<b>${esc(m.san)}</b> ✓`;
    st.msgKind = 'ok';
    if (st.drill.finished) return finish();
    draw(false);
    render();
    st.busy = true;
    await opponent();
    st.busy = false;
  }

  function moveList() {
    const c = new Chess();
    const out = [];
    st.drill.moves.forEach((u, i) => {
      const m = c.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] });
      if (i % 2 === 0) out.push(`<span class="ln">${i / 2 + 1}.</span>`);
      out.push(`<span class="lv">${esc(m.san)}</span>`);
    });
    return out.join(' ');
  }

  function render() {
    document.querySelectorAll('.op-mode button').forEach((b) => b.classList.toggle('on', b.dataset.m === st.mode));
    const f = fam();
    const s = st.stats[f.id];
    let html = `<div class="pz-head"><span class="pz-turn ${f.side}"></span><div><b>${esc(f.name)}</b><div class="muted small">Juegas con ${sideName(f.side)} · ${st.mode === 'learn' ? 'la flecha te muestra la jugada' : 'de memoria'}</div></div></div>`;
    html += `<p class="small">${esc(f.desc)}</p>`;
    const a = ABOUT[f.id];
    if (a) {
      html += `<details class="op-about"${(st.drill?.moves.length ?? 0) > 1 ? '' : ' open'}><summary>¿De qué se trata?</summary>`
        + `<p><b>La idea:</b> ${esc(a.idea)}</p>`
        + `<p><b>Planes típicos:</b></p><ul>${a.plans.map((p) => `<li>${esc(p)}</li>`).join('')}</ul>`
        + `<p><b>Ojo con:</b> ${esc(a.watch)}</p>`
        + `<p class="muted"><b>Para quién:</b> ${esc(a.who)}</p></details>`;
    }
    if (st.busy && !st.drill) html += '<p class="muted">Cargando aperturas…</p>';
    if (st.drill) {
      if (st.posName) html += `<p class="op-name">📖 ${esc(st.posName)}</p>`;
      if (st.drill.moves.length) html += `<p class="line">${moveList()}</p>`;
    }
    if (st.msg) html += `<p class="pz-msg ${st.msgKind}">${st.msg}</p>`;
    if (st.drill?.myTurn && !st.drill.finished && st.mode === 'learn') {
      const fen = st.chess.fen();
      const alts = alternatives().map((u) => `<b>${esc(sanOf(u, fen))}</b>`);
      html += `<p>Juega <b>${esc(sanOf(st.drill.expected, fen))}</b> (flecha azul)${alts.length ? `. También son teoría: ${alts.join(', ')} (flechas claras)` : ''}.</p>`;
    }
    if (s) html += `<p class="muted small">Líneas completadas: ${s.done} · sin errores: ${s.perfect}</p>`;
    $('#op-card').innerHTML = html;
    const done = st.drill?.finished;
    $('#op-actions').innerHTML = done
      ? '<button data-a="again" class="primary">Otra línea →</button>'
      : `${st.mode === 'practice' ? '<button data-a="hint">Pista</button>' : ''}<button data-a="again" class="ghost">Reiniciar</button>`;
  }

  return {
    onMove,
    show() {
      if (layout()) return;
      if (!st.drill) start();
      else {
        draw(st.drill.myTurn && !st.drill.finished);
        render();
      }
    },
  };
}
