// src/lib/Arqueo.js
// Cálculo de totales de un turno para el corte de caja. Fuente única del arqueo.
// Arregla D5: bucketiza por el DESGLOSE real efectivo/tarjeta de cada venta
// (que el POS persiste), no por el string metodo_pago sumando el total completo
// (que mandaba los tickets 'mixto' enteros a efectivo, inflando la caja esperada).

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

/**
 * @param {Array}  ventas
 * @param {Object} turnoActivo   turno con { id, fecha_apertura }
 * @param {Function} [parseUTC]  parser de fecha (inyectable)
 * @returns {{efectivo:number,tarjeta:number,transferencia:number,propinas:number,
 *            totalVentas:number,ventasNetas:number,ticketsCount:number}}
 */
export function calcularTotalesTurno(
  ventas,
  turnoActivo,
  parseUTC = (d) => new Date(d),
) {
  const base = {
    efectivo: 0,
    tarjeta: 0,
    transferencia: 0,
    propinas: 0,
    totalVentas: 0,
    ventasNetas: 0,
    ticketsCount: 0,
  };
  if (!turnoActivo) return base;

  const apertura = turnoActivo.fecha_apertura
    ? parseUTC(turnoActivo.fecha_apertura)
    : null;

  const ventasTurno = (ventas || []).filter((v) => {
    // Trazabilidad exacta por turno_id si existe; fallback a rango por fecha.
    if (v?.turno_id != null && turnoActivo.id != null) {
      return String(v.turno_id) === String(turnoActivo.id);
    }
    if (!apertura) return false;
    const f = parseUTC(v?.fecha || v?.created_at);
    return f && f >= apertura;
  });

  const t = { ...base, ticketsCount: ventasTurno.length };

  for (const v of ventasTurno) {
    const total = Number(v?.total) || 0;
    const propina = Number(v?.propina) || 0;
    const efe = Number(v?.efectivo) || 0;
    const tar = Number(v?.tarjeta) || 0;
    const transfer = Number(v?.transferencia) || 0;

    t.propinas += propina;
    t.totalVentas += total;

    if (efe || tar || transfer) {
      // D5: desglose real (cubre pagos mixtos correctamente).
      t.efectivo += efe;
      t.tarjeta += tar;
      t.transferencia += transfer;
    } else {
      // Compat: ventas viejas sin desglose → inferir por metodo_pago.
      const metodo = (v?.metodo_pago || 'efectivo').toLowerCase();
      if (metodo.includes('tarjeta')) t.tarjeta += total;
      else if (metodo.includes('transfer')) t.transferencia += total;
      else t.efectivo += total;
    }
  }

  t.ventasNetas = t.totalVentas - t.propinas; // venta neta = sin propina
  for (const k of [
    'efectivo',
    'tarjeta',
    'transferencia',
    'propinas',
    'totalVentas',
    'ventasNetas',
  ]) {
    t[k] = r2(t[k]);
  }
  return t;
}
