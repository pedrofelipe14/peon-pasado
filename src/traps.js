// Trampas de apertura: para tenderlas (kind 'set') y para defenderte de las
// más comunes (kind 'defend'). Cada jugada puede ser un SAN o un objeto:
//   { s: SAN, n: nota que se muestra después de jugarla,
//     w: { SAN: explicación } para errores tentadores en ese momento,
//     alt: { SAN: comentario } otras jugadas buenas (terminan la lección) }
// `start`: cuántas jugadas se ponen solas antes de que empieces a jugar.
import { Chess } from 'chess.js';

export const TRAPS = [
  /* ---------- para tender ---------- */
  {
    id: 'pastor', kind: 'set', side: 'w', start: 0, mate: true,
    name: 'Mate del pastor', opening: 'Apertura de peón de rey',
    explain: 'El mate más famoso entre principiantes: dama y alfil atacan f7, que al principio solo defiende el rey. Sirve para entender la idea, pero contra alguien que lo conoce (g6 o Qe7) tu dama queda expuesta y pierdes tiempo.',
    moves: ['e4', 'e5', { s: 'Bc4', n: 'El alfil apunta a f7.' }, 'Nc6',
      { s: 'Qh5', n: 'La dama también apunta a f7. Amenaza mate.' },
      { s: 'Nf6', n: 'Las negras atacan tu dama… pero no defienden f7.' },
      { s: 'Qxf7#', n: '¡Jaque mate! El rey no puede comer la dama porque la protege el alfil.' }],
  },
  {
    id: 'legal', kind: 'set', side: 'w', start: 0, mate: true,
    name: 'Mate de Légal', opening: 'Defensa Philidor',
    explain: 'El alfil de g4 «clava» tu caballo contra la dama, pero es una clavada falsa: puedes mover el caballo y regalar la dama, porque si te la comen das mate con las piezas menores.',
    moves: ['e4', 'e5', 'Nf3', 'd6', 'Bc4', { s: 'Bg4', n: 'El alfil clava el caballo contra tu dama… o eso parece.' }, 'Nc3',
      { s: 'g6', n: 'Una jugada lenta. Ahora llega el golpe.' },
      { s: 'Nxe5', n: '¡Entregas la dama! El caballo come e5 y ataca f7.' },
      { s: 'Bxd1', n: 'Las negras se comen la dama. Error fatal.' },
      { s: 'Bxf7+', n: 'Jaque. El rey solo tiene e7.' }, 'Ke7',
      { s: 'Nd5#', n: '¡Mate con tres piezas menores contra el rey que se quedó con la dama de regalo!' }],
  },
  {
    id: 'caro', kind: 'set', side: 'w', start: 0, mate: true,
    name: 'Trampa de la Caro-Kann (Nd6#)', opening: 'Caro-Kann',
    explain: 'Con la dama en e2, el peón de e7 queda clavado contra el rey. Si las negras desarrollan el caballo de g8 a f6 sin cuidado, Nd6 es mate ahogado: el peón no puede comer al caballo.',
    moves: ['e4', 'c6', 'd4', 'd5', 'Nc3', 'dxe4', 'Nxe4', 'Nd7',
      { s: 'Qe2', n: 'Parece una jugada rara, pero tu dama clava el peón de e7.' },
      { s: 'Ngf6', n: 'La jugada más natural… y un error grave.' },
      { s: 'Nd6#', n: '¡Mate! El peón de e7 no puede comer porque está clavado, y el rey está rodeado por sus piezas.' }],
  },
  {
    id: 'englund', kind: 'set', side: 'b', start: 1, mate: true,
    name: 'Gambito Englund: trampa', opening: '1.d4 e5',
    explain: 'Un gambito sorpresa contra 1.d4. Tu dama se come el peón de b2 y, si las blancas atacan la dama con Bc3, Bb4 deja todo listo para un mate en la primera fila.',
    moves: ['d4', { s: 'e5', n: 'Entregas un peón para salir del libro.' }, 'dxe5', { s: 'Qe7', n: 'La dama presiona e5.' }, 'Nf3', 'Nc6', 'Bf4',
      { s: 'Qb4+', n: 'Jaque doble de intención: ataca el alfil y el peón de b2.' }, 'Bd2', 'Qxb2',
      { s: 'Bc3', n: 'Las blancas atacan tu dama. Parece que la tienes que mover…' },
      { s: 'Bb4', n: '¡No! Clavas el alfil y la dama sigue amenazando c1.' }, 'Qd2', 'Bxc3', 'Qxc3',
      { s: 'Qc1#', n: '¡Mate! El caballo de b1 tapa a la torre y el rey no tiene salida.' }],
  },
  {
    id: 'blackburne', kind: 'set', side: 'b', start: 1, mate: true,
    name: 'Trampa Blackburne-Shilling', opening: 'Italiana',
    explain: 'Contra la Italiana dejas el peón de e5 colgado a propósito. Si las blancas lo comen, tu dama entra con ataque doble y, si además comen f7, das mate.',
    moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4',
      { s: 'Nd4', n: 'Parece un error: e5 queda sin defensa. Es el cebo.' },
      { s: 'Nxe5', n: 'Las blancas muerden.' },
      { s: 'Qg5', n: '¡Ataque doble! La dama ataca el caballo de e5 y el peón de g2.' },
      { s: 'Nxf7', n: 'Ataca tu dama y la torre… pero es demasiado tarde.' },
      { s: 'Qxg2', n: 'La dama ataca la torre de h1.' }, 'Rf1',
      { s: 'Qxe4+', n: 'Jaque. Las blancas tienen que tapar con el alfil.' }, 'Be2',
      { s: 'Nf3#', n: '¡Mate ahogado! El alfil de e2 está clavado por tu dama y no puede comer al caballo.' }],
  },
  {
    id: 'elefante', kind: 'set', side: 'b', start: 1,
    name: 'Trampa del elefante', opening: 'Gambito de dama declinado',
    explain: 'El caballo de f6 parece clavado contra la dama, y las blancas «ganan» un peón con Nxd5. Pero la clavada es falsa: sueltas la dama y la recuperas con jaque, quedando con una pieza de más.',
    moves: ['d4', 'd5', 'c4', 'e6', 'Nc3', 'Nf6', 'Bg5',
      { s: 'Nbd7', n: 'Desarrollas y, sin que se note, preparas la trampa.' }, 'cxd5', 'exd5',
      { s: 'Nxd5', n: 'Las blancas creen que el caballo de f6 está clavado y se comen el peón.' },
      { s: 'Nxd5', n: '¡Entregas la dama!' },
      { s: 'Bxd8', n: 'Las blancas se la comen…' },
      { s: 'Bb4+', n: '…pero el jaque obliga a tapar con la dama.' }, 'Qd2',
      { s: 'Bxd2+', n: 'Te comes la dama con jaque.' }, 'Kxd2',
      { s: 'Kxd8', n: 'Cambiaste damas y te quedaste con una pieza de más. ¡Trampa cumplida!' }],
  },

  /* ---------- para defenderte ---------- */
  {
    id: 'def-pastor', kind: 'defend', side: 'b', start: 5,
    name: 'Cómo frenar el mate del pastor', opening: 'Apertura de peón de rey',
    explain: 'Las blancas sacan la dama temprano para atacar f7. Defiéndelo y después aprovecha que la dama salió antes de tiempo para desarrollarte con ganancia de tiempo.',
    moves: ['e4', 'e5', 'Bc4', 'Nc6', { s: 'Qh5', n: 'Amenaza Qxf7#. ¿Cómo lo evitas?' },
      { s: 'g6', n: 'El peón tapa la diagonal hacia f7 y ataca la dama.', w: { Nf6: '¡Nf6 ataca la dama pero no defiende f7: Qxf7 es mate!' }, alt: { Qe7: 'Bien: Qe7 también defiende f7. La idea es la misma.' } },
      { s: 'Qf3', n: 'La dama vuelve a apuntar a f7.' },
      { s: 'Nf6', n: '¡Listo! El caballo tapa la columna f y se desarrolla. Las blancas perdieron tiempo con la dama y tú tienes un buen juego.' }],
  },
  {
    id: 'def-legal', kind: 'defend', side: 'b', start: 9,
    name: 'No caer en el mate de Légal', opening: 'Defensa Philidor',
    explain: 'El caballo blanco acaba de comer en e5 dejando la dama colgada. Es un regalo envenenado: si la comes, recibes mate en dos.',
    moves: ['e4', 'e5', 'Nf3', 'd6', 'Bc4', 'Bg4', 'Nc3', 'g6', 'Nxe5',
      { s: 'dxe5', n: 'No tocas la dama: comes el caballo.', w: { Bxd1: '¡Es la trampa! Después de Bxf7+ Ke7 Nd5 es mate.' }, alt: { Be6: 'Bien: retirar el alfil también evita el mate (aunque quedas con un peón menos).' } },
      { s: 'Qxg4', n: 'Perdiste un peón, pero evitaste el mate. Lección: si una pieza «clavada» se mueve dejando la dama, sospecha.' }],
  },
  {
    id: 'def-blackburne', kind: 'defend', side: 'w', start: 6,
    name: 'Contra la Blackburne-Shilling', opening: 'Italiana',
    explain: 'Las negras jugaron Nd4 y dejaron e5 colgado. Es un cebo: si lo comes, Qg5 ataca tu caballo y g2 a la vez.',
    moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Nd4',
      { s: 'Nxd4', n: 'Cambias el caballo molesto.', w: { Nxe5: 'Es el cebo: Qg5 ataca e5 y g2 a la vez y te complicas mucho.' }, alt: { 'O-O': 'Bien: enrocar e ignorar el cebo es perfecto.', c3: 'Bien: c3 echa al caballo de d4.' } },
      'exd4',
      { s: 'O-O', n: 'Enrocado y con mejor desarrollo. Las negras perdieron tiempo moviendo dos veces el caballo.' }],
  },
  {
    id: 'def-englund', kind: 'defend', side: 'w', start: 8,
    name: 'Contra el gambito Englund', opening: '1.d4 e5',
    explain: 'La dama negra va a comer en b2. El error típico es atacarla con Bc3, que permite Bb4 y mate en c1. Desarróllate con el caballo y después persigue a la dama.',
    moves: ['d4', 'e5', 'dxe5', 'Qe7', 'Nf3', 'Nc6', 'Bf4', 'Qb4+',
      { s: 'Bd2', n: 'Tapas el jaque con ataque a la dama.' }, 'Qxb2',
      { s: 'Nc3', n: 'Desarrollas defendiendo todo.', w: { Bc3: '¡Es la trampa! Bb4 clava el alfil y después de Qd2 Bxc3 Qxc3 llega Qc1#.' } },
      'Bb4', { s: 'Rb1', n: 'La torre persigue a la dama.' }, 'Qa3',
      { s: 'Rb3', n: 'La dama negra está acorralada y tú vas muy adelantado en desarrollo.' }],
  },
  {
    id: 'def-caro', kind: 'defend', side: 'b', start: 9,
    name: 'Contra la trampa Nd6# (Caro-Kann)', opening: 'Caro-Kann',
    explain: 'Las blancas jugaron Qe2 y el peón de e7 quedó clavado. El caballo de g8 no puede ir a f6 todavía: Nd6 sería mate.',
    moves: ['e4', 'c6', 'd4', 'd5', 'Nc3', 'dxe4', 'Nxe4', 'Nd7', 'Qe2',
      { s: 'Ndf6', n: 'El otro caballo va a f6 y le cierra el paso al de e4.', w: { Ngf6: '¡Nd6 es mate! El peón de e7 está clavado por la dama.' } },
      'Nxf6+', { s: 'Nxf6', n: 'Posición normal y sana. Trampa esquivada.' }],
  },
  {
    id: 'def-fried', kind: 'defend', side: 'b', start: 7,
    name: 'Contra el ataque Fried Liver', opening: 'Dos caballos',
    explain: 'El caballo blanco en g5 ataca f7. Hay que tapar el alfil con d5, pero después de exd5 no conviene recapturar con el caballo: Nxf7 deja tu rey en el medio del tablero.',
    moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Nf6', 'Ng5',
      { s: 'd5', n: 'Tapas la diagonal del alfil hacia f7.' }, 'exd5',
      { s: 'Na5', n: 'Atacas el alfil en vez de recapturar.', w: { Nxd5: 'Así nace el Fried Liver: Nxf7! Kxf7 Qf3+ y tu rey queda expuesto en el centro.' } },
      { s: 'Bb5+', n: 'Jaque.' }, 'c6', 'dxc6',
      { s: 'bxc6', n: 'Diste un peón, pero vas a ganar tiempo atacando el alfil y el caballo. Así se juega con negras.' }],
  },
  {
    id: 'def-elefante', kind: 'defend', side: 'w', start: 10,
    name: 'No caer en la trampa del elefante', opening: 'Gambito de dama declinado',
    explain: 'El peón de d5 parece gratis porque el caballo de f6 está «clavado». Pero no: si lo comes, Nxd5! y si te comes la dama, Bb4+ te la devuelve con una pieza de más para las negras.',
    moves: ['d4', 'd5', 'c4', 'e6', 'Nc3', 'Nf6', 'Bg5', 'Nbd7', 'cxd5', 'exd5',
      { s: 'e3', n: 'Desarrollo tranquilo: el peón de d5 no se va a ir a ningún lado.', w: { Nxd5: 'Es la trampa del elefante: Nxd5! Bxd8 Bb4+ y las negras recuperan la dama con una pieza de más.' }, alt: { Nf3: 'Bien: Nf3 también es teoría.' } },
      'c6', { s: 'Bd3', n: 'Posición clásica del gambito de dama. Esquivaste la trampa.' }],
  },
];

