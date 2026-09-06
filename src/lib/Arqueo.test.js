// src/lib/Arqueo.test.js
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  calcularTotalesTurno,
  DENOMINACIONES_BASE,
  denominacionesDe,
  seConto,
  arqueoDeDesglose,
  arqueoDelTurno,
} from './Arqueo';

const turno = { id: 7, fecha_apertura: '2026-06-12T08:00:00Z' };

describe('calcularTotalesTurno · arqueo de caja', () => {
  it('REGRESIÓN D5: ticket mixto NO infla el efectivo esperado', () => {
    const ventas = [
      {
        turno_id: 7,
        total: 120,
        propina: 0,
        metodo_pago: 'mixto',
        efectivo: 50,
        tarjeta: 70,
      },
    ];
    const t = calcularTotalesTurno(ventas, turno);
    expect(t.efectivo).toBe(50); // ← antes el bug ponía 120
    expect(t.tarjeta).toBe(70);
  });

  it('efectivo puro y tarjeta pura van a su bucket', () => {
    const ventas = [
      {
        turno_id: 7,
        total: 100,
        efectivo: 100,
        tarjeta: 0,
        metodo_pago: 'efectivo',
      },
      {
        turno_id: 7,
        total: 200,
        efectivo: 0,
        tarjeta: 200,
        metodo_pago: 'tarjeta',
      },
    ];
    const t = calcularTotalesTurno(ventas, turno);
    expect(t.efectivo).toBe(100);
    expect(t.tarjeta).toBe(200);
    expect(t.totalVentas).toBe(300);
    expect(t.ticketsCount).toBe(2);
  });

  it('compat: venta vieja sin desglose cae al metodo_pago', () => {
    const ventas = [{ turno_id: 7, total: 80, metodo_pago: 'tarjeta' }];
    const t = calcularTotalesTurno(ventas, turno);
    expect(t.tarjeta).toBe(80);
    expect(t.efectivo).toBe(0);
  });

  it('asocia por turno_id e ignora ventas de otro turno', () => {
    const ventas = [
      { turno_id: 7, total: 100, efectivo: 100 },
      { turno_id: 9, total: 999, efectivo: 999 }, // otro turno
    ];
    const t = calcularTotalesTurno(ventas, turno);
    expect(t.efectivo).toBe(100);
    expect(t.ticketsCount).toBe(1);
  });

  it('fallback por fecha cuando no hay turno_id', () => {
    const ventas = [
      { total: 100, efectivo: 100, fecha: '2026-06-12T09:00:00Z' }, // dentro
      { total: 50, efectivo: 50, fecha: '2026-06-12T07:00:00Z' }, // antes de apertura
    ];
    const t = calcularTotalesTurno(ventas, turno);
    expect(t.efectivo).toBe(100);
    expect(t.ticketsCount).toBe(1);
  });

  it('propinas y venta neta', () => {
    const ventas = [{ turno_id: 7, total: 120, propina: 20, efectivo: 120 }];
    const t = calcularTotalesTurno(ventas, turno);
    expect(t.propinas).toBe(20);
    expect(t.totalVentas).toBe(120);
    expect(t.ventasNetas).toBe(100);
  });

  it('sin turno activo → ceros', () => {
    expect(calcularTotalesTurno([{ total: 999 }], null).totalVentas).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// EL DESGLOSE POR DENOMINACIONES
//
// La afirmación de todo el bloque: **la diferencia sale de lo contado, y no
// contar no es contar cero.**

describe('denominacionesDe', () => {
  it('la configuración manda', () => {
    expect(
      denominacionesDe({ denominaciones: { billetes: [100], monedas: [1] } }),
    ).toEqual({ billetes: [100], monedas: [1] });
  });

  it('EL CASO DE HOY: en NULL, la lista de fábrica', () => {
    // Los cinco locales tienen la columna en NULL. Leerla a secas dejaría la
    // pantalla de arqueo sin con qué contar.
    expect(denominacionesDe({ denominaciones: null })).toEqual(
      DENOMINACIONES_BASE,
    );
    expect(denominacionesDe(null)).toEqual(DENOMINACIONES_BASE);
    expect(denominacionesDe({ denominaciones: {} })).toEqual(
      DENOMINACIONES_BASE,
    );
  });

  it('aguanta el jsonb doble-codificado', () => {
    expect(
      denominacionesDe({ denominaciones: '{"billetes":[50],"monedas":[1]}' }),
    ).toEqual({ billetes: [50], monedas: [1] });
    expect(denominacionesDe({ denominaciones: 'esto no es json' })).toEqual(
      DENOMINACIONES_BASE,
    );
  });

  it('ordena de mayor a menor y tira la basura', () => {
    const r = denominacionesDe({
      denominaciones: { billetes: [20, 500, -5, 'cien', 0], monedas: [1, 10] },
    });
    expect(r.billetes).toEqual([500, 20]);
    expect(r.monedas).toEqual([10, 1]);
  });
});

describe('seConto · `{}` no es `null`', () => {
  it('LA DISTINCIÓN QUE IMPORTA', () => {
    // `{}` es «conté y no había nada». `null` es «no se contó». Confundirlos
    // hace que un cierre sin contar se lea después como una caja vacía.
    expect(seConto({})).toBe(true);
    expect(seConto({ 100: 2 })).toBe(true);
    expect(seConto(null)).toBe(false);
    expect(seConto(undefined)).toBe(false);
  });

  it('un array no es un desglose', () => {
    expect(seConto([])).toBe(false);
  });
});

describe('arqueoDeDesglose', () => {
  it('suma piezas por denominación', () => {
    const r = arqueoDeDesglose({ 1000: 2, 500: 3, 100: 10, 20: 4, 0.5: 6 });
    expect(r.contado).toBe(2000 + 1500 + 1000 + 80 + 3);
    expect(r.piezas).toBe(2 + 3 + 10 + 4 + 6);
    expect(r.conto).toBe(true);
  });

  it('los centavos no arrastran coma flotante', () => {
    // 0.5 x 3 en coma flotante directa es 1.5, pero 0.1 x 3 sería
    // 0.30000000000000004. Se suma en enteros para que nunca aparezca.
    expect(arqueoDeDesglose({ 0.5: 7 }).contado).toBe(3.5);
  });

  it('conté y no había nada: cero, pero CONTADO', () => {
    expect(arqueoDeDesglose({})).toEqual({
      conto: true,
      contado: 0,
      piezas: 0,
    });
  });

  it('no se contó: cero, y lo dice', () => {
    expect(arqueoDeDesglose(null)).toEqual({
      conto: false,
      contado: 0,
      piezas: 0,
    });
  });

  it('media moneda no existe: la basura se ignora, no se arregla', () => {
    const r = arqueoDeDesglose({
      100: 2,
      50: 2.5, // media pieza
      20: -3, // negativas
      abc: 5, // no es denominación
      0: 9, // ni esto
    });
    expect(r.contado).toBe(200);
    expect(r.piezas).toBe(2);
  });
});

describe('arqueoDelTurno', () => {
  it('la diferencia sale de lo CONTADO, no de un número tecleado', () => {
    const r = arqueoDelTurno({
      esperado: 5000,
      desglose: { 1000: 4, 500: 1, 100: 4 },
    });
    expect(r.contado).toBe(4900);
    expect(r.diferencia).toBe(-100);
  });

  it('sobra dinero: la diferencia es positiva', () => {
    expect(
      arqueoDelTurno({ esperado: 1000, desglose: { 500: 3 } }).diferencia,
    ).toBe(500);
  });

  it('LA QUE MÁS IMPORTA: sin contar, la diferencia es null y NO cero', () => {
    // Un cero diría que la caja cuadra, que es justo lo que no se sabe. Es la
    // misma enfermedad que la pantalla del hub afirmando que el nombre
    // resuelve: un dato inventado con cara de dato medido.
    const r = arqueoDelTurno({ esperado: 5000, desglose: null });
    expect(r.conto).toBe(false);
    expect(r.diferencia).toBeNull();
    expect(r.diferencia).not.toBe(0);
  });

  it('contado y vacío SÍ da diferencia: falta todo', () => {
    const r = arqueoDelTurno({ esperado: 5000, desglose: {} });
    expect(r.conto).toBe(true);
    expect(r.diferencia).toBe(-5000);
  });

  it('cuadra exacto', () => {
    expect(
      arqueoDelTurno({
        esperado: 1234.5,
        desglose: { 1000: 1, 200: 1, 20: 1, 10: 1, 2: 2, 0.5: 1 },
      }).diferencia,
    ).toBe(0);
  });

  it('aguanta basura sin inventar dinero', () => {
    expect(arqueoDelTurno().diferencia).toBeNull();
    expect(arqueoDelTurno({ esperado: 'mucho', desglose: {} }).diferencia).toBe(
      0,
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// LA PRUEBA QUE CIERRA EL FALLO DE LAS UNIDADES, EN OTRA COLUMNA
//
// El fallo no fue que la lista estuviera dura: fue que la dura y la que siembra
// la plantilla NO ERAN LA MISMA y nadie las comparaba nunca. Aquí se comparan.
describe('las denominaciones de fábrica y `plantilla_local.sql` coinciden', () => {
  it('la plantilla siembra exactamente la lista canónica', () => {
    const sql = readFileSync('supabase/seed/plantilla_local.sql', 'utf8');
    const objetos = [...sql.matchAll(/'(\{[^}]*\})'::jsonb/g)].map((m) =>
      JSON.parse(m[1]),
    );
    const denominaciones = objetos.find((o) => o && o.billetes);
    expect(denominaciones).toEqual(DENOMINACIONES_BASE);
  });
});
