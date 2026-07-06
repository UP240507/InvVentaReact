// src/lib/inventario.js
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