export const step = (m) => (typeof m === 'string' ? { s: m } : m);

const toLan = (fen, san) => {
  try {
    return new Chess(fen).move(san).lan;
  } catch {
    return null;
  }
};

/**
 * Qué pasa si el rival juega otra cosa. Para cada trampa: en la jugada `at`
 * (índice en moves, siempre del rival) el rival juega `s` en lugar de la
 * línea principal, y sigue `then`.
 */
export const VARIANTS = {
  pastor: [
    { at: 5, s: 'g6', n: 'El rival se defiende bien: el peón tapa la diagonal y ataca tu dama.', then: [
      { s: 'Qf3', n: 'Vuelves a amenazar f7 desde otro lado.' },
      { s: 'Nf6', n: 'Defendido otra vez: el caballo tapa la columna f.' },
      { s: 'Ne2', n: 'La trampa no funcionó, así que juega normal: desarrolla (Ne2, Nbc3, d3) y enroca. No muevas más la dama sin motivo, porque cada jugada de dama le da tiempo al rival.' }] },
    { at: 5, s: 'Qe7', n: 'El rival defiende f7 con la dama.', then: [
      { s: 'Nc3', n: 'Ya no hay mate: desarrollas.' },
      { s: 'Nf6', n: 'El caballo ataca tu dama.' },
      { s: 'Qe2', n: 'Retira la dama a un lugar seguro y sigue con Nf3, d3 y enroque. La lección: si defienden f7, no insistas.' }] },
  ],
  legal: [
    { at: 9, s: 'dxe5', n: 'El rival no se come la dama: come tu caballo.', then: [
      { s: 'Qxg4', n: 'Te comes el alfil, que quedó sin defensa. No hubo mate, pero ganaste un peón limpio y tienes buen desarrollo.' }] },
  ],
  caro: [
    { at: 9, s: 'Ndf6', n: 'El rival conoce la trampa: lleva el otro caballo a f6.', then: [
      { s: 'Nxf6+', n: 'Cambias caballos.' }, 'Nxf6',
      { s: 'Nf3', n: 'Partida normal. Desarrolla con Nf3 y después mueve la dama para que salga el alfil de f1.' }] },
    { at: 9, s: 'e6', n: 'El rival libera e7: ya no hay mate en d6.', then: [
      { s: 'Nf3', n: 'Sigue desarrollando: Nf3, g3 y Bg2 o c3. La dama en e2 puede ir después a otra casilla.' }] },
  ],
  englund: [
    { at: 10, s: 'Nc3', n: 'Las blancas no caen: defienden con el caballo en lugar de Bc3.', then: [
      { s: 'Bb4', n: 'Clavas el caballo y sigues presionando.' }, 'Rb1',
      { s: 'Qa3', n: 'La trampa no salió y estás un peón abajo por el gambito. Saca la dama del peligro y desarrolla rápido (…Nge7, enroque): necesitas actividad.' }] },
  ],
  blackburne: [
    { at: 6, s: 'Nxd4', n: 'Las blancas no comen el cebo: cambian el caballo.', then: [
      { s: 'exd4', n: 'Recuperas con el peón.' }, 'O-O',
      { s: 'Bc5', n: 'La trampa no funcionó y perdiste un tiempo. Juega normal: …Bc5, …d6, …Nf6 y enroca. El peón de d4 te da espacio.' }] },
    { at: 6, s: 'O-O', n: 'Las blancas ignoran el cebo y enrocan.', then: [
      { s: 'Nxf3+', n: 'Cambias el caballo antes de que c3 lo eche.' }, 'Qxf3',
      { s: 'Nf6', n: 'Desarrolla y no regales más tiempos. Posición normal.' }] },
    { at: 8, s: 'Ng4', n: 'Las blancas comieron e5 pero se defienden con Ng4 en vez de comer f7.', then: [
      { s: 'd5', n: 'Atacas el alfil y abres la diagonal de tu alfil hacia g4: recuperas el peón con iniciativa.' }] },
  ],
  elefante: [
    { at: 10, s: 'e3', n: 'Las blancas no muerden el peón de d5.', then: [
      { s: 'c6', n: 'Refuerzas d5.' }, 'Bd3',
      { s: 'Bd6', n: 'Juega el Gambito de dama normal: …Bd6 o …Be7, enroque y …Re8. La trampa queda para otra partida.' }] },
  ],
  'def-pastor': [
    { at: 4, s: 'Qf3', n: 'Las blancas apuntan a f7 desde f3 en vez de h5.', then: [
      { s: 'Nf6', n: 'El caballo tapa la columna f y se desarrolla. Mismo plan: defender f7 y después aprovechar que la dama salió temprano.' }] },
  ],
  'def-fried': [
    { at: 10, s: 'd3', n: 'Las blancas defienden con d3 en lugar de Bb5+.', then: [
      { s: 'h6', n: 'Echas al caballo de g5.' }, 'Nf3',
      { s: 'e4', n: 'Lo vuelves a atacar: ganas tiempo y tienes la iniciativa por el peón.' }] },
  ],
};

