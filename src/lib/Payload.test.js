import { describe, it, expect } from 'vitest';
import { sinCamposDerivados, camposDerivadosDe } from './Payload';

describe('sinCamposDerivados', () => {
  it('EL BUG: quita el _costo que mataba el upsert de recetas', () => {
    const filaDeTabla = {
      id: 7,
      nombre: 'Chilaquiles',
      precio_venta: 120,
      activo: false,
      _costo: 43.5,
      _precio: 120,
      _margen: 63.75,
    };
    expect(sinCamposDerivados(filaDeTabla)).toEqual({
      id: 7,
      nombre: 'Chilaquiles',
      precio_venta: 120,
      activo: false,
    });
  });

  it('CLAVE: no baja a los jsonb', () => {
    // Los insumos son contenido de una columna, no columnas: un `_` ahí dentro
    // es dato del usuario y borrarlo sería perder información real.
    const receta = {
      id: 1,
      _costo: 10,
      insumos: [{ productoId: 3, cantidad: 2, _nota: 'del proveedor viejo' }],
    };
    const r = sinCamposDerivados(receta);
    expect(r._costo).toBe(undefined);
    expect(r.insumos[0]._nota).toBe('del proveedor viejo');
  });

  it('no toca una fila que ya está limpia', () => {
    const fila = { id: 1, nombre: 'Agua', activo: true };
    expect(sinCamposDerivados(fila)).toEqual(fila);
  });

  it('conserva null, 0 y cadena vacía (son valores, no ausencias)', () => {
    const fila = { id: 1, nota: null, stock: 0, alias: '' };
    expect(sinCamposDerivados(fila)).toEqual(fila);
  });

  it('acepta un arreglo de filas', () => {
    const r = sinCamposDerivados([
      { id: 1, _x: 1 },
      { id: 2, _x: 2 },
    ]);
    expect(r).toEqual([{ id: 1 }, { id: 2 }]);
  });

  it('deja pasar lo que no es objeto', () => {
    expect(sinCamposDerivados(null)).toBe(null);
    expect(sinCamposDerivados(5)).toBe(5);
    expect(sinCamposDerivados('hola')).toBe('hola');
  });

  it('no muta el original', () => {
    const fila = { id: 1, _costo: 9 };
    sinCamposDerivados(fila);
    expect(fila._costo).toBe(9);
  });
});

describe('camposDerivadosDe', () => {
  it('lista los derivados encontrados', () => {
    expect(camposDerivadosDe({ id: 1, _a: 1, _b: 2 })).toEqual(['_a', '_b']);
  });

  it('devuelve vacío si no hay ninguno', () => {
    expect(camposDerivadosDe({ id: 1 })).toEqual([]);
    expect(camposDerivadosDe(null)).toEqual([]);
  });
});
