/**
 * Reproduce condición de carrera en processQueue.
 *
 * Bug: `pendingItems` se declara con `const` DENTRO del bloque `try{}`.
 * En el `finally{}` está fuera de scope → ReferenceError silenciado →
 * tareas encoladas mientras processQueue corría nunca se procesan.
 *
 * Fix: hoistear `let pendingItems = []` ANTES del try{}.
 */

// Polyfill IndexedDB en jsdom ANTES de que cualquier módulo lo use.
import 'fake-indexeddb/auto';

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Mocks ─────────────────────────────────────────────────────────────────────

const supabaseRpc = vi.fn();
const supabaseInsert = vi.fn();
const supabaseUpsert = vi.fn();
const supabaseDeleteEq = vi.fn();

vi.mock('../api/supabase', () => ({
  supabase: {
    rpc: (...a) => supabaseRpc(...a),
    from: () => ({
      insert: (...a) => supabaseInsert(...a),
      upsert: (...a) => supabaseUpsert(...a),
      delete: () => ({ eq: (...a) => supabaseDeleteEq(...a) }),
    }),
  },
}));

vi.mock('../features/auth/useAuthStore', () => ({
  useAuthStore: { getState: () => ({ restauranteId: 'rest-1' }) },
}));

vi.mock('./useAppStore', () => ({
  useAppStore: {
    getState: () => ({ productos: [], showToast: vi.fn() }),
    setState: vi.fn(),
  },
}));

vi.mock('../lib/Inventario', () => ({
  construirDeltasStock: () => [],
}));

// ── Imports que dependen del polyfill ─────────────────────────────────────────

import { localDB } from './localDB';
import { useSyncStore } from './useSyncStore';

// ── Setup / Teardown ──────────────────────────────────────────────────────────

beforeEach(async () => {
  // Limpiar colas entre tests
  await localDB.sync_queue.clear();
  await localDB.sync_dead.clear();
  await localDB.ventas.clear();
  await localDB.productos.clear();

  // Resetear estado del store
  useSyncStore.setState({
    isProcessingQueue: false,
    isOffline: false,
    pendingTasks: 0,
  });

  // Defaults: éxito inmediato
  supabaseRpc.mockResolvedValue({ data: [], error: null });
  supabaseInsert.mockResolvedValue({ data: [], error: null });
  supabaseUpsert.mockResolvedValue({ data: [], error: null });
  supabaseDeleteEq.mockResolvedValue({ data: [], error: null });
});

afterEach(() => {
  vi.clearAllMocks();
});

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('processQueue — condición de carrera', () => {
  it('FALLA sin fix: tarea RPC encolada mientras processQueue está activo queda pending para siempre', async () => {
    /*
     * Carrera controlada:
     *   1. enqueueAction(tarea A) dispara processQueue en background.
     *   2. processQueue: isProcessingQueue=true, snapshot=[A].
     *   3. supabaseInsert está bloqueado → processQueue suspendido en el for-loop.
     *   4. enqueueRpc(tarea B) llama processQueue → rebota por guard.
     *   5. Liberamos insert → processQueue termina for-loop.
     *   6. finally: intenta usar `pendingItems` (ReferenceError silenciado) → no relanza.
     *   7. Tarea B queda 'pending' indefinidamente. ← BUG
     */

    let resolveInsert;
    supabaseInsert.mockImplementation(
      () =>
        new Promise((res) => {
          resolveInsert = () => res({ data: [], error: null });
        }),
    );

    // Paso 1: encola tarea A → dispara processQueue fire-and-forget
    const enqueueADone = useSyncStore
      .getState()
      .enqueueAction('ventas', 'insert', { id: 'v1', total: 100 });

    // Paso 2: esperamos a que processQueue tome el guard
    await vi.waitFor(
      () => {
        expect(useSyncStore.getState().isProcessingQueue).toBe(true);
      },
      { timeout: 500 },
    );

    // Paso 3: tarea A está en vuelo (insert bloqueado). Encolamos tarea B.
    // Su llamada a processQueue rebotará por el guard.
    await useSyncStore.getState().enqueueRpc('decrementar_stock', {
      p_items: [],
      p_restaurante_id: 'rest-1',
    });

    // Verificamos que ambas tareas están en cola
    const snapshot = await localDB.sync_queue.toArray();
    expect(snapshot).toHaveLength(2);

    // Paso 4: liberamos el insert → processQueue de la tarea A termina
    resolveInsert();
    await enqueueADone;

    // Damos tiempo suficiente para que el finally relance (si el fix está)
    // o para confirmar que no lo hace (si hay bug)
    await new Promise((r) => setTimeout(r, 300));

    const remaining = await localDB.sync_queue.toArray();
    const stuckB = remaining.filter((t) => t.metodo === 'rpc');

    // Con el BUG: stuckB.length === 1 (tarea B stuck en pending)
    // Con el FIX: stuckB.length === 0 (tarea B procesada, cola vacía)
    expect(
      stuckB,
      `Tarea RPC quedó stuck: ${JSON.stringify(stuckB, null, 2)}`,
    ).toHaveLength(0);

    expect(await localDB.sync_queue.count()).toBe(0);
  });
});
