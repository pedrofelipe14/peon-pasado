# Peón Pasado

**▶ [Úsalo acá: pedrofelipe14.github.io/peon-pasado](https://pedrofelipe14.github.io/peon-pasado/)**

Análisis gratis de partidas de ajedrez, jugada por jugada. Pegas el link de una partida de **chess.com** o **lichess** (o el PGN) y cada jugada recibe una clasificación: brillante, gran jugada, mejor, excelente, buena, teoría, imprecisión, error, oportunidad perdida o error grave. También ves la precisión de cada jugador, la jugada que era mejor y la línea del motor.

Todo el análisis corre en tu navegador con [Stockfish](https://stockfishchess.org) compilado a WebAssembly ([stockfish.js](https://github.com/nmrugg/stockfish.js)). No hay servidor ni cuenta, y no tiene límites.

## Cómo se usa

- **lichess**: pega el link de la partida.
- **chess.com**: chess.com no tiene una API pública para pedir una partida solo por su número. Escribe tu usuario y la página busca el link entre tus partidas de los últimos 6 meses. Otra opción es tocar **Mis partidas** y elegir una de la lista, o pegar el PGN (en chess.com: Compartir → PGN).
- **Ver la mejor jugada**: en cada error, el botón «▶ Ver la mejor jugada» la juega en el tablero y te deja recorrer la línea del motor jugada a jugada. «Ver qué podía hacer el rival» muestra cómo te castigaban.
- Cada jugada viene explicada en palabras simples: qué te podía hacer el rival («Ahora el rival puede comer tu caballo con Qxg5»), qué hacía la mejor jugada y cómo cambió la posición («Antes: posición igualada → Ahora: ventaja clara de las negras»). El resumen lista los momentos clave de la partida, y «Pista» muestra la mejor jugada en cualquier posición.
- Navegación: ← → para moverte por las jugadas, ↑ ↓ para ir al inicio o al final, F para girar el tablero. Puedes tocar el gráfico de evaluación para saltar a una jugada.

## Cómo clasifica

Cada posición se analiza con dos líneas (MultiPV 2). Las evaluaciones se pasan a probabilidad de ganar con la curva de lichess, y la clasificación sale de cuánto baja esa probabilidad con cada jugada:

| Pérdida | Clasificación |
| --- | --- |
| jugada del motor o < 0,5 % | Mejor |
| < 2 % | Excelente |
| < 5 % | Buena |
| < 10 % | Imprecisión |
| < 20 % | Error |
| ≥ 20 % | Error grave |

Además:
- **Brillante**: la mejor jugada (o casi) que deja material colgando y aun así funciona.
- **Gran jugada**: la única jugada buena (la segunda línea es mucho peor).
- **Oportunidad perdida**: el rival se acaba de equivocar y no lo aprovechas.
- **Teoría**: la jugada está en la base de aperturas de lichess.
- **Forzada**: era la única jugada legal.

La precisión de la partida usa el método de lichess: una media ponderada por la volatilidad de la posición, combinada con una media armónica.

## Desarrollo

```bash
npm install
npm run dev     # copia el motor, genera openings.json y abre Vite
npm test        # tests del clasificador + integración con Stockfish real
npm run build
```

Cada push a `main` se publica en GitHub Pages (`.github/workflows/deploy.yml`).

## Licencia

GPL-3.0-or-later, porque usa Stockfish. La base de aperturas viene de [lichess-org/chess-openings](https://github.com/lichess-org/chess-openings) (CC0). Las piezas cburnett vienen de chessground. No tiene relación con chess.com ni con lichess; solo usa sus APIs públicas.
