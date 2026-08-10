// ─── MÉTRICAS DEL DASHBOARD (Proyecto D · tanda 4) ───────────────────────────
// Motor PURO: rangos de periodo, agregados de venta y P&L. Sin React, sin
// store, sin red — se testea en frío y el Dashboard solo lo pinta.
//
// Contexto: el Dashboard viejo leía `useAppStore().ordenes`, una colección que
// NO EXISTE (las ventas viven en `ventas`, las comandas en `comandas_activas`).
// Todas las métricas salían en cero. Este módulo existe para que ese tipo de
// error no vuelva a esconderse dentro de un JSX de 280 líneas: aquí la lógica
// es aislable y verificable.

// El importe de una línea sale del MOTOR FISCAL, no se recalcula aquí: si el
// P&L usara su propia fórmula, un cambio en las reglas de descuento dejaría el
// margen y el ticket contando cosas distintas.
import { importeDeLinea } from './Fiscal';
import { resumenGastos } from './Gastos';

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const round2 = (n) => Math.round((num(n) + Number.EPSILON) * 100) / 100;

export const PERIODOS = [
  { id: 'hoy', label: 'Hoy' },
  { id: 'semana', label: 'Semana' },
  { id: 'mes', label: 'Mes' },
];

/**
 * Rango del periodo y su comparable anterior.
 *
 * DECISIÓN IMPORTANTE: el periodo anterior se corta a la MISMA ALTURA, no
 * completo. A las 13:00 se comparan las ventas de hoy contra las de ayer HASTA
 * las 13:00, no contra el día entero de ayer — si no, todas las mañanas
 * parecería que el negocio se hunde. Lo mismo con semana y mes.
 */
export function rangoDePeriodo(periodo = 'hoy', ahora = new Date()) {
  const fin = new Date(ahora);
  const inicio = new Date(ahora);
  let inicioAnterior;

  if (periodo === 'semana') {
    // Semana que arranca en LUNES (convención de MX; getDay() = 0 el domingo).
    const dia = (inicio.getDay() + 6) % 7;
    inicio.setDate(inicio.getDate() - dia);
    inicio.setHours(0, 0, 0, 0);
    inicioAnterior = new Date(inicio);
    inicioAnterior.setDate(inicioAnterior.getDate() - 7);
  } else if (periodo === 'mes') {
    inicio.setDate(1);
    inicio.setHours(0, 0, 0, 0);
    inicioAnterior = new Date(inicio);
    inicioAnterior.setMonth(inicioAnterior.getMonth() - 1);
  } else {
    inicio.setHours(0, 0, 0, 0);
    inicioAnterior = new Date(inicio);
    inicioAnterior.setDate(inicioAnterior.getDate() - 1);
  }

  // El corte anterior conserva el MISMO desfase desde el inicio del periodo.
  const desfase = fin.getTime() - inicio.getTime();
  const finAnterior = new Date(inicioAnterior.getTime() + desfase);

  return {
    desde: inicio,
    hasta: fin,
    desdeAnterior: inicioAnterior,
    hastaAnterior: finAnterior,
  };
}

/** Fecha de una venta, tolerando los distintos nombres que ha tenido el campo. */
export function fechaDeVenta(venta) {
  const raw = venta?.fecha ?? venta?.fecha_pago ?? venta?.created_at;
  const d = raw ? new Date(raw) : null;
  return d && !Number.isNaN(d.getTime()) ? d : null;
}

/** Ventas dentro de [desde, hasta], excluyendo canceladas. */
export function ventasEnRango(ventas = [], desde, hasta) {
  const ini = desde instanceof Date ? desde.getTime() : 0;
  const fin = hasta instanceof Date ? hasta.getTime() : Infinity;
  return (ventas || []).filter((v) => {
    if (!v) return false;
    if (v.cancelada === true || v.estado === 'cancelada') return false;
    const d = fechaDeVenta(v);
    if (!d) return false;
    const t = d.getTime();
    return t >= ini && t <= fin;
  });
}

