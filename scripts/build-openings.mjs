// Convierte las TSV de lichess-org/chess-openings (CC0) en un mapa
// posición (EPD) -> [eco, nombre], incluyendo las posiciones intermedias.
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Chess } from 'chess.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dir = join(root, 'data', 'openings');
const named = new Map(); // epd -> [eco, name, plies]
const passed = new Map(); // epd -> [eco, name, plies] (shortest line through it)

const epd = (fen) => fen.split(' ').slice(0, 4).join(' ');
const lines = []; // [eco, name, "e2e4 e7e5 ..."] para el entrenador de aperturas

for (const file of readdirSync(dir).filter((f) => f.endsWith('.tsv')).sort()) {
  const rows = readFileSync(join(dir, file), 'utf8').split('\n').slice(1);
  for (const row of rows) {
    if (!row.trim()) continue;
    const [eco, name, pgn] = row.split('\t');
    const chess = new Chess();
    chess.loadPgn(pgn);
    const moves = chess.history();
    lines.push([eco, name, chess.history({ verbose: true }).map((m) => m.lan).join(' ')]);
    const walk = new Chess();
    moves.forEach((san, i) => {
      walk.move(san);
      const key = epd(walk.fen());
      const plies = i + 1;
      if (plies === moves.length) {
        const prev = named.get(key);
        if (!prev || prev[2] > plies) named.set(key, [eco, name, plies]);
      } else {
        const prev = passed.get(key);
        if (!prev || prev[2] > moves.length) passed.set(key, [eco, name, moves.length]);
      }
    });
  }
}

const out = {};
for (const [k, v] of passed) out[k] = [v[0], v[1], 0];
for (const [k, v] of named) out[k] = [v[0], v[1], 1];
mkdirSync(join(root, 'public'), { recursive: true });
writeFileSync(join(root, 'public', 'openings.json'), JSON.stringify(out));
writeFileSync(join(root, 'public', 'opening-lines.json'), JSON.stringify(lines));
console.log(`opening-lines.json: ${lines.length} lines`);
console.log(`openings.json: ${Object.keys(out).length} positions`);
