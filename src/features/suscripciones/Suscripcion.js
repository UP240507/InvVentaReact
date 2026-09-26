// src/features/suscripciones/Suscripcion.js
//
// ── LA REGLA QUE ESTO DEFIENDE ──────────────────────────────────────────────
// **Quien ya tiene una suscripción viva en Stripe no contrata otra: gestiona
// la que tiene.**
//
// Hasta el 26-sep el botón decía «Renovar / actualizar pago» y abría SIEMPRE
// un Checkout nuevo (`mode: 'subscription'`). Stripe hace exactamente lo que
// se le pide: crea otra suscripción sobre el mismo cliente, con su propio
// cobro anual. Tres clics, tres suscripciones, tres cargos a la misma tarjeta.
// No hay excepción ni aviso: la pantalla se ve igual de bien.
//
// Y el nombre del botón empujaba al error. «Actualizar pago» —cambiar la
// tarjeta— es lo que hace el OTRO botón, el del portal. Quien quería cambiar
// su tarjeta pulsaba el que llevaba la palabra «pago» y acababa contratando
// de nuevo.
//
// ── POR QUÉ UNA FUNCIÓN Y NO UN `if` EN LA PANTALLA ─────────────────────────
// Porque la misma decisión la toman dos sitios que no se hablan: la pantalla,
// para enseñar el botón correcto, y `create-checkout`, para negarse aunque
// alguien llame a la función por su cuenta. La pantalla nunca es la única
// barrera. Aquí vive la parte que se puede probar.

/** Estados en los que Stripe YA está cobrando —o intentando cobrar—. */
export const ESTADOS_CON_COBRO = Object.freeze(['activo', 'moroso']);

/**
 * ¿Esta suscripción sigue viva en Stripe?
 *
 * `moroso` cuenta: un pago fallido no borra la suscripción, la deja en
 * `past_due`. Lo que hace falta ahí es arreglar la tarjeta, no contratar
 * encima —contratar encima deja DOS, una sin pagar y otra nueva—.
 *
 * `cancelar_al_final` también cuenta: la suscripción existe hasta que termina
 * el periodo, y durante esos días un Checkout nuevo se solapa con ella.
 */
export function tieneSuscripcionViva(suscripcion) {
  if (!suscripcion) return false;
  if (!suscripcion.stripe_subscription_id) return false;
  return ESTADOS_CON_COBRO.includes(suscripcion.estado);
}

/**
 * Qué puede hacer esta cuenta con su cobro.
 *
 *   'contratar' → no hay nada vivo en Stripe: trial, cancelada, suspendida o
 *                 cuenta nueva. El Checkout es el camino correcto.
 *   'portal'    → ya hay una suscripción viva. Tarjeta, facturas, cambio de
 *                 plan y cancelación se hacen en el portal de Stripe, que sabe
 *                 prorratear. Contratar otra vez no es una opción.
 */
export function accionDeCobro(suscripcion) {
  return tieneSuscripcionViva(suscripcion) ? 'portal' : 'contratar';
}

/** El mensaje cuando el servidor rechaza un checkout por duplicado. */
export const AVISO_YA_TIENE = Object.freeze({
  codigo: 'ya_tiene_suscripcion',
  texto:
    'Ya tienes una suscripción activa. Para cambiar la tarjeta, el plan o cancelar, entra en «Tarjeta, facturas y cancelación»: contratar otra vez te cobraría dos veces.',
});
