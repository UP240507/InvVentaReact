// src/features/pos/PosScreen.integration.test.jsx
// Integración del cobro: render real de PosScreen + ModalCobro + motor fiscal.
// Mockea los stores (useAppStore/useSyncStore/useAuthStore) y captura el payload
// de venta encolado para probar que IVA/subtotal salen del motor y la propina
// queda FUERA de la base gravable (regresión D4 en el flujo completo).
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

// Estado compartido con los mocks (hoisted: accesible dentro de vi.mock)
const h = vi.hoisted(() => ({ enqueued: [], app: {} }));

vi.mock('../../store/useAppStore', () => ({
  useAppStore: Object.assign(() => h.app, {
    setState: () => {},
    getState: () => h.app,
  }),
  parseUTC: (s) => (s ? new Date(s) : null),
}));
vi.mock('../../store/useSyncStore', () => ({
  useSyncStore: () => ({
    enqueueAction: (...a) => h.enqueued.push(a),
    descontarStockVenta: () => {},
  }),
}));
vi.mock('../auth/useAuthStore', () => ({
  useAuthStore: Object.assign(() => ({ user: { nombre: 'Cajero Test' } }), {
    getState: () => ({
      restauranteId: 'rid-test-123',
      user: { nombre: 'Cajero Test' },
    }),
  }),
}));
vi.mock('./components/TicketImpresion', () => ({ default: () => null }));

import PosScreen from './PosScreen';

beforeEach(() => {
  h.enqueued.length = 0;
  Object.keys(h.app).forEach((k) => delete h.app[k]);
  Object.assign(h.app, {
    recetas: [
      { id: 1, nombre: 'Pizza', precio_venta: 100, categoria: 'Platillos' },
    ],
    productos: [],
    mesas: [],
    getIva: () => 0.16,
    descontarStock: vi.fn(),
    showToast: vi.fn(),
    configuracion: { precios_incluyen_iva: true }, // MX: precio ya trae IVA
    registrarComandaKDS: vi.fn(),
    registrarAuditoria: vi.fn(),
  });
});

const ventaEncolada = () =>
  h.enqueued.find((a) => a[0] === 'ventas' && a[1] === 'insert')?.[2];

describe('Integración cobro · PosScreen → ModalCobro → venta', () => {
  it('directa $100 (IVA incl.) + propina 20%: IVA=13.79, subtotal=86.21, propina fuera de base (D4)', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <PosScreen />
      </MemoryRouter>,
    );

    await user.click(screen.getByRole('button', { name: /Pizza/ }));
    await user.click(screen.getByRole('button', { name: /Cobrar Ticket/ }));
    await user.click(await screen.findByRole('button', { name: '20%' }));
    await user.click(screen.getByRole('button', { name: /Pagar Restante/ }));
    await user.click(
      screen.getByRole('button', { name: /Confirmar y Cerrar Cuenta/ }),
    );

    const venta = ventaEncolada();
    expect(venta).toBeTruthy();
    expect(venta.restaurante_id).toBe('rid-test-123'); // RLS
    expect(venta.subtotal).toBe(86.21);
    expect(venta.iva).toBe(13.79); // NO 16.55 (IVA sobre propina)
    expect(venta.propina).toBe(20);
    expect(venta.total).toBe(120);
    expect(
      Math.round((venta.subtotal + venta.iva + venta.propina) * 100) / 100,
    ).toBe(venta.total);
  });

  it('directa sin propina: total = precio de menú (no suma 16% encima)', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <PosScreen />
      </MemoryRouter>,
    );

    await user.click(screen.getByRole('button', { name: /Pizza/ }));
    await user.click(screen.getByRole('button', { name: /Cobrar Ticket/ }));
    await user.click(
      await screen.findByRole('button', { name: /Pagar Restante/ }),
    );
    await user.click(
      screen.getByRole('button', { name: /Confirmar y Cerrar Cuenta/ }),
    );

    const venta = ventaEncolada();
    expect(venta.total).toBe(100);
    expect(venta.subtotal).toBe(86.21);
    expect(venta.iva).toBe(13.79);
    expect(venta.propina).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// CUENTAS PARCIALES (§F) — la red que faltaba para el flujo de MESA.
