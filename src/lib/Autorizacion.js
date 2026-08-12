/**
 * Autorizacion.js — quién puede autorizar una excepción, y con qué PIN.
 *
 * ── POR QUÉ EXISTE ──────────────────────────────────────────────────────────
 * El sistema tiene varias excepciones que alguien con mando autoriza tecleando
 * SU PIN: un descuento en `ModalCobro`, una salida antes de cumplir jornada en
 * el checador, y —desde el 12-ago— reabrir una cuenta ya impresa. Los tres
 * hacen exactamente la misma pregunta.
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
  const p = String(pin).trim();
  if (!p || !flag) return null;

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
