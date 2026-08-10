/**
 * Puerta.js — qué login le toca a ESTE dispositivo.
 *
 * ── EL PROBLEMA ─────────────────────────────────────────────────────────────
 * Hay dos entradas y hasta ahora todos los dispositivos veían las dos:
 *
 *   · `/login`          — correo y contraseña. El dueño y quien administra.
 *   · `/loginempleados` — código del restaurante + PIN. El staff.
 *
 * El dueño se encontraba un teclado numérico que no iba a usar nunca, y el
 * mesero un formulario de correo que tampoco. Pero lo grave no era el ruido:
 *
 * **La puerta que se le ofrecía al mesero era la que NO funciona.** La tarjeta
 * de PIN de `/login` navegaba a `/checador`, que busca el PIN contra `staff` del
 * store — y `staff` sólo está poblado si YA hay sesión en el dispositivo,
 * porque lo trae `fetchInitialData` bajo RLS. En un teléfono recién emparejado
 * está vacío, así que el PIN correcto no encontraba a nadie. La entrada que sí
 * sirve, `/loginempleados`, se autentica de verdad contra Supabase con el código
 * del restaurante — y estaba escondida.
 *
 * ── POR QUÉ NO SE USA EL ROL DEL DISPOSITIVO ────────────────────────────────
 * Parecía lo natural —el hub guarda un rol por dispositivo emparejado— y no
 * sirve, por dos razones que se ven al leer `Hub.emparejar`:
 *
 *   1. **Todos los dispositivos se emparejan como `'mesero'`.** Es el valor por
 *      defecto del parámetro y el front nunca pasa otro.
 *   2. **El dispositivo no recuerda su rol.** Del canje sólo se guarda el token.
 *
 * Usarlo exigiría añadir las dos cosas. Y hay una señal que ya existe y dice lo
 * mismo con más certeza.
 *
 * ── LA SEÑAL: HABER SIDO EMPAREJADO ─────────────────────────────────────────
 * Un dispositivo con token del hub llegó escaneando el QR que la caja pinta en
 * `/hub`. Eso **es** un dispositivo de operación, por construcción: nadie
 * empareja el portátil del contador. Y la caja se distingue sola porque corre
 * dentro de Tauri.
 *
 *   enTauri()            → la caja           → correo
 *   token del hub        → teléfono o tablet → código + PIN
 *   ninguna de las dos   → navegador, web    → correo
 *
 * El respaldo es correo a propósito. Ante la duda conviene mandar a la puerta
 * que **cualquiera** puede abrir teniendo credenciales, no a la que exige un
 * código que quizá no se sepa: equivocarse hacia el correo cuesta un clic en el
 * enlace de vuelta; equivocarse hacia el PIN deja fuera a quien no tiene código.
 */

import { leerToken } from './Hub';

/**
 * Llave de la salida manual. Cuando el dueño pulsa «Soy el administrador» en un
 * dispositivo emparejado, se marca aquí para que la redirección no lo devuelva
 * en bucle a la pantalla de la que acaba de salir.
 *
 * Es de SESIÓN y no permanente: la excepción vale para el rato en que el dueño
 * toma la tablet, no para siempre. Cerrada la pestaña, la tablet vuelve a ser
 * de staff — que es lo que es el 99 % del tiempo.
 */
const SALIDA_KEY = 'invventa.entrarComoAdmin';

/**
 * ¿Este dispositivo se emparejó con el hub de alguna caja?
 *
 * Se pregunta a `Hub.leerToken()` y NO se lee `localStorage` por nuestra cuenta.
 * El primer intento de este archivo declaraba su propia constante con la llave
 * —y la escribió mal: `invventa.hubToken` en vez de `invventa.hub.token`—, con
 * lo que `estaEmparejado()` habría devuelto `false` siempre y todos los
 * teléfonos habrían acabado en el login de correo **sin que nada fallara**.
 *
 * Es el mismo patrón que el `nombre_restaurante` inexistente de ayer: una llave
 * duplicada no da error, sólo deja de encontrar. Preguntando al módulo que la
 * escribe, no hay dos verdades que mantener.
 */
export function estaEmparejado({ token = null } = {}) {
  return Boolean(token ?? leerToken());
}

/** ¿El dueño pidió expresamente entrar como administrador en este dispositivo? */
export function pidioEntrarComoAdmin({ sesion = null } = {}) {
  try {
    const s = sesion ?? window.sessionStorage;
    return s.getItem(SALIDA_KEY) === '1';
  } catch {
    return false;
  }
}

/** Marca la salida manual. La consume la redirección de `/login`. */
export function marcarEntrarComoAdmin({ sesion = null } = {}) {
  try {
    (sesion ?? window.sessionStorage).setItem(SALIDA_KEY, '1');
  } catch {
    /* sin sessionStorage se pierde la excepción, pero el enlace ya navegó */
  }
}

/** Olvida la salida manual: al volver a la puerta de staff deja de aplicar. */
export function olvidarEntrarComoAdmin({ sesion = null } = {}) {
  try {
    (sesion ?? window.sessionStorage).removeItem(SALIDA_KEY);
  } catch {
    /* noop */
  }
}

/**
 * La decisión.
 *
 * @param {object} opciones
 * @param {boolean} opciones.enTauri   ¿corre dentro de la ventana de la caja?
 * @param {boolean} opciones.emparejado
 * @param {boolean} [opciones.pidioAdmin] salida manual del dueño
 * @returns {'correo'|'codigo-pin'}
 */
export function puertaDelDispositivo({
  enTauri = false,
  emparejado = false,
  pidioAdmin = false,
}) {
  // La caja primero: puede estar emparejada consigo misma y aun así es la caja.
  if (enTauri) return 'correo';
  if (pidioAdmin) return 'correo';
  return emparejado ? 'codigo-pin' : 'correo';
}
