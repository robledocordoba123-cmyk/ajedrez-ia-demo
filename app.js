import { Chess } from './vendor/chess.js';

// Piezas con el selector de texto (FE0E) para que el celular no las muestre como emoji.
const GLIFO = { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' };
const glifo = (tipo) => GLIFO[tipo] + '︎';
const NOMBRE = { k: 'rey', q: 'dama', r: 'torre', b: 'alfil', n: 'caballo', p: 'peón' };
const VALOR = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
const COLUMNAS = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];

const $ = (id) => document.getElementById(id);
const ui = {
  tablero: $('tablero'), estado: $('estado'), historial: $('historial'),
  coronacion: $('coronacion'), coronacionOpciones: $('coronacionOpciones'),
  nombreArriba: $('nombreArriba'), nombreAbajo: $('nombreAbajo'),
  capturasArriba: $('capturasArriba'), capturasAbajo: $('capturasAbajo'),
  relojArriba: $('relojArriba'), relojAbajo: $('relojAbajo'),
  btnNueva: $('btnNueva'), btnDeshacer: $('btnDeshacer'), btnGirar: $('btnGirar'),
  selModo: $('selModo'), selTema: $('selTema'), selNivel: $('selNivel'), selColor: $('selColor'), selTiempo: $('selTiempo'),
  campoNivel: $('campoNivel'), campoColor: $('campoColor'),
};

const ia = new Worker(new URL('./ia-worker.js', import.meta.url), { type: 'module' });

const estado = {
  juego: new Chess(),
  modo: 'ia',
  nivel: 'medio',
  colorHumano: 'w',
  girado: false,
  seleccion: null,
  pensando: false,
  pedidoIA: 0,
  coronacionPendiente: null,
  tiempoTotal: 5 * 60 * 1000,
  relojes: { w: 0, b: 0 },
  ultimoTic: 0,
  finPorTiempo: null,
  animar: null,
};

// ---------- Partida ----------
// Permite abrir una posición concreta con ?fen=... (útil para practicar finales).
function posicionInicial() {
  const fen = new URLSearchParams(location.search).get('fen');
  if (fen) {
    try { return new Chess(fen); } catch { /* FEN inválido: se usa la posición normal */ }
  }
  return new Chess();
}

function nuevaPartida() {
  estado.juego = posicionInicial();
  estado.modo = ui.selModo.value;
  estado.nivel = ui.selNivel.value;
  estado.colorHumano = estado.modo === 'ia' ? ui.selColor.value : 'w';
  estado.girado = estado.colorHumano === 'b';
  estado.seleccion = null;
  estado.pensando = false;
  estado.pedidoIA++; // descarta respuestas de la IA de la partida anterior
  estado.coronacionPendiente = null;
  estado.finPorTiempo = null;
  estado.tiempoTotal = Number(ui.selTiempo.value) * 60 * 1000;
  estado.relojes = { w: estado.tiempoTotal, b: estado.tiempoTotal };
  estado.ultimoTic = 0;
  ui.coronacion.hidden = true;
  dibujar();
  turnoDeLaIA();
}

function terminada() {
  return estado.juego.isGameOver() || Boolean(estado.finPorTiempo);
}

function esTurnoHumano() {
  if (estado.modo === 'dos') return true;
  return estado.juego.turn() === estado.colorHumano;
}

function jugar(movimiento) {
  const hecho = estado.juego.move(movimiento);
  if (!hecho) return false;
  estado.animar = hecho;
  if (estado.tiempoTotal && estado.juego.history().length === 1) estado.ultimoTic = performance.now();
  estado.seleccion = null;
  dibujar();
  turnoDeLaIA();
  return true;
}

function turnoDeLaIA() {
  if (estado.modo !== 'ia' || terminada() || esTurnoHumano()) return;
  estado.pensando = true;
  dibujarEstado();
  const id = ++estado.pedidoIA;
  // Pequeña pausa para que se vea el movimiento anterior antes de responder.
  setTimeout(() => ia.postMessage({ id, fen: estado.juego.fen(), nivel: estado.nivel }), 250);
}

