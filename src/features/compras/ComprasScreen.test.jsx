// src/features/compras/ComprasScreen.test.jsx
//
// Una afirmación: **la orden emitida guarda la IDENTIDAD del proveedor, no
// sólo su nombre.** El nombre se elegía del catálogo y se tiraba el id
// (`:162` guardaba `.nombre`), así que la única forma de volver a saber quién
// era la orden era comparar cadenas — y corregir un nombre en el catálogo
// dejaba a sus órdenes anteriores sin destinatario, sin dar error.
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
vi.mock('../../lib/Auditoria', () => ({ registrarAuditoria: () => {} }));

import ComprasScreen from './ComprasScreen';

const QUESOS = {
  id: 1,
  nombre: 'Quesos',
  telefono: '449 123 4567',
  email: 'quesos@ejemplo.mx',
  activo: true,
};
const SIN_TELEFONO = { id: 2, nombre: 'Emma', activo: true };

const montar = () => {
  Object.assign(h.app, {
    productos: [
      {
        id: 10,
        nombre: 'Queso Manchego',
        unidad: 'kg',
        precio: 100,
        activo: true,
      },
    ],
    proveedores: [QUESOS, SIN_TELEFONO],
    ordenesCompra: [],
    configuracion: { nombre_empresa: 'AZUL' },
    showToast: (m) => h.avisos.push(m),
  });
  return render(
    <MemoryRouter>
      <ComprasScreen />
    </MemoryRouter>,
  );
};

beforeEach(() => {
  h.enqueued.length = 0;
  h.avisos.length = 0;
  for (const k of Object.keys(h.app)) delete h.app[k];
});

describe('ComprasScreen · la orden sabe quién es su proveedor', () => {
  it('LA AFIRMACIÓN: la orden emitida lleva `proveedor_id`, no sólo el nombre', async () => {
    const user = userEvent.setup();
    montar();

    await user.click(screen.getByRole('tab', { name: 'Generar orden' }));
    await user.click(await screen.findByRole('button', { name: /Quesos/ }));

    await user.selectOptions(await screen.findByLabelText('Insumo'), '10');
    await user.clear(screen.getByLabelText('Cantidad'));
    await user.type(screen.getByLabelText('Cantidad'), '3');
    await user.click(
      screen.getByRole('button', { name: 'Agregar a la orden' }),
    );

    await user.click(
      await screen.findByRole('button', { name: /Emitir Orden/ }),
    );

    const [tabla, op, orden] = h.enqueued.at(-1);
    expect([tabla, op]).toEqual(['ordenes_compra', 'upsert']);

    // ── LA AFIRMACIÓN Y SU CONTROL NEGATIVO ─────────────────────────────
    // Sin la línea del arreglo esto sale `undefined`, y entonces la única
    // forma de saber de quién es la orden vuelve a ser comparar el nombre.
    expect(orden.proveedor_id).toBe(1);
    expect(orden.proveedor_id).not.toBeUndefined();

    // Y el nombre se conserva: es cómo se llamaba el día de la orden.
    expect(orden.proveedor).toBe('Quesos');
  });
});
