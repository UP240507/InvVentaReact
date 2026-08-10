// ─── FECHAS DE CALENDARIO (día local, no instante UTC) ───────────────────────
// Bug real encontrado el 27-jul-2026: los gastos capturados de noche no aparecían
// en la pantalla. La causa era `new Date().toISOString().slice(0, 10)`.
//
// `toISOString()` devuelve la fecha en **UTC**. En México (UTC-6) a partir de las
// 18:00 locales el reloj UTC ya está en el día siguiente, así que un gasto
// registrado a las 23:20 del 26 se guardaba con fecha del **27**. El filtro del
// periodo compara contra `ahora` (26, 23:20) y lo dejaba fuera: el dueño lo
// capturaba, se guardaba bien en Supabase, y no lo veía por ningún lado.
//
// La distinción de fondo: un `timestamptz` (cuándo ocurrió algo) y una fecha de
// calendario (a qué DÍA DE TRABAJO pertenece) son cosas distintas. La segunda no
// tiene zona horaria: es la que aparece en el recibo, en la nómina y en el
// reporte. Un restaurante que cierra a la 1am necesita que su noche cuente como
// un solo día, y ningún día de operación empieza a las 18:00.
//
// Este módulo es puro: sin React, sin store, sin red.

const dosDigitos = (n) => String(n).padStart(2, '0');

/**
 * Fecha de calendario de un Date, en HORA LOCAL, como 'YYYY-MM-DD'.
 * Es el reemplazo directo de `d.toISOString().slice(0, 10)`.
 */
export function aISOLocal(fecha = new Date()) {
  const d = fecha instanceof Date ? fecha : new Date(fecha);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${dosDigitos(d.getMonth() + 1)}-${dosDigitos(d.getDate())}`;
}

/** Hoy, en hora local, como 'YYYY-MM-DD'. */
export function hoyLocalISO(ahora = new Date()) {
  return aISOLocal(ahora);
}

/**
 * Convierte 'YYYY-MM-DD' a un Date a MEDIANOCHE LOCAL.
 *
 * `new Date('2026-07-27')` se interpreta como UTC —el mismo error, al revés—:
 * en México devolvería el 26 a las 18:00. Con el sufijo de hora el motor usa la
 * zona local, que es lo que quiere decir una fecha de calendario.
 */
export function deISOLocal(iso) {
  if (!iso) return null;
  const s = String(iso);
  const d = /^\d{4}-\d{2}-\d{2}$/.test(s)
    ? new Date(`${s}T00:00:00`)
    : new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Suma (o resta, con negativos) días a una fecha, sin tocar la hora local. */
export function sumarDias(fecha, dias) {
  const d = fecha instanceof Date ? new Date(fecha) : deISOLocal(fecha);
  if (!d) return null;
  d.setDate(d.getDate() + Number(dias || 0));
  return d;
}

/** Igual que `sumarDias`, pero devolviendo 'YYYY-MM-DD'. */
export function sumarDiasISO(fecha, dias) {
  return aISOLocal(sumarDias(fecha, dias));
}

/** Primer día del mes de `fecha`, en 'YYYY-MM-DD' local. */
export function inicioDeMesISO(fecha = new Date()) {
  const d = fecha instanceof Date ? fecha : new Date(fecha);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${dosDigitos(d.getMonth() + 1)}-01`;
}

/** ¿Las dos fechas caen el mismo día local? Acepta Date o 'YYYY-MM-DD'. */
export function mismoDia(a, b) {
  const x = a instanceof Date ? aISOLocal(a) : aISOLocal(deISOLocal(a));
  const y = b instanceof Date ? aISOLocal(b) : aISOLocal(deISOLocal(b));
  return x != null && x === y;
}
