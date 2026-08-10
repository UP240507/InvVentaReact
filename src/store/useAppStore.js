import { create } from 'zustand';
import { supabase } from '../api/supabase';
import { useAuthStore } from '../features/auth/useAuthStore';
import { localDB } from './localDB';
import { useSyncStore } from './useSyncStore';
// ── HELPER UTC ────────────────────────────────────────────────────────────────
// Supabase a veces omite 'Z' en timestamps → browser los interpreta como local.
// Esta función fuerza interpretación UTC en cualquier formato.
export function parseUTC(str) {
  if (!str) return null;
  if (/Z|[+-]\d{2}:\d{2}$/.test(str)) return new Date(str);
  return new Date(str + 'Z');
}

// Estados que sacan una comanda de la fila activa (ya no se cocina ni se entrega).
const ESTADOS_TERMINADOS = ['entregada', 'completada', 'cancelada'];

// Tema claro/oscuro de arranque: preferencia guardada > preferencia del sistema.
function temaInicial() {
  try {
    const guardado = localStorage.getItem('theme');
    if (guardado === 'dark' || guardado === 'light') return guardado;
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light';
  } catch {
    return 'light';
  }
}

export const useAppStore = create((set, get) => ({
  // ─── 1. ESTADO GLOBAL (RAM) ──────────────────────────────────────────────
  isLoading: false,
  toast: null,
  // (Proyecto D · tanda 3) MISMO criterio que el boot de App.jsx: sin
  // preferencia guardada manda el sistema operativo. Si aquí asumiéramos
  // 'light', en un equipo en modo oscuro el DOM arrancaría con .dark y el
  // store diría 'light' → iconos al revés y primer toggle sin efecto.
  temaGlobal: temaInicial(),
  temaColor: localStorage.getItem('tema_color') || 'terracota',

  configuracion: null,
  productos: [],
  recetas: [],
  mesas: [],
  ventas: [],
  proveedores: [],
  usuarios: [],
  movimientos: [],
  turnos: [],
  ordenesCompra: [],
  facturas: [],
  modificadores: [],
  staff: [],
  nominas: [],
  gastos: [],
  categorias_gasto: [],
  gastos_recurrentes: [],
  roles_permisos: [],
  clientes: [],
  auditoria: [],
  asistencias: [],
  comandas_activas: [],
  _kdsChannel: null, // ref del canal realtime (para no duplicar suscripción)
  _kdsIniciando: false, // guard síncrono: evita doble montaje mientras resuelve el token
  _authSub: null, // ref del listener de refresh de token (realtime setAuth)
  _fetchEnCurso: false, // guard: evita fetchInitialData concurrentes (estampida de 19 queries)
  _ultimoFetchOk: 0, // ts del último refresh exitoso (TTL anti-refetch por foco/redirect)

  // ─── 2. CARGA INICIAL (ONLINE / OFFLINE HYBRID) ────────────────────────
  fetchInitialData: async () => {
    // ── GUARD DE ESTAMPIDA ────────────────────────────────────────────────────
    // supabase-js dispara SIGNED_IN al recuperar el foco de la pestaña
    // (multi-tab) y el flujo de auth re-llama fetchInitialData. Sin guard, las
    // 19 queries se re-disparan en paralelo compitiendo con el handshake del
    // realtime, la cola de sync subiendo el turno y el navigator-lock de la
    // sesión de supabase-js → el timeout revienta ('timeout-red') y marca
    // OFFLINE FALSO aunque la red esté viva (el propio evento realtime acaba
    // de llegar). Regla: (a) nunca dos fetch concurrentes, (b) si el último
    // refresh exitoso tiene < 30s, RAM sigue fresca (realtime la mantiene
    // viva) → no hay nada que refrescar.
    if (get()._fetchEnCurso) {
      console.log(
        '⏭️ [Store] fetchInitialData ya en curso; ignorando re-disparo.',
      );
      return;
    }
    if (Date.now() - get()._ultimoFetchOk < 30_000) {
      console.log(
        '⏭️ [Store] Datos frescos (<30s) + realtime activo; sin refetch.',
      );
      get().iniciarSuscripcionKDS(); // idempotente: garantiza canal vivo
      return;
    }
    set({ _fetchEnCurso: true, isLoading: true });

    const restauranteId = useAuthStore.getState().restauranteId;
    if (!restauranteId) {
      console.error(
        '❌ [Store] fetchInitialData sin restaurante_id. Abortando.',
      );
      set({ isLoading: false, _fetchEnCurso: false });
      return;
    }

    // ── 0) REALTIME GLOBAL ────────────────────────────────────────────────────
    // Se monta AQUÍ porque fetchInitialData corre en el arranque de CUALQUIER
    // sesión autenticada, sin importar el layout. Montarlo solo en SidebarLayout
    // dejaba mudas las rutas full-screen (/espera, /kds, /pos): un Chef que
    // aterriza directo en /kds jamás renderiza el sidebar → cero realtime.
    // El guard interno lo hace idempotente (llamadas repetidas no duplican).
    get().iniciarSuscripcionKDS();

    // ── 1) SIEMPRE hidratar desde Dexie primero ──────────────────────────────
    // No confiamos en navigator.onLine (miente: reporta true sin internet real).
    // Local es la fuente inmediata; si la red existe, refrescamos después.
    const hidratarDesdeDexie = async () => {
      try {
        const comandasLocal = await localDB.comandas.toArray();
        set({
          configuracion:
            (await localDB.configuracion.toCollection().first()) || null,
          productos: await localDB.productos.toArray(),
          recetas: await localDB.recetas.toArray(),
          mesas: await localDB.mesas.toArray(),
          ventas: await localDB.ventas.toArray(),
          proveedores: await localDB.proveedores.toArray(),
          usuarios: await localDB.usuarios.toArray(),
          movimientos: await localDB.movimientos.toArray(),
          turnos: await localDB.turnos.toArray(),
          ordenesCompra: await localDB.ordenes_compra.toArray(),
          facturas: await localDB.facturas.toArray(),
          modificadores: await localDB.modificadores.toArray(),
          staff: await localDB.staff.toArray(),
          nominas: await localDB.nominas.toArray(),
          gastos: await localDB.gastos.toArray(),
          categorias_gasto: await localDB.categorias_gasto.toArray(),
          gastos_recurrentes: await localDB.gastos_recurrentes.toArray(),
          roles_permisos: await localDB.roles_permisos.toArray(),
          clientes: await localDB.clientes.toArray(),
          auditoria: await localDB.auditoria.toArray(),
          asistencias: await localDB.asistencias.toArray(),
          // Defensivo: nunca arrastrar terminadas a la fila activa.
          comandas_activas: (comandasLocal || []).filter(
            (c) => !ESTADOS_TERMINADOS.includes(c.estado),
          ),
        });
      } catch (e) {
        console.error('❌ [Store] No se pudo leer de Dexie:', e?.message);
      }
    };

    await hidratarDesdeDexie();
    // (Proyecto D) aplicar el tema del tenant desde la config local de Dexie
    if (get().configuracion?.tema_color) {
      get().aplicarTemaColor(get().configuracion.tema_color);
    }

    // ── 2) Refrescar desde Supabase con TIMEOUT ──────────────────────────────
    // navigator.onLine === false → ni intentamos. Si dice true pero no hay red,
    // el timeout evita que peticiones colgadas dejen todo en espera.
    if (!navigator.onLine) {
      console.log('⚠️ [Network] Offline: operando con datos locales (Dexie).');
      useSyncStore.getState().setOfflineStatus(true); // enciende indicador
      set({ isLoading: false, _fetchEnCurso: false });
      return;
    }

    // 15s (antes 8s): en tablets con red lenta o arranque con handshake de
    // realtime + cola de sync en paralelo, 8s producía falsos 'timeout-red'.
    const conTimeout = (promesa, ms = 15000) =>
      Promise.race([
        promesa,
        new Promise((_, rej) =>
          setTimeout(() => rej(new Error('timeout-red')), ms),
        ),
      ]);

    try {
      console.log('🌐 [Network] Refrescando desde Supabase...');

      const [
        { data: confData },
        { data: prodData },
        { data: recData },
        { data: mesasData },
        { data: ventasData },
        { data: provData },
        { data: usersData },
        { data: movData },
        { data: turnosData },
        { data: ocData },
        { data: factData },
        { data: modifData },
        { data: staffData },
        { data: nominasData },
        { data: rolesData },
        { data: clientesData },
        { data: auditoriaData },
        { data: asistenciasData },
        { data: comandasData },
        { data: gastosData },
        { data: categoriasGastoData },
        { data: recurrentesData },
      ] = await conTimeout(
        Promise.all([
          supabase
            .from('configuracion')
            .select('*')
            .eq('restaurante_id', restauranteId)
            .single(),
          // Cargar TODOS (activos e inactivos); la UI filtra por pestaña.
          // Filtrar activo aquí rompía las vistas de "Inactivos" tras recargar
          // y dejaba insumos ocultos sin resolver en recetas.
          supabase
            .from('productos')
            .select('*')
            .eq('restaurante_id', restauranteId),
          supabase
            .from('recetas')
            .select('*')
            .eq('restaurante_id', restauranteId),
          supabase
            .from('mesas')
            .select('*')
            .eq('restaurante_id', restauranteId),
          supabase
            .from('ventas')
            .select('*')
            .eq('restaurante_id', restauranteId)
            .order('fecha', { ascending: false })
            .limit(500),
          supabase
            .from('proveedores')
            .select('*')
            .eq('restaurante_id', restauranteId),
          supabase
            .from('usuarios')
            .select('*')
            .eq('restaurante_id', restauranteId),
          supabase
            .from('movimientos')
            .select('*')
            .eq('restaurante_id', restauranteId)
            .order('fecha', { ascending: false })
            .limit(500),
          supabase
            .from('turnos')
            .select('*')
            .eq('restaurante_id', restauranteId)
            .order('fecha_apertura', { ascending: false }),
          supabase
            .from('ordenes_compra')
            .select('*')
            .eq('restaurante_id', restauranteId),
          supabase
            .from('facturas')
            .select('*')
            .eq('restaurante_id', restauranteId),
          supabase
            .from('modificadores')
            .select('*')
            .eq('restaurante_id', restauranteId),
          supabase
            .from('staff')
            .select('*')
            .eq('restaurante_id', restauranteId),
          supabase
            .from('nominas')
            .select('*')
            .eq('restaurante_id', restauranteId),
          supabase
            .from('roles_permisos')
            .select('*')
            .eq('restaurante_id', restauranteId),
          supabase
            .from('clientes')
            .select('*')
            .eq('restaurante_id', restauranteId),
          supabase
            .from('auditoria')
            .select('*')
            .eq('restaurante_id', restauranteId)
            .order('fecha', { ascending: false })
            .limit(200),
          supabase
            .from('asistencias')
            .select('*')
            .eq('restaurante_id', restauranteId)
            .order('fecha_hora', { ascending: false }),
          // Solo comandas vivas: ni completadas, ni entregadas, ni canceladas.
          supabase
            .from('comandas')
            .select('*')
            .eq('restaurante_id', restauranteId)
            .neq('estado', 'completada')
            .neq('estado', 'entregada')
            .neq('estado', 'cancelada')
            .order('fecha_hora', { ascending: true }),
          // ── Fase 2.5: gastos ──
          supabase
            .from('gastos')
            .select('*')
            .eq('restaurante_id', restauranteId)
            .order('fecha', { ascending: false }),
          // Las categorías de SISTEMA no llevan restaurante_id: la RLS ya
          // decide qué ve cada tenant, así que aquí no se filtra por columna.
          supabase.from('categorias_gasto').select('*').order('orden'),
          supabase
            .from('gastos_recurrentes')
            .select('*')
            .eq('restaurante_id', restauranteId),
        ]),
      );

      // 🛟 La red puede MENTIR: supabase-js resuelve con { data: null } en vez de
      // rechazar cuando el fetch falla. Si todo viene nulo/vacío, NO pisamos los
      // datos buenos que ya cargó Dexie en el paso 1.
      const huboRespuestaReal =
        confData != null ||
        (Array.isArray(prodData) && prodData.length > 0) ||
        (Array.isArray(recData) && recData.length > 0) ||
        (Array.isArray(mesasData) && mesasData.length > 0);

      if (!huboRespuestaReal) {
        console.warn(
          '⚠️ [Store] Supabase respondió vacío/nulo (red caída): se conservan los datos de Dexie.',
        );
        useSyncStore.getState().setOfflineStatus(true); // enciende indicador offline
        set({ isLoading: false, _fetchEnCurso: false });
        return;
      }

      const payload = {
        configuracion: confData || null,
        productos: prodData || [],
        recetas: recData || [],
        mesas: mesasData || [],
        ventas: ventasData || [],
        proveedores: provData || [],
        usuarios: usersData || [],
        movimientos: movData || [],
        turnos: turnosData || [],
        ordenesCompra: ocData || [],
        facturas: factData || [],
        modificadores: modifData || [],
        staff: staffData || [],
        nominas: nominasData || [],
        gastos: gastosData || [],
        categorias_gasto: categoriasGastoData || [],
        gastos_recurrentes: recurrentesData || [],
        roles_permisos: rolesData || [],
        clientes: clientesData || [],
        auditoria: auditoriaData || [],
        asistencias: asistenciasData || [],
        comandas_activas: comandasData || [],
        _ultimoFetchOk: Date.now(), // arma el TTL anti-estampida
      };
      set(payload);
      useSyncStore.getState().setOfflineStatus(false); // red confirmada → apaga indicador
      // (Proyecto D) tema del tenant desde el server (fuente de verdad)
      if (confData?.tema_color) get().aplicarTemaColor(confData.tema_color);

      // Backup en Dexie (su fallo no debe tumbar nada)
      try {
        const safe = (arr) => arr || [];
        await localDB.transaction(
          'rw',
          localDB.configuracion,
          localDB.productos,
          localDB.recetas,
          localDB.mesas,
          localDB.ventas,
          localDB.proveedores,
          localDB.usuarios,
          localDB.movimientos,
          localDB.turnos,
          localDB.ordenes_compra,
          localDB.facturas,
          localDB.modificadores,
          localDB.staff,
          localDB.nominas,
          localDB.gastos,
          localDB.categorias_gasto,
          localDB.gastos_recurrentes,
          localDB.roles_permisos,
          localDB.clientes,
          localDB.auditoria,
          localDB.asistencias,
          localDB.comandas,
          async () => {
            if (confData) await localDB.configuracion.put(confData);
            await localDB.productos.bulkPut(safe(prodData));
            await localDB.recetas.bulkPut(safe(recData));
            await localDB.mesas.bulkPut(safe(mesasData));
            await localDB.ventas.bulkPut(safe(ventasData));
            await localDB.proveedores.bulkPut(safe(provData));
            await localDB.usuarios.bulkPut(safe(usersData));
            await localDB.movimientos.bulkPut(safe(movData));
            await localDB.turnos.bulkPut(safe(turnosData));
            await localDB.ordenes_compra.bulkPut(safe(ocData));
            await localDB.facturas.bulkPut(safe(factData));
            await localDB.modificadores.bulkPut(safe(modifData));
            await localDB.staff.bulkPut(safe(staffData));
            await localDB.nominas.bulkPut(safe(nominasData));
            await localDB.gastos.bulkPut(safe(gastosData));
            await localDB.categorias_gasto.bulkPut(safe(categoriasGastoData));
            await localDB.gastos_recurrentes.bulkPut(safe(recurrentesData));
            await localDB.roles_permisos.bulkPut(safe(rolesData));
            await localDB.clientes.bulkPut(safe(clientesData));
            await localDB.auditoria.bulkPut(safe(auditoriaData));
            await localDB.asistencias.bulkPut(safe(asistenciasData));
            await localDB.comandas.bulkPut(safe(comandasData));
          },
        );
      } catch (bkErr) {
        console.warn(
          '⚠️ [Store] No se pudo respaldar en Dexie:',
          bkErr?.message,
        );
      }
    } catch (error) {
      // La red mintió o se cayó: ya tenemos los datos de Dexie del paso 1.
      // PERO: si el socket de realtime está unido ('joined'), la red está VIVA
      // (evidencia directa) → el fallo fue congestión puntual, no offline.
      // No enciendas el indicador ni degrades la app por un falso positivo.
      const socketVivo = get()._kdsChannel?.state === 'joined';
      console.warn(
        '⚠️ [Store] Refresh online falló; seguimos con datos locales:',
        error?.message,
        socketVivo ? '(socket realtime vivo: NO se marca offline)' : '',
      );
      if (!socketVivo) {
        useSyncStore.getState().setOfflineStatus(true); // enciende indicador offline
      }
    } finally {
      set({ isLoading: false, _fetchEnCurso: false });
    }
  },

  // ─── 3. MOTOR KDS (REALTIME GLOBAL) ──────────────────────────────────────
  // Se monta UNA vez desde fetchInitialData (arranque de cualquier sesión
  // autenticada, con o sin sidebar). Así Espera, Mesas, KDS y POS reciben
  // cambios de comandas en vivo, en cualquier dispositivo o pestaña.
  // También escucha 'turnos' → apertura/cierre de caja se propaga a todos los
  // dispositivos (EsperaScreen redirige y TurnoRoute expulsa en tiempo real).
  iniciarSuscripcionKDS: async () => {
    // Guard anti-duplicado: si ya hay canal (o se está montando), no duplicar
    // (StrictMode/dobles montajes/llamadas desde fetchInitialData + layouts).
    if (get()._kdsChannel || get()._kdsIniciando) return get()._kdsChannel;
    set({ _kdsIniciando: true });

    // 🔑 CLAVE: pasar el JWT de la sesión al canal de realtime. Sin esto, el
    // WebSocket escucha con la anon key → get_restaurante_id() = null → RLS
    // descarta TODOS los eventos en silencio (HTTP funciona, realtime mudo).
    // El token se pide a supabase.auth.getSession() — la fuente AUTORITATIVA
    // (lección D1: el estado cacheado del store puede estar vacío o muerto
    // aunque la sesión real exista, y viceversa).
    try {
      const { data } = await supabase.auth.getSession();
      const token =
        data?.session?.access_token ||
        useAuthStore.getState().session?.access_token ||
        null;
      if (token) {
        supabase.realtime.setAuth(token);
      } else {
        console.warn(
          '⚠️ [KDS] Sin access_token al montar realtime: RLS silenciará los eventos hasta el próximo refresh de sesión.',
        );
      }
    } catch (e) {
      console.warn(
        '⚠️ [KDS] No se pudo fijar el token del realtime:',
        e?.message,
      );
    }

    console.log('📡 [KDS] Túnel WebSocket abierto (global)...');
    const suscripcion = supabase
      .channel('kds-channel')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'comandas' },
        (payload) => {
          const comanda = payload.new;
          const tipo = payload.eventType;

          if (tipo === 'INSERT') {
            // No metas a la fila una comanda que ya nació terminada.
            if (ESTADOS_TERMINADOS.includes(comanda?.estado)) return;
            set((state) => {
              const yaEsta = state.comandas_activas.some(
                (c) => String(c.id) === String(comanda.id),
              );
              if (yaEsta) return state; // dedup (insert optimista previo)
              return {
                comandas_activas: [...state.comandas_activas, comanda],
              };
            });
            return;
          }

          if (tipo === 'UPDATE') {
            set((state) => {
              // Si pasó a terminada → sacarla de la fila (KDS y badge reaccionan
              // al instante, aunque el mesero la entregue desde otro dispositivo).
              if (ESTADOS_TERMINADOS.includes(comanda?.estado)) {
                return {
                  comandas_activas: state.comandas_activas.filter(
                    (c) => String(c.id) !== String(comanda.id),
                  ),
                };
              }
              const existe = state.comandas_activas.some(
                (c) => String(c.id) === String(comanda.id),
              );
              // Carrera: llegó el UPDATE antes que esta pantalla viera el INSERT.
              if (!existe) {
                return {
                  comandas_activas: [...state.comandas_activas, comanda],
                };
              }
              return {
                comandas_activas: state.comandas_activas.map((c) =>
                  String(c.id) === String(comanda.id) ? comanda : c,
                ),
              };
            });
            return;
          }

          if (tipo === 'DELETE') {
            set((state) => ({
              comandas_activas: state.comandas_activas.filter(
                (c) => String(c.id) !== String(payload.old?.id),
              ),
            }));
          }
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'turnos' },
        (payload) => {
          const turno = payload.new;
          const tipo = payload.eventType;

          if (tipo === 'DELETE') {
            set((state) => ({
              turnos: (state.turnos || []).filter(
                (t) => String(t.id) !== String(payload.old?.id),
              ),
            }));
            return;
          }

          // INSERT/UPDATE: upsert por id. Propaga apertura/cierre de caja a TODOS
          // los dispositivos → EsperaScreen redirige y TurnoRoute expulsa en vivo,
          // aunque la caja se abra/cierre desde otra tablet. Dedup por id: el
          // dispositivo que abrió el turno ya lo tiene optimista (mismo id de
          // cliente), así que el eco del realtime solo lo reemplaza, no duplica.
          set((state) => {
            const existe = (state.turnos || []).some(
              (t) => String(t.id) === String(turno?.id),
            );
            if (existe) {
              return {
                turnos: state.turnos.map((t) =>
                  String(t.id) === String(turno.id) ? turno : t,
                ),
              };
            }
            return { turnos: [turno, ...(state.turnos || [])] };
          });
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'mesas' },
        (payload) => {
          const mesa = payload.new;
          const tipo = payload.eventType;

          if (tipo === 'DELETE') {
            set((state) => ({
              mesas: (state.mesas || []).filter(
                (m) => String(m.id) !== String(payload.old?.id),
              ),
            }));
            return;
          }

          // INSERT/UPDATE: upsert por id (mismo patrón que turnos). Propaga
          // ocupación, orden_actual y 'por_cobrar' entre dispositivos: el
          // popup de cobro del cajero y el mapa de mesas del mesero reaccionan
          // en vivo sin recargar. El dispositivo que hizo el cambio ya lo
          // tiene optimista → el eco solo reemplaza, no duplica.
          set((state) => {
            const existe = (state.mesas || []).some(
              (m) => String(m.id) === String(mesa?.id),
            );
            if (existe) {
              return {
                mesas: state.mesas.map((m) =>
                  String(m.id) === String(mesa.id) ? mesa : m,
                ),
              };
            }
            return { mesas: [...(state.mesas || []), mesa] };
          });
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'clientes' },
        (payload) => {
          const cliente = payload.new;
          const tipo = payload.eventType;

          if (tipo === 'DELETE') {
            set((state) => ({
              clientes: (state.clientes || []).filter(
                (c) => String(c.id) !== String(payload.old?.id),
              ),
            }));
            return;
          }

          // INSERT/UPDATE: upsert por id (mismo patrón que mesas/turnos).
          // Propaga la acumulación del CRM (visitas/gasto/puntos que escribe
          // la RPC registrar_visita_cliente) y las altas exprés del ModalCobro
          // a TODAS las terminales en vivo. El eco corrige la estimación
          // optimista local de puntos si la regla cambió a media sesión.
          set((state) => {
            const existe = (state.clientes || []).some(
              (c) => String(c.id) === String(cliente?.id),
            );
            if (existe) {
              return {
                clientes: state.clientes.map((c) =>
                  String(c.id) === String(cliente.id) ? cliente : c,
                ),
              };
            }
            return { clientes: [cliente, ...(state.clientes || [])] };
          });
        },
      )
      .subscribe();

    set({ _kdsChannel: suscripcion, _kdsIniciando: false });

    // Tras un refresh de token (cada ~1h supabase-js lo renueva), el canal se
    // quedaría con el token viejo → realtime mudo. Re-aplicar el token nuevo
    // mantiene vivo el filtro RLS sin tener que reconectar el canal.
    try {
      if (!get()._authSub) {
        const { data: authSub } = supabase.auth.onAuthStateChange(
          (_event, session) => {
            if (session?.access_token) {
              supabase.realtime.setAuth(session.access_token);
            }
          },
        );
        set({ _authSub: authSub?.subscription || null });
      }
    } catch (e) {
      console.warn(
        '⚠️ [KDS] No se pudo escuchar refresh de token:',
        e?.message,
      );
    }

    return suscripcion;
  },

  detenerSuscripcionKDS: () => {
    const ch = get()._kdsChannel;
    if (ch) {
      try {
        supabase.removeChannel(ch);
      } catch (e) {
        console.warn('⚠️ [KDS] Error cerrando canal:', e?.message);
      }
      set({ _kdsChannel: null });
    }
    set({ _kdsIniciando: false });
    const authSub = get()._authSub;
    if (authSub) {
      try {
        authSub.unsubscribe();
      } catch (e) {
        console.warn('⚠️ [KDS] Error cerrando listener de auth:', e?.message);
      }
      set({ _authSub: null });
    }
  },

  registrarComandaKDS: (nuevaComanda) => {
    set((state) => {
      const yaEsta = state.comandas_activas.some(
        (c) => String(c.id) === String(nuevaComanda.id),
      );
      if (yaEsta) return state;
      return { comandas_activas: [...state.comandas_activas, nuevaComanda] };
    });
  },

  // ─── 4. SEGURIDAD Y AUDITORÍA ────────────────────────────────────────────
  registrarAuditoria: async (logInfo) => {
    const logParaSupabase = {
      fecha: logInfo.fecha || new Date().toISOString(),
      usuario: logInfo.usuario || 'Sistema',
      accion: logInfo.accion || 'ACCIÓN_DESCONOCIDA',
      modulo: logInfo.modulo || 'GENERAL',
      detalles: logInfo.detalles || '',
      nivel: logInfo.nivel || 'info',
      restaurante_id: useAuthStore.getState().restauranteId,
    };
    const logCompleto = { ...logParaSupabase, id: logInfo.id || Date.now() };

    set((state) => ({ auditoria: [logCompleto, ...(state.auditoria || [])] }));

    try {
      await localDB.auditoria.put(logCompleto);
      if (navigator.onLine) {
        supabase
          .from('auditoria')
          .insert(logParaSupabase)
          .then(({ error }) => {
            if (error)
              console.error('⚠️ Error subiendo auditoría:', error.message);
          });
      }
    } catch (err) {
      console.error('⚠️ Error guardando auditoría:', err);
    }
  },

  // ─── 5. LÓGICA DE NEGOCIO Y FINANZAS ─────────────────────────────────────

  // ─── 6. HELPERS UI Y CRUD RÁPIDOS ────────────────────────────────────────

  showToast: (mensaje, tipo = 'info') => {
    set({ toast: { msg: mensaje, type: tipo } });
    setTimeout(() => set({ toast: null }), 3500);
  },

  // (Proyecto D) Tema de color del TENANT: terracota | vino-cesped | fenix.
  // Se aplica como data-tema en <html> (los tokens --adm-* reaccionan solos);
  // localStorage lo adelanta en el boot sin parpadeo y configuracion.tema_color
  // es la fuente de verdad por tenant (llega por fetch/Dexie).
  aplicarTemaColor: (tema) => {
    const t = ['terracota', 'vino-cesped', 'fenix'].includes(tema)
      ? tema
      : 'terracota';
    if (t === 'terracota') delete document.documentElement.dataset.tema;
    else document.documentElement.dataset.tema = t;
    localStorage.setItem('tema_color', t);
    set({ temaColor: t });
  },

  toggleTemaGlobal: () => {
    const { temaGlobal } = get();
    const nuevoTema = temaGlobal === 'dark' ? 'light' : 'dark';
    if (nuevoTema === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    localStorage.setItem('theme', nuevoTema);
    set({ temaGlobal: nuevoTema });
  },

  updateConfiguracion: (payload) => {
    const restauranteId = useAuthStore.getState().restauranteId;
    const data = { ...payload, restaurante_id: restauranteId };
    set({ configuracion: data });
    localDB.configuracion.put(data);
    if (navigator.onLine) {
      supabase
        .from('configuracion')
        .upsert(data)
        .then(({ error }) => {
          if (error)
            console.error('⚠️ Error guardando configuración:', error.message);
        });
    }
  },

  upsertStaff: (empleado) => {
    set((state) => ({
      staff: [empleado, ...state.staff.filter((s) => s.id !== empleado.id)],
    }));
  },

  upsertCliente: (cliente) => {
    set((state) => ({
      clientes: [
        cliente,
        ...state.clientes.filter((c) => String(c.id) !== String(cliente.id)),
      ],
    }));
  },

  upsertProveedor: (proveedor) => {
    set((state) => ({
      proveedores: [
        proveedor,
        ...state.proveedores.filter((p) => p.id !== proveedor.id),
      ],
    }));
  },

  upsertReceta: (receta) => {
    set((state) => ({
      recetas: [
        receta,
        ...state.recetas.filter((r) => String(r.id) !== String(receta.id)),
      ],
    }));
  },

  // ─── 7. GESTIÓN DE TURNOS ─────────────────────────────────────────────────

  abrirTurno: async (datosApertura) => {
    const restauranteId = useAuthStore.getState().restauranteId;
    const { enqueueAction } = useSyncStore.getState();

    // Cerrar silenciosamente cualquier turno huérfano que siguiera 'abierto'
    // (solo en RAM; no lo sincronizamos para no ensuciar histórico).
    set((state) => ({
      turnos: (state.turnos || []).map((t) =>
        t.estado === 'abierto' ? { ...t, estado: 'cerrado_forzado' } : t,
      ),
    }));

    // id de cliente: mismo valor online y offline. Sin colisiones de secuencia.
    const nuevoTurno = {
      id:
        typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      usuario: datosApertura.usuario,
      fecha_apertura: new Date().toISOString(),
      fondo_inicial: Number(datosApertura.fondoCaja) || 0,
      estado: 'abierto',
      restaurante_id: restauranteId,
    };

    // Optimistic en RAM (la UI ve el turno abierto al instante, online u offline).
    set((state) => ({ turnos: [nuevoTurno, ...(state.turnos || [])] }));

    try {
      // enqueueAction persiste en Dexie + encola el upsert remoto.
      // Si resuelve, el turno YA está guardado local y en cola: éxito garantizado
      // aunque no haya red (la subida ocurre luego). Solo revertimos si el
      // ENCOLADO local falló (IndexedDB), no por fallos de red.
      await enqueueAction('turnos', 'upsert', nuevoTurno);

      get().registrarAuditoria({
        usuario: datosApertura.usuario,
        accion: 'APERTURA_TURNO',
        modulo: 'CAJA',
        nivel: 'info',
        detalles: `Turno abierto. Fondo: $${nuevoTurno.fondo_inicial}`,
      });
    } catch (err) {
      console.error('❌ Error abriendo turno (encolado local falló):', err);
      // Revertir el optimistic solo si NO se pudo persistir local.
      set((state) => ({
        turnos: (state.turnos || []).filter((t) => t.id !== nuevoTurno.id),
      }));
      get().showToast('No se pudo abrir el turno. Intenta de nuevo.', 'error');
    }
  },

  cerrarTurno: async (datosCierre) => {
    const { enqueueAction } = useSyncStore.getState();
    const turnoActivo = (get().turnos || []).find(
      (t) => t.estado === 'abierto',
    );
    if (!turnoActivo) {
      console.warn('[cerrarTurno] No hay turno abierto para cerrar.');
      return;
    }

    // Objeto completo con el MISMO id → el upsert actualiza la fila existente.
    const turnoCerrado = {
      ...turnoActivo,
      estado: 'cerrado',
      fecha_cierre: new Date().toISOString(),
      ventas_totales: datosCierre.ventasTotales || 0,
      efectivo_esperado: datosCierre.efectivo_esperado ?? null,
      efectivo_declarado: datosCierre.efectivo_declarado ?? null,
      diferencia: datosCierre.diferencia ?? null,
      // Sprint 4: desglose completo del corte (antes se perdía).
      tarjeta_total: datosCierre.tarjeta_total ?? 0,
      transferencia_total: datosCierre.transferencia_total ?? 0,
      propinas_total: datosCierre.propinas_total ?? 0,
      restaurante_id:
        turnoActivo.restaurante_id || useAuthStore.getState().restauranteId,
    };

    // Optimistic: marcar cerrado en RAM de inmediato.
    set((state) => ({
      turnos: (state.turnos || []).map((t) =>
        t.id === turnoActivo.id ? turnoCerrado : t,
      ),
    }));

    try {
      // Si enqueueAction resuelve, el cierre YA quedó en Dexie + cola: éxito
      // garantizado offline. La subida a Supabase ocurre después sin bloquear.
      await enqueueAction('turnos', 'upsert', turnoCerrado);

      get().registrarAuditoria({
        usuario: datosCierre.usuario,
        accion: 'CIERRE_TURNO',
        modulo: 'CAJA',
        nivel: 'warning',
        detalles: `Turno ${turnoActivo.id} cerrado. Ventas: $${datosCierre.ventasTotales || 0}`,
      });
    } catch (err) {
      console.error('❌ Error cerrando turno (encolado local falló):', err);
      // Revertir a abierto SOLO si no se pudo persistir local (no por red).
      set((state) => ({
        turnos: (state.turnos || []).map((t) =>
          t.id === turnoActivo.id ? turnoActivo : t,
        ),
      }));
      get().showToast('No se pudo cerrar el turno. Intenta de nuevo.', 'error');
    }
  },
}));
