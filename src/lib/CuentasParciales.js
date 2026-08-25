// ─── CUENTAS PARCIALES: TRES DE OCHO SE VAN ANTES Y PAGAN LO SUYO ────────────
// Cierra el §F de `docs/DISENO_FLUJO_CUENTA.md`. Ese documento decía que era
// «mover UI existente». No lo era, y la pregunta que faltaba apareció al
// escribirlo: si el papel se imprime ANTES de cobrar, ¿qué garantiza que lo que
// se cobra es lo que dice el papel?
//
// ── LA DECISIÓN DE FONDO: DÓNDE VIVE LA CUENTA ──────────────────────────────
// El folio se estampa en la LÍNEA del carrito, no en una lista aparte.
//
// Una lista (`orden_actual.cuentas`) sería una segunda fuente de verdad sobre
// las mismas unidades: el carrito diría tres cervezas y la lista diría que dos
// ya se facturaron. En cuanto una se editara sin la otra —y se editan desde
// sitios distintos— el papel y el cobro dejarían de coincidir **sin que nada
// diera error**. Con el folio en la línea, «qué se imprimió en la cuenta X» y
// «qué se va a cobrar» tienen una sola respuesta posible; la lista que ve el
// mesero se deriva de aquí.
//
// ── LAS TRAMPAS QUE ESTE MÓDULO CIERRA ──────────────────────────────────────
//   * Se eligen UNIDADES, no líneas. En una mesa nadie pide en líneas separadas
//     por grupo: hay «4 cervezas» y se van dos personas con una cada una.
//   * La línea facturada CAMBIA DE ID (`id#folio`). El carrito funde por id al
//     agregar; sin esto, pedir otra cerveza engordaría la línea ya facturada y
//     el papel diría 2 mientras se cobran 3.
//   * `cantidad_enviada` se reparte con dos topes. Es la lección de
//     `repartirPorNota`: una línea con más enviadas que unidades no se puede
//     quitar del carrito nunca más, y no da error.
//   * Las cifras de la parte salen de `calcularVenta`, jamás de un prorrateo
//     del total. Un porcentaje del total redondea distinto que la suma de sus
//     líneas, y el papel acabaría diciendo un peso más o menos que el cobro.
//
// Este módulo es puro: sin React, sin store, sin red.

/** Marca que lleva una línea ya facturada. */
export const CAMPO_FOLIO = 'cuenta_folio';

const entero = (v) => {
  const n = Math.trunc(Number(v));
  return Number.isFinite(n) && n > 0 ? n : 0;
};

/** ¿Esta línea ya salió en una cuenta impresa? */
export function estaFacturada(linea) {
  return Boolean(linea?.[CAMPO_FOLIO]);
}

/** Las líneas que todavía no se han facturado. Son las elegibles. */
export function pendientes(carrito = []) {
  return (Array.isArray(carrito) ? carrito : []).filter(
    (l) => !estaFacturada(l),
  );
}

/** Las líneas de una cuenta ya impresa. Es lo que se cobra al pagarla. */
export function lineasDeCuenta(carrito = [], folio) {
  if (!folio) return [];
  return (Array.isArray(carrito) ? carrito : []).filter(
    (l) => l?.[CAMPO_FOLIO] === folio,
  );
}

/**
 * Los folios que hay ahora mismo en la mesa, en el orden en que aparecen.
 *
 * Se derivan del carrito y no se guardan aparte, que es la regla de todo el
 * módulo: una sola fuente de verdad.
 */
export function foliosDelCarrito(carrito = []) {
  const vistos = [];
  for (const l of Array.isArray(carrito) ? carrito : []) {
    const f = l?.[CAMPO_FOLIO];
    if (f && !vistos.includes(f)) vistos.push(f);
  }
  return vistos;
}

/** ¿Queda algo por facturar en esta mesa? */
export function quedaPorFacturar(carrito = []) {
  return pendientes(carrito).some((l) => entero(l.cantidad) > 0);
}

/**
 * Cuántas unidades se pueden elegir de una línea.
 *
 * Una línea ya facturada no ofrece ninguna: ese papel ya está impreso y el
 * cliente lo tiene en la mano.
 */
export function unidadesElegibles(linea) {
  return estaFacturada(linea) ? 0 : entero(linea?.cantidad);
}

/**
 * Normaliza la selección del mesero contra lo que hay de verdad en el carrito.
 *
 * Acota, ignora basura y descarta lo que ya está facturado. Nada de esto
 * debería llegar desde una pantalla bien hecha; existe porque una selección
 * inflada no daría error, daría un papel con más cervezas de las que hay.
 */
export function normalizarSeleccion(carrito = [], seleccion = {}) {
  const limpia = {};
  for (const linea of Array.isArray(carrito) ? carrito : []) {
    const tope = unidadesElegibles(linea);
    if (!tope) continue;
    const pedidas = entero(seleccion?.[linea.id]);
    if (!pedidas) continue;
    limpia[linea.id] = Math.min(pedidas, tope);
  }
  return limpia;
}

/** ¿Hay algo seleccionado de verdad? */
export function haySeleccion(carrito = [], seleccion = {}) {
  return Object.keys(normalizarSeleccion(carrito, seleccion)).length > 0;
}

