import { describe, it, expect } from 'vitest';
import {
  aISOLocal,
  hoyLocalISO,
  deISOLocal,
  sumarDias,
  sumarDiasISO,
  inicioDeMesISO,
  mismoDia,
} from './Fechas';

describe('aISOLocal', () => {
  it('EL BUG: 23:20 del 26 es el 26, no el 27', () => {
    // Con toISOString() en México (UTC-6) esto daba '2026-07-27' y el gasto
    // quedaba fuera del periodo, invisible aunque estuviera guardado.
    const noche = new Date(2026, 6, 26, 23, 20, 0);
    expect(aISOLocal(noche)).toBe('2026-07-26');
  });

  it('la medianoche justa pertenece al día que empieza', () => {
    expect(aISOLocal(new Date(2026, 6, 26, 0, 0, 0))).toBe('2026-07-26');
  });

  it('el último segundo del día sigue siendo ese día', () => {
    expect(aISOLocal(new Date(2026, 6, 26, 23, 59, 59))).toBe('2026-07-26');
  });

  it('rellena mes y día a dos dígitos', () => {
    expect(aISOLocal(new Date(2026, 0, 5, 12))).toBe('2026-01-05');
  });

  it('devuelve null con basura en vez de "NaN-NaN-NaN"', () => {
    expect(aISOLocal(new Date('no-es-fecha'))).toBe(null);
  });
});

describe('hoyLocalISO', () => {
  it('acepta un "ahora" inyectado, para poder probarlo', () => {
    expect(hoyLocalISO(new Date(2026, 11, 31, 22))).toBe('2026-12-31');
  });
});

describe('deISOLocal', () => {
  it('CLAVE: no retrocede un día al parsear', () => {
    // new Date('2026-07-27') se lee como UTC y en México da el 26 a las 18:00.
    const d = deISOLocal('2026-07-27');
    expect(d.getDate()).toBe(27);
    expect(d.getMonth()).toBe(6);
    expect(d.getHours()).toBe(0);
  });

  it('ida y vuelta sin desplazamiento', () => {
    expect(aISOLocal(deISOLocal('2026-02-28'))).toBe('2026-02-28');
  });

  it('tolera vacío y basura', () => {
    expect(deISOLocal(null)).toBe(null);
    expect(deISOLocal('cualquier cosa')).toBe(null);
  });
});

describe('sumarDias', () => {
  it('cruza el fin de mes', () => {
    expect(sumarDiasISO('2026-07-31', 1)).toBe('2026-08-01');
  });

  it('cruza el fin de año hacia atrás', () => {
    expect(sumarDiasISO('2026-01-01', -1)).toBe('2025-12-31');
  });

  it('respeta los años bisiestos', () => {
    expect(sumarDiasISO('2028-02-28', 1)).toBe('2028-02-29');
  });

  it('acepta un Date sin mutar el original', () => {
    const base = new Date(2026, 6, 26, 15);
    sumarDias(base, 5);
    expect(base.getDate()).toBe(26);
  });
});

describe('inicioDeMesISO', () => {
  it('devuelve el día 1 del mes local', () => {
    expect(inicioDeMesISO(new Date(2026, 6, 26, 23, 30))).toBe('2026-07-01');
  });
});

describe('mismoDia', () => {
  it('compara por día local, no por instante', () => {
    const a = new Date(2026, 6, 26, 1, 0);
    const b = new Date(2026, 6, 26, 23, 59);
    expect(mismoDia(a, b)).toBe(true);
  });

  it('mezcla Date con cadena sin desfase', () => {
    expect(mismoDia(new Date(2026, 6, 26, 23, 20), '2026-07-26')).toBe(true);
  });

  it('días distintos son distintos', () => {
    expect(mismoDia('2026-07-26', '2026-07-27')).toBe(false);
  });
});
