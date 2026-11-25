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
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, act, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { construirTicket } from '../../lib/Comanda';
import { sinCamposDerivados } from '../../lib/Payload';

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
    // Como contesta el hub cuando el papel sale de verdad: `salioPapel` pide
    // `estado: 'encolado'`, y sin él la reimpresión se detiene antes de subir.
    return { ok: true, estado: 'encolado' };
  },
  enviarComanda: async () => ({ ok: true }),
  enviarPreCuenta: async () => ({ ok: true }),
  abrirCajon: async () => ({ ok: true }),
}));
// El ticket en pantalla se reduce a su botón de reimprimir: es lo único de él
// que mueve datos (H29). Lo demás es papel.
vi.mock('./components/TicketImpresion', () => ({
  default: ({ onImprimir }) => (
    <button type="button" onClick={onImprimir}>
      Reimprimir ticket
    </button>
  ),
}));

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

// ─────────────────────────────────────────────────────────────────────────────
// EL BUSCADOR DEL POS (Chris, 19-nov). Se activa tocándolo, filtra mientras se
// escribe y Enter no hace nada: ninguna tecla agrega un producto sin mirar.
// ─────────────────────────────────────────────────────────────────────────────
describe('Buscador del POS', () => {
  const montarConMenu = () => {
    h.estado.s = {
      ...h.estado.s,
      recetas: [
        { id: 1, nombre: 'Capuchino', precio_venta: 75, categoria: 'Café' },
        { id: 5, nombre: 'Latte', precio_venta: 70, categoria: 'Café' },
        {
          id: 6,
          nombre: 'Latte frío',
          precio_venta: 80,
          categoria: 'Fríos',
          codigo_pos: 'LT FRIO',
        },
      ],
    };
    return montarDirecta();
  };

  it('filtra en todas las categorías mientras se escribe, sin acentos', async () => {
    const user = userEvent.setup();
    montarConMenu();
    // Parado en «Café», el latte frío no se ve…
    await user.click(screen.getByRole('button', { name: 'Café' }));
    expect(screen.queryByRole('button', { name: /Latte frío/ })).toBeNull();

    // …pero buscando sí: la búsqueda no mira la categoría.
    await user.click(screen.getByRole('searchbox', { name: /Buscar/ }));
    await user.keyboard('FRIO');
    expect(screen.getByRole('button', { name: /Latte frío/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Capuchino/ })).toBeNull();
  });

  it('busca también por el código del POS', async () => {
    const user = userEvent.setup();
    montarConMenu();
    await user.type(screen.getByRole('searchbox', { name: /Buscar/ }), 'lt');
    expect(screen.getByRole('button', { name: /Latte frío/ })).toBeTruthy();
  });

  it('Enter no agrega nada al carrito', async () => {
    const user = userEvent.setup();
    montarConMenu();
    await user.type(
      screen.getByRole('searchbox', { name: /Buscar/ }),
      'capuchino{Enter}',
    );
    expect(
      screen.queryByRole('button', { name: /Cobrar Ticket/ }),
    ).toBeDisabled();
  });

  it('borrar la búsqueda devuelve la categoría que había', async () => {
    const user = userEvent.setup();
    montarConMenu();
    await user.click(screen.getByRole('button', { name: 'Fríos' }));
    await user.type(screen.getByRole('searchbox', { name: /Buscar/ }), 'capu');
    expect(screen.getByRole('button', { name: /Capuchino/ })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: /Borrar búsqueda/ }));
    expect(screen.queryByRole('button', { name: /Capuchino/ })).toBeNull();
    expect(screen.getByRole('button', { name: /Latte frío/ })).toBeTruthy();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// H29 · Reimprimir desde el ticket de cobro no puede subir campos del papel.
//
// En la barrida de la 0.3.3 (25-nov) reimprimir dejó «1 cambio sin
// sincronizar» permanente: `Could not find the 'cambio_entregado' column of
// 'ventas'`. El ticket de pantalla lleva campos que sólo existen para el papel
// y la reimpresión los mandaba a la cola. La prueba no lista esos tres: compara
// lo que sube contra las columnas reales de `ventas` en el esquema base, así
// que también atrapa el siguiente campo de pantalla que se cuele.
// ─────────────────────────────────────────────────────────────────────────────
const COLUMNAS_DE_VENTAS = (() => {
  const sql = readFileSync(
    resolve(
      dirname(fileURLToPath(import.meta.url)),
      '../../../supabase/local/esquema_base.sql',
    ),
    'utf8',
  );
  const inicio = sql.indexOf('CREATE TABLE IF NOT EXISTS "public"."ventas" (');
  const cuerpo = sql.slice(inicio, sql.indexOf('\n);', inicio));
  return new Set([...cuerpo.matchAll(/^\s+"([a-z_]+)" /gm)].map((m) => m[1]));
})();

describe('H29 · reimprimir el ticket de cobro sube sólo columnas de la base', () => {
  it('el esquema base trae las columnas de ventas (la prueba no compara contra nada)', () => {
    expect(COLUMNAS_DE_VENTAS.has('copias_impresas')).toBe(true);
    expect(COLUMNAS_DE_VENTAS.has('folio')).toBe(true);
    expect(COLUMNAS_DE_VENTAS.has('cambio_entregado')).toBe(false);
  });

  it('cobro con cambio y reimpresión: el update lleva la fila completa, sin campos del papel', async () => {
    const user = userEvent.setup();
    montarDirecta();
    await user.click(screen.getByRole('button', { name: /Capuchino/ }));
    await user.click(screen.getByRole('button', { name: /Cobrar Ticket/ }));
    await pagar(user, 100);
    await user.click(
      screen.getByRole('button', { name: /Confirmar y Cerrar Cuenta/ }),
    );
    await user.click(
      await screen.findByRole('button', { name: 'Reimprimir ticket' }),
    );

    const update = h.enqueued.find(
      (a) => a[0] === 'ventas' && a[1] === 'update',
    )?.[2];
    expect(update).toBeTruthy();

    // ── LA AFIRMACIÓN, Y SU CONTROL NEGATIVO ─────────────────────────────
    // Con `fb6edca` sobraban `cambio_entregado`, `efectivo_recibido` y
    // `mesa_nombre`, y PostgREST rechazaba la fila entera (PGRST204).
    // Lo que de verdad sube: la cola quita sola los `_derivados`
    // (`sinCamposDerivados`), así que se compara después de esa misma puerta.
    const ajenas = Object.keys(sinCamposDerivados(update)).filter(
      (k) => !COLUMNAS_DE_VENTAS.has(k),
    );
    expect(ajenas).toEqual([]);

    // La cola sube un update como upsert y reemplaza la copia local: tiene
    // que ir la fila entera, no sólo el contador.
    const venta = ventaEncolada();
    expect(update.folio).toBe(venta.folio);
    expect(update.items).toEqual(venta.items);
    expect(update.efectivo).toBe(75);
    expect(update.copias_impresas).toBe(venta.copias_impresas + 1);

    // Y la copia sí lleva el cambio en el papel.
    const doc = construirTicket(h.tickets.at(-1), { configuracion: {} });
    expect(doc.totales.find((t) => t.etiqueta === 'Cambio')?.valor).toBe(
      '$25.00',
    );
  });

  it('el insert del cobro tampoco lleva columnas que la base no tiene', async () => {
    const user = userEvent.setup();
    montarDirecta();
    await user.click(screen.getByRole('button', { name: /Capuchino/ }));
    await user.click(screen.getByRole('button', { name: /Cobrar Ticket/ }));
    await pagar(user, 100);
    await user.click(
      screen.getByRole('button', { name: /Confirmar y Cerrar Cuenta/ }),
    );
    const ajenas = Object.keys(sinCamposDerivados(ventaEncolada())).filter(
      (k) => !COLUMNAS_DE_VENTAS.has(k),
    );
    expect(ajenas).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// La cabecera del carrito en el teléfono (Chris, 25-nov): «COMANDA PARA» / «11»
// gastaba dos renglones debajo de una fila que sólo tenía la ✕. En el teléfono
// el nombre sube a esa fila y el bloque se esconde; en caja y tablet, igual.
// jsdom no trae `matchMedia`, y sin él `useAcoplado` dice «acoplado»: aquí se
// simula un teléfono para ver la hoja.
// ─────────────────────────────────────────────────────────────────────────────
describe('El carrito en el teléfono: el nombre en la fila de la ✕', () => {
  const simularAncho = (esAncho) => {
    window.matchMedia = () => ({
      matches: esAncho,
      addEventListener: () => {},
      removeEventListener: () => {},
    });
  };
  afterEach(() => {
    delete window.matchMedia;
  });

  it('en el teléfono la hoja se llama «Mesa 11» y no repite «Comanda para»', async () => {
    simularAncho(false);
    const user = userEvent.setup();
    montarMesa();
    await user.click(screen.getByRole('button', { name: /Ver comanda/ }));

    const hoja = screen.getByRole('dialog', { name: 'Mesa 11' });
    expect(hoja).toBeTruthy();
    // ── LA AFIRMACIÓN, Y SU CONTROL NEGATIVO ─────────────────────────────
    // Con `7bf7133` la hoja no tenía nombre y debajo salía el bloque.
    expect(within(hoja).getByRole('heading', { name: 'Mesa 11' })).toBeTruthy();
    expect(within(hoja).queryByText(/Comanda para/i)).toBeNull();
  });

  it('en caja y tablet el carrito conserva su cabecera', () => {
    simularAncho(true);
    montarMesa();
    expect(screen.getByText(/Comanda para/i)).toBeTruthy();
  });
});
