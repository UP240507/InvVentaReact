// src/features/operacion/components/ModalCobro.figuras.test.jsx
//
// Las dos figuras del modal de cobro. Lo que se fija no es el aspecto sino lo
// que se rompió de verdad en un teléfono y lo que puede volver a romperse sin
// que se vea:
//
//   1. Que el botón de cobrar y el saldo estén ALCANZABLES sin recorrer todo el
//      panel de opciones de pago. Apilado, el pie quedaba al final de una
//      columna larguísima.
//   2. Que el pie se pinte UNA sola vez. Vive en una constante que dos ramas
//      distintas colocan en sitios distintos del árbol; si algún día las dos
//      condiciones fueran ciertas a la vez habría dos botones de cobrar, y el
//      segundo cobraría igual de bien que el primero.
//   3. Que haya UNA salida, no dos. La cabecera de estrecho trae su aspa y la
//      columna derecha trae la suya: si se pintaran las dos, un lector de
//      pantalla anunciaría dos «Cerrar» dentro del mismo diálogo.
//   4. Que la cifra del total no comparta línea con su etiqueta cuando no hay
//      ancho. Ése fue el síntoma que se vio en pantalla: «Total Final» y
//      «$40.00» montados el uno sobre el otro.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { ANCHO_ACOPLADO } from '../../../hooks/useAcoplado';

const h = vi.hoisted(() => ({ app: {} }));

vi.mock('../../../store/useAppStore', () => ({
  useAppStore: Object.assign(() => h.app, {
    setState: () => {},
    getState: () => h.app,
  }),
  parseUTC: (s) => (s ? new Date(s) : null),
}));
vi.mock('../../../store/useSyncStore', () => ({
  useSyncStore: () => ({ enqueueAction: () => {} }),
}));
vi.mock('../../auth/useAuthStore', () => ({
  useAuthStore: Object.assign(
    () => ({ user: { nombre: 'Cajero Test', rol: 'cajero' } }),
    { getState: () => ({ restauranteId: 'rid-test', user: {} }) },
  ),
}));

import ModalCobro from './ModalCobro';

const matchMediaOriginal = window.matchMedia;

function anchoDeVentana(px) {
  window.matchMedia = vi.fn().mockImplementation((consulta) => {
    const minimo = Number(/min-width:\s*(\d+)px/.exec(consulta)?.[1] ?? 0);
    return {
      matches: px >= minimo,
      media: consulta,
      addEventListener: () => {},
      removeEventListener: () => {},
    };
  });
}

beforeEach(() => {
  Object.keys(h.app).forEach((k) => delete h.app[k]);
  Object.assign(h.app, {
    staff: [],
    clientes: [],
    upsertCliente: vi.fn(),
    configuracion: { iva: 0.16, precios_incluyen_iva: true },
    roles_permisos: [],
    showToast: vi.fn(),
  });
});

afterEach(() => {
  cleanup();
  window.matchMedia = matchMediaOriginal;
});

const pintar = () =>
  render(
    <ModalCobro
      total={40}
      comensales={2}
      carrito={[{ id: 'r1', nombre: 'Pacífico', precio: 40, cantidad: 1 }]}
      onClose={() => {}}
      onProcesarPago={() => {}}
    />,
  );

const botonCobrar = () =>
  screen.getAllByRole('button', { name: /Confirmar y Cerrar Cuenta/ });

