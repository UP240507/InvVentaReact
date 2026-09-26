// src/features/suscripciones/Suscripcion.test.js
//
// LA AFIRMACIÓN: **con una suscripción viva, la pantalla NO ofrece contratar.**
// Lo que se defiende no es una etiqueta: es que nadie pueda pagar dos veces el
// mismo año por pulsar el botón que llevaba la palabra «pago».
import { describe, it, expect } from 'vitest';
import {
  tieneSuscripcionViva,
  accionDeCobro,
  ESTADOS_CON_COBRO,
} from './Suscripcion';

const VIVA = { estado: 'activo', stripe_subscription_id: 'sub_123' };

describe('accionDeCobro', () => {
  it('LA AFIRMACIÓN: con suscripción activa manda al portal, no al checkout', () => {
    expect(accionDeCobro(VIVA)).toBe('portal');
  });

  it('morosa tambien: un pago fallido se arregla con la tarjeta, no contratando encima', () => {
    // En Stripe queda en `past_due`, viva. Contratar encima deja DOS: la que no
    // se pudo cobrar y una nueva.
    expect(accionDeCobro({ ...VIVA, estado: 'moroso' })).toBe('portal');
  });

  it('una cancelación programada sigue viva hasta que termina el periodo', () => {
    expect(accionDeCobro({ ...VIVA, cancelar_al_final: true })).toBe('portal');
  });

  it('en prueba se puede contratar: todavía no hay nada en Stripe', () => {
    expect(
      accionDeCobro({ estado: 'trial', stripe_subscription_id: null }),
    ).toBe('contratar');
  });

  it('cancelada o suspendida se puede volver a contratar', () => {
    expect(
      accionDeCobro({ estado: 'cancelado', stripe_subscription_id: 'sub_1' }),
    ).toBe('contratar');
    expect(
      accionDeCobro({ estado: 'suspendido', stripe_subscription_id: 'sub_1' }),
    ).toBe('contratar');
  });

  it('sin suscripción —cuenta nueva— se contrata', () => {
    expect(accionDeCobro(null)).toBe('contratar');
    expect(accionDeCobro(undefined)).toBe('contratar');
    expect(accionDeCobro({})).toBe('contratar');
  });

  it('un estado activo SIN id de Stripe no bloquea: no hay nada que duplicar', () => {
    // Es el caso de una fila escrita a mano o de un trial mal marcado. Bloquear
    // aquí dejaría a esa cuenta sin poder pagar nunca, que es peor.
    expect(tieneSuscripcionViva({ estado: 'activo' })).toBe(false);
  });

  it('la lista de estados que cobran es la que dice el esquema', () => {
    // El CHECK de la tabla permite trial, activo, moroso, suspendido y
    // cancelado. Sólo dos implican un cobro vivo.
    expect([...ESTADOS_CON_COBRO]).toEqual(['activo', 'moroso']);
  });
});
