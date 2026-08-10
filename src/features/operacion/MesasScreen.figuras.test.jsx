// src/features/operacion/MesasScreen.figuras.test.jsx
//
// Las dos FIGURAS del inspector de mesa (roadmap 3.10). No se prueba el aspecto
// —eso no se rompe en silencio, se ve— sino las cuatro cosas que sí se rompen
// sin que nadie lo note hasta el turno de un viernes:
//
//   1. Que el inspector EXISTA en estrecho. Ése era el defecto de partida: un
//      `hidden xl:flex` que lo borraba por debajo de 1280 px, o sea para todo
//      el que lo usa de pie.
//   2. Que el toque de la tarjeta haga lo que toca en cada figura — al POS con
//      columna, a la hoja sin ella.
//   3. Que la hoja no aparezca sola. Hay siempre una mesa "seleccionada" por
//      respaldo (la primera de la lista, para que las flechas tengan de dónde
//      partir), y si esa selección de oficio pudiera abrir la hoja, el mapa
//      arrancaría con una mesa encima que nadie pidió.
//   4. Que la hoja enseñe LA MESA QUE SE TOCÓ. Si desaparece de la lista, se
//      cierra; no se cambia por otra debajo del dedo que ya va hacia «Cobrar».
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { ANCHO_ACOPLADO } from '../../hooks/useAcoplado';

const h = vi.hoisted(() => ({ app: {}, navegado: [] }));

vi.mock('../../store/useAppStore', () => ({
  useAppStore: Object.assign(() => h.app, {
    setState: (fn) => Object.assign(h.app, fn(h.app)),
    getState: () => h.app,
  }),
  parseUTC: (s) => (s ? new Date(s) : null),
}));
vi.mock('../../store/useSyncStore', () => ({
  useSyncStore: () => ({ enqueueAction: () => {} }),
}));
vi.mock('../auth/useAuthStore', () => ({
  useAuthStore: Object.assign(() => ({ user: { nombre: 'Capitán Test' } }), {
    getState: () => ({ restauranteId: 'rid-test', user: {} }),
  }),
}));
vi.mock('react-router-dom', async (orig) => ({
  ...(await orig()),
  useNavigate: () => (ruta) => h.navegado.push(ruta),
}));

import MesasScreen from './MesasScreen';

// jsdom no implementa matchMedia. Se simula un ancho de ventana y se contesta a
// la consulta como lo haría el navegador. `oyentes` permite además cambiar de
// ancho en caliente, que es la única forma de probar que la figura sigue al
// viewport y no al primer render.
let oyentes = [];
function anchoDeVentana(px) {
  window.matchMedia = vi.fn().mockImplementation((consulta) => {
    const minimo = Number(/min-width:\s*(\d+)px/.exec(consulta)?.[1] ?? 0);
    return {
      matches: px >= minimo,
      media: consulta,
      addEventListener: (_, fn) => oyentes.push(fn),
      removeEventListener: (_, fn) => {
        oyentes = oyentes.filter((o) => o !== fn);
      },
    };
  });
}

const mesa = (id, nombre, extra = {}) => ({
  id,
  nombre,
  zona: 'Salón Principal',
  capacidad: 4,
  estado: 'libre',
  comensales_reales: 0,
  mesa_principal_id: null,
  ...extra,
});

const MESAS = [
  mesa('m1', 'Mesa 1'),
  mesa('m2', 'Mesa 2', {
    estado: 'ocupada',
    comensales_reales: 3,
    orden_actual: {
      total: 1240,
      items: [{ id: 'i1', nombre: 'Arrachera', cantidad: 2, precio: 320 }],
    },
  }),
];

beforeEach(() => {
  h.navegado.length = 0;
  oyentes = [];
  Object.keys(h.app).forEach((k) => delete h.app[k]);
  Object.assign(h.app, {
    mesas: MESAS.map((m) => ({ ...m })),
    staff: [],
    clientes: [],
    comandas_activas: [],
    configuracion: { iva: 0.16, precios_incluyen_iva: true },
    showToast: vi.fn(),
    updateConfiguracion: vi.fn(),
  });
  document.body.style.overflow = '';
});

// El falso de `matchMedia` se instala en el objeto global, que sobrevive al
// archivo cuando la suite corre sin aislar entre ficheros. Devolverlo evita que
// el siguiente archivo herede una ventana con opiniones sobre su ancho — y que
// el fallo salga en un test que no tiene nada que ver con las figuras.
const matchMediaOriginal = window.matchMedia;

