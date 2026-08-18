// src/lib/Fiscal.js
// Motor fiscal único de InvVenta. Fuente de verdad para subtotal/IVA/propina/total.
// Reemplaza la matemática dispersa (y el bug D4: IVA calculado sobre la propina).
//
// Reglas (confirmadas con el negocio):
//  - IVA dinámico por configuración (México: 16%; otros países configurables).
//  - precios_incluyen_iva: en México el precio de menú ya trae IVA → se desglosa
//    hacia atrás. Si es false, el IVA se suma encima.
//  - La PROPINA nunca forma parte de la base gravable (no se le calcula IVA).
//  - El DESCUENTO reduce la base gravable; el IVA se recalcula sobre la base neta.
//
// ── DESCUENTO POR LÍNEA (25-jul) ─────────────────────────────────────────────
// Además del descuento de TICKET (%/$ sobre toda la cuenta) existe el descuento
// por PRODUCTO: `item.descuento = { tipo, valor }` con tipo 'pct' | 'monto' |
// 'cortesia'.
//
// CASCADA — el orden importa y no es arbitrario:
//   1. Cada línea se descuenta primero. Su resultado ES el importe real de esa
//      línea, igual que si el platillo se hubiera vendido a ese precio.
//   2. El descuento de ticket se aplica DESPUÉS, sobre lo que quedó.
// Al revés (ticket primero) el % de ticket se calcularía sobre dinero que el
// cliente nunca iba a pagar, y el total no cuadraría con la suma de las líneas.
//
// Un descuento de línea NUNCA puede dejar la línea en negativo: se acota al
// importe de la propia línea. Una caja que devuelve dinero por descontar de más
// es un agujero, no una promoción.

export const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/**
 * Importe de una línea, ya con su descuento de producto aplicado.
 * Exportada porque la usan el carrito, el ticket y el P&L: si cada uno lo
 * recalculara a su manera, acabarían discrepando por centavos.
 *
 * @param {{precio:number, cantidad:number, descuento?:{tipo:string, valor:number}}} item
 * @returns {{ bruto:number, descuento:number, neto:number }}
 */
export function importeDeLinea(item) {
  const bruto = round2(num(item?.precio) * num(item?.cantidad));
  const d = item?.descuento;
  if (!d || !d.tipo || bruto <= 0) {
    return { bruto, descuento: 0, neto: bruto };
  }

  let descuento = 0;
  if (d.tipo === 'cortesia') {
    descuento = bruto; // el platillo va sin costo
  } else if (d.tipo === 'pct') {
    const pct = Math.min(100, Math.max(0, num(d.valor)));
    descuento = round2(bruto * (pct / 100));
  } else if (d.tipo === 'monto') {
    // Acotado al importe: descontar $200 de un platillo de $150 deja la línea
    // en 0, no en −50.
    descuento = round2(Math.min(Math.max(0, num(d.valor)), bruto));
  }

  return { bruto, descuento, neto: round2(bruto - descuento) };
}

/**
 * @param {Object}  p
 * @param {Array}   p.items                 [{ precio, cantidad, descuento? }]
 * @param {number}  [p.ivaRate=0.16]        tasa IVA (0.16 = 16%)
 * @param {boolean} [p.preciosIncluyenIva=true]
 * @param {number}  [p.descuentoPct=0]      % de descuento de TICKET sobre la base
 * @param {number}  [p.propinaPct=0]        % de propina sobre la base neta
 * @param {number|null} [p.propinaMonto=null] propina fija (override del %)
 * @returns {{ subtotal:number, descuento:number, descuentoLineas:number,
 *            descuentoTicket:number, iva:number, propina:number, total:number }}
 */
export function calcularVenta({
  items = [],
  ivaRate = 0.16,
  preciosIncluyenIva = true,
  descuentoPct = 0,
  propinaPct = 0,
  propinaMonto = null,
} = {}) {
  const rate = Math.max(0, num(ivaRate));
  const lista = Array.isArray(items) ? items : [];

  // 1) Descuento POR LÍNEA (en dinero de venta, con IVA dentro si aplica)
  let brutoLineas = 0;
  let descLineasBruto = 0;
  for (const it of lista) {
    const { bruto, descuento } = importeDeLinea(it);
    brutoLineas += bruto;
    descLineasBruto += descuento;
  }
  const brutoNeto = round2(brutoLineas - descLineasBruto);

  // Base gravable (desglose hacia atrás si el precio incluye IVA). El descuento
  // de línea se expresa en la misma moneda que el precio, así que se convierte
  // a base con el mismo criterio.
  const aBase = (v) => (preciosIncluyenIva ? v / (1 + rate) : v);
  const baseAntesDesc = aBase(brutoNeto);
  const descuentoLineas = round2(aBase(descLineasBruto));

  // 2) Descuento de TICKET sobre lo que quedó
  const descPct = Math.min(100, Math.max(0, num(descuentoPct)));
  const descuentoTicket = round2(baseAntesDesc * (descPct / 100));

  // La base neta SIN redondear todavía. El redondeo se hace una sola vez, al
  // final, y sobre cada cifra que se va a enseñar — no en cascada.
  const baseNeta = baseAntesDesc - descuentoTicket;
  const subtotal = round2(baseNeta);

  // ── DE DÓNDE SALE EL IVA, Y POR QUÉ NO DE `subtotal * rate` ───────────────
  // Aquí estaba `round2(subtotal * rate)`, y con eso dos jugos de $40 se
  // cobraban a **$80.01**: 80/1.16 = 68.9655 → subtotal 68.97, y el IVA salía
  // del subtotal YA REDONDEADO —68.97 × 0.16 = 11.0352 → 11.04—, así que el
  // medio centavo del primer redondeo se propagaba hacia arriba. Encontrado en
  // AZUL el 15-ago, en un papel: apareció en tres tickets del mismo día.
  //
  // Cuando el precio de menú YA INCLUYE IVA, el total no se deriva: **el precio
  // es el total**, y el subtotal y el IVA son un desglose suyo que tiene que
  // sumar exactamente eso. Así que se calcula lo cobrable y el IVA es el resto.
  //
  // Con `precios_incluyen_iva` en false el caso es el contrario —el IVA se suma
  // encima de un precio que no lo trae— y ahí `subtotal * rate` sí es la cuenta
  // correcta.
  //
  // Efecto secundario que importa: `verificar_total_venta` en Postgres calcula
  // `round(base * (1 + rate), 2)` sin redondear en medio, o sea que **antes el
  // front y el trigger discrepaban por construcción** y sólo la tolerancia de
  // dos centavos impedía que cada venta saliera marcada como divergente. Ahora
  // coinciden exactamente.
  let cobrable; // lo que paga el cliente, sin propina
  let iva;
  if (preciosIncluyenIva) {
    cobrable = round2(baseNeta * (1 + rate));
    iva = round2(cobrable - subtotal);
  } else {
    iva = round2(subtotal * rate);
    cobrable = round2(subtotal + iva);
  }

  // Propina: fija o % de la base neta. NUNCA gravada.
  const propina =
    propinaMonto != null
      ? round2(num(propinaMonto))
      : round2(subtotal * (num(propinaPct) / 100));

  const total = round2(cobrable + propina);

  return {
    subtotal,
    // `descuento` se mantiene con el significado histórico (descuento de
    // ticket) para no romper a quien ya lo lee; el desglose nuevo va aparte.
    descuento: descuentoTicket,
    descuentoTicket,
    descuentoLineas,
    iva,
    propina,
    total,
  };
}
