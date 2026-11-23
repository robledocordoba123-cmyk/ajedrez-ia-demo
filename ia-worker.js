// Motor de la IA: corre en un Web Worker para que el tablero nunca se congele.
// Búsqueda negamax con poda alfa-beta, profundización iterativa,
// búsqueda de quietud (solo capturas) y tablas de posición por pieza.
import { Chess } from './vendor/chess.js';

const VALOR = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };

// Tablas de posición (desde el punto de vista de las blancas, fila 8 arriba).
const TABLA = {
  p: [
    0, 0, 0, 0, 0, 0, 0, 0,
    50, 50, 50, 50, 50, 50, 50, 50,
    10, 10, 20, 30, 30, 20, 10, 10,
    5, 5, 10, 25, 25, 10, 5, 5,
    0, 0, 0, 20, 20, 0, 0, 0,
    5, -5, -10, 0, 0, -10, -5, 5,
    5, 10, 10, -20, -20, 10, 10, 5,
    0, 0, 0, 0, 0, 0, 0, 0,
  ],
  n: [
    -50, -40, -30, -30, -30, -30, -40, -50,
    -40, -20, 0, 0, 0, 0, -20, -40,
    -30, 0, 10, 15, 15, 10, 0, -30,
    -30, 5, 15, 20, 20, 15, 5, -30,
    -30, 0, 15, 20, 20, 15, 0, -30,
    -30, 5, 10, 15, 15, 10, 5, -30,
    -40, -20, 0, 5, 5, 0, -20, -40,
    -50, -40, -30, -30, -30, -30, -40, -50,
  ],
  b: [
    -20, -10, -10, -10, -10, -10, -10, -20,
    -10, 0, 0, 0, 0, 0, 0, -10,
    -10, 0, 5, 10, 10, 5, 0, -10,
    -10, 5, 5, 10, 10, 5, 5, -10,
    -10, 0, 10, 10, 10, 10, 0, -10,
    -10, 10, 10, 10, 10, 10, 10, -10,
    -10, 5, 0, 0, 0, 0, 5, -10,
    -20, -10, -10, -10, -10, -10, -10, -20,
  ],
  r: [
    0, 0, 0, 0, 0, 0, 0, 0,
    5, 10, 10, 10, 10, 10, 10, 5,
    -5, 0, 0, 0, 0, 0, 0, -5,
    -5, 0, 0, 0, 0, 0, 0, -5,
    -5, 0, 0, 0, 0, 0, 0, -5,
    -5, 0, 0, 0, 0, 0, 0, -5,
    -5, 0, 0, 0, 0, 0, 0, -5,
    0, 0, 0, 5, 5, 0, 0, 0,
  ],
  q: [
    -20, -10, -10, -5, -5, -10, -10, -20,
    -10, 0, 0, 0, 0, 0, 0, -10,
    -10, 0, 5, 5, 5, 5, 0, -10,
    -5, 0, 5, 5, 5, 5, 0, -5,
    0, 0, 5, 5, 5, 5, 0, -5,
    -10, 5, 5, 5, 5, 5, 0, -10,
    -10, 0, 5, 0, 0, 0, 0, -10,
    -20, -10, -10, -5, -5, -10, -10, -20,
  ],
  k: [
    -30, -40, -40, -50, -50, -40, -40, -30,
    -30, -40, -40, -50, -50, -40, -40, -30,
    -30, -40, -40, -50, -50, -40, -40, -30,
    -30, -40, -40, -50, -50, -40, -40, -30,
    -20, -30, -30, -40, -40, -30, -30, -20,
    -10, -20, -20, -20, -20, -20, -20, -10,
    20, 20, 0, 0, 0, 0, 20, 20,
    20, 30, 10, 0, 0, 10, 30, 20,
  ],
};

// Niveles: profundidad máxima, tiempo límite (ms) y cuánto "se equivoca".
const NIVELES = {
  facil: { profundidad: 1, tiempo: 400, ruido: 120, quietud: false },
  medio: { profundidad: 2, tiempo: 1200, ruido: 25, quietud: true },
  dificil: { profundidad: 4, tiempo: 2500, ruido: 0, quietud: true },
};

const MATE = 100000;
let limite = 0;
let nodos = 0;
class SinTiempo extends Error {}

