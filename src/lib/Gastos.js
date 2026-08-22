// ─── GASTOS Y COSTOS FIJOS (Fase 2.5) ────────────────────────────────────────
// Motor PURO. Sin React, sin store, sin red.
//
// Por qué existe esta fase: hasta ahora el sistema solo conocía el costo de los
// INSUMOS, así que el Dashboard podía dar MARGEN BRUTO pero no utilidad. Un
// dueño que ve "margen bruto" y cree estar viendo su utilidad decide con una
// cifra incompleta — y eso es peor que no darle la cifra.
//
// Dos reglas de negocio que NO son obvias y conviene no revertir sin pensarlo:
//
//  1. La NÓMINA entra al P&L por `total_sueldos`, NUNCA por `gran_total`.
//     El gran total incluye las propinas, y la propina no es dinero del
//     negocio: entra del cliente y sale al personal. Contarla como gasto
//     inflaría el costo exactamente igual que contarla como ingreso lo
//     inflaría al otro lado (ver `agregarVentas` en Metricas.js).
//
//  2. La nómina NO se captura a mano (decisión de Chris, 25-jul). Se deriva de
//     las nóminas ya procesadas. Si se pudiera capturar además a mano, se
//     contaría dos veces y la utilidad mentiría sin que nada lo avise — que es
//     justo lo que se quiere evitar al lanzar.

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const round2 = (n) => Math.round((num(n) + Number.EPSILON) * 100) / 100;

/** Fecha (Date) de un gasto, tolerante con el formato. */
export function fechaDeGasto(g) {
  const raw = g?.fecha;
  if (!raw) return null;
  // 'YYYY-MM-DD' se interpreta como UTC si se pasa tal cual a new Date(), lo
  // que en México adelanta el gasto un día. Se fuerza hora local.
  const d =
    typeof raw === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw)
      ? new Date(`${raw}T00:00:00`)
      : new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Gastos activos dentro de [desde, hasta]. */
export function gastosEnRango(gastos = [], desde, hasta) {
  const ini = desde instanceof Date ? desde.getTime() : 0;
  const fin = hasta instanceof Date ? hasta.getTime() : Infinity;
  return (gastos || []).filter((g) => {
    if (!g || g.activo === false) return false;
    const d = fechaDeGasto(g);
    if (!d) return false;
    const t = d.getTime();
    return t >= ini && t <= fin;
  });
}

/**
 * Convierte las nóminas procesadas en gastos derivados.
 *
 * `origen_ref` es el id de la nómina: la BD tiene un índice único parcial sobre
 * (restaurante, origen, origen_ref) que hace IMPOSIBLE que la misma nómina
 * entre dos veces, aunque la app se equivocara.
 */
export function gastosDeNomina(nominas = []) {
  return (nominas || [])
    .filter((n) => n && n.activo !== false)
    .map((n) => ({
      id: `nomina-${n.id}`,
      categoria_id: 'nomina',
      concepto: `Nómina ${n.fecha_inicio ?? ''} → ${n.fecha_fin ?? ''}`.trim(),
      // SOLO sueldos. Ver la regla 1 de la cabecera.
      monto: round2(num(n.total_sueldos)),
      fecha: n.fecha_fin || n.fecha_inicio,
      origen: 'nomina',
      origen_ref: String(n.id),
      estado: 'pagado',
      activo: true,
      // Marca para la UI: estas filas son de solo lectura, se corrigen en
      // Nóminas. Editarlas aquí dejaría las dos pantallas discrepando.
      _derivado: true,
    }))
    .filter((g) => g.monto > 0 && g.fecha);
}

/** Todos los gastos del periodo: los capturados MÁS los derivados de nómina. */
export function gastosConsolidados(gastos = [], nominas = []) {
  // Si alguna vez entrara un gasto con origen 'nomina' capturado a mano (no
  // debería: la UI no lo permite y la BD tiene índice único), se descarta aquí
  // para que la cifra no se duplique ni en ese caso.
  const manuales = (gastos || []).filter((g) => g && g.origen !== 'nomina');
  return [...manuales, ...gastosDeNomina(nominas)];
}

/** Total y desglose por categoría de un conjunto de gastos. */
export function agregarGastos(gastos = [], categorias = []) {
  const porCat = new Map();
  let total = 0;
  let fijos = 0;
  let variables = 0;
  let pendientes = 0;

  const infoCat = new Map(
    (categorias || []).filter(Boolean).map((c) => [String(c.id), c]),
  );

  for (const g of gastos) {
    const monto = round2(num(g.monto));
    // Un gasto PENDIENTE es una plantilla generada cuyo importe real todavía no
    // se confirmó: se cuenta aparte y NO entra en el total, porque meter una
    // estimación en la utilidad es exactamente el ruido que se quería evitar.
    if (g.estado === 'pendiente') {
      pendientes += monto;
      continue;
    }
    total += monto;
    const cat = infoCat.get(String(g.categoria_id));
    if (cat?.fijo) fijos += monto;
    else variables += monto;

    const prev = porCat.get(g.categoria_id) || {
      id: g.categoria_id,
      nombre: cat?.nombre || g.categoria_id,
      fijo: !!cat?.fijo,
      monto: 0,
      conteo: 0,
    };
    prev.monto = round2(prev.monto + monto);
    prev.conteo += 1;
    porCat.set(g.categoria_id, prev);
  }

  return {
    total: round2(total),
    fijos: round2(fijos),
    variables: round2(variables),
    pendientes: round2(pendientes),
    porCategoria: [...porCat.values()].sort((a, b) => b.monto - a.monto),
  };
}

