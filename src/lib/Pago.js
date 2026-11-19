// src/lib/Pago.js
// ─────────────────────────────────────────────────────────────────────────────
// DE LOS PAGOS DEL COBRO A LO QUE SE GUARDA EN LA VENTA (0.3.3, 19-nov)
//
// El cuadro de cobro junta pagos sueltos —«100 en efectivo», «50 con tarjeta»—
// y la venta guarda cuánto entró por cada método. Esa traducción vivía a mano
// dentro de `PosScreen`, y tenía dos fallos que no daban error:
//
//  1. **Guardaba lo que el cliente entregó, no lo que se queda en la caja.**
//     Una cuenta de $75 pagada con un billete de $100 quedaba con
//     `efectivo = 100`, y el corte, que suma ese campo, esperaba en el cajón
//     los $25 que se le devolvieron al cliente. En un día normal el arqueo
//     salía faltante por la suma de todos los cambios (H15, medido en campo el
//     17-nov: $285 en cuatro ventas).
//
//  2. **Decidía «mixto» por el número de pagos, no por los métodos.** Dos
//     pagos en efectivo eran «mixto», y Reportes cuenta lo mixto aparte.
//
// Aquí sólo hay aritmética: sin pantalla, sin almacén y sin red, para que se
// pruebe en node.
// ─────────────────────────────────────────────────────────────────────────────

const METODOS = ['efectivo', 'tarjeta', 'transferencia'];

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const r2 = (n) => Math.round(num(n) * 100) / 100;
const metodoDe = (p) => String(p?.metodo || '').toLowerCase();

/** Lo capturado por cada método, sin restar nada. */
function capturadoPorMetodo(pagos = []) {
  const t = { efectivo: 0, tarjeta: 0, transferencia: 0 };
  for (const p of Array.isArray(pagos) ? pagos : []) {
    const m = metodoDe(p);
    if (m in t) t[m] += num(p?.monto);
  }
  for (const k of METODOS) t[k] = r2(t[k]);
  return t;
}

/**
 * Cómo se pagó, como lo guarda `ventas.metodo_pago`.
 *
 * - Una cuenta de $0 es `cortesia`: no entró dinero, así que no abre el cajón
 *   (sólo lo abren `efectivo` y `mixto`) y el ticket no dice «Pago: EFECTIVO».
 * - Se cuentan los MÉTODOS distintos, no los pagos: dos billetes son efectivo.
 * - Sin pagos y con algo que cobrar se queda en `efectivo`, que es lo que hacía
 *   el POS antes y lo que espera el resto del sistema para una venta vieja.
 *
 * @param {Array<{metodo:string, monto:number}>} pagos
 * @param {number} total  lo que se cobra, propina incluida
 */
export function metodoDePago(pagos = [], total = 0) {
  if (r2(total) <= 0) return 'cortesia';
  const usados = METODOS.filter((m) =>
    (Array.isArray(pagos) ? pagos : []).some(
      (p) => metodoDe(p) === m && num(p?.monto) > 0,
    ),
  );
  if (usados.length === 0) return 'efectivo';
  if (usados.length === 1) return usados[0];
  return 'mixto';
}

/**
 * Lo que la venta guarda por método, y lo recibido para el ticket.
 *
 * `efectivo` es lo que se QUEDA en la caja: lo entregado menos el cambio. Es lo
 * que el corte suma para decir cuánto debe haber en el cajón.
 *
 * `efectivo_recibido` es lo que entregó el cliente. **No se guarda en la base**
 * (decidido el 17-nov: no hace falta); viaja sólo al ticket, igual que el
 * cambio, para que el papel siga diciendo «Recibido $100 · Cambio $25».
 *
 * El cambio se acota a lo recibido en efectivo: la tarjeta y la transferencia
 * nunca dan cambio (su excedente, si lo hay, el cobro ya lo convirtió en
 * propina), así que el efectivo que se queda nunca sale negativo.
 *
 * @param {Array<{metodo:string, monto:number}>} pagos
 * @param {number} cambio  el que calculó el cuadro de cobro
 */
export function montosDeVenta(pagos = [], cambio = 0) {
  const capturado = capturadoPorMetodo(pagos);
  const cambioReal = r2(Math.min(Math.max(0, num(cambio)), capturado.efectivo));
  return {
    efectivo: r2(capturado.efectivo - cambioReal),
    tarjeta: capturado.tarjeta,
    transferencia: capturado.transferencia,
    efectivo_recibido: capturado.efectivo,
    cambio: cambioReal,
  };
}
