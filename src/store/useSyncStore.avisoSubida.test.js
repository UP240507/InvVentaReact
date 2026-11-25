// @vitest-environment jsdom
// jsdom a propósito: arrastra lib/Hub, que lee localStorage y window.location.
// Mismo andamio que useSyncStore.race.test.js.
//
// ── LO QUE DEFIENDE ─────────────────────────────────────────────────────────
// Subir un cambio ya no salta como notificación en medio de la pantalla. Con
// conexión, la cola sube algo en casi cada toque, y en la barrida de la 0.3.3
// (25-nov) el aviso «1 cambio sincronizado» salía para todo. Chris: que sea una
// frase en la barra de arriba que se ilumine. La cola sólo deja dicho cuántos
// subió y cuándo (`ultimaSubida`); quién lo pinta es `AvisoSincronizado`.
import 'fake-indexeddb/auto';

import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({ toasts: [] }));

vi.mock('../api/supabase', () => ({
  supabase: {
    rpc: async () => ({ data: [], error: null }),
    from: () => ({
      insert: async () => ({ data: [], error: null }),
      upsert: async () => ({ data: [], error: null }),
      delete: () => ({ eq: async () => ({ data: [], error: null }) }),
    }),
  },
}));
vi.mock('../features/auth/useAuthStore', () => ({
  useAuthStore: { getState: () => ({ restauranteId: 'rest-1' }) },
}));
vi.mock('./useAppStore', () => ({
  useAppStore: {
    getState: () => ({
      productos: [],
      showToast: (...a) => h.toasts.push(a),
    }),
    setState: vi.fn(),
  },
}));
vi.mock('../lib/Inventario', () => ({ construirDeltasStock: () => [] }));

import { localDB } from './localDB';
import { useSyncStore } from './useSyncStore';

beforeEach(async () => {
  h.toasts.length = 0;
  await localDB.sync_queue.clear();
  await localDB.sync_dead.clear();
  await localDB.ventas.clear();
  useSyncStore.setState({
    isProcessingQueue: false,
    isOffline: false,
    pendingTasks: 0,
    ultimaSubida: null,
  });
});

describe('subir un cambio no salta como notificación', () => {
  it('una venta que sube deja dicho cuánto subió, sin toast', async () => {
    await useSyncStore
      .getState()
      .enqueueAction('ventas', 'insert', { id: 'v1', folio: 'X-1', total: 19 });

    await vi.waitFor(
      () => expect(useSyncStore.getState().ultimaSubida?.cantidad).toBe(1),
      { timeout: 1000 },
    );

    // ── LA AFIRMACIÓN, Y SU CONTROL NEGATIVO ───────────────────────────────
    // Con `7bf7133` aquí salía el toast «1 cambio sincronizado.» y no había
    // `ultimaSubida`.
    const deSubida = h.toasts.filter(([texto]) =>
      /sincronizad/i.test(String(texto)),
    );
    expect(deSubida).toEqual([]);
    expect(typeof useSyncStore.getState().ultimaSubida.en).toBe('number');
  });

  it('una cola que no subió nada no cambia la última subida', async () => {
    await useSyncStore.getState().processQueue();
    expect(useSyncStore.getState().ultimaSubida).toBeNull();
  });
});
