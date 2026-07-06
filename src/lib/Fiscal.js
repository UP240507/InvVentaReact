// src/lib/fiscal.js
// Motor fiscal único de InvVenta. Fuente de verdad para subtotal/IVA/propina/total.
// Reemplaza la matemática dispersa (y el bug D4: IVA calculado sobre la propina).
//
// Reglas (confirmadas con el negocio):
//  - IVA dinámico por configuración (México: 16%; otros países configurables).
//  - precios_incluyen_iva: en México el precio de menú ya trae IVA → se desglosa
//    hacia atrás. Si es false, el IVA se suma encima.
//  - La PROPINA nunca forma parte de la base gravable (no se le calcula IVA).
//  - El DESCUENTO reduce la base gravable; el IVA se recalcula sobre la base neta.

export const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

/**
 * @param {Object}  p
 * @param {Array}   p.items                 [{ precio, cantidad }]
 * @param {number}  [p.ivaRate=0.16]        tasa IVA (0.16 = 16%)
 * @param {boolean} [p.preciosIncluyenIva=true]
 * @param {number}  [p.descuentoPct=0]      % de descuento sobre la base
 * @param {number}  [p.propinaPct=0]        % de propina sobre la base neta
 * @param {number|null} [p.propinaMonto=null] propina fija (override del %)
 * @returns {{ subtotal:number, descuento:number, iva:number, propina:number, total:number }}
 */
export function calcularVenta({
  items = [],
  ivaRate = 0.16,
  preciosIncluyenIva = true,
  descuentoPct = 0,
  propinaPct = 0,
  propinaMonto = null,
} = {}) {
  const rate = Math.max(0, Number(ivaRate) || 0);

  const bruto = (Array.isArray(items) ? items : []).reduce(
    (acc, it) => acc + (Number(it?.precio) || 0) * (Number(it?.cantidad) || 0),
    0,
  );

  // Base antes de descuento (desglose hacia atrás si el precio incluye IVA)
  const baseAntesDesc = preciosIncluyenIva ? bruto / (1 + rate) : bruto;

  // Descuento sobre la base
  const descPct = Math.min(100, Math.max(0, Number(descuentoPct) || 0));
  const descuento = round2(baseAntesDesc * (descPct / 100));
  const subtotal = round2(baseAntesDesc - descuento);

  // IVA sobre la base NETA (post-descuento)
  const iva = round2(subtotal * rate);

  // Propina: fija o % de la base neta. NUNCA gravada.
  const propina =
    propinaMonto != null
      ? round2(Number(propinaMonto) || 0)
      : round2(subtotal * ((Number(propinaPct) || 0) / 100));

  const total = round2(subtotal + iva + propina);

  return { subtotal, descuento, iva, propina, total };
}
