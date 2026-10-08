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
  repartirPorNota,
  lineaConOpciones,
  insumosDeOpcion,
  baseDeLinea,
  textoDeReglas,
  recetasQueUsan,
} from './Modificadores';
import { construirDeltasStock } from './Inventario';

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
    {
      id_opcion: 21,
      nombre: 'Extra Arrachera',
      id_producto: '1',
      cantidad: 0.1,
    },
    { id_opcion: 22, nombre: 'Extra queso', precio: 15, id_producto: null },
  ],
};

const CATALOGO = [TERMINO, EXTRAS];
const HAMBURGUESA = {
  id: 99,
  nombre: 'Hamburguesa',
  grupos_modificadores: [1, 2],
};

describe('gruposDeProducto', () => {
  it('resuelve los ids contra el catálogo, en el orden del platillo', () => {
    expect(
      gruposDeProducto(HAMBURGUESA, CATALOGO).map((g) => g.nombre),
    ).toEqual(['Término', 'Extras']);
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
    const imposible = [
      { id: 3, nombre: 'Vacío', obligatorio: true, opciones: [] },
    ];
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
    // Se guardan tal cual, sin normalizar a 0, porque `null` («no
    // configurado») y 0 («configurado en cero») no son lo mismo.
    // `lineaConOpciones` decide qué cuenta; aquí sólo se transporta.
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

  it('lee el precio de `precio_extra`, que es donde lo guarda el catálogo', () => {
    // Forma calcada de la fila de AZUL (01-oct): ModificadoresScreen escribe
    // `precio_extra`. Leer sólo `precio` devolvía null para toda opción real.
    const grupo = {
      id: 7,
      nombre: 'Extras',
      tipo: 'multiple',
      opciones: [
        {
          id_opcion: 71,
          nombre: 'Extra Arrachera',
          id_producto: 1,
          cantidad: 0.1,
          precio_extra: 56,
        },
      ],
    };
    const [op] = opcionesElegidas([grupo], { 7: ['71'] });
    expect(op.precio).toBe(56);
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
      firmaDeLinea(99, { 2: ['21'], 1: ['11'] }),
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
    expect(textoDeReglas({ tipo: 'unica', obligatorio: true })).toMatch(
      /sólo una/,
    );
    expect(textoDeReglas({ tipo: 'unica', obligatorio: false })).toMatch(
      /o ninguna/,
    );
    expect(textoDeReglas({ tipo: 'multiple', obligatorio: true })).toMatch(
      /al menos una/,
    );
    expect(textoDeReglas({ tipo: 'multiple', obligatorio: false })).toMatch(
      /o ninguna/,
    );
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

describe('recetasQueUsan — la trampa gorda de los modificadores', () => {
  // Un grupo configurado y NO atado a ningún platillo no hace nada en el POS, y
  // eso no se anunciaba. El que lo configura por primera vez hace todo bien,
  // va a probarlo, no pasa nada, y concluye que el sistema está roto. No falla
  // nada: sólo silencio. Esta cuenta es lo que permite decirlo en pantalla.
  const recetas = [
    { id: 1, nombre: 'Latte', grupos_modificadores: ['g-leche'] },
    { id: 2, nombre: 'Capuchino', grupos_modificadores: ['g-leche', 'g-tam'] },
    { id: 3, nombre: 'Chilaquiles', grupos_modificadores: [] },
    { id: 4, nombre: 'Agua' }, // sin la clave siquiera
  ];

  it('cuenta en cuántas recetas está atado', () => {
    expect(recetasQueUsan('g-leche', recetas)).toBe(2);
    expect(recetasQueUsan('g-tam', recetas)).toBe(1);
  });

  it('un grupo sin atar da CERO, que es todo el punto', () => {
    expect(recetasQueUsan('g-huerfano', recetas)).toBe(0);
  });

  it('compara por texto: número y cadena son el mismo id', () => {
    // Los ids llegan de la base como number o como string según el camino. Un
    // `===` crudo daría cero justo cuando sí hay algo atado, y el aviso diría
    // «sin usar» sobre un grupo que se está usando — peor que no avisar.
    const conNumeros = [{ id: 9, grupos_modificadores: [77] }];
    expect(recetasQueUsan('77', conNumeros)).toBe(1);
    expect(recetasQueUsan(77, conNumeros)).toBe(1);
  });

  it('no revienta con entradas raras', () => {
    expect(recetasQueUsan('g-leche', null)).toBe(0);
    expect(recetasQueUsan('g-leche', undefined)).toBe(0);
    expect(recetasQueUsan(null, recetas)).toBe(0);
    expect(
      recetasQueUsan('g-leche', [{ grupos_modificadores: 'no-es-lista' }]),
    ).toBe(0);
  });
});

// ─── El reparto por nota ─────────────────────────────────────────────────────
// El fallo de Chris del 21-ago: una pizza ya en cocina cerraba la línea entera
// y no se podía anotar la segunda. Lo que se prueba aquí no es la pantalla, es
// la aritmética: cuántas unidades se mueven y cuántas se quedan.

describe('repartirPorNota — lo que está en la plancha no se reescribe', () => {
  const linea = (extra = {}) => ({
    id: '10',
    nombre: 'Pizza',
    cantidad: 2,
    cantidad_enviada: 1,
    ...extra,
  });
  const base = { id: '10|sin cebolla', nombre: 'Pizza', nota: 'sin cebolla' };

  it('EL CASO DE CHRIS: 2 en la línea, 1 enviada, la nota se lleva sólo la libre', () => {
    const r = repartirPorNota([linea()], {
      lineaId: '10',
      lineId: '10|sin cebolla',
      base,
    });

    expect(r).toHaveLength(2);
    const vieja = r.find((i) => i.id === '10');
    const nueva = r.find((i) => i.id === '10|sin cebolla');

    // La vieja se queda EXACTAMENTE con lo que ya salió a cocina.
    expect(vieja.cantidad).toBe(1);
    expect(vieja.cantidad_enviada).toBe(1);
    expect(vieja.nota).toBeUndefined();

    // Y la nueva con lo que no había salido, y sin heredar el contador.
    expect(nueva.cantidad).toBe(1);
    expect(nueva.cantidad_enviada).toBe(0);
    expect(nueva.nota).toBe('sin cebolla');
  });

  it('no se pierde ni se inventa ninguna unidad', () => {
    // La invariante que de verdad importa: si al partir se perdiera una
    // unidad, el cliente pagaría de menos y nadie vería un error.
    const antes = [linea({ cantidad: 5, cantidad_enviada: 2 })];
    const r = repartirPorNota(antes, {
      lineaId: '10',
      lineId: '10|sin cebolla',
      base,
    });
    const suma = (xs) => xs.reduce((a, i) => a + i.cantidad, 0);
    const enviadas = (xs) => xs.reduce((a, i) => a + i.cantidad_enviada, 0);

    expect(suma(r)).toBe(5);
    expect(enviadas(r)).toBe(2);
  });

  it('en ninguna línea las enviadas superan a la cantidad', () => {
    // Si esto se rompiera, `modificarCantidad` se negaría para siempre a
    // quitar unas unidades que no existen en ninguna comanda.
    const r = repartirPorNota([linea({ cantidad: 3, cantidad_enviada: 3 })], {
      lineaId: '10',
      lineId: '10|otra',
      base: { id: '10|otra', nota: 'otra' },
    });
    r.forEach((i) =>
      expect(i.cantidad_enviada).toBeLessThanOrEqual(i.cantidad),
    );
  });

  it('si todo ya salió, no se toca nada y se devuelve el mismo carrito', () => {
    // La pantalla ni siquiera deja abrir el cuadro en este caso, pero la regla
    // se fija aquí para que siga siendo verdad si alguien cambia la pantalla.
    const antes = [linea({ cantidad: 2, cantidad_enviada: 2 })];
    expect(
      repartirPorNota(antes, {
        lineaId: '10',
        lineId: '10|sin cebolla',
        base,
      }),
    ).toBe(antes);
  });

  it('sin nada enviado, la línea se corrige en sitio y no se parte', () => {
    // El comportamiento de siempre, intacto: esto es una corrección, no un
    // plato nuevo.
    const r = repartirPorNota([linea({ cantidad: 2, cantidad_enviada: 0 })], {
      lineaId: '10',
      lineId: '10|sin cebolla',
      base,
    });
    expect(r).toHaveLength(1);
    expect(r[0].id).toBe('10|sin cebolla');
    expect(r[0].cantidad).toBe(2);
  });

  it('confirmar sin cambiar nada deja el carrito como estaba', () => {
    // Partir y volver a juntar. Sin esta rama, abrir el cuadro y darle a
    // aceptar duplicaria la línea.
    const r = repartirPorNota([linea()], {
      lineaId: '10',
      lineId: '10',
      base: { id: '10', nombre: 'Pizza' },
    });
    expect(r).toHaveLength(1);
    expect(r[0].cantidad).toBe(2);
    expect(r[0].cantidad_enviada).toBe(1);
  });

  it('si ya existe otra línea con esa misma nota, se suman', () => {
    // Dos pizzas «sin cebolla» son la misma cosa: dejarlas en dos líneas haría
    // que la cocina sacara dos comandas por lo que es un solo plato repetido.
    const antes = [
      linea(),
      { id: '10|sin cebolla', cantidad: 1, cantidad_enviada: 0 },
    ];
    const r = repartirPorNota(antes, {
      lineaId: '10',
      lineId: '10|sin cebolla',
      base,
    });
    expect(r).toHaveLength(2);
    expect(r.find((i) => i.id === '10|sin cebolla').cantidad).toBe(2);
  });

  it('un alta normal (sin línea previa) entra con cantidad 1', () => {
    const r = repartirPorNota([], { lineaId: null, lineId: '10', base });
    expect(r).toHaveLength(1);
    expect(r[0].cantidad).toBe(1);
    expect(r[0].cantidad_enviada).toBe(0);
  });
});

// ── lineaConOpciones ───────────────────────────────────────────────────────
// Lo que las opciones le hacen al cobro y al inventario. Los casos salen de
// la barra de AZUL: un latte sin leche en la receta, el grupo obligatorio
// «Tipo de leche» que aporta la leche, y extras con precio.
const CAFE = 501;
const VASO = 502;
const ENTERA = 503;
const ALMENDRA = 504;

const LECHE = {
  id: 30,
  nombre: 'Tipo de leche',
  tipo: 'unica',
  obligatorio: true,
  opciones: [
    {
      id_opcion: 301,
      nombre: 'Entera',
      id_producto: ENTERA,
      cantidad: 240,
      precio_extra: 0,
    },
    {
      id_opcion: 302,
      nombre: 'Almendra',
      id_producto: ALMENDRA,
      cantidad: 240,
      precio_extra: 12,
    },
  ],
};
const EXTRAS_CAFE = {
  id: 31,
  nombre: 'Extras',
  tipo: 'multiple',
  obligatorio: false,
  opciones: [
    {
      id_opcion: 311,
      nombre: 'Shot extra',
      id_producto: CAFE,
      cantidad: 18,
      precio_extra: 15,
    },
    {
      id_opcion: 312,
      nombre: 'Canela',
      id_producto: null,
      cantidad: 0,
      precio_extra: 0,
    },
  ],
};
const LATTE = {
  id: 77,
  nombre: 'Latte',
  precio_venta: 65,
  grupos_modificadores: [30, 31],
  insumos: [
    { productoId: CAFE, cantidad: 18 },
    { productoId: VASO, cantidad: 1 },
  ],
};
const elegir = (seleccion) =>
  opcionesElegidas(gruposDeProducto(LATTE, [LECHE, EXTRAS_CAFE]), seleccion);

describe('lineaConOpciones — lo que el extra cobra y descuenta', () => {
  it('suma el precio de los extras al de catálogo, y lo deja aparte', () => {
    const r = lineaConOpciones({
      precioBase: 65,
      insumos: LATTE.insumos,
      elegidas: elegir({ 30: ['302'], 31: ['311'] }),
    });
    expect(r.precio).toBe(92);
    expect(r.precio_base).toBe(65);
    expect(r.precio_extras).toBe(27);
  });

  it('suma en centavos: 0.10 + 0.20 no deja basura de coma flotante', () => {
    const r = lineaConOpciones({
      precioBase: 3,
      elegidas: [{ precio: 0.1 }, { precio: 0.2 }],
    });
    expect(r.precio).toBe(3.3);
    expect(r.precio_extras).toBe(0.3);
  });

  it('un precio negativo no abarata el platillo', () => {
    // «Quitar» no resta (DISENO_MODIFICADORES §4). Si alguien captura -5 por
    // error, el platillo no se vende más barato en silencio.
    const r = lineaConOpciones({ precioBase: 65, elegidas: [{ precio: -5 }] });
    expect(r.precio).toBe(65);
    expect(r.precio_extras).toBe(0);
  });

  it('agrega el insumo de cada opción a los de la receta', () => {
    const r = lineaConOpciones({
      precioBase: 65,
      insumos: LATTE.insumos,
      elegidas: elegir({ 30: ['302'], 31: ['311'] }),
    });
    expect(r.insumos).toEqual([
      { productoId: CAFE, cantidad: 18 },
      { productoId: VASO, cantidad: 1 },
      { productoId: ALMENDRA, cantidad: 240 },
      { productoId: CAFE, cantidad: 18 },
    ]);
  });

  it('una opción sin insumo o sin cantidad no toca el inventario', () => {
    const r = lineaConOpciones({
      precioBase: 65,
      insumos: LATTE.insumos,
      elegidas: elegir({ 30: ['301'], 31: ['312'] }),
    });
    // Canela no tiene insumo: sólo entra la leche entera.
    expect(r.insumos).toHaveLength(3);
    expect(r.insumos[2]).toEqual({ productoId: ENTERA, cantidad: 240 });
  });

  it('sin opciones, la línea queda como estaba', () => {
    const r = lineaConOpciones({ precioBase: 65, insumos: LATTE.insumos });
    expect(r).toEqual({
      precio: 65,
      precio_base: 65,
      precio_extras: 0,
      insumos: LATTE.insumos,
    });
  });

  it('no muta los insumos de la receta', () => {
    const insumos = [{ productoId: CAFE, cantidad: 18 }];
    lineaConOpciones({ insumos, elegidas: elegir({ 31: ['311'] }) });
    expect(insumos).toHaveLength(1);
  });

  it('de punta a punta: dos lattes de almendra con shot descuentan lo servido', () => {
    // La prueba que importa. El motor de stock recibe la línea tal cual la
    // arma el POS y multiplica por la cantidad de la línea: la cantidad de la
    // opción es por unidad, no por línea.
    const { insumos } = lineaConOpciones({
      precioBase: 65,
      insumos: LATTE.insumos,
      elegidas: elegir({ 30: ['302'], 31: ['311'] }),
    });
    const deltas = construirDeltasStock([{ cantidad: 2, insumos }]);
    const de = (id) => deltas.find((d) => d.productoId === id)?.cantidad;
    expect(de(CAFE)).toBe(72); // 2 × (18 de receta + 18 del shot)
    expect(de(VASO)).toBe(2);
    expect(de(ALMENDRA)).toBe(480);
    expect(de(ENTERA)).toBeUndefined();
  });
});

describe('baseDeLinea — reabrir el cuadro no cobra el extra dos veces', () => {
  // Cómo arma la línea el POS en `confirmarModificadores`.
  const armarLinea = (producto, seleccion) => {
    const { precioBase, insumos } = baseDeLinea(producto, 65);
    const r = lineaConOpciones({
      precioBase,
      insumos,
      elegidas: elegir(seleccion),
    });
    return {
      ...producto,
      precio: r.precio,
      precio_venta: r.precio,
      precio_base: r.precio_base,
      precio_extras: r.precio_extras,
      insumos: r.insumos,
      insumos_base: insumos,
    };
  };

  it('un platillo recién tocado parte de su precio y su receta', () => {
    expect(baseDeLinea(LATTE, 65)).toEqual({
      precioBase: 65,
      insumos: LATTE.insumos,
    });
  });

  it('reabrir una línea con shot y confirmar deja el mismo precio y los mismos insumos', () => {
    const una = armarLinea(LATTE, { 30: ['302'], 31: ['311'] });
    // Se reabre para ponerle nota: lo que llega como producto es la LÍNEA.
    const dos = armarLinea(una, { 30: ['302'], 31: ['311'] });
    expect(dos.precio).toBe(92);
    expect(dos.insumos).toEqual(una.insumos);
  });

  it('quitar el shot al reabrir devuelve el precio de catálogo', () => {
    const una = armarLinea(LATTE, { 30: ['301'], 31: ['311'] });
    const dos = armarLinea(una, { 30: ['301'] });
    expect(dos.precio).toBe(65);
    expect(dos.precio_extras).toBe(0);
  });

  it('una orden de mesa guardada antes del cambio parte de lo que ya traía', () => {
    // Sin `precio_base` ni `insumos_base`: su precio y sus insumos son la base.
    const vieja = { ...LATTE, precio: 65 };
    expect(baseDeLinea(vieja, 65).insumos).toBe(LATTE.insumos);
  });
});

// ── Sustituir (07-oct) ──────────────────────────────────────────────────────
// Decisión de Chris: el Deslact/Light se ofrece en calientes Y en fríos, y
// cada bebida lleva distinta leche. Una opción que sustituye permite UN solo
// grupo «Tipo de leche» para todas: la cantidad la pone cada receta.
describe('lineaConOpciones — una opción que sustituye en vez de agregar', () => {
  const ENTERA_ID = 503;
  const DESLACT_ID = 505;
  const TIPO_LECHE = {
    id: 40,
    nombre: 'Tipo de leche',
    tipo: 'unica',
    obligatorio: false,
    opciones: [
      {
        id_opcion: 401,
        nombre: 'Deslactosada',
        precio_extra: 6,
        id_producto: DESLACT_ID,
        sustituye: ENTERA_ID,
        cantidad: 0,
      },
    ],
  };
  const conLeche = (ml) => ({
    id: 90,
    precio_venta: 75,
    grupos_modificadores: [40],
    insumos: [
      { productoId: CAFE, cantidad: 100 },
      { productoId: ENTERA_ID, cantidad: ml },
    ],
  });
  const linea = (receta, seleccion) =>
    lineaConOpciones({
      precioBase: 75,
      insumos: receta.insumos,
      elegidas: opcionesElegidas(
        gruposDeProducto(receta, [TIPO_LECHE]),
        seleccion,
      ),
    });

  it('cambia la leche entera por deslactosada en la cantidad de la receta', () => {
    const r = linea(conLeche(50), { 40: ['401'] });
    expect(r.insumos).toEqual([
      { productoId: CAFE, cantidad: 100 },
      { productoId: DESLACT_ID, cantidad: 50 },
    ]);
  });

  it('el MISMO grupo sirve para una bebida de 300 ml', () => {
    const r = linea(conLeche(300), { 40: ['401'] });
    expect(r.insumos).toContainEqual({ productoId: DESLACT_ID, cantidad: 300 });
    expect(r.insumos.some((i) => i.productoId === ENTERA_ID)).toBe(false);
  });

  it('cobra su precio: sustituir no abarata el platillo', () => {
    expect(linea(conLeche(50), { 40: ['401'] }).precio).toBe(81);
  });

  it('sin elegir la opción, la receta sale con su leche entera', () => {
    const r = linea(conLeche(50), {});
    expect(r.insumos).toContainEqual({ productoId: ENTERA_ID, cantidad: 50 });
    expect(r.precio).toBe(75);
  });

  it('si la receta no lleva lo que se sustituye, no toca el stock pero cobra', () => {
    const sinLeche = {
      ...conLeche(50),
      insumos: [{ productoId: CAFE, cantidad: 100 }],
    };
    const r = linea(sinLeche, { 40: ['401'] });
    expect(r.insumos).toEqual([{ productoId: CAFE, cantidad: 100 }]);
    expect(r.precio).toBe(81);
  });

  it('acepta la llave vieja `id_producto` en la receta', () => {
    const vieja = {
      ...conLeche(50),
      insumos: [{ id_producto: ENTERA_ID, cantidad: 50 }],
    };
    const r = linea(vieja, { 40: ['401'] });
    expect(r.insumos).toEqual([{ productoId: DESLACT_ID, cantidad: 50 }]);
  });

  it('de punta a punta: dos frappés deslactosados descuentan deslactosada, no entera', () => {
    const { insumos } = linea(conLeche(50), { 40: ['401'] });
    const deltas = construirDeltasStock([{ cantidad: 2, insumos }]);
    const de = (id) => deltas.find((d) => d.productoId === id)?.cantidad;
    expect(de(DESLACT_ID)).toBe(100);
    expect(de(ENTERA_ID)).toBeUndefined();
  });
});

// ── Varios insumos por opción (07-oct) ──────────────────────────────────────
// Decisión de Chris: la caja tiene que parecerse a la carta (una Soda
// Italiana Mix con sus sabores, un Gourmet con sus 4) y el inventario tiene
// que descontar todo lo que lleva cada sabor.
describe('lineaConOpciones — una opción con varios insumos', () => {
  const CONDENSADA = 601;
  const EVAPORADA = 602;
  const CREMA = 603;
  const JARABE_FRESA = 611;
  const JARABE_LIMON = 612;
  const MINERAL = 620;
  const LECHE = 503;
  const DESLACT = 505;

  const tresLeches = {
    precio: 0,
    // El primer renglón va copiado a los campos sueltos, como lo guarda la
    // pantalla para las cajas que aún no se actualizan.
    id_producto: CONDENSADA,
    cantidad: 20,
    insumos: [
      { id_producto: CONDENSADA, cantidad: 20 },
      { id_producto: EVAPORADA, cantidad: 20 },
      { id_producto: CREMA, cantidad: 10 },
    ],
  };

  it('Tres leches descuenta sus tres insumos', () => {
    const r = lineaConOpciones({
      precioBase: 85,
      insumos: [{ productoId: CAFE, cantidad: 100 }],
      elegidas: [tresLeches],
    });
    expect(r.insumos).toEqual([
      { productoId: CAFE, cantidad: 100 },
      { productoId: CONDENSADA, cantidad: 20 },
      { productoId: EVAPORADA, cantidad: 20 },
      { productoId: CREMA, cantidad: 10 },
    ]);
    expect(r.precio).toBe(85);
  });

  it('el renglón copiado a los campos sueltos NO se cuenta dos veces', () => {
    const r = lineaConOpciones({ precioBase: 85, elegidas: [tresLeches] });
    const condensada = r.insumos.filter((i) => i.productoId === CONDENSADA);
    expect(condensada).toHaveLength(1);
  });

  it('Soda Italiana Mix Fresa-Limón: un producto, dos jarabes', () => {
    const fresaLimon = {
      precio: 0,
      insumos: [
        { id_producto: JARABE_FRESA, cantidad: 15 },
        { id_producto: JARABE_LIMON, cantidad: 15 },
      ],
    };
    const r = lineaConOpciones({
      precioBase: 68,
      insumos: [{ productoId: MINERAL, cantidad: 1 }],
      elegidas: [fresaLimon],
    });
    expect(r.insumos).toEqual([
      { productoId: MINERAL, cantidad: 1 },
      { productoId: JARABE_FRESA, cantidad: 15 },
      { productoId: JARABE_LIMON, cantidad: 15 },
    ]);
  });

  it('una opción puede sustituir y agregar a la vez', () => {
    // Ej.: «Deslactosada con canela»: cambia la leche y agrega canela.
    const mixta = {
      precio: 6,
      insumos: [
        { id_producto: DESLACT, sustituye: LECHE },
        { id_producto: 630, cantidad: 2 },
      ],
    };
    const r = lineaConOpciones({
      precioBase: 63,
      insumos: [{ productoId: LECHE, cantidad: 200 }],
      elegidas: [mixta],
    });
    expect(r.insumos).toEqual([
      { productoId: DESLACT, cantidad: 200 },
      { productoId: 630, cantidad: 2 },
    ]);
    expect(r.precio).toBe(69);
  });

  it('de punta a punta: dos frappés tres leches descuentan el doble de cada insumo', () => {
    const { insumos } = lineaConOpciones({
      precioBase: 85,
      elegidas: [tresLeches],
    });
    const deltas = construirDeltasStock([{ cantidad: 2, insumos }]);
    const de = (id) => deltas.find((d) => d.productoId === id)?.cantidad;
    expect([de(CONDENSADA), de(EVAPORADA), de(CREMA)]).toEqual([40, 40, 20]);
  });
});

describe('insumosDeOpcion — la lista manda, lo viejo sigue valiendo', () => {
  it('una opción vieja de un solo insumo se lee como lista de uno', () => {
    expect(insumosDeOpcion({ id_producto: 7, cantidad: 3 })).toEqual([
      { id_producto: 7, cantidad: 3, sustituye: null },
    ]);
  });

  it('una opción sin insumo no da renglones', () => {
    expect(insumosDeOpcion({ nombre: 'Término medio' })).toEqual([]);
  });

  it('con lista, se ignoran los campos sueltos', () => {
    expect(
      insumosDeOpcion({
        id_producto: 1,
        cantidad: 9,
        insumos: [{ id_producto: 2, cantidad: 5 }],
      }),
    ).toEqual([{ id_producto: 2, cantidad: 5, sustituye: null }]);
  });

  it('descarta renglones sin insumo', () => {
    expect(
      insumosDeOpcion({
        insumos: [
          { id_producto: '', cantidad: 5 },
          { id_producto: 3, cantidad: 1 },
        ],
      }),
    ).toEqual([{ id_producto: 3, cantidad: 1, sustituye: null }]);
  });

  it('opcionesElegidas transporta la lista hasta la línea', () => {
    const g = [
      {
        id: 9,
        nombre: 'Sabor gourmet',
        tipo: 'unica',
        opciones: [
          {
            id_opcion: 91,
            nombre: 'Tres leches',
            insumos: [{ id_producto: 601, cantidad: 20 }],
          },
        ],
      },
    ];
    const [op] = opcionesElegidas(g, { 9: ['91'] });
    expect(op.insumos).toEqual([{ id_producto: 601, cantidad: 20 }]);
  });
});
