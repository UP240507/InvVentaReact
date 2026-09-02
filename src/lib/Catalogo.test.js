// src/lib/Catalogo.test.js
//
// La afirmación de todo el fichero es una: **el desplegable nunca se queda
// vacío y nunca pierde un valor que ya esté escrito en una fila**. Lo segundo
// es lo que importa: un `<select>` cuyo `value` no está entre sus `<option>`
// enseña la primera opción y al guardar cambia el dato sin avisar. Es un fallo
// que no da error y que sólo se ve contando insumos meses después.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  UNIDADES_BASE,
  CATEGORIAS_INSUMO_BASE,
  CATEGORIAS_MENU_BASE,
  listaDeTextos,
  unidadesDisponibles,
  categoriasDeInsumo,
  categoriasDeMenu,
} from './Catalogo';

describe('listaDeTextos · normaliza lo que de verdad llega del jsonb', () => {
  it('un array de textos pasa tal cual', () => {
    expect(listaDeTextos(['kg', 'L'])).toEqual(['kg', 'L']);
  });

  it('null y undefined dan lista vacía, no revientan', () => {
    expect(listaDeTextos(null)).toEqual([]);
    expect(listaDeTextos(undefined)).toEqual([]);
  });

  it('EL CASO REAL: jsonb doble-codificado, que al hacer spread se explota', () => {
    // Sin este parseo, `[...'["kg","L"]']` da ['[', '"', 'k', 'g', ...]: un
    // desplegable con veinte opciones de un carácter. Ya pasó en la pantalla
    // de zonas de impresión.
    expect(listaDeTextos('["kg","L"]')).toEqual(['kg', 'L']);
    expect([...listaDeTextos('["kg","L"]')]).not.toContain('[');
  });

  it('un string que no es JSON no ensucia la lista', () => {
    expect(listaDeTextos('kg, L')).toEqual([]);
  });

  it('tira vacíos, espacios sobrantes, repetidos y lo que no sea texto', () => {
    expect(listaDeTextos(['kg', ' kg ', '', '   ', 3, null, 'L'])).toEqual([
      'kg',
      'L',
    ]);
  });

  it('un objeto no es una lista', () => {
    expect(listaDeTextos({ 0: 'kg' })).toEqual([]);
  });
});

describe('unidadesDisponibles', () => {
  it('la configuración manda cuando tiene algo', () => {
    const r = unidadesDisponibles({ unidades: ['kilo', 'litro'] }, []);
    expect(r.lista).toEqual(['kilo', 'litro']);
    expect(r.sueltas).toEqual([]);
  });

  it('EL CASO DE AZUL: `unidades` en [] no deja el desplegable vacío', () => {
    // AZUL tiene `unidades: []` y los otros cuatro locales `null`. Leer la
    // configuración a secas —que era lo que pedía la lista de arreglos— dejaba
    // la pantalla sin ni una opción: no se podía capturar un insumo.
    expect(unidadesDisponibles({ unidades: [] }, []).lista).toEqual(
      UNIDADES_BASE,
    );
    expect(unidadesDisponibles({ unidades: null }, []).lista).toEqual(
      UNIDADES_BASE,
    );
    expect(unidadesDisponibles(null, null).lista).toEqual(UNIDADES_BASE);
    expect(unidadesDisponibles(null, null).lista.length).toBeGreaterThan(0);
  });

  it('LA REGLA QUE NO SE VE: lo que ya está en uso no desaparece', () => {
    // Los diez insumos de AZUL usan `pza`, `lt` y `Bolsa`, que no están en la
    // lista buena. Si no salieran, abrir uno de esos insumos y guardarlo le
    // cambiaría la unidad sin decir nada.
    const productos = [
      { unidad: 'pza', activo: true },
      { unidad: 'lt', activo: true },
      { unidad: 'Bolsa', activo: true },
      { unidad: 'kg', activo: true }, // ésta sí está en la lista
    ];
    const r = unidadesDisponibles({ unidades: [] }, productos);
    expect(r.sueltas).toEqual(['Bolsa', 'lt', 'pza']);
    expect(r.lista).toEqual(UNIDADES_BASE); // no se contamina la buena
    expect(r.sueltas).not.toContain('kg'); // lo que ya está no se repite
  });

  it('`Bolsa` y `bolsa` son DOS valores, y se ven los dos', () => {
    // Unificarlos aquí escondería el descuadre: en la base son dos filas que no
    // se pueden sumar. La pantalla los enseña aparte para que se arreglen.
    const r = unidadesDisponibles({ unidades: ['bolsa'] }, [
      { unidad: 'Bolsa', activo: true },
    ]);
    expect(r.lista).toEqual(['bolsa']);
    expect(r.sueltas).toEqual(['Bolsa']);
  });

  it('un insumo dado de baja no resucita su unidad', () => {
    const r = unidadesDisponibles({ unidades: [] }, [
      { unidad: 'lata', activo: false },
    ]);
    expect(r.sueltas).toEqual([]);
  });

  it('aguanta filas basura sin romperse', () => {
    const r = unidadesDisponibles({ unidades: [] }, [
      null,
      {},
      { unidad: '' },
      { unidad: '  ' },
      { unidad: 7 },
    ]);
    expect(r.sueltas).toEqual([]);
  });
});

