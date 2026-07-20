// src/lib/Fiscal.test.js — TDD del motor fiscal (Sprint 2)
import { describe, it, expect } from 'vitest';
import { calcularVenta } from './fiscal';

describe('calcularVenta · motor fiscal', () => {
  it('MX precio con IVA incluido: $116 → base 100, IVA 16, total 116', () => {
    const r = calcularVenta({ items: [{ precio: 116, cantidad: 1 }] });
    expect(r).toEqual({
      subtotal: 100,
      descuento: 0,
      iva: 16,
      propina: 0,
      total: 116,
    });
  });

  it('precio SIN IVA: $100 → base 100, IVA 16 encima, total 116', () => {
    const r = calcularVenta({
      items: [{ precio: 100, cantidad: 1 }],
      preciosIncluyenIva: false,
    });
    expect(r).toEqual({
      subtotal: 100,
      descuento: 0,
      iva: 16,
      propina: 0,
      total: 116,
    });
  });

  it('REGRESIÓN D4: la propina NO se grava (IVA queda en 16, no 18.76)', () => {
    const r = calcularVenta({
      items: [{ precio: 100, cantidad: 1 }],
      preciosIncluyenIva: false,
      propinaPct: 20,
    });
    expect(r.subtotal).toBe(100);
    expect(r.iva).toBe(16); // ← antes el bug daba 18.76
    expect(r.propina).toBe(20);
    expect(r.total).toBe(136);
  });

  it('propina como monto fijo override del %', () => {
    const r = calcularVenta({
      items: [{ precio: 100, cantidad: 1 }],
      preciosIncluyenIva: false,
      propinaPct: 20,
      propinaMonto: 35,
    });
    expect(r.propina).toBe(35);
    expect(r.total).toBe(151);
  });

  it('descuento reduce la base y recalcula IVA', () => {
    const r = calcularVenta({
      items: [{ precio: 100, cantidad: 1 }],
      preciosIncluyenIva: false,
      descuentoPct: 10,
    });
    expect(r.descuento).toBe(10);
    expect(r.subtotal).toBe(90);
    expect(r.iva).toBe(14.4);
    expect(r.total).toBe(104.4);
  });

  it('IVA 0% (exento / otro país)', () => {
    const r = calcularVenta({
      items: [{ precio: 100, cantidad: 2 }],
      ivaRate: 0,
      preciosIncluyenIva: false,
    });
    expect(r.iva).toBe(0);
    expect(r.subtotal).toBe(200);
    expect(r.total).toBe(200);
  });

  it('varias líneas con cantidades', () => {
    const r = calcularVenta({
      items: [
        { precio: 50, cantidad: 2 }, // 100
        { precio: 30, cantidad: 3 }, // 90
      ],
      preciosIncluyenIva: false,
    });
    expect(r.subtotal).toBe(190);
    expect(r.iva).toBe(30.4);
    expect(r.total).toBe(220.4);
  });

  it('reconciliación al centavo: subtotal + iva + propina === total', () => {
    const r = calcularVenta({
      items: [{ precio: 33.33, cantidad: 3 }],
      preciosIncluyenIva: false,
      propinaPct: 15,
    });
    expect(round(r.subtotal + r.iva + r.propina)).toBe(r.total);
  });

  it('carrito vacío → todo en cero, sin reventar', () => {
    expect(calcularVenta({ items: [] })).toEqual({
      subtotal: 0,
      descuento: 0,
      iva: 0,
      propina: 0,
      total: 0,
    });
    expect(calcularVenta()).toEqual({
      subtotal: 0,
      descuento: 0,
      iva: 0,
      propina: 0,
      total: 0,
    });
  });
});

const round = (n) => Math.round(n * 100) / 100;
