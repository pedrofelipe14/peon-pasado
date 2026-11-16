import { Chess } from 'chess.js';
import { Chessground } from '@lichess-org/chessground';
import '@lichess-org/chessground/assets/chessground.base.css';
import '@lichess-org/chessground/assets/chessground.cburnett.css';
import './style.css';
import {
  CLASSES, SUMMARY_ORDER, classifyMoves, gameAccuracy, whiteWinPct, bestScore, toWhite,
  formatScore, terminalScore, winPct,
} from './analysis.js';
import { explainMove, evalWords, uciMove } from './explain.js';
import { EnginePool, defaultPoolSize } from './engine.js';
import { parseInput, fetchLichessGame, findChessComGame, recentGames, LoadError } from './games.js';
import { drawGraph, graphPlyAt } from './graph.js';
import { mistakesFromGame } from './puzzles.js';
import { initTrainer, saveMine } from './trainer.js';
import { transitionSound, soundOn, setSound } from './sound.js';

const $ = (sel) => document.querySelector(sel);
const DEPTHS = {
  fast: { depth: 12, movetime: 800, label: 'Rápido' },
  normal: { depth: 16, movetime: 2000, label: 'Normal' },
  deep: { depth: 20, movetime: 5000, label: 'Profundo' },
};
const KEY = new Set(['brilliant', 'great', 'miss', 'mistake', 'blunder']);
const BAD = new Set(['inaccuracy', 'mistake', 'blunder', 'miss']);

const EXAMPLE_PGN = `[Event "París, la partida de la ópera"]
[Date "1858.??.??"]
[White "Paul Morphy"]
[Black "Duque de Brunswick y Conde Isouard"]
[Result "1-0"]

1. e4 e5 2. Nf3 d6 3. d4 Bg4 4. dxe5 Bxf3 5. Qxf3 dxe5 6. Bc4 Nf6 7. Qb3 Qe7
8. Nc3 c6 9. Bg5 b5 10. Nxb5 cxb5 11. Bxb5+ Nbd7 12. O-O-O Rd8 13. Rxd7 Rxd7
14. Rd1 Qe6 15. Bxd7+ Nxd7 16. Qb8+ Nxb8 17. Rd8# 1-0`;

const store = {
  get(k, d = null) {
    try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; }
  },
  set(k, v) {
    try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* sin almacenamiento */ }
  },
};

const state = {
  moves: [], positions: [], results: [], book: [], opening: null, headers: {},
  ply: 0, orientation: 'white', pool: null, showEngine: store.get('pp:engine', false),
  analyzed: 0, toAnalyze: 0, settingsKey: store.get('pp:depth', 'normal'), cacheKey: null,
  platform: store.get('pp:platform', 'chesscom') === 'lichess' ? 'lichess' : 'chesscom', source: null,
  variation: null, // { title, fens, ucis, sans, idx, score, rootFen }
  myColor: null, gamePuzzles: [],
};

let openingDb = null;
const loadOpenings = () =>
  (openingDb ??= fetch('openings.json').then((r) => r.json()).catch(() => ({})));
const epd = (fen) => fen.split(' ').slice(0, 4).join(' ');

/* ---------- tablero ---------- */
const cg = Chessground($('#board'), {
  coordinates: true,
  movable: { free: false, color: undefined },
  draggable: { enabled: false },
  selectable: { enabled: false },
  premovable: { enabled: false },
  animation: { enabled: true, duration: 180 },
  highlight: { lastMove: true, check: true },
  drawable: {
    enabled: true, // flechas y círculos con el click derecho
    visible: true,
    brushes: {
      best: { key: 'bst', color: '#7cbf4b', opacity: 0.85, lineWidth: 11 },
      engine: { key: 'eng', color: '#5c8fe0', opacity: 0.75, lineWidth: 9 },
      threat: { key: 'thr', color: '#e0524c', opacity: 0.8, lineWidth: 10 },
    },
  },
});

function badgeSvg(cls) {
  const c = CLASSES[cls];
  const size = c.symbol.length > 1 ? 13 : 16;
  return `<g transform="translate(70 2)"><circle cx="14" cy="14" r="13" fill="${c.color}" stroke="rgba(0,0,0,.45)" stroke-width="1.5"/>`
    + `<text x="14" y="${14 + size * 0.36}" font-size="${size}" font-weight="800" text-anchor="middle" fill="#fff" font-family="system-ui,sans-serif">${c.symbol}</text></g>`;
}

const arrow = (uci, brush) => ({ orig: uci.slice(0, 2), dest: uci.slice(2, 4), brush });

