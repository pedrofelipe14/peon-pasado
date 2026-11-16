// Grupo de workers de Stockfish (versión lite, un hilo). Como la versión de un
// hilo no necesita SharedArrayBuffer, funciona en cualquier hosting estático;
// el paralelismo lo conseguimos lanzando varios motores a la vez.

const ENGINE_URL = new URL('engine/stockfish-19-lite-single.js', document.baseURI).href;

export class EngineWorker {
  constructor() {
    this.worker = new Worker(ENGINE_URL);
    this.listener = null;
    this.worker.onmessage = (e) => this.listener?.(String(e.data));
    // Si el worker se cae (por ejemplo, sin memoria), lo avisamos para reemplazarlo.
    this.failed = new Promise((_, reject) => {
      this.worker.onerror = (e) => reject(new Error(e.message || 'el motor se detuvo'));
    });
    this.failed.catch(() => {});
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

const timeout = (ms) => new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms));

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
    // Tiempo máximo por posición: si un motor no contesta, se reemplaza.
    const limit = settings.movetime * 3 + 15000;
    const loop = async (slot) => {
      while (queue.length && !this.closed) {
        const job = queue.shift();
        const w = this.workers[slot];
        let res;
        try {
          res = await Promise.race([w.analyze(job.fen, settings), w.failed, timeout(limit)]);
        } catch (e) {
          if (this.closed) return;
          w.terminate();
          this.workers[slot] = new EngineWorker();
          job.tries = (job.tries ?? 0) + 1;
          if (job.tries <= 2) queue.push(job);
          else onResult(job.index, { lines: [], depth: 0, error: e.message });
          continue;
        }
        if (this.closed) return;
        onResult(job.index, res);
      }
    };
    await Promise.all(this.workers.map((_, slot) => loop(slot)));
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
