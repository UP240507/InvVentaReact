// Una fila que ya estaba no es un fallo.
//
// El caso real, en AZUL el 17-ago: la caja adopta el trabajo de un teléfono que
// daba por muerto —con `upsert`, y bien— y cuando el teléfono revive su propia
// cola inserta lo mismo y choca con un 23505. El mesero se encontró TRES errores
// permanentes en rojo por ventas que sí habían llegado.
//
// `drenarRespaldo` ya había razonado esa carrera y la resolvió por su lado
// poniendo `upsert`. Esto es el otro lado.
import { describe, it, expect } from 'vitest';
import { esFilaYaExistente } from './useSyncStore';

describe('esFilaYaExistente', () => {
  const dup = { code: '23505' };

  it('un 23505 al insertar una venta significa que ya está: es éxito', () => {
    expect(esFilaYaExistente({ tabla: 'ventas', metodo: 'insert' }, dup)).toBe(
      true,
    );
  });

  it('lo mismo para comandas y movimientos', () => {
    expect(
      esFilaYaExistente({ tabla: 'comandas', metodo: 'insert' }, dup),
    ).toBe(true);
    expect(
      esFilaYaExistente({ tabla: 'movimientos', metodo: 'insert' }, dup),
    ).toBe(true);
  });

  // El límite, y la razón de que exista la lista. En estas tres tablas el id
  // lleva carril de dispositivo, así que dos aparatos no pueden acuñar el mismo
  // número para cosas distintas. En una tabla con una restricción única de
  // NEGOCIO —un nombre repetido, un código de producto— un 23505 sí es un
  // problema real, y tragárselo lo escondería.
  it('en otras tablas, un 23505 sigue siendo un fallo de verdad', () => {
    expect(
      esFilaYaExistente({ tabla: 'productos', metodo: 'insert' }, dup),
    ).toBe(false);
    expect(
      esFilaYaExistente({ tabla: 'clientes', metodo: 'insert' }, dup),
    ).toBe(false);
  });

  it('sólo aplica al insert: un update o un delete que choque es otra cosa', () => {
    expect(esFilaYaExistente({ tabla: 'ventas', metodo: 'update' }, dup)).toBe(
      false,
    );
    expect(esFilaYaExistente({ tabla: 'ventas', metodo: 'upsert' }, dup)).toBe(
      false,
    );
  });

  // 23503 es clave foránea y 23502 es not-null: los dos son 23xxx y los dos son
  // fallos reales. Sólo el 23505 dice «duplicada».
  it('otros errores de la familia 23 NO se dan por buenos', () => {
    for (const code of ['23503', '23502', '23514', '22P02', '42501']) {
      expect(
        esFilaYaExistente({ tabla: 'ventas', metodo: 'insert' }, { code }),
      ).toBe(false);
    }
  });

  it('sin error o sin tarea, no se traga nada', () => {
    expect(esFilaYaExistente(null, dup)).toBe(false);
    expect(esFilaYaExistente({ tabla: 'ventas', metodo: 'insert' }, {})).toBe(
      false,
    );
    expect(esFilaYaExistente({ tabla: 'ventas', metodo: 'insert' }, null)).toBe(
      false,
    );
  });
});
