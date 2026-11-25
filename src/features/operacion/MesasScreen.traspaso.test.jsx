// src/features/operacion/MesasScreen.traspaso.test.jsx
//
// ── H1, LA SALIDA RÁPIDA (0.3.4, Chris 25-nov) ──────────────────────────────
// Al imprimir la cuenta la mesa queda `por_cobrar` y el POS sólo deja tocarla
// reabriéndola con PIN. Pero «Traspasar» seguía en Mesas para cualquier mesa
// que no estuviera libre: se podían sacar líneas de una cuenta ya impresa sin
// PIN (confirmado en campo el 17-nov). El arreglo de fondo va con la fase 3,
// que rehace Mesas; esto sólo cierra la puerta: con la cuenta impresa no se
// traspasa, ni desde la tarjeta, ni desde el inspector, ni con la tecla T.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { puedeTraspasar } from '../../lib/OrdenMesa';

const linea = { id: 7, nombre: 'Jugo', precio: 40, cantidad: 1 };

const h = vi.hoisted(() => ({ toasts: [] }));

const app = {
  mesas: [
    {
      id: 1,
      nombre: '11',
      estado: 'ocupada',
      capacidad: 4,
      mesa_principal_id: null,
      orden_actual: { total: 40, items: [linea] },
    },
    {
      id: 2,
      nombre: '12',
      estado: 'por_cobrar',
      capacidad: 4,
      mesa_principal_id: null,
      orden_actual: { total: 40, items: [linea], folio: 'X-1' },
    },
  ],
  productos: [],
  recetas: [],
  comandas: [],
  ventas: [],
  configuracion: { nombre_empresa: 'AZUL' },
  showToast: (...a) => h.toasts.push(a),
};

vi.mock('../../store/useAppStore', () => ({
  useAppStore: Object.assign(() => app, {
    setState: () => {},
    getState: () => app,
  }),
  parseUTC: (s) => new Date(s),
}));
vi.mock('../../store/useSyncStore', () => ({
  useSyncStore: Object.assign(() => ({ enqueueAction: () => {} }), {
    getState: () => ({ enqueueAction: () => {} }),
  }),
}));
vi.mock('../auth/useAuthStore', () => ({
  useAuthStore: Object.assign(() => ({ user: null }), {
    getState: () => ({ user: null, restauranteId: 'r' }),
  }),
}));

import MesasScreen from './MesasScreen';

beforeEach(() => {
  h.toasts.length = 0;
  // jsdom no implementa scrollIntoView; las flechas lo llaman al mover.
  Element.prototype.scrollIntoView = () => {};
});

describe('puedeTraspasar', () => {
  it('sólo una mesa ocupada con algo en la cuenta', () => {
    expect(puedeTraspasar(app.mesas[0])).toBe(true);
    expect(puedeTraspasar(app.mesas[1])).toBe(false); // cuenta impresa
    expect(
      puedeTraspasar({ estado: 'ocupada', orden_actual: { items: [] } }),
    ).toBe(false);
    expect(puedeTraspasar({ estado: 'libre' })).toBe(false);
    expect(puedeTraspasar({ estado: 'reservada' })).toBe(false);
    expect(puedeTraspasar(null)).toBe(false);
  });
});

describe('Mesas: con la cuenta impresa no se traspasa', () => {
  const monta = () =>
    render(
      <MemoryRouter>
        <MesasScreen />
      </MemoryRouter>,
    );

  it('la tarjeta de la mesa que pidió la cuenta no ofrece «Traspasar»', () => {
    monta();
    // ── LA AFIRMACIÓN, Y SU CONTROL NEGATIVO ───────────────────────────────
    // Con `21684a4` salían dos: la 11 (ocupada) y la 12 (cuenta impresa).
    expect(screen.getAllByTitle('Traspasar Artículos')).toHaveLength(1);
  });

  // La 11 va primero y la selección arranca en ella; la flecha pasa a la 12.
  const aLaDoce = () => fireEvent.keyDown(window, { key: 'ArrowRight' });
  const botonInspector = () =>
    screen.getByRole('button', { name: /Traspasar cuenta/ });

  it('el inspector deja traspasar la ocupada y no la que pidió la cuenta', () => {
    monta();
    expect(botonInspector()).not.toBeDisabled();
    aLaDoce();
    expect(botonInspector()).toBeDisabled();
  });

  it('la tecla T sobre la mesa que pidió la cuenta avisa y no abre el cuadro', () => {
    monta();
    aLaDoce();
    fireEvent.keyDown(window, { key: 't' });
    expect(screen.queryByText(/^Traspaso/)).toBeNull();
    expect(h.toasts.at(-1)?.[0]).toMatch(/reábrela con PIN/);
  });

  it('la tecla T sobre la ocupada sí abre el cuadro', () => {
    monta();
    fireEvent.keyDown(window, { key: 't' });
    expect(screen.getByText(/^Traspaso/)).toBeInTheDocument();
  });
});
