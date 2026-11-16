import { Chess } from 'chess.js';
import { Chessground } from '@lichess-org/chessground';
import '@lichess-org/chessground/assets/chessground.base.css';
import '@lichess-org/chessground/assets/chessground.cburnett.css';
import './style.css';
import {
  CLASSES, SUMMARY_ORDER, classifyMoves, gameAccuracy, whiteWinPct, bestScore, toWhite,
  formatScore, terminalScore, pvToSan,
} from './analysis.js';
import { EnginePool, defaultPoolSize } from './engine.js';
import { parseInput, fetchLichessGame, findChessComGame, recentGames, LoadError } from './games.js';
import { drawGraph, graphPlyAt } from './graph.js';

const $ = (sel) => document.querySelector(sel);
const DEPTHS = {
  fast: { depth: 12, movetime: 800, label: 'Rápido' },
  normal: { depth: 16, movetime: 2000, label: 'Normal' },
  deep: { depth: 20, movetime: 5000, label: 'Profundo' },
};

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
  platform: store.get('pp:platform', 'chesscom'), source: null,
};

let openingDb = null;
const loadOpenings = () =>
  (openingDb ??= fetch('openings.json').then((r) => r.json()).catch(() => ({})));
const epd = (fen) => fen.split(' ').slice(0, 4).join(' ');

/* ---------- tablero ---------- */
const cg = Chessground($('#board'), {
  viewOnly: true,
  coordinates: true,
  animation: { enabled: true, duration: 160 },
  highlight: { lastMove: true, check: true },
  drawable: {
    enabled: false,
    visible: true,
    brushes: {
      best: { key: 'bst', color: '#7cbf4b', opacity: 0.85, lineWidth: 11 },
      engine: { key: 'eng', color: '#5c8fe0', opacity: 0.75, lineWidth: 9 },
    },
  },
});

function badgeSvg(cls) {
  const c = CLASSES[cls];
  const size = c.symbol.length > 1 ? 13 : 16;
  return `<g transform="translate(70 2)"><circle cx="14" cy="14" r="13" fill="${c.color}" stroke="rgba(0,0,0,.45)" stroke-width="1.5"/>`
    + `<text x="14" y="${14 + size * 0.36}" font-size="${size}" font-weight="800" text-anchor="middle" fill="#fff" font-family="system-ui,sans-serif">${c.symbol}</text></g>`;
}

function renderBoard() {
  const p = state.ply;
  const pos = state.positions[p];
  if (!pos) return;
  const move = state.moves[p - 1];
  const turn = pos.fen.split(' ')[1] === 'w' ? 'white' : 'black';
  const inCheck = new Chess(pos.fen).inCheck();
  cg.set({
    fen: pos.fen,
    orientation: state.orientation,
    turnColor: turn,
    check: inCheck ? turn : false,
    lastMove: move ? [move.from, move.to] : undefined,
  });
  const shapes = [];
  const r = move && state.results[p - 1];
  if (r) {
    shapes.push({ orig: move.to, customSvg: { html: badgeSvg(r.cls) } });
    if (!r.isBest && r.bestUci && !['book', 'forced', 'best'].includes(r.cls)) {
      shapes.push({ orig: r.bestUci.slice(0, 2), dest: r.bestUci.slice(2, 4), brush: 'best' });
    }
  }
  const next = pos.lines?.[0]?.pv?.[0];
  if (state.showEngine && next) {
    shapes.push({ orig: next.slice(0, 2), dest: next.slice(2, 4), brush: 'engine' });
  }
  cg.setAutoShapes(shapes);
  $('#board').dataset.cls = r?.cls ?? '';
}

/* ---------- barra de evaluación ---------- */
function renderEvalBar() {
  const pos = state.positions[state.ply];
  const w = whiteWinPct(pos);
  const bar = $('#evalbar');
  bar.classList.toggle('flipped', state.orientation === 'black');
  bar.classList.toggle('pending', w == null);
  const pct = w ?? 50;
  bar.style.setProperty('--white', `${pct}%`);
  const s = toWhite(bestScore(pos), pos.fen);
  $('#evalbar-text').textContent = s ? (s.mate === 0 ? (s.whiteMated ? '0-1' : '1-0') : formatScore(s).replace('+', '')) : '';
  $('#evalbar-text').classList.toggle('dark', pct >= 50);
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
    const a = i.acc != null ? `<span class="acc-chip ${color}">${i.acc.toFixed(1)}</span>` : '';
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
  const firstNum = state.positions[0] ? +state.positions[0].fen.split(' ')[5] : 1;
  let i = 0;
  let num = firstNum;
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
  const r = state.results[i];
  const cls = r?.cls;
  const badge = cls
    ? `<i class="badge" style="--c:${CLASSES[cls].color}" title="${CLASSES[cls].label}">${CLASSES[cls].symbol}</i>`
    : '<i class="badge pending"></i>';
  const active = state.ply === i + 1 ? ' active' : '';
  return `<button class="mv${active}" data-ply="${i + 1}">${badge}<span>${esc(m.san)}</span></button>`;
}

