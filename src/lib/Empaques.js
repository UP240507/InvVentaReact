// src/lib/Empaques.js — «1 arpilla = 30 kg», y la aritmética que se deriva
//
// ── POR QUÉ ESTO ES UNA LIBRERÍA Y NO UNA DIVISIÓN EN LA PANTALLA ────────────
//
// Hasta el 02-sep, recibir una arpilla de naranja de 30 kg obligaba a teclear
// `cantidad = 30` y `precio_unitario = precio_de_la_arpilla / 30`. Esa división
// la hacía una persona, con la calculadora del teléfono, delante del repartidor.
//
// Y el resultado no se queda en la recepción: entra al **costo promedio
// ponderado** del insumo, de ahí al costo de cada platillo que lo lleve, y de
// ahí al margen. Nada valida la unidad ni el orden de magnitud, el promedio
// ponderado no olvida, y en AZUL no se hace conteo físico — así que **no hay
// nada que corrija nunca ese número contra la realidad.**
//
// ── LA REGLA DE ORO DE ESTE FICHERO ──────────────────────────────────────────
//
// **Lo que se teclea es lo que se pagó, y lo derivado tiene que sumar eso
// exacto.** Si el papel dice «2 arpillas, $1,800», la línea tiene que valer
// $1,800 y no $1,799.99. Es la misma lección que `parteDeCuenta`: se reparte
// desde el total, no se multiplica un unitario redondeado y se espera que
// cuadre. Por eso `precio_unitario` sale de dividir el total ya redondeado
// entre la cantidad ya redondeada, y NO se redondea: redondearlo a centavos es
// justo lo que rompe la suma.
//
// El precio no vive aquí. Aquí sólo vive **cuántas unidades de consumo trae un
// empaque**, que es un dato físico y estable. El precio cambia cada semana y
// vive en la línea de la orden.

/** Redondeo a centavos. Dinero. */
const aCentavos = (n) => Math.round((Number(n) || 0) * 100) / 100;

/**
 * Redondeo de cantidades de inventario a cuatro decimales.
 *
 * Cuatro y no dos: 0.0001 kg es un décimo de gramo, de sobra para cualquier
 * insumo, y deja margen para empaques con factor decimal. Y redondear hace
 * falta: `3 * 0.1` en coma flotante es `0.30000000000000004`, y ese sobrante
 * se arrastraría al stock.
 */
const aCantidad = (n) => Math.round((Number(n) || 0) * 10000) / 10000;

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/**
 * Los empaques que este proveedor tiene para este insumo.
 *
 * Devuelve sólo los vivos y ordenados de menor a mayor factor, que es como los
 * nombra quien compra: primero la pieza suelta, luego la caja.
 *
 * @param {Array|null} empaques  filas de `proveedor_producto`
 * @param {{proveedorId: any, productoId: any}} pareja
 */
export function empaquesDe(empaques, { proveedorId, productoId } = {}) {
  if (proveedorId === null || proveedorId === undefined) return [];
  if (productoId === null || productoId === undefined) return [];

  return (Array.isArray(empaques) ? empaques : [])
    .filter(
      (e) =>
        e &&
        e.activo !== false &&
        String(e.proveedor_id) === String(proveedorId) &&
        String(e.producto_id) === String(productoId) &&
        num(e.factor) > 0,
    )
    .slice()
    .sort((a, b) => num(a.factor) - num(b.factor));
}

/**
 * Cómo se lee un empaque en un desplegable: «arpilla (30 kg)».
 *
 * La unidad va SIEMPRE, aunque sobre: el factor sin unidad es el error que
 * este módulo viene a evitar —30 de qué—.
 */
export function describirEmpaque(empaque, unidad = '') {
  if (!empaque) return '';
  const f = num(empaque.factor);
  const u = unidad ? ` ${unidad}` : '';
  return `${empaque.nombre} (${f}${u})`;
}

/**
 * De «2 arpillas a $900» a lo que la orden y la recepción necesitan.
 *
 * `precio_unitario` sale del total y no al revés, y **no se redondea**: es el
 * número que entra al costo promedio ponderado, y redondearlo a centavos haría
 * que `cantidad × precio_unitario` dejara de dar el total pagado. Para
 * ENSEÑARLO, redondéalo en la pantalla; para guardarlo, tal cual.
 *
 * @param {object} p
 * @param {number} p.factor            unidades de consumo por empaque (> 0)
 * @param {number} p.empaques          cuántos empaques se compran
 * @param {number} p.precioPorEmpaque  lo que cuesta UN empaque
 * @returns {{cantidad:number, precio_unitario:number, total:number}}
 */
export function derivarLinea({ factor, empaques, precioPorEmpaque } = {}) {
  const f = num(factor);
  const n = num(empaques);
  const p = num(precioPorEmpaque);

  // Un factor no positivo no se "arregla" con un 1 por defecto: eso inventaría
  // una equivalencia. Se devuelve una línea vacía y que la pantalla lo diga.
  if (f <= 0 || n <= 0 || p < 0) {
    return { cantidad: 0, precio_unitario: 0, total: 0 };
  }

  const cantidad = aCantidad(n * f);
  const total = aCentavos(n * p);
  const precio_unitario = cantidad > 0 ? total / cantidad : 0;

  return { cantidad, precio_unitario, total };
}

/**
 * Una línea tecleada en la unidad de consumo de siempre, sin empaque.
 *
 * Existe para que la pantalla tenga UNA sola calculadora: un insumo sin
 * empaques registrados no es un caso especial que se calcule aparte, es este.
 */
export function lineaSinEmpaque({ cantidad, precioUnitario } = {}) {
  const c = aCantidad(num(cantidad));
  const pu = num(precioUnitario);
  if (c <= 0 || pu < 0) return { cantidad: 0, precio_unitario: 0, total: 0 };
  return { cantidad: c, precio_unitario: pu, total: aCentavos(c * pu) };
}
