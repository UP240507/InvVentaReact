import { create } from 'zustand';
import { supabase } from '../../api/supabase';

// D1: cache del contexto de sesión para arranque/refresh sin red.
// Es data del propio dispositivo (no secretos). Permite que un parpadeo de
// internet NO expulse al cajero al login.
const AUTH_CACHE_KEY = 'invventa-auth-ctx';
const guardarCacheCtx = (ctx) => {
  try {
    localStorage.setItem(AUTH_CACHE_KEY, JSON.stringify(ctx));
  } catch {
    /* noop */
  }
};
const leerCacheCtx = () => {
  try {
    return JSON.parse(localStorage.getItem(AUTH_CACHE_KEY) || 'null');
  } catch {
    return null;
  }
};
const limpiarCacheCtx = () => {
  try {
    localStorage.removeItem(AUTH_CACHE_KEY);
  } catch {
    /* noop */
  }
};

// ¿El error es de red (mantener sesión) o de sesión/datos (cerrar)?
const esErrorDeRed = (err) =>
  !navigator.onLine ||
  /failed to fetch|networkerror|network ?changed|fetch|load failed|timeout/i.test(
    err?.message || '',
  );

/**
 * Reloj para las llamadas de red del arranque.
 *
 * **Por qué hace falta aunque exista el atajo de `navigator.onLine`.**
 * `navigator.onLine` dice si hay ENLACE, no si hay INTERNET. Con el cable WAN
 * desenchufado del router, el wifi sigue arriba y el navegador reporta `true`
 * con toda tranquilidad. Es exactamente el escenario de un restaurante al que
 * se le cayó el proveedor: hay red local, no hay nube.
 *
 * En ese estado las consultas de identidad no fallan rápido —en el WebView de
 * Tauri se quedan colgadas—, así que el arranque no llegaba nunca a apagar la
 * pantalla de «Cargando contenido…». La caja se quedaba ahí, y con ella todos
 * los dispositivos que cargan la app desde la caja.
 *
 * El mensaje dice "timeout" a propósito: `esErrorDeRed` lo reconoce, así que
 * el fallo cae al camino de caché en vez de cerrar la sesión.
 */
const conTimeout = (promesa, ms = 8000) =>
  Promise.race([
    promesa,
    new Promise((_, rechazar) =>
      setTimeout(() => rechazar(new Error('timeout-red')), ms),
    ),
  ]);

// 🔑 Propaga el JWT de la sesión al canal de realtime. Sin esto, el WebSocket
// escucha con la anon key → get_restaurante_id() = null → RLS descarta los
// eventos en silencio (HTTP funciona, realtime mudo). Se llama al cargar y
// refrescar sesión para que el realtime SIEMPRE tenga el token vigente.
const fijarTokenRealtime = (session) => {
  try {
    const token = session?.access_token;
    if (token && supabase.realtime?.setAuth) {
      supabase.realtime.setAuth(token);
    }
  } catch (e) {
    console.warn(
      '⚠️ [Auth] No se pudo fijar el token del realtime:',
      e?.message,
    );
  }
};

// Aplica/limpia la identidad de empleado en useSessionStore según quién se
// logueó. Import dinámico para no introducir el ciclo useAuthStore→useSessionStore.
// Para empleados se setea empleadoActivo con setState directo (patrón ya usado en
// el código para piezas sin action dedicada); para admin/tenant se limpia, para
// no cruzar identidades. Se le quita el PIN al contexto que queda en memoria.
const sincronizarEmpleadoActivo = async (esEmpleado, userObj) => {
  try {
    const { useSessionStore } = await import('../../store/useSessionStore');
    if (esEmpleado && userObj) {
      const empleadoCtx = { ...userObj };
      delete empleadoCtx.pin;
      delete empleadoCtx.pin_acceso;
      useSessionStore.setState({ empleadoActivo: empleadoCtx });
    } else {
      useSessionStore.getState().cerrarSesionEmpleado();
    }
  } catch {
    /* noop */
  }
};