/* ---------- explicación de la jugada ---------- */
const PHRASES = {
  brilliant: (s) => `<b>${s}</b> es brillante: entrega material y funciona.`,
  great: (s) => `<b>${s}</b> es una gran jugada: era la única buena.`,
  best: (s) => `<b>${s}</b> es la mejor jugada.`,
  excellent: (s) => `<b>${s}</b> es excelente.`,
  good: (s) => `<b>${s}</b> es una buena jugada.`,
  book: (s) => `<b>${s}</b> es teoría de apertura.`,
  forced: (s) => `<b>${s}</b> era la única jugada legal.`,
  inaccuracy: (s) => `<b>${s}</b> es una imprecisión.`,
  mistake: (s) => `<b>${s}</b> es un error.`,
  miss: (s) => `<b>${s}</b> deja pasar una oportunidad.`,
  blunder: (s) => `<b>${s}</b> es un error grave.`,
};

function lineHtml(fen, pv, n = 7) {
  const sans = pvToSan(fen, pv, n);
  const c = new Chess(fen);
  let num = +fen.split(' ')[5];
  let white = c.turn() === 'w';
  const out = [];
  sans.forEach((s, k) => {
    if (white) out.push(`${num}.`);
    else if (k === 0) out.push(`${num}…`);
    out.push(esc(s));
    if (!white) num++;
    white = !white;
  });
  return out.join(' ');
}

function renderExplain() {
  const el = $('#explain');
  const p = state.ply;
  const pos = state.positions[p];
  const evalTxt = (fen, s) => {
    const w = toWhite(s, fen);
    return w ? `<span class="eval-chip ${w.mate === 0 ? '' : (w.mate ?? w.cp) >= 0 ? 'w' : 'b'}">${w.mate === 0 ? '#' : formatScore(w)}</span>` : '';
  };
  if (p === 0) {
    const name = state.opening ? `<p class="muted">${esc(state.opening.eco)} · ${esc(state.opening.name)}</p>` : '';
    el.innerHTML = `<div class="ex-head"><span>Posición inicial</span>${evalTxt(pos.fen, bestScore(pos))}</div>${name}`
      + (pos.lines?.[0] ? `<p class="line"><span class="muted">Mejor:</span> ${lineHtml(pos.fen, pos.lines[0].pv)}</p>` : '');
    return;
  }
  const m = state.moves[p - 1];
  const r = state.results[p - 1];
  const pre = state.positions[p - 1];
  if (!r) {
    el.innerHTML = `<div class="ex-head"><span><b>${esc(m.san)}</b></span></div><p class="muted">Analizando…</p>`;
    return;
  }
  const c = CLASSES[r.cls];
  let html = `<div class="ex-head"><i class="badge big" style="--c:${c.color}">${c.symbol}</i><span>${PHRASES[r.cls](esc(m.san))}</span>${evalTxt(pos.fen, bestScore(pos))}</div>`;
  if (r.cls === 'book' && state.opening && p <= state.opening.ply) {
    html += `<p class="muted">${esc(state.opening.eco)} · ${esc(state.opening.name)}</p>`;
  }
  if (!r.isBest && r.bestUci && !['book', 'forced'].includes(r.cls)) {
    const bestSan = pvToSan(pre.fen, [r.bestUci])[0];
    const ms = pre.lines[0].score;
    const mateTxt = ms.mate > 0 ? ` (mate en ${ms.mate})` : '';
    html += `<p>Lo mejor era <b class="best-san">${esc(bestSan)}</b>${mateTxt}.</p>`;
    html += `<p class="line"><span class="muted">Línea:</span> ${lineHtml(pre.fen, pre.lines[0].pv)}</p>`;
  }
  const side = m.color === 'w' ? 'blancas' : 'negras';
  html += `<p class="muted small">Probabilidad de ganar de las ${side}: ${Math.round(r.winBefore)}% → ${Math.round(r.winAfter)}%</p>`;
  if (pos.terminal) {
    html += `<p class="final">${pos.terminal.mate === 0 ? 'Jaque mate.' : 'Tablas.'}</p>`;
  } else if (state.showEngine && pos.lines?.[0]) {
    html += `<p class="line"><span class="muted">Ahora:</span> ${lineHtml(pos.fen, pos.lines[0].pv)}</p>`;
  }
  el.innerHTML = html;
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
  const rows = SUMMARY_ORDER.filter((k) => count.w[k] || count.b[k]).map((k) => {
    const c = CLASSES[k];
    return `<tr><td class="n">${count.w[k] ?? 0}</td><td class="lbl"><i class="badge" style="--c:${c.color}">${c.symbol}</i>${c.label}</td><td class="n">${count.b[k] ?? 0}</td></tr>`;
  });
  const a = (v) => (v == null ? '–' : v.toFixed(1));
  el.innerHTML = `
    <div class="acc-row">
      <div class="acc-box w"><span class="acc-num">${a(acc?.w)}</span><span class="acc-name">${esc(h.White || 'Blancas')}</span></div>
      <div class="acc-label">Precisión</div>
      <div class="acc-box b"><span class="acc-num">${a(acc?.b)}</span><span class="acc-name">${esc(h.Black || 'Negras')}</span></div>
    </div>
    <table class="counts">${rows.join('')}</table>
    ${state.opening ? `<p class="muted small center">${esc(state.opening.eco)} · ${esc(state.opening.name)}</p>` : ''}`;
}

