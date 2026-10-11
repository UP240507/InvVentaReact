// ─── LA FRANJA DEL DÍA: MATUTINO / VESPERTINO ────────────────────────────────
// El diseño completo está en `docs/DISENO_TURNOS.md`. Aquí vive la regla, y
// sólo la regla: este módulo es puro —sin React, sin store, sin red— porque lo
// llaman el POS al cobrar, el inventario al mover y los gastos al capturar, y
// una función que se llama desde tres sitios no puede depender de ninguno.
//
// ── POR QUÉ «FRANJA» Y NO «TURNO» ───────────────────────────────────────────
// `ventas.turno_id` YA EXISTE y significa **la sesión de caja**: alguien la
// abre, alguien la cierra, se arquea contra el cajón. La mitad del día es otra
// cosa —existe aunque nadie abra caja, y una sesión puede cruzarla—. Meter los
// dos significados en una columna es el error de `gastos.origen`, pero con
// dinero de por medio y en la tabla más consultada del sistema.
//
// En pantalla se sigue diciendo «Turno matutino», que es como se habla en un
// restaurante. Esa divergencia entre la palabra de la interfaz y la del
// esquema se paga a propósito: es más barata que dos `turno` distintos.
//
// ── SE CALCULA AL ESCRIBIR, NUNCA AL LEER ───────────────────────────────────
// Si la franja se derivara al consultar, mover la hora de corte reescribiría el
// pasado: las ventas de marzo saltarían de franja al tocar una casilla, en
// silencio, y un mes cerrado dejaría de cuadrar con lo que se imprimió. Se
// estampa en la fila y ahí se queda.
//
// ── LA HORA ES LOCAL ────────────────────────────────────────────────────────
// El corte son «las 16:00» del local, no las 16:00 UTC. Se usan los getters de
// `Date`, que leen la zona del aparato donde corre el POS — la misma decisión y
// por el mismo motivo que `lib/Fechas.js`, que existe porque un gasto de las
// 23:20 se sellaba con el día siguiente y desaparecía del periodo.

export const MATUTINO = 'matutino';
export const VESPERTINO = 'vespertino';

/** El corte por defecto, el mismo que el `default` de la columna. */
export const CORTE_POR_DEFECTO = '16:00';

/**
 * Las dos franjas y una tercera vista que lo enseña todo.
 *
 * `todos` va primero y es el valor por defecto: mientras nadie elija, no se
 * esconde nada. Un filtro de dinero que arranca filtrando es una forma
 * silenciosa de mentir.
 */
export const FRANJAS = [
  { id: 'todos', label: 'Todo el día' },
  { id: MATUTINO, label: 'Turno matutino' },
  { id: VESPERTINO, label: 'Turno vespertino' },
];

/**
 * 'HH:MM' o 'HH:MM:SS' → minutos desde medianoche. `null` si no es una hora.
 *
 * Devolver `null` en vez de asumir las 16:00 es deliberado: un corte corrupto
 * clasificaría mal cada venta a partir de ese momento, y eso no se nota hasta
 * que alguien compara dos reportes. Sin corte válido, la fila se queda sin
 * clasificar — que es visible y se arregla.
 */
