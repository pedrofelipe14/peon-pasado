// Entrenador de aperturas: lógica pura. Arma un árbol con las líneas de una
// apertura (base de lichess-org/chess-openings) y lleva la sesión de práctica.

export const FAMILIES = [
  // con blancas
  { id: 'italiana', name: 'Italiana', side: 'w', match: ['Italian Game'],
    desc: 'El alfil va a c4 y apunta a f7, el punto débil de las negras. Desarrollo rápido, enroque y lucha por el centro con c3 y d4.' },
  { id: 'espanola', name: 'Española (Ruy López)', side: 'w', match: ['Ruy Lopez'],
    desc: 'El alfil va a b5 y presiona al caballo que defiende e5. Clásica y sólida: el plan típico es c3, d4 y mejorar las piezas sin apuro.' },
  { id: 'escocesa', name: 'Escocesa', side: 'w', match: ['Scotch Game'],
    desc: 'Con 3.d4 las blancas abren el centro enseguida y cambian el peón de e5. Juego activo y directo.' },
  { id: 'vienesa', name: 'Vienesa', side: 'w', match: ['Vienna Game'],
    desc: 'Con 2.Nc3 las blancas preparan f4 para atacar el centro desde el flanco de rey.' },
  { id: 'gambito-rey', name: 'Gambito de rey', side: 'w', match: ["King's Gambit"],
    desc: 'Con 2.f4 las blancas entregan un peón para abrir la columna f y atacar rápido. Muy agudo.' },
  { id: 'gambito-dama', name: 'Gambito de dama', side: 'w', match: ["Queen's Gambit"],
    desc: 'Con 1.d4 d5 2.c4 las blancas ofrecen un peón lateral para desviar el peón de d5 y dominar el centro.' },
  { id: 'londres', name: 'Sistema Londres', side: 'w', match: ['London System', "Queen's Pawn Game: London System"],
    desc: 'Siempre el mismo esquema: d4, Bf4, e3, Nf3 y c3. Se arma igual contra casi todo, así que es fácil de aprender.' },
  { id: 'inglesa', name: 'Inglesa', side: 'w', match: ['English Opening'],
    desc: 'Con 1.c4 las blancas controlan d5 desde el costado. Juego posicional y flexible.' },
  // con negras
  { id: 'siciliana', name: 'Siciliana', side: 'b', match: ['Sicilian Defense'],
    desc: 'Con 1...c5, la respuesta más combativa a 1.e4: cambia un peón lateral por uno central y busca posiciones desequilibradas.' },
  { id: 'francesa', name: 'Francesa', side: 'b', match: ['French Defense'],
    desc: 'Con 1...e6 las negras preparan d5 para discutir el centro. Es sólida, pero al principio el alfil de c8 queda encerrado.' },
  { id: 'caro-kann', name: 'Caro-Kann', side: 'b', match: ['Caro-Kann Defense'],
    desc: 'Con 1...c6 las negras preparan d5 sin encerrar al alfil de casillas blancas. Muy sólida.' },
  { id: 'escandinava', name: 'Escandinava', side: 'b', match: ['Scandinavian Defense'],
    desc: 'Con 1...d5 las negras atacan e4 de inmediato. Los planes son simples, aunque la dama sale temprano.' },
  { id: 'petrov', name: 'Petrov', side: 'b', match: ["Petrov's Defense"],
    desc: 'Con 2...Nf6 las negras contraatacan e4 en vez de defender e5. Simétrica y sólida.' },
  { id: 'alekhine', name: 'Alekhine', side: 'b', match: ['Alekhine Defense'],
    desc: 'Con 1...Nf6 las negras invitan a los peones blancos a avanzar, para atacarlos después.' },
  { id: 'pirc', name: 'Pirc', side: 'b', match: ['Pirc Defense'],
    desc: 'Con 1...d6, Nf6 y g6 las negras ponen el alfil en fianchetto y atacan el centro más tarde.' },
  { id: 'india-rey', name: 'India de rey', side: 'b', match: ["King's Indian Defense"],
    desc: 'Las negras dejan que las blancas ocupen el centro y lo atacan después con ...e5 o ...c5, a menudo con ataque en el flanco de rey.' },
  { id: 'nimzo', name: 'Nimzo-india', side: 'b', match: ['Nimzo-Indian Defense'],
    desc: 'Con ...Bb4 las negras clavan el caballo de c3 para controlar e4.' },
  { id: 'eslava', name: 'Eslava', side: 'b', match: ['Slav Defense'],
    desc: 'Con 2...c6 las negras defienden d5 con el peón c y dejan libre el alfil de c8.' },
  { id: 'holandesa', name: 'Holandesa', side: 'b', match: ['Dutch Defense'],
    desc: 'Con 1...f5 las negras controlan e4 con el peón f. Juego desequilibrado en el flanco de rey.' },
];

export function matchesFamily(family, name) {
  return family.match.some((p) => name === p || name.startsWith(`${p}:`) || name.startsWith(`${p} `) || name.startsWith(`${p},`));
}

/** lines: [[eco, name, "e2e4 e7e5 ..."]] -> árbol { count, children: Map(uci -> nodo) } */
export function buildTree(lines, family) {
  const root = { count: 0, children: new Map() };
  for (const [, name, moves] of lines) {
    if (!matchesFamily(family, name)) continue;
    let node = root;
    node.count++;
    for (const uci of moves.split(' ')) {
      if (!node.children.has(uci)) node.children.set(uci, { count: 0, children: new Map() });
      node = node.children.get(uci);
      node.count++;
    }
  }
  return root;
}

/** La jugada "principal" de un nodo: la que tiene más líneas debajo. */
export function mainMove(node) {
  let best = null;
  for (const [uci, child] of node.children) if (!best || child.count > best[1].count) best = [uci, child];
  return best?.[0] ?? null;
}

/** Elige una respuesta al azar, más probable cuanto más líneas tenga. */
export function randomMove(node, rnd = Math.random) {
  const total = [...node.children.values()].reduce((a, c) => a + c.count, 0);
  let x = rnd() * total;
  for (const [uci, child] of node.children) {
    x -= child.count;
    if (x <= 0) return uci;
  }
  return mainMove(node);
}

/** Sesión: el usuario juega `side`, el "rival" responde con la teoría. */
export class OpeningDrill {
  constructor(tree, side, rnd = Math.random) {
    this.tree = tree;
    this.side = side;
    this.rnd = rnd;
    this.node = tree;
    this.moves = []; // ucis jugadas
    this.errors = 0;
  }

  get turn() {
    return this.moves.length % 2 === 0 ? 'w' : 'b';
  }
  get myTurn() {
    return this.turn === this.side;
  }
  get finished() {
    return this.node.children.size === 0;
  }
  get expected() {
    return mainMove(this.node);
  }
  accepted(uci) {
    return this.node.children.has(uci);
  }

  /** Jugada del usuario. Devuelve true si está en la teoría. */
  play(uci) {
    if (!this.accepted(uci)) {
      this.errors++;
      return false;
    }
    this.node = this.node.children.get(uci);
    this.moves.push(uci);
    return true;
  }

  /** Respuesta del rival (o null si la línea terminó). */
  reply() {
    if (this.finished) return null;
    const uci = randomMove(this.node, this.rnd);
    this.node = this.node.children.get(uci);
    this.moves.push(uci);
    return uci;
  }
}
