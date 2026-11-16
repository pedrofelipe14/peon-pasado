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

## Ejercicios

La pestaña **Ejercicios** tiene tres modos: Táctica, Aperturas y Mates.

En todos los tableros suenan las jugadas (mover, capturar, jaque, enroque, mate; se silencian con el botón 🔊) y puedes dibujar flechas y círculos con el click derecho (Shift o Alt cambian el color).

### Táctica

El modo Táctica tiene un tablero donde mueves las piezas, con pistas, «ver solución», un rating que va subiendo y una racha de aciertos. Todo se guarda en tu navegador.

- **Lichess**: ejercicios de la base pública de lichess. Puedes elegir el tema (mate en 2, ataque doble, clavada, finales…) y la dificultad.
- **Mis errores**: cada error, error grave u oportunidad perdida de tus partidas analizadas se vuelve un ejercicio («En la partida jugaste Nf6. ¿Qué era mejor?»). Se guardan solo tus jugadas cuando la página sabe cuál es tu usuario.
- **Del día**: el ejercicio diario de lichess.

### Aperturas

Eliges una apertura entre 19 (Italiana, Española, Gambito de dama, Londres, Siciliana, Francesa, Caro-Kann, India de rey…) y la juegas con tu color. El rival responde con variantes reales de la base de lichess, elegidas al azar, y la página te dice en qué variante estás. Hay dos modos: **Aprender**, donde una flecha te muestra la jugada principal y otras flechas las alternativas, y **Practicar**, donde juegas de memoria. Cada apertura explica de qué se trata: la idea, los planes típicos, qué vigilar y para qué tipo de jugador es.

En **Trampas** hay trampas para tenderle al rival (mate de Légal, Blackburne-Shilling, trampa del elefante, gambito Englund, Nd6# en la Caro-Kann, mate del pastor) y lecciones para defenderte de las más comunes. Si juegas el error tentador, la página te explica qué te iba a pasar.

### Mates

- **Mates básicos contra el motor**: rey y dama, dos torres (la escalera) y rey y torre. Stockfish defiende lo mejor posible y la página te dice si ahogaste o si perdiste la pieza.
- **Patrones de mate**: beso, pasillo, coz, Anastasia, árabe y Boden. Cada uno trae una explicación y un ejemplo para resolver, y después se practica con ejercicios reales de lichess de ese patrón.

Al terminar un análisis, el botón «🧩 Practicar los errores de esta partida» te lleva directo a resolverlos.

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