let shownFen = null;
function setBoard(fen, lastUci) {
  const turn = fen.split(' ')[1] === 'w' ? 'white' : 'black';
  if (fen !== shownFen) {
    transitionSound(shownFen, fen, lastUci);
    if (shownFen) cg.setShapes([]); // las flechas del usuario son de esa posición
    shownFen = fen;
  }
  cg.set({
    fen,
    orientation: state.orientation,
    turnColor: turn,
    check: new Chess(fen).inCheck() ? turn : false,
    lastMove: lastUci ? [lastUci.slice(0, 2), lastUci.slice(2, 4)] : undefined,
  });
}

function renderBoard() {
  const v = state.variation;
  const box = $('#board-box');
  box.classList.toggle('in-variation', !!v);
  if (v) {
    setBoard(v.fens[v.idx], v.ucis[v.idx - 1]);
    const shapes = [];
    const next = v.ucis[v.idx];
    if (next) shapes.push(arrow(next, v.kind === 'threat' ? 'threat' : 'best'));
    cg.setAutoShapes(shapes);
    $('#board').dataset.cls = '';
    return;
  }
  const p = state.ply;
  const pos = state.positions[p];
  if (!pos) return;
  const move = state.moves[p - 1];
  setBoard(pos.fen, move?.lan);
  const shapes = [];
  const r = move && state.results[p - 1];
  if (r) {
    shapes.push({ orig: move.to, customSvg: { html: badgeSvg(r.cls) } });
    if (!r.isBest && r.bestUci && !['book', 'forced', 'best'].includes(r.cls)) shapes.push(arrow(r.bestUci, 'best'));
  }
  const next = pos.lines?.[0]?.pv?.[0];
  if (state.showEngine && next) shapes.push(arrow(next, 'engine'));
  cg.setAutoShapes(shapes);
  $('#board').dataset.cls = r?.cls ?? '';
}

/* ---------- barra de evaluación ---------- */
function renderEvalBar() {
  let w;
  let s;
  if (state.variation) {
    const v = state.variation;
    s = toWhite(v.score, v.rootFen);
    w = s ? (s.mate === 0 ? (s.whiteMated ? 0 : 100) : winPct(s)) : null;
  } else {
    const pos = state.positions[state.ply];
    w = whiteWinPct(pos);
    s = toWhite(bestScore(pos), pos.fen);
  }
  const bar = $('#evalbar');
  bar.classList.toggle('flipped', state.orientation === 'black');
  bar.classList.toggle('pending', w == null);
  const pct = w ?? 50;
  bar.style.setProperty('--white', `${pct}%`);
  $('#evalbar-text').textContent = s ? (s.mate === 0 ? (s.whiteMated ? '0-1' : '1-0') : formatScore(s).replace('+', '')) : '';
  $('#evalbar-text').classList.toggle('dark', pct >= 50);
  bar.title = s ? evalWords(s) : '';
}

/* ---------- jugadores ---------- */
function renderPlayers(acc) {
  const h = state.headers;
  const info = {
    white: { name: h.White || 'Blancas', elo: h.WhiteElo, acc: acc?.w },
    black: { name: h.Black || 'Negras', elo: h.BlackElo, acc: acc?.b },
  };
  const html = (color) => {
    const i = info[color];
    const elo = i.elo && i.elo !== '?' ? `<span class="elo">${esc(i.elo)}</span>` : '';
    const a = i.acc != null ? `<span class="acc-chip ${color}" title="Precisión">${i.acc.toFixed(1)}</span>` : '';
    return `<span class="dot ${color}"></span><span class="name">${esc(i.name)}</span>${elo}${a}`;
  };
  const bottom = state.orientation;
  const top = bottom === 'white' ? 'black' : 'white';
  $('#player-top').innerHTML = html(top);
  $('#player-bottom').innerHTML = html(bottom);
}

/* ---------- lista de jugadas ---------- */
function renderMoves() {
  const el = $('#moves');
  const rows = [];
  const startBlack = state.moves[0]?.color === 'b';
  let num = state.positions[0] ? +state.positions[0].fen.split(' ')[5] : 1;
  let i = 0;
  while (i < state.moves.length) {
    const cells = [];
    if (i === 0 && startBlack) cells.push('<span class="mv empty">…</span>');
    const take = i === 0 && startBlack ? 1 : 2;
    for (let k = 0; k < take && i < state.moves.length; k++, i++) cells.push(moveCell(i));
    rows.push(`<div class="mrow"><span class="num">${num}.</span>${cells.join('')}</div>`);
    num++;
  }
  el.innerHTML = rows.join('') || '<p class="muted">Sin jugadas.</p>';
  const active = el.querySelector('.mv.active');
  if (active) {
    const top = active.offsetTop;
    if (top < el.scrollTop || top > el.scrollTop + el.clientHeight - 40) el.scrollTop = top - el.clientHeight / 2;
  }
}

