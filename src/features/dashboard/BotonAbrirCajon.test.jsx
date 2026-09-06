// src/features/dashboard/BotonAbrirCajon.test.jsx
//
// Este botón es la pieza que faltaba para poder quitar la llave de la caja:
// hasta hoy NO existía forma de abrir el cajón sin cobrar. Lo que se afirma
// aquí es lo que hace que valga: **quién lo abrió queda escrito**, y un PIN que
// no puede abrirlo no abre ni ensucia el registro.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const h = vi.hoisted(() => ({ app: {}, avisos: [], auditoria: [] }));

vi.mock('../../store/useAppStore', () => ({
  useAppStore: Object.assign(() => h.app, {
    setState: () => {},
    getState: () => h.app,
  }),
}));

import BotonAbrirCajon from './BotonAbrirCajon';

const CAJERO = {
  id: 1,
  nombre: 'Sairi',
  rol: 'Cajero',
  pin: '1234',
  activo: true,
};
const MESERO = {
  id: 2,
  nombre: 'Beto',
  rol: 'Mesero',
  pin: '9999',
  activo: true,
};

const ROLES = [
  { rol: 'Cajero', capacidades: { abre_cajon: true } },
  { rol: 'Mesero', capacidades: { abre_cajon: false } },
];

const montar = (abrir = vi.fn().mockResolvedValue({ ok: true })) => {
  Object.assign(h.app, {
    staff: [CAJERO, MESERO],
    roles_permisos: ROLES,
    registrarAuditoria: (f) => h.auditoria.push(f),
    showToast: (m) => h.avisos.push(m),
  });
  render(<BotonAbrirCajon abrir={abrir} />);
  return abrir;
};

const tecleaPin = async (user, pin) => {
  await user.click(screen.getByRole('button', { name: /Abrir cajón/ }));
  await user.type(await screen.findByLabelText('PIN para abrir el cajón'), pin);
  await user.click(screen.getByRole('button', { name: 'Abrir' }));
};

beforeEach(() => {
  h.avisos.length = 0;
  h.auditoria.length = 0;
  for (const k of Object.keys(h.app)) delete h.app[k];
});

describe('BotonAbrirCajon', () => {
  it('LA AFIRMACIÓN: abre y deja el nombre de quien tecleó el PIN', async () => {
    const user = userEvent.setup();
    const abrir = montar();
    await tecleaPin(user, '1234');

    expect(abrir).toHaveBeenCalledWith({ origen: 'manual' });
    expect(h.auditoria).toHaveLength(1);
    expect(h.auditoria[0]).toMatchObject({
      accion: 'CAJON_ABIERTO',
      modulo: 'CAJA',
      usuario: 'Sairi',
    });
    expect(h.auditoria[0].detalles).toMatch(/Apertura manual/);
  });

  it('un PIN sin la capacidad NO abre y NO ensucia el registro', async () => {
    // Registrar un intento fallido como si fuera una apertura estropearía justo
    // el dato que todo esto existe para poder creerse.
    const user = userEvent.setup();
    const abrir = montar();
    await tecleaPin(user, '9999'); // el mesero

    expect(abrir).not.toHaveBeenCalled();
    expect(h.auditoria).toHaveLength(0);
    expect(h.avisos.join(' ')).toMatch(/no puede abrir/i);
  });

  it('un PIN que no es de nadie tampoco', async () => {
    const user = userEvent.setup();
    const abrir = montar();
    await tecleaPin(user, '0000');
    expect(abrir).not.toHaveBeenCalled();
    expect(h.auditoria).toHaveLength(0);
  });

  it('LA QUE MÁS IMPORTA: si el cajón no responde, queda escrito igual', async () => {
    // Es el caso en que alguien va a usar la llave. El único rastro posible es
    // este renglón.
    const user = userEvent.setup();
    montar(vi.fn().mockResolvedValue({ ok: false, error: 'hub apagado' }));
    await tecleaPin(user, '1234');

    expect(h.auditoria).toHaveLength(1);
    expect(h.auditoria[0].nivel).toBe('warning');
    expect(h.auditoria[0].detalles).toMatch(/llave/);
    expect(h.avisos.join(' ')).toMatch(/no respondió/i);
  });

  it('un empleado dado de baja no abre, aunque su PIN siga siendo el mismo', async () => {
    const user = userEvent.setup();
    const abrir = vi.fn();
    Object.assign(h.app, {
      staff: [{ ...CAJERO, activo: false }],
      roles_permisos: ROLES,
      registrarAuditoria: (f) => h.auditoria.push(f),
      showToast: (m) => h.avisos.push(m),
    });
    render(<BotonAbrirCajon abrir={abrir} />);
    await tecleaPin(user, '1234');

    expect(abrir).not.toHaveBeenCalled();
  });
});
