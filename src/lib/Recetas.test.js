import { describe, it, expect } from 'vitest';
import {
  nombreDeCopia,
  copiaDeReceta,
  filtrarInsumos,
  normalizaBusqueda,
  moverSeleccion,
  recetaConMismoCodigo,
} from './Recetas';

const base = {
  id: 7,
  nombre: 'Tacos al pastor',
  codigo_pos: 'P01',
  categoria: 'Platos Fuertes',
  precio_venta: 120,
  activo: true,
  created_at: '2026-01-01T00:00:00.000Z',
  insumos: [
    { productoId: 1, cantidad: 0.2, merma: 5 },
    { productoId: 2, cantidad: 3, merma: 0 },
  ],
  componentes: [
    {
      grupo: 'Bebida',
      cantidad: 1,
      opciones: [{ recetaId: 9, nombre: 'Agua' }],
    },
  ],
  grupos_modificadores: ['g1', 'g2'],
};

describe('nombreDeCopia', () => {
  it('la primera copia lleva «(copia)»', () => {
    expect(nombreDeCopia('Tacos al pastor', [])).toBe(
      'Tacos al pastor (copia)',
    );
  });

  it('la segunda numera, porque duplicar se usa en ráfaga', () => {
    // Se saca un platillo base y se hacen tres variantes seguidas. Con un
    // sufijo fijo, dos filas idénticas en una lista de cien no se distinguen:
    // se edita la equivocada y el error sale semanas después en un ticket.
    const ya = [{ nombre: 'Tacos al pastor (copia)' }];
    expect(nombreDeCopia('Tacos al pastor', ya)).toBe(
      'Tacos al pastor (copia 2)',
    );
  });

  it('NO encadena sufijos al duplicar una copia', () => {
    // «Tacos (copia) (copia) (copia)» deja de caber en el botón del POS y en
    // la comanda de cocina. El nombre crece una vez y deja de crecer.
    expect(nombreDeCopia('Tacos al pastor (copia)', [base])).toBe(
      'Tacos al pastor (copia)',
    );
    expect(
      nombreDeCopia('Tacos al pastor (copia 2)', [
        { nombre: 'Tacos al pastor (copia)' },
      ]),
    ).toBe('Tacos al pastor (copia 2)');
  });

  it('el choque no distingue mayúsculas ni espacios de sobra', () => {
    // Los nombres se teclean a mano. «tacos al pastor (COPIA) » es el mismo
    // platillo, y ofrecerlo como libre crearía el duplicado que se evita.
    const ya = [{ nombre: '  TACOS AL PASTOR (COPIA)  ' }];
    expect(nombreDeCopia('Tacos al pastor', ya)).toBe(
      'Tacos al pastor (copia 2)',
    );
  });

  it('sin nombre, no revienta', () => {
    expect(nombreDeCopia('', [])).toBe('Sin nombre (copia)');
    expect(nombreDeCopia(null, null)).toBe('Sin nombre (copia)');
  });
});