function moveCell(i) {
  const m = state.moves[i];
  const cls = state.results[i]?.cls;
  const badge = cls
    ? `<i class="badge" style="--c:${CLASSES[cls].color}" title="${CLASSES[cls].label}">${CLASSES[cls].symbol}</i>`
    : '<i class="badge pending"></i>';
  const active = state.ply === i + 1 && !state.variation ? ' active' : '';
  return `<button class="mv${active}" data-ply="${i + 1}">${badge}<span>${esc(m.san)}</span></button>`;
}

/* ---------- variantes: ver la mejor jugada / la amenaza ---------- */
function startVariation(kind, rootFen, line, title) {
  if (!line?.pv?.length) return;
  const c = new Chess(rootFen);
  const fens = [rootFen];
  const ucis = [];
  const sans = [];
  for (const uci of line.pv.slice(0, 10)) {
    const m = uciMove(c.fen(), uci);
    if (!m) break;
    c.move(m.san);
    fens.push(c.fen());
    ucis.push(uci);
    sans.push(m.san);
  }
  if (!sans.length) return;
  state.variation = { kind, title, rootFen, fens, ucis, sans, idx: 1, score: line.score };
  render();
}

function stepVariation(d) {
  const v = state.variation;
  v.idx = Math.max(0, Math.min(v.sans.length, v.idx + d));
  render();
}

function exitVariation() {
  state.variation = null;
  render();
}

function lineButtons(fen, sans, activeIdx = -1, clickable = false) {
  let num = +fen.split(' ')[5];
  let white = fen.split(' ')[1] === 'w';
  const out = [];
  sans.forEach((s, k) => {
    if (white) out.push(`<span class="ln">${num}.</span>`);
    else if (k === 0) out.push(`<span class="ln">${num}…</span>`);
    const cls = k + 1 === activeIdx ? ' on' : '';
    out.push(clickable ? `<button class="lv${cls}" data-vidx="${k + 1}">${esc(s)}</button>` : `<span class="lv">${esc(s)}</span>`);
    if (!white) num++;
    white = !white;
  });
  return out.join(' ');
}

function renderVariation(el) {
  const v = state.variation;
  const head = v.kind === 'threat' ? 'Lo que podía hacer el rival' : 'La mejor jugada';
  const s = toWhite(v.score, v.rootFen);
  el.innerHTML = `
    <div class="ex-head"><span class="var-tag ${v.kind}">${head}</span>${s ? `<span class="eval-chip ${(s.mate ?? s.cp) >= 0 ? 'w' : 'b'}">${formatScore(s)}</span>` : ''}</div>
    <p>${v.title}</p>
    <p class="line">${lineButtons(v.rootFen, v.sans, v.idx, true)}</p>
    <div class="actions">
      <button data-x="vprev" title="←">◀</button>
      <button data-x="vnext" title="→">▶</button>
      <button data-x="vexit" class="primary" title="Esc">Volver a la partida</button>
    </div>
    <p class="muted small">${s ? esc(evalWords(s)) : ''} · usa ← → para recorrer la línea.</p>`;
}

/* ---------- explicación de la jugada ---------- */
const HEADLINE = {
  brilliant: (s) => `<b>${s}</b> es brillante`,
  great: (s) => `<b>${s}</b> es una gran jugada`,
  best: (s) => `<b>${s}</b> es la mejor jugada`,
  excellent: (s) => `<b>${s}</b> es excelente`,
  good: (s) => `<b>${s}</b> es buena`,
  book: (s) => `<b>${s}</b> es teoría`,
  forced: (s) => `<b>${s}</b> era forzada`,
  inaccuracy: (s) => `<b>${s}</b> es una imprecisión`,
  mistake: (s) => `<b>${s}</b> es un error`,
  miss: (s) => `<b>${s}</b>: oportunidad perdida`,
  blunder: (s) => `<b>${s}</b> es un error grave`,
};

function evalChip(fen, score) {
  const w = toWhite(score, fen);
  if (!w) return '';
  const side = w.mate === 0 ? '' : (w.mate ?? w.cp) >= 0 ? 'w' : 'b';
  return `<span class="eval-chip ${side}" title="${esc(evalWords(w))}">${w.mate === 0 ? '#' : formatScore(w)}</span>`;
}

