// src/lib/Inventario.js
// Lógica pura de inventario para ventas: construcción de deltas (con sustituciones)
// y verificación de stock antes de cobrar.

/**
 * Construye los deltas de stock de una venta. Expande cada platillo (receta) a
 * sus insumos canónicos { productoId, cantidad } y acumula por producto.
 * - La merma NO se descuenta aquí (es del módulo de Mermas; evita doble conteo).
 * - sustituciones: mapa { productoIdOriginal: productoIdSustituto } para canjear
 *   un insumo agotado por otro al momento de descontar.
 */
export function construirDeltasStock(items = [], sustituciones = {}) {
  const mapa = new Map(); // productoId → cantidad consumida

  for (const it of Array.isArray(items) ? items : []) {
    const qty = Number(it?.cantidad) || 0;
    if (qty <= 0) continue;

    const insumos = Array.isArray(it?.insumos) ? it.insumos : [];

    if (insumos.length > 0) {
      for (const ins of insumos) {
        const pid = ins?.productoId ?? ins?.id_producto;
        if (pid == null) continue;
        const consumo = (Number(ins?.cantidad) || 0) * qty;
        if (consumo <= 0) continue;
        const k = String(pid);
        mapa.set(k, (mapa.get(k) || 0) + consumo);
      }
    } else {
      const pid = it?.id ?? it?.producto_id;
      if (pid == null) continue;
      const k = String(pid);
      mapa.set(k, (mapa.get(k) || 0) + qty);
    }
  }

  // Aplicar sustituciones (remapear productoId → sustituto, re-acumulando)
  const final = new Map();
  for (const [pid, cant] of mapa.entries()) {
    const sub = sustituciones?.[pid];
    const destino = sub != null ? String(sub) : pid;
    final.set(destino, (final.get(destino) || 0) + cant);
  }

  return [...final.entries()].map(([pid, cantidad]) => ({
    productoId: /^\d+$/.test(pid) ? Number(pid) : pid,
    cantidad: Math.round(cantidad * 1000) / 1000,
  }));
}

/**
 * ¿La receta es un paquete? (combo a precio fijo con componentes).
 */
export function esPaquete(receta) {
  return Array.isArray(receta?.componentes) && receta.componentes.length > 0;
}

/**
 * Grupos de elección del paquete ("elige 1 de N"):
 * { grupo: text, cantidad: number, opciones: [{recetaId, nombre}] }.
 * Conviven con componentes fijos en el mismo arreglo 'componentes'.
 */
export function gruposDeEleccion(receta) {
  return (receta?.componentes || []).filter(
    (c) => Array.isArray(c?.opciones) && c.opciones.length > 0,
  );
}

export function tieneElecciones(receta) {
  return gruposDeEleccion(receta).length > 0;
}

/**
 * Resuelve los componentes de un paquete con las elecciones del cliente:
 * fijos pasan directo; de cada grupo entra SOLO la opción elegida.
 * elecciones = { [nombreGrupo]: recetaId }.
 * Devuelve [{recetaId, cantidad, nombre}] — el shape fijo que ya entienden
 * expandirInsumosPaquete y el render del KDS. Grupos sin elección se omiten
 * (el POS no debe permitir confirmar sin elegir todo).
 */
export function resolverComponentesPaquete(paquete, elecciones = {}) {
  const out = [];
  for (const comp of paquete?.componentes || []) {
    if (Array.isArray(comp?.opciones) && comp.opciones.length > 0) {
      const elegidaId = elecciones?.[comp.grupo];
      const opcion = comp.opciones.find(
        (o) => String(o?.recetaId) === String(elegidaId),
      );
      if (opcion) {
        out.push({
          recetaId: opcion.recetaId,
          cantidad: Number(comp.cantidad) || 1,
          nombre: opcion.nombre || '',
        });
      }
    } else if (comp?.recetaId != null) {
      out.push({
        recetaId: comp.recetaId,
        cantidad: Number(comp.cantidad) || 1,
        nombre: comp.nombre || '',
      });
    }
  }
  return out;
}

/**
 * Expande los insumos de un PAQUETE desde sus recetas componentes VIVAS.
 * Se llama al agregar al carrito (no al guardar el paquete): así los insumos
 * nunca quedan desnormalizados/obsoletos si una receta componente cambia.
 * Devuelve [{ productoId, cantidad }] acumulado por producto, para que el
 * item del carrito viaje con el shape que construirDeltasStock ya entiende.
 * Los componentes cuya receta ya no exista o esté inactiva se omiten (el
 * paquete sigue vendible; el faltante es un problema de catálogo, no de POS).
 */
