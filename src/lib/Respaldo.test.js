// src/lib/Respaldo.test.js
//
// La prueba que importa es la última: que TODO lo que emite un cobro caiga
// dentro de la lista. Es el fallo silencioso de este módulo — una tarea fuera
// de la lista no da error, sólo se queda sin segunda copia, y eso se descubre
// el día que un teléfono muere.
import { describe, it, expect } from 'vitest';
import {
  claveDeRespaldo,
  seRespalda,
  anotacionesDe,
  TABLAS_RESPALDADAS,
  RPCS_RESPALDADAS,
} from './Respaldo';

const tarea = (extra = {}) => ({
  tabla: 'ventas',
  metodo: 'upsert',
  data: { id: 1829286241974646, total: 250 },
  createdAt: 1000,
  ...extra,
});

describe('claveDeRespaldo · lo que lleva segunda copia', () => {
  it('una venta sí', () => {
    expect(claveDeRespaldo(tarea())).toBe('ventas::1829286241974646');
  });

  it('una comanda también: cocina ya trabajó', () => {
    expect(
      claveDeRespaldo(tarea({ tabla: 'comandas', data: { id: 'CMD-7' } })),
    ).toBe('comandas::CMD-7');
  });

  it('un movimiento de inventario también', () => {
    // Sin él, la venta adoptada entra sin descontar y el almacén miente.
    expect(
      claveDeRespaldo(tarea({ tabla: 'movimientos', data: { id: 55 } })),
    ).toBe('movimientos::55');
  });

  it('la configuración NO: se rehace en treinta segundos', () => {
    expect(claveDeRespaldo(tarea({ tabla: 'configuracion' }))).toBeNull();
  });

  it('las recetas y los catálogos tampoco', () => {
    expect(claveDeRespaldo(tarea({ tabla: 'productos' }))).toBeNull();
    expect(claveDeRespaldo(tarea({ tabla: 'ingredientes' }))).toBeNull();
    expect(claveDeRespaldo(tarea({ tabla: 'clientes' }))).toBeNull();
  });

  it('un borrado no se respalda', () => {
    // Adoptar un borrado de un dispositivo muerto es borrar algo que quizá
    // nadie quiso borrar. Se protege lo que se perdería, no lo que se quitó.
    expect(claveDeRespaldo(tarea({ metodo: 'delete' }))).toBeNull();
  });

  it('una fila sin id no se respalda', () => {
    // Sin id no hay clave, y sin clave el hub multiplicaría la misma venta con
    // cada reenvío de la LAN.
    expect(claveDeRespaldo(tarea({ data: { total: 250 } }))).toBeNull();
    expect(claveDeRespaldo(tarea({ data: { id: '' } }))).toBeNull();
  });

  it('basura de entrada devuelve null en vez de reventar', () => {
    expect(claveDeRespaldo(null)).toBeNull();
    expect(claveDeRespaldo(undefined)).toBeNull();
    expect(claveDeRespaldo('ventas')).toBeNull();
    expect(claveDeRespaldo({})).toBeNull();
  });
});

describe('claveDeRespaldo · las RPC', () => {
  it('la visita del cliente usa el id de la venta', () => {
    expect(
      claveDeRespaldo({
        metodo: 'rpc',
        rpc: 'registrar_visita_cliente',
        data: { p_venta_id: 99, p_cliente_id: 3 },
      }),
    ).toBe('registrar_visita_cliente::99');
  });

  it('el canje usa el id del canje', () => {
    expect(
      claveDeRespaldo({
        metodo: 'rpc',
        rpc: 'canjear_puntos',
        data: { p_canje_id: 'cj-1' },
      }),
    ).toBe('canjear_puntos::cj-1');
  });

  it('decrementar_stock usa su origen, que puede ser una COMANDA', () => {
    // Texto y no un id de venta: en mesa el descuento lo dispara la comanda al
    // mandar a producción, cuando la venta todavía no existe.
    expect(
      claveDeRespaldo({
        metodo: 'rpc',
        rpc: 'decrementar_stock',
        data: { p_items: [], p_origen: 'CMD-7' },
      }),
    ).toBe('decrementar_stock::CMD-7');
  });

  it('un decrementar_stock SIN origen no se respalda', () => {
    // Sin origen la RPC no es idempotente —vuelve al comportamiento viejo— así
    // que adoptarla descontaría dos veces. Mejor sin copia que con copia
    // peligrosa. Que el POS siempre lo mande lo fija la prueba del cobro.
    expect(
      claveDeRespaldo({
        metodo: 'rpc',
        rpc: 'decrementar_stock',
        data: { p_items: [], p_referencia: 'Venta: Pizza x1' },
      }),
    ).toBeNull();
  });

  it('una RPC de la lista sin su identificador se queda fuera', () => {
    // Inventarle una clave sería peor: dos copias de la misma llamada entrarían
    // como distintas y se ejecutaría dos veces.
    expect(
      claveDeRespaldo({
        metodo: 'rpc',
        rpc: 'registrar_visita_cliente',
        data: { p_cliente_id: 3 },
      }),
    ).toBeNull();
  });

  it('una RPC desconocida no se respalda', () => {
    expect(
      claveDeRespaldo({ metodo: 'rpc', rpc: 'lo_que_sea', data: { id: 1 } }),
    ).toBeNull();
  });
});

