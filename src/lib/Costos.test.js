// src/lib/Costos.test.js
//
// LA AFIRMACIÓN: **el costo promedio ponderado es una media por UNIDADES, y
// una recepción nunca deja el costo de un insumo en un número inventado.**
//
// Importa más que otras pruebas por una razón: este número no se corrige solo.
// Un stock mal puesto lo arregla un conteo; un costo mal promediado se queda y
// se diluye durante meses, contaminando el costo de cada platillo que lleve el
// insumo. En AZUL no hay conteo físico, así que nada lo endereza nunca.
import { describe, it, expect } from 'vitest';
import { recepcionDeLinea, aplicarRecepcion, decimalesDeCosto } from './Costos';

describe('recepcionDeLinea · el promedio ponderado', () => {
  it('LA AFIRMACIÓN: pondera por unidades, no por dinero', () => {
    // 100 kg a $10 y 1 kg a $1000. La media aritmética de los PRECIOS diría
    // $505; la ponderada por unidades dice $19.80. Confundirlas multiplicaría
    // por 25 el costo de todo lo que lleve este insumo.
    const r = recepcionDeLinea({
      stockAnterior: 100,
      costoAnterior: 10,
      cantidadRecibida: 1,
      costoRecibido: 1000,
    });
    expect(r.stock).toBe(101);
    // 2000 / 101 exacto, a seis decimales (desde el 06-oct el costo no se
    // redondea a centavos; ver `aCosto` en Costos.js). Se ensena $19.80.
    expect(r.costo).toBe(19.80198);
  });

  it('el caso de todos los días: 30 kg a $20 sobre 10 kg a $14', () => {
    const r = recepcionDeLinea({
      stockAnterior: 10,
      costoAnterior: 14,
      cantidadRecibida: 30,
      costoRecibido: 20,
    });
    expect(r.stock).toBe(40);
    expect(r.costo).toBe(18.5); // (140 + 600) / 40
  });

  it('con el almacén en cero, el costo pasa a ser el de la entrada', () => {
    const r = recepcionDeLinea({
      stockAnterior: 0,
      costoAnterior: 14,
      cantidadRecibida: 30,
      costoRecibido: 20,
    });
    expect(r.stock).toBe(30);
    expect(r.costo).toBe(20);
  });

  it('recibir CERO no mueve el costo', () => {
    const r = recepcionDeLinea({
      stockAnterior: 10,
      costoAnterior: 14,
      cantidadRecibida: 0,
      costoRecibido: 999,
    });
    expect(r.stock).toBe(10);
    expect(r.costo).toBe(14);
  });

  it('sin existencias despues de la entrada no se inventa un costo', () => {
    // Todo en cero: la division seria por cero. Se conserva el costo que habia.
    const r = recepcionDeLinea({
      stockAnterior: 0,
      costoAnterior: 14,
      cantidadRecibida: 0,
      costoRecibido: 20,
    });
    expect(r.stock).toBe(0);
    expect(r.costo).toBe(14);
    expect(Number.isFinite(r.costo)).toBe(true);
  });

  it('el precio derivado de un empaque llega con sus decimales y NO se redondea a centavos', () => {
    // `Empaques.derivarLinea` NO redondea el precio unitario a proposito: una
    // arpilla de 30 kg a $100 da 3.3333... Hasta el 06-oct este promedio SI
    // se redondeaba a centavos (3.33). Desde que las unidades son g, ml y pz
    // el costo por unidad baja de un centavo y ese redondeo lo deformaba: se
    // guarda con seis decimales y se ensena redondeado.
    const r = recepcionDeLinea({
      stockAnterior: 0,
      costoAnterior: 0,
      cantidadRecibida: 30,
      costoRecibido: 100 / 30,
    });
    expect(r.costo).toBe(3.333333);
  });

  it('EN ML: leche a $25 el litro queda a 0.025 por ml, no a 0.03', () => {
    const r = recepcionDeLinea({
      stockAnterior: 0,
      costoAnterior: 0,
      cantidadRecibida: 1000,
      costoRecibido: 0.025,
    });
    expect(r.costo).toBe(0.025);
  });

  it('EN ML: un insumo de $4 el litro no se queda en costo cero', () => {
    const r = recepcionDeLinea({
      stockAnterior: 0,
      costoAnterior: 0,
      cantidadRecibida: 1000,
      costoRecibido: 0.004,
    });
    expect(r.costo).toBe(0.004);
  });

  it('EN ML: el promedio de dos compras conserva sus decimales', () => {
    // 1000 ml a 0.025 + 1000 ml a 0.03 = 0.0275
    const r = recepcionDeLinea({
      stockAnterior: 1000,
      costoAnterior: 0.025,
      cantidadRecibida: 1000,
      costoRecibido: 0.03,
    });
    expect(r.costo).toBe(0.0275);
  });

  it('con el almacen en NEGATIVO, el costo es el de la entrada', () => {
    // Sin conteo fisico, lo que mas se vende vive en negativo. Antes:
    // (-500 x 0.03 + 1000 x 0.025) / 500 = 0.02, mas barato que las dos
    // compras. Lo que no esta fisicamente no aporta costo.
    const r = recepcionDeLinea({
      stockAnterior: -500,
      costoAnterior: 0.03,
      cantidadRecibida: 1000,
      costoRecibido: 0.025,
    });
    expect(r.stock).toBe(500);
    expect(r.costo).toBe(0.025);
  });

  it('el stock se queda en tres decimales, como lo escribe la pantalla', () => {
    const r = recepcionDeLinea({
      stockAnterior: 0.1,
      costoAnterior: 10,
      cantidadRecibida: 0.2,
      costoRecibido: 10,
    });
    expect(r.stock).toBe(0.3); // 0.1 + 0.2 en coma flotante da 0.30000000000000004
  });

  it('DECISION HEREDADA: un costo recibido de CERO no abarata, cae al anterior', () => {
    // Era el `||` de la pantalla. Una muestra regalada del proveedor NO baja
    // el promedio. Queda afirmado para que cambiarlo sea una decision y no un
    // accidente.
    const r = recepcionDeLinea({
      stockAnterior: 10,
      costoAnterior: 14,
      cantidadRecibida: 10,
      costoRecibido: 0,
    });
    expect(r.costo).toBe(14);
  });

  it('un costo ausente tampoco inventa: cae al anterior', () => {
    for (const ausente of [null, undefined, NaN, '']) {
      const r = recepcionDeLinea({
        stockAnterior: 10,
        costoAnterior: 14,
        cantidadRecibida: 10,
        costoRecibido: ausente,
      });
      expect(r.costo).toBe(14);
    }
  });

  it('sin argumentos no revienta', () => {
    expect(recepcionDeLinea()).toEqual({ stock: 0, costo: 0 });
  });
});

