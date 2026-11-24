/**
 * autorizar.js — la puerta por la que las pantallas piden que alguien con mando
 * autorice algo con su PIN.
 *
 * ── POR QUÉ ES ASÍNCRONA SI HOY NO ESPERA A NADIE ──────────────────────────
 * Hoy compara contra la plantilla que el aparato ya tiene (`staff` del store),
 * con la función pura de `lib/Autorizacion.js`. En la fase 2 el PIN deja de
 * viajar a los teléfonos y se comprueba fuera (la caja o el servidor): eso es
 * una pregunta por red y tiene que esperarse. Si la puerta fuera síncrona hoy,
 * ese día habría que reescribir las siete pantallas que la usan; así, sólo
 * cambia lo de adentro. Decidido el 23-nov (DISENO_FASE_1_CIMIENTOS.md §2).
 *
 * Devuelve la ficha de quien autoriza, o `null` si nadie con esa capacidad
 * tiene ese PIN. No lanza por un PIN equivocado: es un caso normal.
 */
import { useAppStore } from '../store/useAppStore';
import { buscarAutorizador } from '../lib/Autorizacion';

export async function autorizar({ pin, flag }) {
  const { staff, roles_permisos } = useAppStore.getState();
  return buscarAutorizador({ staff, roles_permisos, pin, flag });
}
