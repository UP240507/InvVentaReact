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
