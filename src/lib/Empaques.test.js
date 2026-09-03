// src/lib/Empaques.test.js
//
// La afirmación que importa, y es una sola: **lo derivado suma exactamente lo
// que se pagó.** Si el papel dice «2 arpillas, $1,800», la línea vale $1,800.
// Lo demás son detalles; esto es lo que entra al costo promedio ponderado, que
// no olvida y que nadie corrige después porque en AZUL no hay conteo físico.
import { describe, it, expect } from 'vitest';
import {
  empaquesDe,
  describirEmpaque,
  derivarLinea,
  lineaSinEmpaque,
} from './Empaques';

const round2 = (n) => Math.round(n * 100) / 100;

describe('derivarLinea · el caso de la naranja', () => {
  it('EL CASO: 1 arpilla de 30 kg a $900', () => {
    const l = derivarLinea({ factor: 30, empaques: 1, precioPorEmpaque: 900 });
    expect(l.cantidad).toBe(30);
    expect(l.total).toBe(900);
    expect(l.precio_unitario).toBe(30); // 900 / 30, la división que ya no se hace a mano
  });

  it('el precio unitario NO se redondea a centavos', () => {
    // $100 la arpilla de 30 kg son 3.333… por kg. Redondear a 3.33 haría que la
    // línea valiera 99.90 en vez de 100: diez centavos que se van al costo
    // promedio ponderado de todos los platillos que lleven naranja.
    const l = derivarLinea({ factor: 30, empaques: 1, precioPorEmpaque: 100 });
    expect(l.total).toBe(100);
    expect(round2(l.cantidad * l.precio_unitario)).toBe(100);
    expect(l.precio_unitario).not.toBe(3.33);
    expect(l.precio_unitario).toBeCloseTo(3.3333, 4);
  });

  it('LA AFIRMACIÓN, en un barrido: cantidad × unitario siempre suma el total', () => {
    // Los factores feos a propósito: 3 y 7 no dividen bien casi nada, y 0.5 y
    // 12.5 meten decimales en la cantidad.
    for (const factor of [1, 3, 7, 12, 30, 360, 0.5, 12.5, 2.75]) {
      for (let n = 1; n <= 5; n++) {
        for (let centavos = 1; centavos <= 250000; centavos += 3719) {
          const precioPorEmpaque = centavos / 100;
          const l = derivarLinea({ factor, empaques: n, precioPorEmpaque });
          expect(
            round2(l.cantidad * l.precio_unitario),
            `${n} x ${factor} a ${precioPorEmpaque}`,
          ).toBe(l.total);
          expect(l.total).toBe(round2(n * precioPorEmpaque));
        }
      }
    }
  });

  it('la cantidad no arrastra la basura de la coma flotante', () => {
    // 3 * 0.1 en coma flotante es 0.30000000000000004, y eso se iría al stock.
    const l = derivarLinea({ factor: 0.1, empaques: 3, precioPorEmpaque: 10 });
    expect(l.cantidad).toBe(0.3);
  });

  it('varios empaques: 12 cajas de 360 piezas', () => {
    const l = derivarLinea({
      factor: 360,
      empaques: 12,
      precioPorEmpaque: 720,
    });
    expect(l.cantidad).toBe(4320);
    expect(l.total).toBe(8640);
    expect(l.precio_unitario).toBe(2);
  });

  it('un factor no positivo NO se arregla con un 1 por defecto', () => {
    // Poner 1 inventaría una equivalencia -"esta arpilla trae un kilo"- y ese
    // número entraría al costo sin que nadie lo notara. Línea vacía y que la
    // pantalla lo diga.
    expect(
      derivarLinea({ factor: 0, empaques: 2, precioPorEmpaque: 900 }),
    ).toEqual({
      cantidad: 0,
      precio_unitario: 0,
      total: 0,
    });
    expect(
      derivarLinea({ factor: -30, empaques: 2, precioPorEmpaque: 900 })
        .cantidad,
    ).toBe(0);
  });

  it('aguanta basura sin inventar dinero', () => {
    const vacia = { cantidad: 0, precio_unitario: 0, total: 0 };
    expect(derivarLinea()).toEqual(vacia);
    expect(derivarLinea({})).toEqual(vacia);
    expect(
      derivarLinea({ factor: 30, empaques: 0, precioPorEmpaque: 900 }),
    ).toEqual(vacia);
    expect(
      derivarLinea({ factor: 'treinta', empaques: 1, precioPorEmpaque: 900 }),
    ).toEqual(vacia);
    expect(
      derivarLinea({ factor: 30, empaques: 1, precioPorEmpaque: -5 }),
    ).toEqual(vacia);
  });

  it('un empaque gratis es válido: cuesta 0 y trae 30 kg', () => {
    // Muestras y bonificaciones existen. Cero no es basura.
    const l = derivarLinea({ factor: 30, empaques: 1, precioPorEmpaque: 0 });
    expect(l).toEqual({ cantidad: 30, precio_unitario: 0, total: 0 });
  });
});

