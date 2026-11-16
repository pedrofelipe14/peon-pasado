// Grupo de workers de Stockfish (versión lite, un hilo). Como la versión de un
// hilo no necesita SharedArrayBuffer, funciona en cualquier hosting estático;
// el paralelismo lo conseguimos lanzando varios motores a la vez.

const ENGINE_URL = new URL('engine/stockfish-19-lite-single.js', document.baseURI).href;

class EngineWorker {
  constructor() {
    this.worker = new Worker(ENGINE_URL);
    this.listener = null;
    this.worker.onmessage = (e) => this.listener?.(String(e.data));
    this.ready = this.handshake();
  }

  send(cmd) {
    this.worker.postMessage(cmd);
  }

  waitFor(prefix, onLine) {
    return new Promise((resolve) => {
      this.listener = (line) => {
        onLine?.(line);
        if (line.startsWith(prefix)) {
          this.listener = null;
          resolve(line);
        }
      };
    });
  }

  async handshake() {
    const ok = this.waitFor('uciok');
    this.send('uci');
    await ok;
    this.send('setoption name MultiPV value 2');
    this.send('setoption name Hash value 32');
    const ready = this.waitFor('readyok');
    this.send('isready');
    await ready;
  }

  async analyze(fen, { depth, movetime }) {
    await this.ready;
    const lines = [];
    let reached = 0;
    const done = this.waitFor('bestmove', (line) => {
      if (!line.startsWith('info') || !line.includes(' pv ') || !line.includes(' score ')) return;
      if (line.includes('lowerbound') || line.includes('upperbound')) return;
      const t = line.split(' ');
      const at = (k) => t.indexOf(k);
      const d = +t[at('depth') + 1];
      const mpv = at('multipv') >= 0 ? +t[at('multipv') + 1] : 1;
      const kind = t[at('score') + 1];
      const val = +t[at('score') + 2];
      const pv = t.slice(at('pv') + 1);
      lines[mpv - 1] = { depth: d, score: kind === 'mate' ? { mate: val } : { cp: val }, pv };
      if (mpv === 1) reached = d;
    });
    this.send(`position fen ${fen}`);
    this.send(`go depth ${depth} movetime ${movetime}`);
    await done;
    return { lines: lines.filter(Boolean), depth: reached };
  }

  terminate() {
    this.worker.terminate();
  }
}

export class EnginePool {
  constructor(size) {
    this.size = size;
    this.workers = Array.from({ length: size }, () => new EngineWorker());
    this.closed = false;
  }

  /**
   * Analiza una lista de trabajos con todos los motores a la vez.
   * jobs: [{ index, fen }] — onResult(index, result) se llama a medida que terminan.
   */
  async run(jobs, settings, onResult) {
    const queue = [...jobs];
    const loop = async (w) => {
      while (queue.length && !this.closed) {
        const job = queue.shift();
        const res = await w.analyze(job.fen, settings);
        if (this.closed) return;
        onResult(job.index, res);
      }
    };
    await Promise.all(this.workers.map(loop));
  }

  terminate() {
    this.closed = true;
    this.workers.forEach((w) => w.terminate());
  }
}

export function defaultPoolSize() {
  const hc = navigator.hardwareConcurrency || 4;
  return Math.max(1, Math.min(6, hc - 1));
}