describe('copiaDeReceta — lo que NO se copia es lo importante', () => {
  it('no arrastra el id: la copia todavía no existe', () => {
    // Copiarlo haría que guardar sobrescribiera el original.
    expect(copiaDeReceta(base, []).id).toBeUndefined();
  });

  it('LA QUE MÁS IMPORTA: no copia `codigo_pos`', () => {
    // Comprobado contra la base el 22-ago: la columna NO tiene índice único ni
    // constraint. Dos platillos con el mismo código entran sin dar un error, y
    // a partir de ahí quien busque por código se lleva uno de los dos. Un
    // duplicado que el sistema acepta en silencio es peor que uno que rechaza.
    expect(copiaDeReceta(base, []).codigo_pos).toBe('');
  });

  it('la copia nace visible aunque el original esté archivado', () => {
    // Heredar «oculto del menú» daría una receta nueva que no aparece en el
    // POS sin que nadie sepa por qué.
    expect(copiaDeReceta({ ...base, activo: false }, []).activo).toBe(true);
  });

  it('copia todo lo que cuesta teclear', () => {
    const c = copiaDeReceta(base, []);
    expect(c.insumos).toHaveLength(2);
    expect(c.insumos[0]).toEqual({ productoId: 1, cantidad: 0.2, merma: 5 });
    expect(c.componentes).toHaveLength(1);
    expect(c.grupos_modificadores).toEqual(['g1', 'g2']);
    expect(c.categoria).toBe('Platos Fuertes');
    expect(c.precio_venta).toBe(120);
  });

  it('los arreglos son NUEVOS, no los del original', () => {
    // El formulario los muta al editar. Compartir la referencia haría que
    // tocar la copia cambiara la receta de la que salió — sin error, y
    // descubierto al mirar un costo que no cuadra.
    const c = copiaDeReceta(base, []);
    c.insumos[0].cantidad = 999;
    c.componentes[0].opciones[0].nombre = 'Otra';
    c.grupos_modificadores.push('g3');

    expect(base.insumos[0].cantidad).toBe(0.2);
    expect(base.componentes[0].opciones[0].nombre).toBe('Agua');
    expect(base.grupos_modificadores).toEqual(['g1', 'g2']);
  });

  it('acepta recetas viejas que guardan `ingredientes` en vez de `insumos`', () => {
    const vieja = {
      nombre: 'Sopa',
      ingredientes: [{ id_producto: 4, cantidad: 1 }],
    };
    expect(copiaDeReceta(vieja, []).insumos).toHaveLength(1);
  });

  it('sin receta, no hay copia', () => {
    expect(copiaDeReceta(null)).toBeNull();
    expect(copiaDeReceta(undefined)).toBeNull();
    expect(copiaDeReceta('Tacos')).toBeNull();
  });
});

// ─── El selector de insumos que sí busca ─────────────────────────────────────
// Sustituye a un <select> cuyo primer <option> decía «Buscar insumo en
// almacén…» y no buscaba nada. Un control que promete lo que no hace es el
// patrón de este proyecto llevado a la interfaz.

const ALMACEN = [
  { id: 1, nombre: 'Limón', activo: true },
  { id: 2, nombre: 'Queso fresco', activo: true },
  { id: 3, nombre: 'Bisquet', activo: true },
  { id: 4, nombre: 'Plátano macho', activo: true },
  { id: 5, nombre: 'Aceite', activo: false },
  { id: 6, nombre: 'Aguacate' },
];

describe('filtrarInsumos', () => {
  it('LA QUE MÁS IMPORTA: sin acentos encuentra igual', () => {
    // Es español y se teclea con prisa. Sin esto el buscador sólo funciona si
    // escribes el acento, y quien carga cien ingredientes no lo escribe: vería
    // «no hay coincidencias» sobre un insumo que existe y lo daría de alta dos
    // veces, partiendo el inventario.
    expect(filtrarInsumos(ALMACEN, 'limon').map((p) => p.id)).toEqual([1]);
    expect(filtrarInsumos(ALMACEN, 'platano').map((p) => p.id)).toEqual([4]);
    // Y al revés: con acento encuentra lo escrito sin él.
    expect(
      filtrarInsumos([{ id: 9, nombre: 'Platano' }], 'plátano'),
    ).toHaveLength(1);
  });

  it('lo que EMPIEZA por lo tecleado va antes que lo que lo contiene', () => {
    // «que» debe ofrecer «Queso fresco» antes que «Bisquet», aunque casen los
    // dos: se teclea el principio de la palabra, no un trozo de en medio.
    expect(filtrarInsumos(ALMACEN, 'que').map((p) => p.nombre)).toEqual([
      'Queso fresco',
      'Bisquet',
    ]);
  });

  it('a igualdad, alfabético: la lista no baila entre pulsaciones', () => {
    expect(filtrarInsumos(ALMACEN, 'a').map((p) => p.nombre)).toEqual([
      'Aguacate',
      'Plátano macho',
    ]);
  });

  it('sin texto devuelve todo lo activo, ordenado', () => {
    expect(filtrarInsumos(ALMACEN, '').map((p) => p.nombre)).toEqual([
      'Aguacate',
      'Bisquet',
      'Limón',
      'Plátano macho',
      'Queso fresco',
    ]);
  });

  it('los inactivos NUNCA salen', () => {
    // Son insumos archivados. Meterlos en una receta nueva es resucitar por
    // accidente algo que alguien retiró a propósito.
    expect(filtrarInsumos(ALMACEN, 'aceite')).toEqual([]);
    expect(filtrarInsumos(ALMACEN, '').some((p) => p.id === 5)).toBe(false);
    // Pero `activo` ausente cuenta como activo: las filas viejas no lo traen.
    expect(filtrarInsumos(ALMACEN, 'aguacate')).toHaveLength(1);
  });

  it('sin coincidencias devuelve vacío, no todo', () => {
    // Devolver la lista entera al no encontrar nada es cómo alguien acaba
    // metiendo el ingrediente equivocado sin darse cuenta.
    expect(filtrarInsumos(ALMACEN, 'zanahoria')).toEqual([]);
  });

  it('aguanta basura', () => {
    expect(filtrarInsumos(null, 'x')).toEqual([]);
    expect(filtrarInsumos(undefined)).toEqual([]);
    expect(normalizaBusqueda(null)).toBe('');
  });
});