export const useAuthStore = create((set, get) => ({
  user: null, // Fila de 'usuarios' (admin/tenant) o de 'staff' (empleado, con esEmpleado:true)
  session: null, // Token de Supabase Auth
  restauranteId: null, // Acceso directo sin get().user?.restaurante_id
  suscripcion: null, // Estado de suscripción del tenant
  isLoading: true,
  error: null,
  _vigilancia: null, // ref del listener onAuthStateChange (idempotencia)
  _expulsando: false, // guard anti-reentrada (signOut dispara SIGNED_OUT)

  // ── 0. VIGILANCIA DE SESIÓN (D1 hardening) ───────────────────────────────
  // El bug que cierra: el cache 'invventa-auth-ctx' puede pintar la UI como
  // autenticada mientras la sesión real de Supabase ya murió → los writes
  // fallan 401 en silencio y la cola se llena de tareas condenadas.
  // Regla híbrida (respetando la resiliencia offline):
  //   * OFFLINE → jamás expulsar. El cajero sigue operando contra Dexie+cola.
  //   * ONLINE + token irrecuperable (refresh falla con error NO-red, o
  //     supabase-js emite SIGNED_OUT) → expulsión limpia a /login.
  //   * Al VOLVER la red ('online') → verificación activa inmediata.
  iniciarVigilanciaSesion: () => {
    if (get()._vigilancia) return; // idempotente (StrictMode / re-checkSession)

    try {
      const { data } = supabase.auth.onAuthStateChange((event, session) => {
        // Token nuevo (refresh, login, restauración): propagar a estado y realtime.
        if (session?.access_token) {
          fijarTokenRealtime(session);
          set({ session });
          return;
        }
        // supabase-js declaró la sesión terminada. Si fue nuestro propio
        // logout/expulsión, el guard _expulsando (o user ya nulo) lo ignora.
        // Solo expulsamos con red confirmada: un SIGNED_OUT en pleno apagón
        // no debe tirar al cajero — el listener de 'online' re-verifica luego.
        if (event === 'SIGNED_OUT') {
          if (get()._expulsando || !get().user) return;
          if (navigator.onLine) {
            get()._expulsarSesionMuerta('SIGNED_OUT emitido por supabase-js');
          } else {
            console.warn(
              '⚠️ [Auth] SIGNED_OUT estando offline: se conserva el contexto; se re-verificará al volver la red.',
            );
          }
        }
      });
      set({ _vigilancia: data?.subscription || true });
    } catch (e) {
      console.warn('⚠️ [Auth] No se pudo montar la vigilancia:', e?.message);
    }

    // Al recuperar red: verificar de inmediato que el token siga vivo. Pequeño
    // respiro para que el stack de red del navegador termine de levantarse.
    try {
      window.addEventListener('online', () => {
        setTimeout(() => get().verificarSesionViva(), 1500);
      });
    } catch {
      /* entorno sin window (tests) */
    }
  },

  // Verificación activa. Devuelve true si la sesión es utilizable (o si no hay
  // forma honesta de juzgarla, p.ej. offline). false = se expulsó.
  verificarSesionViva: async () => {
    if (!navigator.onLine) return true; // resiliencia offline: no juzgar sin red
    if (!get().user) return true; // no hay contexto que proteger
    try {
      const { data } = await supabase.auth.getSession();
      if (data?.session) {
        fijarTokenRealtime(data.session);
        set({ session: data.session });
        return true;
      }
      // UI con contexto pero sin sesión local: el caso enmascarado exacto.
      // Último intento honesto de revivirla antes de expulsar.
      const { data: r, error: rErr } = await supabase.auth.refreshSession();
      if (r?.session) {
        fijarTokenRealtime(r.session);
        set({ session: r.session });
        console.log('✅ [Auth] Sesión recuperada vía refresh.');
        return true;
      }
      if (rErr && esErrorDeRed(rErr)) return true; // la red mintió: no expulsar
      await get()._expulsarSesionMuerta(
        rErr?.message || 'sin sesión y refresh irrecuperable',
      );
      return false;
    } catch (e) {
      if (esErrorDeRed(e)) return true;
      await get()._expulsarSesionMuerta(e?.message);
      return false;
    }
  },

  // Expulsión limpia y única: cierra realtime, limpia cache/identidades y deja
  // el estado en null → los guards rebotan a /login en el siguiente render.
  _expulsarSesionMuerta: async (motivo) => {
    if (get()._expulsando) return;
    set({ _expulsando: true });
    console.warn(
      `🔒 [Auth] Sesión muerta con red confirmada (${motivo}). Expulsando a login.`,
    );
    try {
      const { useAppStore } = await import('../../store/useAppStore');
      useAppStore.getState().detenerSuscripcionKDS?.();
    } catch {
      /* noop */
    }
    try {
      await supabase.auth.signOut();
    } catch {
      /* ya estaba muerta; el objetivo es limpiar el estado local */
    }
    limpiarCacheCtx();
    try {
      const { useSessionStore } = await import('../../store/useSessionStore');
      useSessionStore.getState().cerrarSesionEmpleado();
    } catch {
      /* noop */
    }
    set({
      session: null,
      user: null,
      restauranteId: null,
      suscripcion: null,
      isLoading: false,
      error: 'Tu sesión expiró. Vuelve a iniciar sesión.',
      _expulsando: false,
    });
  },

  // ── 1. Verificar sesión al recargar ─────────────────────────────────────
  checkSession: async () => {
    // La vigilancia se monta aquí porque checkSession corre en el arranque de
    // toda la app (idempotente si se llama de nuevo).
    get().iniciarVigilanciaSesion();
    try {
      // Con reloj: `getSession` lee de localStorage, pero si el token está
      // vencido intenta refrescarlo por red — y sin internet eso se cuelga.
      const {
        data: { session },
        error: sessionError,
      } = await conTimeout(supabase.auth.getSession(), 6000);
      if (sessionError) throw sessionError;

      if (session) {
        // Fijar token del realtime ANTES de cargar contexto (que monta el canal).
        fijarTokenRealtime(session);
        await get()._loadUserContext(session);
      } else {
        set({
          session: null,
          user: null,
          restauranteId: null,
          suscripcion: null,
          isLoading: false,
        });
      }
    } catch (error) {
      // getSession lee de localStorage; un error aquí no debe nukear la sesión
      // si es de red. Mantener y dejar que _loadUserContext use el cache.
      console.error('❌ [Auth] Error validando sesión:', error.message);
      set({ isLoading: false });
    }
  },

  // ── 2. Login ─────────────────────────────────────────────────────────────
  login: async (email, password) => {
    set({ isLoading: true, error: null });
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) throw error;
      fijarTokenRealtime(data.session);
      await get()._loadUserContext(data.session);
      return true;
    } catch (error) {
      set({ error: error.message, isLoading: false });
      return false;
    }
  },

  // ── 3. Logout ────────────────────────────────────────────────────────────
  logout: async () => {
    set({ isLoading: true, _expulsando: true }); // silencia el SIGNED_OUT propio
    await supabase.auth.signOut();
    limpiarCacheCtx();
    // Limpiar también la sesión de empleado (PIN) para no dejar identidad cruzada.
    try {
      const { useSessionStore } = await import('../../store/useSessionStore');
      useSessionStore.getState().cerrarSesionEmpleado();
    } catch {
      /* noop */
    }
    set({
      session: null,
      user: null,
      restauranteId: null,
      suscripcion: null,
      isLoading: false,
      _expulsando: false,
    });
  },

  // ── 4. HELPER PRIVADO: carga usuario + restaurante_id + suscripcion ──────
  _loadUserContext: async (session) => {
    try {
      // Asegura que el realtime tenga el token de ESTA sesión (refresh incluido).
      fijarTokenRealtime(session);

      const authId = session.user.id;
      const emailPrefix = (session.user.email || '')
        .split('@')[0]
        .toLowerCase()
        .trim();
      let userData = null;
      let susData = null;
      let esEmpleado = false;

      // ── ATAJO OFFLINE ────────────────────────────────────────────────────
      // Si NO hay red, ni se intentan las consultas de identidad. No es una
      // optimización: es lo que impide que la app se quede en «Cargando
      // contenido…» para siempre.
      //
      // Estas tres consultas no tienen timeout, y en el WebView de Tauri una
      // petición sin ruta a internet no falla rápido como en Chrome: se queda
      // colgada. Con la caja sin internet, el arranque no llegaba nunca al
      // `set({ isLoading: false })` de más abajo y la pantalla de carga se
      // quedaba puesta — en la caja Y, por lo tanto, en todo dispositivo que
      // cargara la app desde ella.
      //
      // `fetchInitialData` ya usaba exactamente este patrón (Dexie primero,
      // red solo si `navigator.onLine`). Aquí faltaba.
      const cacheOffline = leerCacheCtx();
      if (!navigator.onLine && cacheOffline?.user) {
        console.warn(
          '⚠️ [Auth] Sin red al arrancar: contexto desde cache, sin tocar Supabase.',
        );
        await sincronizarEmpleadoActivo(
          !!cacheOffline.esEmpleado,
          cacheOffline.user,
        );
        set({
          session,
          user: cacheOffline.user,
          restauranteId:
            cacheOffline.restauranteId || cacheOffline.user.restaurante_id,
          suscripcion: cacheOffline.suscripcion || null,
          error: null,
          isLoading: true, // hasta que fetchInitialData hidrate desde Dexie
        });
        const { useAppStore } = await import('../../store/useAppStore');
        await useAppStore.getState().fetchInitialData();
        set({ isLoading: false });
        return;
      }

      try {
        // Resolver identidad por auth_id (clave fiable). Orden:
        //   1) usuarios por auth_id        → admin/tenant
        //   2) usuarios por username       → compat con filas legadas sin auth_id
        //   3) staff por auth_id           → empleado operativo con sesión real
        // maybeSingle(): 0 filas devuelve null y NO lanza. Antes .single() tiraba
        // 406 ("Cannot coerce the result to a single JSON object") y como un
        // empleado vive en staff (no en usuarios), se le cerraba la sesión al instante.
        let { data: u, error: uErr } = await conTimeout(
          supabase
            .from('usuarios')
            .select('*')
            .eq('auth_id', authId)
            .maybeSingle(),
        );
        if (uErr) throw uErr;

        if (!u && emailPrefix) {
          const { data: uByName } = await conTimeout(
            supabase
              .from('usuarios')
              .select('*')
              .ilike('username', emailPrefix)
              .maybeSingle(),
          );
          u = uByName || null;
        }

        if (!u) {
          const { data: s, error: sErr } = await conTimeout(
            supabase
              .from('staff')
              .select('*')
              .eq('auth_id', authId)
              .maybeSingle(),
          );
          if (sErr) throw sErr;
          if (s) {
            esEmpleado = true;
            // Los guards leen user.rol y user.restaurante_id; staff ya trae ambos.
            u = { ...s, esEmpleado: true };
          }
        }

        if (!u) throw new Error('Usuario no encontrado en el sistema.');
        userData = u;

        // Fase 1: se trae la suscripción con el plan EMBEBIDO (planes.limites)
        // para que usePlan/derivarPlan tengan límites aún offline (van al cache).
        // La VIGENCIA ya no se filtra aquí: la decide derivarPlan en el cliente
        // (trial→trial_hasta; activo/moroso→fecha_vencimiento+dias_gracia).
        const { data: s } = await supabase
          .from('suscripciones')
          .select('*, planes(id, nombre, limites)')
          .eq('restaurante_id', userData.restaurante_id)
          .in('estado', ['trial', 'activo', 'moroso'])
          .maybeSingle();
        susData = s || null;

        // ✅ Cachear contexto para arranque/refresh offline (D1)
        guardarCacheCtx({
          user: userData,
          restauranteId: userData.restaurante_id,
          suscripcion: susData,
          esEmpleado,
        });
      } catch (ctxErr) {
        // Si fue RED y tenemos cache → seguir offline con el contexto cacheado.
        const cache = leerCacheCtx();
        if (esErrorDeRed(ctxErr) && cache?.user) {
          console.warn(
            '⚠️ [Auth] Sin red: usando contexto cacheado (modo offline).',
          );
          userData = cache.user;
          susData = cache.suscripcion || null;
          esEmpleado = !!cache.esEmpleado;
        } else {
          throw ctxErr; // sin cache, o error real (usuario inexistente) → propagar
        }
      }

      if (!susData) {
        console.warn('⚠️ [Auth] Sin suscripción activa. Modo lectura.');
      }

      // Establecer/limpiar empleadoActivo según la identidad resuelta.
      await sincronizarEmpleadoActivo(esEmpleado, userData);

      set({
        session,
        user: userData,
        restauranteId: userData.restaurante_id,
        suscripcion: susData || null,
        error: null,
        isLoading: true, // hasta que fetchInitialData termine
      });

      // Importación dinámica para romper la dependencia circular
      const { useAppStore } = await import('../../store/useAppStore');
      await useAppStore.getState().fetchInitialData();

      set({ isLoading: false });
    } catch (error) {
      // D1: solo cerrar sesión si NO es de red (sesión/datos realmente inválidos).
      if (esErrorDeRed(error)) {
        // Mantener la sesión Y rehidratar el contexto desde cache si existe.
        // Antes este camino dejaba user=null aunque la sesión siguiera viva →
        // el estado "sesión sin user" hacía que TODOS los guards (AdminRoute y el
        // check del Reloj) rebotaran a /login. Rehidratar evita ese limbo.
        const cache = leerCacheCtx();
        if (cache?.user) {
          console.warn(
            '⚠️ [Auth] Error de red cargando contexto; se MANTIENE la sesión y se rehidrata desde cache.',
          );
          await sincronizarEmpleadoActivo(!!cache.esEmpleado, cache.user);
          set({
            session,
            user: cache.user,
            restauranteId: cache.restauranteId || cache.user.restaurante_id,
            suscripcion: cache.suscripcion || null,
            isLoading: false,
            error: null,
          });
        } else {
          console.warn(
            '⚠️ [Auth] Error de red cargando contexto sin cache; se MANTIENE la sesión (sin contexto).',
          );
          set({ isLoading: false, error: null });
        }
        return;
      }
      console.error(
        '❌ [Auth] Contexto inválido, cerrando sesión:',
        error.message,
      );
      await supabase.auth.signOut();
      limpiarCacheCtx();
      try {
        const { useSessionStore } = await import('../../store/useSessionStore');
        useSessionStore.getState().cerrarSesionEmpleado();
      } catch {
        /* noop */
      }
      set({
        session: null,
        user: null,
        restauranteId: null,
        suscripcion: null,
        isLoading: false,
        error: error.message,
      });
    }
  },

  // ── 5. HELPER: el usuario tiene suscripción activa? ──────────────────────
  puedeOperar: () => {
    return get().suscripcion !== null;
  },
}));