function renderExplain() {
  const el = $('#explain');
  if (state.variation) {
    renderVariation(el);
    return;
  }
  const p = state.ply;
  const pos = state.positions[p];
  if (p === 0) {
    const name = state.opening ? `<p class="muted">${esc(state.opening.eco)} · ${esc(state.opening.name)}</p>` : '';
    const ready = state.results.length && state.results.every(Boolean);
    el.innerHTML = `<div class="ex-head"><span>Posición inicial</span>${evalChip(pos.fen, bestScore(pos))}</div>${name}
      <p>${ready ? 'Toca <b>▶</b> o usa la flecha → para ir jugada por jugada, o salta directo a un momento clave.' : 'Mientras se analiza, ya puedes recorrer la partida.'}</p>
      ${ready && firstKey(0) != null ? '<div class="actions"><button data-x="nextkey" class="primary">Ir al primer momento clave ⚑</button></div>' : ''}`;
    return;
  }
  const m = state.moves[p - 1];
  const r = state.results[p - 1];
  const pre = state.positions[p - 1];
  if (!r) {
    el.innerHTML = `<div class="ex-head"><span><b>${esc(m.san)}</b></span></div><p class="muted">Analizando esta jugada…</p>`;
    return;
  }
  const c = CLASSES[r.cls];
  const openingName = state.opening && p <= state.opening.ply ? state.opening.name : null;
  const ex = explainMove(m, r, pre, pos, openingName);
  const who = m.color === 'w' ? 'Blancas' : 'Negras';
  let html = `<div class="ex-head"><i class="badge big" style="--c:${c.color}">${c.symbol}</i><span>${HEADLINE[r.cls](esc(m.san))}</span>${evalChip(pos.fen, bestScore(pos))}</div>`;
  html += `<p class="cls-desc" style="--c:${c.color}">${who} · ${esc(c.desc)}</p>`;
  if (ex.why) html += `<p class="why">${esc(ex.why)}</p>`;
  if (ex.better) html += `<p class="better">${esc(ex.better)}</p>`;

  const actions = [];
  const showBest = !r.isBest && r.bestUci && !['book', 'forced'].includes(r.cls) && pre.lines?.[0];
  if (showBest) actions.push('<button data-x="best" class="primary">▶ Ver la mejor jugada</button>');
  if (BAD.has(r.cls) && !pos.terminal && pos.lines?.[0]) actions.push('<button data-x="threat">Ver qué podía hacer el rival</button>');
  if (actions.length) html += `<div class="actions">${actions.join('')}</div>`;

  const before = evalWords(toWhite(bestScore(pre), pre.fen));
  const after = evalWords(toWhite(bestScore(pos), pos.fen));
  if (pos.terminal) {
    html += `<p class="final">${pos.terminal.mate === 0 ? 'Jaque mate. Fin de la partida.' : 'Tablas. Fin de la partida.'}</p>`;
  } else if (before && after) {
    html += `<p class="swing"><span>Antes: ${esc(before)}</span><span>→</span><span>Ahora: ${esc(after)}</span></p>`;
  }
  const nk = firstKey(p);
  if (nk != null) html += `<div class="actions subtle"><button data-x="nextkey">Siguiente momento clave ⚑</button></div>`;
  el.innerHTML = html;
}

/** Primera jugada clave después de la jugada p (ply), o null. */
function firstKey(p) {
  for (let i = p; i < state.results.length; i++) {
    if (state.results[i] && KEY.has(state.results[i].cls)) return i + 1;
  }
  return null;
}

/* ---------- resumen ---------- */
function renderSummary(acc) {
  const el = $('#summary');
  const done = state.results.length && state.results.every(Boolean);
  if (!done) {
    el.innerHTML = '';
    return;
  }
  const count = { w: {}, b: {} };
  state.results.forEach((r) => { count[r.color][r.cls] = (count[r.color][r.cls] ?? 0) + 1; });
  const h = state.headers;
  const cell = (color, k) => {
    const n = count[color][k] ?? 0;
    return n ? `<button class="n" data-jump="${color}:${k}" title="Ir a la primera">${n}</button>` : '<span class="n zero">0</span>';
  };
  const rows = SUMMARY_ORDER.filter((k) => count.w[k] || count.b[k]).map((k) => {
    const c = CLASSES[k];
    return `<tr><td>${cell('w', k)}</td><td class="lbl" title="${esc(c.desc)}"><i class="badge" style="--c:${c.color}">${c.symbol}</i>${c.label}</td><td>${cell('b', k)}</td></tr>`;
  });
  const keys = state.results.map((r, i) => ({ r, i })).filter(({ r }) => KEY.has(r.cls));
  const moments = keys.map(({ r, i }) => {
    const m = state.moves[i];
    const c = CLASSES[r.cls];
    const num = m.color === 'w' ? `${+state.positions[i].fen.split(' ')[5]}.` : `${+state.positions[i].fen.split(' ')[5]}…`;
    return `<button class="moment" data-ply="${i + 1}"><i class="badge" style="--c:${c.color}">${c.symbol}</i><span class="dot ${m.color === 'w' ? 'white' : 'black'}"></span><b>${num} ${esc(m.san)}</b><span class="muted">${c.label}</span></button>`;
  });
  const a = (v) => (v == null ? '–' : v.toFixed(1));
  el.innerHTML = `
    <h3>Resumen</h3>
    <div class="acc-row">
      <div class="acc-box w"><span class="acc-num">${a(acc?.w)}</span><span class="acc-name">${esc(h.White || 'Blancas')}</span></div>
      <div class="acc-label" title="100 = jugaste todo como el motor">Precisión</div>
      <div class="acc-box b"><span class="acc-num">${a(acc?.b)}</span><span class="acc-name">${esc(h.Black || 'Negras')}</span></div>
    </div>
    <table class="counts">${rows.join('')}</table>
    ${state.gamePuzzles.length ? `<button class="practice primary" data-x="practice">🧩 Practicar ${state.myColor ? 'mis errores' : 'los errores'} de esta partida (${state.gamePuzzles.length})</button>` : ''}
    ${moments.length ? `<h3>Momentos clave</h3><div class="moments">${moments.join('')}</div>` : ''}
    ${state.opening ? `<p class="muted small center">${esc(state.opening.eco)} · ${esc(state.opening.name)}</p>` : ''}
    <details class="legend"><summary>¿Qué significa cada símbolo?</summary>
      <ul>${SUMMARY_ORDER.map((k) => `<li><i class="badge" style="--c:${CLASSES[k].color}">${CLASSES[k].symbol}</i><b>${CLASSES[k].label}:</b> ${esc(CLASSES[k].desc)}</li>`).join('')}</ul>
      <p class="muted small">La <b>precisión</b> va de 0 a 100: 100 significa que todas tus jugadas fueron las del motor. La evaluación (+1.0, -2.5…) está en peones: positiva es mejor para las blancas, negativa para las negras. «M3» es mate en 3.</p>
    </details>`;
}

