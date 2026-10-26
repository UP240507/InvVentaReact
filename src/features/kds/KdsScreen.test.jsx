// src/features/kds/KdsScreen.test.jsx
//
// ── LA AFIRMACIÓN ───────────────────────────────────────────────────────────
// **Purgar el KDS deja rastro: quién lo hizo y qué rondas se llevó.**
//
// La purga cancela todas las rondas pendientes de todas las estaciones. No toca
// la cuenta ni el stock, pero cocina y barra se quedan sin lo que tenían por
// hacer. Hasta el 26-oct no escribía nada en Auditoría ni ponía motivo en las
// rondas: una mesa reclamaba su platillo y nadie podía saber qué había pasado.
// Ver `claude/CENSO_21-OCT_OPERATIVO_CONTRA_ADMINISTRATIVO.md` §3.7.
//
// Se prueba por la pantalla y no por una función suelta a propósito: lo que se
// rompe en silencio es que el manejador deje de llamar a la auditoría, y eso
// sólo lo ve una prueba que pulse el botón.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

const h = vi.hoisted(() => ({
  app: {},
  encolado: [],
  auditado: [],
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
  const estado = () => ({ user: { nombre: 'Dueño Test' }, restauranteId: 'r' });
  const useAuthStore = () => estado();
  useAuthStore.getState = estado;
  return { useAuthStore };
});
vi.mock('../../hooks/useAvisoKds', () => ({
  useAvisoKds: () => ({
    pop: null,
    descartarPop: () => {},
    activarAvisos: () => {},
    faltaActivar: false,
    permiso: 'granted',
  }),
}));

import KdsScreen from './KdsScreen';

const ronda = (id, mesa, folio, estado = 'pendiente') => ({
  id,
  mesa,
  folio,
  estado,
  fecha_hora: '2026-10-26T18:00:00.000Z',
  items: [{ id: `${id}-1`, nombre: 'Latte', cantidad: 1, destino: 'Barra' }],
});

beforeEach(() => {
  h.encolado = [];
  h.auditado = [];
  h.empleadoActivo = { nombre: 'Barista Test', rol: 'Barista' };
  h.app = {
    comandas_activas: [
      ronda('c1', 'Mesa 1', 'A-101'),
      ronda('c2', 'Mesa 2', null),
      ronda('c3', 'Mesa 3', 'A-103', 'entregada'),
    ],
    configuracion: { zonas_produccion: ['Cocina', 'Barra'] },
    roles_permisos: [],
    staff: [],
    temaGlobal: 'light',
    toggleTemaGlobal: () => {},
    showToast: () => {},
    registrarAuditoria: (fila) => h.auditado.push(fila),
  };
});

const purgar = async () => {
  render(
    <MemoryRouter>
      <KdsScreen />
    </MemoryRouter>,
  );
  const usuario = userEvent.setup();
  await usuario.click(screen.getByRole('button', { name: /Purgar todo/i }));
  await usuario.click(screen.getByRole('button', { name: /Sí, purgar/i }));
};

describe('KdsScreen · purgar todo', () => {
  it('LA AFIRMACIÓN: deja una fila en Auditoría con quién y qué rondas', async () => {
    await purgar();

    expect(h.auditado).toHaveLength(1);
    const [fila] = h.auditado;
    expect(fila.accion).toBe('KDS_PURGADO');
    expect(fila.usuario).toBe('Barista Test');
    expect(fila.detalles).toContain('2 ronda(s)');
    expect(fila.detalles).toContain('Mesa 1 (A-101)');
    expect(fila.detalles).toContain('Mesa 2');
    // La ronda ya entregada no se purga y no se cuenta.
    expect(fila.detalles).not.toContain('Mesa 3');
  });

  it('cada ronda cancelada lleva el motivo con el nombre de quien purgó', async () => {
    await purgar();

    const canceladas = h.encolado.filter((e) => e.tabla === 'comandas');
    expect(canceladas.map((e) => e.fila.id)).toEqual(['c1', 'c2']);
    for (const { fila } of canceladas) {
      expect(fila.estado).toBe('cancelada');
      expect(fila.motivo_cancelacion).toBe('Purga del KDS (Barista Test)');
    }
  });

  it('sin empleado con PIN, firma el usuario de la sesión', async () => {
    h.empleadoActivo = null;
    await purgar();

    expect(h.auditado[0].usuario).toBe('Dueño Test');
  });
});