ia.onmessage = ({ data }) => {
  if (data.id !== estado.pedidoIA || terminada()) return;
  estado.pensando = false;
  jugar(data.jugada);
};

function deshacer() {
  if (estado.pensando) estado.pedidoIA++;
  estado.pensando = false;
  estado.finPorTiempo = null;
  estado.juego.undo();
  // Contra la IA se deshace también su respuesta para volver a tu turno.
  if (estado.modo === 'ia' && estado.juego.turn() !== estado.colorHumano) estado.juego.undo();
  estado.seleccion = null;
  dibujar();
  turnoDeLaIA();
}

// ---------- Clics en el tablero ----------
function clicCasilla(casilla) {
  if (terminada() || estado.pensando || !esTurnoHumano() || estado.coronacionPendiente) return;
  const juego = estado.juego;
  const pieza = juego.get(casilla);

  if (estado.seleccion) {
    const jugadas = juego.moves({ square: estado.seleccion, verbose: true }).filter((j) => j.to === casilla);
    if (jugadas.length) {
      if (jugadas.some((j) => j.promotion)) return pedirCoronacion(estado.seleccion, casilla);
      return jugar({ from: estado.seleccion, to: casilla });
    }
  }
  estado.seleccion = pieza && pieza.color === juego.turn() && estado.seleccion !== casilla ? casilla : null;
  dibujarTablero();
}

function pedirCoronacion(desde, hasta) {
  estado.coronacionPendiente = { desde, hasta };
  const color = estado.juego.turn();
  ui.coronacionOpciones.innerHTML = '';
  for (const tipo of ['q', 'r', 'b', 'n']) {
    const b = document.createElement('button');
    b.innerHTML = `<span class="pieza ${color}">${glifo(tipo)}</span>`;
    b.setAttribute('aria-label', `Coronar ${NOMBRE[tipo]}`);
    b.onclick = () => {
      estado.coronacionPendiente = null;
      ui.coronacion.hidden = true;
      jugar({ from: desde, to: hasta, promotion: tipo });
    };
    ui.coronacionOpciones.appendChild(b);
  }
  ui.coronacion.hidden = false;
  ui.coronacionOpciones.firstChild.focus();
}

// ---------- Dibujo ----------
function dibujar() {
  dibujarTablero();
  dibujarJugadores();
  dibujarHistorial();
  dibujarEstado();
  ui.btnDeshacer.disabled = estado.juego.history().length === 0;
}

function dibujarTablero() {
  const juego = estado.juego;
  const historia = juego.history({ verbose: true });
  const ultima = historia[historia.length - 1];
  const destinos = estado.seleccion ? juego.moves({ square: estado.seleccion, verbose: true }) : [];
  const reyEnJaque = juego.inCheck() ? buscarRey(juego.turn()) : null;
  const filas = estado.girado ? [1, 2, 3, 4, 5, 6, 7, 8] : [8, 7, 6, 5, 4, 3, 2, 1];
  const cols = estado.girado ? [...COLUMNAS].reverse() : COLUMNAS;

  ui.tablero.innerHTML = '';
  filas.forEach((fila, i) => {
    cols.forEach((col, j) => {
      const casilla = col + fila;
      const pieza = juego.get(casilla);
      const b = document.createElement('button');
      const clara = (COLUMNAS.indexOf(col) + fila) % 2 === 0;
      b.className = 'casilla ' + (clara ? 'clara' : 'oscura');
      b.dataset.casilla = casilla;
      if (ultima && (ultima.from === casilla || ultima.to === casilla)) b.classList.add('ultima');
      if (estado.seleccion === casilla) b.classList.add('seleccionada');
      if (reyEnJaque === casilla) b.classList.add('jaque');
      const destino = destinos.find((d) => d.to === casilla);
      if (destino) b.classList.add('destino', destino.captured ? 'captura' : 'libre');

      let html = '';
      if (j === 0) html += `<span class="coord fila">${fila}</span>`;
      if (i === 7) html += `<span class="coord col">${col}</span>`;
      if (pieza) html += `<span class="pieza ${pieza.color}">${glifo(pieza.type)}</span>`;
      b.innerHTML = html;
      const femenina = pieza && (pieza.type === 'q' || pieza.type === 'r');
      const color = pieza && (pieza.color === 'w' ? (femenina ? 'blanca' : 'blanco') : (femenina ? 'negra' : 'negro'));
      b.setAttribute('aria-label', casilla + (pieza ? `, ${NOMBRE[pieza.type]} ${color}` : ''));
      b.onclick = () => clicCasilla(casilla);
      ui.tablero.appendChild(b);
    });
  });
  if (estado.animar) animarJugada(estado.animar);
  estado.animar = null;
}