function renderProgress() {
  const el = $('#progress');
  if (state.toAnalyze && state.analyzed < state.toAnalyze) {
    const pct = Math.round((state.analyzed / state.toAnalyze) * 100);
    el.hidden = false;
    el.innerHTML = `<div class="bar"><div style="width:${pct}%"></div></div><span>Analizando la partida… ${pct}%</span>`;
  } else {
    el.hidden = true;
  }
}

/* ---------- ciclo de render ---------- */
let accuracy = null;
function recompute() {
  state.results = classifyMoves(state.moves, state.positions, state.book);
  accuracy = gameAccuracy(state.positions.map(whiteWinPct), state.results);
}

function render() {
  if (!state.positions.length) return;
  renderBoard();
  renderEvalBar();
  renderPlayers(accuracy);
  renderMoves();
  renderExplain();
  renderSummary(accuracy);
  renderProgress();
  drawGraph($('#graph'), state);
}

let raf = 0;
function scheduleRender() {
  if (raf) return;
  raf = requestAnimationFrame(() => {
    raf = 0;
    recompute();
    render();
  });
}

function goto(ply) {
  state.variation = null;
  state.ply = Math.max(0, Math.min(state.moves.length, ply));
  render();
}

/* ---------- carga de partida ---------- */
function setStatus(msg, kind = '') {
  const el = $('#status');
  el.className = `status ${kind}`;
  el.innerHTML = msg;
}

function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0).toString(36);
}

async function startGame(pgn, meta = {}) {
  const chess = new Chess();
  try {
    chess.loadPgn(pgn.replace(/\r/g, ''));
  } catch (e) {
    setStatus(`No pude leer esa partida (${esc(e.message)}).`, 'error');
    return;
  }
  const moves = chess.history({ verbose: true });
  if (!moves.length) {
    setStatus('La partida no tiene jugadas.', 'error');
    return;
  }
  state.pool?.terminate();
  state.variation = null;
  state.headers = chess.getHeaders();
  state.moves = moves;
  state.positions = [moves[0].before, ...moves.map((m) => m.after)].map((fen) => {
    const c = new Chess(fen);
    return { fen, legalCount: c.moves().length, terminal: terminalScore(fen), lines: null };
  });
  state.source = meta.url ?? null;

  const db = await loadOpenings();
  state.book = [];
  state.opening = null;
  for (let i = 0; i < moves.length && i < 40; i++) {
    const hit = db[epd(moves[i].after)];
    if (!hit || (i > 0 && !state.book[i - 1])) break;
    state.book[i] = true;
    if (hit[2] || !state.opening) state.opening = { eco: hit[0], name: hit[1], ply: i + 1 };
  }

  const me = (meta.user || '').toLowerCase();
  const myBlack = me && (state.headers.Black || '').toLowerCase() === me;
  const myWhite = me && (state.headers.White || '').toLowerCase() === me;
  state.orientation = myBlack ? 'black' : 'white';
  state.myColor = myBlack ? 'b' : myWhite ? 'w' : null;
  state.gamePuzzles = [];
  state.ply = 0;
  $('#review').hidden = false;
  $('#intro').hidden = true;
  $('body').classList.add('has-game');
  const link = meta.url ? ` · <a href="${esc(meta.url)}" target="_blank" rel="noopener">ver original</a>` : '';
  setStatus(`${esc(state.headers.White || '?')} vs ${esc(state.headers.Black || '?')} · ${esc(state.headers.Result || '')}${link}`);

  const settings = DEPTHS[state.settingsKey];
  state.cacheKey = `pp:a:${state.settingsKey}:${hashStr(state.positions.map((p) => p.fen).join('|'))}`;
  const cached = store.get(state.cacheKey);
  if (cached?.length === state.positions.length) {
    cached.forEach((lines, i) => { if (lines) state.positions[i].lines = lines; });
  }
  const jobs = state.positions
    .map((p, index) => ({ index, fen: p.fen }))
    .filter((j) => !state.positions[j.index].terminal && !state.positions[j.index].lines);
  state.toAnalyze = jobs.length;
  state.analyzed = 0;
  recompute();
  render();
  $('#board').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  if (!jobs.length) {
    finishGame();
    render();
    return;
  }

  const pool = new EnginePool(defaultPoolSize());
  state.pool = pool;
  try {
    await pool.run(jobs, settings, (index, res) => {
      state.positions[index].lines = res.lines;
      state.analyzed++;
      scheduleRender();
    });
  } catch (e) {
    setStatus(`El motor falló: ${esc(e.message)}`, 'error');
  }
  if (state.pool !== pool) return;
  pool.terminate();
  state.pool = null;
  saveCache();
  recompute();
  finishGame();
  scheduleRender();
}

