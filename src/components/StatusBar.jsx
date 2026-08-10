// ─── STATUS BAR (Proyecto D, shell admin) ─────────────────────────────────────
// Primer consumidor de los tokens de tema (--adm-*): franja inferior del shell
// con diagnóstico SIEMPRE visible — las DOS conectividades (nube y caja), turno
// de caja, cola de sincronización y dead-letter.
// Reacciona sola a data-tema y .dark porque consume utilidades adm-*.

import { useAppStore } from '../store/useAppStore';
import { useSyncStore } from '../store/useSyncStore';
import { useSessionStore } from '../store/useSessionStore';
import { useAuthStore } from '../features/auth/useAuthStore';
import { CloudOff, CloudUpload, AlertOctagon, Printer } from 'lucide-react';
import { useConectividad } from '../hooks/useConectividad';

export default function StatusBar() {
  const turnos = useAppStore((s) => s.turnos);
  // `isOffline` se conserva para la cola —es la que decide si drenar— pero YA NO
  // decide lo que se enseña: ver el comentario del indicador, abajo.
  const isOffline = useSyncStore((s) => s.isOffline);
  const { nube, local, comprobandoLocal } = useConectividad();
  const pendingTasks = useSyncStore((s) => s.pendingTasks);
  const deadTasks = useSyncStore((s) => s.deadTasks);
  const empleadoActivo = useSessionStore((s) => s.empleadoActivo);
  const user = useAuthStore((s) => s.user);

  const turnoAbierto = (turnos || []).find((t) => t.estado === 'abierto');
  const quien = empleadoActivo?.nombre || user?.nombre || '—';

  return (
    <div className="h-8 flex-shrink-0 flex items-center gap-4 px-4 text-[11px] font-medium bg-adm-sidebar text-adm-sidebar-muted border-t border-adm-border select-none">
      {/* ── DOS CONECTIVIDADES, DOS PUNTOS ──────────────────────────────────
          Antes había uno solo, atado a `navigator.onLine`, y por eso mentía en
          el caso que más importa: el mesero que sale a la calle y tira de datos
          móviles ve **«En línea»** aunque el hub esté inalcanzable, toca
          imprimir y no sale nada.

          Son redes distintas que fallan por su cuenta: la nube sincroniza, la
          caja imprime. Un solo indicador obliga a elegir cuál de las dos
          representa, y cualquiera de las dos elecciones miente la mitad de las
          veces.

          El de la caja sólo se pinta cuando NO está: con todo bien, dos puntos
          verdes en una barra de 32 px son ruido. Se enseña la excepción. */}
      <span className="flex items-center gap-1.5">
        <span
          className={`w-1.5 h-1.5 rounded-full ${nube ? 'bg-adm-ok' : 'bg-adm-danger'}`}
        />
        <span className={nube ? '' : 'text-adm-danger'}>
          {nube ? 'En línea' : 'Sin internet — trabajando local'}
        </span>
      </span>

      {!local && !comprobandoLocal && (
        <>
          <span className="w-px h-3.5 bg-adm-border" />
          <span className="flex items-center gap-1.5 text-adm-warn">
            <Printer className="w-3 h-3 shrink-0" />
            Sin conexión con la caja — no se puede imprimir
          </span>
        </>
      )}

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
