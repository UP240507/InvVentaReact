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

/**
 * A partir de cuántas horas una entrada sin salida deja de ser «alguien
 * trabajando» y pasa a ser «alguien que olvidó marcar».
 *
 * 18 y no 24: un turno doble en un restaurante puede llegar a 14 o 15 horas y
 * sigue siendo real. Pasadas 18 nadie está dentro; lo que hay es un registro
 * abierto que alguien tiene que cerrar a mano. Meterlo en la misma lista que a
 * los que sí están haría dos cosas malas a la vez — inflar la plantilla activa
 * y esconder el error de captura entre los nombres correctos.
 */
export const HORAS_PARA_OLVIDO = 18;

/**
 * A qué hora hay que cerrar una entrada abierta, y por qué a esa.
 *
 * ── POR QUÉ ESTO NO ES SIEMPRE «AHORA» ──────────────────────────────────────
 * Cerrar con la hora actual es correcto para quien acaba de terminar su turno y
 * es **dinero mal pagado** para quien olvidó marcar salida anteayer.
 *
 * `lib/Nominas.js` empareja entradas y salidas de `asistencias` y de ahí sale el
 * pago de quien cobra por hora (`tipo_sueldo: 'hora'`). Un registro abierto
 * desde hace dos días, cerrado con `now()`, no deja una fila fea en una tabla:
 * paga cuarenta horas. Y lo paga en silencio, porque la nómina no tiene forma de
 * saber que ese turno es un error de captura y no un turno.
 *
 * La salida es la que dijo Chris: **el sistema ya sabe cuánto dura una jornada**
 * (`configuracion.horas_jornada`, que ya existe para el candado de salida). Un
 * olvido se cierra a `entrada + jornada`. No es la hora exacta a la que esa
 * persona se fue —eso no lo sabe nadie— pero es la única cifra defendible: paga
 * lo contratado, no premia el olvido ni castiga por él.
 *
 * Si no hay jornada configurada (0 = candado apagado) no hay de dónde deducirla,
 * y entonces el módulo lo dice en vez de inventar un número. Adivinar aquí sería
 * adivinar sobre la nómina.
 *
 * @param {object} entrada registro de tipo `entrada` con `fecha_hora`
 * @param {object} opciones
 * @param {number} [opciones.horasJornada] `configuracion.horas_jornada`
 * @param {Date}   [opciones.ahora]
 * @param {number} [opciones.horasParaOlvido]
 * @returns {{tipo: 'ahora'|'jornada'|'indeterminable', fecha: Date|null, horas: number|null}}
 */
export function cierreSugerido(
  entrada,
  {
    horasJornada = 0,
    ahora = new Date(),
    horasParaOlvido = HORAS_PARA_OLVIDO,
  } = {},
) {
  const inicioMs = new Date(entrada?.fecha_hora ?? NaN).getTime();
  if (Number.isNaN(inicioMs)) {
    return { tipo: 'indeterminable', fecha: null, horas: null };
  }

  const transcurridas = horasDesde(entrada, ahora);
  if (transcurridas <= horasParaOlvido) {
    return { tipo: 'ahora', fecha: new Date(ahora), horas: transcurridas };
  }

  const jornada = Number(horasJornada) || 0;
  if (jornada <= 0) {
    return { tipo: 'indeterminable', fecha: null, horas: null };
  }

  return {
    tipo: 'jornada',
    fecha: new Date(inicioMs + jornada * 3600000),
    horas: jornada,
  };
}

/**
 * El último registro de un empleado, sin importar de qué día sea.
 *
 * ── POR QUÉ NO SE REUSA `entradaActiva` PARA ESTO ───────────────────────────
 * `entradaActiva` pregunta «¿tiene turno abierto HOY?», que es lo correcto para
 * el checador: quien marca su salida lo hace el mismo día en que la app lo está
 * atendiendo, y acotar al día evita emparejar la salida de hoy con la entrada
 * de anteayer.
 *
 * Pero «¿quién está dentro AHORA?» es otra pregunta, y acotarla al día local da
 * la respuesta equivocada exactamente cuando importa. A la 1:00 de la mañana,
 * quien entró ayer a las 22:00 sigue trabajando y su entrada pertenece al día
 * de AYER: la lista saldría **vacía en plena madrugada**, que es el turno en el
 * que un dueño no está presente y por tanto el único en el que de verdad
 * necesita mirarla.
 *
 * Es el mismo error que motivó este módulo —comparar contra un día de
 * calendario algo que no respeta días de calendario— pero por el otro lado: allí
 * se comparaba mal el día, aquí sobraría la comparación entera. La pregunta
 * «está dentro» no tiene fecha; tiene un antes y un después.
 */
