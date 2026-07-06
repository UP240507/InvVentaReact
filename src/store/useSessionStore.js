import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { useAppStore } from './useAppStore';

// ─── RUTAS PERMITIDAS POR ROL ─────────────────────────────────────────────────
export const RUTAS_POR_ROL = {
  Admin: '*',
  Administrador: '*',
  Gerente: [
    'dashboard',
    'mesas',
    'pos',
    'kds',
    'propinas',
    'ingredientes',
    'compras',
    'recepcion',
    'mermas',
    'proveedores',
    'empleados',
    'asistencias',
    'nominas',
    'permisos',
    'clientes',
    'reportes',
    'facturas',
    'zonas-produccion',
    'auditoria',
    'configuracion',
    'perfil',
    'mi-plan',
  ],
  Cajero: ['pos', 'mesas', 'propinas', 'facturas', 'reportes', 'perfil'],
  Mesero: ['mesas', 'pos', 'perfil'],
  Chef: ['kds', 'perfil'],
  Barista: ['kds', 'perfil'],
};

export const RUTA_INICIAL_POR_ROL = {
  Admin: '/dashboard',
  Administrador: '/dashboard',
  Gerente: '/dashboard',
  // Cajero aterriza en /mesas (con sidebar), NO en /pos: /pos es full-screen y
  // oculta el sidebar (isFullScreenRoute en App.jsx), dejándolo sin navegación y
  // atrapado (al salir del POS rebotaría de vuelta a /pos). Desde /mesas alcanza
  // POS/Propinas/Reportes/Facturas por el menú.
  Cajero: '/mesas',
  Mesero: '/mesas',
  Chef: '/kds',
  Barista: '/kds',
};

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

        const rol = empleadoActivo.rol || empleadoActivo.puesto || 'Mesero';

        if (['Admin', 'Administrador'].includes(rol)) return true;

        const rutaLimpia = ruta.replace(/^\//, '').split('/')[0] || 'dashboard';
        const permitidas = RUTAS_POR_ROL[rol] || RUTAS_POR_ROL['Mesero'];

        if (permitidas === '*') return true;
        return permitidas.includes(rutaLimpia);
      },

      // ── GUARDIA: turno activo ────────────────────────────────────────────
      // Lee de useAppStore como fuente única de verdad.
      // turnoActivo ya no se persiste aquí — evita sistema paralelo.
      hayTurnoActivo: () => {
        const { empleadoActivo } = get();
        if (!empleadoActivo) return false;

        const rol = empleadoActivo.rol || empleadoActivo.puesto || 'Mesero';
        if (['Admin', 'Administrador', 'Gerente'].includes(rol)) return true;

        const turnos = useAppStore.getState().turnos || [];
        return turnos.some((t) => t.estado === 'abierto');
      },

      // ── HELPER: ruta inicial según rol ──────────────────────────────────
      getRutaInicial: () => {
        const { empleadoActivo } = get();
        if (!empleadoActivo) return '/checador';
        const rol = empleadoActivo.rol || empleadoActivo.puesto || 'Mesero';
        return RUTA_INICIAL_POR_ROL[rol] || '/mesas';
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
