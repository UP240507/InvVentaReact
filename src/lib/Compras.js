// src/lib/Compras.js — a quién pertenece una orden de compra
//
// ── POR QUÉ ESTO ES UNA FUNCIÓN Y NO UN `find` EN LA PANTALLA ────────────────
//
// Hasta el 01-sep la orden guardaba al proveedor SÓLO por su nombre. La
// pantalla lo elegía del catálogo y tiraba el id (`ComprasScreen.jsx:162`
// guardaba `.nombre`), y luego lo buscaba de vuelta con
// `proveedores.find((p) => p.nombre === orden.proveedor)` para mandarle la
// orden por WhatsApp o por correo.
//
// Consecuencia: **corregir el nombre de un proveedor en el catálogo dejaba sin
// destinatario a todas sus órdenes anteriores.** El `find` devuelve
// `undefined`, el teléfono sale vacío, y el enlace se arma igual. Ni excepción
// ni log. Es la tercera vez que la misma enfermedad aparece en este proyecto
// —el hub anunciándose por nombre, el teléfono como identidad del dueño, y
// ahora el proveedor—, así que la regla queda escrita en un sitio con pruebas:
//
//   **Un nombre es para enseñar. Para buscar, un id.**
//
// El nombre no se tira: `orden.proveedor` es cómo se llamaba el proveedor EL
// DÍA DE LA ORDEN, y renombrar el catálogo no debe reescribir la historia.

/**
 * El proveedor al que pertenece una orden, buscado por identidad.
 *
 * El respaldo por nombre existe SÓLO por las órdenes emitidas antes de que
 * existiera `proveedor_id` (en AZUL, 46 de ellas). Una orden nueva siempre lo
 * lleva, así que ese camino se irá quedando sin usuarios; no se quita todavía
 * porque quitarlo dejaría el historial viejo sin destinatario, que es
 * exactamente el fallo que esto viene a cerrar.
 *
 * @param {object|null} orden
 * @param {Array|null} proveedores
 * @returns {object|null} el proveedor, o null si no se puede saber quién es.
 */
export function proveedorDeLaOrden(orden, proveedores) {
  const lista = Array.isArray(proveedores) ? proveedores : [];
  if (!orden) return null;

  // Los ids viajan como número desde Postgres y como texto desde algunos
  // formularios: se comparan en texto, como en el resto del proyecto.
  if (orden.proveedor_id !== null && orden.proveedor_id !== undefined) {
    const porId = lista.find(
      (p) => p && String(p.id) === String(orden.proveedor_id),
    );
    if (porId) return porId;
  }

  const nombre = typeof orden.proveedor === 'string' ? orden.proveedor : '';
  if (!nombre) return null;
  return lista.find((p) => p && p.nombre === nombre) ?? null;
}

/**
 * El nombre que hay que ENSEÑAR de una orden.
 *
 * El del catálogo si se sabe quién es —así una corrección de ortografía se ve
 * en todas partes— y, si no, el que quedó escrito en la orden. Nunca vacío
 * mientras la orden traiga algo.
 */
export function nombreDeProveedorDeLaOrden(orden, proveedores) {
  const prov = proveedorDeLaOrden(orden, proveedores);
  return prov?.nombre || orden?.proveedor || '';
}

/**
 * El teléfono en dígitos, listo para `wa.me`. Cadena vacía si no hay a quién.
 *
 * Devolver cadena vacía es deliberado y la pantalla tiene que MIRARLA: armar
 * `wa.me/?text=...` sin número abre un WhatsApp sin destinatario, que es
 * "funciona" a los ojos de quien mira la pantalla y "no llegó nada" a los del
 * proveedor.
 */
export function telefonoParaWhatsApp(orden, proveedores) {
  const tel = proveedorDeLaOrden(orden, proveedores)?.telefono;
  return typeof tel === 'string' ? tel.replace(/\D/g, '') : '';
}
