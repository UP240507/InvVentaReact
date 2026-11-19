// src/features/pos/PosScreen.cobro.test.jsx
// ─────────────────────────────────────────────────────────────────────────────
// LO QUE ENCONTRÓ LA BARRIDA DE LA 0.3.2 EN EL COBRO (17 y 19-nov)
//
// Cada `describe` es un fallo medido en campo en AZUL, y cada prueba se corrió
// primero contra `71f8522` para ver que fallaba. Ver `ALCANCE_0.3.3.md` y
// `DISENO_0.3.3.md` en el proyecto.
//
// A diferencia de `PosScreen.integration.test.jsx`, el almacén de aquí SÍ
// guarda: `setState` cambia el estado y vuelve a pintar a quien lo lee. Sin eso
// no se puede ver el fallo de H3, que vive justo en lo que pasa cuando la mesa
// cambia en el almacén y la pantalla se rehace desde ella.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { construirTicket } from '../../lib/Comanda';

const h = vi.hoisted(() => ({
  enqueued: [],
  estado: { s: {} },
  oyentes: new Set(),
  tickets: [],
  auditoria: [],
}));

vi.mock('../../store/useAppStore', async () => {
  const { useSyncExternalStore } = await import('react');
  const suscribir = (fn) => {
    h.oyentes.add(fn);
    return () => h.oyentes.delete(fn);
  };
  const leer = () => h.estado.s;
  const useAppStore = (sel) => {
    const s = useSyncExternalStore(suscribir, leer);
    return sel ? sel(s) : s;
  };
  useAppStore.setState = (p) => {
    const parche = typeof p === 'function' ? p(h.estado.s) : p;
    h.estado.s = { ...h.estado.s, ...parche };
    h.oyentes.forEach((fn) => fn());
  };
  useAppStore.getState = leer;
  return { useAppStore, parseUTC: (s) => (s ? new Date(s) : null) };
});
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
vi.mock('../../lib/Hub', async (original) => ({
  ...(await original()),
  // El ticket se captura tal como sale hacia la impresora: es lo que se
  // imprime, no lo que se guarda.
  enviarTicket: async (venta) => {
    h.tickets.push(venta);
    return { ok: true };
  },
  enviarComanda: async () => ({ ok: true }),
  enviarPreCuenta: async () => ({ ok: true }),
  abrirCajon: async () => ({ ok: true }),
}));
vi.mock('./components/TicketImpresion', () => ({ default: () => null }));

import PosScreen from './PosScreen';
import { useAppStore } from '../../store/useAppStore';

const GERENTE = { id: 50, nombre: 'Sairi', rol: 'Gerente', pin: '9876' };

beforeEach(() => {
  h.enqueued.length = 0;
  h.tickets.length = 0;
  h.auditoria.length = 0;
  h.estado.s = {
    recetas: [
      { id: 1, nombre: 'Capuchino', precio_venta: 75, categoria: 'Café' },
      { id: 2, nombre: 'Agua cortesía', precio_venta: 0, categoria: 'Café' },
      { id: 3, nombre: 'Galleta', precio_venta: 20, categoria: 'Café' },
    ],
    productos: [],
    mesas: [],
    staff: [GERENTE],
    roles_permisos: [
      { rol: 'Gerente', capacidades: { autoriza_descuentos: true } },
    ],
    turnos: [],
    ventas: [],
    // El almacén de verdad lo trae siempre; al cobrar una mesa se filtra.
    comandas_activas: [],
    getIva: () => 0.16,
    descontarStock: vi.fn(),
    showToast: vi.fn(),
    configuracion: { precios_incluyen_iva: true },
    registrarComandaKDS: vi.fn(),
    registrarAuditoria: (a) => h.auditoria.push(a),
  };
});

const ventaEncolada = () =>
  h.enqueued.find((a) => a[0] === 'ventas' && a[1] === 'insert')?.[2];
const mesaGuardada = () =>
  h.enqueued.filter((a) => a[0] === 'mesas').at(-1)?.[2];

