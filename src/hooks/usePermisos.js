// ─── HOOK DE PERMISOS PARA COMPONENTES (Proyecto L, tanda 2) ──────────────────
// Resuelve la sesión activa (empleado por PIN > dueño/elevado) y expone sus
// capacidades vivas. Reactivo: si el Admin edita roles_permisos, los guards de
// pantalla se actualizan al llegar el fetch (Dexie ya hidrata roles_permisos).

import { useAppStore } from '../store/useAppStore';
import { useSessionStore } from '../store/useSessionStore';
import { useAuthStore } from '../features/auth/useAuthStore';
import {
  getRolEfectivo,
  getCapacidades,
  puedeVerRuta,
  tieneFlag,
} from '../lib/Permisos';

export function usePermisos() {
  const rolesPermisos = useAppStore((s) => s.roles_permisos);
  const empleadoActivo = useSessionStore((s) => s.empleadoActivo);
  const user = useAuthStore((s) => s.user);

  const persona = empleadoActivo || user;
  const rol = getRolEfectivo(persona);
  const cap = getCapacidades(rol, rolesPermisos);

  return {
    rol,
    cap,
    puedeVerRuta: (ruta) => puedeVerRuta(cap, ruta),
    flag: (nombre) => tieneFlag(cap, nombre),
  };
}
