import { create } from 'zustand';
import { localDB } from './localDB';
import { supabase } from '../api/supabase';
import { useAuthStore } from '../features/auth/useAuthStore';
import { construirDeltasStock } from '../lib/Inventario';
import { sinCamposDerivados } from '../lib/Payload';

// ── Clasificación de errores de sincronización ───────────────────────────────
// PERMANENTE = el reintento NUNCA va a arreglarlo (RLS, columna inexistente,
// constraint violada, payload malformado). Reintentarlo 5 veces con backoff
// solo retrasa el diagnóstico y atasca la cola. Va DIRECTO a dead-letter.
//
// Señales de permanencia:
//  - SQLSTATE de Postgres (error.code): 22xxx (datos inválidos, ej. uuid mal
//    formado), 23xxx (constraints: unique/FK/not-null), 42xxx (esquema y
//    permisos: columna/tabla inexistente, 42501 = RLS).
//  - Códigos PostgREST PGRST1xx/2xx (parsing del request, columna no
//    encontrada en el cache de esquema). PGRST3xx (JWT/auth) NO es permanente:
//    el refresh de token o el D1 pueden revivirlo.
//  - HTTP 4xx, EXCEPTO 401 (token vencido → refresh lo arregla), 408 (timeout)
//    y 429 (rate-limit) que son transitorios.
const esErrorPermanente = (error) => {
  const code = String(error?.code || '');
  if (/^(22|23|42)/.test(code)) return true;
  if (/^PGRST[12]/.test(code)) return true;
  const st = Number(error?.status);
  if (
    Number.isFinite(st) &&
    st >= 400 &&
    st < 500 &&
    st !== 401 &&
    st !== 408 &&
    st !== 429
  ) {
    return true;
  }
  return false;
};

