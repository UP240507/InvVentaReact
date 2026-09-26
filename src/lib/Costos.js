// src/lib/Costos.js
//
// ── EL NÚMERO QUE NO SE OLVIDA ──────────────────────────────────────────────
// El **costo promedio ponderado** de un insumo: lo que se recalcula cada vez
// que entra mercancía.
//
// Es el número de más largo alcance del sistema. De aquí sale el costo de cada
// platillo que lleve el insumo, de ahí el margen, y de ahí los precios que
// decide el dueño. Y a diferencia de un stock —que un conteo físico corrige—
// **el promedio no se corrige solo**: un costo mal metido no desaparece con la
// siguiente compra, se diluye durante meses. En AZUL, además, no se hace
// conteo físico, así que nada lo endereza nunca.
//
// Hasta el 26-sep esta fórmula vivía suelta dentro de `RecepcionScreen`, entre
// el bucle que arma los movimientos y el `enqueueAction`, sin una sola prueba.
// Todo el trabajo de empaques de la 0.3.0 —`Empaques.js`, 27 pruebas, el
// precio derivado que a propósito NO se redondea— desembocaba aquí.
//
// ── LA FÓRMULA ──────────────────────────────────────────────────────────────
//
//     costo = (stock_anterior × costo_anterior + cantidad × costo_recibido)
//             ───────────────────────────────────────────────────────────────
//                          stock_anterior + cantidad
//
// Es una media ponderada por unidades, no por dinero: 100 kg a $10 y 1 kg a
// $1000 dan $19.80, no $505.

/** Dinero: dos decimales. Mismo criterio que `Empaques.js`. */
const aCentavos = (n) => Math.round((Number(n) || 0) * 100) / 100;

/** Stock: tres decimales, como lo escribe la pantalla de recepción. */
const aStock = (n) => Math.round((Number(n) || 0) * 1000) / 1000;

/**
 * Recalcula stock y costo promedio de UN insumo al recibir mercancía.
 *
 * @param {object} p
 * @param {number} p.stockAnterior     lo que había
 * @param {number} p.costoAnterior     a cuánto estaba valuado
 * @param {number} p.cantidadRecibida  lo que entra
 * @param {number} p.costoRecibido     a cuánto entra (por unidad de inventario)
 * @returns {{ stock: number, costo: number }}
 */
export function recepcionDeLinea({
  stockAnterior,
  costoAnterior,
  cantidadRecibida,
  costoRecibido,
} = {}) {
  const stockPrevio = Number(stockAnterior) || 0;
  const costoPrevio = Number(costoAnterior) || 0;
  const cantidad = Number(cantidadRecibida) || 0;

  // OJO — DECISIÓN HEREDADA, NO UN DESCUIDO: un `precio_unitario` de CERO no
  // se toma como precio, se toma como "no viene" y cae al costo anterior. Es
  // el `||` que estaba en la pantalla desde siempre.
  //
  // Tiene una consecuencia que conviene tener presente: una entrada REGALADA
  // —una muestra del proveedor a $0— no abarata el promedio, lo deja igual.
  // Se conserva el comportamiento porque cambiarlo mueve el costo de insumos
  // reales sin que nadie lo haya pedido; queda anotado para decidirlo aparte.
  //
  // `Number(x) || previo` es exactamente el `||` que tenía la pantalla: el
  // cero, la cadena vacía, `null` y `NaN` caen todos al costo anterior.
  const costoEntrada = Number(costoRecibido) || costoPrevio;

  const stock = aStock(stockPrevio + cantidad);

  // Sin existencias después de la entrada no hay nada que promediar, y la
  // división sería por cero. Se conserva el costo que ya tenía: es lo único
  // que no inventa un número.
  if (stock <= 0) return { stock, costo: aCentavos(costoPrevio) };

  const valorPrevio = stockPrevio * costoPrevio;
  const valorEntrada = cantidad * costoEntrada;

  return { stock, costo: aCentavos((valorPrevio + valorEntrada) / stock) };
}

/**
 * Aplica una recepción completa sobre la lista de productos.
 *
 * Devuelve productos NUEVOS —no muta— y la lista de líneas aplicadas, para que
 * quien llame arme sus movimientos con el mismo stock anterior que se usó aquí
 * y no vuelva a leerlo de otro sitio.
 *
 * Las líneas cuyo insumo ya no existe en el catálogo **se ignoran en silencio**,
 * igual que hacía la pantalla. Se devuelven en `ignoradas` para que deje de ser
 * un silencio.
 */
export function aplicarRecepcion(productos = [], items = []) {
  const copia = [...(productos || [])];
  const aplicadas = [];
  const ignoradas = [];

  for (const item of items || []) {
    const i = copia.findIndex(
      (p) => String(p.id) === String(item?.id_producto),
    );
    if (i === -1) {
      ignoradas.push(item);
      continue;
    }

    const prod = copia[i];
    const stockAnterior = Number(prod.stock) || 0;
    const { stock, costo } = recepcionDeLinea({
      stockAnterior,
      costoAnterior: prod.precio,
      cantidadRecibida: item?.cantidad,
      costoRecibido: item?.precio_unitario,
    });

    copia[i] = { ...prod, stock, precio: costo };
    aplicadas.push({
      producto: copia[i],
      stockAnterior,
      stockNuevo: stock,
      costoRecibido: Number(item?.precio_unitario) || Number(prod.precio) || 0,
      cantidad: Number(item?.cantidad) || 0,
    });
  }

  return { productos: copia, aplicadas, ignoradas };
}