const montarDirecta = () =>
  render(
    <MemoryRouter>
      <PosScreen />
    </MemoryRouter>,
  );

/** Teclea un monto en el cobro y lo registra como pago. */
const pagar = async (user, monto) => {
  const campo = document.querySelector('input[type="number"]');
  await user.clear(campo);
  await user.type(campo, String(monto));
  await user.click(screen.getByRole('button', { name: /Añadir Pago/ }));
};

// ─────────────────────────────────────────────────────────────────────────────
// H15 · La venta guarda lo que se queda en la caja, no lo que se entregó.
// ─────────────────────────────────────────────────────────────────────────────
describe('H15 · el efectivo de la venta es el que se queda', () => {
  it('$75 pagados con $100: la venta guarda 75 y el ticket dice Recibido 100, Cambio 25', async () => {
    const user = userEvent.setup();
    montarDirecta();
    await user.click(screen.getByRole('button', { name: /Capuchino/ }));
    await user.click(screen.getByRole('button', { name: /Cobrar Ticket/ }));
    await pagar(user, 100);
    await user.click(
      screen.getByRole('button', { name: /Confirmar y Cerrar Cuenta/ }),
    );

    const venta = ventaEncolada();
    expect(venta.total).toBe(75);
    // ── LA AFIRMACIÓN, Y SU CONTROL NEGATIVO ─────────────────────────────
    // Con `71f8522` esto era 100: el corte esperaba en el cajón los $25 que
    // se le devolvieron al cliente.
    expect(venta.efectivo).toBe(75);
    expect(venta.efectivo).not.toBe(100);
    // Lo recibido NO se guarda (decidido el 17-nov).
    expect(venta).not.toHaveProperty('efectivo_recibido');

    // El papel sigue diciendo con cuánto pagó y cuánto se le dio.
    const ticket = h.tickets.at(-1);
    const doc = construirTicket(ticket, { configuracion: {} });
    const fila = (e) => doc.totales.find((t) => t.etiqueta === e)?.valor;
    expect(fila('Recibido')).toBe('$100.00');
    expect(fila('Cambio')).toBe('$25.00');
  });
});

