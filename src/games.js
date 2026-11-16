// Obtener partidas de chess.com y lichess usando sus APIs públicas (sin login).

const CHESSCOM = 'https://api.chess.com/pub/player';

export class LoadError extends Error {}

/** Detecta qué pegó el usuario: link de lichess, link de chess.com o PGN. */
export function parseInput(text) {
  const s = text.trim();
  if (!s) return null;
  const li = s.match(/lichess\.org\/(?:embed\/(?:game\/)?)?([a-zA-Z0-9]{8})(?:[a-zA-Z0-9]{4})?\b/);
  if (li && !/lichess\.org\/(study|broadcast|@|training|tv)\b/.test(s)) return { kind: 'lichess', id: li[1] };
  const cc = s.match(/chess\.com\/(?:analysis\/)?(?:game\/)?(live|daily)\/(?:game\/)?(\d+)/);
  if (cc) return { kind: 'chesscom', type: cc[1], id: cc[2] };
  if (/^\s*\[|\b1\.\s*\S/.test(s)) return { kind: 'pgn', pgn: s };
  return { kind: 'unknown' };
}

async function getJson(url) {
  const r = await fetch(url);
  if (r.status === 404) throw new LoadError('No encontrado');
  if (!r.ok) throw new LoadError(`El servidor respondió ${r.status}`);
  return r.json();
}

export async function fetchLichessGame(id) {
  const r = await fetch(`https://lichess.org/game/export/${id}?evals=false&literate=false`, {
    headers: { Accept: 'application/x-chess-pgn' },
  });
  if (r.status === 404) throw new LoadError('Esa partida de lichess no existe.');
  if (!r.ok) throw new LoadError(`lichess respondió ${r.status}.`);
  return { pgn: await r.text(), source: 'lichess', url: `https://lichess.org/${id}` };
}

/**
 * chess.com no tiene una API pública para pedir una partida por su número, así
 * que la buscamos en los archivos mensuales de los usuarios que conocemos.
 */
export async function findChessComGame(id, usernames, { months = 6, onProgress } = {}) {
  for (const user of usernames) {
    let archives;
    try {
      archives = (await getJson(`${CHESSCOM}/${encodeURIComponent(user.toLowerCase())}/games/archives`)).archives;
    } catch {
      continue;
    }
    const recent = archives.slice(-months).reverse();
    for (const url of recent) {
      onProgress?.(`Buscando en ${user} · ${url.slice(-7)}`);
      const { games } = await getJson(url);
      const g = games.find((x) => x.url?.endsWith(`/${id}`));
      if (g) return { pgn: g.pgn, source: 'chess.com', url: g.url, user };
    }
  }
  return null;
}

/** Últimas partidas de un usuario (chess.com o lichess). */
export async function recentGames(platform, username, max = 30) {
  const u = username.trim();
  if (!u) return [];
  if (platform === 'lichess') {
    const r = await fetch(
      `https://lichess.org/api/games/user/${encodeURIComponent(u)}?max=${max}&pgnInJson=true&opening=true`,
      { headers: { Accept: 'application/x-ndjson' } },
    );
    if (r.status === 404) throw new LoadError('Ese usuario no existe en lichess.');
    if (!r.ok) throw new LoadError(`lichess respondió ${r.status}.`);
    const text = await r.text();
    return text.split('\n').filter(Boolean).map((line) => {
      const g = JSON.parse(line);
      const p = (c) => g.players[c].user?.name ?? (g.players[c].aiLevel ? `Stockfish nivel ${g.players[c].aiLevel}` : 'Anónimo');
      return {
        url: `https://lichess.org/${g.id}`,
        pgn: g.pgn,
        white: p('white'),
        black: p('black'),
        whiteElo: g.players.white.rating,
        blackElo: g.players.black.rating,
        result: g.winner === 'white' ? '1-0' : g.winner === 'black' ? '0-1' : g.status === 'started' ? '*' : '½-½',
        date: new Date(g.createdAt),
        speed: g.speed,
        opening: g.opening?.name,
      };
    });
  }
  let archives;
  try {
    archives = (await getJson(`${CHESSCOM}/${encodeURIComponent(u.toLowerCase())}/games/archives`)).archives;
  } catch (e) {
    throw new LoadError(e.message === 'No encontrado' ? 'Ese usuario no existe en chess.com.' : e.message);
  }
  const out = [];
  for (const url of archives.slice().reverse()) {
    const { games } = await getJson(url);
    for (const g of games.slice().reverse()) {
      if (!g.pgn || (g.rules && g.rules !== 'chess')) continue;
      out.push({
        url: g.url,
        pgn: g.pgn,
        white: g.white.username,
        black: g.black.username,
        whiteElo: g.white.rating,
        blackElo: g.black.rating,
        result: g.white.result === 'win' ? '1-0' : g.black.result === 'win' ? '0-1' : '½-½',
        date: new Date((g.end_time ?? 0) * 1000),
        speed: g.time_class,
        opening: (g.pgn.match(/\[ECOUrl ".*\/openings\/([^"]+)"\]/)?.[1] ?? '').replace(/-/g, ' '),
      });
      if (out.length >= max) return out;
    }
    if (out.length >= 10) return out; // con el último mes alcanza si ya hay varias
  }
  return out;
}
