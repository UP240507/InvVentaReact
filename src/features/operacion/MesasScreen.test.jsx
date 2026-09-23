// src/features/operacion/MesasScreen.test.jsx
//
// ── LA AFIRMACIÓN ───────────────────────────────────────────────────────────
// **La tarjeta de la mesa enseña el total con dos decimales como mucho.**
//
// `Intl` sube el máximo a TRES cuando se le fija el mínimo y no se le dice el
// máximo, y aquí el mínimo es cero a propósito —para que una mesa de $300 no
// diga «300.00» en una pantalla que se lee de lejos—. Con eso, una cuenta de
// 123.456 salía como «$123.456» en el salón.
//
// El total de una mesa no es un número redondo por naturaleza: sale de sumar
// líneas con IVA y descuentos. Ver `claude/HALLAZGO_07-SEP_EL_TERCER_DECIMAL.md`.
//
// La segunda es humo de montaje. `MesasScreen.figuras.test.jsx` ya monta esta
// pantalla, pero para afirmar otra cosa —que el inspector exista en estrecho y
// que el toque haga lo que toca en cada figura—, así que el día que esas
// pruebas cambien de forma nadie garantiza que la pantalla siga pintando. Son
// 1700 líneas: basta con borrar un ayudante que sí se usaba.
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const MESA_CON_CUENTA = {
  id: 1,
  nombre: 'Mesa 1',
  estado: 'ocupada',
  capacidad: 4,
  mesa_principal_id: null,
  orden_actual: { total: 123.456, items: [] },
};

const app = {
  mesas: [
    MESA_CON_CUENTA,
    {
      id: 2,
      nombre: 'Mesa 2',
      estado: 'libre',
      capacidad: 2,
      mesa_principal_id: null,
    },
  ],
  productos: [],
  recetas: [],
  comandas: [],
  ventas: [],
  configuracion: { nombre_empresa: 'AZUL' },
  showToast: () => {},
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

import MesasScreen from './MesasScreen';

const monta = () =>
  render(
    <MemoryRouter>
      <MesasScreen />
    </MemoryRouter>,
  );

describe('MesasScreen', () => {
  it('LA AFIRMACIÓN: el total de la mesa no se enseña con tres decimales', () => {
    const { container } = monta();
    const texto = container.textContent;

    expect(texto).toContain('$123.46');
    expect(texto).not.toContain('123.456');
  });

  it('la pantalla monta y pinta sus mesas', () => {
    const { container } = monta();

    expect(container.textContent).toContain('Mesa 1');
    expect(container.textContent).toContain('Mesa 2');
  });
});
