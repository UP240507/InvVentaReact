// src/features/dashboard/CierreTurnoModal.test.jsx
//
// Tres afirmaciones, y las tres son del diseño:
//
//   1. La diferencia sale del CONTEO, nunca de un número tecleado.
//   2. La firma va sobre la CIFRA YA CONTADA, y sólo la puede poner quien tiene
//      `autoriza_arqueo`.
//   3. **El cajón no puede bloquear el cierre.** Si lo bloqueara, un hub caído
//      dejaría al local sin poder cerrar la caja, y la solución de todos sería
//      volver a dejar la llave a mano.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const h = vi.hoisted(() => ({
  app: {},
  cierres: [],
  avisos: [],
  auditoria: [],
  abrio: { ok: true },
}));

vi.mock('../../store/useAppStore', () => ({
  useAppStore: Object.assign(() => h.app, {
    setState: () => {},
    getState: () => h.app,
  }),
  parseUTC: (d) => (d ? new Date(d) : null),
}));
vi.mock('../../store/useSessionStore', () => ({
  useSessionStore: () => ({ empleadoActivo: { nombre: 'Sairi' } }),
}));
vi.mock('../../features/auth/useAuthStore', () => ({
  useAuthStore: () => ({ user: { nombre: 'Chris' } }),
}));
// El pulso del cajón se controla desde la prueba.
vi.mock('../../lib/Hub', () => ({
  abrirCajon: async () => h.abrio,
}));

import CierreTurnoModal from './CierreTurnoModal';

const TURNO = {
  id: 'T1',
  estado: 'abierto',
  fondo_inicial: 1000,
  fecha_apertura: '2026-09-06T14:00:00.000Z',
};

const GERENTE = {
  id: 1,
  nombre: 'Diego',
  rol: 'Gerente',
  pin: '1111',
  activo: true,
};
const CAJERO = {
  id: 2,
  nombre: 'Sairi',
  rol: 'Cajero',
  pin: '2222',
  activo: true,
};
const ROLES = [
  { rol: 'Gerente', capacidades: { autoriza_arqueo: true } },
  { rol: 'Cajero', capacidades: { autoriza_arqueo: false, abre_cajon: true } },
];

const montar = () => {
  Object.assign(h.app, {
    mesas: [],
    ventas: [],
    turnos: [TURNO],
    configuracion: {},
    staff: [GERENTE, CAJERO],
    roles_permisos: ROLES,
    cerrarTurno: async (d) => h.cierres.push(d),
    showToast: (m) => h.avisos.push(m),
    registrarAuditoria: (f) => h.auditoria.push(f),
  });
  render(<CierreTurnoModal onClose={() => {}} />);
};

const contar = async (user, etiqueta, cuantas) => {
  const campo = screen.getByLabelText(`Piezas de ${etiqueta}`);
  await user.clear(campo);
  await user.type(campo, String(cuantas));
};

const firmar = async (user, pin) => {
  await user.type(
    screen.getByLabelText('PIN de quien autoriza el arqueo'),
    pin,
  );
  await user.click(screen.getByRole('button', { name: /Confirmar Cierre/ }));
};

beforeEach(() => {
  h.cierres.length = 0;
  h.avisos.length = 0;
  h.auditoria.length = 0;
  h.abrio = { ok: true };
  for (const k of Object.keys(h.app)) delete h.app[k];
});

describe('CierreTurnoModal', () => {
  it('YA NO HAY DONDE TECLEAR EL EFECTIVO', () => {
    montar();
    for (const t of screen.getAllByLabelText('Total contado'))
      expect(t.tagName).not.toBe('INPUT');
  });

  it('la firma NO se pide antes de contar', () => {
    // Firmar al empezar autorizaría una caja abierta, no una cantidad.
    montar();
    expect(
      screen.queryByLabelText('PIN de quien autoriza el arqueo'),
    ).toBeNull();
  });

  it('LA AFIRMACIÓN: guarda el conteo, el declarado derivado y quién firmó', async () => {
    const user = userEvent.setup();
    montar();

    await contar(user, '$500', 2); // 1000, y el fondo era 1000: cuadra
    await firmar(user, '1111');

    expect(h.cierres).toHaveLength(1);
    const c = h.cierres[0];
    expect(c.efectivo_desglose).toEqual({ 500: 2 });
    expect(c.efectivo_declarado).toBe(1000);
    expect(c.efectivo_esperado).toBe(1000);
    expect(c.diferencia).toBe(0);
    expect(c.arqueo_autorizado_por).toBe('Diego');
  });

  it('la diferencia sale del conteo', async () => {
    const user = userEvent.setup();
    montar();
    await contar(user, '$100', 4); // 400 contra 1000 esperados
    await firmar(user, '1111');
    expect(h.cierres[0].diferencia).toBe(-600);
  });

  it('un PIN sin `autoriza_arqueo` NO cierra el turno', async () => {
    // El cajero puede abrir el cajón para contar, pero no atestigua su propia
    // caja: es la separación entera de las dos capacidades.
    const user = userEvent.setup();
    montar();
    await contar(user, '$500', 2);
    await firmar(user, '2222');

    expect(h.cierres).toHaveLength(0);
    expect(h.avisos.join(' ')).toMatch(/no puede firmar/i);
  });

  it('LA QUE MÁS IMPORTA: si el cajón no abre, el turno SE CIERRA IGUAL', async () => {
    // Si el cierre dependiera del cajón, un hub caído dejaría al local sin
    // poder cerrar la caja — y la solución de todos sería volver a dejar la
    // llave a mano, deshaciendo el diseño entero.
    const user = userEvent.setup();
    h.abrio = { ok: false, error: 'hub apagado' };
    montar();

    await contar(user, '$500', 2);
    await firmar(user, '1111');

    expect(h.cierres).toHaveLength(1);
    // Y el fallo del cajón quedó escrito.
    const cajon = h.auditoria.find((a) => a.accion === 'CAJON_ABIERTO');
    expect(cajon.detalles).toMatch(/llave/);
  });

  it('el arqueo queda en Auditoría con esperado, contado y firma', async () => {
    const user = userEvent.setup();
    montar();
    await contar(user, '$100', 4);
    await firmar(user, '1111');

    const arq = h.auditoria.find((a) => a.accion === 'ARQUEO_DECLARADO');
    expect(arq.detalles).toMatch(/esperado \$1000\.00/);
    expect(arq.detalles).toMatch(/contado \$400\.00/);
    expect(arq.detalles).toMatch(/Firma: Diego/);
    expect(arq.nivel).toBe('warning');
  });
});
