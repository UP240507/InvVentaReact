// ─── STATUS BAR (Proyecto D, shell admin) ─────────────────────────────────────
// Primer consumidor de los tokens de tema (--adm-*): franja inferior del shell
// con diagnóstico SIEMPRE visible — conexión real (sync store, no
// navigator.onLine), turno de caja, cola de sincronización y dead-letter.
// Reacciona sola a data-tema y .dark porque consume utilidades adm-*.

import { useAppStore } from '../store/useAppStore';
import { useSyncStore } from '../store/useSyncStore';
import { useSessionStore } from '../store/useSessionStore';
import { useAuthStore } from '../features/auth/useAuthStore';
import { CloudOff, CloudUpload, AlertOctagon } from 'lucide-react';

export default function StatusBar() {
  const turnos = useAppStore((s) => s.turnos);
  const isOffline = useSyncStore((s) => s.isOffline);
  const pendingTasks = useSyncStore((s) => s.pendingTasks);
  const deadTasks = useSyncStore((s) => s.deadTasks);
  const empleadoActivo = useSessionStore((s) => s.empleadoActivo);
  const user = useAuthStore((s) => s.user);

  const turnoAbierto = (turnos || []).find((t) => t.estado === 'abierto');
  const quien = empleadoActivo?.nombre || user?.nombre || '—';

  return (
    <div className="h-8 flex-shrink-0 flex items-center gap-4 px-4 text-[11px] font-medium bg-adm-sidebar text-adm-sidebar-muted border-t border-adm-border select-none">
      <span className="flex items-center gap-1.5">
        <span
          className={`w-1.5 h-1.5 rounded-full ${isOffline ? 'bg-adm-danger' : 'bg-adm-ok'}`}
        />
        <span className={isOffline ? 'text-adm-danger' : ''}>
          {isOffline ? 'Sin conexión — trabajando local' : 'En línea'}
        </span>
      </span>

      <span className="w-px h-3.5 bg-adm-border" />

      <span className="text-adm-sidebar-fg/80">
        {turnoAbierto
          ? `Turno abierto · ${turnoAbierto.usuario || 'Caja'}`
          : 'Sin turno de caja'}
      </span>

      <span className="w-px h-3.5 bg-adm-border" />

      <span>Sesión: {quien}</span>

      <span className="flex-1" />

      {pendingTasks > 0 && (
        <span className="flex items-center gap-1.5">
          <CloudUpload className="w-3.5 h-3.5" />
          {pendingTasks} por sincronizar
        </span>
      )}
      {deadTasks > 0 && (
        <span
          className="flex items-center gap-1.5 text-adm-danger"
          title="Cambios que no pudieron sincronizarse; revisa el diagnóstico"
        >
          <AlertOctagon className="w-3.5 h-3.5" />
          {deadTasks} con error
        </span>
      )}
      {isOffline && pendingTasks === 0 && (
        <span className="flex items-center gap-1.5">
          <CloudOff className="w-3.5 h-3.5" />
          Los cambios se guardan localmente
        </span>
      )}
    </div>
  );
}
