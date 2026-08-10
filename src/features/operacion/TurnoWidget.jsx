import { useState, useEffect } from 'react';
import {
  Clock,
  PlayCircle,
  StopCircle,
  DollarSign,
  AlertTriangle,
  CheckCircle,
  X,
} from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { useAuthStore } from '../auth/useAuthStore';
import { parseUTC } from '../../utils/parseUTC';

export default function TurnoWidget() {
  const { turnos, ventas, abrirTurno, cerrarTurno, showToast } = useAppStore();
  const { user } = useAuthStore();

  const [modalApertura, setModalApertura] = useState(false);
  const [modalCierre, setModalCierre] = useState(false);
  const [fondoCaja, setFondoCaja] = useState('');

  // ✅ FIX: guardar Date.now() en estado en lugar de llamarlo en render (impure function)
  const [ahora, setAhora] = useState(() => Date.now());

  const turnoActivo =
    (turnos || []).find((t) => t.estado === 'abierto') || null;

  // ✅ FIX: dependencia correcta — reacciona cuando el turno cambia, actualiza cada minuto
  useEffect(() => {
    if (!turnoActivo) return;
    const timeoutId = setTimeout(() => setAhora(Date.now()), 0);
    const id = setInterval(() => setAhora(Date.now()), 60000);
    return () => {
      clearTimeout(timeoutId);
      clearInterval(id);
    };
  }, [turnoActivo]);

  // ✅ FIX: usa `ahora` (estado) en lugar de Date.now() (impura en render)
  const tiempoTranscurrido = () => {
    if (!turnoActivo?.fecha_apertura) return '—';
    const apertura = parseUTC(turnoActivo.fecha_apertura);
    if (!apertura) return '—';
    const diff = ahora - apertura.getTime();
    if (diff < 0) return '< 1m';
    const h = Math.floor(diff / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  };

  const handleAbrirTurno = async () => {
    if (fondoCaja === '' || Number(fondoCaja) < 0) {
      showToast('Ingresa un fondo de caja válido', 'error');
      return;
    }
    await abrirTurno({
      usuario: user?.nombre || user?.username || 'Gerente',
      fondoCaja: Number(fondoCaja),
    });
    setModalApertura(false);
    setFondoCaja('');
    showToast('Turno abierto — operaciones habilitadas', 'success');
  };

  const handleCerrarTurno = async () => {
    if (!turnoActivo) return;
    const apertura = parseUTC(turnoActivo.fecha_apertura);
    const ventasTurno = (ventas || []).filter((v) => {
      const f = parseUTC(v.fecha || v.created_at);
      return f && apertura && f >= apertura;
    });
    await cerrarTurno({
      usuario: user?.nombre || user?.username || 'Gerente',
      ventasTotales: ventasTurno.reduce(
        (s, v) => s + (Number(v.total) || 0),
        0,
      ),
    });
    setModalCierre(false);
    showToast('Turno cerrado exitosamente', 'success');
  };

  const fondo = turnoActivo?.fondo_inicial || 0;
  const apertura = turnoActivo?.fecha_apertura
    ? parseUTC(turnoActivo.fecha_apertura)?.toLocaleTimeString('es-MX', {
        hour: '2-digit',
        minute: '2-digit',
      })
    : '—';

  return (
    <>
      {/* WIDGET */}
      <div
        className={`bg-white dark:bg-ops-panel rounded-ui-lg border-2 p-6 shadow-sm transition-all ${
          turnoActivo ? 'border-ops-ok/30' : 'border-ops-danger/30'
        }`}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <div
              className={`p-3 rounded-ui border ${
                turnoActivo
                  ? 'bg-ops-ok/10 border-ops-ok/30'
                  : 'bg-ops-danger/10 border-ops-danger/30'
              }`}
            >
              <Clock
                className={`w-6 h-6 ${
                  turnoActivo ? 'text-ops-ok' : 'text-ops-danger'
                }`}
              />
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-ops-muted">
                Turno de caja
              </p>
              <div className="flex items-center gap-2 mt-0.5">
                <div
                  className={`w-2 h-2 rounded-full ${
                    turnoActivo ? 'bg-ops-ok animate-pulse' : 'bg-ops-danger'
                  }`}
                />
                <p
                  className={`font-black text-lg font-syne leading-none ${
                    turnoActivo ? 'text-ops-ok' : 'text-ops-danger'
                  }`}
                >
                  {turnoActivo ? 'Abierto' : 'Cerrado'}
                </p>
              </div>
            </div>
          </div>

          {turnoActivo ? (
            <button
              onClick={() => setModalCierre(true)}
              className="flex items-center gap-2 px-4 py-2.5 bg-ops-danger/10 hover:bg-ops-danger/15 dark:hover:bg-ops-danger/20 border-2 border-ops-danger/30 text-ops-danger rounded-ui font-black text-sm transition-all active:scale-95"
            >
              <StopCircle className="w-4 h-4" /> Cerrar turno
            </button>
          ) : (
            <button
              onClick={() => setModalApertura(true)}
              className="flex items-center gap-2 px-4 py-2.5 bg-ops-ok text-ops-ok-fg rounded-ui font-black text-sm shadow-lg shadow-ops-ok/20 transition-all active:scale-95"
            >
              <PlayCircle className="w-4 h-4" /> Abrir turno
            </button>
          )}
        </div>

        {turnoActivo && (
          <div className="mt-4 pt-4 border-t-2 border-ops-border grid grid-cols-3 gap-4">
            {[
              { label: 'Apertura', val: apertura },
              { label: 'Duración', val: tiempoTranscurrido() },
              {
                label: 'Fondo',
                val: `$${Number(fondo).toLocaleString('es-MX')}`,
              },
            ].map(({ label, val }) => (
              <div key={label}>
                <p className="text-[10px] font-black text-ops-muted uppercase tracking-widest">
                  {label}
                </p>
                <p className="font-black text-sm text-ops-ink mt-0.5">{val}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* MODAL APERTURA */}
      {modalApertura && (
        <div className="fixed inset-0 bg-ops-ink/60 dark:bg-ops-bg/80 backdrop-blur-sm flex items-center justify-center z-[200] p-4 animate-in fade-in">
          <div className="bg-white dark:bg-ops-panel rounded-ui-lg border-2 border-ops-border p-8 shadow-2xl w-full max-w-sm animate-in zoom-in-95">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="text-2xl font-black font-syne text-ops-ink">
                  Abrir Turno
                </h3>
                <p className="text-xs font-bold text-ops-muted mt-0.5">
                  {new Date().toLocaleDateString('es-MX', {
                    weekday: 'long',
                    day: 'numeric',
                    month: 'long',
                  })}
                </p>
              </div>
              <button
                onClick={() => setModalApertura(false)}
                className="p-2 text-ops-muted hover:text-ops-muted dark:hover:text-ops-ink rounded-ui hover:bg-ops-panel-2 dark:hover:bg-ops-border transition-all"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <label className="text-[10px] font-black text-ops-muted uppercase tracking-widest block mb-2">
                Fondo de caja inicial
              </label>
              <div className="flex items-center gap-3">
                <DollarSign className="w-5 h-5 text-ops-muted" />
                <input
                  type="number"
                  min="0"
                  value={fondoCaja}
                  onChange={(e) => setFondoCaja(e.target.value)}
                  autoFocus
                  placeholder="0.00"
                  className="flex-1 px-4 py-3 bg-ops-panel-2 dark:bg-ops-bg border-2 border-ops-field rounded-ui font-black text-xl text-ops-ink outline-none focus:border-ops-ok dark:focus:border-ops-ok transition-all"
                />
              </div>
              <div className="flex items-start gap-2 px-3 py-2.5 bg-ops-warn/10 border border-ops-warn/30 rounded-ui">
                <AlertTriangle className="w-4 h-4 text-ops-warn shrink-0 mt-0.5" />
                <p className="text-xs font-bold text-ops-warn">
                  El fondo quedará registrado en la auditoría del turno.
                </p>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setModalApertura(false)}
                className="flex-1 py-3.5 rounded-ui border-2 border-ops-border font-bold text-ops-muted hover:bg-ops-panel-2 dark:hover:bg-ops-border transition-all"
              >
                Cancelar
              </button>
              <button
                onClick={handleAbrirTurno}
                disabled={fondoCaja === ''}
                className="flex-1 py-3.5 rounded-ui bg-ops-ok font-black text-ops-ok-fg shadow-lg shadow-ops-ok/20 transition-all active:scale-95 flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <PlayCircle className="w-5 h-5" /> Abrir turno
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL CIERRE */}
      {modalCierre && (
        <div className="fixed inset-0 bg-ops-ink/60 dark:bg-ops-bg/80 backdrop-blur-sm flex items-center justify-center z-[200] p-4 animate-in fade-in">
          <div className="bg-white dark:bg-ops-panel rounded-ui-lg border-2 border-ops-border p-8 shadow-2xl w-full max-w-sm animate-in zoom-in-95">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 bg-ops-danger/15 rounded-ui flex items-center justify-center">
                <StopCircle className="w-6 h-6 text-ops-danger" />
              </div>
              <div>
                <h3 className="text-xl font-black font-syne text-ops-ink">
                  Cerrar Turno
                </h3>
                <p className="text-xs font-bold text-ops-muted">
                  Esta acción bloqueará las operaciones
                </p>
              </div>
            </div>

            <div className="bg-ops-panel-2 dark:bg-ops-bg rounded-ui p-4 mb-5 space-y-2">
              {[
                { label: 'Apertura', val: apertura },
                { label: 'Duración', val: tiempoTranscurrido() },
                {
                  label: 'Responsable',
                  val: user?.nombre || user?.username || '—',
                },
              ].map(({ label, val }) => (
                <div key={label} className="flex justify-between">
                  <span className="text-xs font-black text-ops-muted uppercase tracking-widest">
                    {label}
                  </span>
                  <span className="text-sm font-bold text-ops-ink">{val}</span>
                </div>
              ))}
            </div>

            <div className="flex items-start gap-2 px-3 py-2.5 bg-ops-danger/10 border border-ops-danger/30 rounded-ui mb-6">
              <AlertTriangle className="w-4 h-4 text-ops-danger shrink-0 mt-0.5" />
              <p className="text-xs font-bold text-ops-danger">
                Los meseros activos quedarán bloqueados hasta el siguiente
                turno.
              </p>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setModalCierre(false)}
                className="flex-1 py-3.5 rounded-ui border-2 border-ops-border font-bold text-ops-muted hover:bg-ops-panel-2 dark:hover:bg-ops-border transition-all"
              >
                Cancelar
              </button>
              <button
                onClick={handleCerrarTurno}
                className="flex-1 py-3.5 rounded-ui bg-ops-danger font-black text-ops-danger-fg shadow-lg shadow-ops-danger/20 transition-all active:scale-95 flex items-center justify-center gap-2"
              >
                <CheckCircle className="w-5 h-5" /> Confirmar cierre
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
