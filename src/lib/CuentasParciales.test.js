// Pruebas de las cuentas parciales. Lo que se protege, por orden de gravedad —
// y todo lo de esta lista falla EN SILENCIO si no se sujeta:
//
//   1. Que lo que dice el papel sea lo que se cobra. El folio va en la línea,
//      así que no puede haber dos versiones de «qué lleva la cuenta 3».
//   2. Que pedir otra cerveza no engorde una línea ya facturada. El carrito
//      funde por id; por eso la línea facturada cambia de id.
//   3. Que ninguna línea quede con más unidades enviadas a cocina que
//      unidades. Esa línea no se puede quitar del carrito nunca más.
//   4. Que las unidades no se pierdan ni se dupliquen al partir una línea.

import { describe, it, expect } from 'vitest';
import {
  separarCuenta,
  lineasDeCuenta,
  foliosDelCarrito,
  pendientes,
  quedaPorFacturar,
  normalizarSeleccion,
  haySeleccion,
  repartirEnviadas,
  unidadesElegibles,
  estaFacturada,
  deshacerCuenta,
  trasCobrarCuenta,
  idFacturado,
  CAMPO_FOLIO,
} from './CuentasParciales';

const linea = (over = {}) => ({
  id: 'cerveza',
  nombre: 'Cerveza',
  precio: 45,
  cantidad: 4,
  cantidad_enviada: 0,
  ...over,
});

const FOLIO = 'AZUL7K-V-000012';
const OTRO = 'AZUL7K-V-000013';

const unidades = (carrito) =>
  carrito.reduce((t, l) => t + Number(l.cantidad || 0), 0);
const enviadas = (carrito) =>
  carrito.reduce((t, l) => t + Number(l.cantidad_enviada || 0), 0);

describe('separarCuenta', () => {
  it('parte una línea en la que se factura y la que se queda', () => {
    const carrito = [linea()]; // 4 cervezas
    const { carrito: nuevo, parte } = separarCuenta(
      carrito,
      { cerveza: 2 },
      FOLIO,
    );

    expect(parte).toHaveLength(1);
    expect(parte[0].cantidad).toBe(2);
    expect(parte[0][CAMPO_FOLIO]).toBe(FOLIO);
    expect(nuevo).toHaveLength(2);
    expect(nuevo[1].cantidad).toBe(2);
    expect(estaFacturada(nuevo[1])).toBe(false);
  });

  it('CLAVE: la línea facturada cambia de id', () => {
    // El carrito funde por id al agregar. Sin id nuevo, pedir otra cerveza
    // engordaría la línea ya impresa: el papel diría 2 y se cobrarían 3.
    const { carrito: nuevo } = separarCuenta([linea()], { cerveza: 2 }, FOLIO);
    expect(nuevo[0].id).toBe(idFacturado('cerveza', FOLIO));
    expect(nuevo[0].id).not.toBe(nuevo[1].id);
  });

  it('las unidades no se pierden ni se duplican', () => {
    const carrito = [
      linea({ cantidad: 4 }),
      linea({ id: 'taco', cantidad: 3 }),
    ];
    const { carrito: nuevo } = separarCuenta(
      carrito,
      { cerveza: 1, taco: 3 },
      FOLIO,
    );
    expect(unidades(nuevo)).toBe(unidades(carrito));
  });

  it('si se eligen TODAS las unidades, no queda renglón suelto', () => {
    const { carrito: nuevo, parte } = separarCuenta(
      [linea({ cantidad: 2 })],
      { cerveza: 2 },
      FOLIO,
    );
    expect(nuevo).toHaveLength(1);
    expect(parte[0].cantidad).toBe(2);
    expect(estaFacturada(nuevo[0])).toBe(true);
  });

  it('conserva el sitio de cada renglón', () => {
    // El mesero localiza los renglones por su posición; reordenar es gratis
    // para el código y caro para quien lee la pantalla con prisa.
    const carrito = [
      linea({ id: 'agua', nombre: 'Agua', cantidad: 1 }),
      linea({ id: 'cerveza', nombre: 'Cerveza', cantidad: 2 }),
      linea({ id: 'flan', nombre: 'Flan', cantidad: 1 }),
    ];
    const { carrito: nuevo } = separarCuenta(carrito, { cerveza: 1 }, FOLIO);
    expect(nuevo.map((l) => l.nombre)).toEqual([
      'Agua',
      'Cerveza',
      'Cerveza',
      'Flan',
    ]);
  });

  it('respeta lo que no se eligió', () => {
    const carrito = [linea(), linea({ id: 'taco', cantidad: 3 })];
    const { carrito: nuevo } = separarCuenta(carrito, { cerveza: 1 }, FOLIO);
    const taco = nuevo.find((l) => l.id === 'taco');
    expect(taco).toEqual(carrito[1]);
  });

  it('conserva nota y modificadores en las dos mitades', () => {
    const carrito = [
      linea({ nota: 'sin sal', modificadores: [{ nombre: 'Limón' }] }),
    ];
    const { carrito: nuevo } = separarCuenta(carrito, { cerveza: 1 }, FOLIO);
    for (const l of nuevo) {
      expect(l.nota).toBe('sin sal');
      expect(l.modificadores).toEqual([{ nombre: 'Limón' }]);
    }
  });

  it('sin folio no separa nada', () => {
    const carrito = [linea()];
    expect(separarCuenta(carrito, { cerveza: 2 }, null).carrito).toBe(carrito);
  });

  it('sin selección no separa nada', () => {
    const carrito = [linea()];
    expect(separarCuenta(carrito, {}, FOLIO).parte).toEqual([]);
  });

  it('dos cuentas seguidas en la misma mesa no se pisan', () => {
    const carrito = [linea({ cantidad: 4 })];
    const uno = separarCuenta(carrito, { cerveza: 2 }, FOLIO);
    const dos = separarCuenta(uno.carrito, { cerveza: 1 }, OTRO);

    expect(foliosDelCarrito(dos.carrito)).toEqual([FOLIO, OTRO]);
    expect(lineasDeCuenta(dos.carrito, FOLIO)[0].cantidad).toBe(2);
    expect(lineasDeCuenta(dos.carrito, OTRO)[0].cantidad).toBe(1);
    expect(unidades(dos.carrito)).toBe(4);
  });

  it('una línea ya facturada no se puede volver a facturar', () => {
    const { carrito: nuevo } = separarCuenta([linea()], { cerveza: 4 }, FOLIO);
    const idNuevo = nuevo[0].id;
    const segunda = separarCuenta(nuevo, { [idNuevo]: 2 }, OTRO);
    expect(segunda.parte).toEqual([]);
    expect(foliosDelCarrito(segunda.carrito)).toEqual([FOLIO]);
  });
});