describe('anotacionesDe', () => {
  it('convierte sólo lo respaldable y conserva la tarea entera', () => {
    const anotaciones = anotacionesDe([
      tarea(),
      tarea({ tabla: 'configuracion' }),
      { metodo: 'rpc', rpc: 'canjear_puntos', data: { p_canje_id: 'x' } },
    ]);

    expect(anotaciones).toHaveLength(2);
    expect(anotaciones[0].clave).toBe('ventas::1829286241974646');
    expect(anotaciones[0].tarea.data.total).toBe(250);
    expect(anotaciones[0].creado_ms).toBe(1000);
    expect(anotaciones[1].clave).toBe('canjear_puntos::x');
  });

  it('no manda dos veces la misma clave en el mismo lote', () => {
    expect(anotacionesDe([tarea(), tarea()])).toHaveLength(1);
  });

  it('una lista vacía o basura no revienta', () => {
    expect(anotacionesDe([])).toEqual([]);
    expect(anotacionesDe(null)).toEqual([]);
    expect(anotacionesDe([null, undefined, 3])).toEqual([]);
  });

  it('la tarea viaja con su rpc cuando la hay', () => {
    const [a] = anotacionesDe([
      { metodo: 'rpc', rpc: 'canjear_puntos', data: { p_canje_id: 'x' } },
    ]);
    expect(a.tarea.rpc).toBe('canjear_puntos');
    expect(a.tarea.metodo).toBe('rpc');
  });
});

describe('LA PRUEBA QUE IMPORTA · un cobro entero cae dentro de la lista', () => {
  // Esto es lo que emite `PosScreen.finalizarCobro` hoy. Si mañana el cobro
  // emite algo nuevo y se olvida de respaldarlo, que se entere la suite y no el
  // turno de cierre.
  const LO_QUE_EMITE_UN_COBRO = [
    { tabla: 'ventas', metodo: 'upsert', data: { id: 1 } },
    { tabla: 'comandas', metodo: 'upsert', data: { id: 'CMD-1' } },
    { tabla: 'mesas', metodo: 'upsert', data: { id: 4 } },
    {
      metodo: 'rpc',
      rpc: 'decrementar_stock',
      data: { p_items: [], p_restaurante_id: 'r', p_origen: 'CMD-1' },
    },
    {
      metodo: 'rpc',
      rpc: 'registrar_visita_cliente',
      data: { p_venta_id: 1, p_cliente_id: 3 },
    },
  ];

  it('el dinero y el trabajo de cocina van respaldados', () => {
    expect(seRespalda(LO_QUE_EMITE_UN_COBRO[0])).toBe(true); // la venta
    expect(seRespalda(LO_QUE_EMITE_UN_COBRO[1])).toBe(true); // la comanda
    expect(seRespalda(LO_QUE_EMITE_UN_COBRO[4])).toBe(true); // la visita
  });

  it('la mesa no: su estado se recalcula solo', () => {
    expect(seRespalda(LO_QUE_EMITE_UN_COBRO[2])).toBe(false);
  });

  it('el descuento de inventario también, desde que tiene ledger', () => {
    expect(seRespalda(LO_QUE_EMITE_UN_COBRO[3])).toBe(true);
  });

  it('lo ÚNICO del cobro sin respaldar es la mesa', () => {
    // Si esta lista crece, es que el cobro emite algo nuevo que nadie decidió
    // respaldar. Eso es lo que esta prueba viene a cazar: el fallo no daría
    // error, sólo dejaría un trozo del cobro sin segunda copia.
    const fuera = LO_QUE_EMITE_UN_COBRO.filter((t) => !seRespalda(t));
    expect(fuera.map((t) => t.rpc ?? t.tabla)).toEqual(['mesas']);
  });
});

describe('las listas no se editan sin querer', () => {
  it('las tablas respaldadas son exactamente estas tres', () => {
    expect(TABLAS_RESPALDADAS).toEqual(['ventas', 'comandas', 'movimientos']);
  });

  it('y las RPC, estas tres', () => {
    expect(Object.keys(RPCS_RESPALDADAS).sort()).toEqual([
      'canjear_puntos',
      'decrementar_stock',
      'registrar_visita_cliente',
    ]);
  });
});