/**
 * Reparte `cantidad_enviada` entre la parte que se factura y la que se queda.
 *
 * ── LOS DOS TOPES, Y POR QUÉ IMPORTAN MÁS QUE EL REPARTO ────────────────────
 * 1. Ninguna de las dos líneas puede acabar con más enviadas que unidades. Una
 *    línea así es imposible de quitar del carrito, **para siempre y sin dar
 *    error** — el POS se niega a borrar lo que está en cocina.
 * 2. El total de enviadas se conserva. La comida ya salió: facturarla no la
 *    devuelve a la barra.
 *
 * Las enviadas se quedan preferentemente en la línea que SIGUE EN LA MESA, no
 * en la facturada. Si se fueran con la facturada, la parte restante quedaría
 * con cero enviadas y el mesero podría quitar del carrito un platillo que ya
 * está en la plancha.
 */
export function repartirEnviadas(enviadasTotales, cantidadRestante) {
  const enviadas = entero(enviadasTotales);
  const restante = entero(cantidadRestante);
  const seQuedan = Math.min(enviadas, restante);
  return { restante: seQuedan, facturada: enviadas - seQuedan };
}

/**
 * El id de una línea facturada.
 *
 * Lleva el folio dentro a propósito: dos cuentas distintas de la misma mesa
 * tienen que dar ids distintos, o al imprimir la segunda el hub descartaría el
 * documento por id repetido —sin error y sin papel—.
 */
export function idFacturado(id, folio) {
  return `${id}#${folio}`;
}

/**
 * Separa del carrito las unidades elegidas y las marca con el folio.
 *
 * @returns {{carrito: Array, parte: Array}} el carrito nuevo (con las líneas
 *   facturadas dentro, marcadas) y las líneas de esta cuenta, que son las que
 *   se imprimen y luego se cobran.
 *
 * El carrito devuelto conserva el ORDEN: la parte facturada se queda donde
 * estaba la línea original. Reordenar sería gratis para el código y caro para
 * el mesero, que localiza los renglones por su sitio.
 */
export function separarCuenta(carrito = [], seleccion = {}, folio) {
  const lista = Array.isArray(carrito) ? carrito : [];
  if (!folio) return { carrito: lista, parte: [] };

  const elegido = normalizarSeleccion(lista, seleccion);
  if (!Object.keys(elegido).length) return { carrito: lista, parte: [] };

  const nuevo = [];
  const parte = [];

  for (const linea of lista) {
    const pedidas = elegido[linea.id] || 0;
    if (!pedidas) {
      nuevo.push(linea);
      continue;
    }

    const total = entero(linea.cantidad);
    const restante = total - pedidas;
    const enviadas = repartirEnviadas(linea.cantidad_enviada, restante);

    // La parte que se factura. Id nuevo, folio estampado y su trozo de
    // enviadas. Se empuja ANTES que el resto para conservar el sitio visual de
    // la línea original.
    const facturada = {
      ...linea,
      id: idFacturado(linea.id, folio),
      cantidad: pedidas,
      cantidad_enviada: enviadas.facturada,
      [CAMPO_FOLIO]: folio,
    };
    nuevo.push(facturada);
    parte.push(facturada);

    if (restante > 0) {
      nuevo.push({
        ...linea,
        cantidad: restante,
        cantidad_enviada: enviadas.restante,
      });
    }
  }

  return { carrito: nuevo, parte };
}

/**
 * Deshace una cuenta que aún no se ha cobrado, devolviendo sus líneas al
 * carrito común.
 *
 * Existe por el caso real: se imprime la cuenta de tres, y antes de pagar
 * resulta que uno de ellos se suma a la otra mesa. Sin esta salida, el mesero
 * tendría que cancelar la mesa entera.
 *
 * **No refunde las líneas** con las que quedaron: si había 2 y se separó 1, al
 * devolverla quedan dos renglones de 1. Fundirlas exigiría decidir qué pasa con
 * las notas y las enviadas de cada una, y equivocarse ahí es el fallo caro de
 * `repartirPorNota`. Dos renglones se ven y se entienden.
 */
export function deshacerCuenta(carrito = [], folio) {
  if (!folio) return Array.isArray(carrito) ? carrito : [];
  return (Array.isArray(carrito) ? carrito : []).map((l) => {
    if (l?.[CAMPO_FOLIO] !== folio) return l;
    // Se copia y se borra la marca en vez de desestructurar con un nombre a
    // ignorar: la regla de lint del proyecto no admite variables sin usar, y
    // saltársela con un comentario por una línea de estilo no vale la pena.
    const resto = { ...l, id: String(l.id).split('#')[0] };
    delete resto[CAMPO_FOLIO];
    return resto;
  });
}

/**
 * Lo que queda en la mesa después de cobrar una cuenta.
 *
 * Cobrar una parcial quita del carrito exactamente las líneas de ese folio —ni
 * una más—, y deja intacto lo demás, incluidas otras cuentas ya impresas que
 * todavía no se han pagado.
 */
export function trasCobrarCuenta(carrito = [], folio) {
  if (!folio) return Array.isArray(carrito) ? carrito : [];
  return (Array.isArray(carrito) ? carrito : []).filter(
    (l) => l?.[CAMPO_FOLIO] !== folio,
  );
}