/** Agregados de un conjunto de ventas. */
export function agregarVentas(ventas = []) {
  const base = {
    ingresos: 0,
    subtotal: 0,
    iva: 0,
    propinas: 0,
    descuentos: 0,
    tickets: 0,
    ticketPromedio: 0,
    porMetodo: { efectivo: 0, tarjeta: 0, transferencia: 0 },
  };

  for (const v of ventas) {
    base.ingresos += num(v.total);
    base.subtotal += num(v.subtotal);
    base.iva += num(v.iva);
    // La propina NO es ingreso del negocio: es del personal. Se agrega aparte
    // para que nadie la sume al margen por accidente.
    base.propinas += num(v.propina);
    base.descuentos += num(v.descuento);
    base.tickets += 1;
    base.porMetodo.efectivo += num(v.efectivo);
    base.porMetodo.tarjeta += num(v.tarjeta);
    base.porMetodo.transferencia += num(v.transferencia);
  }

  base.ingresos = round2(base.ingresos);
  base.subtotal = round2(base.subtotal);
  base.iva = round2(base.iva);
  base.propinas = round2(base.propinas);
  base.descuentos = round2(base.descuentos);
  base.ticketPromedio = base.tickets ? round2(base.ingresos / base.tickets) : 0;
  base.porMetodo.efectivo = round2(base.porMetodo.efectivo);
  base.porMetodo.tarjeta = round2(base.porMetodo.tarjeta);
  base.porMetodo.transferencia = round2(base.porMetodo.transferencia);
  return base;
}

/**
 * Costo de una línea vendida.
 * Prioridad: el costo CONGELADO en el ticket > el costo actual de la receta.
 * El del ticket manda porque es el que regía cuando se vendió; usar el de hoy
 * reescribiría la historia cada vez que sube un insumo.
 */
export function costoDeLinea(item, recetasPorId) {
  if (!item) return null;
  const propio = num(item.costo);
  if (propio > 0) return propio;
  const receta = recetasPorId?.get?.(String(item.receta_id ?? item.id));
  const deReceta = num(receta?.costo);
  return deReceta > 0 ? deReceta : null;
}

/**
 * P&L del periodo: costo REAL por receta, con respaldo de food cost % para lo
 * que aún no está costeado.
 *
 * Devuelve `pctEstimado` a propósito. Una cifra de margen que no dice cuánto de
 * ella es una suposición invita a tomar decisiones de precio sobre humo; la
 * tarjeta del Dashboard lo muestra cuando pasa de cero.
 */
export function calcularPyL(
  ventas = [],
  {
    recetas = [],
    foodCostPct = 0.3,
    gastos = [],
    nominas = [],
    categoriasGasto = [],
    desde,
    hasta,
  } = {},
) {
  const porId = new Map(
    (recetas || []).filter(Boolean).map((r) => [String(r.id), r]),
  );

  let ingresos = 0;
  let costoReal = 0;
  let costoEstimado = 0;
  let ventaCosteada = 0; // venta cubierta por costo real
  let ventaEstimada = 0; // venta que cayó al porcentaje
  let lineas = 0;
  let lineasCosteadas = 0;

  for (const v of ventas) {
    ingresos += num(v.total);
    for (const item of v.items || []) {
      const cantidad = num(item.cantidad) || 1;
      // El importe REAL de la línea, ya con su descuento de producto. Usar
      // precio × cantidad inflaría el margen justo en los platillos que se
      // regalaron: el costo se paga igual, el ingreso no entra.
      const importe = importeDeLinea(item).neto;
      lineas += 1;

      const costoUnit = costoDeLinea(item, porId);
      if (costoUnit != null) {
        costoReal += costoUnit * cantidad;
        ventaCosteada += importe;
        lineasCosteadas += 1;
      } else {
        costoEstimado += importe * foodCostPct;
        ventaEstimada += importe;
      }
    }
  }

  const costo = round2(costoReal + costoEstimado);
  const margen = round2(round2(ingresos) - costo);
  const baseVenta = ventaCosteada + ventaEstimada;

  // ── Utilidad NETA (fase 2.5) ───────────────────────────────────────────────
  // margen bruto − gastos del periodo. `hayGastos` decide si la cifra se puede
  // mostrar: con el módulo recién estrenado y cero gastos capturados, una
  // "utilidad" igual al margen bruto sería exactamente la mentira que esta
  // fase venía a arreglar. El Dashboard consulta esta bandera antes de rotular.
  const g = resumenGastos({
    gastos,
    nominas,
    categorias: categoriasGasto,
    desde,
    hasta,
  });
  const utilidadNeta = round2(margen - g.total);

  return {
    gastos: g.total,
    gastosFijos: g.fijos,
    gastosVariables: g.variables,
    gastosPendientes: g.pendientes,
    gastosPorCategoria: g.porCategoria,
    hayGastos: g.total > 0,
    utilidadNeta,
    utilidadNetaPct: ingresos > 0 ? round2((utilidadNeta / ingresos) * 100) : 0,
    ingresos: round2(ingresos),
    costo,
    costoReal: round2(costoReal),
    costoEstimado: round2(costoEstimado),
    margen,
    margenPct: ingresos > 0 ? round2((margen / ingresos) * 100) : 0,
    foodCostPct: ingresos > 0 ? round2((costo / ingresos) * 100) : 0,
    lineas,
    lineasCosteadas,
    // Qué parte del periodo se apoya en el porcentaje, medida en DINERO (no en
    // número de líneas): un platillo caro sin costear pesa más que tres baratos.
    pctEstimado: baseVenta > 0 ? round2((ventaEstimada / baseVenta) * 100) : 0,
  };
}

