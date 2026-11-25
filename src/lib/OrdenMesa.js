// src/lib/OrdenMesa.js
// ─────────────────────────────────────────────────────────────────────────────
// LA ORDEN DE LA MESA Y EL CARRITO EN PANTALLA (0.3.3, 19-nov)
//
// Una mesa vive en dos sitios a la vez: lo GUARDADO (`mesa.orden_actual`, lo
// que ven los demás aparatos y lo que se cobra) y el CARRITO del POS que la
// tiene abierta, que además lleva lo que el mesero agregó y aún no manda.
//
// Hasta la 0.3.2 el POS rehacía el carrito desde lo guardado cada vez que la
// mesa cambiaba en el almacén, y eso tenía dos caras del mismo fallo:
//
//  - **Lo no mandado se borraba** cuando cualquier cosa tocaba la mesa: el
//    contador de comensales, otro aparato, un traspaso (medido por Chris el
//    19-nov).
//  - **Lo que sólo vivía en pantalla se perdía al salir**: una cortesía a una
//    línea ya enviada no se escribía en la mesa, y al volver ya no estaba,
//    aunque Auditoría la tenía registrada. El cliente pagó $183.70 por lo que
//    el gerente había regalado (H3, 17-nov).
//
// Aquí está la aritmética de las dos cosas, sin pantalla ni almacén.
// ─────────────────────────────────────────────────────────────────────────────

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const mismoId = (a, b) => String(a?.id) === String(b?.id);
const pendientes = (linea) =>
  Math.max(0, num(linea?.cantidad) - num(linea?.cantidad_enviada));

/**
 * El carrito que debe verse cuando la mesa cambió en el almacén.
 *
 * Lo guardado manda: es lo que se cobra y lo que ven los demás. Encima se
 * conserva SÓLO lo que este aparato tiene sin mandar, y nunca más de eso:
 *
 *  - Una línea que está en los dos sitios toma todo de lo guardado (su
 *    descuento, lo enviado, la nota) y suma las unidades que aquí faltan por
 *    mandar. Esas unidades se cuentan contra las dos cosas a la vez —las que no
 *    se han enviado y las que lo guardado no tiene— para no duplicar nada:
 *    justo después de mandar a producción lo guardado ya trae todo, y si otro
 *    aparato traspasó o cobró unidades ya enviadas, no se resucitan aquí.
 *  - Una línea que sólo está aquí se queda con lo que tenga sin mandar. Si lo
 *    que tenía era ya enviado y lo guardado no la trae, otro aparato la movió.
 *  - Una línea que sólo está guardada entra tal cual: la agregó otro aparato.
 *
 * @param {Array} guardados  las líneas de `mesa.orden_actual.items`
 * @param {Array} locales    el carrito que había en pantalla
 */
export function fusionarConGuardado(guardados = [], locales = []) {
  const g = Array.isArray(guardados) ? guardados : [];
  const l = Array.isArray(locales) ? locales : [];

  const out = g.map((guardada) => {
    const local = l.find((x) => mismoId(x, guardada));
    if (!local) return guardada;
    const extra = Math.min(
      pendientes(local),
      Math.max(0, num(local.cantidad) - num(guardada.cantidad)),
    );
    return extra > 0
      ? { ...guardada, cantidad: num(guardada.cantidad) + extra }
      : guardada;
  });

  for (const local of l) {
    if (g.some((x) => mismoId(x, local))) continue;
    const sinMandar = pendientes(local);
    if (sinMandar > 0) {
      out.push({ ...local, cantidad: sinMandar, cantidad_enviada: 0 });
    }
  }
  return out;
}

/**
 * Aplica un descuento a `unidades` de una línea.
 *
 * Si son todas, el descuento va en la línea. Si son menos, **la línea se
 * parte en dos** (decidido por Chris el 19-nov): con dos jugos y cortesía a
 * uno, queda «Jugo $40» y «Jugo · Cortesía $0». Partir y no guardar la
 * cantidad dentro del descuento es lo que deja intactos `importeDeLinea` y la
 * verificación del servidor (`verificar_total_venta`), que ya saben cobrar
 * una línea con descuento y otra sin él.
 *
 * La parte nueva:
 *  - lleva su propio id (`idParte`), para que un jugo nuevo que se agregue
 *    sume a la línea normal y no a la cortesía;
 *  - se queda con lo ya enviado primero, porque lo normal es regalar lo que ya
 *    está en la mesa. El total enviado no cambia: no se vuelve a mandar nada a
 *    cocina, ni se descuenta inventario otra vez;
 *  - conserva `receta_id`, para que el servidor siga cotejando el precio con
 *    el catálogo aunque su id ya no sea el de la receta.
 *
 * `idParte` lo decide quien llama y se pasa igual a la pantalla y a lo
 * guardado: si cada uno inventara el suyo, las dos mitades no se reconocerían
 * al fusionarse.
 */
export function aplicarDescuentoEnLineas(
  items = [],
  id,
  descuento,
  unidades = null,
  idParte = null,
) {
  const lista = Array.isArray(items) ? items : [];
  const linea = lista.find((x) => String(x?.id) === String(id));
  if (!linea) return lista;

  const cantidad = num(linea.cantidad);
  const u = unidades == null ? cantidad : Math.floor(num(unidades));
  if (u <= 0) return lista;
  if (u >= cantidad || !idParte) {
    return lista.map((x) => (x === linea ? { ...x, descuento } : x));
  }

  const enviadas = num(linea.cantidad_enviada);
  const enviadasParte = Math.min(enviadas, u);
  const resto = {
    ...linea,
    cantidad: cantidad - u,
    cantidad_enviada: enviadas - enviadasParte,
  };
  const parte = {
    ...linea,
    id: idParte,
    receta_id: linea.receta_id ?? linea.id,
    cantidad: u,
    cantidad_enviada: enviadasParte,
    descuento,
  };

  const out = [];
  for (const x of lista) {
    if (x === linea) out.push(resto, parte);
    else out.push(x);
  }
  return out;
}

/**
 * Un id nuevo para la parte de una línea partida. Lleva el id de la línea
 * delante para que se lea de dónde salió, y el reloj detrás para que dos
 * partidas de la misma línea no choquen.
 */
export function idDeParte(idLinea, ahora = Date.now()) {
  return `${idLinea}::desc-${Number(ahora).toString(36)}`;
}

/** Quita el descuento de una línea. No vuelve a juntar líneas partidas. */
export function quitarDescuentoEnLineas(items = [], id) {
  const lista = Array.isArray(items) ? items : [];
  return lista.map((x) =>
    String(x?.id) === String(id) ? { ...x, descuento: null } : x,
  );
}

// ── ¿SE PUEDE TRASPASAR? (H1, salida rápida de la 0.3.4) ────────────────────
// Sólo una mesa ocupada con algo en la cuenta. Con la cuenta impresa
// (`por_cobrar`) el POS ya no deja tocar la orden sin reabrirla con PIN, y
// sacarle líneas por un traspaso era la misma puerta sin candado. Para
// traspasar, primero se reabre en La Caja. La misma regla decide la tarjeta,
// el inspector y la tecla T, para que no vuelvan a separarse.
export function puedeTraspasar(mesa) {
  return (
    mesa?.estado === 'ocupada' && (mesa.orden_actual?.items || []).length > 0
  );
}