export function ultimoRegistro(asistencias, empleadoId) {
  const id = String(empleadoId ?? '');
  if (!id) return null;

  let ultimo = null;
  let ultimoMs = -Infinity;
  for (const a of Array.isArray(asistencias) ? asistencias : []) {
    if (String(a?.empleado_id ?? '') !== id) continue;
    const ms = new Date(a?.fecha_hora ?? NaN).getTime();
    if (Number.isNaN(ms)) continue;
    if (ms > ultimoMs) {
      ultimoMs = ms;
      ultimo = a;
    }
  }
  return ultimo;
}

/**
 * Quién está dentro ahora mismo, y quién dejó un registro abierto.
 *
 * Recorre las ASISTENCIAS y no la plantilla, a propósito: así la lista sale
 * completa aunque `staff` no esté cargado —el checador guarda
 * `empleado_nombre` en cada marca— y no se pierde a nadie que haya marcado y
 * luego se diera de baja. `staff` sólo se usa para enriquecer con el puesto.
 *
 * @param {Array} asistencias filas con { empleado_id, empleado_nombre, tipo, fecha_hora }
 * @param {object} opciones
 * @param {Array}  [opciones.staff] para el puesto; opcional
 * @param {Date}   [opciones.ahora]
 * @param {number} [opciones.horasJornada] `configuracion.horas_jornada`; 0 = sin candado
 * @param {number} [opciones.horasParaOlvido]
 * @returns {{activos: Array, olvidados: Array}} ambos ordenados de más antiguo
 *   a más reciente: el primero de la lista es quien lleva más tiempo dentro, que
 *   es el que está a punto de cumplir jornada y por tanto el que hay que mirar.
 */
export function plantillaActiva(
  asistencias,
  {
    staff = [],
    ahora = new Date(),
    horasJornada = 0,
    horasParaOlvido = HORAS_PARA_OLVIDO,
  } = {},
) {
  const filas = Array.isArray(asistencias) ? asistencias : [];
  const ids = new Set(
    filas.map((a) => String(a?.empleado_id ?? '')).filter(Boolean),
  );

  const puestoDe = new Map(
    (Array.isArray(staff) ? staff : []).map((s) => [
      String(s?.id ?? ''),
      s?.puesto || s?.rol || null,
    ]),
  );

  const activos = [];
  const olvidados = [];

  for (const id of ids) {
    const ultimo = ultimoRegistro(filas, id);
    // Si lo último fue una salida, esa persona no está dentro. Y punto: no hace
    // falta mirar más atrás.
    if (ultimo?.tipo !== 'entrada') continue;

    const horas = horasDesde(ultimo, ahora);
    const jornada = Number(horasJornada) || 0;

    const registro = {
      empleadoId: id,
      nombre: ultimo.empleado_nombre || `#${id}`,
      puesto: puestoDe.get(id) ?? null,
      entrada: ultimo,
      desde: ultimo.fecha_hora,
      horas,
      // `false` cuando el candado está apagado (jornada 0): sin jornada
      // configurada no hay nada que cumplir, y marcar a todos de amarillo
      // convertiría el aviso en decoración.
      jornadaCumplida: jornada > 0 && horas >= jornada,
    };

    if (horas > horasParaOlvido) olvidados.push(registro);
    else activos.push(registro);
  }

  const porAntiguedad = (a, b) => new Date(a.desde) - new Date(b.desde);
  return {
    activos: activos.sort(porAntiguedad),
    olvidados: olvidados.sort(porAntiguedad),
  };
}
