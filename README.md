# Jaque · Ajedrez con IA en el navegador

Demo en vivo: https://robledocordoba123-cmyk.github.io/ajedrez-ia-demo/

Juego de ajedrez hecho con **HTML, CSS y JavaScript** (sin frameworks):

- Tablero 8x8 con todas las reglas oficiales: enroque, captura al paso, coronación (eliges la pieza), jaque, jaque mate y tablas (ahogado, triple repetición, material insuficiente y regla de 50 jugadas). Las reglas se validan con [chess.js](https://github.com/jhlywa/chess.js).
- **IA propia con 3 niveles** (fácil, medio y difícil): búsqueda negamax con poda alfa-beta, profundización iterativa, búsqueda de quietud y tablas de posición. Corre en un **Web Worker**, así el tablero nunca se congela mientras piensa.
- Modo **dos jugadores** en el mismo dispositivo.
- **Reloj** (3, 5 o 10 minutos), **historial** de jugadas en notación algebraica, piezas capturadas con ventaja de material, deshacer y girar tablero.
- Diseño responsivo (celular y computador) y tablero manejable con teclado.
- Abrir una posición concreta: `?fen=<posición en FEN>`.

## Correr en local

```bash
npx http-server -p 5199
```

y abrir http://localhost:5199

Hecho por Manuela Córdoba.