const moveNo = (i) => `${Math.floor(i / 2) + 1}.${i % 2 ? '..' : ''}`;

/** Todas las líneas de una trampa: la principal y una por variante. */
export function trapLines(trap) {
  const main = trap.moves.map(step);
  const out = [{ label: trap.kind === 'set' ? 'Cae en la trampa' : 'Línea principal', steps: main, main: true }];
  for (const v of VARIANTS[trap.id] ?? []) {
    const { at, then, ...dev } = v;
    out.push({
      label: `Si juega ${moveNo(at)}${dev.s}`,
      steps: [...main.slice(0, at), dev, ...then.map(step)],
      main: false,
    });
  }
  return out;
}

/** Una sesión de práctica de una trampa (line: índice en trapLines). */
export class TrapRun {
  constructor(trap, line = 0) {
    this.trap = trap;
    this.lines = trapLines(trap);
    this.line = Math.min(line, this.lines.length - 1);
    this.steps = this.lines[this.line].steps;
    this.chess = new Chess();
    this.i = 0;
    this.mistakes = 0;
    this.endedEarly = null; // comentario si terminó con una alternativa
    this.lastLan = null;
    while (this.i < trap.start) this.auto();
  }

  get fen() {
    return this.chess.fen();
  }
  get done() {
    return this.endedEarly !== null || this.i >= this.steps.length;
  }
  get myTurn() {
    return !this.done && this.chess.turn() === this.trap.side;
  }
  get current() {
    return this.steps[this.i];
  }
  get expected() {
    return this.done ? null : toLan(this.fen, this.current.s);
  }
  /** Las jugadas hechas, en SAN. */
  get history() {
    return this.chess.history();
  }

