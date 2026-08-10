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
//
// Puro y testeable: nada de React ni de store.

import { getCapacidades, tieneFlag } from './Permisos';

export const TIPOS_DESCUENTO = ['pct', 'monto', 'cortesia'];

/** ¿Este rol puede autorizar descuentos? */
export function puedeAutorizar(rol, rolesPermisos) {
  return tieneFlag(getCapacidades(rol, rolesPermisos), 'autoriza_descuentos');
}

/**
 * Busca en la plantilla a alguien ACTIVO, con la capacidad y con ese PIN.
 * Acepta los dos campos históricos de PIN (`pin` y `pin_acceso`).
 *
 * Devuelve la fila del autorizador o null. Nunca lanza: un PIN mal tecleado es
 * un caso normal, no un error de programa.
 */
export function buscarAutorizador(pin, staff = [], rolesPermisos = []) {
  const p = String(pin ?? '').trim();
  // Un PIN de menos de 4 dígitos no se compara siquiera: evita que un registro
  // con el campo vacío autorice por accidente.
  if (p.length < 4) return null;

  return (
    (staff || []).find((s) => {
      if (!s) return false;
      const activo =
        s.activo !== false && s.activo !== 'false' && s.activo !== 0;
      if (!activo) return false;
      if (!puedeAutorizar(s.rol || s.puesto || '', rolesPermisos)) return false;
      const p1 = String(s.pin ?? '').trim();
      const p2 = String(s.pin_acceso ?? '').trim();
      return (p1 !== '' && p1 === p) || (p2 !== '' && p2 === p);
    }) || null
  );
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
  return `−$${Number(d.valor).toLocaleString('es-MX', { minimumFractionDigits: 2 })}`;
}
