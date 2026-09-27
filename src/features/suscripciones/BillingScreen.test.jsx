// src/features/suscripciones/BillingScreen.test.jsx
//
// ── LA AFIRMACIÓN ───────────────────────────────────────────────────────────
// **Cuando falta la fecha de vencimiento, la pantalla lo DICE.**
//
// La decisión del 26-sep es ventana de cortesía + aviso. La ventana la defiende
// `usePlan.test.js`; el aviso sólo sirve si de verdad aparece en pantalla, y
// una bandera que nadie renderiza es exactamente el fallo que esta decisión
// quería evitar: la caja abierta por cortesía y nadie enterado de que el
// webhook de Stripe dejó de escribir la fecha.
//
// Se prueba también el caso contrario: con fecha buena el aviso NO sale. Un
// aviso permanente deja de ser un aviso.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

const h = vi.hoisted(() => ({ plan: null }));

vi.mock('../../hooks/usePlan', () => ({ usePlan: () => h.plan }));
vi.mock('../auth/useAuthStore', () => ({
  useAuthStore: () => ({ user: { nombre_negocio: 'AZUL' } }),
}));
vi.mock('../../store/useAppStore', () => ({
  useAppStore: (sel) => sel({ staff: [], configuracion: {} }),
}));
vi.mock('./checkout', () => ({
  iniciarCheckout: vi.fn(),
  abrirPortal: vi.fn(),
  cargarCatalogo: () => Promise.resolve({ planes: [], addons: [] }),
  precioMXN: (c) => `$${(c ?? 0) / 100}`,
}));
vi.mock('react-router-dom', () => ({
  useSearchParams: () => [new URLSearchParams()],
}));

const BASE = {
  suscripcion: {
    plan: 'basico',
    estado: 'activo',
    stripe_subscription_id: 'sub_1',
    addons: [],
  },
  planNombre: 'Básico',
  estado: 'activo',
  vigente: true,
  limiteEmpleados: 10,
  modulos: [],
  diasRestantes: 6,
  sinFechaVencimiento: false,
};

let BillingScreen;
beforeEach(async () => {
  ({ default: BillingScreen } = await import('./BillingScreen'));
});

const AVISO = /no tenemos la fecha de tu próximo cobro/i;

describe('BillingScreen · el aviso de la fecha que falta', () => {
  it('LA AFIRMACIÓN: con la bandera prendida, el aviso está en pantalla', () => {
    h.plan = { ...BASE, sinFechaVencimiento: true };
    render(<BillingScreen />);
    expect(screen.getByText(AVISO)).toBeTruthy();
  });

  it('dice cuántos días queda abierta la cuenta', () => {
    h.plan = { ...BASE, sinFechaVencimiento: true, diasRestantes: 6 };
    render(<BillingScreen />);
    expect(screen.getByText(/6 días más/i)).toBeTruthy();
  });

  it('con un solo día, lo dice en singular', () => {
    h.plan = { ...BASE, sinFechaVencimiento: true, diasRestantes: 1 };
    render(<BillingScreen />);
    expect(screen.getByText(/1 día más/i)).toBeTruthy();
  });

  it('con la ventana ya agotada, avisa sin prometer días', () => {
    // `vigente: true` con `diasRestantes: 0` es imposible —el redondeo hacia
    // arriba de `derivarPlan` lo impide—, y el primer intento de esta prueba
    // lo usó de todos modos: chocó con el «· 0 días» de la tarjeta del plan.
    // El caso real de ventana agotada es cuenta NO vigente.
    h.plan = {
      ...BASE,
      vigente: false,
      sinFechaVencimiento: true,
      diasRestantes: 0,
    };
    render(<BillingScreen />);
    const aviso = screen.getByText(AVISO);
    expect(aviso).toBeTruthy();
    expect(aviso.textContent).not.toMatch(/día/i);
  });

  it('CONTROL: con la fecha en su lugar, no hay aviso', () => {
    h.plan = { ...BASE, sinFechaVencimiento: false };
    render(<BillingScreen />);
    expect(screen.queryByText(AVISO)).toBeNull();
  });
});