describe('categoriasDeInsumo · el almacén, no el menú', () => {
  it('lee `categorias_insumo` y NUNCA `categorias`', () => {
    // El control negativo de la decisión del 01-sep: si esta función mirara
    // `categorias`, «Postres» —del menú— saldría como categoría de almacén y
    // las dos listas volverían a mezclarse.
    const conf = {
      categorias: ['Postres', 'Bebidas'],
      categorias_insumo: ['Abarrotes'],
    };
    const r = categoriasDeInsumo(conf, []);
    expect(r.lista).toEqual(['Abarrotes']);
    expect(r.lista).not.toContain('Postres');
  });

  it('sin lista propia, la de fábrica', () => {
    expect(categoriasDeInsumo({ categorias_insumo: [] }, []).lista).toEqual(
      CATEGORIAS_INSUMO_BASE,
    );
  });

  it('las que ya usan los insumos salen aparte', () => {
    // En AZUL conviven `Frutería` y `Verduras`, que la lista de fábrica junta
    // en `Frutas y verduras`.
    const r = categoriasDeInsumo({}, [
      { categoria: 'Frutería', activo: true },
      { categoria: 'Verduras', activo: true },
      { categoria: 'Abarrotes', activo: true },
    ]);
    expect(r.sueltas).toEqual(['Frutería', 'Verduras']);
    expect(r.sueltas).not.toContain('Abarrotes');
  });
});

describe('categoriasDeMenu · el menú, no el almacén', () => {
  it('lee `categorias`', () => {
    const r = categoriasDeMenu({ categorias: ['Tacos', 'Bebidas'] }, []);
    expect(r.lista).toEqual(['Tacos', 'Bebidas']);
  });

  it('sin lista propia, la de fábrica', () => {
    expect(categoriasDeMenu({ categorias: null }, []).lista).toEqual(
      CATEGORIAS_MENU_BASE,
    );
  });

  it('las que ya usan las recetas salen aparte', () => {
    // AZUL tiene `Platos Fuertes` y `Platillos` a la vez: el mismo mal del menú.
    const r = categoriasDeMenu({ categorias: ['Platos fuertes'] }, [
      { categoria: 'Platos Fuertes', activo: true },
      { categoria: 'Platillos', activo: true },
    ]);
    expect(r.sueltas).toEqual(['Platillos', 'Platos Fuertes']);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// LA PRUEBA QUE CIERRA EL FALLO ORIGINAL
//
// El fallo no era que la lista estuviera dura: era que la lista dura y la que
// siembra la plantilla NO ERAN LA MISMA, y nadie las comparaba nunca. Esto las
// compara. Si alguien añade una unidad en un sitio y se olvida del otro, esta
// prueba lo dice el mismo día en vez de dentro de doscientos insumos.
describe('las constantes y `plantilla_local.sql` dicen lo mismo', () => {
  const sql = readFileSync('supabase/seed/plantilla_local.sql', 'utf8');
  const arrays = [...sql.matchAll(/'(\[[^\]]*\])'::jsonb/g)].map((m) =>
    JSON.parse(m[1]),
  );

  it('la plantilla siembra las tres listas, en su orden', () => {
    expect(arrays).toHaveLength(3);
  });

  it('unidades', () => {
    expect(arrays[0]).toEqual(UNIDADES_BASE);
  });

  it('categorías del menú', () => {
    expect(arrays[1]).toEqual(CATEGORIAS_MENU_BASE);
  });

  it('categorías de almacén', () => {
    expect(arrays[2]).toEqual(CATEGORIAS_INSUMO_BASE);
  });

  it('y ninguna lista trae sinónimos de las que ya tiene', () => {
    // `lt` con `L`, o `pza` con `pz`, es el fallo original escrito otra vez.
    const enMinusculas = UNIDADES_BASE.map((u) => u.toLowerCase());
    expect(new Set(enMinusculas).size).toBe(UNIDADES_BASE.length);
    expect(enMinusculas).not.toContain('lt');
    expect(enMinusculas).not.toContain('pza');
  });
});
