// src/features/inventario/MermasScreen.test.jsx
//
// ── LA AFIRMACIÓN ───────────────────────────────────────────────────────────
// **Un ajuste de inventario escribe un NÚMERO en el stock.**
//
// Suena a perogrullada hasta que se mira cómo se calcula: `nuevoStock` se
// declara arriba y lo asigna una de dos ramas —alta o baja—, y lo que se
// encola es lo que valga esa variable. Si una rama dejara de asignarlo, el
// stock del insumo se guardaría como `undefined` y el movimiento diría
// `stock_nuevo: undefined`. No hay excepción: Dexie y Supabase aceptan el
// campo, y el inventario queda roto sin que nada avise.
//
// Esta pantalla no tenía NINGUNA prueba, y es de las pocas que escriben
// directamente sobre el stock.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const h = vi.hoisted(() => ({ encolado: [], avisos: [] }));

const NARANJA = {
  id: 10,
  nombre: 'Naranja',
  unidad: 'kg',
  stock: 50,
  activo: true,
  restaurante_id: 'rid',
};

const app = {
  productos: [NARANJA],
  movimientos: [],
  configuracion: { nombre_empresa: 'AZUL' },
  showToast: (m, t) => h.avisos.push([m, t]),
};

vi.mock('../../store/useAppStore', () => ({
  useAppStore: Object.assign(() => app, {
    setState: () => {},
    getState: () => app,
  }),
}));
vi.mock('../../store/useSyncStore', () => ({
  useSyncStore: () => ({ enqueueAction: (...a) => h.encolado.push(a) }),
}));
vi.mock('../auth/useAuthStore', () => ({
  useAuthStore: Object.assign(() => ({ user: { nombre: 'Admin' } }), {
    getState: () => ({ restauranteId: 'rid' }),
  }),
}));

import MermasScreen from './MermasScreen';

/** Rellena el cuadro de ajuste y lo confirma. Devuelve lo que se encoló. */
async function ajustar(tipo, cantidad) {
  const user = userEvent.setup();
  const { container, unmount } = render(<MermasScreen />);

  const botones = [...container.querySelectorAll('button')];
  await user.click(botones.find((b) => /nuevo|ajuste/i.test(b.textContent)));

  const selects = container.querySelectorAll('select');
  await user.selectOptions(selects[0], String(NARANJA.id));
  await user.selectOptions(selects[1], tipo);
  await user.type(
    container.querySelector('input[type="number"]'),
    String(cantidad),
  );
  await user.type(container.querySelector('textarea'), 'prueba');

  const confirmar = [
    ...container.querySelectorAll('button[type="submit"]'),
  ].pop();
  await user.click(confirmar);
  unmount();

  return {
    producto: h.encolado.find((e) => e[0] === 'productos')?.[2],
    movimiento: h.encolado.find((e) => e[0] === 'movimientos')?.[2],
  };
}

describe('MermasScreen · el stock ajustado es un número', () => {
  beforeEach(() => {
    h.encolado.length = 0;
    h.avisos.length = 0;
  });

  it('LA AFIRMACIÓN: una merma de 8 sobre 50 deja 42, en el producto y en el movimiento', async () => {
    const { producto, movimiento } = await ajustar('Merma', 8);

    expect(producto.stock).toBe(42);
    expect(movimiento.stock_nuevo).toBe(42);
    expect(movimiento.stock_anterior).toBe(50);
    // Lo que de verdad se vigila: que no sea `undefined` ni `NaN`.
    expect(Number.isFinite(producto.stock)).toBe(true);
  });

  it('un alta de 8 sobre 50 deja 58', async () => {
    const { producto, movimiento } = await ajustar('Alta de Inventario', 8);

    expect(producto.stock).toBe(58);
    expect(movimiento.stock_nuevo).toBe(58);
    expect(Number.isFinite(producto.stock)).toBe(true);
  });

  it('el tipo de movimiento distingue la merma del ajuste', async () => {
    const { movimiento: merma } = await ajustar('Merma', 1);
    expect(merma.tipo).toBe('Merma');

    h.encolado.length = 0;
    const { movimiento: alta } = await ajustar('Alta de Inventario', 1);
    expect(alta.tipo).toBe('Ajuste');
  });

  it('no se puede dar de baja más de lo que hay: no encola nada y lo dice', async () => {
    const { producto } = await ajustar('Merma', 999);

    expect(producto).toBeUndefined();
    expect(h.encolado).toHaveLength(0);
    expect(h.avisos.some(([m]) => /no puedes dar de baja/i.test(m))).toBe(true);
  });
});