describe('lineaSinEmpaque · la misma calculadora para el caso de siempre', () => {
  it('un insumo sin empaques registrados se teclea como toda la vida', () => {
    expect(lineaSinEmpaque({ cantidad: 5, precioUnitario: 20 })).toEqual({
      cantidad: 5,
      precio_unitario: 20,
      total: 100,
    });
  });

  it('el total va a centavos', () => {
    expect(lineaSinEmpaque({ cantidad: 3, precioUnitario: 3.333 }).total).toBe(
      10,
    );
  });

  it('basura da línea vacía', () => {
    expect(lineaSinEmpaque({ cantidad: 0, precioUnitario: 20 }).total).toBe(0);
    expect(lineaSinEmpaque()).toEqual({
      cantidad: 0,
      precio_unitario: 0,
      total: 0,
    });
  });
});

describe('empaquesDe', () => {
  const FILAS = [
    {
      id: 1,
      proveedor_id: 1,
      producto_id: 10,
      nombre: 'arpilla',
      factor: 30,
      activo: true,
    },
    {
      id: 2,
      proveedor_id: 1,
      producto_id: 10,
      nombre: 'kilo',
      factor: 1,
      activo: true,
    },
    {
      id: 3,
      proveedor_id: 2,
      producto_id: 10,
      nombre: 'reja',
      factor: 20,
      activo: true,
    },
    {
      id: 4,
      proveedor_id: 1,
      producto_id: 99,
      nombre: 'caja',
      factor: 12,
      activo: true,
    },
    {
      id: 5,
      proveedor_id: 1,
      producto_id: 10,
      nombre: 'costal viejo',
      factor: 50,
      activo: false,
    },
  ];

  it('sólo los de esta pareja proveedor–producto', () => {
    const r = empaquesDe(FILAS, { proveedorId: 1, productoId: 10 });
    expect(r.map((e) => e.nombre)).toEqual(['kilo', 'arpilla']);
  });

  it('EL PORQUÉ DE LA TABLA: otro proveedor empaca distinto', () => {
    // La misma naranja: arpilla de 30 en uno, reja de 20 en el otro. Colgar el
    // empaque del producto habría obligado a elegir uno de los dos.
    expect(
      empaquesDe(FILAS, { proveedorId: 2, productoId: 10 })[0].factor,
    ).toBe(20);
  });

  it('ordena de menor a mayor factor: primero lo suelto', () => {
    expect(
      empaquesDe(FILAS, { proveedorId: 1, productoId: 10 }).map(
        (e) => e.factor,
      ),
    ).toEqual([1, 30]);
  });

  it('los apagados no salen', () => {
    expect(
      empaquesDe(FILAS, { proveedorId: 1, productoId: 10 }).map(
        (e) => e.nombre,
      ),
    ).not.toContain('costal viejo');
  });

  it('sin pareja, sin lista: no se adivina', () => {
    expect(empaquesDe(FILAS, { proveedorId: null, productoId: 10 })).toEqual(
      [],
    );
    expect(empaquesDe(FILAS, {})).toEqual([]);
    expect(empaquesDe(null, { proveedorId: 1, productoId: 10 })).toEqual([]);
  });

  it('los ids se comparan en texto, como en el resto del proyecto', () => {
    expect(
      empaquesDe(FILAS, { proveedorId: '1', productoId: '10' }),
    ).toHaveLength(2);
  });

  it('una fila con factor 0 no se ofrece', () => {
    expect(
      empaquesDe(
        [{ proveedor_id: 1, producto_id: 10, nombre: 'x', factor: 0 }],
        {
          proveedorId: 1,
          productoId: 10,
        },
      ),
    ).toEqual([]);
  });
});

describe('describirEmpaque', () => {
  it('la unidad va siempre: «30» a secas es el error que esto evita', () => {
    expect(describirEmpaque({ nombre: 'arpilla', factor: 30 }, 'kg')).toBe(
      'arpilla (30 kg)',
    );
  });

  it('sin unidad, al menos el número', () => {
    expect(describirEmpaque({ nombre: 'caja', factor: 12 })).toBe('caja (12)');
  });

  it('sin empaque, cadena vacía', () => {
    expect(describirEmpaque(null, 'kg')).toBe('');
  });
});