/** Cuando el análisis termina: guarda los errores como ejercicios. */
function finishGame() {
  if (!state.results.every(Boolean)) return;
  const h = state.headers;
  const date = h.Date && !h.Date.includes('?') ? ` · ${h.Date.replace(/./g, '/')}` : '';
  const label = `${h.White || '?'} vs ${h.Black || '?'}${date}`;
  state.gamePuzzles = mistakesFromGame(state.moves, state.positions, state.results, { onlyColor: state.myColor, label });
  if (state.myColor) saveMine(state.gamePuzzles);
  trainer.refresh();
}

function saveCache() {
  const data = state.positions.map((p) => p.lines?.map((l) => ({ score: l.score, pv: l.pv.slice(0, 10) })) ?? null);
  store.set(state.cacheKey, data);
  const idx = store.get('pp:index', []).filter((k) => k !== state.cacheKey);
  idx.push(state.cacheKey);
  while (idx.length > 25) {
    try { localStorage.removeItem(idx.shift()); } catch { /* nada */ }
  }
  store.set('pp:index', idx);
}

async function loadFromInput(text) {
  const parsed = parseInput(text);
  if (!parsed) {
    setStatus('Pega primero el link de una partida.', 'warn');
    $('#game-input').focus();
    return;
  }
  try {
    if (parsed.kind === 'pgn') {
      await startGame(parsed.pgn);
    } else if (parsed.kind === 'lichess') {
      setStatus('Bajando la partida de lichess…');
      const g = await fetchLichessGame(parsed.id);
      await startGame(g.pgn, { url: g.url, user: currentUser('lichess') });
      location.hash = encodeURIComponent(g.url);
    } else if (parsed.kind === 'chesscom') {
      const users = [currentUser('chesscom')].filter(Boolean);
      if (!users.length) {
        setStatus('Para links de chess.com necesito tu <b>usuario de chess.com</b>: escríbelo abajo y vuelve a tocar Analizar (lo recuerdo para la próxima). También puedes pegar el PGN (en chess.com: Compartir → PGN).', 'warn');
        selectPlatform('chesscom');
        $('#username').focus();
        return;
      }
      setStatus('Buscando la partida en chess.com…');
      const g = await findChessComGame(parsed.id, users, { onProgress: (t) => setStatus(esc(t) + '…') });
      if (!g) {
        setStatus(`No encontré esa partida entre las de <b>${esc(users.join(', '))}</b> de los últimos 6 meses. ¿Es de otro jugador? Cambia el usuario o pega el PGN.`, 'warn');
        return;
      }
      await startGame(g.pgn, { url: g.url, user: g.user });
      location.hash = encodeURIComponent(g.url);
    } else {
      setStatus('No reconozco eso. Pega un link de chess.com o lichess, o el PGN de la partida.', 'error');
    }
  } catch (e) {
    setStatus(esc(e instanceof LoadError ? e.message : `Error de red: ${e.message}`), 'error');
  }
}

/* ---------- mis partidas ---------- */
function currentUser(platform) {
  if (state.platform === platform) {
    const v = $('#username').value.trim();
    if (v) return v;
  }
  return store.get(`pp:user:${platform}`, '');
}

function selectPlatform(p) {
  state.platform = p;
  store.set('pp:platform', p);
  document.querySelectorAll('#mine-form .seg button').forEach((b) => b.classList.toggle('on', b.dataset.platform === p));
  $('#username').value = store.get(`pp:user:${p}`, '');
  $('#username').placeholder = p === 'lichess' ? 'Tu usuario de lichess' : 'Tu usuario de chess.com';
}

