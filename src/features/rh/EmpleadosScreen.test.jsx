// src/features/rh/EmpleadosScreen.test.jsx
//
// ── LA AFIRMACIÓN ───────────────────────────────────────────────────────────
// **Guardar un empleado deja en Auditoría quién lo hizo, en todos los caminos
// que escriben la fila.**
//
// Hasta el 26-oct la fila de auditoría decía `usuario: 'Administrador'` fijo:
// un cambio de sueldo, rol o PIN no registraba quién fue. Y se escribía al
// final, así que la edición sin conexión —que sí guarda la fila— salía antes
// sin dejar rastro. Ver `claude/CENSO_21-OCT_OPERATIVO_CONTRA_ADMINISTRATIVO.md`
// §2.2, nota ³.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

const h = vi.hoisted(() => ({
  app: {},
  auditado: [],
  encolado: [],
  empleadoActivo: null,
}));

vi.mock('../../store/useAppStore', () => {
  const useAppStore = (sel) => (typeof sel === 'function' ? sel(h.app) : h.app);
  useAppStore.setState = (fn) => Object.assign(h.app, fn(h.app));
  useAppStore.getState = () => h.app;
  return { useAppStore, parseUTC: (s) => (s ? new Date(s) : null) };
});
vi.mock('../../store/useSyncStore', () => {
  const enqueueAction = (tabla, op, fila) =>
    h.encolado.push({ tabla, op, fila });
  const useSyncStore = () => ({ enqueueAction });
  useSyncStore.getState = () => ({ enqueueAction });
  return { useSyncStore };
});
vi.mock('../../store/useSessionStore', () => {
  const estado = () => ({ empleadoActivo: h.empleadoActivo });
  const useSessionStore = (sel) =>
    typeof sel === 'function' ? sel(estado()) : estado();
  useSessionStore.getState = estado;
  return { useSessionStore };
});
vi.mock('../auth/useAuthStore', () => {
  const estado = () => ({
    user: { nombre: 'Dueño Test' },
    restauranteId: 'r',
    suscripcion: null,
  });
  const useAuthStore = () => estado();
  useAuthStore.getState = estado;
  return { useAuthStore };
});
vi.mock('../../api/supabase', () => ({
  supabase: {
    auth: { getUser: async () => ({ data: { user: null }, error: null }) },
    functions: { invoke: async () => ({ data: null, error: null }) },
  },
}));

import EmpleadosScreen from './EmpleadosScreen';

beforeEach(() => {
  h.auditado = [];
  h.encolado = [];
  h.empleadoActivo = { nombre: 'Gerente Test', rol: 'Gerente' };
  h.app = {
    staff: [
      {
        id: 1,
        nombre: 'Ana López',
        rol: 'Mesero',
        pin: '1234',
        email: '',
        telefono: '',
        salario_base: 300,
        tipo_sueldo: 'dia',
        activo: true,
      },
    ],
    roles_permisos: [],
    upsertStaff: () => {},
    showToast: () => {},
    registrarAuditoria: (fila) => h.auditado.push(fila),
  };
  globalThis.__setOnline(true);
});
afterEach(() => globalThis.__setOnline(true));

const editarYGuardar = async (cambiar) => {
  render(
    <MemoryRouter>
      <EmpleadosScreen />
    </MemoryRouter>,
  );
  const usuario = userEvent.setup();
  await usuario.click(screen.getAllByLabelText('Editar')[0]);
  await cambiar?.(usuario);
  await usuario.click(screen.getByRole('button', { name: 'Guardar Empleado' }));
};

describe('EmpleadosScreen · quién guardó', () => {
  it('LA AFIRMACIÓN: la edición registra al empleado que la hizo, no «Administrador»', async () => {
    await editarYGuardar();

    expect(h.auditado).toHaveLength(1);
    expect(h.auditado[0].accion).toBe('EDICIÓN_EMPLEADO');
    expect(h.auditado[0].usuario).toBe('Gerente Test');
  });

  it('sin empleado con PIN, firma el usuario de la sesión', async () => {
    h.empleadoActivo = null;
    await editarYGuardar();

    expect(h.auditado[0].usuario).toBe('Dueño Test');
  });

  it('la edición sin conexión guarda la fila y TAMBIÉN deja rastro', async () => {
    globalThis.__setOnline(false);
    await editarYGuardar(async (usuario) => {
      const pin = screen.getByDisplayValue('1234');
      await usuario.clear(pin);
      await usuario.type(pin, '5678');
    });

    expect(h.encolado.some((e) => e.tabla === 'staff')).toBe(true);
    expect(h.auditado).toHaveLength(1);
    expect(h.auditado[0].usuario).toBe('Gerente Test');
  });
});
