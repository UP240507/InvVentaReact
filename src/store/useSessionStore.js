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

      abrirSesionEmpleado: (empleado) => {
        set({
          empleadoActivo: empleado,
          horaEntrada: new Date().toISOString(),
        });
      },

      cerrarSesionEmpleado: () => {
        set({ empleadoActivo: null, horaEntrada: null });
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
      }),
    },
  ),
);
