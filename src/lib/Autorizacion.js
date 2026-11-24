/**
 * Autorizacion.js — quién puede autorizar una excepción, y con qué PIN.
 *
 * ── POR QUÉ EXISTE ──────────────────────────────────────────────────────────
 * El sistema tiene varias excepciones que alguien con mando autoriza tecleando
 * SU PIN: un descuento (de ticket o de producto), una salida antes de cumplir
 * jornada, reabrir una cuenta impresa, firmar el cierre, abrir el cajón y
 * desbloquear el KDS. Todas hacen exactamente la misma pregunta, y desde la
 * fase 1 (23-nov) la responde sólo esta función: la copia de `Descuentos.js`
 * se retiró.
 *
 * Las pantallas no la llaman directo: pasan por `api/autorizar.js`, que es
 * asíncrona para que en la fase 2 el PIN se compruebe fuera del teléfono sin
 * tocar las pantallas.
 *
 * La comprobación tiene tres partes, y cada una se puede escribir a medias:
 *
 *   1. Que el rol tenga la CAPACIDAD que se pide.
 *   2. Que el empleado siga ACTIVO. Es la que más fácil se olvida, y la que
 *      importa: un encargado despedido no debería seguir autorizando descuentos
 *      con el PIN que se sabe de memoria.
 *   3. Que el PIN puede vivir en `pin` o en `pin_acceso`. El segundo es legado
 *      y sigue habiendo empleados con él.
 *
 * Con tres copias, la que diverge es siempre la 2 — porque es la única cuyo
 * fallo no se nota probando: todo funciona, sólo que autoriza alguien que ya no
 * trabaja aquí.
 *
 * Puro: sin React, sin stores, sin red.
 */

import { getCapacidades, tieneFlag } from './Permisos';

/** Dígitos mínimos de un PIN que autoriza. Los de AZUL tienen de 4 a 6. */
export const PIN_MINIMO = 4;

/** ¿Sigue de alta? Tolerante con los `false` que llegan como texto o como 0. */
export function empleadoActivo(s) {
  return s?.activo !== false && s?.activo !== 'false' && s?.activo !== 0;
}

/**
 * El empleado cuyo PIN es éste y que además tiene la capacidad pedida.
 *
 * @param {object}  opciones
 * @param {Array}   opciones.staff
 * @param {Array}   opciones.roles_permisos
 * @param {string}  opciones.pin
 * @param {string}  opciones.flag  capacidad exigida, p. ej. `autoriza_descuentos`
 * @returns {object|null} el empleado, o `null` si nadie encaja
 */
export function buscarAutorizador({
  staff = [],
  roles_permisos = [],
  pin = '',
  flag = '',
} = {}) {
  const p = String(pin ?? '').trim();
  // Un PIN de menos de 4 dígitos ni se compara (decisión del 23-nov, para
  // todas las autorizaciones y no sólo los descuentos): evita que un campo
  // corto o a medio teclear autorice por accidente.
  if (p.length < PIN_MINIMO || !flag) return null;

  return (
    (staff || []).find((s) => {
      const rol = s?.rol || s?.puesto || '';
      if (!tieneFlag(getCapacidades(rol, roles_permisos), flag)) return false;
      if (!empleadoActivo(s)) return false;

      const p1 = String(s?.pin ?? '').trim();
      const p2 = String(s?.pin_acceso ?? '').trim();
      return (p1 !== '' && p1 === p) || (p2 !== '' && p2 === p);
    }) || null
  );
}

/**
 * ¿La sesión actual ya puede autorizar sin pedir PIN a nadie?
 *
 * Se usa para no poner fricción a quien ya tiene el mando: el dueño que aplica
 * un descuento no debería teclear su propio PIN para autorizarse a sí mismo.
 */
export function sesionAutoriza({
  usuario = null,
  roles_permisos = [],
  flag = '',
} = {}) {
  if (!flag) return false;
  const rol = usuario?.rol || usuario?.puesto || '';
  return tieneFlag(getCapacidades(rol, roles_permisos), flag);
}
