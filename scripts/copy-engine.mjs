// Copia Stockfish (lite, un hilo) a public/engine para que se sirva junto a la página.
import { mkdirSync, copyFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'node_modules', 'stockfish', 'bin');
const out = join(root, 'public', 'engine');
mkdirSync(out, { recursive: true });
for (const f of ['stockfish-19-lite-single.js', 'stockfish-19-lite-single.wasm']) {
  copyFileSync(join(src, f), join(out, f));
}
copyFileSync(join(root, 'node_modules', 'stockfish', 'Copying.txt'), join(out, 'COPYING.txt'));
console.log('engine copied to public/engine');
