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

  it('RIESGO: una cuenta ACTIVA sin fecha_vencimiento queda FUERA', () => {
    // `fecha_vencimiento` es nullable desde la migración del 25-jul. Si el
    // webhook no la escribe, el cliente aparece como activo en la base y como
    // NO vigente en la caja: paywall con la suscripción pagada. Queda afirmado
    // para que se vea venir, no para bendecirlo.
    const p = derivarPlan({ estado: 'activo', plan: 'basico' });
    expect(p.vigente).toBe(false);
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