export const useSyncStore = create((set, get) => ({
  isOffline: !navigator.onLine,
  isProcessingQueue: false,
  pendingTasks: 0,
  deadTasks: 0, // tareas en dead-letter (para badge/diagnóstico en UI)

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
    const clon = JSON.parse(JSON.stringify(data));

    // 1a. Fuera los campos DERIVADOS (`_costo`, `_margen`…). Una pantalla puede
    //     decorar una fila para mostrarla; al guardar, esos campos no existen
    //     como columnas y PostgREST rechaza la fila ENTERA (PGRST204). Se limpia
    //     aquí, antes de la copia local y de la cola, porque esta función es la
    //     única puerta a la base: pedirle a cada pantalla que se acuerde de
    //     desnudar su fila es pedir que alguna se olvide, y el síntoma —"se
    //     guardó" en pantalla, nada en la nube— tarda días en notarse.
    const payload = sinCamposDerivados(clon);

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
    let idTarea;
    try {
      idTarea = await localDB.sync_queue.add(queueItem);
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

    // El id de la tarea, para quien necesite saber si ESTA llegó a la nube.
    // Ver `llegoALaNube`. Devolverlo no cambia nada para los demás llamadores.
    return idTarea;
  },

  /**
   * ¿Llegó esta tarea a Supabase?
   *
   * ── POR QUÉ SE SONDEA Y NO SE ESPERA A `processQueue` ───────────────────
   * `enqueueAction` ya dispara `processQueue` en segundo plano, y esa función
   * lleva un guardia contra ejecuciones en paralelo: un segundo `await
   * processQueue()` desde aquí volvería de INMEDIATO sin haber hecho nada,
   * porque la primera sigue corriendo. Se leería como «no llegó» cuando la
   * subida está en curso.
   *
   * Así que se mira el hecho en vez de la promesa: `processQueue` BORRA la
   * tarea de `sync_queue` cuando sube bien, de modo que «ya no está» es la
   * prueba de que llegó. Se comprueba cada `pasoMs` hasta agotar `esperaMs`.
   *
   * El tope importa: quien llama a esto está decidiendo si sacar un papel para
   * cocina, y cocina no puede esperar. Mejor un papel de más a los dos segundos
   * que un pedido que nadie prepara.
   */
  llegoALaNube: async (idTarea, { esperaMs = 2000, pasoMs = 150 } = {}) => {
    if (idTarea == null) return false;
    const limite = Date.now() + esperaMs;
    while (Date.now() < limite) {
      const sigue = await localDB.sync_queue.get(idTarea);
      if (!sigue) return true; // subió y se borró
      if (sigue.estado === 'dead') return false; // permanente: no va a llegar
      await new Promise((r) => setTimeout(r, pasoMs));
    }
    return false;
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

  // ✅ CRM: acumula visita/gasto/puntos del cliente al cobrar (offline-first).
  // 1) Aplica optimista en RAM + Dexie (los puntos se estiman con la regla
  //    local pesos_por_punto; el servidor es la fuente de verdad y el eco
  //    realtime de 'clientes' corrige cualquier deriva).
  // 2) Encola la RPC 'registrar_visita_cliente' — atómica (FOR UPDATE) e
  //    idempotente vía ledger crm_visitas con PK (restaurante_id, venta_id):
  //    un reintento de la cola tras timeout post-commit NO recuenta.
  registrarVisitaCliente: async (ventaId, clienteId, total) => {
    if (!ventaId || !clienteId) return;
    const restauranteId = useAuthStore.getState().restauranteId;
    const monto = Number(total) || 0;

    try {
      const { useAppStore } = await import('./useAppStore');
      const conf = useAppStore.getState().configuracion || {};
      const ppp = Number(conf.pesos_por_punto) || 0;
      const puntos = ppp > 0 ? Math.floor(Math.max(monto, 0) / ppp) : 0;

      const actual = (useAppStore.getState().clientes || []).find(
        (c) => String(c.id) === String(clienteId),
      );
      if (actual) {
        const actualizado = {
          ...actual,
          visitas: (Number(actual.visitas) || 0) + 1,
          total_gastado: (Number(actual.total_gastado) || 0) + monto,
          puntos_lealtad: (Number(actual.puntos_lealtad) || 0) + puntos,
        };
        useAppStore.getState().upsertCliente(actualizado);
        await localDB.clientes.put(actualizado);
      }
    } catch (e) {
      console.error('Error en acumulación local de cliente:', e);
    }

    await get().enqueueRpc('registrar_visita_cliente', {
      p_venta_id: ventaId,
      p_cliente_id: clienteId,
      p_restaurante_id: restauranteId,
      p_total: monto,
    });
  },

  // ✅ Lealtad: canjea puntos por una recompensa del catálogo del dueño.
  // Optimista en RAM+Dexie; la RPC canjear_puntos es atómica (FOR UPDATE) e
  // idempotente (ledger crm_canjes). Si los puntos locales estaban inflados
  // (offline con datos viejos), el server rechaza con error PERMANENTE →
  // dead-letter sin reintentos, y el eco realtime de clientes corrige el saldo.
  canjearPuntosCliente: async (canjeId, clienteId, puntos, descripcion) => {
    const pts = Number(puntos) || 0;
    if (!canjeId || !clienteId || pts <= 0) return;
    const restauranteId = useAuthStore.getState().restauranteId;

    try {
      const { useAppStore } = await import('./useAppStore');
      const actual = (useAppStore.getState().clientes || []).find(
        (c) => String(c.id) === String(clienteId),
      );
      if (actual) {
        const actualizado = {
          ...actual,
          puntos_lealtad: Math.max(
            0,
            (Number(actual.puntos_lealtad) || 0) - pts,
          ),
        };
        useAppStore.getState().upsertCliente(actualizado);
        await localDB.clientes.put(actualizado);
      }
    } catch (e) {
      console.error('Error en canje local de puntos:', e);
    }

    await get().enqueueRpc('canjear_puntos', {
      p_canje_id: canjeId,
      p_cliente_id: clienteId,
      p_restaurante_id: restauranteId,
      p_puntos: pts,
      p_descripcion: descripcion || null,
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
      pendingItems = await localDB.sync_queue.orderBy('createdAt').toArray();

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
            if (res?.error) {
              // El status HTTP vive en la respuesta, no en el error: adjuntarlo
              // para que el clasificador de permanencia pueda usarlo.
              if (res.error.status == null && res.status != null) {
                res.error.status = res.status;
              }
              throw res.error;
            }

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
            if (res?.error) {
              if (res.error.status == null && res.status != null) {
                res.error.status = res.status;
              }
              throw res.error;
            }
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
          // ⛔ PERMANENTE (RLS, columna/tabla inexistente, constraint, payload
          // inválido): reintentar es inútil. Fast-path a dead-letter en el
          // PRIMER intento — antes daba 5 vueltas de backoff fingiendo ser red.
          const esPermanente = !esTransitorio && esErrorPermanente(error);

          if (esPermanente || attempts >= MAX_ATTEMPTS) {
            const motivo = esPermanente
              ? `permanente (${error?.code || error?.status || '4xx'})`
              : 'reintentos_agotados';
            console.error(
              esPermanente
                ? `⛔ Tarea ${item.id} (${item.tabla}/${item.metodo}): error PERMANENTE → dead-letter directo, sin reintentos:`
                : `❌ Tarea ${item.id} a dead-letter tras ${attempts} intentos:`,
              msg,
            );
            try {
              await localDB.sync_dead.add({
                ...item,
                estado: 'dead',
                intentos: attempts,
                motivo,
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
      const dead = await localDB.sync_dead.count().catch(() => 0);
      set({
        isProcessingQueue: false,
        pendingTasks: remaining,
        deadTasks: dead,
      });

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

  // ── Gestión de dead-letter ───────────────────────────────────────────────
  // Ganchos para una futura UI de diagnóstico (y para consola mientras tanto).

  // Devuelve las tareas muertas (más recientes primero) para inspección.
  listarDeadLetter: async () => {
    try {
      const items = await localDB.sync_dead.toArray();
      return items.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    } catch {
      return [];
    }
  },

  // Reencola una tarea muerta (p.ej. tras corregir el esquema/policy que la
  // mataba). Resetea intentos y backoff.
  reencolarDeadLetter: async (deadId) => {
    const item = await localDB.sync_dead.get(deadId);
    if (!item) return false;
    const { id, motivo, lastError, fecha_error, ...resto } = item;
    await localDB.sync_queue.add({
      ...resto,
      // Se sanea otra vez al reencolar: la tarea se guardó ANTES de que
      // existiera este filtro, así que su payload todavía puede traer los
      // campos derivados que la mataron. Sin esto, "Reintentar" fallaría igual
      // y el usuario concluiría, con razón, que el botón no sirve.
      data:
        resto.metodo === 'rpc'
          ? resto.data // los argumentos de una función SÍ pueden llamarse `_algo`
          : sinCamposDerivados(resto.data),
      estado: 'pending',
      intentos: 0,
      nextAttemptAt: null,
      error: null,
    });
    await localDB.sync_dead.delete(deadId);
    set({
      pendingTasks: await localDB.sync_queue.count(),
      deadTasks: await localDB.sync_dead.count().catch(() => 0),
    });
    Promise.resolve().then(() => get().processQueue());
    return true;
  },

  // Descarta definitivamente: una tarea (con id) o toda la dead-letter (sin id).
  descartarDeadLetter: async (deadId = null) => {
    if (deadId != null) await localDB.sync_dead.delete(deadId);
    else await localDB.sync_dead.clear();
    set({ deadTasks: await localDB.sync_dead.count().catch(() => 0) });
  },
}));
