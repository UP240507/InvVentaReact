// src/features/catalogos/RecetasScreen.test.jsx
//
// Recetas plantilla (06-oct). AZUL carga las recetas con sus ingredientes en 0
// y el dueño pone las porciones desde esta pantalla. Lo que se fija aquí es el
// cableado, porque la lógica ya tiene sus pruebas en lib/Recetas.test.js:
//
//   1. Una receta a medias SE NOTA en la lista y no enseña un margen inventado.
//   2. La cantidad se edita en su lugar, y Enter no guarda a media captura.
//   3. Volver a agregar un ingrediente reemplaza su cantidad: no suma.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, within, fireEvent } from '@testing-library/react';
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

import RecetasScreen from './RecetasScreen';

const PRODUCTOS = [
  { id: 11, nombre: 'Leche Entera', unidad: 'ml', precio: 0.025, activo: true },
  { id: 12, nombre: 'Café en grano', unidad: 'g', precio: 0.4, activo: true },
];

// Una plantilla tal como se va a cargar: ingredientes puestos, cantidades en 0.
const PLANTILLA = {
  id: 501,
  nombre: 'Frappuchino Natural',
  categoria: 'Café frío',
  precio_venta: 75,
  insumos: [
    { productoId: 11, cantidad: 0, merma: 0 },
    { productoId: 12, cantidad: 0, merma: 0 },
  ],
  grupos_modificadores: [],
  activo: true,
};
const COMPLETA = {
  id: 502,
  nombre: 'Americano',
  categoria: 'Café caliente',
  precio_venta: 41,
  insumos: [{ productoId: 12, cantidad: 18, merma: 0 }],
  grupos_modificadores: [],
  activo: true,
};

const montar = (recetas = [PLANTILLA, COMPLETA]) => {
  Object.assign(h.app, {
    recetas,
    productos: PRODUCTOS,
    modificadores: [],
    configuracion: { categorias: [] },
    showToast: (m) => h.avisos.push(m),
    upsertReceta: vi.fn(),
  });
  return render(
    <MemoryRouter>
      <RecetasScreen />
    </MemoryRouter>,
  );
};

const abrirPlantilla = async (user) => {
  fireEvent.doubleClick(screen.getByText('Frappuchino Natural'));
  await user.click(
    await screen.findByRole('button', { name: /Explosión de Insumos/i }),
  );
};

beforeEach(() => {
  h.enqueued.length = 0;
  h.avisos.length = 0;
  for (const k of Object.keys(h.app)) delete h.app[k];
});

describe('RecetasScreen · recetas plantilla', () => {
  it('la lista marca la plantilla como pendiente y no enseña su margen', () => {
    montar();
    expect(screen.getByText(/2 cantidades pendientes/i)).toBeTruthy();
    // El margen de una receta con costo 0 saldría 100 % en verde.
    expect(screen.getByText('Incompleta')).toBeTruthy();
    expect(screen.queryByText('100.0%')).toBeNull();
  });

  it('el filtro Pendientes deja sólo lo que falta por capturar', async () => {
    const user = userEvent.setup();
    montar();
    await user.click(screen.getByRole('tab', { name: 'Pendientes' }));
    expect(screen.getByText('Frappuchino Natural')).toBeTruthy();
    expect(screen.queryByText('Americano')).toBeNull();
  });

  it('la cantidad se escribe en su lugar y Enter salta a la siguiente sin guardar', async () => {
    const user = userEvent.setup();
    montar();
    await abrirPlantilla(user);

    const leche = screen.getByLabelText(/Cantidad de Leche Entera en ml/);
    const cafe = screen.getByLabelText(/Cantidad de Café en grano en g/);
    await user.type(leche, '100{Enter}');

    expect(document.activeElement).toBe(cafe);
    expect(h.enqueued).toHaveLength(0); // Enter NO guardó la receta
    // user-event no simula el envío implícito cuando el botón de guardar vive
    // fuera del <form> (`form="formReceta"`), así que lo de arriba solo no
    // prueba nada. Lo que de verdad impide guardar es cancelar el Enter:
    // `fireEvent` devuelve false cuando el evento quedó cancelado.
    expect(fireEvent.keyDown(leche, { key: 'Enter' })).toBe(false);
    await user.type(cafe, '18');

    await user.click(
      screen.getByRole('button', { name: /Guardar|Actualizar/i }),
    );
    const guardada = h.enqueued.find((a) => a[0] === 'recetas')?.[2];
    expect(guardada.insumos).toEqual([
      { productoId: 11, cantidad: 100, merma: 0 },
      { productoId: 12, cantidad: 18, merma: 0 },
    ]);
  });

  it('una porción en la unidad equivocada avisa al lado del campo', async () => {
    const user = userEvent.setup();
    montar();
    await abrirPlantilla(user);
    // 0.1 en un insumo en ml: se pensaba en litros.
    await user.type(screen.getByLabelText(/Cantidad de Leche Entera/), '0.1');
    expect(screen.getByRole('alert').textContent).toMatch(/litros/);
  });

  it('volver a agregar un ingrediente le pone la cantidad nueva: no suma', async () => {
    // El fallo de antes: el Americano llevaba 18 g, se tecleaba 20 para
    // corregir y quedaba en 38.
    const user = userEvent.setup();
    montar();
    fireEvent.doubleClick(screen.getByText('Americano'));
    await user.click(
      await screen.findByRole('button', { name: /Explosión de Insumos/i }),
    );
    await user.type(
      screen.getByPlaceholderText(/buscar en el almacén/i),
      'Café{Enter}',
    );
    await user.type(screen.getByPlaceholderText('Cant.'), '20{Enter}');

    expect(screen.getByLabelText(/Cantidad de Café en grano/).value).toBe('20');
    expect(h.avisos.some((m) => /ya estaba con 18/.test(m))).toBe(true);
  });
});
