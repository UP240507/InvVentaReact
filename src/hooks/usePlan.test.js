// src/hooks/usePlan.test.js
//
// ── LA AFIRMACIÓN ───────────────────────────────────────────────────────────
// **`derivarPlan` es la única frontera entre lo que se pagó y lo que no.**
//
// De aquí salen tres decisiones: si la cuenta está vigente —`App.jsx` manda al
// paywall con eso—, cuántos empleados puede dar de alta, y qué módulos premium
// ve. Un error hacia un lado regala módulos que nadie pagó; hacia el otro deja
// fuera a un cliente que sí pagó, en hora de comida.
//
// No tenía prueba. Está en el censo
// (`claude/CENSO_26-SEP_QUE_PROCESO_TIENE_PRUEBA.md`).
//
// Se congela el reloj: la vigencia se calcula contra `Date.now()`, así que sin
// fijarlo estas pruebas caducarían solas y empezarían a fallar un martes
// cualquiera sin que nadie hubiera tocado el código.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { derivarPlan } from './usePlan';

const HOY = new Date('2026-09-26T12:00:00.000Z');

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(HOY);
});
afterEach(() => vi.useRealTimers());

describe('derivarPlan · sin suscripción', () => {
  it('LA AFIRMACIÓN: sin fila, todo cerrado y nada de módulos', () => {
    const p = derivarPlan(null);
    expect(p.vigente).toBe(false);
    expect(p.limiteEmpleados).toBe(0);
    expect(p.modulos).toEqual([]);
    expect(p.tieneModulo('lealtad')).toBe(false);
    expect(p.diasRestantes).toBe(0);
  });
});