describe('el reparto de lo que ya está en cocina', () => {
  it('CLAVE: ninguna línea acaba con más enviadas que unidades', () => {
    // Es la lección de `repartirPorNota`: una línea así no se puede quitar del
    // carrito nunca más, y no da error.
    const carrito = [linea({ cantidad: 3, cantidad_enviada: 3 })];
    const { carrito: nuevo } = separarCuenta(carrito, { cerveza: 2 }, FOLIO);
    for (const l of nuevo) {
      expect(l.cantidad_enviada).toBeLessThanOrEqual(l.cantidad);
    }
  });

  it('el total de enviadas se conserva: la comida ya salió', () => {
    const carrito = [linea({ cantidad: 4, cantidad_enviada: 3 })];
    const { carrito: nuevo } = separarCuenta(carrito, { cerveza: 2 }, FOLIO);
    expect(enviadas(nuevo)).toBe(3);
  });

  it('las enviadas se quedan en la línea que sigue en la mesa', () => {
    // Si se fueran con la facturada, la parte restante quedaría en cero
    // enviadas y el mesero podría quitar del carrito algo que está en la
    // plancha.
    const carrito = [linea({ cantidad: 4, cantidad_enviada: 2 })];
    const { carrito: nuevo } = separarCuenta(carrito, { cerveza: 2 }, FOLIO);
    const facturada = nuevo.find(estaFacturada);
    const resto = nuevo.find((l) => !estaFacturada(l));
    expect(resto.cantidad_enviada).toBe(2);
    expect(facturada.cantidad_enviada).toBe(0);
  });

  it('repartirEnviadas por su cuenta', () => {
    expect(repartirEnviadas(3, 1)).toEqual({ restante: 1, facturada: 2 });
    expect(repartirEnviadas(0, 2)).toEqual({ restante: 0, facturada: 0 });
    expect(repartirEnviadas(2, 5)).toEqual({ restante: 2, facturada: 0 });
    // Basura entra, cero sale: nunca un número que rompa el tope.
    expect(repartirEnviadas(undefined, 2)).toEqual({
      restante: 0,
      facturada: 0,
    });
  });
});

