// src/lib/Modificadores.test.js
//
// ── LO QUE ESTAS PRUEBAS DEFIENDEN ──────────────────────────────────────────
// Dos cosas, y la segunda es la que de verdad quita el sueño:
//
//  1. La matriz de 2×2 (única/múltiple × obligatorio/no). Cuatro casillas, de
//     las que dos no son evidentes ni para quien las configura: «múltiple y
//     obligatorio» significa «al menos una», y «única y no obligatorio»
//     significa que se puede desmarcar. Escritas en JSX sólo se comprobarían
//     tocando la pantalla.
//
//  2. **Que dos platillos iguales con elecciones distintas NO se fusionen.**
//     Una hamburguesa término medio y otra bien cocida tienen que ser dos
//     líneas. Si se juntan en «2x Hamburguesa», la cocina saca dos iguales y
//     nadie se entera hasta que el cliente devuelve el plato. Es el fallo con
//     peor relación entre lo fácil que es cometerlo y lo caro que sale.
import { describe, it, expect } from 'vitest';
import {
  gruposDeProducto,
  necesitaEleccion,
  alternar,
  faltantes,
  seleccionCompleta,
  opcionesElegidas,
  sublineasDe,
  firmaDeLinea,
  textoDeReglas,
} from './Modificadores';

// Datos calcados de lo que hay hoy en la base de AZUL, incluidas sus rarezas:
// «Extras» es múltiple Y obligatorio con una sola opción, y las opciones no
// tienen precio pero sí producto vinculado.
const TERMINO = {
  id: 1,
  nombre: 'Término',
  tipo: 'unica',
  obligatorio: true,
  opciones: [
    { id_opcion: 11, nombre: 'Término medio' },
    { id_opcion: 12, nombre: 'Bien cocido' },
  ],
};

const EXTRAS = {
  id: 2,
  nombre: 'Extras',
  tipo: 'multiple',
  obligatorio: false,
  opciones: [
    { id_opcion: 21, nombre: 'Extra Arrachera', id_producto: '1', cantidad: 0.1 },
    { id_opcion: 22, nombre: 'Extra queso', precio: 15, id_producto: null },
  ],
};

const CATALOGO = [TERMINO, EXTRAS];
const HAMBURGUESA = { id: 99, nombre: 'Hamburguesa', grupos_modificadores: [1, 2] };

describe('gruposDeProducto', () => {
  it('resuelve los ids contra el catálogo, en el orden del platillo', () => {
    expect(gruposDeProducto(HAMBURGUESA, CATALOGO).map((g) => g.nombre)).toEqual(
      ['Término', 'Extras'],
    );
  });

  it('compara ids como texto: la base los devuelve como número y el select como string', () => {
    const conStrings = { ...HAMBURGUESA, grupos_modificadores: ['1', '2'] };
    expect(gruposDeProducto(conStrings, CATALOGO)).toHaveLength(2);
  });

  it('un grupo borrado no deja el platillo invendible: se ignora', () => {
    const huerfano = { ...HAMBURGUESA, grupos_modificadores: [1, 404] };
    expect(gruposDeProducto(huerfano, CATALOGO).map((g) => g.nombre)).toEqual([
      'Término',
    ]);
  });

  it('un grupo sin `tipo` cae en el valor que menos obliga', () => {
    // Los grupos guardados antes de que el campo existiera llegan así. Si el
    // defecto fuera `unica`, un grupo viejo pasaría a impedir elegir varias.
    const viejo = [{ id: 7, nombre: 'Viejo', opciones: [] }];
    const p = { id: 1, grupos_modificadores: [7] };
    expect(gruposDeProducto(p, viejo)[0]).toMatchObject({
      tipo: 'multiple',
      obligatorio: false,
    });
  });

  it('aguanta basura sin reventar', () => {
    expect(gruposDeProducto(null, null)).toEqual([]);
    expect(gruposDeProducto({}, CATALOGO)).toEqual([]);
    expect(gruposDeProducto(HAMBURGUESA, undefined)).toEqual([]);
  });
});

describe('necesitaEleccion — cuándo se abre el modal', () => {
  it('sí cuando el platillo tiene grupos', () => {
    expect(necesitaEleccion(HAMBURGUESA, CATALOGO)).toBe(true);
  });

  it('NO por la nota libre: un taco no puede costar dos toques', () => {
    // Si el modal se abriera para todo, el POS dejaría de servir en una barra
    // con cola. La nota se pone desde la línea del carrito.
    expect(necesitaEleccion({ id: 5, nombre: 'Taco' }, CATALOGO)).toBe(false);
  });
});

describe('alternar — la matriz de 2×2', () => {
  it('única: la segunda elección sustituye a la primera', () => {
    let s = alternar(TERMINO, {}, 11);
    s = alternar(TERMINO, s, 12);
    expect(s['1']).toEqual(['12']);
  });

  it('única: volver a tocar la misma la quita', () => {
    // Sin esto, un grupo NO obligatorio marcado por error se queda marcado
    // para siempre y no hay forma de deshacerlo.
    const s = alternar(TERMINO, alternar(TERMINO, {}, 11), 11);
    expect(s['1']).toEqual([]);
  });

  it('múltiple: se acumulan', () => {
    const s = alternar(EXTRAS, alternar(EXTRAS, {}, 21), 22);
    expect(s['2']).toEqual(['21', '22']);
  });

  it('múltiple: tocar una marcada la desmarca sin tocar las demás', () => {
    let s = alternar(EXTRAS, alternar(EXTRAS, {}, 21), 22);
    s = alternar(EXTRAS, s, 21);
    expect(s['2']).toEqual(['22']);
  });

  it('no muta la selección que recibe', () => {
    const antes = {};
    alternar(TERMINO, antes, 11);
    expect(antes).toEqual({});
  });
});