describe('derivarPlan · vigencia', () => {
  it('el trial corre contra trial_hasta, y el último día cuenta entero', () => {
    // Las fechas son DATE: «hasta el 26» significa hasta que termine el 26.
    const p = derivarPlan({
      estado: 'trial',
      plan: 'basico',
      trial_hasta: '2026-09-26',
    });
    expect(p.vigente).toBe(true);
  });

  it('un trial vencido ayer ya no es vigente', () => {
    const p = derivarPlan({
      estado: 'trial',
      plan: 'basico',
      trial_hasta: '2026-09-24',
    });
    expect(p.vigente).toBe(false);
    expect(p.diasRestantes).toBe(0);
  });

  it('una cuenta activa vive hasta su vencimiento más los días de gracia', () => {
    const p = derivarPlan({
      estado: 'activo',
      plan: 'basico',
      fecha_vencimiento: '2026-09-24', // venció anteayer
      dias_gracia: 3,
    });
    expect(p.vigente).toBe(true); // 24 + 3 de gracia + el día entero
  });

  it('DECISIÓN: un MOROSO sigue entrando durante la gracia', () => {
    // Un pago que falló no cierra la caja en mitad del servicio. La gracia
    // existe para que el dueño arregle su tarjeta sin quedarse sin vender.
    const p = derivarPlan({
      estado: 'moroso',
      plan: 'basico',
      fecha_vencimiento: '2026-09-25',
      dias_gracia: 3,
    });
    expect(p.vigente).toBe(true);
  });

  it('sin días de gracia declarados, son tres', () => {
    const conDefecto = derivarPlan({
      estado: 'activo',
      plan: 'basico',
      fecha_vencimiento: '2026-09-23',
    });
    const explicito = derivarPlan({
      estado: 'activo',
      plan: 'basico',
      fecha_vencimiento: '2026-09-23',
      dias_gracia: 3,
    });
    expect(conDefecto.vigente).toBe(explicito.vigente);
  });

  it('suspendida o cancelada NUNCA es vigente, aunque la fecha no haya llegado', () => {
    for (const estado of ['suspendido', 'cancelado']) {
      const p = derivarPlan({
        estado,
        plan: 'basico',
        fecha_vencimiento: '2027-01-01',
      });
      expect(p.vigente).toBe(false);
    }
  });

  // ── La cuenta de cobro SIN fecha de vencimiento ───────────────────────────
  // `fecha_vencimiento` es nullable desde la migración del 25-jul y la escribe
  // sólo el webhook de Stripe. Cuando falta, el cliente aparece como activo en
  // la base: pagó. La decisión (26-sep) es ventana de cortesía + aviso, no
  // paywall y no barra libre.
  it('DECISIÓN: una cuenta activa sin fecha entra durante la ventana, y se avisa', () => {
    const p = derivarPlan({
      estado: 'activo',
      plan: 'basico',
      updated_at: '2026-09-25T10:00:00.000Z', // el webhook escribió ayer
    });
    expect(p.vigente).toBe(true);
    expect(p.sinFechaVencimiento).toBe(true);
    expect(p.diasRestantes).toBeGreaterThan(0);
  });

  it('la ventana se agota: pasados los días, la cuenta sin fecha queda fuera', () => {
    // Lo que distingue esta decisión de «regalar el servicio»: la ventana tiene
    // fondo. Ocho días después de la última vez que alguien tocó la fila, no.
    const p = derivarPlan({
      estado: 'activo',
      plan: 'basico',
      updated_at: '2026-09-18T10:00:00.000Z',
    });
    expect(p.vigente).toBe(false);
    expect(p.sinFechaVencimiento).toBe(true);
    expect(p.diasRestantes).toBe(0);
  });

  it('el ancla es updated_at, NO el alta del cliente', () => {
    // Es la pieza que hace que esto funcione: el webhook que borra la fecha
    // toca `updated_at` en el mismo UPDATE (trigger en Postgres), así que la
    // ventana empieza a contar en el instante del fallo. Anclarla a
    // `fecha_inicio` dejaría fuera de inmediato a un cliente de hace un año.
    const viejoCliente = {
      estado: 'activo',
      plan: 'basico',
      fecha_inicio: '2025-01-01',
      created_at: '2025-01-01T00:00:00.000Z',
      updated_at: '2026-09-26T09:00:00.000Z', // el webhook acaba de fallar
    };
    expect(derivarPlan(viejoCliente).vigente).toBe(true);
  });

  it('sin updated_at cae a fecha_inicio, y luego a created_at', () => {
    const porInicio = derivarPlan({
      estado: 'activo',
      plan: 'basico',
      fecha_inicio: '2026-09-25',
    });
    expect(porInicio.vigente).toBe(true);

    const porCreated = derivarPlan({
      estado: 'activo',
      plan: 'basico',
      created_at: '2026-09-25T10:00:00.000Z',
    });
    expect(porCreated.vigente).toBe(true);
  });

  it('sin NINGUNA fecha desde la que contar, no es vigente', () => {
    // Una ventana sin ancla sería vigencia infinita, porque se recalcularía
    // desde «ahora» en cada render. Imposible en una fila nuestra —las tres
    // columnas son NOT NULL— pero un cache viejo a medias no puede abrir la
    // caja para siempre.
    const p = derivarPlan({ estado: 'activo', plan: 'basico' });
    expect(p.vigente).toBe(false);
    expect(p.sinFechaVencimiento).toBe(true);
  });

  it('una fecha basura no cuenta como ancla', () => {
    const p = derivarPlan({
      estado: 'activo',
      plan: 'basico',
      updated_at: 'no-es-una-fecha',
    });
    expect(p.vigente).toBe(false);
  });

  it('un MOROSO sin fecha también alcanza la ventana', () => {
    const p = derivarPlan({
      estado: 'moroso',
      plan: 'basico',
      updated_at: '2026-09-25T10:00:00.000Z',
    });
    expect(p.vigente).toBe(true);
    expect(p.sinFechaVencimiento).toBe(true);
  });

  it('la ventana NO alcanza a suspendido, cancelado ni trial sin fecha', () => {
    // La cortesía es para quien pagó. Un trial sin `trial_hasta` no pagó nada.
    for (const estado of ['suspendido', 'cancelado', 'trial']) {
      const p = derivarPlan({
        estado,
        plan: 'basico',
        updated_at: '2026-09-26T09:00:00.000Z',
      });
      expect(p.vigente).toBe(false);
      expect(p.sinFechaVencimiento).toBe(false);
    }
  });

  it('con fecha buena, la bandera de aviso NO se prende', () => {
    // Control: el aviso tiene que aparecer sólo cuando falta la fecha. Si se
    // prendiera siempre, la pantalla avisaría de un fallo que no existe y el
    // aviso dejaría de significar algo.
    const p = derivarPlan({
      estado: 'activo',
      plan: 'basico',
      fecha_vencimiento: '2027-01-01',
      updated_at: '2026-09-26T09:00:00.000Z',
    });
    expect(p.vigente).toBe(true);
    expect(p.sinFechaVencimiento).toBe(false);
  });

  it('los días restantes se redondean hacia arriba y nunca son negativos', () => {
    const p = derivarPlan({
      estado: 'trial',
      plan: 'basico',
      trial_hasta: '2026-09-28',
    });
    expect(p.diasRestantes).toBeGreaterThan(0);

    const vencido = derivarPlan({
      estado: 'trial',
      plan: 'basico',
      trial_hasta: '2020-01-01',
    });
    expect(vencido.diasRestantes).toBe(0);
  });
});