function renderProgress() {
  const el = $('#progress');
  if (state.toAnalyze && state.analyzed < state.toAnalyze) {
    const pct = Math.round((state.analyzed / state.toAnalyze) * 100);
    el.hidden = false;
    el.innerHTML = `<div class="bar"><div style="width:${pct}%"></div></div><span>Analizando ${state.analyzed}/${state.toAnalyze} posiciones · ${DEPTHS[state.settingsKey].label.toLowerCase()} (prof. ${DEPTHS[state.settingsKey].depth})</span>`;
  } else {
    el.hidden = true;
  }
}

/* ---------- ciclo de render ---------- */
let accuracy = null;
function recompute() {
  state.results = classifyMoves(state.moves, state.positions, state.book);
  const wins = state.positions.map(whiteWinPct);
  accuracy = gameAccuracy(wins, state.results);
}

function render() {
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
  state.orientation = me && (state.headers.Black || '').toLowerCase() === me ? 'black' : 'white';
  state.ply = 0;
  $('#review').hidden = false;
  $('body').classList.add('has-game');
  const link = meta.url ? ` · <a href="${esc(meta.url)}" target="_blank" rel="noopener">ver original</a>` : '';
  setStatus(`${esc(state.headers.White || '?')} vs ${esc(state.headers.Black || '?')} · ${esc(state.headers.Result || '')}${link}`);

  // análisis guardado
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
  if (!jobs.length) return;

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
  scheduleRender();
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
  if (!parsed) return;
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
        setStatus('chess.com no deja bajar una partida solo con el link. Escribe tu <b>usuario de chess.com</b> abajo (lo recuerdo para la próxima) y vuelve a darle a Analizar, o pega el PGN (en chess.com: Compartir → PGN).', 'warn');
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
  document.querySelectorAll('.seg button').forEach((b) => b.classList.toggle('on', b.dataset.platform === p));
  $('#username').value = store.get(`pp:user:${p}`, '');
  $('#username').placeholder = p === 'lichess' ? 'Usuario de lichess' : 'Usuario de chess.com';
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
document.querySelectorAll('.seg button').forEach((b) => b.addEventListener('click', () => selectPlatform(b.dataset.platform)));
$('#mine-form').addEventListener('submit', (e) => {
  e.preventDefault();
  showMyGames();
});
$('#game-list').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-i]');
  if (!b) return;
  const g = lastList[+b.dataset.i];
  $('#game-input').value = g.url;
  location.hash = encodeURIComponent(g.url);
  startGame(g.pgn, { url: g.url, user: $('#username').value.trim() });
});
$('#moves').addEventListener('click', (e) => {
  const b = e.target.closest('.mv[data-ply]');
  if (b) goto(+b.dataset.ply);
});
$('#nav').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  const a = b.dataset.act;
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
  if (e.target.closest('input, textarea, select') || $('#review').hidden) return;
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

/* ---------- inicio ---------- */
selectPlatform(state.platform);
const fromHash = decodeURIComponent(location.hash.slice(1));
if (/^https?:\/\//.test(fromHash)) {
  $('#game-input').value = fromHash;
  loadFromInput(fromHash);
}
loadOpenings();
