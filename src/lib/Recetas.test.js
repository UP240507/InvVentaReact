import { describe, it, expect } from 'vitest';
import { nombreDeCopia, copiaDeReceta } from './Recetas';

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