let lastList = [];
async function showMyGames() {
  const user = $('#username').value.trim();
  if (!user) {
    $('#username').focus();
    return;
  }
  store.set(`pp:user:${state.platform}`, user);
  const list = $('#game-list');
  list.innerHTML = '<li class="muted">Cargando partidas…</li>';
  try {
    lastList = await recentGames(state.platform, user);
    if (!lastList.length) {
      list.innerHTML = '<li class="muted">No encontré partidas recientes.</li>';
      return;
    }
    const me = user.toLowerCase();
    list.innerHTML = lastList.map((g, i) => {
      const iAmWhite = g.white.toLowerCase() === me;
      const won = (g.result === '1-0' && iAmWhite) || (g.result === '0-1' && !iAmWhite);
      const lost = (g.result === '0-1' && iAmWhite) || (g.result === '1-0' && !iAmWhite);
      const res = g.result === '*' ? 'en juego' : won ? 'ganada' : lost ? 'perdida' : 'tablas';
      const opp = iAmWhite ? `${g.black} (${g.blackElo ?? '?'})` : `${g.white} (${g.whiteElo ?? '?'})`;
      return `<li><button data-i="${i}">
        <span class="res ${res}">${res}</span>
        <span class="vs"><span class="dot ${iAmWhite ? 'white' : 'black'}"></span>vs ${esc(opp)}</span>
        <span class="meta">${esc(g.speed ?? '')} · ${g.date.toLocaleDateString('es')}${g.opening ? ' · ' + esc(g.opening) : ''}</span>
      </button></li>`;
    }).join('');
  } catch (e) {
    list.innerHTML = `<li class="error">${esc(e instanceof LoadError ? e.message : `Error de red: ${e.message}`)}</li>`;
  }
}

/* ---------- eventos ---------- */
$('#load-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const u = $('#username').value.trim();
  if (u) store.set(`pp:user:${state.platform}`, u);
  loadFromInput($('#game-input').value);
});
$('#depth').value = state.settingsKey;
$('#depth').addEventListener('change', (e) => {
  state.settingsKey = e.target.value;
  store.set('pp:depth', state.settingsKey);
});
document.querySelectorAll('#mine-form .seg button').forEach((b) => b.addEventListener('click', () => selectPlatform(b.dataset.platform)));
$('#mine-form').addEventListener('submit', (e) => {
  e.preventDefault();
  showMyGames();
});
$('#game-list').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-i]');
  if (!b) return;
  document.body.classList.remove('show-mine');
  const g = lastList[+b.dataset.i];
  $('#game-input').value = g.url;
  location.hash = encodeURIComponent(g.url);
  startGame(g.pgn, { url: g.url, user: $('#username').value.trim() });
});
$('#show-mine').addEventListener('click', () => {
  document.body.classList.toggle('show-mine');
  if (document.body.classList.contains('show-mine')) $('#username').focus();
});
$('#example').addEventListener('click', () => {
  $('#game-input').value = '';
  startGame(EXAMPLE_PGN);
});
$('#moves').addEventListener('click', (e) => {
  const b = e.target.closest('.mv[data-ply]');
  if (b) goto(+b.dataset.ply);
});

// botones dentro del panel de explicación y del resumen
$('#review-panel').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  if (b.dataset.vidx) {
    state.variation.idx = +b.dataset.vidx;
    render();
    return;
  }
  if (b.dataset.jump) {
    const [color, cls] = b.dataset.jump.split(':');
    const i = state.results.findIndex((r) => r.color === color && r.cls === cls);
    if (i >= 0) goto(i + 1);
    return;
  }
  if (b.classList.contains('moment')) {
    goto(+b.dataset.ply);
    return;
  }
  const x = b.dataset.x;
  const p = state.ply;
  if (x === 'best') {
    const pre = state.positions[p - 1];
    const san = uciMove(pre.fen, pre.lines[0].pv[0])?.san ?? '';
    startVariation('best', pre.fen, pre.lines[0], `En vez de <b>${esc(state.moves[p - 1].san)}</b>, lo mejor era <b class="best-san">${esc(san)}</b>. Así sigue la partida si se juega bien:`);
  } else if (x === 'threat') {
    const pos = state.positions[p];
    const san = uciMove(pos.fen, pos.lines[0].pv[0])?.san ?? '';
    startVariation('threat', pos.fen, pos.lines[0], `Después de <b>${esc(state.moves[p - 1].san)}</b>, el rival podía responder <b class="threat-san">${esc(san)}</b>:`);
  } else if (x === 'vprev') stepVariation(-1);
  else if (x === 'vnext') stepVariation(1);
  else if (x === 'vexit') exitVariation();
  else if (x === 'practice') {
    location.hash = 'ejercicios';
    trainer.practice(state.gamePuzzles, `${state.headers.White || '?'} vs ${state.headers.Black || '?'}`);
  }
  else if (x === 'nextkey') {
    const k = firstKey(p);
    if (k != null) goto(k);
  }
});