export function expandirInsumosPaquete(paquete, recetas = []) {
  if (!esPaquete(paquete)) return paquete?.insumos || [];
  const mapaRecetas = new Map((recetas || []).map((r) => [String(r.id), r]));
  const mapa = new Map(); // productoId → cantidad

  for (const comp of paquete.componentes) {
    const recetaComp = mapaRecetas.get(String(comp?.recetaId));
    if (!recetaComp || recetaComp.activo === false) continue;
    const veces = Number(comp?.cantidad) || 0;
    if (veces <= 0) continue;
    for (const ins of recetaComp.insumos || []) {
      const pid = ins?.productoId ?? ins?.id_producto;
      if (pid == null) continue;
      const consumo = (Number(ins?.cantidad) || 0) * veces;
      if (consumo <= 0) continue;
      const k = String(pid);
      mapa.set(k, (mapa.get(k) || 0) + consumo);
    }
  }

  return [...mapa.entries()].map(([pid, cantidad]) => ({
    productoId: /^\d+$/.test(pid) ? Number(pid) : pid,
    cantidad: Math.round(cantidad * 1000) / 1000,
  }));
}

/**
 * Construye los items de una COMANDA (KDS) desde items del carrito.
 * - Platillo normal → 1 item con destino por enrutamiento de SU categoría.
 * - PAQUETE → SE EXPANDE: un item por componente (fijo o elegido), cada uno
 *   enrutado por la categoría de SU receta (café → Barra, chilaquiles →
 *   Cocina). La cantidad del componente se multiplica por la del combo y la
 *   nota conserva el nombre del paquete para dar contexto a cocina.
 * enrutamiento = configuracion.enrutamiento { [categoria]: zona }.
 */
export function construirItemsComanda(
  items = [],
  recetas = [],
  enrutamiento = {},
) {
  const mapaRecetas = new Map((recetas || []).map((r) => [String(r.id), r]));
  const destinoDe = (categoria) => enrutamiento?.[categoria] || 'Cocina';
  const out = [];

  for (const item of Array.isArray(items) ? items : []) {
    const qty = Number(item?.cantidad) || 0;
    if (qty <= 0) continue;

    const componentes = (item?.componentes || []).filter(
      (c) => c?.recetaId != null,
    );

    if (esPaquete(item) && componentes.length > 0) {
      for (const comp of componentes) {
        const recetaComp = mapaRecetas.get(String(comp.recetaId));
        out.push({
          id: `${item.id}::${comp.recetaId}`,
          nombre: comp.nombre || recetaComp?.nombre || `#${comp.recetaId}`,
          cantidad: (Number(comp.cantidad) || 1) * qty,
          destino: destinoDe(recetaComp?.categoria),
          estado: 'pendiente',
          nota: [item.nota, `Paquete: ${item.nombre}`]
            .filter(Boolean)
            .join(' · '),
        });
      }
      continue;
    }

    out.push({
      id: item.id ? `${item.id}` : `${item.nombre}-${Date.now()}`,
      nombre: item.nombre,
      cantidad: qty,
      destino: destinoDe(item.categoria),
      estado: 'pendiente',
      nota: item.nota || '',
      // «¿Cómo lo quiere?» tiene que sobrevivir hasta aquí o no sirve de nada.
      // Este objeto se construye CAMPO A CAMPO —no es un spread del item—, así
      // que cualquier dato nuevo del carrito se pierde en silencio si no se
      // nombra explícitamente. Es lo que pasaba con los modificadores: se
      // elegían y no llegaban a cocina.
      modificadores: Array.isArray(item.modificadores)
        ? item.modificadores
        : [],
    });
  }
  return out;
}

/**
 * Verifica el stock disponible contra lo que la venta consumiría.
 * Devuelve la lista de problemas (vacía si todo OK).
 * severidad: 'agotado' (quedaría en negativo) | 'bajo_minimo' (cae bajo el mínimo).
 */
export function verificarStock(items = [], productos = [], sustituciones = {}) {
  const deltas = construirDeltasStock(items, sustituciones);
  const mapaProd = new Map((productos || []).map((p) => [String(p.id), p]));
  const problemas = [];

  for (const d of deltas) {
    const prod = mapaProd.get(String(d.productoId));
    if (!prod) continue; // producto no rastreado en inventario → no bloquea
    const stock = Number(prod.stock) || 0;
    const min = Number(prod.min) || 0;
    const resultante = Math.round((stock - d.cantidad) * 1000) / 1000;

    if (resultante < 0) {
      problemas.push({
        productoId: d.productoId,
        nombre: prod.nombre,
        unidad: prod.unidad,
        requerido: d.cantidad,
        stock,
        min,
        resultante,
        severidad: 'agotado',
      });
    } else if (min > 0 && resultante < min) {
      problemas.push({
        productoId: d.productoId,
        nombre: prod.nombre,
        unidad: prod.unidad,
        requerido: d.cantidad,
        stock,
        min,
        resultante,
        severidad: 'bajo_minimo',
      });
    }
  }
  return problemas;
}