// Evaluación desde el punto de vista de quien mueve.
function evaluar(juego) {
  let total = 0;
  const tablero = juego.board();
  for (let f = 0; f < 8; f++) {
    for (let c = 0; c < 8; c++) {
      const casilla = tablero[f][c];
      if (!casilla) continue;
      const indice = casilla.color === 'w' ? f * 8 + c : (7 - f) * 8 + c;
      const puntos = VALOR[casilla.type] + TABLA[casilla.type][indice];
      total += casilla.color === 'w' ? puntos : -puntos;
    }
  }
  return juego.turn() === 'w' ? total : -total;
}

// Ordenar: primero capturas valiosas con piezas baratas, luego coronaciones.
function ordenar(jugadas) {
  return jugadas.sort((a, b) => puntaje(b) - puntaje(a));
}
function puntaje(j) {
  let p = 0;
  if (j.captured) p += 10 * VALOR[j.captured] - VALOR[j.piece];
  if (j.promotion) p += VALOR[j.promotion];
  return p;
}

function revisarTiempo() {
  if ((++nodos & 1023) === 0 && performance.now() > limite) throw new SinTiempo();
}

function quietud(juego, alfa, beta) {
  revisarTiempo();
  const quieto = evaluar(juego);
  if (quieto >= beta) return beta;
  if (quieto > alfa) alfa = quieto;
  const capturas = ordenar(juego.moves({ verbose: true }).filter((j) => j.captured));
  for (const j of capturas) {
    juego.move(j);
    const valor = -quietud(juego, -beta, -alfa);
    juego.undo();
    if (valor >= beta) return beta;
    if (valor > alfa) alfa = valor;
  }
  return alfa;
}

function negamax(juego, profundidad, alfa, beta, conQuietud, ply) {
  revisarTiempo();
  if (juego.isCheckmate()) return -MATE + ply;
  if (juego.isDraw()) return 0;
  if (profundidad === 0) return conQuietud ? quietud(juego, alfa, beta) : evaluar(juego);

  for (const j of ordenar(juego.moves({ verbose: true }))) {
    juego.move(j);
    const valor = -negamax(juego, profundidad - 1, -beta, -alfa, conQuietud, ply + 1);
    juego.undo();
    if (valor >= beta) return beta;
    if (valor > alfa) alfa = valor;
  }
  return alfa;
}

function mejorJugada(fen, nivel) {
  const cfg = NIVELES[nivel] || NIVELES.medio;
  const juego = new Chess(fen);
  let jugadas = ordenar(juego.moves({ verbose: true }));
  let mejor = jugadas[0];
  limite = performance.now() + cfg.tiempo;
  nodos = 0;

  // Profundización iterativa: si se acaba el tiempo, queda la mejor jugada completa.
  for (let prof = 1; prof <= cfg.profundidad; prof++) {
    try {
      if (cfg.ruido) {
        // Niveles fácil y medio: puntaje exacto de cada jugada más un "error humano".
        const puntajes = jugadas.map((j) => {
          juego.move(j);
          const valor = -negamax(juego, prof - 1, -Infinity, Infinity, cfg.quietud, 1);
          juego.undo();
          return { j, valor: valor + (Math.random() - 0.5) * cfg.ruido * 2 };
        });
        puntajes.sort((a, b) => b.valor - a.valor);
        mejor = puntajes[0].j;
      } else {
        // Nivel difícil: poda alfa-beta completa en la raíz.
        let alfa = -Infinity;
        let mejorAqui = jugadas[0];
        for (const j of jugadas) {
          juego.move(j);
          const valor = -negamax(juego, prof - 1, -Infinity, -alfa, cfg.quietud, 1);
          juego.undo();
          if (valor > alfa) {
            alfa = valor;
            mejorAqui = j;
          }
        }
        mejor = mejorAqui;
      }
      // La mejor jugada va primero en la siguiente vuelta (poda más rápido).
      jugadas = [mejor, ...jugadas.filter((j) => j !== mejor)];
    } catch (e) {
      if (!(e instanceof SinTiempo)) throw e;
      break;
    }
  }
  return { from: mejor.from, to: mejor.to, promotion: mejor.promotion };
}

self.onmessage = ({ data }) => {
  const jugada = mejorJugada(data.fen, data.nivel);
  self.postMessage({ id: data.id, jugada });
};
