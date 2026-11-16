// Pantalla de ejercicios: tablero jugable, pistas, rating y racha.
import { Chess } from 'chess.js';
import { Chessground } from '@lichess-org/chessground';
import { CLASSES } from './analysis.js';
import { THEMES, themeName, fromLichess, PuzzleRun, updateRating } from './puzzles.js';
import { createOpenings } from './openingsMode.js';
import { createMates } from './matesMode.js';

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const store = {
  get(k, d = null) {
    try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; }
  },
  set(k, v) {
    try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* sin almacenamiento */ }
  },
};

const DIFFICULTY = [
  ['easiest', 'Muy fácil'], ['easier', 'Fácil'], ['normal', 'Normal'], ['harder', 'Difícil'], ['hardest', 'Muy difícil'],
];

/* ---------- errores guardados ---------- */
export function getMine() {
  return store.get('pp:mine', []);
}

/** Agrega ejercicios de tus errores (sin repetir). Devuelve cuántos nuevos. */
export function saveMine(list) {
  const mine = getMine();
  const ids = new Set(mine.map((p) => p.id));
  const fresh = list.filter((p) => !ids.has(p.id)).map((p) => ({ ...p, added: Date.now(), solved: false }));
  let all = [...mine, ...fresh];
  while (all.length > 300) {
    const i = all.findIndex((p) => p.solved);
    all.splice(i >= 0 ? i : 0, 1);
  }
  store.set('pp:mine', all);
  return fresh.length;
}

function markMine(id, solved) {
  const mine = getMine();
  const p = mine.find((x) => x.id === id);
  if (!p) return;
  p.solved = p.solved || solved;
  p.tries = (p.tries ?? 0) + 1;
  store.set('pp:mine', mine);
}

