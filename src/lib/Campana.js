/**
 * Campana.js — el pitido del KDS, sintetizado.
 *
 * ── POR QUÉ NO HAY UN .mp3 ──────────────────────────────────────────────────
 * Un archivo de audio son tres problemas: pesa en el bundle, hay que revisar su
 * licencia, y en Tauri se sirve por una ruta distinta que en el navegador —
 * justo el tipo de diferencia que sólo se descubre en la compu del restaurante.
 * Tres osciladores hacen el mismo trabajo, funcionan sin red y no se pueden
 * «perder» al empaquetar.
 *
 * ── EL CANDADO DE AUTOPLAY ──────────────────────────────────────────────────
 * Chromium (y por tanto WebView2) crea el AudioContext en estado `suspended`
 * hasta que hay un gesto del usuario. Si se ignora, el KDS parece funcionar y
 * no suena nunca: el fallo silencioso de siempre. Por eso este módulo expone
 * `desbloquear()` y `estaListo()`, y la pantalla ENSEÑA un botón mientras no lo
 * esté, en vez de dar por hecho que se oye.
 *
 * El contexto es único por pestaña a propósito: los navegadores limitan cuántos
 * se pueden abrir, y uno por comanda agotaría el cupo en una comida.
 */

// Sol – Do – Mi: ascendente, corto, sin tercera menor. Se distingue de un aviso
// de error y no se confunde con el timbre de un teléfono, que en una cocina
// suena cada dos minutos.
const NOTAS = [784, 1047, 1319];
const DURACION = 0.14; // segundos por nota
const VOLUMEN = 0.22; // por encima de esto satura la bocina de una tablet

let ctx = null;

function crearContexto() {
  if (ctx) return ctx;
  const Audio = globalThis.AudioContext || globalThis.webkitAudioContext;
  if (!Audio) return null; // jsdom, o un WebView sin Web Audio
  try {
    ctx = new Audio();
  } catch {
    ctx = null;
  }
  return ctx;
}

/**
 * ¿El audio puede sonar YA? Falso mientras el navegador no vea un gesto.
 * La pantalla usa esto para decidir si enseña el botón de activar.
 */
export function estaListo() {
  return ctx != null && ctx.state === 'running';
}

/**
 * Llamar DESDE un manejador de click/tecla. Fuera de un gesto, `resume()` se
 * queda pendiente para siempre en Chromium.
 *
 * @returns {Promise<boolean>} si quedó listo. Se devuelve el resultado en vez
 *   de tragárselo para que quien llame pueda decirlo en pantalla.
 */
export async function desbloquear() {
  const c = crearContexto();
  if (!c) return false;
  try {
    if (c.state === 'suspended') await c.resume();
  } catch {
    return false;
  }
  return c.state === 'running';
}

/**
 * El pitido. No hace nada si el audio no está desbloqueado — y eso es correcto:
 * intentar sonar sin permiso deja un contexto colgado y no produce sonido.
 *
 * @param {number} veces repeticiones separadas por un silencio. Dos para una
 *   comanda; el aviso «hay varias» se distingue de oído sin mirar la pantalla.
 */
export function sonar(veces = 1) {
  const c = ctx;
  if (!c || c.state !== 'running') return false;

  const repeticiones = Math.max(1, Math.min(3, Number(veces) || 1));
  const largoTanda = NOTAS.length * DURACION + 0.12;

  for (let r = 0; r < repeticiones; r++) {
    NOTAS.forEach((hz, i) => {
      const inicio = c.currentTime + r * largoTanda + i * DURACION;
      const osc = c.createOscillator();
      const gan = c.createGain();

      // Triangular: más armónicos que una senoidal, así que se abre paso sobre
      // una campana extractora, pero sin el filo de una cuadrada.
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(hz, inicio);

      // La envolvente no es adorno: un oscilador que arranca y para en seco
      // produce un chasquido audible en bocinas baratas.
      gan.gain.setValueAtTime(0, inicio);
      gan.gain.linearRampToValueAtTime(VOLUMEN, inicio + 0.012);
      gan.gain.exponentialRampToValueAtTime(0.0001, inicio + DURACION);

      osc.connect(gan).connect(c.destination);
      osc.start(inicio);
      osc.stop(inicio + DURACION + 0.02);
    });
  }
  return true;
}

/** Sólo para pruebas: olvida el contexto entre casos. */
export function _reiniciar() {
  try {
    ctx?.close?.();
  } catch {
    /* da igual: se va a descartar */
  }
  ctx = null;
}