describe('El método de pago lo deciden los métodos, no los pagos', () => {
  it('dos pagos en efectivo dejan la venta en efectivo, no en mixto', async () => {
    const user = userEvent.setup();
    montarDirecta();
    await user.click(screen.getByRole('button', { name: /Capuchino/ }));
    await user.click(screen.getByRole('button', { name: /Cobrar Ticket/ }));
    await pagar(user, 50);
    await pagar(user, 25);
    await user.click(
      screen.getByRole('button', { name: /Confirmar y Cerrar Cuenta/ }),
    );

    const venta = ventaEncolada();
    expect(venta.metodo_pago).toBe('efectivo'); // con 71f8522: 'mixto'
    expect(venta.efectivo).toBe(75);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// H14 · Una cuenta de $0 se cierra con el mismo botón, sin capturar pago.
// ─────────────────────────────────────────────────────────────────────────────
describe('H14 · la cuenta de $0', () => {
  it('se cierra sin capturar pago, queda como cortesía y no abre el cajón', async () => {
    const user = userEvent.setup();
    montarDirecta();
    await user.click(screen.getByRole('button', { name: /Agua cortesía/ }));
    await user.click(screen.getByRole('button', { name: /Cobrar Ticket/ }));

    // Con 71f8522 este botón estaba apagado: pedía un pago mayor que cero.
    const cerrar = screen.getByRole('button', {
      name: /Confirmar y Cerrar Cuenta/,
    });
    expect(cerrar).toBeEnabled();
    await user.click(cerrar);

    const venta = ventaEncolada();
    expect(venta.total).toBe(0);
    expect(venta.efectivo).toBe(0);
    expect(venta.metodo_pago).toBe('cortesia'); // con 71f8522: 'efectivo'

    // Sin dinero no hay por qué abrir el cajón.
    const doc = construirTicket(h.tickets.at(-1), { configuracion: {} });
    expect(doc.abrirCajon).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// MESAS: comensales y cortesía (H3).
// ─────────────────────────────────────────────────────────────────────────────

/** Una mesa con dos jugos ya enviados a cocina. */
const mesaConJugos = (extra = {}) => ({
  id: 11,
  nombre: '11',
  estado: 'ocupada',
  comensales_reales: 0,
  orden_actual: {
    items: [
      {
        id: 4,
        nombre: 'Jugo',
        precio: 40,
        cantidad: 2,
        cantidad_enviada: 2,
      },
    ],
    total: 80,
  },
  ...extra,
});

const montarMesa = (mesa = mesaConJugos()) => {
  h.estado.s = {
    ...h.estado.s,
    recetas: [
      ...h.estado.s.recetas,
      { id: 4, nombre: 'Jugo', precio_venta: 40, categoria: 'Bebidas' },
    ],
    mesas: [mesa],
  };
  return render(
    <MemoryRouter initialEntries={[`/pos?mesa=${mesa.id}`]}>
      <PosScreen />
    </MemoryRouter>,
  );
};

/** Abre el cuadro de descuento de la línea de Jugo. */
const abrirDescuentoDeJugo = async (user, indice = 0) => {
  const botones = screen.getAllByTitle('Descuento a este producto');
  await user.click(botones[indice]);
};

/** Cortesía con el PIN del gerente, a `unidades` unidades si se pregunta. */
const darCortesia = async (user, unidades = null) => {
  await user.click(screen.getByRole('button', { name: /Cortesía/ }));
  if (unidades != null) {
    const campo = screen.getByLabelText(/¿A cuántas/);
    await user.clear(campo);
    await user.type(campo, String(unidades));
  }
  await user.click(screen.getByRole('button', { name: /Aplicar descuento/ }));
  await user.type(screen.getByPlaceholderText('PIN'), GERENTE.pin);
  await user.click(screen.getByRole('button', { name: /^Autorizar$/ }));
};

describe('Comensales · se preguntan al pedir la cuenta, no con un contador', () => {
  it('el POS de una mesa ya no tiene el contador +/−', () => {
    montarMesa();
    // Era el único botón del POS con un «+» de texto: los de cantidad de cada
    // línea son iconos.
    expect(screen.queryByRole('button', { name: '+' })).toBeNull();
    expect(screen.queryByRole('button', { name: '-' })).toBeNull();
  });

  it('el cuadro sale aunque la mesa ya tenga número, con ese número puesto', async () => {
    const user = userEvent.setup();
    montarMesa(mesaConJugos({ comensales_reales: 4 }));
    await user.click(screen.getByRole('button', { name: /Pedir Cuenta/ }));

    // Con 71f8522, con 4 ya puestos, el cuadro no salía y se imprimía directo.
    expect(await screen.findByText('¿Cuántas personas?')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('0')).toHaveValue(4);
  });
});

describe('H3 · la cortesía se guarda en la mesa al aplicarla', () => {
  it('cortesía a una línea enviada, salir y volver: sigue en cortesía', async () => {
    const user = userEvent.setup();
    const { unmount } = montarMesa(
      mesaConJugos({
        orden_actual: {
          items: [
            {
              id: 4,
              nombre: 'Jugo',
              precio: 40,
              cantidad: 1,
              cantidad_enviada: 1,
            },
          ],
          total: 40,
        },
      }),
    );
    await abrirDescuentoDeJugo(user);
    await darCortesia(user);

    // Se guardó en la mesa, sin mandar nada a producción.
    const guardada = mesaGuardada();
    expect(guardada, 'la cortesía escribe la mesa').toBeTruthy();
    expect(guardada.orden_actual.items[0].descuento?.tipo).toBe('cortesia');

    // Se sale de la pantalla y se vuelve.
    unmount();
    render(
      <MemoryRouter initialEntries={['/pos?mesa=11']}>
        <PosScreen />
      </MemoryRouter>,
    );
    const mesa = useAppStore
      .getState()
      .mesas.find((m) => String(m.id) === '11');
    expect(mesa.orden_actual.items[0].descuento?.tipo).toBe('cortesia');
    // Y en pantalla la línea dice que es cortesía.
    expect(screen.getAllByText(/Cortesía/).length).toBeGreaterThan(0);
  });

  it('quitar la cortesía también se guarda y deja rastro en Auditoría', async () => {
    const user = userEvent.setup();
    montarMesa(
      mesaConJugos({
        orden_actual: {
          items: [
            {
              id: 4,
              nombre: 'Jugo',
              precio: 40,
              cantidad: 1,
              cantidad_enviada: 1,
              descuento: { tipo: 'cortesia', valor: 100, autorizadoPor: 'X' },
            },
          ],
          total: 0,
        },
      }),
    );
    await abrirDescuentoDeJugo(user);
    await user.click(screen.getByRole('button', { name: /^Quitar$/ }));

    expect(mesaGuardada()?.orden_actual.items[0].descuento ?? null).toBeNull();
    expect(h.auditoria.map((a) => a.accion)).toContain(
      'DESCUENTO_PRODUCTO_QUITADO',
    );
  });

  it('una línea sin mandar sobrevive a que la mesa cambie en el almacén', async () => {
    const user = userEvent.setup();
    montarMesa();
    // «Galleta» sale en el menú y, cuando se agrega, también en el carrito: se
    // cuenta cuántas veces aparece para saber si la línea sigue ahí.
    const enElMenu = screen.getAllByText('Galleta').length;
    // El mesero agrega una galleta y todavía no la manda.
    await user.click(screen.getByRole('button', { name: /Galleta/ }));
    const conLaLinea = screen.getAllByText('Galleta').length;
    expect(conLaLinea).toBeGreaterThan(enElMenu);

    // Otro aparato toca la mesa (aquí: una cortesía al jugo).
    act(() => {
      useAppStore.setState((prev) => ({
        mesas: prev.mesas.map((m) => ({
          ...m,
          orden_actual: {
            ...m.orden_actual,
            items: m.orden_actual.items.map((i) => ({
              ...i,
              descuento: { tipo: 'cortesia', valor: 100 },
            })),
          },
        })),
      }));
    });

    // Con 71f8522 el carrito se rehacía desde la mesa y la galleta desaparecía.
    expect(screen.getAllByText('Galleta')).toHaveLength(conLaLinea);
  });

  it('cortesía a 1 de 2 jugos: la línea se parte y la mesa cobra 40', async () => {
    const user = userEvent.setup();
    montarMesa();
    await abrirDescuentoDeJugo(user);
    await darCortesia(user, 1);

    const items = mesaGuardada().orden_actual.items;
    expect(items).toHaveLength(2);
    const conCortesia = items.filter((i) => i.descuento?.tipo === 'cortesia');
    const sinCortesia = items.filter((i) => !i.descuento);
    expect(conCortesia).toHaveLength(1);
    expect(conCortesia[0].cantidad).toBe(1);
    expect(sinCortesia[0].cantidad).toBe(1);
    // Lo enviado se reparte: no se vuelve a mandar nada a cocina.
    expect(items.reduce((n, i) => n + i.cantidad_enviada, 0)).toBe(2);

    // Y al cobrar, la venta es de un jugo, no de cero ni de dos.
    await user.click(
      screen.getByRole('button', { name: /Cerrar Mesa y Cobrar/ }),
    );
    const restante = await screen.findByRole('button', {
      name: /Pagar Restante/,
    });
    await user.click(restante);
    await user.click(
      screen.getByRole('button', { name: /Confirmar y Cerrar Cuenta/ }),
    );
    const venta = ventaEncolada();
    expect(venta.total).toBe(40); // con 71f8522: 0 (los dos en cortesía)
    expect(venta.items).toHaveLength(2);
  });
});