/* ---------- entrenador ---------- */
export function initTrainer() {
  const st = {
    source: store.get('pp:pz:source', 'lichess'),
    theme: store.get('pp:pz:theme', 'mix'),
    difficulty: store.get('pp:pz:diff', 'normal'),
    stats: store.get('pp:pz:stats', { rating: 1500, games: 0, streak: 0, best: 0, solved: 0 }),
    history: store.get('pp:pz:history', []),
    run: null,
    phase: 'idle', // loading | solving | wrong | solved | failed | empty | error
    message: '',
    queue: null, // ejercicios de una partida concreta
    queueLabel: '',
    hint: 0,
    busy: false,
    loadedOnce: false,
    mode: store.get('pp:pz:mode', 'tactics'),
  };

  const cg = Chessground($('#pboard'), {
    coordinates: true,
    animation: { enabled: true, duration: 220 },
    highlight: { lastMove: true, check: true },
    movable: { free: false, showDests: true, events: { after: (o, d) => (st.mode === 'tactics' ? onUserMove(o, d) : modes[st.mode].onMove(o, d)) } },
    premovable: { enabled: false },
    draggable: { showGhost: true },
    drawable: {
      enabled: false,
      visible: true,
      brushes: { hint: { key: 'hnt', color: '#5c8fe0', opacity: 0.8, lineWidth: 10 } },
    },
  });

  // opciones
  $('#pz-theme').innerHTML = THEMES.map(([k, v]) => `<option value="${k}">${v}</option>`).join('');
  $('#pz-diff').innerHTML = DIFFICULTY.map(([k, v]) => `<option value="${k}">${v}</option>`).join('');
  $('#pz-theme').value = st.theme;
  $('#pz-diff').value = st.difficulty;
  $('#pz-theme').addEventListener('change', (e) => { st.theme = e.target.value; store.set('pp:pz:theme', st.theme); next(); });
  $('#pz-diff').addEventListener('change', (e) => { st.difficulty = e.target.value; store.set('pp:pz:diff', st.difficulty); next(); });
  document.querySelectorAll('.pz-source button').forEach((b) => b.addEventListener('click', () => {
    st.source = b.dataset.src;
    st.queue = null;
    store.set('pp:pz:source', st.source);
    next();
  }));
  $('#pz-actions').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.a === 'hint') hint();
    else if (b.dataset.a === 'solution') reveal();
    else if (b.dataset.a === 'next') next();
    else if (b.dataset.a === 'retry') retry();
  });

  function turnName(c) {
    return c === 'w' ? 'blancas' : 'negras';
  }

  function dests(fen) {
    const c = new Chess(fen);
    const map = new Map();
    for (const m of c.moves({ verbose: true })) {
      if (!map.has(m.from)) map.set(m.from, []);
      map.get(m.from).push(m.to);
    }
    return map;
  }

  /** Tablero compartido por los tres modos. movable: 'white' | 'black' | null */
  function setBoard(fen, lastUci, { orientation, movable }) {
    const c = new Chess(fen);
    const turn = c.turn() === 'w' ? 'white' : 'black';
    cg.set({
      fen,
      turnColor: turn,
      orientation,
      check: c.inCheck() ? turn : false,
      lastMove: lastUci ? [lastUci.slice(0, 2), lastUci.slice(2, 4)] : undefined,
      movable: { color: movable ?? undefined, dests: movable ? dests(fen) : new Map() },
    });
    cg.setAutoShapes([]);
  }

  function setPosition(fen, lastUci, interactive) {
    const me = st.run.color === 'w' ? 'white' : 'black';
    setBoard(fen, lastUci, { orientation: me, movable: interactive ? me : null });
    st.lastUci = lastUci;
  }

  /* ---------- modos ---------- */
  const ctx = { setBoard, shapes: (s) => cg.setAutoShapes(s), store, $, goTactics: (theme) => practiceTheme(theme) };
  const modes = { openings: createOpenings(ctx), mates: createMates(ctx) };

  function setMode(mode) {
    st.mode = mode;
    store.set('pp:pz:mode', mode);
    document.querySelectorAll('.pz-modes button').forEach((b) => b.classList.toggle('on', b.dataset.mode === mode));
    for (const m of ['tactics', 'openings', 'mates']) $(`#mode-${m}`).hidden = m !== mode;
    if (mode === 'tactics') {
      if (!st.loadedOnce) {
        st.loadedOnce = true;
        next();
      } else if (st.run) {
        setPosition(st.run.fen, st.lastUci, st.phase === 'solving' || st.phase === 'wrong');
        render();
      }
    } else {
      modes[mode].show();
    }
  }
  document.querySelectorAll('.pz-modes button').forEach((b) => b.addEventListener('click', () => setMode(b.dataset.mode)));

  /** Practicar un tema concreto de lichess (lo usan las lecciones de mates). */
  function practiceTheme(theme) {
    st.source = 'lichess';
    st.queue = null;
    st.theme = theme;
    $('#pz-theme').value = theme;
    store.set('pp:pz:source', 'lichess');
    store.set('pp:pz:theme', theme);
    st.loadedOnce = true;
    setMode('tactics');
    next();
  }

  async function next() {
    renderSourceButtons();
    st.phase = 'loading';
    st.hint = 0;
    render();
    let puzzle = null;
    try {
      if (st.queue) {
        puzzle = st.queue.shift() ?? null;
        if (!puzzle) {
          st.queue = null;
          st.phase = 'empty';
          st.message = `Terminaste los errores de ${esc(st.queueLabel)}. 🎉 Sigue con más ejercicios eligiendo una fuente arriba.`;
          render();
          return;
        }
      } else if (st.source === 'mine') {
        const mine = getMine();
        const pending = mine.filter((p) => !p.solved);
        const pool = pending.length ? pending : mine;
        if (!pool.length) {
          st.phase = 'empty';
          st.message = 'Todavía no hay errores guardados. Analiza una partida tuya en la pestaña <b>Analizar</b>: tus errores graves y oportunidades perdidas aparecen acá como ejercicios.';
          render();
          return;
        }
        puzzle = pool[Math.floor(Math.random() * pool.length)];
      } else {
        const url = st.source === 'daily'
          ? 'https://lichess.org/api/puzzle/daily'
          : `https://lichess.org/api/puzzle/next?difficulty=${st.difficulty}${st.theme !== 'mix' ? `&angle=${st.theme}` : ''}`;
        const r = await fetch(url, { cache: 'no-store' });
        if (!r.ok) throw new Error(`lichess respondió ${r.status}`);
        puzzle = fromLichess(await r.json());
      }
    } catch (e) {
      st.phase = 'error';
      st.message = `No pude traer el ejercicio (${esc(e.message)}). Revisa tu conexión y vuelve a intentar.`;
      render();
      return;
    }
    start(puzzle);
  }

  async function start(puzzle) {
    st.run = new PuzzleRun(puzzle);
    st.phase = 'solving';
    st.hint = 0;
    st.message = '';
    st.counted = false;
    render();
    if (puzzle.fenBefore && puzzle.lastMove) {
      setPosition(puzzle.fenBefore, null, false);
      await sleep(550);
    }
    setPosition(puzzle.fen, puzzle.lastMove, true);
  }

  function retry() {
    if (!st.run) return;
    start(st.run.p);
  }

  function countResult(won) {
    if (st.counted) return;
    st.counted = true;
    const s = st.stats;
    const p = st.run.p;
    if (p.source === 'lichess' && p.rating) {
      s.rating = updateRating(s.rating, p.rating, won, s.games);
      s.games++;
    }
    if (won) {
      s.streak++;
      s.solved++;
      s.best = Math.max(s.best, s.streak);
    } else {
      s.streak = 0;
    }
    if (p.source === 'mine') markMine(p.id, won);
    st.history.push({ id: p.id, ok: won, rating: p.rating ?? null });
    st.history = st.history.slice(-30);
    store.set('pp:pz:stats', s);
    store.set('pp:pz:history', st.history);
  }

  async function onUserMove(orig, dest) {
    if (st.phase !== 'solving' && st.phase !== 'wrong') return;
    const run = st.run;
    const exp = run.expected ?? '';
    const uci = exp.startsWith(orig + dest) ? exp : orig + dest;
    const before = run.fen;
    const legal = run.legal(uci);
    const res = run.play(uci);
    if (!res.ok) {
      st.phase = 'wrong';
      const p = run.p;
      st.message = p.source === 'mine' && res.san === p.played
        ? `<b>${esc(res.san)}</b> es justo lo que jugaste en la partida. Busca otra cosa.`
        : `<b>${esc(res.san ?? '')}</b> no es la jugada. Inténtalo de nuevo.`;
      countResult(false);
      render();
      await sleep(450);
      setPosition(before, st.lastUci, true);
      return;
    }
    // jugada correcta
    cg.set({ fen: legal.after, lastMove: [orig, dest], movable: { dests: new Map() } });
    st.hint = 0;
    if (res.done) {
      st.phase = run.mistakes === 0 && !run.revealed ? 'solved' : 'failed';
      if (st.phase === 'solved') countResult(true);
      st.message = st.phase === 'solved' ? `<b>${esc(res.san)}</b>. ¡Correcto! Ejercicio resuelto.` : `<b>${esc(res.san)}</b>. Bien, llegaste a la solución.`;
      render();
      return;
    }
    st.phase = 'solving';
    st.message = `<b>${esc(res.san)}</b> ✓ ¡Bien! Sigue…`;
    render();
    await sleep(500);
    setPosition(run.fen, res.reply, true);
  }

  function hint() {
    if (!st.run || st.run.done) return;
    const exp = st.run.expected;
    st.hint++;
    st.run.hinted = true;
    if (st.hint === 1) cg.setAutoShapes([{ orig: exp.slice(0, 2), brush: 'hint' }]);
    else cg.setAutoShapes([{ orig: exp.slice(0, 2), dest: exp.slice(2, 4), brush: 'hint' }]);
    render();
  }

  async function reveal() {
    const run = st.run;
    if (!run || run.done) return;
    run.revealed = true;
    countResult(false);
    st.phase = 'failed';
    st.message = 'Así era la solución:';
    render();
    while (!run.done) {
      const m = run.advance();
      setPosition(run.fen, m.uci, false);
      st.message += ` <b>${esc(m.san)}</b>`;
      render();
      await sleep(700);
    }
  }

  function renderSourceButtons() {
    document.querySelectorAll('.pz-source button').forEach((b) => b.classList.toggle('on', !st.queue && b.dataset.src === st.source));
    const n = getMine().filter((p) => !p.solved).length;
    $('#pz-mine-count').textContent = n ? `(${n})` : '';
    $('#pz-options').hidden = st.source !== 'lichess' || !!st.queue;
  }

  function render() {
    renderSourceButtons();
    const s = st.stats;
    $('#pz-rating').textContent = s.rating;
    $('#pz-streak').textContent = s.streak;
    $('#pz-solved').textContent = s.solved;
    $('#pz-history').innerHTML = st.history.slice(-20).map((h) => `<i class="${h.ok ? 'ok' : 'ko'}" title="${h.ok ? 'Resuelto' : 'Fallado'}${h.rating ? ` · ${h.rating}` : ''}"></i>`).join('');

    const card = $('#pz-card');
    const actions = [];
    if (st.phase === 'loading') {
      card.innerHTML = '<p class="muted">Buscando un ejercicio…</p>';
    } else if (st.phase === 'empty' || st.phase === 'error') {
      card.innerHTML = `<p>${st.message}</p>`;
      if (st.phase === 'error') actions.push('<button data-a="next" class="primary">Reintentar</button>');
    } else if (st.run) {
      const p = st.run.p;
      const who = turnName(st.run.color);
      const mate = p.mateIn ?? Number((p.themes.find((t) => /^mateIn\d$/.test(t)) ?? '').slice(-1));
      const task = mate ? `Encuentra el mate en ${mate}` : p.source === 'mine' ? 'Encuentra la mejor jugada' : 'Encuentra la mejor continuación';
      let html = `<div class="pz-head"><span class="pz-turn ${st.run.color}"></span><div><b>Juegan las ${who}</b><div class="muted small">${task}</div></div></div>`;
      if (p.source === 'mine') {
        const c = CLASSES[p.cls];
        html += `<p class="small muted">${st.queue ? '' : 'De tus partidas · '}${esc(p.subtitle)}</p>`;
        if (st.phase === 'solving' && st.run.step === 0) html += `<p>En la partida jugaste <b>${esc(p.played)}</b> <span class="cls-pill" style="--c:${c.color}">${c.label}</span>. ¿Qué era mejor?</p>`;
      }
      if (st.message) html += `<p class="pz-msg ${st.phase}">${st.message}</p>`;
      const ended = st.phase === 'solved' || st.phase === 'failed';
      if (ended) {
        if (p.source === 'lichess') {
          html += `<p class="small muted">Rating del ejercicio: <b>${p.rating}</b>${p.themes.length ? ` · ${p.themes.map(themeName).map(esc).join(', ')}` : ''}</p>`;
          html += `<p class="small"><a href="${p.url}" target="_blank" rel="noopener">Ver en lichess</a> · ${esc(p.subtitle)}</p>`;
        }
        actions.push('<button data-a="next" class="primary">Siguiente ejercicio →</button>');
        if (st.phase === 'failed') actions.push('<button data-a="retry">Intentar de nuevo</button>');
      } else {
        actions.push(`<button data-a="hint">${st.hint === 0 ? 'Pista' : st.hint === 1 ? 'Más pista' : 'Pista'}</button>`);
        actions.push('<button data-a="solution">Ver solución</button>');
        actions.push('<button data-a="next" class="ghost">Saltar</button>');
      }
      card.innerHTML = html;
    }
    $('#pz-actions').innerHTML = actions.join('');
  }

  return {
    /** Se llama al abrir la pestaña. */
    show() {
      cg.redrawAll();
      setMode(st.mode);
    },
    /** Practicar una lista concreta (los errores de la partida analizada). */
    practice(list, label) {
      st.loadedOnce = true;
      st.mode = 'tactics';
      setMode('tactics');
      st.queue = [...list];
      st.queueLabel = label;
      next();
    },
    refresh: renderSourceButtons,
  };
}