/**
 * ¿Qué gastos hay que generar hoy a partir de las plantillas recurrentes?
 *
 * Idempotente por diseño: solo propone el periodo que aún no se ha generado
 * (`ultima_generacion`), así que llamarlo diez veces en el mismo día produce lo
 * mismo que llamarlo una. El `origen_ref` lleva el mes, y la BD lo respalda con
 * un índice único — dos capas para lo mismo, porque un gasto duplicado en el
 * P&L no se nota hasta el cierre de mes.
 *
 * @returns {Array} gastos nuevos en estado 'pendiente' (falta el monto real)
 */
export function generarRecurrentes(plantillas = [], ahora = new Date()) {
  const anio = ahora.getFullYear();
  const mes = ahora.getMonth();
  const clavePeriodo = `${anio}-${String(mes + 1).padStart(2, '0')}`;

  return (plantillas || [])
    .filter((p) => p && p.activo !== false)
    .filter((p) => {
      // Aún no llega su día del mes.
      if (ahora.getDate() < (num(p.dia_del_mes) || 1)) return false;
      // Ya se generó este mes.
      if (p.ultima_generacion) {
        const u = String(p.ultima_generacion);
        if (u.slice(0, 7) === clavePeriodo) return false;
      }
      return true;
    })
    .map((p) => ({
      categoria_id: p.categoria_id,
      concepto: p.concepto,
      // El monto de la plantilla es una ESTIMACIÓN: la luz no cuesta lo mismo
      // cada mes. Entra como pendiente y no suma hasta que se confirma.
      monto: round2(num(p.monto_estimado)),
      fecha: `${clavePeriodo}-${String(num(p.dia_del_mes) || 1).padStart(2, '0')}`,
      origen: 'recurrente',
      origen_ref: `${p.id}:${clavePeriodo}`,
      estado: 'pendiente',
      activo: true,
      _plantillaId: p.id,
    }));
}

/**
 * Resumen de gastos del periodo, listo para el Dashboard y la pantalla.
 * `nominas` se pasa aparte porque no son filas de `gastos`: se derivan.
 */
export function resumenGastos({
  gastos = [],
  nominas = [],
  categorias = [],
  desde,
  hasta,
} = {}) {
  const todos = gastosConsolidados(gastos, nominas);
  const delPeriodo = gastosEnRango(todos, desde, hasta);
  return { ...agregarGastos(delPeriodo, categorias), gastos: delPeriodo };
}

// ─── LAS DOS PESTAÑAS: DEL TURNO Y FUERTES ──────────────────────────────────

/**
 * Las dos escalas de gasto, y una tercera vista que lo enseña todo.
 *
 * ── POR QUÉ NO SE LLAMAN «CAJA CHICA» Y «CAJA GRANDE» ──────────────────────
 * Porque **una etiqueta no es una caja**. «Caja chica» promete un saldo —cuánto
 * queda, cuánto hay que reponer— y eso necesita fondo, retiros y reposiciones,
 * o sea un arqueo pequeño. Con dos pestañas y una columna, la pregunta «¿cuánto
 * queda?» no se puede responder.
 *
 * Decisión de Chris (22-ago): las pestañas ahora, con el nombre honesto, y el
 * saldo cuando haga falta. Un nombre que promete lo que la pantalla no hace es
 * cómo dentro de dos meses alguien pregunta y la respuesta es «eso no lo hace».
 *
 * `turno` va primero y es la vista por defecto, y no es un detalle de interfaz:
 * es la que se usa **con prisa y con gente esperando**, así que es la que no
 * debe costar un clic.
 */
export const ESCALAS = [
  { id: 'turno', label: 'Del turno' },
  { id: 'fuerte', label: 'Fuertes' },
  { id: 'todos', label: 'Todos' },
];

/** La escala de un gasto, o `null` si nadie la ha puesto. */
export function escalaDeGasto(g) {
  const v = String(g?.escala ?? '').trim();
  return v === 'turno' || v === 'fuerte' ? v : null;
}

/** ¿Está sin clasificar? Se pregunta tanto que merece nombre propio. */
export function sinClasificar(g) {
  return escalaDeGasto(g) === null;
}

/**
 * Filtra la lista por escala.
 *
 * ── LA REGLA QUE IMPORTA: LO SIN CLASIFICAR NO DESAPARECE ──────────────────
 * Un gasto sin escala sale en LAS DOS pestañas, no en ninguna. Es deliberado y
 * es la decisión de diseño de toda esta función.
 *
 * El fallo caro de una pantalla de dinero con filtros no es enseñar de más: es
 * **esconder**. Si las filas viejas —las que existían antes de que la columna
 * existiera— cayeran fuera de las dos vistas, un gasto real quedaría invisible
 * y sólo se notaría al cuadrar el mes, si alguien lo cuadra. Enseñarlo dos
 * veces se ve y se corrige en un clic; no enseñarlo no se ve nunca.
 *
 * Y no infla ninguna cifra: el total del periodo se calcula sobre todos los
 * gastos, no sobre esta lista.
 */
export function filtrarPorEscala(gastos = [], escala = 'todos') {
  const lista = Array.isArray(gastos) ? gastos : [];
  if (escala !== 'turno' && escala !== 'fuerte') return lista;
  return lista.filter((g) => {
    const e = escalaDeGasto(g);
    return e === null || e === escala;
  });
}

/** Cuántos gastos siguen sin clasificar. Lo usa el aviso de la pantalla. */
export function cuantosSinClasificar(gastos = []) {
  return (Array.isArray(gastos) ? gastos : []).filter(sinClasificar).length;
}