describe('moverSeleccion', () => {
  it('baja y sube dentro de la lista', () => {
    expect(moverSeleccion(-1, 1, 3)).toBe(0);
    expect(moverSeleccion(0, 1, 3)).toBe(1);
    expect(moverSeleccion(1, -1, 3)).toBe(0);
  });

  it('se corta en los extremos, no da la vuelta', () => {
    // En una lista larga, pulsar ↓ una vez de más y aparecer arriba del todo
    // desorienta más de lo que ayuda.
    expect(moverSeleccion(2, 1, 3)).toBe(2);
    expect(moverSeleccion(0, -1, 3)).toBe(0);
  });

  it('sin opciones devuelve -1, para no tener que distinguir casos fuera', () => {
    expect(moverSeleccion(0, 1, 0)).toBe(-1);
    expect(moverSeleccion(0, 1, null)).toBe(-1);
  });
});

describe('recetaConMismoCodigo — la cortesía que le falta al índice', () => {
  const catalogo = [
    { id: 1, nombre: 'Tacos', codigo_pos: 'P01' },
    { id: 2, nombre: 'Sopa', codigo_pos: '' },
    { id: 3, nombre: 'Flan archivado', codigo_pos: 'P09', activo: false },
  ];

  it('encuentra el choque y devuelve CUÁL es', () => {
    // Devolver la receta y no un booleano es lo que permite decir «ese código
    // ya lo usa Tacos» en vez de «código duplicado», que obliga a buscarlo.
    expect(recetaConMismoCodigo('P01', catalogo)?.nombre).toBe('Tacos');
  });

  it('compara igual que el índice: sin mayúsculas y sin espacios', () => {
    // Si la pantalla comparara distinto que la base, habría códigos que la
    // pantalla acepta y la base rechaza — el error de Postgres otra vez, con
    // la sorpresa de que la pantalla ya había dicho que sí.
    expect(recetaConMismoCodigo(' p01 ', catalogo)?.id).toBe(1);
  });

  it('las ARCHIVADAS también ocupan código', () => {
    // El índice no distingue activo de inactivo, así que la pantalla tampoco
    // puede. Un platillo archivado sigue reservando su código.
    expect(recetaConMismoCodigo('P09', catalogo)?.id).toBe(3);
  });

  it('la receta que se está editando no choca consigo misma', () => {
    expect(recetaConMismoCodigo('P01', catalogo, 1)).toBeNull();
  });

  it('sin código no hay choque, porque el índice es parcial', () => {
    // Dos platillos sin código son legales. Si esto devolviera algo, no se
    // podría dar de alta el segundo.
    expect(recetaConMismoCodigo('', catalogo)).toBeNull();
    expect(recetaConMismoCodigo('   ', catalogo)).toBeNull();
    expect(recetaConMismoCodigo(null, catalogo)).toBeNull();
  });

  it('aguanta basura', () => {
    expect(recetaConMismoCodigo('P01', null)).toBeNull();
    expect(recetaConMismoCodigo('P01', undefined)).toBeNull();
  });
});
