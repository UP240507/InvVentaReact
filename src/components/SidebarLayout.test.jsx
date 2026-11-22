// src/components/SidebarLayout.test.jsx
//
// El menú lateral: cada lugar con su carta y su nombre real, y el botón de
// plegar dentro del propio menú, a la vista y con su atajo escrito. Lo demás
// del chasis (encabezado, paleta, barra de estado) se deja fuera: aquí sólo
// importa el menú.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

const { estado, almacen } = vi.hoisted(() => ({
  // Un almacén de zustand de mentira: con selector o sin él, y con getState.
  almacen: (s) =>
    Object.assign((sel) => (sel ? sel(s) : s), { getState: () => s }),
  estado: {
    app: {
      mesas: [],
      toast: null,
      configuracion: {},
      turnos: [],
      asistencias: [],
      roles_permisos: [],
      temaGlobal: 'light',
      toggleTemaGlobal: () => {},
    },
    auth: { user: { nombre: 'Chris', rol: 'Admin' }, logout: () => {} },
  },
}));

vi.mock('../api/supabase', () => ({ supabase: {} }));
vi.mock('../store/useAppStore', () => ({ useAppStore: almacen(estado.app) }));
vi.mock('../features/auth/useAuthStore', () => ({
  useAuthStore: almacen(estado.auth),
}));
vi.mock('../store/useSessionStore', () => ({
  useSessionStore: almacen({ empleadoActivo: null }),
}));
vi.mock('../store/useSyncStore', () => ({
  useSyncStore: almacen({ isOffline: false, pendingTasks: [] }),
}));
vi.mock('../hooks/usePlan', () => ({
  usePlan: () => ({ tieneModulo: () => true }),
}));
vi.mock('../hooks/useAcoplado', () => ({ useAcoplado: () => true }));
vi.mock('../hooks/useAtajos', () => ({ useAtajos: () => {} }));
vi.mock('./Topbar', () => ({ default: () => null }));
vi.mock('./CommandPalette', () => ({ default: () => null }));
vi.mock('./AyudaAtajos', () => ({ default: () => null }));
vi.mock('./StatusBar', () => ({ default: () => null }));
vi.mock('./BarraPestanas', () => ({ default: () => null }));
vi.mock('../features/dashboard/CierreTurnoModal', () => ({
  default: () => null,
}));

import SidebarLayout from './SidebarLayout';
import { useShellStore } from '../store/useShellStore';

const pintar = () =>
  render(
    <MemoryRouter initialEntries={['/dashboard']}>
      <Routes>
        <Route element={<SidebarLayout />}>
          <Route path="/dashboard" element={<p>contenido</p>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );

beforeEach(() => useShellStore.getState().setSidebarColapsado(false));
afterEach(cleanup);

describe('El menú lateral', () => {
  it('cada lugar dice su carta y, debajo, el nombre real', () => {
    pintar();
    const enlace = screen.getByRole('link', { name: /El Diablito/ });
    expect(enlace).toHaveAccessibleName(/El Diablito\s*Recepción/);
    expect(enlace).toHaveAttribute('href', '/recepcion');
  });

  it('el botón de plegar está en el menú, con su atajo a la vista', async () => {
    const user = userEvent.setup();
    pintar();
    const plegar = screen.getByRole('button', { name: 'Plegar el menú' });
    expect(within(plegar).getByText('Ctrl+B')).toBeInTheDocument();

    await user.click(plegar);
    expect(useShellStore.getState().sidebarColapsado).toBe(true);
    // Plegado queda la flecha sola, y el aviso de cada ícono dice las dos.
    const desplegar = screen.getByRole('button', { name: 'Desplegar el menú' });
    expect(desplegar).toHaveAttribute('title', 'Desplegar el menú (Ctrl+B)');
    expect(screen.getByTitle('El Diablito · Recepción')).toBeInTheDocument();

    await user.click(desplegar);
    expect(useShellStore.getState().sidebarColapsado).toBe(false);
  });
});
