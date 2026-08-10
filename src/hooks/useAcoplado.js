import { useSyncExternalStore } from 'react';

/**
 * ¿Cabe una segunda columna al lado del contenido principal?
 *
 * Es LA pregunta de la que cuelga toda la adaptación a pantallas. Los mockups
 * de teléfono y tablet no son dos diseños: son el mismo, y lo único que cambia
 * en los tres sitios donde cambian es si el panel secundario está **acoplado**
 * —columna fija a la derecha— o entra como **hoja** desde abajo.
 *
 *   · Carrito del POS
 *   · Detalle de mesa
 *   · Inspector del KDS
 *
 * Al estar la pregunta en un solo sitio, el umbral se mueve una vez y se mueve
 * en los tres. Repartida por el código en `lg:` sueltos, se mueve en dos de
 * tres y el tercero se descubre en el turno de un viernes.
 *
 * ── POR QUÉ EL ANCHO Y NO EL ROL DEL DISPOSITIVO ────────────────────────────
 * El hub ya guarda un rol por dispositivo emparejado (caja / mesero / KDS /
 * pantalla), y era tentador elegir la figura con eso. No se hace, por cuatro
 * razones que pesan más:
 *
 * 1. La versión web no tiene hub. Habría que inventar un respaldo, y el
 *    respaldo sería el ancho — o sea, el ancho sería el mecanismo real de
 *    todas formas, con un segundo mecanismo encima que mantener.
 *
 * 2. Si el rol se equivoca —la tablet que era KDS ahora la carga un mesero— la
 *    pantalla queda mal y el usuario no puede arreglarlo. Con el ancho, lo que
 *    ve siempre corresponde al cristal que tiene delante.
 *
 * 3. Probar el ancho es cambiar un número. Probar el rol pide un hub
 *    emparejado, un token y un dispositivo dado de alta: dos ejes en vez de
 *    uno, y el segundo no se puede recorrer en una prueba unitaria.
 *
 * 4. El rol ya decide lo que tiene que decidir —qué entradas de menú se ven y
 *    a qué pantalla llega cada quien— a través de los permisos. Que además
 *    decidiera la FIGURA sería un tercer mecanismo junto a permisos y ancho.
 *
 * Dicho corto: **el ancho decide la figura, el rol decide el contenido.** Una
 * tablet de mesero y una de caja quieren la misma figura; lo que cambia entre
 * ellas es qué hay dentro, y de eso ya se encarga `usePermisos`.
 *
 * ── POR QUÉ `useSyncExternalStore` ──────────────────────────────────────────
 * `matchMedia` es estado que vive fuera de React. Leerlo con `useState` +
 * `useEffect` obliga a escribir estado dentro de un efecto, que es justo lo que
 * prohíbe la regla `set-state-in-effect` del compilador de React, y además abre
 * un primer render con el valor equivocado: en un teléfono se pintaría medio
 * frame la columna acoplada antes de corregirse.
 */

/** Umbral en píxeles. 1024 es el ancho de la tablet en horizontal, que es el
 *  dispositivo más estrecho donde la segunda columna todavía deja al catálogo
 *  un ancho digno. Por debajo, dos columnas dejan dos columnas malas. */
export const ANCHO_ACOPLADO = 1024;

const CONSULTA = `(min-width: ${ANCHO_ACOPLADO}px)`;

function suscribir(avisar) {
  // En un entorno sin `matchMedia` (jsdom viejo, alguna WebView rara) no se
  // suscribe nada y el valor se queda fijo. Es preferible una figura estable a
  // reventar el render de la caja por una API de detección.
  if (typeof window === 'undefined' || !window.matchMedia) return () => {};
  const mq = window.matchMedia(CONSULTA);
  mq.addEventListener('change', avisar);
  return () => mq.removeEventListener('change', avisar);
}

function leer() {
  if (typeof window === 'undefined' || !window.matchMedia) return true;
  return window.matchMedia(CONSULTA).matches;
}

// Instantánea para render en servidor / sin DOM: se asume acoplado. La app no
// se renderiza en servidor, pero si algún día se hiciera, la figura ancha es la
// que menos daño hace al hidratar en cualquiera de los dos casos.
const leerSinDom = () => true;

export function useAcoplado() {
  return useSyncExternalStore(suscribir, leer, leerSinDom);
}