// ─────────────────────────────────────────────────────────────────────────────
describe('figura acoplada — hay sitio para las dos columnas', () => {
  beforeEach(() => anchoDeVentana(ANCHO_ACOPLADO));

  it('la columna izquierda trae su propio encabezado', () => {
    pintar();
    expect(screen.getByText(/Opciones de Cobro/)).toBeTruthy();
  });

  it('no pinta la cabecera de estrecho: sería un título de más', () => {
    pintar();
    expect(screen.queryByText('Cobro')).toBeNull();
  });

  it('un solo botón de cobrar', () => {
    pintar();
    expect(botonCobrar()).toHaveLength(1);
  });

  it('una sola salida', () => {
    pintar();
    expect(screen.getAllByRole('button', { name: 'Cerrar' })).toHaveLength(1);
  });

  it('sin banner de total: el desglose está siempre a la vista al lado', () => {
    // Con las dos columnas puestas, un banner sería el mismo número dos veces
    // en la misma pantalla.
    pintar();
    expect(screen.getAllByText('Total Final')).toHaveLength(1);
  });

  it('la cifra del desglose manda: es el remate y no compite con nada', () => {
    pintar();
    const cifra = screen.getByRole('heading', { name: /\$40\.00/ });
    expect(cifra.className).toContain('lg:text-5xl');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('figura apilada — teléfono y tablet vertical', () => {
  beforeEach(() => anchoDeVentana(ANCHO_ACOPLADO - 1));

  it('trae cabecera propia con la salida dentro', () => {
    // Apilado, el aspa `absolute` de la columna derecha aterrizaba sobre el
    // cuerpo del ticket, y el título de la izquierda se iba con el scroll.
    pintar();
    expect(screen.getByText('Cobro')).toBeTruthy();
    expect(screen.getAllByRole('button', { name: 'Cerrar' })).toHaveLength(1);
  });

  it('esconde el encabezado de la columna izquierda: ya lo dice la cabecera', () => {
    pintar();
    const encabezado = screen.getByText(/Opciones de/);
    expect(encabezado.className).toContain('hidden');
  });

  it('un solo botón de cobrar, no dos', () => {
    // El pie es una constante que dos ramas colocan en sitios distintos. Si las
    // dos lo pintaran, habría dos botones que cobran — y el segundo cobraría
    // igual de bien que el primero.
    pintar();
    expect(botonCobrar()).toHaveLength(1);
  });

  it('el saldo pendiente aparece una vez', () => {
    pintar();
    expect(screen.getAllByText(/Saldo Pendiente/i)).toHaveLength(1);
  });

  it('el pie NO está dentro del scroll del cuerpo', () => {
    // La garantía de verdad: el botón de cobrar tiene que ser hermano del
    // cuerpo, no descendiente suyo. Si vuelve a caer dentro, el mesero tendrá
    // que recorrer descuento, cliente, propina, división y método de pago antes
    // de ver el botón — que fue justo el defecto.
    pintar();
    const boton = botonCobrar()[0];
    const scroll = document.querySelector('.overflow-y-auto');
    expect(scroll).toBeTruthy();
    expect(scroll.contains(boton)).toBe(false);
  });

  it('el total tiene su propio banner, fuera del scroll', () => {
    // Lo que corrigió la maqueta de teléfono: la cifra cambia cada vez que se
    // toca la propina o el descuento, o sea justo mientras estás desplazado por
    // las opciones y el desglose te queda debajo del pliegue.
    pintar();
    const banner = screen.getAllByText('Total Final')[0];
    const scroll = document.querySelector('.overflow-y-auto');
    expect(scroll.contains(banner)).toBe(false);
  });

  it('la cifra del banner conserva Syne y su tamaño', () => {
    // Encogerla para que cupiera habría sido perder lo que se quiere conservar:
    // la identidad pide números grandes en Syne. Por eso se ancla arriba en vez
    // de pelear por sitio dentro de una fila.
    pintar();
    const scroll = document.querySelector('.overflow-y-auto');
    const cifra = screen
      .getAllByText(/^\$40\.00$/)
      .find((n) => !scroll.contains(n));
    expect(cifra.className).toContain('font-syne');
    expect(cifra.className).toContain('text-4xl');
  });

  it('el total del desglose se queda pequeño: no compite con el banner', () => {
    // Aparece dos veces a propósito —cifra viva arriba, cierre de la suma
    // abajo— pero sólo una manda. Y a `text-lg` la fila ya no puede solaparse,
    // que era el defecto original.
    pintar();
    // Las clases se comparan como PALABRAS, no como subcadenas: `lg:text-5xl`
    // contiene «text-5xl» y un `toContain` lo daría por bueno — que es lo que
    // se quiere detectar aquí, precisamente, la ausencia del tamaño grande SIN
    // prefijo.
    const cierre = screen.getByRole('heading', { name: /\$40\.00/ });
    expect(cierre.className).toMatch(/(^|\s)text-lg(\s|$)/);
    expect(cierre.className).not.toMatch(/(^|\s)text-5xl(\s|$)/);
  });

  it('lo que se hace va antes que lo que se comprueba', () => {
    // Descuento, cliente, propina y método arriba; desglose y pagos abajo. Si
    // alguien invirtiera las dos mitades, el mesero abriría el cobro mirando
    // una suma en vez de la primera decisión que tiene que tomar.
    const { container } = pintar();
    const texto = container.textContent;
    expect(texto.indexOf('Método de Ingreso')).toBeLessThan(
      texto.indexOf('Pagos Registrados'),
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('el umbral es el de la app, no uno propio', () => {
  it('justo en 1024 ya está acoplado', () => {
    // El modal cambiaba en `md` (768) y el resto de la app en 1024. Entre
    // ambos, el modal se ponía a dos columnas sobre un mapa que seguía en una.
    anchoDeVentana(ANCHO_ACOPLADO);
    pintar();
    expect(screen.queryByText('Cobro')).toBeNull();
  });

  it('un píxel por debajo, apilado', () => {
    anchoDeVentana(ANCHO_ACOPLADO - 1);
    pintar();
    expect(screen.getByText('Cobro')).toBeTruthy();
  });
});