function minutosDeCorte(corte) {
  const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?/.exec(String(corte ?? '').trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return h * 60 + min;
}

/**
 * ¿En qué franja cae este instante?
 *
 * La hora del corte cuenta como vespertino: con corte a las 16:00, una venta
 * cobrada a las 16:00:00 en punto es de la tarde. El límite tiene que caer de
 * un lado u otro, y «desde las cuatro es la tarde» es como lo diría cualquiera
 * en el local.
 *
 * @param {Date|string} fecha  instante a clasificar
 * @param {string} corte       'HH:MM' local
 * @returns {'matutino'|'vespertino'|null}
 */
export function franjaDe(fecha, corte) {
  // `new Date(null)` es 1970 y `new Date('')` es inválida: la primera pasaría
  // por buena y clasificaría como matutino una fila sin fecha, en silencio.
  // Aquí no hay «ahora» por defecto a propósito — quien no tenga la fecha
  // delante no debería estar clasificando.
  if (fecha == null || fecha === '') return null;
  const d = fecha instanceof Date ? fecha : new Date(fecha);
  if (Number.isNaN(d.getTime())) return null;
  // «No me dijeron corte» y «me dieron basura» no son lo mismo: lo primero es
  // el uso normal —el local no ha tocado el ajuste— y usa el valor por
  // defecto, que es el mismo de la columna. Lo segundo se queda sin clasificar.
  const limite = minutosDeCorte(corte ?? CORTE_POR_DEFECTO);
  if (limite === null) return null;
  const minutos = d.getHours() * 60 + d.getMinutes();
  return minutos < limite ? MATUTINO : VESPERTINO;
}

/**
 * La franja que hay que guardar en la fila que se está escribiendo.
 *
 * **Ésta es la que se llama desde el POS, el inventario y los gastos**, y no
 * `franjaDe` a secas. El motivo es que el apagado tiene que ser imposible de
 * olvidar: con `franjas_activas = false` devuelve `null`, y `null` significa
 * «sin clasificar», que es exactamente lo que debe quedar guardado en un local
 * que no usa franjas. Si cada pantalla comprobara el flag por su cuenta, el día
 * que a una se le olvidara empezaría a clasificar sola.
 *
 * @param {object} configuracion  la fila de `configuracion` del local
 * @param {Date|string} fecha     el instante que se está guardando
 */
export function franjaAlEscribir(
  configuracion,
  fecha = new Date(),
  turnos = null,
) {
  if (!configuracion?.franjas_activas) return null;
  const corte = configuracion?.franja_corte || CORTE_POR_DEFECTO;
  if (configuracion?.franja_por_corte) {
    return franjaPorCorte(fecha, turnos, corte);
  }
  return franjaDe(fecha, corte);
}

// ─── LA TARDE EMPIEZA CON EL PRIMER CORTE DE CAJA (10-oct) ──────────────────
// Pedido de AZUL. Con el corte a una hora fija, una mesa del desayuno que se
// alarga pasadas las 2 empezaba a pedir con precios de la tarde y dejaba de ver
// los desayunos en la caja. Y el reporte la contaba en la tarde aunque el
// billete entrara al cajón de la mañana. En AZUL nunca se hace corte hasta
// acabar el turno, y el corte no se deja hacer con mesas abiertas
// (`mesasAbiertas`), así que el primer corte del día es el cambio de turno de
// verdad: reporte, carta y cajón dicen lo mismo.
//
// Esto corrige §1.1 de docs/DISENO_TURNOS.md («la franja se deriva del reloj»)
// sólo para el local que lo enciende, y conserva su miedo: «la noche que a
// nadie se le ocurrió cerrar el turno». Si no hay corte, manda el reloj:
// `franja_corte` pasa a ser la hora de RESPALDO.

/** 'YYYY-M-D' en la hora del aparato. */
function diaLocal(d) {
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

/** Fecha de la base → Date. Acepta ISO sin zona (Supabase a veces la omite). */
export function aFecha(v) {
  if (v == null || v === '') return null;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v;
  const s = String(v);
  const conZona = s.endsWith('Z') || /[+-]\d{2}:?\d{2}$/.test(s) ? s : `${s}Z`;
  const d = new Date(conZona);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * El instante del primer corte de caja del día de `fecha`, hasta `fecha`.
 * `null` si todavía no hay.
 *
 * Sólo cuentan los turnos ABIERTOS Y CERRADOS ese mismo día: el turno de la
 * tarde que se cierra a las 0:30 es un corte de «hoy», pero de la jornada de
 * ayer, y contarlo pondría todo el día siguiente en la tarde. Tampoco cuentan
 * los `cerrado_forzado` (un turno huérfano que se cerró solo al abrir otro).
 */
export function primerCorteDelDia(turnos, fecha = new Date()) {
  const ahora = aFecha(fecha);
  if (!ahora) return null;
  const hoy = diaLocal(ahora);
  let primero = null;
  for (const t of Array.isArray(turnos) ? turnos : []) {
    if (t?.estado !== 'cerrado') continue;
    const cierre = aFecha(t.fecha_cierre);
    const apertura = aFecha(t.fecha_apertura);
    if (!cierre || !apertura) continue;
    if (diaLocal(cierre) !== hoy || diaLocal(apertura) !== hoy) continue;
    if (cierre > ahora) continue;
    if (!primero || cierre < primero) primero = cierre;
  }
  return primero;
}

/**
 * La franja según el corte: tarde desde el primer corte del día; sin corte,
 * la hora de respaldo decide. Sin `turnos` (quien llama no los tiene) también
 * decide la hora: es lo seguro, no inventar un corte.
 */
export function franjaPorCorte(fecha, turnos, respaldo = CORTE_POR_DEFECTO) {
  const d = aFecha(fecha);
  if (!d) return null;
  if (primerCorteDelDia(turnos, d)) return VESPERTINO;
  return franjaDe(d, respaldo);
}

/**
 * Las mesas que impiden el corte de caja: ocupadas o esperando cobro.
 * Con el turno por corte, una mesa abierta al cortar quedaría con lo pedido en
 * la mañana y lo que pida después en la tarde, y su dinero en el cajón
 * equivocado. AZUL prefiere que el sistema quede limpio: no se corta.
 */
export function mesasAbiertas(mesas = []) {
  return (Array.isArray(mesas) ? mesas : []).filter((m) =>
    ['ocupada', 'por_cobrar'].includes(m?.estado),
  );
}

/** Cómo se nombra una franja en pantalla. `null` tiene nombre propio. */
export function etiquetaDeFranja(franja) {
  if (franja === MATUTINO) return 'Turno matutino';
  if (franja === VESPERTINO) return 'Turno vespertino';
  return 'Sin clasificar';
}

/** La franja de una fila ya guardada, normalizada. */
export function franjaDeFila(fila) {
  const v = String(fila?.franja ?? '').trim();
  return v === MATUTINO || v === VESPERTINO ? v : null;
}

/**
 * Filtra una LISTA por franja.
 *
 * ── LO SIN CLASIFICAR SALE EN LAS DOS ───────────────────────────────────────
 * Misma regla que las escalas de gasto, y por el mismo motivo: en una lista, el
 * fallo caro no es enseñar de más, es **esconder**. Las filas anteriores a que
 * la columna existiera —o las de un local que acaba de encender las franjas—
 * tienen `franja = null`, y si cayeran fuera de las dos vistas, una venta real
 * quedaría invisible.
 */
export function filtrarPorFranja(filas = [], franja = 'todos') {
  const lista = Array.isArray(filas) ? filas : [];
  if (franja !== MATUTINO && franja !== VESPERTINO) return lista;
  return lista.filter((f) => {
    const v = franjaDeFila(f);
    return v === null || v === franja;
  });
}

/**
 * Filtra para SUMAR una cifra por franja.
 *
 * ── Y AQUÍ LA REGLA ES LA CONTRARIA, A PROPÓSITO ────────────────────────────
 * En una lista, contar de más se ve y se corrige. En una cifra, no: si lo sin
 * clasificar se sumara en las dos franjas, **la mañana más la tarde daría más
 * que el día entero**, y ese número acabaría en un reporte que alguien usa para
 * decidir. Por eso son dos funciones y no una con un parámetro: son dos reglas
 * distintas, y ponerlas juntas invita a usar la que no toca.
 */
export function soloDeFranja(filas = [], franja = 'todos') {
  const lista = Array.isArray(filas) ? filas : [];
  if (franja !== MATUTINO && franja !== VESPERTINO) return lista;
  return lista.filter((f) => franjaDeFila(f) === franja);
}

/** Cuántas filas del periodo siguen sin clasificar. Lo usa el aviso. */
export function cuantasSinFranja(filas = []) {
  return (Array.isArray(filas) ? filas : []).filter(
    (f) => franjaDeFila(f) === null,
  ).length;
}