// Desliza la pieza desde su casilla de origen hasta la de destino.
function animarJugada(jugada) {
  const desde = ui.tablero.querySelector(`[data-casilla="${jugada.from}"]`);
  const hasta = ui.tablero.querySelector(`[data-casilla="${jugada.to}"]`);
  const pieza = hasta && hasta.querySelector('.pieza');
  if (!desde || !pieza || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const a = desde.getBoundingClientRect();
  const b = hasta.getBoundingClientRect();
  hasta.style.overflow = 'visible';
  hasta.style.zIndex = '3';
  pieza.classList.add('moviendo');
  pieza.style.transform = `translate(${a.left - b.left}px, ${a.top - b.top}px)`;
  pieza.getBoundingClientRect(); // fuerza el cálculo antes de animar
  pieza.classList.remove('moviendo');
  pieza.style.transition = 'transform .22s cubic-bezier(.2,.8,.3,1)';
  pieza.style.transform = '';
  pieza.addEventListener('transitionend', () => {
    pieza.style.transition = '';
    hasta.style.overflow = '';
    hasta.style.zIndex = '';
  }, { once: true });
}

function buscarRey(color) {
  for (const fila of estado.juego.board()) {
    for (const c of fila) if (c && c.type === 'k' && c.color === color) return c.square;
  }
  return null;
}

function colorAbajo() { return estado.girado ? 'b' : 'w'; }

function dibujarJugadores() {
  const abajo = colorAbajo();
  const arriba = abajo === 'w' ? 'b' : 'w';
  const nombre = (color) => {
    if (estado.modo === 'dos') return color === 'w' ? 'Blancas' : 'Negras';
    return color === estado.colorHumano ? 'Tú' : `IA · ${ui.selNivel.selectedOptions[0].text}`;
  };
  ui.nombreAbajo.textContent = nombre(abajo);
  ui.nombreArriba.textContent = nombre(arriba);
  ui.capturasAbajo.innerHTML = capturasDe(abajo);
  ui.capturasArriba.innerHTML = capturasDe(arriba);
  dibujarRelojes();
}

// Piezas que ha capturado `color` y su ventaja de material.
function capturasDe(color) {
  const rival = color === 'w' ? 'b' : 'w';
  const tomadas = estado.juego.history({ verbose: true }).filter((m) => m.color === color && m.captured).map((m) => m.captured);
  tomadas.sort((a, b) => VALOR[b] - VALOR[a]);
  const material = (c) => estado.juego.board().flat().filter((x) => x && x.color === c).reduce((s, x) => s + VALOR[x.type], 0);
  const ventaja = material(color) - material(rival);
  return tomadas.map((t) => `<span class="pieza ${rival}">${glifo(t)}</span>`).join('') + (ventaja > 0 ? `<b>+${ventaja}</b>` : '');
}

function dibujarHistorial() {
  const jugadas = estado.juego.history();
  ui.historial.innerHTML = '';
  if (!jugadas.length) {
    ui.historial.innerHTML = '<li><span class="vacio">Aún no hay jugadas.</span></li>';
    return;
  }
  for (let i = 0; i < jugadas.length; i += 2) {
    const li = document.createElement('li');
    const actual = (k) => (k === jugadas.length - 1 ? ' actual' : '');
    li.innerHTML = `<span class="num">${i / 2 + 1}.</span><span class="san${actual(i)}">${jugadas[i]}</span><span class="san${actual(i + 1)}">${jugadas[i + 1] || ''}</span>`;
    ui.historial.appendChild(li);
  }
  ui.historial.scrollTop = ui.historial.scrollHeight;
}

function dibujarEstado() {
  const juego = estado.juego;
  const turno = juego.turn() === 'w' ? 'blancas' : 'negras';
  let texto;
  let fin = true;
  if (estado.finPorTiempo) {
    texto = `Se acabó el tiempo de las ${estado.finPorTiempo === 'w' ? 'blancas' : 'negras'}. Ganan las ${estado.finPorTiempo === 'w' ? 'negras' : 'blancas'}`;
  } else if (juego.isCheckmate()) {
    texto = `¡Jaque mate! Ganan las ${turno === 'blancas' ? 'negras' : 'blancas'}`;
  } else if (juego.isStalemate()) {
    texto = 'Tablas por ahogado';
  } else if (juego.isThreefoldRepetition()) {
    texto = 'Tablas por triple repetición';
  } else if (juego.isInsufficientMaterial()) {
    texto = 'Tablas por material insuficiente';
  } else if (juego.isDraw()) {
    texto = 'Tablas por la regla de 50 jugadas';
  } else {
    fin = false;
    texto = juego.inCheck() ? `¡Jaque! Mueven las ${turno}` : `Mueven las ${turno}`;
  }
  ui.estado.classList.toggle('fin', fin);
  ui.estado.innerHTML = texto + (estado.pensando && !fin ? '<span class="pensando">La IA está pensando…</span>' : '');
}

// ---------- Reloj ----------
function formato(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

function dibujarRelojes() {
  const abajo = colorAbajo();
  const arriba = abajo === 'w' ? 'b' : 'w';
  const corre = estado.tiempoTotal && estado.ultimoTic && !terminada();
  for (const [el, color] of [[ui.relojAbajo, abajo], [ui.relojArriba, arriba]]) {
    el.textContent = estado.tiempoTotal ? formato(estado.relojes[color]) : '--:--';
    el.classList.toggle('activo', Boolean(corre) && estado.juego.turn() === color);
    el.classList.toggle('poco', Boolean(estado.tiempoTotal) && estado.relojes[color] < 20000);
  }
}

setInterval(() => {
  if (!estado.tiempoTotal || !estado.ultimoTic || terminada()) return;
  const ahora = performance.now();
  const color = estado.juego.turn();
  estado.relojes[color] -= ahora - estado.ultimoTic;
  estado.ultimoTic = ahora;
  if (estado.relojes[color] <= 0) {
    estado.relojes[color] = 0;
    estado.finPorTiempo = color;
    estado.pensando = false;
    estado.pedidoIA++;
    dibujarEstado();
  }
  dibujarRelojes();
}, 100);

// ---------- Botones y ajustes ----------
ui.btnNueva.onclick = nuevaPartida;
ui.btnDeshacer.onclick = deshacer;
ui.btnGirar.onclick = () => { estado.girado = !estado.girado; dibujar(); };
function aplicarTema(tema) {
  document.documentElement.dataset.tema = tema;
  try { localStorage.setItem('jaque-tema', tema); } catch { /* sin almacenamiento: no pasa nada */ }
}
try { ui.selTema.value = localStorage.getItem('jaque-tema') || 'salvia'; } catch { /* usa el tema por defecto */ }
aplicarTema(ui.selTema.value);
ui.selTema.onchange = () => aplicarTema(ui.selTema.value);

ui.selModo.onchange = () => {
  const contraIA = ui.selModo.value === 'ia';
  ui.campoNivel.hidden = !contraIA;
  ui.campoColor.hidden = !contraIA;
};
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && estado.seleccion) { estado.seleccion = null; dibujarTablero(); }
});

nuevaPartida();
