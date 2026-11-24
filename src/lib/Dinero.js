/**
 * Dinero.js — el único sitio donde se decide cómo se escribe una cantidad de
 * dinero en pantalla y en papel.
 *
 * ── POR QUÉ EXISTE ──────────────────────────────────────────────────────────
 * El 7-sep salió `$15.0000` en el corte y tres decimales en 57 sitios: el
 * máximo de decimales de `Intl` no es el mínimo, y el formato estaba escrito a
 * mano en cada pantalla, con su propia copia de las opciones. Un sitio que se
 * escribe distinto es un sitio que algún día se equivoca distinto.
 *
 * Desde la fase 1 todas las pantallas, el ticket y la pre-cuenta pasan por aquí,
 * y una prueba (`src/test/dinero-sin-formato-a-mano.test.js`) falla si alguien
 * vuelve a escribir las opciones a mano fuera de este archivo.
 *
 * ── LAS REGLAS ──────────────────────────────────────────────────────────────
 * - Siempre dos decimales: `$1,234.50`, nunca `$1,234.5` ni `$1,234.500`.
 * - Separador de miles con coma y punto decimal, como se lee en México.
 * - Lo que no es un número (null, undefined, texto) se escribe `$0.00`: un
 *   `$NaN` en un ticket no le dice nada a nadie.
 * - Los negativos se quedan como estaban, `$-5.00` (decisión del 23-nov: el
 *   cambio a `-$5.00`, si se quiere, va aparte y se ve).
 *
 * Los costos por ml o por g, que necesitan hasta cuatro decimales, NO pasan por
 * aquí: son otro dato y tienen su propio formato en la pantalla que los pinta.
 *
 * Puro: sin React, sin stores, sin red.
 */

const OPCIONES = { minimumFractionDigits: 2, maximumFractionDigits: 2 };

/** «1234.5» → «1,234.50». Para donde el signo de pesos se pinta aparte. */
export function formatoImporte(n) {
  const v = Number(n);
  return (Number.isFinite(v) ? v : 0).toLocaleString('es-MX', OPCIONES);
}

/** «1234.5» → «$1,234.50». */
export function formatoDinero(n) {
  return `$${formatoImporte(n)}`;
}