describe('derivarPlan · límites y módulos', () => {
  it('manda el catálogo que viaja con la suscripción', () => {
    const p = derivarPlan({
      estado: 'activo',
      plan: 'basico',
      fecha_vencimiento: '2027-01-01',
      planes: { nombre: 'Básico', limites: { empleados: 3, modulos: [] } },
    });
    expect(p.limiteEmpleados).toBe(3);
    expect(p.planNombre).toBe('Básico');
  });

  it('con el cache viejo cae al fallback local, no a "todo abierto" ni a "todo cerrado"', () => {
    // El cache offline puede no traer el embed de `planes`. Ni bloquear al
    // cliente ni regalarle el plan grande: se usa el espejo del seed.
    const p = derivarPlan({
      estado: 'activo',
      plan: 'pro',
      fecha_vencimiento: '2027-01-01',
    });
    expect(p.limiteEmpleados).toBe(25);
    expect(p.tieneModulo('lealtad')).toBe(true);
    expect(p.tieneModulo('multisucursal')).toBe(false);
  });

  it('un plan desconocido no abre la puerta: diez empleados y cero módulos', () => {
    const p = derivarPlan({
      estado: 'activo',
      plan: 'plan_que_no_existe',
      fecha_vencimiento: '2027-01-01',
    });
    expect(p.limiteEmpleados).toBe(10);
    expect(p.modulos).toEqual([]);
  });

  it('los addons suman módulos al plan, sin repetirlos', () => {
    const p = derivarPlan({
      estado: 'activo',
      plan: 'basico',
      fecha_vencimiento: '2027-01-01',
      addons: ['lealtad'],
    });
    expect(p.tieneModulo('lealtad')).toBe(true);

    const yaLoTenia = derivarPlan({
      estado: 'activo',
      plan: 'pro',
      fecha_vencimiento: '2027-01-01',
      addons: ['lealtad'],
    });
    expect(yaLoTenia.modulos.filter((m) => m === 'lealtad')).toHaveLength(1);
  });

  it('addons en un formato raro no revientan la pantalla', () => {
    const p = derivarPlan({
      estado: 'activo',
      plan: 'basico',
      fecha_vencimiento: '2027-01-01',
      addons: 'lealtad', // string, no array: lo que llegaría de un cache viejo
    });
    expect(p.modulos).toEqual([]);
  });

  it('el empresarial trae los dos módulos y sesenta empleados', () => {
    const p = derivarPlan({
      estado: 'activo',
      plan: 'empresarial',
      fecha_vencimiento: '2027-01-01',
    });
    expect(p.limiteEmpleados).toBe(60);
    expect(p.tieneModulo('lealtad')).toBe(true);
    expect(p.tieneModulo('multisucursal')).toBe(true);
  });
});
