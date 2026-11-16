// Trampas de apertura (dentro del modo Aperturas): tenderlas y defenderte.
import { TRAPS, TrapRun } from './traps.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export function createTraps({ setBoard, shapes, store, sfx }, el) {
  const st = {
    trap: null,
    run: null,
    msg: '',
    msgKind: '',
    note: '',
    busy: false,
    fails: 0,
    done: store.get('pp:traps:done', {}),
    guide: store.get('pp:traps:guide', true),
  };

  el.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.trap) open(b.dataset.trap);
    else if (b.dataset.a === 'back') {
      st.trap = null;
      st.run = null;
      render();
      background();
    } else if (b.dataset.a === 'retry') open(st.trap.id);
    else if (b.dataset.a === 'hint') hint();
    else if (b.dataset.a === 'guide') {
      st.guide = !st.guide;
      store.set('pp:traps:guide', st.guide);
      if (st.run) draw(st.run.myTurn && !st.busy);
      render();
    }
    else if (b.dataset.a === 'next') {
      const i = TRAPS.indexOf(st.trap);
      open(TRAPS[(i + 1) % TRAPS.length].id);
    }
  });

  const orientation = () => (st.trap.side === 'w' ? 'white' : 'black');
  function draw(interactive) {
    setBoard(st.run.fen, st.run.lastLan, { orientation: orientation(), movable: interactive ? orientation() : null });
    if (interactive && st.guide) hint();
  }
  function background() {
    setBoard('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', null, { orientation: 'white', movable: null });
  }

  async function open(id) {
    st.trap = TRAPS.find((t) => t.id === id);
    st.run = new TrapRun(st.trap);
    st.msg = '';
    st.msgKind = '';
    st.note = st.run.lastNote ?? '';
    st.fails = 0;
    st.busy = false;
    draw(st.run.myTurn);
    render();
    if (!st.run.myTurn) await opponent();
  }

  async function opponent() {
    const run = st.run;
    st.busy = true;
    while (!run.done && !run.myTurn) {
      await sleep(550);
      if (st.run !== run) return;
      const r = run.auto();
      if (r.note) st.note = r.note;
      draw(false);
      render();
    }
    st.busy = false;
    if (run.done) return finish();
    draw(true);
    render();
  }

  function finish() {
    const run = st.run;
    st.done[st.trap.id] = true;
    store.set('pp:traps:done', st.done);
    if (!run.endedEarly) st.note = '';
    st.msg = run.endedEarly
      ? `<b>${esc(run.history.at(-1))}</b>: ${esc(run.endedEarly)}`
      : (run.mistakes === 0 ? '¡Línea completa y sin errores! 🎉' : `Línea completa, con ${run.mistakes} ${run.mistakes === 1 ? 'error' : 'errores'}.`);
    if (!run.endedEarly) {
      const last = st.trap.moves.at(-1);
      if (typeof last === 'object' && last.n) st.msg = `${esc(last.n)}<br>${st.msg}`;
    }
    st.msgKind = 'solved';
    setTimeout(sfx.good, 200);
    draw(false);
    render();
  }

  async function onMove(orig, dest) {
    const run = st.run;
    if (!run || st.busy || !run.myTurn) return;
    const exp = run.expected ?? '';
    const res = run.play(exp.startsWith(orig + dest) ? exp : orig + dest);
    if (!res.ok) {
      if (res.illegal) return draw(true);
      st.fails++;
      st.msg = res.why
        ? `<b>${esc(res.san)}</b>: ${esc(res.why)}`
        : `<b>${esc(res.san)}</b> no es la jugada de esta línea. Prueba otra vez${st.fails >= 2 ? ' (o toca «Pista»)' : ''}.`;
      st.msgKind = 'wrong';
      sfx.error();
      render();
      await sleep(res.why ? 900 : 450);
      if (st.run === run) draw(true);
      return;
    }
    st.fails = 0;
    st.msg = '';
    if (res.note) st.note = res.note;
    if (run.done) return finish();
    draw(false);
    render();
    await opponent();
  }

  function hint() {
    const exp = st.run?.myTurn && st.run.expected;
    if (exp) shapes([{ orig: exp.slice(0, 2), dest: exp.slice(2, 4), brush: 'hint' }]);
  }

  function moveList() {
    const h = st.run.history;
    return h.map((san, i) => `${i % 2 === 0 ? `<span class="ln">${i / 2 + 1}.</span> ` : ''}<span class="lv">${esc(san)}</span>`).join(' ');
  }

  function trapButton(t) {
    return `<button class="lesson" data-trap="${t.id}"><span class="lesson-check">${st.done[t.id] ? '✓' : ''}</span><b>${esc(t.name)}</b><span class="muted small">${t.side === 'w' ? 'blancas' : 'negras'} · ${esc(t.opening)}</span></button>`;
  }

  function render() {
    if (!st.trap) {
      el.innerHTML = `
        <h3>Trampas para tender</h3>
        <p class="muted small">Jugadas que parecen errores pero esconden un golpe. Juegas tu lado y el rival cae.</p>
        <div class="lessons">${TRAPS.filter((t) => t.kind === 'set').map(trapButton).join('')}</div>
        <h3>Cómo defenderte</h3>
        <p class="muted small">Las trampas más comunes que te van a intentar hacer, y la jugada correcta para esquivarlas.</p>
        <div class="lessons">${TRAPS.filter((t) => t.kind === 'defend').map(trapButton).join('')}</div>`;
      return;
    }
    const t = st.trap;
    const run = st.run;
    let html = `<button class="back" data-a="back">← Trampas</button>`;
    html += `<div class="explain"><div class="pz-head"><span class="pz-turn ${t.side}"></span><div><b>${esc(t.name)}</b><div class="muted small">${t.kind === 'set' ? 'Tiendes la trampa' : 'Te defiendes'} con ${t.side === 'w' ? 'blancas' : 'negras'} · ${esc(t.opening)}</div></div></div>`;
    html += `<p class="small">${esc(t.explain)}</p>`;
    if (run.history.length) html += `<p class="line">${moveList()}</p>`;
    if (st.note && !run.done) html += `<p class="trap-note">💡 ${esc(st.note)}</p>`;
    if (st.msg) html += `<p class="pz-msg ${st.msgKind}">${st.msg}</p>`;
    else if (run.myTurn && st.guide && !st.busy) html += `<p>Juega <b>${esc(run.current.s)}</b> (flecha azul).</p>`;
    else if (run.myTurn) html += `<p class="muted small">Tu turno. ¿Cuál es la jugada?</p>`;
    html += '</div><div class="actions">';
    if (!run.done) html += `<button data-a="guide" class="${st.guide ? 'on' : ''}" title="Mostrar u ocultar la jugada que toca">${st.guide ? '👁 Con guía' : '🧠 De memoria'}</button>${st.guide ? '' : '<button data-a="hint">Pista</button>'}<button data-a="retry" class="ghost">Reiniciar</button>`;
    else html += '<button data-a="next" class="primary">Siguiente trampa →</button><button data-a="retry">Repetir</button>';
    html += '</div>';
    el.innerHTML = html;
  }

  return {
    onMove,
    show() {
      if (st.run) draw(st.run.myTurn && !st.busy);
      else background();
      render();
    },
  };
}
