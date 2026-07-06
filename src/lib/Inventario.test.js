// src/lib/inventario.test.js
import { describe, it, expect } from 'vitest';
import { construirDeltasStock, verificarStock } from './inventario';

describe('construirDeltasStock · expansión de inventario', () => {
  it('expande una receta a sus insumos por cantidad vendida', () => {
    const items = [
      {
        id: 3,
        cantidad: 2,
        insumos: [
          { productoId: 1, cantidad: 0.998 },
          { productoId: 5, cantidad: 1 },
          { productoId: 2, cantidad: 0.1 },
        ],
      },
    ];
    expect(construirDeltasStock(items)).toEqual([
      { productoId: 1, cantidad: 1.996 },
      { productoId: 5, cantidad: 2 },
      { productoId: 2, cantidad: 0.2 },
    ]);
  });

  it('acumula el mismo insumo entre varios platillos', () => {
    const items = [
      { id: 2, cantidad: 1, insumos: [{ productoId: 1, cantidad: 3 }] },
      { id: 3, cantidad: 2, insumos: [{ productoId: 1, cantidad: 0.5 }] },
    ];
    expect(construirDeltasStock(items)).toEqual([
      { productoId: 1, cantidad: 4 },
    ]);
  });

  it('producto vendido directo (sin insumos) descuenta su propio id', () => {
    expect(construirDeltasStock([{ id: 9, cantidad: 3, insumos: [] }])).toEqual(
      [{ productoId: 9, cantidad: 3 }],
    );
  });

  it('soporta llave legacy id_producto', () => {
    expect(
      construirDeltasStock([
        { id: 1, cantidad: 1, insumos: [{ id_producto: 7, cantidad: 0.25 }] },
      ]),
    ).toEqual([{ productoId: 7, cantidad: 0.25 }]);
  });

  it('ignora cantidades cero o negativas', () => {
    expect(construirDeltasStock([{ id: 1, cantidad: 0, insumos: [] }])).toEqual(
      [],
    );
    expect(construirDeltasStock([])).toEqual([]);
  });

  it('aplica sustitución: canjea producto 1 por producto 8', () => {
    const items = [
      {
        id: 2,
        cantidad: 1,
        insumos: [
          { productoId: 1, cantidad: 3 },
          { productoId: 2, cantidad: 1 },
        ],
      },
    ];
    const d = construirDeltasStock(items, { 1: 8 });
    expect(d).toEqual([
      { productoId: 8, cantidad: 3 },
      { productoId: 2, cantidad: 1 },
    ]);
  });

  it('sustitución que colisiona con otro insumo se acumula', () => {
    const items = [
      {
        id: 2,
        cantidad: 1,
        insumos: [
          { productoId: 1, cantidad: 3 },
          { productoId: 2, cantidad: 1 },
        ],
      },
    ];
    const d = construirDeltasStock(items, { 1: 2 }); // 1 → 2, se suma con el 2 existente
    expect(d).toEqual([{ productoId: 2, cantidad: 4 }]);
  });
});

describe('verificarStock · gate antes de cobrar', () => {
  const productos = [
    { id: 1, nombre: 'Carne', unidad: 'kg', stock: 1, min: 0.5 },
    { id: 2, nombre: 'Queso', unidad: 'kg', stock: 10, min: 1 },
    { id: 5, nombre: 'Pan', unidad: 'pza', stock: 0, min: 2 },
  ];

  it('marca agotado cuando quedaría en negativo', () => {
    const items = [
      { id: 3, cantidad: 1, insumos: [{ productoId: 5, cantidad: 1 }] },
    ];
    const p = verificarStock(items, productos);
    expect(p).toHaveLength(1);
    expect(p[0]).toMatchObject({
      productoId: 5,
      severidad: 'agotado',
      resultante: -1,
    });
  });

  it('marca bajo_minimo cuando cae bajo el mínimo sin agotarse', () => {
    const items = [
      { id: 3, cantidad: 1, insumos: [{ productoId: 1, cantidad: 0.7 }] },
    ]; // 1 - 0.7 = 0.3 < min 0.5
    const p = verificarStock(items, productos);
    expect(p).toHaveLength(1);
    expect(p[0]).toMatchObject({
      productoId: 1,
      severidad: 'bajo_minimo',
      resultante: 0.3,
    });
  });

  it('sin problemas cuando hay stock de sobra', () => {
    const items = [
      { id: 2, cantidad: 1, insumos: [{ productoId: 2, cantidad: 1 }] },
    ];
    expect(verificarStock(items, productos)).toEqual([]);
  });

  it('la sustitución resuelve el faltante', () => {
    const items = [
      { id: 3, cantidad: 1, insumos: [{ productoId: 5, cantidad: 1 }] },
    ]; // pan agotado
    const p = verificarStock(items, productos, { 5: 2 }); // sustituir pan por queso (hay 10)
    expect(p).toEqual([]);
  });

  it('producto no rastreado no bloquea', () => {
    const items = [
      { id: 99, cantidad: 1, insumos: [{ productoId: 777, cantidad: 5 }] },
    ];
    expect(verificarStock(items, productos)).toEqual([]);
  });
});
