// src/features/pos/PosScreen.integration.test.jsx
// Integración del cobro: render real de PosScreen + ModalCobro + motor fiscal.
// Mockea los stores (useAppStore/useSyncStore/useAuthStore) y captura el payload
// de venta encolado para probar que IVA/subtotal salen del motor y la propina
// queda FUERA de la base gravable (regresión D4 en el flujo completo).
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

// Estado compartido con los mocks (hoisted: accesible dentro de vi.mock)
const h = vi.hoisted(() => ({ enqueued: [], app: {} }));

vi.mock('../../store/useAppStore', () => ({
  useAppStore: Object.assign(() => h.app, {
    setState: () => {},
    getState: () => h.app,
  }),
  parseUTC: (s) => (s ? new Date(s) : null),
}));
vi.mock('../../store/useSyncStore', () => ({
  useSyncStore: () => ({
    enqueueAction: (...a) => h.enqueued.push(a),
    descontarStockVenta: () => {},
  }),
}));
vi.mock('../auth/useAuthStore', () => ({
  useAuthStore: Object.assign(() => ({ user: { nombre: 'Cajero Test' } }), {
    getState: () => ({
      restauranteId: 'rid-test-123',
      user: { nombre: 'Cajero Test' },
    }),
  }),
}));
vi.mock('./components/TicketImpresion', () => ({ default: () => null }));

import PosScreen from './PosScreen';

beforeEach(() => {
  h.enqueued.length = 0;
  Object.keys(h.app).forEach((k) => delete h.app[k]);
  Object.assign(h.app, {
    recetas: [
      { id: 1, nombre: 'Pizza', precio_venta: 100, categoria: 'Platillos' },
    ],
    productos: [],
    mesas: [],
    getIva: () => 0.16,
    descontarStock: vi.fn(),
    showToast: vi.fn(),
    configuracion: { precios_incluyen_iva: true }, // MX: precio ya trae IVA
    registrarComandaKDS: vi.fn(),
    registrarAuditoria: vi.fn(),
  });
});

const ventaEncolada = () =>
  h.enqueued.find((a) => a[0] === 'ventas' && a[1] === 'insert')?.[2];

describe('Integración cobro · PosScreen → ModalCobro → venta', () => {
  it('directa $100 (IVA incl.) + propina 20%: IVA=13.79, subtotal=86.21, propina fuera de base (D4)', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <PosScreen />
      </MemoryRouter>,
    );

    await user.click(screen.getByRole('button', { name: /Pizza/ }));
    await user.click(screen.getByRole('button', { name: /Cobrar Ticket/ }));
    await user.click(await screen.findByRole('button', { name: '20%' }));
    await user.click(screen.getByRole('button', { name: /Pagar Restante/ }));
    await user.click(
      screen.getByRole('button', { name: /Confirmar y Cerrar Cuenta/ }),
    );

    const venta = ventaEncolada();
    expect(venta).toBeTruthy();
    expect(venta.restaurante_id).toBe('rid-test-123'); // RLS
    expect(venta.subtotal).toBe(86.21);
    expect(venta.iva).toBe(13.79); // NO 16.55 (IVA sobre propina)
    expect(venta.propina).toBe(20);
    expect(venta.total).toBe(120);
    expect(
      Math.round((venta.subtotal + venta.iva + venta.propina) * 100) / 100,
    ).toBe(venta.total);
  });

  it('directa sin propina: total = precio de menú (no suma 16% encima)', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <PosScreen />
      </MemoryRouter>,
    );

    await user.click(screen.getByRole('button', { name: /Pizza/ }));
    await user.click(screen.getByRole('button', { name: /Cobrar Ticket/ }));
    await user.click(
      await screen.findByRole('button', { name: /Pagar Restante/ }),
    );
    await user.click(
      screen.getByRole('button', { name: /Confirmar y Cerrar Cuenta/ }),
    );

    const venta = ventaEncolada();
    expect(venta.total).toBe(100);
    expect(venta.subtotal).toBe(86.21);
    expect(venta.iva).toBe(13.79);
    expect(venta.propina).toBe(0);
  });
});
