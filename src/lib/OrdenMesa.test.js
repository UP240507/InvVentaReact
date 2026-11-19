import { describe, it, expect } from 'vitest';
import {
  fusionarConGuardado,
  aplicarDescuentoEnLineas,
  quitarDescuentoEnLineas,
  idDeParte,
} from './OrdenMesa';

const linea = (id, cantidad, cantidad_enviada, extra = {}) => ({
  id,
  nombre: `L${id}`,
  precio: 40,
  cantidad,
  cantidad_enviada,
  ...extra,
});
const CORTESIA = { tipo: 'cortesia', valor: 100, autorizadoPor: 'Sairi' };

describe('fusionarConGuardado · lo no mandado sobrevive a que la mesa cambie', () => {
  it('una línea agregada aquí y sin mandar se queda', () => {
    const guardados = [linea(1, 2, 2)];
    const locales = [linea(1, 2, 2), linea(9, 1, 0)];
    const r = fusionarConGuardado(guardados, locales);
    expect(r.map((x) => x.id)).toEqual([1, 9]);
    expect(r[1].cantidad).toBe(1);
  });

  it('lo guardado manda en lo que ya existe: trae la cortesía de otro aparato', () => {
    const guardados = [linea(1, 2, 2, { descuento: CORTESIA })];
    const locales = [linea(1, 2, 2)];
    expect(fusionarConGuardado(guardados, locales)[0].descuento).toEqual(
      CORTESIA,
    );
  });

  it('unidades de más sin mandar sobre una línea ya enviada se conservan', () => {
    const guardados = [linea(1, 2, 2)];
    const locales = [linea(1, 3, 2)]; // una más, sin mandar
    expect(fusionarConGuardado(guardados, locales)[0].cantidad).toBe(3);
  });

  it('justo después de mandar a producción no se duplica nada', () => {
    // Lo guardado ya trae las 3 enviadas; la pantalla todavía dice 3 con 1.
    const guardados = [linea(1, 3, 3)];
    const locales = [linea(1, 3, 1)];
    expect(fusionarConGuardado(guardados, locales)[0].cantidad).toBe(3);
  });

  it('si otro aparato traspasó unidades ya enviadas, no se resucitan', () => {
    const guardados = [linea(1, 1, 1)];
    const locales = [linea(1, 2, 2)];
    expect(fusionarConGuardado(guardados, locales)[0].cantidad).toBe(1);
  });

  it('una línea ya enviada que lo guardado no trae, se va: otro la movió', () => {
    const r = fusionarConGuardado([], [linea(1, 1, 1)]);
    expect(r).toEqual([]);
  });

  it('una línea que sólo está guardada entra: la agregó otro aparato', () => {
    const r = fusionarConGuardado([linea(5, 1, 1)], []);
    expect(r).toHaveLength(1);
  });

  it('sin nada en pantalla, es lo guardado', () => {
    const guardados = [linea(1, 2, 2)];
    expect(fusionarConGuardado(guardados, [])).toEqual(guardados);
  });
});

describe('aplicarDescuentoEnLineas · la cortesía por unidad parte la línea', () => {
  it('a todas las unidades: el descuento va en la línea, sin partir', () => {
    const r = aplicarDescuentoEnLineas([linea(4, 2, 2)], 4, CORTESIA, 2, 'p');
    expect(r).toHaveLength(1);
    expect(r[0].descuento).toEqual(CORTESIA);
  });

  it('a 1 de 2: dos líneas, una de cada, y lo enviado se reparte', () => {
    const r = aplicarDescuentoEnLineas(
      [linea(4, 2, 2)],
      4,
      CORTESIA,
      1,
      '4::desc-x',
    );
    expect(r).toHaveLength(2);
    const [resto, parte] = r;
    expect(resto).toMatchObject({ id: 4, cantidad: 1, cantidad_enviada: 1 });
    expect(resto.descuento).toBeUndefined();
    expect(parte).toMatchObject({
      id: '4::desc-x',
      cantidad: 1,
      cantidad_enviada: 1,
      descuento: CORTESIA,
      receta_id: 4,
    });
    // El total enviado no cambia: no se manda nada otra vez a cocina.
    expect(r.reduce((n, x) => n + x.cantidad_enviada, 0)).toBe(2);
  });

  it('la parte con descuento se queda con lo ya enviado primero', () => {
    // 3 jugos, 1 enviado; cortesía a 2: la cortesía lleva el enviado.
    const [resto, parte] = aplicarDescuentoEnLineas(
      [linea(4, 3, 1)],
      4,
      CORTESIA,
      2,
      'p',
    );
    expect(parte.cantidad_enviada).toBe(1);
    expect(resto.cantidad_enviada).toBe(0);
  });

  it('conserva el receta_id que ya tuviera la línea', () => {
    const [, parte] = aplicarDescuentoEnLineas(
      [linea('72::mods', 2, 2, { receta_id: 72 })],
      '72::mods',
      CORTESIA,
      1,
      'p',
    );
    expect(parte.receta_id).toBe(72);
  });

  it('una línea que no existe deja la lista como estaba', () => {
    const items = [linea(1, 1, 1)];
    expect(aplicarDescuentoEnLineas(items, 99, CORTESIA, 1, 'p')).toBe(items);
  });

  it('quitar el descuento lo deja en nulo', () => {
    const r = quitarDescuentoEnLineas(
      [linea(4, 1, 1, { descuento: CORTESIA })],
      4,
    );
    expect(r[0].descuento).toBeNull();
  });
});

describe('idDeParte', () => {
  it('lleva el id de la línea delante y no choca con otra partida', () => {
    expect(idDeParte(4, 1000)).toMatch(/^4::desc-/);
    expect(idDeParte(4, 1000)).not.toBe(idDeParte(4, 2000));
  });
});
