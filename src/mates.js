// Lecciones de mate: los básicos se juegan contra el motor y los patrones
// tienen un ejemplo para resolver y después práctica con ejercicios de lichess.

export const BASIC_MATES = [
  {
    id: 'rey-dama', title: 'Rey y dama contra rey', fen: '8/8/8/4k3/8/8/8/3QK3 w - - 0 1',
    explain: 'Usa la dama para encerrar al rey en un rectángulo cada vez más chico (ponla a un salto de caballo del rey rival). Cuando llegue al borde, acerca tu rey y da mate. Ojo: si el rey rival no tiene ninguna jugada y no está en jaque, es ahogado y son tablas.',
  },
  {
    id: 'dos-torres', title: 'Dos torres: la escalera', fen: '8/8/8/4k3/8/8/8/RR5K w - - 0 1',
    explain: 'Una torre le corta una fila al rey y la otra da jaque en la fila siguiente. Se van turnando, como subiendo una escalera, hasta empujarlo al borde. Si el rey se acerca a una torre, llévala lejos al otro lado del tablero. No hace falta usar tu rey.',
  },
  {
    id: 'rey-torre', title: 'Rey y torre contra rey', fen: '8/8/8/4k3/8/8/8/R3K3 w - - 0 1',
    explain: 'La torre le corta el paso al rey rival. Tu rey se pone enfrente del suyo (en oposición) y en ese momento la torre da jaque y lo empuja una fila. Repite hasta llevarlo al borde. Es el más largo de los tres: ten paciencia.',
  },
];

export const PATTERNS = [
  {
    id: 'beso', title: 'Mate del beso', theme: 'mateIn1',
    fen: '6k1/5p1p/8/8/3Q4/8/1B6/6K1 w - - 0 1', solution: ['d4g7'],
    explain: 'La dama da jaque pegada al rey rival, protegida por otra pieza, así que el rey no puede comerla. Es el mate más común de todos.',
  },
  {
    id: 'pasillo', title: 'Mate del pasillo', theme: 'backRankMate',
    fen: '6k1/5ppp/8/8/8/8/5PPP/4R1K1 w - - 0 1', solution: ['e1e8'],
    explain: 'El rey quedó detrás de sus propios peones y no tiene salida: una torre o una dama en la última fila da mate. Para evitarlo en tus partidas, mueve un peón del enroque y dale aire al rey.',
  },
  {
    id: 'coz', title: 'Mate de la coz', theme: 'smotheredMate',
    fen: '3r3k/6pp/7N/3Q4/8/8/8/6K1 w - - 0 1', solution: ['d5g8', 'd8g8', 'h6f7'],
    explain: 'El caballo da mate a un rey encerrado por sus propias piezas. El truco clásico: sacrificar la dama en g8 para obligar a la torre a comerla y tapar la última salida.',
  },
  {
    id: 'anastasia', title: 'Mate de Anastasia', theme: 'anastasiaMate',
    fen: '8/4N1pk/8/3R4/8/8/8/6K1 w - - 0 1', solution: ['d5h5'],
    explain: 'Un caballo en e7 le quita al rey las casillas g8 y g6, y su propio peón de g7 le tapa la salida. Una torre o una dama en la columna h termina el trabajo.',
  },
  {
    id: 'arabe', title: 'Mate árabe', theme: 'arabianMate',
    fen: '7k/R7/5N2/8/8/8/8/6K1 w - - 0 1', solution: ['a7h7'],
    explain: 'Con el rey en la esquina, la torre da jaque justo al lado. El caballo protege a la torre y además le quita la otra casilla de escape. Es uno de los mates más antiguos que se conocen.',
  },
  {
    id: 'boden', title: 'Mate de Boden', theme: 'bodenMate',
    fen: '2kr4/p2p4/8/8/5B2/8/4B3/6K1 w - - 0 1', solution: ['e2a6'],
    explain: 'Dos alfiles en diagonales cruzadas dan mate al rey enrocado largo, que quedó bloqueado por sus propias piezas.',
  },
];
