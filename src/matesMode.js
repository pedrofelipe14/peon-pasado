// Modo "Mates": lecciones de mates básicos contra el motor y patrones de mate.
import { Chess } from 'chess.js';
import { BASIC_MATES, PATTERNS } from './mates.js';
import { PuzzleRun } from './puzzles.js';
import { EngineWorker } from './engine.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export function createMates({ setBoard, shapes, store, $, goTactics, sfx }) {
  const st = {
    lesson: null, // { kind: 'basic' | 'pattern', data }
    done: store.get('pp:mates:done', {}),
    chess: null,
    run: null,
    last: null,
    msg: '',
    msgKind: '',
    phase: 'list', // list | playing | won | lost
    moves: 0,
    optimal: null,
    busy: false,
  };
  let engine = null;
  const getEngine = () => (engine ??= new EngineWorker());

  $('#mates').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.lesson) open(b.dataset.lesson);
    else if (b.dataset.a === 'back') {
      st.lesson = null;
      st.phase = 'list';
      shapes([]);
      render();
    } else if (b.dataset.a === 'retry') open(st.lesson.data.id);
    else if (b.dataset.a === 'hint') hint();
    else if (b.dataset.a === 'solution') reveal();
    else if (b.dataset.a === 'practice') goTactics(st.lesson.data.theme);
  });

  function markDone(id) {
    st.done[id] = true;
    store.set('pp:mates:done', st.done);
  }

  function draw(interactive) {
    setBoard(st.chess.fen(), st.last, { orientation: 'white', movable: interactive ? 'white' : null });
  }

  async function open(id) {
    const basic = BASIC_MATES.find((m) => m.id === id);
    const pattern = PATTERNS.find((m) => m.id === id);
    st.lesson = basic ? { kind: 'basic', data: basic } : { kind: 'pattern', data: pattern };
    st.chess = new Chess(st.lesson.data.fen);
    st.last = null;
    st.msg = '';
    st.msgKind = '';
    st.phase = 'playing';
    st.moves = 0;
    st.optimal = null;
    st.busy = false;
    if (pattern) st.run = new PuzzleRun({ fen: pattern.fen, solution: pattern.solution, alternatives: [] });
    draw(true);
    render();
    if (basic) {
      // con juego perfecto, ¿en cuántas da mate?
      const res = await getEngine().analyze(st.chess.fen(), { depth: 22, movetime: 1500 });
      const sc = res.lines[0]?.score;
      if (sc?.mate > 0 && st.lesson?.data === basic && st.moves === 0) {
        st.optimal = sc.mate;
        render();
      }
    }
  }

  async function onMove(orig, dest) {
    if (st.phase !== 'playing' || st.busy) return;
    if (st.lesson.kind === 'pattern') return patternMove(orig, dest);
    let m;
    try {
      m = st.chess.move({ from: orig, to: dest, promotion: 'q' });
    } catch {
      draw(true);
      return;
    }
    st.moves++;
    st.last = m.lan;
    if (st.chess.isCheckmate()) {
      st.phase = 'won';
      markDone(st.lesson.data.id);
      st.msg = `¡Jaque mate en ${st.moves} jugadas! 🎉${st.optimal ? ` (con juego perfecto eran ${st.optimal})` : ''}`;
      st.msgKind = 'solved';
      draw(false);
      render();
      return;
    }
    if (st.chess.isStalemate()) {
      st.phase = 'lost';
      sfx.error();
      st.msg = '¡Ahogado! El rey rival no tiene jugadas y no está en jaque: son tablas. Deja siempre al menos una casilla libre hasta que puedas dar mate.';
      st.msgKind = 'wrong';
      draw(false);
      render();
      return;
    }
    draw(false);
    st.msg = '';
    render();
    st.busy = true;
    const res = await getEngine().analyze(st.chess.fen(), { depth: 14, movetime: 350 });
    st.busy = false;
    if (st.lesson?.kind !== 'basic' || st.phase !== 'playing') return;
    const reply = res.lines[0]?.pv?.[0];
    if (!reply) return;
    const r = st.chess.move({ from: reply.slice(0, 2), to: reply.slice(2, 4), promotion: reply[4] });
    st.last = r.lan;
    if (st.chess.isInsufficientMaterial()) {
      st.phase = 'lost';
      setTimeout(sfx.error, 250);
      st.msg = `El rey comió tu ${r.captured === 'q' ? 'dama' : 'torre'} con <b>${esc(r.san)}</b>: sin material no hay mate. Protege tus piezas o mantenlas lejos del rey.`;
      st.msgKind = 'wrong';
      draw(false);
      render();
      return;
    }
    draw(true);
    render();
  }

  async function patternMove(orig, dest) {
    const run = st.run;
    const before = run.fen;
    const exp = run.expected ?? '';
    const res = run.play(exp.startsWith(orig + dest) ? exp : orig + dest);
    if (!res.ok) {
      st.msg = res.san ? `<b>${esc(res.san)}</b> no da mate. Prueba otra vez.` : '';
      st.msgKind = 'wrong';
      sfx.error();
      render();
      await sleep(400);
      st.chess = new Chess(before);
      draw(true);
      return;
    }
    st.chess = new Chess(run.fen);
    if (res.reply) {
      // primero mostramos la jugada del usuario, después la respuesta
      const mid = new Chess(before);
      mid.move({ from: orig, to: dest, promotion: 'q' });
      setBoard(mid.fen(), orig + dest, { orientation: 'white', movable: null });
      st.msg = `<b>${esc(res.san)}</b> ✓ Sigue…`;
      st.msgKind = 'ok';
      render();
      await sleep(550);
      st.last = res.reply;
    } else {
      st.last = orig + dest;
    }
    if (res.done) {
      st.phase = 'won';
      markDone(st.lesson.data.id);
      st.msg = `<b>${esc(res.san)}</b> ¡Jaque mate! 🎉`;
      st.msgKind = 'solved';
      draw(false);
    } else {
      draw(true);
    }
    render();
  }

  async function hint() {
    if (st.phase !== 'playing' || st.busy) return;
    let uci;
    if (st.lesson.kind === 'pattern') uci = st.run.expected;
    else {
      st.busy = true;
      const res = await getEngine().analyze(st.chess.fen(), { depth: 16, movetime: 600 });
      st.busy = false;
      uci = res.lines[0]?.pv?.[0];
    }
    if (uci) shapes([{ orig: uci.slice(0, 2), dest: uci.slice(2, 4), brush: 'hint' }]);
  }

  async function reveal() {
    const run = st.run;
    if (!run || run.done) return;
    run.revealed = true;
    st.phase = 'lost';
    st.msg = 'Así era:';
    while (!run.done) {
      const m = run.advance();
      st.chess = new Chess(run.fen);
      st.last = m.uci;
      st.msg += ` <b>${esc(m.san)}</b>`;
      draw(false);
      render();
      await sleep(700);
    }
  }

  function lessonButton(m, sub) {
    return `<button class="lesson" data-lesson="${m.id}"><span class="lesson-check">${st.done[m.id] ? '✓' : ''}</span><b>${esc(m.title)}</b><span class="muted small">${sub}</span></button>`;
  }

  function render() {
    const el = $('#mates');
    if (!st.lesson) {
      el.innerHTML = `
        <h3>Mates básicos</h3>
        <p class="muted small">Tú tienes la ventaja y el motor defiende lo mejor posible. ¿Puedes dar mate?</p>
        <div class="lessons">${BASIC_MATES.map((m) => lessonButton(m, 'contra el motor')).join('')}</div>
        <h3>Patrones de mate</h3>
        <p class="muted small">Los mates que más aparecen en partidas reales. Aprende el patrón y después practícalo.</p>
        <div class="lessons">${PATTERNS.map((m) => lessonButton(m, 'patrón')).join('')}</div>`;
      return;
    }
    const d = st.lesson.data;
    const basic = st.lesson.kind === 'basic';
    let html = `<button class="back" data-a="back">← Lecciones</button>`;
    html += `<div class="explain"><div class="pz-head"><span class="pz-turn w"></span><div><b>${esc(d.title)}</b><div class="muted small">Juegan las blancas · ${basic ? 'da mate al rey negro' : `mate en ${Math.ceil(d.solution.length / 2)}`}</div></div></div>`;
    html += `<p>${esc(d.explain)}</p>`;
    if (basic) html += `<p class="muted small">Jugadas: <b>${st.moves}</b>${st.optimal ? ` · con juego perfecto: mate en ${st.optimal}` : ''}</p>`;
    if (st.msg) html += `<p class="pz-msg ${st.msgKind}">${st.msg}</p>`;
    html += '</div><div class="actions">';
    if (st.phase === 'playing') {
      html += '<button data-a="hint">Pista</button>';
      if (!basic) html += '<button data-a="solution">Ver solución</button>';
      html += '<button data-a="retry" class="ghost">Reiniciar</button>';
    } else {
      if (!basic && d.theme) html += `<button data-a="practice" class="primary">Practicar con ejercicios reales →</button>`;
      html += `<button data-a="retry"${basic ? ' class="primary"' : ''}>${basic && st.phase === 'won' ? 'Jugar de nuevo' : 'Intentar de nuevo'}</button>`;
    }
    html += '</div>';
    el.innerHTML = html;
  }

  return {
    onMove,
    show() {
      if (st.lesson && st.chess) draw(st.phase === 'playing');
      else {
        // tablero de fondo mientras eliges
        setBoard(BASIC_MATES[0].fen, null, { orientation: 'white', movable: null });
      }
      render();
    },
  };
}
