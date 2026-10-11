// La regla «con mesas abiertas no hay corte» (10-oct) vive también en el
// store, no sólo en el cuadro de cierre: así ningún otro camino (la paleta de
// comandos, un botón futuro) puede cortar con mesas abiertas.
import 'fake-indexeddb/auto';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({ encolado: [] }));

vi.mock('../api/supabase', () => ({
  supabase: { from: () => ({}), channel: () => ({}) },
}));
vi.mock('../features/auth/useAuthStore', () => ({
  useAuthStore: { getState: () => ({ restauranteId: 'rest-1' }) },
}));
vi.mock('./useSyncStore', () => ({
  useSyncStore: {
    getState: () => ({
      enqueueAction: async (...a) => h.encolado.push(a),
    }),
  },
}));

import { useAppStore } from './useAppStore';

const TURNO = {
  id: 'T1',
  estado: 'abierto',
  fecha_apertura: new Date().toISOString(),
};

beforeEach(() => {
  h.encolado.length = 0;
  useAppStore.setState({
    turnos: [TURNO],
    mesas: [],
    showToast: vi.fn(),
    registrarAuditoria: vi.fn(),
  });
});

describe('cerrarTurno · con mesas abiertas no hay corte', () => {
  it('con una mesa ocupada no cierra, no encola y avisa', async () => {
    useAppStore.setState({ mesas: [{ id: 3, estado: 'ocupada' }] });
    await useAppStore.getState().cerrarTurno({ usuario: 'Diego' });

    expect(useAppStore.getState().turnos[0].estado).toBe('abierto');
    expect(h.encolado).toHaveLength(0);
    expect(useAppStore.getState().showToast).toHaveBeenCalledWith(
      'No se puede hacer el corte con una mesa abierta.',
      'error',
    );
  });

  it('con las mesas libres sí cierra', async () => {
    useAppStore.setState({ mesas: [{ id: 3, estado: 'libre' }] });
    await useAppStore.getState().cerrarTurno({ usuario: 'Diego' });

    expect(useAppStore.getState().turnos[0].estado).toBe('cerrado');
    expect(h.encolado[0][0]).toBe('turnos');
  });
});