afterEach(() => {
  cleanup();
  window.matchMedia = matchMediaOriginal;
});

const pintar = () =>
  render(
    <MemoryRouter>
      <MesasScreen />
    </MemoryRouter>,
  );

const tarjeta = (nombre) =>
  screen.getByRole('heading', { name: new RegExp(nombre) }).closest('button');

const columna = () => document.querySelector('[data-figura="acoplado"]');
const hoja = () => document.querySelector('[data-figura="hoja"]');

// ─────────────────────────────────────────────────────────────────────────────
describe('figura acoplada — tablet apaisada y escritorio', () => {
  beforeEach(() => anchoDeVentana(ANCHO_ACOPLADO));

  it('el inspector es una columna, puesta desde el primer render', () => {
    pintar();
    expect(columna()).toBeTruthy();
    expect(hoja()).toBeNull();
  });

  it('sin haber tocado nada enseña la primera mesa, no un hueco', () => {
    // El respaldo de selección se gana el sitio aquí: la columna está puesta
    // igual, así que más vale que traiga algo dentro.
    pintar();
    expect(columna().textContent).toContain('Mesa 1');
  });

  it('el clic lleva al POS de un paso: la columna ya enseñaba la mesa', async () => {
    const user = userEvent.setup();
    pintar();
    await user.click(tarjeta('Mesa 2'));
    expect(h.navegado).toEqual(['/pos?mesa=m2']);
  });

  it('el clic además mueve el cursor: el inspector sigue al ratón', async () => {
    const user = userEvent.setup();
    pintar();
    await user.click(tarjeta('Mesa 2'));
    expect(columna().textContent).toContain('Mesa 2');
    expect(columna().textContent).toContain('$1,240.00');
  });

  it('nunca pinta la barra flotante: la tarjeta ya enseña el total', () => {
    pintar();
    expect(document.querySelector('[data-figura="disparador"]')).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('figura estrecha — teléfono y tablet vertical', () => {
  beforeEach(() => anchoDeVentana(ANCHO_ACOPLADO - 1));

  it('NO se queda sin inspector: era el defecto que se venía a arreglar', async () => {
    const user = userEvent.setup();
    pintar();
    await user.click(tarjeta('Mesa 2'));
    expect(hoja()).toBeTruthy();
    expect(hoja().textContent).toContain('Mesa 2');
    expect(hoja().textContent).toContain('Arrachera');
  });

  it('el toque abre la hoja y NO cambia de pantalla', async () => {
    const user = userEvent.setup();
    pintar();
    await user.click(tarjeta('Mesa 2'));
    expect(h.navegado).toEqual([]);
  });

  it('del POS se entra desde la hoja, y la hoja se cierra al salir', async () => {
    const user = userEvent.setup();
    pintar();
    await user.click(tarjeta('Mesa 2'));
    await user.click(screen.getByRole('button', { name: /Abrir en el POS/ }));
    expect(h.navegado).toEqual(['/pos?mesa=m2']);
    expect(hoja()).toBeNull();
  });

  it('arranca cerrada: el respaldo de selección no abre nada', () => {
    // Hay una mesa "seleccionada" desde el primer render —la primera de la
    // lista— porque las flechas necesitan un punto de partida. Esa selección de
    // oficio no es una petición del usuario y no puede abrir la hoja.
    pintar();
    expect(hoja()).toBeNull();
    expect(document.body.style.overflow).toBe('');
  });

  it('cerrada no monta el inspector: no ocupa ni sitio ni suscripciones', () => {
    pintar();
    expect(screen.queryByText('Arrachera')).toBeNull();
  });

  it('sin barra flotante — la tarjeta es el disparador', async () => {
    const user = userEvent.setup();
    pintar();
    expect(document.querySelector('[data-figura="disparador"]')).toBeNull();
    await user.click(tarjeta('Mesa 2'));
    await user.click(screen.getByRole('button', { name: 'Cerrar' }));
    expect(document.querySelector('[data-figura="disparador"]')).toBeNull();
  });

  it('Escape la cierra', async () => {
    const user = userEvent.setup();
    pintar();
    await user.click(tarjeta('Mesa 2'));
    await user.keyboard('{Escape}');
    expect(hoja()).toBeNull();
  });

  it('bloquea el fondo mientras está arriba, y lo suelta al cerrar', async () => {
    // Sin esto, el gesto de desplazar la hoja se le escapa al mapa de atrás y
    // acabas moviendo las mesas creyendo que mueves el consumo.
    const user = userEvent.setup();
    pintar();
    await user.click(tarjeta('Mesa 2'));
    expect(document.body.style.overflow).toBe('hidden');
    await user.keyboard('{Escape}');
    expect(document.body.style.overflow).toBe('');
  });

  it('si la mesa que se tocó sale de la lista, la hoja se CIERRA, no se cambia', async () => {
    // El caso feo: hoja abierta sobre Mesa 2, llega un realtime que la borra —
    // traspaso, unión, otro dispositivo—. Con el respaldo mandando, la hoja se
    // quedaría abierta enseñando Mesa 1 sin decir nada, y el dedo que ya iba
    // hacia «Cobrar» cobraría la mesa equivocada.
    const user = userEvent.setup();
    const { rerender } = render(
      <MemoryRouter>
        <MesasScreen />
      </MemoryRouter>,
    );
    await user.click(tarjeta('Mesa 2'));
    expect(hoja().textContent).toContain('Mesa 2');

    h.app.mesas = [{ ...MESAS[0] }];
    rerender(
      <MemoryRouter>
        <MesasScreen />
      </MemoryRouter>,
    );

    expect(hoja()).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('la tarjeta del mapa', () => {
  beforeEach(() => anchoDeVentana(ANCHO_ACOPLADO - 1));

  it('el identificador manda sobre el importe', () => {
    // Antes el importe iba arriba, grande y en el color del estado, y el nombre
    // debajo al mismo cuerpo pero en tinta normal — a igualdad de tamaño gana
    // el que tiene color, así que lo primero que se leía era «$488». En un mapa
    // de piso la primera pregunta es QUÉ MESA ES.
    pintar();
    const nombre = screen.getByRole('heading', { name: /Mesa 2/ });
    const importe = screen.getByText('$1,240');
    expect(nombre.className).toContain('text-3xl');
    expect(importe.className).toContain('text-base');
  });

  it('el nombre trunca en vez de ensanchar la tarjeta', () => {
    // Con `auto-fill` la tarjeta puede quedarse en 160 px. Un nombre largo sin
    // `truncate` empujaría la pista y descuadraría la rejilla entera.
    pintar();
    expect(screen.getByRole('heading', { name: /Mesa 2/ }).className).toContain(
      'truncate',
    );
  });

  it('la rejilla no lleva puntos de corte: los pone el navegador', () => {
    // Llegaron a convivir cinco (`sm`/`md`/`lg`/`xl`/`2xl`) y aun así a 390 px
    // salía UNA columna. Con `auto-fill` no hay tramos que mantener.
    const { container } = pintar();
    const rejilla = container.querySelector('[style*="auto-fill"]');
    expect(rejilla).toBeTruthy();
    expect(rejilla.className).not.toMatch(/grid-cols-/);
  });

  it('los atajos de ratón se marcan como tales', () => {
    // `opacity-0 group-hover` no es alcanzable con el dedo. La clase los oculta
    // en puntero grueso; si alguien la quita, estas acciones vuelven a ser
    // superficie invisible en un teléfono.
    pintar();
    const cluster = document
      .querySelector('[data-mesa-id]')
      .querySelector('.solo-raton');
    expect(cluster).toBeTruthy();
    expect(cluster.className).toContain('group-hover:opacity-100');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('cambio de figura en caliente', () => {
  it('girar la tablet cambia la figura sin perder la mesa', async () => {
    // Una tablet que gira cruza el umbral con la app abierta. Lo que no puede
    // pasar es que al girar se pierda de vista la mesa que se estaba mirando.
    const user = userEvent.setup();
    anchoDeVentana(ANCHO_ACOPLADO - 1);
    pintar();
    await user.click(tarjeta('Mesa 2'));
    expect(hoja()).toBeTruthy();

    anchoDeVentana(ANCHO_ACOPLADO);
    act(() => oyentes.forEach((fn) => fn()));

    expect(hoja()).toBeNull();
    expect(columna()).toBeTruthy();
    expect(columna().textContent).toContain('Mesa 2');
  });
});
