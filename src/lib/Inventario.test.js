// src/lib/Inventario.test.js
import { describe, it, expect } from 'vitest';
import {
  construirDeltasStock,
  verificarStock,
  construirItemsComanda,
  formatoCantidad,
} from './Inventario';

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

  // Antes del 06-oct esta prueba decía lo contrario («producto vendido directo
  // descuenta su propio id»). El POS sólo vende recetas, así que ese id nunca
  // era de un producto. Ver la cabecera del bucle en Inventario.js.
  it('una receta sin insumos no descuenta nada', () => {
    expect(construirDeltasStock([{ id: 9, cantidad: 3, insumos: [] }])).toEqual(
      [],
    );
  });

  it('una receta sin insumos NO descuenta el producto que comparte su id', () => {
    // Caso real de AZUL: receta Pizza = id 2, producto Queso Manchego = id 2.
    const d = construirDeltasStock([{ id: 2, cantidad: 1 }]);
    expect(d).toEqual([]);
  });

  it('una línea con modificador y sin insumos no manda su firma como producto', () => {
    // La firma no es un bigint: el servidor revienta con 22P02 y la venta
    // entera se va a dead-letter, junto con el stock de las OTRAS líneas.
    const d = construirDeltasStock([
      { id: '1787::30=302', receta_id: 1787, cantidad: 1, insumos: [] },
      { id: 77, cantidad: 1, insumos: [{ productoId: 501, cantidad: 0.018 }] },
    ]);
    expect(d).toEqual([{ productoId: 501, cantidad: 0.018 }]);
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

// ── El eslabón que estaba roto (13-ago) ─────────────────────────────────────
describe('construirItemsComanda · los modificadores sobreviven hasta cocina', () => {
  it('los pasa al item de la comanda', () => {
    // `construirItemsComanda` arma el item CAMPO A CAMPO —no hace spread—, así
    // que todo dato nuevo del carrito se pierde en silencio si nadie lo nombra.
    // Fue exactamente lo que pasó: se elegían y no llegaban.
    const mods = [{ grupo_id: 1, id_opcion: 11, nombre: 'Término medio' }];
    const [item] = construirItemsComanda(
      [{ id: '1', nombre: 'Hamburguesa', cantidad: 1, modificadores: mods }],
      [],
      {},
    );
    expect(item.modificadores).toEqual(mods);
  });

  it('un item sin modificadores sale con lista vacía, no con undefined', () => {
    // Para que el render de cocina pueda hacer `.length` sin comprobar antes.
    const [item] = construirItemsComanda(
      [{ id: '1', nombre: 'Sopa', cantidad: 1 }],
      [],
      {},
    );
    expect(item.modificadores).toEqual([]);
  });
});

describe('formatoCantidad — el stock en ml y g se lee', () => {
  it('separa miles y pone la unidad', () => {
    expect(formatoCantidad(12500, 'ml')).toBe('12,500 ml');
  });

  it('limpia la basura de coma flotante del descuento optimista', () => {
    expect(formatoCantidad(12500 - 0.1, 'ml')).toBe('12,499.9 ml');
    expect(formatoCantidad(0.1 + 0.2, 'g')).toBe('0.3 g');
  });

  it('sin unidad, sólo la cifra; lo que no es número, 0', () => {
    expect(formatoCantidad(3)).toBe('3');
    expect(formatoCantidad('x', 'pz')).toBe('0 pz');
  });
});
