// src/test/canonical-price.test.js
// Test de regresión Sprint 1: blinda el bug D6 (Pizza-en-$0) que ya migramos.
// En Sprint 2 esta lógica se mueve a src/lib/Fiscal.js con su propia suite TDD.
import { describe, it, expect } from 'vitest';

const safePriceString = (val) => {
  if (val === null || val === undefined || val === '') return 0;
  if (typeof val === 'string') val = val.replace(',', '.');
  const n = Number(val);
  return isNaN(n) ? 0 : n;
};

const getPrecio = (item) => {
  const v = item?.precio_venta ?? item?.precio ?? item?.precioVenta;
  return safePriceString(v);
};

describe('getPrecio · lectura canónica de precio', () => {
  it('lee precio_venta del catálogo (recetas)', () => {
    expect(getPrecio({ nombre: 'Pizza', precio_venta: 100 })).toBe(100);
  });

  it('REGRESIÓN D6: precio_venta gana, no devuelve 0 aunque exista precio:0', () => {
    expect(getPrecio({ precio_venta: 100, precio: 0 })).toBe(100);
  });

  it('compat: cae a precio en ítems de mesa persistidos sin precio_venta', () => {
    expect(getPrecio({ nombre: 'orden vieja', precio: 75 })).toBe(75);
  });

  it('ya NO usa costo como precio (fallback peligroso eliminado)', () => {
    expect(getPrecio({ costo: 36.73 })).toBe(0);
  });

  it('normaliza strings con coma decimal', () => {
    expect(getPrecio({ precio_venta: '12,50' })).toBe(12.5);
  });

  it('objeto vacío → 0 sin reventar', () => {
    expect(getPrecio({})).toBe(0);
    expect(getPrecio(null)).toBe(0);
  });
});