//
// Hasta hoy este fichero sólo cubría la venta directa de mostrador, así que el
// eslabón que une «lo que se imprimió» con «lo que se cobra» no lo miraba nada.
// Y es el eslabón caro: si la venta saliera con un folio distinto del que lleva
// el papel, el cliente tendría en la mano un documento que no corresponde a
// ninguna venta, y **nada daría error** — se vería semanas después, al buscar
// un hueco en la serie.
//
// La afirmación que importa es esa: la venta lleva EL FOLIO DEL PAPEL y SU
// total, no el de la mesa entera.
describe('Integración · cuenta parcial en mesa → cobro', () => {
  /**
   * Monta una mesa de 4 cervezas ya guardada, en flujo de un solo papel.
   *
   * `comensales` es un parámetro y no una constante **a propósito**: con 4 se
   * salta el cuadro de «cuánta gente hay», y ese atajo es justo el que hizo que
   * esta suite no viera el fallo del 31-ago durante ocho días. Con 0 se ejercita
   * el camino que recorre una mesa recién sentada, que es el de todos los días.
   */
  const montarMesa = (comensales = 4) => {
    Object.assign(h.app, {
      recetas: [
        { id: 9, nombre: 'Cerveza', precio_venta: 50, categoria: 'Bebidas' },
      ],
      mesas: [
        {
          id: 7,
          nombre: 'Mesa 7',
          estado: 'ocupada',
          comensales_reales: comensales,
          orden_actual: {
            items: [
              {
                id: 9,
                nombre: 'Cerveza',
                precio: 50,
                cantidad: 4,
                cantidad_enviada: 0,
              },
            ],
            total: 200,
          },
        },
      ],
      configuracion: {
        precios_incluyen_iva: true,
        flujo_cuenta: 'ticket_final',
        nombre_empresa: 'AZUL',
      },
    });
    return render(
      <MemoryRouter initialEntries={['/pos?mesa=7']}>
        <PosScreen />
      </MemoryRouter>,
    );
  };

  /** La reserva de folio que se encoló al imprimir: ahí está el número. */
  const folioReservado = () =>
    h.enqueued.find((a) => a[0] === 'folios_reservados')?.[2];

  const mesaGuardada = () =>
    h.enqueued.filter((a) => a[0] === 'mesas').at(-1)?.[2];

  it('EL ESLABÓN: la venta lleva el folio del papel y el total de la parte', async () => {
    const user = userEvent.setup();
    montarMesa();

    // 1 · Se elige qué se lleva el grupo: 2 de las 4 cervezas.
    await user.click(
      screen.getByRole('button', { name: /Cuenta aparte para unos cuantos/ }),
    );
    const mas = await screen.findByRole('button', {
      name: /Sumar una unidad de Cerveza/,
    });
    await user.click(mas);
    await user.click(mas);
    await user.click(
      screen.getByRole('button', { name: /Imprimir su cuenta/ }),
    );

    // 2 · Se imprimió UNA cuenta, con folio, y por 100 (2 × 50), no por 200.
    const reserva = folioReservado();
    expect(reserva, 'la cuenta parcial reserva su folio').toBeTruthy();
    expect(reserva.total_impreso).toBe(100);

    // 3 · La mesa sigue abierta: los otros dos siguen sentados.
    expect(mesaGuardada().estado).toBe('ocupada');

    // 4 · Se cobra ESA cuenta.
    await user.click(
      await screen.findByRole('button', { name: /Cobrar esta/ }),
    );
    await user.click(
      await screen.findByRole('button', { name: /Pagar Restante/ }),
    );
    await user.click(
      screen.getByRole('button', { name: /Confirmar y Cerrar Cuenta/ }),
    );

    const venta = ventaEncolada();
    expect(venta).toBeTruthy();
    // ── LA AFIRMACIÓN, Y SU CONTROL NEGATIVO ─────────────────────────────
    expect(venta.folio).toBe(reserva.id); // el folio DEL PAPEL
    expect(venta.total).toBe(100); // lo que dice el papel…
    expect(venta.total).not.toBe(200); // …y no la mesa entera
    expect(venta.items).toHaveLength(1);
    expect(venta.items[0].cantidad).toBe(2);
  });

  it('lo que queda sigue en la mesa, y la mesa no se libera', async () => {
    const user = userEvent.setup();
    montarMesa();

    await user.click(
      screen.getByRole('button', { name: /Cuenta aparte para unos cuantos/ }),
    );
    const mas = await screen.findByRole('button', {
      name: /Sumar una unidad de Cerveza/,
    });
    await user.click(mas);
    await user.click(
      screen.getByRole('button', { name: /Imprimir su cuenta/ }),
    );
    await user.click(
      await screen.findByRole('button', { name: /Cobrar esta/ }),
    );
    await user.click(
      await screen.findByRole('button', { name: /Pagar Restante/ }),
    );
    await user.click(
      screen.getByRole('button', { name: /Confirmar y Cerrar Cuenta/ }),
    );

    const mesa = mesaGuardada();
    expect(mesa.estado).toBe('ocupada');
    expect(mesa.orden_actual.items).toHaveLength(1);
    expect(mesa.orden_actual.items[0].cantidad).toBe(3);
  });

  // ───────────────────────────────────────────────────────────────────────
  // EL CASO DE TODOS LOS DÍAS: una mesa recién sentada.
  //
  // Los dos de arriba montan la mesa con `comensales_reales: 4`, así que se
  // saltan el cuadro de «¿cuánta gente hay?». Ese atajo escondió durante ocho
  // días un fallo que ocurría en la PRIMERA cuenta separada de CADA mesa: el
  // cuadro cortaba la petición, volvía a llamar sin la selección, y se
  // imprimía la mesa entera. Y como al cobrar la mesa se libera con
  // `comensales_reales: 0`, el contador vuelve a cero en cada servicio: no era
  // un caso raro, era el caso normal.
  //
  // Encontrado en campo el 31-ago, no por una prueba. Esta es la prueba que
  // faltaba.
  it('mesa recién sentada: el cuadro de comensales NO se traga la selección', async () => {
    const user = userEvent.setup();
    montarMesa(0); // sin comensales: como cualquier mesa al empezar

    // Se separan 2 de las 4 cervezas.
    await user.click(
      screen.getByRole('button', { name: /Cuenta aparte para unos cuantos/ }),
    );
    const mas = await screen.findByRole('button', {
      name: /Sumar una unidad de Cerveza/,
    });
    await user.click(mas);
    await user.click(mas);
    await user.click(
      screen.getByRole('button', { name: /Imprimir su cuenta/ }),
    );

    // Aquí NO se imprime todavía: aparece el cuadro de comensales.
    expect(
      folioReservado(),
      'no se imprime antes de saber cuánta gente hay',
    ).toBeUndefined();
    const cuantos = await screen.findByPlaceholderText('0');
    await user.type(cuantos, '4');
    await user.click(screen.getByRole('button', { name: 'Imprimir cuenta' }));

    // ── LA AFIRMACIÓN, Y SU CONTROL NEGATIVO ────────────────────────────
    // Sin el arreglo esto sale 200: la mesa entera. Ese 200 es el papel con el
    // total equivocado en la mano del cliente.
    const reserva = folioReservado();
    expect(reserva, 'la cuenta parcial reserva su folio').toBeTruthy();
    expect(reserva.total_impreso).toBe(100); // las 2 cervezas…
    expect(reserva.total_impreso).not.toBe(200); // …y NO la mesa entera

    // Y la mesa sigue abierta, que es lo que distingue una parcial de un cierre.
    expect(mesaGuardada().estado).toBe('ocupada');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// EXTRAS (01-oct) — que lo que suma el cuadro llegue a la venta.
//
// La trampa que esta prueba vigila: `getPrecio()` lee `precio_venta` ANTES que
// `precio`, y la línea del carrito hereda `precio_venta` del catálogo. Si el
// POS sólo pusiera el precio con extras en `precio`, el carrito diría $92 y el
// cobro cobraría $65, sin error en ningún sitio. Sólo se ve haciendo el
// recorrido entero por la pantalla.
describe('Integración · extras del cuadro → venta', () => {
  beforeEach(() => {
    h.app.modificadores = [
      {
        id: 30,
        nombre: 'Tipo de leche',
        tipo: 'unica',
        obligatorio: true,
        activo: true,
        opciones: [
          {
            id_opcion: 301,
            nombre: 'Entera',
            id_producto: 503,
            cantidad: 240,
            precio_extra: 0,
          },
          {
            id_opcion: 302,
            nombre: 'Almendra',
            id_producto: 504,
            cantidad: 240,
            precio_extra: 12,
          },
        ],
      },
      {
        id: 31,
        nombre: 'Extras',
        tipo: 'multiple',
        obligatorio: false,
        activo: true,
        opciones: [
          {
            id_opcion: 311,
            nombre: 'Shot extra',
            id_producto: 501,
            cantidad: 18,
            precio_extra: 15,
          },
        ],
      },
    ];
    h.app.recetas = [
      {
        id: 77,
        nombre: 'Latte',
        precio_venta: 65,
        categoria: 'Bebidas',
        grupos_modificadores: [30, 31],
        insumos: [{ productoId: 501, cantidad: 18 }],
      },
    ];
  });

  it('almendra + shot: la venta cobra 92, no el 65 de lista', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <PosScreen />
      </MemoryRouter>,
    );

    await user.click(screen.getByRole('button', { name: /Latte/ }));
    await user.click(await screen.findByRole('button', { name: /Almendra/ }));
    await user.click(screen.getByRole('button', { name: /Shot extra/ }));
    await user.click(screen.getByRole('button', { name: /Agregar al pedido/ }));
    await user.click(screen.getByRole('button', { name: /Cobrar Ticket/ }));
    await user.click(
      await screen.findByRole('button', { name: /Pagar Restante/ }),
    );
    await user.click(
      screen.getByRole('button', { name: /Confirmar y Cerrar Cuenta/ }),
    );

    const venta = ventaEncolada();
    expect(venta.total).toBe(92);

    // Lo que viaja al servidor: el trigger coteja catálogo contra
    // precio - precio_extras, y el stock sale de `insumos`.
    const [linea] = venta.items;
    expect(linea.precio_extras).toBe(27);
    expect(linea.precio_base).toBe(65);
    expect(linea.insumos).toEqual([
      { productoId: 501, cantidad: 18 },
      { productoId: 504, cantidad: 240 },
      { productoId: 501, cantidad: 18 },
    ]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// CARTA DE LA MAÑANA Y DE LA TARDE (09-oct, AZUL)
//
// La hora real no se puede fijar sin romper userEvent, así que se mueve el
// corte: a las 00:00 todo el día es «tarde», a las 23:59 casi todo es mañana.
describe('Integración · carta de la tarde', () => {
  const AGUA = {
    id: 40,
    nombre: 'Agua de fruta',
    precio_venta: 34,
    precio_vespertino: 38,
    categoria: 'Bebidas',
  };
  const DESAYUNO = {
    id: 41,
    nombre: 'Chilaquiles',
    precio_venta: 95,
    franja_carta: 'matutino',
    categoria: 'Desayunos',
  };
  const CENA = {
    id: 42,
    nombre: 'Arrachera',
    precio_venta: 210,
    franja_carta: 'vespertino',
    categoria: 'Comidas',
  };
  const montar = (configuracion) => {
    Object.assign(h.app, {
      recetas: [AGUA, DESAYUNO, CENA],
      configuracion: { precios_incluyen_iva: true, ...configuracion },
    });
    return render(
      <MemoryRouter>
        <PosScreen />
      </MemoryRouter>,
    );
  };
  const cobrar = async (user) => {
    await user.click(screen.getByRole('button', { name: /Cobrar Ticket/ }));
    await user.click(
      await screen.findByRole('button', { name: /Pagar Restante/ }),
    );
    await user.click(
      screen.getByRole('button', { name: /Confirmar y Cerrar Cuenta/ }),
    );
    return ventaEncolada();
  };

  it('en la tarde cobra el precio de tarde y la venta lo lleva en la línea', async () => {
    const user = userEvent.setup();
    montar({ franjas_activas: true, franja_corte: '00:00' });

    const boton = screen.getByRole('button', { name: /Agua de fruta/ });
    expect(boton.textContent).toMatch(/38\.00/);
    await user.click(boton);

    const venta = await cobrar(user);
    expect(venta.total).toBe(38);
    const [linea] = venta.items;
    // `precio_venta` es el que lee el trigger: si se quedara en 34, el
    // servidor vería la venta de 38 como precio cambiado a mano.
    expect(linea).toMatchObject({
      precio: 38,
      precio_venta: 38,
      receta_id: 40,
      precio_carta: 'vespertino',
    });
  });

  it('cada mitad del día enseña su carta', () => {
    const tarde = montar({ franjas_activas: true, franja_corte: '00:00' });
    expect(screen.queryByRole('button', { name: /Chilaquiles/ })).toBeNull();
    expect(screen.getByRole('button', { name: /Arrachera/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Agua de fruta/ })).toBeTruthy();
    tarde.unmount();

    montar({ franjas_activas: true, franja_corte: '23:59' });
    expect(screen.getByRole('button', { name: /Chilaquiles/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Arrachera/ })).toBeNull();
  });

  it('con las franjas apagadas: un precio y todo el menú, como antes', async () => {
    const user = userEvent.setup();
    montar({ franjas_activas: false, franja_corte: '00:00' });
    expect(screen.getByRole('button', { name: /Chilaquiles/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Arrachera/ })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: /Agua de fruta/ }));
    const venta = await cobrar(user);
    expect(venta.total).toBe(34);
    expect(venta.items[0].id).toBe(40);
  });

  it('con sabor (modificador): mañana y tarde siguen siendo dos líneas', async () => {
    const user = userEvent.setup();
    h.app.modificadores = [
      {
        id: 50,
        nombre: 'Sabor del agua',
        tipo: 'unica',
        obligatorio: true,
        activo: true,
        opciones: [{ id_opcion: 501, nombre: 'Jamaica', precio_extra: 0 }],
      },
    ];
    const conSabor = { ...AGUA, grupos_modificadores: [50] };
    Object.assign(h.app, {
      recetas: [conSabor],
      configuracion: {
        precios_incluyen_iva: true,
        franjas_activas: true,
        franja_corte: '23:59',
      },
    });
    const { rerender } = render(
      <MemoryRouter>
        <PosScreen />
      </MemoryRouter>,
    );
    const pedirJamaica = async () => {
      await user.click(screen.getByRole('button', { name: /Agua de fruta/ }));
      await user.click(await screen.findByRole('button', { name: /Jamaica/ }));
      await user.click(
        screen.getByRole('button', { name: /Agregar al pedido/ }),
      );
    };
    await pedirJamaica();
    h.app.configuracion = { ...h.app.configuracion, franja_corte: '00:00' };
    rerender(
      <MemoryRouter>
        <PosScreen />
      </MemoryRouter>,
    );
    await pedirJamaica();

    const venta = await cobrar(user);
    expect(venta.total).toBe(72);
    expect(venta.items.map((i) => i.precio)).toEqual([34, 38]);
    // El trigger coteja contra el catálogo con `receta_id`.
    expect(venta.items.every((i) => i.receta_id === 40)).toBe(true);
  });

  it('la agua de la mañana y la de la tarde no se funden en una línea', async () => {
    const user = userEvent.setup();
    const { rerender } = montar({
      franjas_activas: true,
      franja_corte: '23:59',
    });
    await user.click(screen.getByRole('button', { name: /Agua de fruta/ }));

    // Dan las 2: la misma pantalla, ya con la carta de la tarde.
    h.app.configuracion = { ...h.app.configuracion, franja_corte: '00:00' };
    rerender(
      <MemoryRouter>
        <PosScreen />
      </MemoryRouter>,
    );
    await user.click(screen.getByRole('button', { name: /Agua de fruta/ }));

    const venta = await cobrar(user);
    expect(venta.total).toBe(72);
    expect(venta.items.map((i) => [i.precio, i.cantidad])).toEqual([
      [34, 1],
      [38, 1],
    ]);
  });
});