describe('aplicarRecepcion · la orden completa', () => {
  const PRODUCTOS = [
    { id: 10, nombre: 'Naranja', stock: 10, precio: 14 },
    { id: 20, nombre: 'Queso', stock: 5, precio: 100 },
  ];

  it('no muta la lista original', () => {
    const { productos } = aplicarRecepcion(PRODUCTOS, [
      { id_producto: 10, cantidad: 30, precio_unitario: 20 },
    ]);
    expect(PRODUCTOS[0].stock).toBe(10);
    expect(PRODUCTOS[0].precio).toBe(14);
    expect(productos[0].stock).toBe(40);
    expect(productos[0].precio).toBe(18.5);
  });

  it('toca solo los insumos de la orden', () => {
    const { productos } = aplicarRecepcion(PRODUCTOS, [
      { id_producto: 10, cantidad: 30, precio_unitario: 20 },
    ]);
    expect(productos[1]).toEqual(PRODUCTOS[1]);
  });

  it('devuelve el stock ANTERIOR de cada linea, para el kardex', () => {
    // El movimiento tiene que decir de donde venia. Si quien llama lo volviera
    // a leer del producto YA actualizado, el kardex diria que no entro nada.
    const { aplicadas } = aplicarRecepcion(PRODUCTOS, [
      { id_producto: 10, cantidad: 30, precio_unitario: 20 },
    ]);
    expect(aplicadas[0].stockAnterior).toBe(10);
    expect(aplicadas[0].stockNuevo).toBe(40);
  });

  it('un insumo que ya no esta en el catalogo NO se pierde en silencio', () => {
    const { ignoradas, productos } = aplicarRecepcion(PRODUCTOS, [
      { id_producto: 999, cantidad: 5, precio_unitario: 3 },
    ]);
    expect(ignoradas).toHaveLength(1);
    expect(productos).toEqual(PRODUCTOS);
  });

  it('dos lineas del MISMO insumo se promedian una tras otra', () => {
    // 10 a $14, entra 30 a $20 -> 40 a $18.50; entra 10 mas a $30 -> 50 a $20.80
    const { productos } = aplicarRecepcion(PRODUCTOS, [
      { id_producto: 10, cantidad: 30, precio_unitario: 20 },
      { id_producto: 10, cantidad: 10, precio_unitario: 30 },
    ]);
    expect(productos[0].stock).toBe(50);
    expect(productos[0].precio).toBe(20.8);
  });
});

describe('decimalesDeCosto', () => {
  it('cuatro decimales por debajo de un peso, dos por encima', () => {
    expect(decimalesDeCosto(0.025)).toBe(4);
    expect(decimalesDeCosto(25)).toBe(2);
    expect(decimalesDeCosto(0)).toBe(2);
  });
});