  /** Juega la próxima jugada de la línea (la del rival). */
  auto() {
    const st = this.current;
    const m = this.chess.move(st.s);
    this.i++;
    this.lastLan = m.lan;
    this.lastNote = st.n ?? null;
    return { san: m.san, lan: m.lan, note: st.n ?? null, move: m };
  }

  /** Jugada del usuario (uci/lan). */
  play(lan) {
    let m;
    let afterFen;
    try {
      const c = new Chess(this.fen);
      m = c.move({ from: lan.slice(0, 2), to: lan.slice(2, 4), promotion: lan[4] || 'q' });
      afterFen = c.fen();
    } catch {
      return { ok: false, illegal: true };
    }
    const st = this.current;
    if (m.san === st.s || m.san.replace(/[+#]/g, '') === st.s.replace(/[+#]/g, '')) {
      this.chess.move(m.san);
      this.i++;
      this.lastLan = m.lan;
      return { ok: true, san: m.san, note: st.n ?? null, move: m };
    }
    if (st.alt?.[m.san] !== undefined) {
      this.chess.move(m.san);
      this.lastLan = m.lan;
      this.endedEarly = st.alt[m.san];
      return { ok: true, san: m.san, note: st.alt[m.san], alt: true, move: m };
    }
    this.mistakes++;
    let why = st.w?.[m.san] ?? null;
    if (!why) {
      const mate = mateReply(afterFen);
      if (mate) why = `Cuidado: después de ${m.san} el rival da mate con ${mate}.`;
    }
    return { ok: false, san: m.san, why };
  }
}

/** Si el bando que mueve tiene mate en una, devuelve esa jugada (SAN). */
export function mateReply(fen) {
  const c = new Chess(fen);
  for (const m of c.moves({ verbose: true })) {
    if (m.san.endsWith('#')) return m.san;
  }
  return null;
}
