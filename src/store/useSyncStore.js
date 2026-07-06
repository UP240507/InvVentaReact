import { create } from 'zustand';
import { localDB } from './localDB';
import { supabase } from '../api/supabase';
import { useAuthStore } from '../features/auth/useAuthStore';
import { construirDeltasStock } from '../lib/inventario';

export const useSyncStore = create((set, get) => ({
  isOffline: !navigator.onLine,
  isProcessingQueue: false,
  pendingTasks: 0,

  setOfflineStatus: (status) => {
    set({ isOffline: status });
    // Al confirmar que VOLVIÓ la red (status=false), intenta drenar la cola.
    // Refuerzo por si el evento 'online' del navegador no llega limpio
    // (navigator.onLine es poco confiable). processQueue ya evita correr en paralelo.
    if (status === false) {
      get().processQueue();
    }
  },

  enqueueAction: async (tabla, metodo, data) => {
    // 1. Clon profundo para evitar mutaciones extrañas en React
    const payload = JSON.parse(JSON.stringify(data));

    // 1b. ✅ Sprint 3: estampar restaurante_id en TODO insert/upsert/update que no lo traiga.
    //     Una sola fuente → ningún insert futuro se queda sin tenant (RLS WITH CHECK).
    if (metodo === 'insert' || metodo === 'upsert' || metodo === 'update') {
      const tenantId = useAuthStore.getState().restauranteId;
      if (
        tenantId &&
        payload &&
        typeof payload === 'object' &&
        payload.restaurante_id == null
      ) {
        payload.restaurante_id = tenantId;
      }
    }

    const queueItem = {
      tabla,
      metodo,
      data: payload,
      estado: 'pending',
      fecha: new Date().toISOString(),
      createdAt: Date.now(),
      intentos: 0,
      nextAttemptAt: null,
      error: null,
    };

    // 2. Mutación local inmediata (Optimistic UI)
    try {
      if (tabla === 'configuracion' && metodo === 'delete') {
        if (payload?.id) await localDB[tabla].delete(payload.id);
        else await localDB[tabla].clear();
      } else if (
        metodo === 'insert' ||
        metodo === 'upsert' ||
        metodo === 'update'
      ) {
        await localDB[tabla].put(payload);
      } else if (metodo === 'delete') {
        if (!payload?.id)
          throw new Error(`Se requiere data.id para eliminar en ${tabla}`);
        await localDB[tabla].delete(payload.id);
      }
    } catch (e) {
      console.error(`Error en mutación local (${tabla}):`, e);
    }

    // 3. Encolar. Si esto falla, el dato local ya quedó (paso 2), pero hay que
    //    saberlo: lanzamos para que el llamador no crea que se encoló si no fue así.
    try {
      await localDB.sync_queue.add(queueItem);
      set({ pendingTasks: await localDB.sync_queue.count() });
    } catch (e) {
      console.error(
        `Error encolando en sync_queue (${tabla}/${metodo}):`,
        e?.message,
      );
      throw e; // el llamador decide; pero esto NO debería pasar offline (es IndexedDB local)
    }

    // 4. Intentar subir en segundo plano. NUNCA propaga: un fallo de red aquí
    //    no debe tumbar al llamador (el dato ya está guardado + encolado).
    //    Sin await + catch tragado = "fire and forget".
    Promise.resolve()
      .then(() => get().processQueue())
      .catch((e) =>
        console.warn(
          '[enqueueAction] processQueue en segundo plano falló (se reintentará):',
          e?.message,
        ),
      );
  },

  // ✅ Sprint 3: encola una llamada RPC atómica (no es un CRUD de tabla).
  enqueueRpc: async (fn, args) => {
    const queueItem = {
      tabla: '__rpc__',
      metodo: 'rpc',
      rpc: fn,
      data: JSON.parse(JSON.stringify(args || {})),
      estado: 'pending',
      fecha: new Date().toISOString(),
      createdAt: Date.now(),
      intentos: 0,
      nextAttemptAt: null,
      error: null,
    };
    try {
      await localDB.sync_queue.add(queueItem);
      set({ pendingTasks: await localDB.sync_queue.count() });
    } catch (e) {
      console.error('Error encolando RPC en sync_queue:', e?.message);
      throw e;
    }
    // Mismo patrón que enqueueAction: dispara processQueue en segundo plano sin
    // depender de isOffline (que causaba que la tarea quedara 'pending' para
    // siempre hasta un reload). Un fallo de red aquí no propaga.
    Promise.resolve()
      .then(() => get().processQueue())
      .catch((e) =>
        console.warn(
          '[enqueueRpc] processQueue en segundo plano falló (se reintentará):',
          e?.message,
        ),
      );
  },

  // ✅ Sprint 3: decremento de stock vía RPC atómica (reemplaza el viejo descontarStock).
  // 1) Calcula deltas expandiendo recetas → insumos. 2) Aplica optimista en Dexie + RAM.
  // 3) Encola la RPC 'decrementar_stock' (sube online o al reconectar → no se pierde offline).
  descontarStockVenta: async (itemsVendidos, sustituciones = {}) => {
    const restauranteId = useAuthStore.getState().restauranteId;
    const deltas = construirDeltasStock(itemsVendidos, sustituciones);
    if (deltas.length === 0) return;

    // Optimista: bajar stock en RAM (useAppStore) y en Dexie inmediatamente
    try {
      const { useAppStore } = await import('./useAppStore');
      const mapaDelta = new Map(
        deltas.map((d) => [String(d.productoId), d.cantidad]),
      );

      const productosActuales = useAppStore.getState().productos || [];
      const productosNuevos = productosActuales.map((p) => {
        const d = mapaDelta.get(String(p.id));
        return d != null ? { ...p, stock: (Number(p.stock) || 0) - d } : p;
      });
      useAppStore.setState({ productos: productosNuevos });

      await localDB.transaction('rw', localDB.productos, async () => {
        for (const d of deltas) {
          const prod = await localDB.productos.get(d.productoId);
          if (prod) {
            await localDB.productos.put({
              ...prod,
              stock: (Number(prod.stock) || 0) - d.cantidad,
            });
          }
        }
      });
    } catch (e) {
      console.error('Error en decremento local de stock:', e);
    }

    // Encolar la RPC atómica (delta-based → sin race condition entre terminales)
    await get().enqueueRpc('decrementar_stock', {
      p_items: deltas,
      p_restaurante_id: restauranteId,
    });
  },

  processQueue: async () => {
    const state = get();
    // Solo evitamos correr en paralelo. NO bloqueamos por isOffline: ese flag es
    // para la UI (badge). Si de verdad no hay red, las tareas fallan con
    // 'Failed to fetch' y reintentan con backoff. Si la hay, suben. Bloquear aquí
    // por isOffline causaba un deadlock: la cola quedaba con tareas listas pero
    // nadie las procesaba tras reconectar.
    if (state.isProcessingQueue) return 0;

    const MAX_ATTEMPTS = 5;
    const BASE_BACKOFF_MS = 1000; // 1s
    const MAX_BACKOFF_MS = 60 * 1000; // 60s

    set({ isProcessingQueue: true });
    let processedCount = 0;
    // Hoisteado fuera del try{} para que el bloque finally pueda leer el
    // snapshot y detectar tareas que entraron mientras esta pasada corría.
    let pendingItems = [];

    try {
      pendingItems = await localDB.sync_queue
        .orderBy('createdAt')
        .toArray();

      for (const item of pendingItems) {
        if (item.estado === 'done') continue;

        const now = Date.now();
        if (item.nextAttemptAt && item.nextAttemptAt > now) continue;

        try {
          await localDB.sync_queue.update(item.id, {
            estado: 'processing',
            error: null,
          });

          let res;

          if (item.metodo === 'rpc') {
            // ── Llamada RPC atómica (ej. decrementar_stock) ──
            res = await supabase.rpc(item.rpc, item.data);
            if (res?.error) throw res.error;

            // Negocio: si algún producto quedó en negativo, NOTIFICAR sin rollback
            // (decisión del doc: preferir sobreventa notificada a venta fantasma).
            const insuficientes = (res?.data || []).filter(
              (r) => r?.insuficiente,
            );
            if (insuficientes.length > 0) {
              try {
                const { useAppStore } = await import('./useAppStore');
                useAppStore
                  .getState()
                  .showToast?.(
                    `Stock insuficiente en ${insuficientes.length} producto(s). Venta registrada; revisa inventario.`,
                    'warning',
                  );
              } catch {
                /* noop */
              }
            }
          } else {
            // ── CRUD normal sobre tabla ──
            const query = supabase.from(item.tabla);
            if (item.tabla === 'configuracion' && item.metodo === 'delete') {
              res = await query.delete().eq('id', item.data.id);
            } else if (item.metodo === 'insert') {
              res = await query.insert(item.data);
            } else if (item.metodo === 'upsert' || item.metodo === 'update') {
              res = await query.upsert(item.data);
            } else if (item.metodo === 'delete') {
              res = await query.delete().eq('id', item.data.id);
            } else {
              throw new Error(`Método remoto no soportado: ${item.metodo}`);
            }
            if (res?.error) throw res.error;
          }

          // Éxito → fuera de la cola
          await localDB.sync_queue.delete(item.id);
          processedCount++;
        } catch (error) {
          const attempts = (item.intentos || 0) + 1;
          const msg = error?.message || String(error);
          // Errores transitorios de red (reconexión, DNS no listo) → reintentarán.
          const esTransitorio =
            /failed to fetch|networkerror|network ?changed|name_not_resolved|fetch|load failed/i.test(
              msg,
            );

          if (attempts >= MAX_ATTEMPTS) {
            console.error(
              `❌ Tarea ${item.id} a dead-letter tras ${attempts} intentos:`,
              msg,
            );
            try {
              await localDB.sync_dead.add({
                ...item,
                estado: 'dead',
                intentos: attempts,
                lastError: msg || 'Error de red',
                fecha_error: new Date().toISOString(),
              });
              await localDB.sync_queue.delete(item.id);
            } catch (e) {
              console.error('Error moviendo item a sync_dead:', e);
              await localDB.sync_queue.update(item.id, {
                estado: 'error',
                intentos: attempts,
                error: msg || 'Error de red',
                fecha_error: new Date().toISOString(),
              });
            }
          } else {
            if (esTransitorio) {
              console.warn(
                `🔄 Tarea ${item.id}: red intermitente, reintento ${attempts}/${MAX_ATTEMPTS}.`,
              );
            } else {
              console.error(
                `Error sincronizando tarea ${item.id} (intento ${attempts}):`,
                msg,
              );
            }
            const backoff = Math.min(
              BASE_BACKOFF_MS * 2 ** (attempts - 1),
              MAX_BACKOFF_MS,
            );
            const nextAttemptAt = Date.now() + backoff;
            await localDB.sync_queue.update(item.id, {
              estado: 'error',
              intentos: attempts,
              error: msg || 'Error de red',
              fecha_error: new Date().toISOString(),
              nextAttemptAt,
            });
          }
        }
      }
    } finally {
      const remaining = await localDB.sync_queue.count();
      set({ isProcessingQueue: false, pendingTasks: remaining });

      // ✅ Aviso de sincronización donde DE VERDAD ocurre (no en el evento de red,
      // que depende de navigator.onLine y es poco confiable). Se dispara siempre
      // que se haya subido al menos una tarea, sin importar el origen del drenado.
      if (processedCount > 0) {
        try {
          const { useAppStore } = await import('./useAppStore');
          useAppStore
            .getState()
            .showToast?.(
              `${processedCount} cambio${processedCount === 1 ? '' : 's'} sincronizado${processedCount === 1 ? '' : 's'}.`,
              'success',
            );
        } catch {
          /* noop */
        }
      }

      // 🔁 Condición de carrera: si entraron tareas MIENTRAS este processQueue
      // corría (p.ej. la venta dispara processQueue, y el decremento de stock se
      // encola un instante después → su llamada a processQueue rebota por el guard
      // isProcessingQueue), esas tareas quedan 'pending' sin que nadie las drene
      // hasta un reload. Aquí revisamos si quedaron tareas LISTAS no vistas en esta
      // pasada y, de ser así, relanzamos.
      try {
        const ahora = Date.now();
        const vistas = new Set(pendingItems.map((t) => t.id));
        const todas = await localDB.sync_queue.toArray();
        const nuevasListas = todas.filter(
          (t) =>
            t.estado !== 'done' &&
            !vistas.has(t.id) && // entró DESPUÉS de que empezó esta pasada
            (!t.nextAttemptAt || t.nextAttemptAt <= ahora),
        );
        if (nuevasListas.length > 0) {
          // Solo relanzamos por tareas NUEVAS (no vistas), así no hay bucle
          // infinito con tareas que fallan y reintentan dentro de la misma pasada.
          Promise.resolve().then(() => get().processQueue());
        }
      } catch {
        /* noop */
      }
    }

    return processedCount;
  },
}));