/** Variación contra el periodo anterior. */
export function variacion(actual, anterior) {
  const a = num(actual);
  const b = num(anterior);
  const delta = round2(a - b);
  if (b === 0) {
    // Sin base de comparación no se inventa un “+100%”: se dice que no hay.
    return { delta, pct: null, direccion: delta > 0 ? 'sube' : 'igual' };
  }
  const pct = round2(((a - b) / Math.abs(b)) * 100);
  return {
    delta,
    pct,
    direccion: pct > 0.5 ? 'sube' : pct < -0.5 ? 'baja' : 'igual',
  };
}

/**
 * Serie temporal para el gráfico compacto.
 * Granularidad: hora para "hoy", día para semana y mes.
 */
export function serieDeVentas(
  ventas = [],
  periodo = 'hoy',
  ahora = new Date(),
) {
  const { desde, hasta } = rangoDePeriodo(periodo, ahora);
  const porHora = periodo === 'hoy';

  const cubos = [];
  const cursor = new Date(desde);
  while (cursor <= hasta) {
    cubos.push({
      etiqueta: porHora
        ? String(cursor.getHours()).padStart(2, '0')
        : String(cursor.getDate()),
      inicio: new Date(cursor),
      total: 0,
      tickets: 0,
    });
    if (porHora) cursor.setHours(cursor.getHours() + 1);
    else cursor.setDate(cursor.getDate() + 1);
  }
  if (cubos.length === 0) return [];

  for (const v of ventasEnRango(ventas, desde, hasta)) {
    const d = fechaDeVenta(v);
    if (!d) continue;
    const idx = porHora
      ? cubos.findIndex((c) => c.inicio.getHours() === d.getHours())
      : cubos.findIndex((c) => c.inicio.getDate() === d.getDate());
    if (idx >= 0) {
      cubos[idx].total = round2(cubos[idx].total + num(v.total));
      cubos[idx].tickets += 1;
    }
  }
  return cubos;
}

/** Los platillos que más facturan en el periodo. */
export function topPlatillos(ventas = [], limite = 5) {
  const acc = new Map();
  for (const v of ventas) {
    for (const item of v.items || []) {
      const clave = item?.nombre || 'Sin nombre';
      const cantidad = num(item.cantidad) || 1;
      const prev = acc.get(clave) || { nombre: clave, cantidad: 0, importe: 0 };
      prev.cantidad += cantidad;
      prev.importe += num(item.precio) * cantidad;
      acc.set(clave, prev);
    }
  }
  return [...acc.values()]
    .map((x) => ({ ...x, importe: round2(x.importe) }))
    .sort((a, b) => b.importe - a.importe)
    .slice(0, limite);
}

/** Resumen completo del periodo, listo para pintar. */
export function resumenDelPeriodo(
  ventas = [],
  periodo = 'hoy',
  {
    recetas = [],
    foodCostPct = 0.3,
    ahora = new Date(),
    // Fase 2.5: sin gastos el motor sigue dando SOLO margen bruto, y el
    // Dashboard debe seguir rotulándolo así. La utilidad neta aparece cuando
    // hay con qué calcularla, no antes.
    gastos = [],
    nominas = [],
    categoriasGasto = [],
  } = {},
) {
  const rango = rangoDePeriodo(periodo, ahora);
  const delPeriodo = ventasEnRango(ventas, rango.desde, rango.hasta);
  const delAnterior = ventasEnRango(
    ventas,
    rango.desdeAnterior,
    rango.hastaAnterior,
  );

  const actual = agregarVentas(delPeriodo);
  const anterior = agregarVentas(delAnterior);

  return {
    rango,
    actual,
    anterior,
    comparativa: {
      ingresos: variacion(actual.ingresos, anterior.ingresos),
      tickets: variacion(actual.tickets, anterior.tickets),
      ticketPromedio: variacion(actual.ticketPromedio, anterior.ticketPromedio),
    },
    pyl: calcularPyL(delPeriodo, {
      recetas,
      foodCostPct,
      gastos,
      nominas,
      categoriasGasto,
      desde: rango.desde,
      hasta: rango.hasta,
    }),
    serie: serieDeVentas(ventas, periodo, ahora),
    top: topPlatillos(delPeriodo),
    ventas: delPeriodo,
  };
}
