// src/features/catalogos/IngredientesScreen.test.jsx
//
// Dos afirmaciones, y las dos salieron de mirar la base de AZUL el 01-sep:
//
//   1. Con `configuracion.unidades` en `[]` —que es como está AZUL hoy y como
//      nacen los locales— el desplegable de unidad NO se queda vacío.
//   2. Un insumo cuya unidad no está en la lista buena se puede abrir y guardar
//      sin que le cambie la unidad. Éste es el importante: es un cambio de dato
//      en silencio, del tipo que no da error y sólo se ve contando insumos.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
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

import IngredientesScreen from './IngredientesScreen';

/** Los insumos tal como están en AZUL: con `pza` y `lt`, fuera de la lista. */
const INSUMOS = [
  {
    id: 1,
    codigo: 'NOP',
    nombre: 'Nopal',
    categoria: 'Lácteos', // sí, así está en la base
    unidad: 'pza',
    precio: 10,
    stock: 5,
    min: 1,
    activo: true,
  },
];

const montar = (configuracion, productos = INSUMOS) => {
  Object.assign(h.app, {
    productos,
    configuracion,
    showToast: (m) => h.avisos.push(m),
  });
  return render(
    <MemoryRouter>
      <IngredientesScreen />
    </MemoryRouter>,
  );
};

const opcionesDe = (select) =>
  within(select)
    .getAllByRole('option')
    .map((o) => o.value)
    .filter(Boolean);

beforeEach(() => {
  h.enqueued.length = 0;
  h.avisos.length = 0;
  for (const k of Object.keys(h.app)) delete h.app[k];
});

describe('IngredientesScreen · de dónde salen unidades y categorías', () => {
  it('EL CASO DE AZUL: con la configuración en [] el desplegable no se queda vacío', async () => {
    const user = userEvent.setup();
    montar({ unidades: [], categorias_insumo: [] }, []);

    await user.click(screen.getByRole('button', { name: /Nuevo insumo/i }));

    const unidad = await screen.findByLabelText('Unidad de medida');
    // Las ocho de fábrica, que son las mismas que siembra la plantilla.
    expect(opcionesDe(unidad)).toEqual([
      'kg',
      'g',
      'L',
      'ml',
      'pz',
      'paq',
      'caja',
      'bolsa',
    ]);

    const categoria = screen.getByLabelText('Categoría del insumo');
    expect(opcionesDe(categoria)).toContain('Abarrotes');
    expect(opcionesDe(categoria)).toContain('Limpieza');
  });

  it('la lista del local manda sobre la de fábrica', async () => {
    const user = userEvent.setup();
    montar({ unidades: ['kilo', 'litro'], categorias_insumo: ['Cava'] }, []);
    await user.click(screen.getByRole('button', { name: /Nuevo insumo/i }));

    expect(
      opcionesDe(await screen.findByLabelText('Unidad de medida')),
    ).toEqual(['kilo', 'litro']);
    expect(opcionesDe(screen.getByLabelText('Categoría del insumo'))).toContain(
      'Cava',
    );
  });

  it('LA QUE IMPORTA: editar un insumo con unidad fuera de lista no le cambia la unidad', async () => {
    const user = userEvent.setup();
    montar({ unidades: [], categorias_insumo: [] });

    await user.click(screen.getAllByRole('button', { name: 'Editar' })[0]);

    // La unidad guardada sigue seleccionada aunque no esté en la lista buena.
    const unidad = await screen.findByLabelText('Unidad de medida');
    expect(unidad.value).toBe('pza');
    expect(opcionesDe(unidad)).toContain('pza');

    await user.click(screen.getByRole('button', { name: /Guardar Cambios/i }));

    // ── LA AFIRMACIÓN Y SU CONTROL NEGATIVO ─────────────────────────────
    // Control negativo comprobado: quitando las «sueltas» de `lib/Catalogo`,
    // el `select` se queda sin la opción `pza` y esta prueba falla con
    // «expected '' to be 'pza'». Antes del 01-sep, sin la opción vacía que
    // ahora obliga a elegir, ese mismo hueco enseñaba `kg` y lo guardaba: la
    // unidad del insumo cambiada sin que nadie lo pidiera.
    const [tabla, op, registro] = h.enqueued.at(-1);
    expect([tabla, op]).toEqual(['productos', 'upsert']);
    expect(registro.unidad).toBe('pza');
    expect(registro.unidad).not.toBe('kg');
    expect(registro.categoria).toBe('Lácteos');
  });

  it('un insumo nuevo NO llega con la categoría ya elegida', async () => {
    const user = userEvent.setup();
    // Con un insumo en «Lácteos», el código viejo ponía «Lácteos» de salida:
    // así acabaron de lácteos la Arrachera, la cebolla y el nopal.
    montar({ unidades: [], categorias_insumo: [] });

    await user.click(screen.getByRole('button', { name: /Nuevo insumo/i }));

    expect(
      (await screen.findByLabelText('Categoría del insumo')).value,
      'la elige quien captura, no el programa',
    ).toBe('');
    expect(screen.getByLabelText('Unidad de medida').value).toBe('');
  });
});