describe('normalizarSeleccion', () => {
  const carrito = [linea({ cantidad: 4 }), linea({ id: 'taco', cantidad: 2 })];

  it('acota a lo que hay de verdad', () => {
    // Una selección inflada no daría error: daría un papel con más cervezas de
    // las que se pidieron.
    expect(normalizarSeleccion(carrito, { cerveza: 99 })).toEqual({
      cerveza: 4,
    });
  });

  it('ignora ceros, negativos y basura', () => {
    expect(
      normalizarSeleccion(carrito, {
        cerveza: 0,
        taco: -3,
        fantasma: 2,
        otro: 'dos',
      }),
    ).toEqual({});
  });

  it('no ofrece unidades de una línea ya facturada', () => {
    const { carrito: nuevo } = separarCuenta(carrito, { cerveza: 4 }, FOLIO);
    expect(unidadesElegibles(nuevo[0])).toBe(0);
    expect(normalizarSeleccion(nuevo, { [nuevo[0].id]: 2 })).toEqual({});
  });

  it('haySeleccion dice si hay algo real elegido', () => {
    expect(haySeleccion(carrito, { cerveza: 1 })).toBe(true);
    expect(haySeleccion(carrito, { cerveza: 0 })).toBe(false);
    expect(haySeleccion(carrito, {})).toBe(false);
  });
});

describe('el estado de la mesa', () => {
  it('sabe qué queda por facturar', () => {
    const carrito = [linea({ cantidad: 2 })];
    expect(quedaPorFacturar(carrito)).toBe(true);
    const { carrito: nuevo } = separarCuenta(carrito, { cerveza: 2 }, FOLIO);
    expect(quedaPorFacturar(nuevo)).toBe(false);
    expect(pendientes(nuevo)).toEqual([]);
  });

  it('lineasDeCuenta devuelve sólo las de ese folio', () => {
    const carrito = [
      linea({ cantidad: 4 }),
      linea({ id: 'taco', cantidad: 2 }),
    ];
    const uno = separarCuenta(carrito, { cerveza: 2 }, FOLIO);
    const dos = separarCuenta(uno.carrito, { taco: 2 }, OTRO);
    expect(lineasDeCuenta(dos.carrito, FOLIO).map((l) => l.nombre)).toEqual([
      'Cerveza',
    ]);
    expect(lineasDeCuenta(dos.carrito, OTRO).map((l) => l.id)).toEqual([
      idFacturado('taco', OTRO),
    ]);
    expect(lineasDeCuenta(dos.carrito, 'no-existe')).toEqual([]);
  });
});

describe('trasCobrarCuenta', () => {
  it('quita exactamente las líneas de ese folio', () => {
    const carrito = [linea({ cantidad: 4 })];
    const uno = separarCuenta(carrito, { cerveza: 2 }, FOLIO);
    const dos = separarCuenta(uno.carrito, { cerveza: 1 }, OTRO);

    const despues = trasCobrarCuenta(dos.carrito, FOLIO);
    expect(unidades(despues)).toBe(2);
    expect(foliosDelCarrito(despues)).toEqual([OTRO]);
  });

  it('no toca la mesa si el folio no está', () => {
    const carrito = [linea()];
    expect(trasCobrarCuenta(carrito, 'otro-folio')).toEqual(carrito);
  });
});

describe('deshacerCuenta', () => {
  it('devuelve las líneas al carrito común y les repone el id', () => {
    // El caso real: se imprime la cuenta de tres y, antes de pagar, uno se
    // suma a la otra mesa.
    const { carrito: nuevo } = separarCuenta([linea()], { cerveza: 2 }, FOLIO);
    const vuelto = deshacerCuenta(nuevo, FOLIO);
    expect(foliosDelCarrito(vuelto)).toEqual([]);
    expect(vuelto.every((l) => l.id === 'cerveza')).toBe(true);
    expect(unidades(vuelto)).toBe(4);
  });

  it('no refunde los renglones, y es a propósito', () => {
    // Fundirlos exigiría decidir qué pasa con las notas y las enviadas de cada
    // uno. Dos renglones se ven y se entienden; una fusión mal hecha, no.
    const { carrito: nuevo } = separarCuenta([linea()], { cerveza: 2 }, FOLIO);
    expect(deshacerCuenta(nuevo, FOLIO)).toHaveLength(2);
  });

  it('sólo deshace el folio pedido', () => {
    const uno = separarCuenta([linea({ cantidad: 4 })], { cerveza: 2 }, FOLIO);
    const dos = separarCuenta(uno.carrito, { cerveza: 1 }, OTRO);
    expect(foliosDelCarrito(deshacerCuenta(dos.carrito, OTRO))).toEqual([
      FOLIO,
    ]);
  });
});
