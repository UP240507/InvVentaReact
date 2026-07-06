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

  // ── 1. Verificar sesión al recargar ─────────────────────────────────────
  checkSession: async () => {
    try {
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();
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
    set({ isLoading: true });
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

      try {
        // Resolver identidad por auth_id (clave fiable). Orden:
        //   1) usuarios por auth_id        → admin/tenant
        //   2) usuarios por username       → compat con filas legadas sin auth_id
        //   3) staff por auth_id           → empleado operativo con sesión real
        // maybeSingle(): 0 filas devuelve null y NO lanza. Antes .single() tiraba
        // 406 ("Cannot coerce the result to a single JSON object") y como un
        // empleado vive en staff (no en usuarios), se le cerraba la sesión al instante.
        let { data: u, error: uErr } = await supabase
          .from('usuarios')
          .select('*')
          .eq('auth_id', authId)
          .maybeSingle();
        if (uErr) throw uErr;

        if (!u && emailPrefix) {
          const { data: uByName } = await supabase
            .from('usuarios')
            .select('*')
            .ilike('username', emailPrefix)
            .maybeSingle();
          u = uByName || null;
        }

        if (!u) {
          const { data: s, error: sErr } = await supabase
            .from('staff')
            .select('*')
            .eq('auth_id', authId)
            .maybeSingle();
          if (sErr) throw sErr;
          if (s) {
            esEmpleado = true;
            // Los guards leen user.rol y user.restaurante_id; staff ya trae ambos.
            u = { ...s, esEmpleado: true };
          }
        }

        if (!u) throw new Error('Usuario no encontrado en el sistema.');
        userData = u;

        const hoy = new Date().toISOString().split('T')[0];
        const { data: s } = await supabase
          .from('suscripciones')
          .select('*')
          .eq('restaurante_id', userData.restaurante_id)
          .eq('estado', 'activo')
          .gte('fecha_vencimiento', hoy)
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
