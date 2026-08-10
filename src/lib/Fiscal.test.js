// src/lib/Fiscal.test.js — TDD del motor fiscal (Sprint 2)
import { describe, it, expect } from 'vitest';
import { calcularVenta, importeDeLinea } from './Fiscal';

describe('calcularVenta · motor fiscal', () => {
  it('MX precio con IVA incluido: $116 → base 100, IVA 16, total 116', () => {
    const r = calcularVenta({ items: [{ precio: 116, cantidad: 1 }] });
    expect(r).toEqual({
      subtotal: 100,
      descuento: 0,
      descuentoTicket: 0,
      descuentoLineas: 0,
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
      descuentoTicket: 0,
      descuentoLineas: 0,
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
    const cero = {
      subtotal: 0,
      descuento: 0,
      descuentoTicket: 0,
      descuentoLineas: 0,
      iva: 0,
      propina: 0,
      total: 0,
    };
    expect(calcularVenta({ items: [] })).toEqual(cero);
    expect(calcularVenta()).toEqual(cero);
  });
});

// ─── DESCUENTO POR PRODUCTO (25-jul) ────────────────────────────────────────
describe('importeDeLinea · descuento por producto', () => {
  it('sin descuento, el neto es el bruto', () => {
    expect(importeDeLinea({ precio: 100, cantidad: 2 })).toEqual({
      bruto: 200,
      descuento: 0,
      neto: 200,
    });
  });

  it('porcentaje sobre el importe de la línea', () => {
    expect(
      importeDeLinea({
        precio: 100,
        cantidad: 2,
        descuento: { tipo: 'pct', valor: 25 },
      }),
    ).toEqual({ bruto: 200, descuento: 50, neto: 150 });
  });

  it('monto fijo', () => {
    expect(
      importeDeLinea({
        precio: 100,
        cantidad: 1,
        descuento: { tipo: 'monto', valor: 30 },
      }),
    ).toEqual({ bruto: 100, descuento: 30, neto: 70 });
  });

  it('cortesía deja la línea en cero', () => {
    expect(
      importeDeLinea({
        precio: 150,
        cantidad: 2,
        descuento: { tipo: 'cortesia' },
      }),
    ).toEqual({ bruto: 300, descuento: 300, neto: 0 });
  });

  it('CAJA: descontar de más NO deja la línea en negativo', () => {
    // Una caja que devuelve dinero por descontar de más es un agujero.
    expect(
      importeDeLinea({
        precio: 150,
        cantidad: 1,
        descuento: { tipo: 'monto', valor: 500 },
      }),
    ).toEqual({ bruto: 150, descuento: 150, neto: 0 });
  });

  it('CAJA: porcentaje fuera de rango se acota a 0–100', () => {
    expect(
      importeDeLinea({
        precio: 100,
        cantidad: 1,
        descuento: { tipo: 'pct', valor: 300 },
      }).neto,
    ).toBe(0);
    expect(
      importeDeLinea({
        precio: 100,
        cantidad: 1,
        descuento: { tipo: 'pct', valor: -50 },
      }).neto,
    ).toBe(100);
  });

  it('tolera descuentos malformados', () => {
    expect(
      importeDeLinea({ precio: 100, cantidad: 1, descuento: {} }).neto,
    ).toBe(100);
    expect(
      importeDeLinea({
        precio: 100,
        cantidad: 1,
        descuento: { tipo: 'monto', valor: 'x' },
      }).neto,
    ).toBe(100);
  });
});

describe('calcularVenta · descuento por producto', () => {
  it('el descuento de línea reduce la base gravable y el IVA', () => {
    const r = calcularVenta({
      items: [
        { precio: 100, cantidad: 1, descuento: { tipo: 'pct', valor: 50 } },
      ],
      preciosIncluyenIva: false,
    });
    expect(r.subtotal).toBe(50);
    expect(r.iva).toBe(8); // 16% de 50, no de 100
    expect(r.total).toBe(58);
    expect(r.descuentoLineas).toBe(50);
  });

  it('una cortesía no aporta nada al total', () => {
    const r = calcularVenta({
      items: [
        { precio: 100, cantidad: 1 },
        { precio: 80, cantidad: 1, descuento: { tipo: 'cortesia' } },
      ],
      preciosIncluyenIva: false,
    });
    expect(r.subtotal).toBe(100);
    expect(r.total).toBe(116);
  });

  it('CASCADA: la línea se descuenta ANTES que el ticket', () => {
    // Línea 100 −50% = 50. Ticket −10% sobre 50 = 45.
    // Si el orden fuera al revés, el 10% se calcularía sobre dinero que el
    // cliente nunca iba a pagar y el total no cuadraría con las líneas.
    const r = calcularVenta({
      items: [
        { precio: 100, cantidad: 1, descuento: { tipo: 'pct', valor: 50 } },
      ],
      preciosIncluyenIva: false,
      descuentoPct: 10,
    });
    expect(r.descuentoLineas).toBe(50);
    expect(r.descuentoTicket).toBe(5); // 10% de 50
    expect(r.subtotal).toBe(45);
    expect(r.total).toBe(52.2);
  });

  it('precio CON IVA incluido: el descuento se convierte a base igual', () => {
    // $232 con IVA = base 200. Cortesía de una de las dos líneas → base 100.
    const r = calcularVenta({
      items: [
        { precio: 116, cantidad: 1 },
        { precio: 116, cantidad: 1, descuento: { tipo: 'cortesia' } },
      ],
    });
    expect(r.subtotal).toBe(100);
    expect(r.iva).toBe(16);
    expect(r.total).toBe(116);
    expect(r.descuentoLineas).toBe(100);
  });

  it('la propina se calcula sobre la base YA descontada', () => {
    const r = calcularVenta({
      items: [
        { precio: 100, cantidad: 1, descuento: { tipo: 'pct', valor: 50 } },
      ],
      preciosIncluyenIva: false,
      propinaPct: 10,
    });
    expect(r.propina).toBe(5); // 10% de 50, no de 100
  });

  it('reconciliación al centavo con descuentos mixtos', () => {
    const r = calcularVenta({
      items: [
        { precio: 33.33, cantidad: 3, descuento: { tipo: 'pct', valor: 17 } },
        {
          precio: 89.9,
          cantidad: 2,
          descuento: { tipo: 'monto', valor: 15.5 },
        },
        { precio: 45, cantidad: 1, descuento: { tipo: 'cortesia' } },
        { precio: 12.5, cantidad: 4 },
      ],
      descuentoPct: 7,
      propinaPct: 15,
    });
    expect(round(r.subtotal + r.iva + r.propina)).toBe(r.total);
    expect(r.total).toBeGreaterThan(0);
  });

  it('todo cortesía → total en cero, sin negativos', () => {
    const r = calcularVenta({
      items: [
        { precio: 100, cantidad: 2, descuento: { tipo: 'cortesia' } },
        { precio: 50, cantidad: 1, descuento: { tipo: 'cortesia' } },
      ],
      descuentoPct: 20,
      propinaPct: 10,
    });
    expect(r.subtotal).toBe(0);
    expect(r.iva).toBe(0);
    expect(r.propina).toBe(0);
    expect(r.total).toBe(0);
  });
});

const round = (n) => Math.round(n * 100) / 100;
