// ─── AUTORIZACIÓN DE DESCUENTOS (25-jul) ─────────────────────────────────────
// Regla ÚNICA para cualquier descuento del sistema: el de ticket (ModalCobro) y
// el de producto (carrito del POS). Vive aquí y no dentro de un componente
// porque duplicarla es la forma más fácil de que una de las dos puertas quede
// más floja que la otra — y las dos dan al mismo cajón.
//
// Criterio (Proyecto L: capacidades, no nombres de rol):
//   · La sesión tiene `autoriza_descuentos` → aplica directo, sin fricción.
//   · No la tiene → alguien de staff que SÍ la tenga teclea su PIN y queda
//     registrado como autorizador. Sin autorizador válido no hay descuento.
//     La búsqueda por PIN vive en `lib/Autorizacion.js` (una sola para todo el
//     sistema desde el 23-nov) y las pantallas la piden por `api/autorizar.js`.
//
// Puro y testeable: nada de React ni de store.

import { getCapacidades, tieneFlag } from './Permisos';
import { formatoDinero } from './Dinero';

export const TIPOS_DESCUENTO = ['pct', 'monto', 'cortesia'];

/** ¿Este rol puede autorizar descuentos? */
export function puedeAutorizar(rol, rolesPermisos) {
  return tieneFlag(getCapacidades(rol, rolesPermisos), 'autoriza_descuentos');
}

/**
 * Valida y normaliza lo que el usuario tecleó.
 * @returns {{ ok:true, descuento:{tipo,valor} } | { ok:false, error:string }}
 */
export function normalizarDescuento({ tipo, valor }, importeLinea = Infinity) {
  if (!TIPOS_DESCUENTO.includes(tipo)) {
    return { ok: false, error: 'Tipo de descuento no válido.' };
  }
  if (tipo === 'cortesia') {
    return { ok: true, descuento: { tipo: 'cortesia', valor: 100 } };
  }

  const v = Number(valor);
  if (!Number.isFinite(v) || v <= 0) {
    return { ok: false, error: 'Escribe una cantidad mayor que cero.' };
  }
  if (tipo === 'pct') {
    if (v > 100)
      return { ok: false, error: 'El porcentaje no puede pasar de 100.' };
    return { ok: true, descuento: { tipo: 'pct', valor: v } };
  }
  // monto
  if (v > importeLinea) {
    return {
      ok: false,
      // Se avisa en vez de recortar en silencio: si el cajero quería regalar el
      // platillo entero, que lo diga con "cortesía" y quede así en auditoría.
      error: 'El descuento supera el importe del producto. Usa cortesía.',
    };
  }
  return { ok: true, descuento: { tipo: 'monto', valor: v } };
}

/** Texto corto para el badge de la línea y para la auditoría. */
export function etiquetaDescuento(d) {
  if (!d || !d.tipo) return '';
  if (d.tipo === 'cortesia') return 'Cortesía';
  if (d.tipo === 'pct') return `−${Number(d.valor)}%`;
  return `−${formatoDinero(Number(d.valor))}`;
}