describe('faltantes — qué bloquea el botón, y por qué', () => {
  it('dice el NOMBRE del grupo, no un booleano', () => {
    // Un botón desactivado sin decir cuál falta es una pantalla inusable.
    expect(faltantes(gruposDeProducto(HAMBURGUESA, CATALOGO), {})).toEqual([
      'Término',
    ]);
  });

  it('un grupo no obligatorio nunca bloquea', () => {
    const g = gruposDeProducto(HAMBURGUESA, CATALOGO);
    expect(faltantes(g, { 1: ['11'] })).toEqual([]);
  });

  it('múltiple + obligatorio = al menos una, no todas', () => {
    const g = [{ ...EXTRAS, obligatorio: true }];
    expect(faltantes(g, {})).toEqual(['Extras']);
    expect(faltantes(g, { 2: ['21'] })).toEqual([]);
  });

  it('un grupo obligatorio SIN opciones no puede atrapar al mesero', () => {
    // Es imposible de satisfacer: si contara, el platillo no se vendería nunca
    // y no habría forma de salir del modal.
    const imposible = [{ id: 3, nombre: 'Vacío', obligatorio: true, opciones: [] }];
    expect(faltantes(imposible, {})).toEqual([]);
    expect(seleccionCompleta(imposible, {})).toBe(true);
  });
});

describe('opcionesElegidas', () => {
  it('aplana con el grupo al lado', () => {
    const g = gruposDeProducto(HAMBURGUESA, CATALOGO);
    expect(opcionesElegidas(g, { 1: ['11'], 2: ['22'] })).toEqual([
      expect.objectContaining({ grupo: 'Término', nombre: 'Término medio' }),
      expect.objectContaining({ grupo: 'Extras', nombre: 'Extra queso' }),
    ]);
  });

  it('conserva precio/producto/cantidad SIN convertirlos', () => {
    // Hoy nadie los consume. Se guardan tal cual para que el día que se
    // conecten no haya que volver aquí — y sin normalizar a 0, porque `null`
    // («no configurado») y 0 («configurado en cero») no son lo mismo.
    const g = gruposDeProducto(HAMBURGUESA, CATALOGO);
    const [arrachera] = opcionesElegidas(g, { 2: ['21'] });
    expect(arrachera).toMatchObject({
      precio: null,
      id_producto: '1',
      cantidad: 0.1,
    });
  });

  it('una opción borrada del grupo desaparece de la selección', () => {
    const g = gruposDeProducto(HAMBURGUESA, CATALOGO);
    expect(opcionesElegidas(g, { 1: ['999'] })).toEqual([]);
  });
});

describe('sublineasDe', () => {
  it('sangra igual que los paquetes en Comanda.js', () => {
    // Dos sangrías distintas en un papel de 32 columnas se leen como un error
    // de impresión.
    const g = gruposDeProducto(HAMBURGUESA, CATALOGO);
    expect(sublineasDe(g, { 1: ['11'] })).toEqual(['  Término medio']);
  });
});

describe('firmaDeLinea — que no se fusionen dos platos distintos', () => {
  it('término medio y bien cocido son DOS líneas', () => {
    expect(firmaDeLinea(99, { 1: ['11'] })).not.toBe(
      firmaDeLinea(99, { 1: ['12'] }),
    );
  });

  it('la nota también separa', () => {
    expect(firmaDeLinea(99, {}, 'sin cebolla')).not.toBe(firmaDeLinea(99, {}));
  });

  it('el mismo pedido en distinto orden es la MISMA línea', () => {
    // Si no, marcar A y luego B crearía una línea distinta que marcar B y luego
    // A, y el carrito se llenaría de duplicados idénticos a la vista.
    expect(firmaDeLinea(99, { 2: ['21', '22'] })).toBe(
      firmaDeLinea(99, { 2: ['22', '21'] }),
    );
    expect(firmaDeLinea(99, { 1: ['11'], 2: ['21'] })).toBe(
      firmaDeLinea(99, { 2: ['21'], 1: ['11'] })
    );
  });

  it('sin elecciones ni nota, la firma es el id pelado', () => {
    // Así un platillo sin modificadores sigue apilándose como siempre: el
    // cambio no puede alterar el comportamiento de los que no lo usan.
    expect(firmaDeLinea(99, {}, '')).toBe('99');
    expect(firmaDeLinea(99, { 1: [] }, '   ')).toBe('99');
  });
});

describe('textoDeReglas — la frase que desmiente la contradicción del catálogo', () => {
  // El formulario decía «puede elegir varios O NINGUNO» y justo debajo tenía
  // una casilla «El cajero DEBE seleccionar» que lo desmentía.
  it('cubre las cuatro casillas', () => {
    expect(textoDeReglas({ tipo: 'unica', obligatorio: true })).toMatch(/sólo una/);
    expect(textoDeReglas({ tipo: 'unica', obligatorio: false })).toMatch(/o ninguna/);
    expect(textoDeReglas({ tipo: 'multiple', obligatorio: true })).toMatch(/al menos una/);
    expect(textoDeReglas({ tipo: 'multiple', obligatorio: false })).toMatch(/o ninguna/);
  });

  it('las cuatro frases son distintas entre sí', () => {
    const todas = [
      textoDeReglas({ tipo: 'unica', obligatorio: true }),
      textoDeReglas({ tipo: 'unica', obligatorio: false }),
      textoDeReglas({ tipo: 'multiple', obligatorio: true }),
      textoDeReglas({ tipo: 'multiple', obligatorio: false }),
    ];
    expect(new Set(todas).size).toBe(4);
  });
});
