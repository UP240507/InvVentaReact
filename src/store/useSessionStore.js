import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { useAppStore } from './useAppStore';
import {
  getRolEfectivo,
  getCapacidades,
  puedeVerRuta,
  tieneFlag,
} from '../lib/Permisos';

// ─── GUARDS POR CAPACIDADES (Proyecto L, tanda 2) ─────────────────────────────
// Ya no hay mapas de rutas por NOMBRE de rol aquí: las capacidades viven en
// roles_permisos.capacidades (editable por tenant, hidratada a Dexie) con
// fallback a CAPACIDADES_BASE en lib/Permisos.js para la primera sesión.
const capDe = (empleado) =>
  getCapacidades(
    getRolEfectivo(empleado),
    useAppStore.getState().roles_permisos,
  );

export const useSessionStore = create(
  persist(
    (set, get) => ({
      // ── SESIÓN DE EMPLEADO OPERATIVO (por PIN) ───────────────────────────
      empleadoActivo: null,
      horaEntrada: null,
      // El turno en el que se abrió esta sesión. Es lo que le pone fecha de
      // caducidad: ver `sesionVigente`.
      turnoId: null,

      abrirSesionEmpleado: (empleado) => {
        const turnos = useAppStore.getState().turnos || [];
        const abierto = turnos.find((t) => t.estado === 'abierto');
        set({
          empleadoActivo: empleado,
          horaEntrada: new Date().toISOString(),
          turnoId: abierto?.id ?? null,
        });
      },

      cerrarSesionEmpleado: () => {
        set({ empleadoActivo: null, horaEntrada: null, turnoId: null });
      },

      // ── LA SESIÓN CADUCA AL CERRAR EL TURNO ─────────────────────────────
      //
      // Decisión de Chris, 01-sep. Hasta ahora la sesión de un aparato no
      // caducaba NUNCA: `horaEntrada` se guardaba y se persistía, y no la leía
      // nadie. Un teléfono que entró una vez seguía dentro semanas después,
      // con el nombre de quien lo abrió, aunque esa persona ya no trabajara
      // ese día.
      //
      // Se cuelga del turno y no de un reloj propio: los turnos ya existen, ya
      // se cierran a mano, y "hasta que cierre la caja" es lo que la gente del
      // local entiende sin que nadie se lo explique.
      //
      // ── LOS DOS CASOS EN QUE NO CADUCA, Y POR QUÉ ───────────────────────
      //
      // 1. Sesión abierta SIN turno abierto (`turnoId` en null): no hay a qué
      //    colgarla. Caducarla en cuanto alguien cierre un turno cualquiera
      //    echaría a quien entró antes de abrir la caja.
      //
      // 2. El turno no está en la lista cargada. **No se decide por ausencia.**
      //    Al arrancar, la caja hidrata desde Dexie y luego desde Supabase: si
      //    esto devolviera `false` mientras la lista está vacía, cada arranque
      //    echaría a todo el mundo a la pantalla del PIN. Un fallo que además
      //    sólo se vería en el local, con la red lenta.
      sesionVigente: () => {
        const { empleadoActivo, turnoId } = get();
        if (!empleadoActivo) return false;
        if (turnoId === null || turnoId === undefined) return true;

        const turnos = useAppStore.getState().turnos || [];
        const suyo = turnos.find((t) => String(t.id) === String(turnoId));
        if (!suyo) return true;

        return suyo.estado === 'abierto';
      },

      // ── GUARDIA: ¿puede el empleado acceder a esta ruta? ────────────────
      puedeAcceder: (ruta) => {
        const { empleadoActivo } = get();
        if (!empleadoActivo) return false;
        return puedeVerRuta(capDe(empleadoActivo), ruta);
      },

      // ── GUARDIA: turno activo ────────────────────────────────────────────
      // Lee de useAppStore como fuente única de verdad.
      // turnoActivo ya no se persiste aquí — evita sistema paralelo.
      hayTurnoActivo: () => {
        const { empleadoActivo } = get();
        if (!empleadoActivo) return false;

        if (tieneFlag(capDe(empleadoActivo), 'exento_turno')) return true;

        const turnos = useAppStore.getState().turnos || [];
        return turnos.some((t) => t.estado === 'abierto');
      },

      // ── HELPER: ruta inicial según capacidades del rol ──────────────────
      getRutaInicial: () => {
        const { empleadoActivo } = get();
        if (!empleadoActivo) return '/checador';
        return capDe(empleadoActivo).ruta_inicial || '/mesas';
      },
    }),
    {
      name: 'session-empleado',
      // Solo persistir sesión del empleado — turno viene de useAppStore
      partialize: (state) => ({
        empleadoActivo: state.empleadoActivo,
        horaEntrada: state.horaEntrada,
        // Sin persistirlo, recargar la pestaña olvidaría a qué turno pertenece
        // la sesión y volvería a durar para siempre.
        turnoId: state.turnoId,
      }),
    },
  ),
);
