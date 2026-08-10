/**
 * Asistencias.js — reglas de emparejamiento entrada/salida del reloj checador.
 *
 * Se extrae de `RelojChecadorScreen` porque aquí vivía un bug que costó un
 * turno entero de trabajo a alguien y NO daba error: comparaba una fecha de
 * calendario local contra un timestamp UTC. En México (UTC−6) eso significa
 * que, a partir de las 18:00, el registro se guarda con la fecha de mañana.
 *
 * Consecuencias reales, las dos igual de malas:
 *
 *   1. El trabajador que entró a las 20:00 **no podía marcar su salida**: el
 *      filtro buscaba los registros de hoy y su entrada estaba archivada en
 *      mañana. «No tienes entrada activa para registrar salida.»
 *   2. Al día siguiente por la mañana, esa entrada fantasma SÍ aparecía, y el
 *      checador le decía «ya tienes entrada registrada» a quien acababa de
 *      llegar.
 *
 * De día funcionaba y de noche no — que es cuando trabaja un restaurante.
 *
 * La regla, en una línea: **un timestamp se convierte a SU día local antes de
 * compararlo con un día local.** Nunca `startsWith`.
 *
 * Puro: sin React, sin store, sin red.
 */

import { aISOLocal, hoyLocalISO } from './Fechas';

/**
 * Registros de un empleado que pertenecen a un día de trabajo concreto.
 *
 * @param {Array}  asistencias  filas con { empleado_id, tipo, fecha_hora }
 * @param {string|number} empleadoId
 * @param {string} [dia]  'YYYY-MM-DD' local; por defecto, hoy
 */
export function asistenciasDelDia(asistencias, empleadoId, dia = null) {
  const objetivo = dia || hoyLocalISO();
  const id = String(empleadoId ?? '');
  if (!id) return [];

  return (Array.isArray(asistencias) ? asistencias : []).filter((a) => {
    if (String(a?.empleado_id ?? '') !== id) return false;
    if (!a?.fecha_hora) return false;
    // Cada registro se traduce a SU día local. Comparar el prefijo del ISO
    // sería comparar el día de Greenwich con el día del restaurante.
    return aISOLocal(new Date(a.fecha_hora)) === objetivo;
  });
}

/**
 * La entrada abierta del empleado, o `null` si no tiene turno activo.
 *
 * Es el registro MÁS RECIENTE del día y solo cuenta si es de tipo `entrada`:
 * si lo último fue una salida, el turno está cerrado.
 */
export function entradaActiva(asistencias, empleadoId, dia = null) {
  const delDia = asistenciasDelDia(asistencias, empleadoId, dia);
  if (delDia.length === 0) return null;

  const ordenadas = [...delDia].sort(
    (a, b) => new Date(b.fecha_hora) - new Date(a.fecha_hora),
  );
  return ordenadas[0]?.tipo === 'entrada' ? ordenadas[0] : null;
}

/** Horas transcurridas desde una entrada. Se usa para el candado de jornada. */
export function horasDesde(entrada, ahora = new Date()) {
  if (!entrada?.fecha_hora) return 0;
  const t = new Date(entrada.fecha_hora).getTime();
  if (Number.isNaN(t)) return 0;
  return Math.max(0, (ahora.getTime() - t) / 3600000);
}
