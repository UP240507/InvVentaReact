// src/features/catalogos/ModificadoresScreen.test.jsx
//
// Esta pantalla no tenía ninguna prueba. Nace el 07-oct con la opción que
// SUSTITUYE: «Deslactosada» cambia la leche entera de cada receta por la suya
// en la cantidad de esa receta, en vez de agregar una cantidad fija. Lo que
// se fija aquí es que lo que se elige en la pantalla llegue tal cual al grupo
// que se guarda, que es lo que lee el POS.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

const h = vi.hoisted(() => ({ enqueued: [], app: {}, avisos: [] }));

vi.mock('../../store/useAppStore', () => ({
  useAppStore: Object.assign(() => h.app, {
    setState: () => {},
    getState: () => h.app,
  }),
}));
vi.mock('../../store/useSyncStore', () => ({
  useSyncStore: () => ({ enqueueAction: (...a) => h.enqueued.push(a) }),
}));
vi.mock('../auth/useAuthStore', () => ({
  useAuthStore: Object.assign(() => ({ user: { nombre: 'Admin Test' } }), {
    getState: () => ({ restauranteId: 'rid-test-123' }),
  }),
}));

import ModificadoresScreen from './ModificadoresScreen';

const PRODUCTOS = [
  { id: 503, nombre: 'Leche Entera', unidad: 'ml', activo: true },
  { id: 505, nombre: 'Leche Deslactosada', unidad: 'ml', activo: true },
];

beforeEach(() => {
  h.enqueued.length = 0;
  h.avisos.length = 0;
  for (const k of Object.keys(h.app)) delete h.app[k];
  Object.assign(h.app, {
    modificadores: [],
    productos: PRODUCTOS,
    recetas: [],
    showToast: (m) => h.avisos.push(m),
  });
});

const abrirYNombrar = async (user) => {
  render(
    <MemoryRouter>
      <ModificadoresScreen />
    </MemoryRouter>,
  );
  await user.click(screen.getByRole('button', { name: /Nuevo grupo/i }));
  await user.type(
    screen.getByPlaceholderText(/Tipo de Leche/),
    'Tipo de leche',
  );
  await user.type(screen.getByPlaceholderText(/Extra Tocino/), 'Deslactosada');
  const costo = screen.getByPlaceholderText('Costo');
  await user.clear(costo);
  await user.type(costo, '6');
  await user.selectOptions(
    screen.getByDisplayValue('No afecta inventario'),
    '505',
  );
};

const grupoGuardado = () =>
  h.enqueued.find((a) => a[0] === 'modificadores')?.[2];

describe('ModificadoresScreen · opción que sustituye', () => {
  it('«En lugar de» guarda a quién sustituye y no pide cantidad', async () => {
    const user = userEvent.setup();
    await abrirYNombrar(user);
    await user.selectOptions(
      screen.getByLabelText('Cómo afecta la receta'),
      '503',
    );
    // Al sustituir, la cantidad es la de cada receta: el campo desaparece.
    expect(screen.queryByPlaceholderText('Cant.')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Agregar' }));

    expect(
      screen.getByText(/Cambia Leche Entera por Leche Deslactosada/),
    ).toBeTruthy();

    await user.click(
      screen.getByRole('button', { name: /Crear Grupo de Modificadores/ }),
    );
    const [op] = grupoGuardado().opciones;
    expect(op).toMatchObject({
      nombre: 'Deslactosada',
      precio_extra: 6,
      id_producto: 505,
      sustituye: 503,
      cantidad: 0,
    });
  });

  it('«Además de la receta» sigue agregando una cantidad fija, como antes', async () => {
    const user = userEvent.setup();
    await abrirYNombrar(user);
    await user.type(screen.getByPlaceholderText('Cant.'), '30');
    await user.click(screen.getByRole('button', { name: 'Agregar' }));
    await user.click(
      screen.getByRole('button', { name: /Crear Grupo de Modificadores/ }),
    );
    const [op] = grupoGuardado().opciones;
    expect(op).toMatchObject({
      id_producto: 505,
      cantidad: 30,
      sustituye: null,
    });
  });

  it('el selector no ofrece sustituir un insumo por sí mismo', async () => {
    const user = userEvent.setup();
    await abrirYNombrar(user);
    const opciones = [
      ...screen
        .getByLabelText('Cómo afecta la receta')
        .querySelectorAll('option'),
    ].map((o) => o.textContent);
    expect(opciones).toEqual([
      'Además de la receta',
      'En lugar de: Leche Entera',
    ]);
  });
});