$('#nav').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  const a = b.dataset.act;
  if (state.variation && ['prev', 'next'].includes(a)) {
    stepVariation(a === 'prev' ? -1 : 1);
    return;
  }
  if (a === 'first') goto(0);
  else if (a === 'prev') goto(state.ply - 1);
  else if (a === 'next') goto(state.ply + 1);
  else if (a === 'last') goto(state.moves.length);
  else if (a === 'flip') {
    state.orientation = state.orientation === 'white' ? 'black' : 'white';
    render();
  } else if (a === 'engine') {
    state.showEngine = !state.showEngine;
    store.set('pp:engine', state.showEngine);
    b.classList.toggle('on', state.showEngine);
    render();
  }
});
$('#nav [data-act=engine]').classList.toggle('on', state.showEngine);

document.addEventListener('keydown', (e) => {
  if (e.target.closest('input, textarea, select') || $('#review').hidden || $('#tab-review').hidden) return;
  if (state.variation) {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      stepVariation(e.key === 'ArrowLeft' ? -1 : 1);
      return;
    }
    if (e.key === 'Escape') {
      exitVariation();
      return;
    }
  }
  const k = { ArrowLeft: -1, ArrowRight: 1 }[e.key];
  if (k) { e.preventDefault(); goto(state.ply + k); }
  else if (e.key === 'ArrowUp' || e.key === 'Home') { e.preventDefault(); goto(0); }
  else if (e.key === 'ArrowDown' || e.key === 'End') { e.preventDefault(); goto(state.moves.length); }
  else if (e.key === 'f') { state.orientation = state.orientation === 'white' ? 'black' : 'white'; render(); }
});

const graph = $('#graph');
graph.addEventListener('click', (e) => {
  const ply = graphPlyAt(graph, state, e.clientX);
  if (ply != null) goto(ply);
});
new ResizeObserver(() => state.moves.length && drawGraph(graph, state)).observe(graph);

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

/* ---------- pestañas ---------- */
const trainer = initTrainer();

/* ---------- sonido ---------- */
function renderSoundBtn() {
  const b = $('#sound');
  b.textContent = soundOn() ? '🔊' : '🔇';
  b.title = soundOn() ? 'Silenciar sonidos' : 'Activar sonidos';
  b.setAttribute('aria-pressed', String(soundOn()));
}
$('#sound').addEventListener('click', () => {
  setSound(!soundOn());
  renderSoundBtn();
});
renderSoundBtn();
function showTab() {
  const puzzles = location.hash === '#ejercicios';
  $('#tab-review').hidden = puzzles;
  $('#tab-puzzles').hidden = !puzzles;
  document.querySelectorAll('.tabs a').forEach((a) => a.classList.toggle('on', (a.dataset.tab === 'puzzles') === puzzles));
  if (puzzles) trainer.show();
  else if (state.positions.length) render();
}
window.addEventListener('hashchange', showTab);
document.querySelector('.tabs [data-tab=review]').addEventListener('click', (e) => {
  e.preventDefault();
  location.hash = state.source ? encodeURIComponent(state.source) : '';
  showTab();
});

/* ---------- portada ---------- */
function heroBoard() {
  const c = new Chess();
  c.loadPgn(EXAMPLE_PGN);
  const m = c.history({ verbose: true }).find((x) => x.san === 'Qb8+');
  if (!m) return;
  const hero = Chessground($('#hero-board'), {
    fen: m.after,
    viewOnly: true,
    coordinates: false,
    lastMove: [m.from, m.to],
    drawable: { enabled: false, visible: true, brushes: { best: { key: 'bst', color: '#7cbf4b', opacity: 0.85, lineWidth: 11 } } },
  });
  hero.setAutoShapes([
    { orig: 'b8', customSvg: { html: badgeSvg('brilliant') } },
    { orig: 'd1', dest: 'd8', brush: 'best' },
  ]);
}
heroBoard();
$('#intro').addEventListener('click', (e) => {
  const b = e.target.closest('[data-go]');
  if (!b) return;
  const [mode, sub] = b.dataset.go.split(':');
  trainer.preset(mode);
  location.hash = 'ejercicios';
  showTab();
  if (sub) document.querySelector(`.op-mode [data-m=${sub}]`)?.click();
  window.scrollTo({ top: 0 });
});

/* ---------- inicio ---------- */
selectPlatform(state.platform);
showTab();
const fromHash = decodeURIComponent(location.hash.slice(1));
if (/^https?:\/\//.test(fromHash)) {
  $('#game-input').value = fromHash;
  loadFromInput(fromHash);
}
loadOpenings();
