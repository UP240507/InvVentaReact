// src/lib/arqueo.test.js
import { describe, it, expect } from 'vitest';
import { calcularTotalesTurno } from './arqueo';

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
