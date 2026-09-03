// src/features/inventario/components/EmpaquesProveedor.test.jsx
//
// Lo que esta prueba cuida no es la aritmética —eso vive en `lib/Empaques` con
// sus 27 pruebas— sino **el cableado**: que la fila salga hacia la tabla que
// se llama `proveedor_producto`, con esas letras. Un nombre de tabla mal
// escrito aquí no da error en pantalla: `enqueueAction` hace
// `localDB[tabla].put(...)`, el `catch` escribe en consola, y la cola manda a
// la nube una tabla que no existe. Se guardó, dice la pantalla.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const h = vi.hoisted(() => ({ enqueued: [], app: {}, avisos: [] }));

vi.mock('../../../store/useAppStore', () => ({
  useAppStore: Object.assign(() => h.app, {
    setState: () => {},
    getState: () => h.app,
  }),
}));
vi.mock('../../../store/useSyncStore', () => ({
  useSyncStore: () => ({ enqueueAction: (...a) => h.enqueued.push(a) }),
}));

import EmpaquesProveedor from './EmpaquesProveedor';

const NARANJA = { id: 10, nombre: 'Naranja', unidad: 'kg', activo: true };
const QUESOS = { id: 1, nombre: 'Quesos' };

const montar = (proveedorProducto = []) => {
  Object.assign(h.app, {
    productos: [NARANJA],
    proveedorProducto,
    showToast: (m) => h.avisos.push(m),
  });
  return render(<EmpaquesProveedor proveedor={QUESOS} onCerrar={() => {}} />);
};

const altaDe = async (
  user,
  { insumo = '10', nombre = 'arpilla', trae = '30' } = {},
) => {
  await user.selectOptions(screen.getByLabelText('Insumo del empaque'), insumo);
  await user.clear(screen.getByLabelText('Nombre del empaque'));
  // `type` con cadena vacia revienta: dejarlo vacio es no teclear.
  if (nombre)
    await user.type(screen.getByLabelText('Nombre del empaque'), nombre);
  await user.clear(screen.getByLabelText('Unidades por empaque'));
  if (trae)
    await user.type(screen.getByLabelText('Unidades por empaque'), trae);
  await user.click(screen.getByRole('button', { name: /Agregar/ }));
};

beforeEach(() => {
  h.enqueued.length = 0;
  h.avisos.length = 0;
  for (const k of Object.keys(h.app)) delete h.app[k];
});

describe('EmpaquesProveedor', () => {
  it('EL CABLEADO: la fila sale hacia `proveedor_producto`', async () => {
    const user = userEvent.setup();
    montar();
    await altaDe(user);

    expect(h.enqueued).toHaveLength(1);
    const [tabla, op, fila] = h.enqueued[0];
    expect(tabla).toBe('proveedor_producto');
    expect(op).toBe('upsert');
    expect(fila).toMatchObject({
      proveedor_id: 1,
      producto_id: '10',
      nombre: 'arpilla',
      factor: 30,
      activo: true,
    });
    expect(fila.id).toBeTruthy();
  });

  it('sin nombre no se manda nada, y se dice por qué', async () => {
    const user = userEvent.setup();
    montar();
    await altaDe(user, { nombre: '' });

    expect(h.enqueued).toHaveLength(0);
    expect(h.avisos.join(' ')).toMatch(/nombre/i);
  });

  it('un factor en cero no se convierte en uno', async () => {
    // Poner 1 inventaría una equivalencia —"esta arpilla trae un kilo"— y ese
    // número entraría al costo de todos los platillos sin que nadie lo viera.
    const user = userEvent.setup();
    montar();
    await altaDe(user, { trae: '0' });

    expect(h.enqueued).toHaveLength(0);
    expect(h.avisos.join(' ')).toMatch(/cero/i);
  });

  it('la lista enseña el empaque con su unidad', async () => {
    montar([
      {
        id: 5,
        proveedor_id: 1,
        producto_id: 10,
        nombre: 'arpilla',
        factor: 30,
        activo: true,
      },
    ]);
    expect(await screen.findByText('arpilla (30 kg)')).toBeTruthy();
    expect(screen.getByText('Naranja')).toBeTruthy();
  });

  it('los apagados siguen a la vista, para poder encenderlos', async () => {
    // Si se escondieran, un empaque apagado quedaría inalcanzable: no habría
    // forma de volver a usarlo desde ninguna pantalla.
    const user = userEvent.setup();
    montar([
      {
        id: 5,
        proveedor_id: 1,
        producto_id: 10,
        nombre: 'arpilla',
        factor: 30,
        activo: false,
      },
    ]);
    expect(screen.getByText('Apagado')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Volver a usarlo' }));
    expect(h.enqueued.at(-1)[2]).toMatchObject({ id: 5, activo: true });
  });

  it('los empaques de OTRO proveedor no salen aquí', async () => {
    montar([
      {
        id: 7,
        proveedor_id: 2,
        producto_id: 10,
        nombre: 'reja',
        factor: 20,
        activo: true,
      },
    ]);
    expect(screen.queryByText('reja (20 kg)')).toBeNull();
    expect(screen.getByText('Sin empaques todavía')).toBeTruthy();
  });
});
