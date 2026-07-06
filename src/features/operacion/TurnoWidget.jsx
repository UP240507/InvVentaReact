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
        className={`bg-white dark:bg-ui-humo rounded-[2rem] border-2 p-6 shadow-sm transition-all ${
          turnoActivo
            ? 'border-emerald-200 dark:border-brand-cesped/40'
            : 'border-rose-200 dark:border-brand-arrecife/40'
        }`}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <div
              className={`p-3 rounded-2xl border ${
                turnoActivo
                  ? 'bg-emerald-50 dark:bg-brand-cesped/10 border-emerald-200 dark:border-brand-cesped/30'
                  : 'bg-rose-50 dark:bg-brand-arrecife/10 border-rose-200 dark:border-brand-arrecife/30'
              }`}
            >
              <Clock
                className={`w-6 h-6 ${
                  turnoActivo
                    ? 'text-emerald-600 dark:text-brand-cesped'
                    : 'text-rose-500 dark:text-brand-arrecife'
                }`}
              />
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-ui-muted">
                Turno de caja
              </p>
              <div className="flex items-center gap-2 mt-0.5">
                <div
                  className={`w-2 h-2 rounded-full ${
                    turnoActivo
                      ? 'bg-emerald-500 dark:bg-brand-cesped animate-pulse'
                      : 'bg-rose-400 dark:bg-brand-arrecife'
                  }`}
                />
                <p
                  className={`font-black text-lg font-syne leading-none ${
                    turnoActivo
                      ? 'text-emerald-600 dark:text-brand-cesped'
                      : 'text-rose-500 dark:text-brand-arrecife'
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
              className="flex items-center gap-2 px-4 py-2.5 bg-rose-50 dark:bg-brand-arrecife/10 hover:bg-rose-100 dark:hover:bg-brand-arrecife/20 border-2 border-rose-200 dark:border-brand-arrecife/40 text-rose-600 dark:text-brand-arrecife rounded-xl font-black text-sm transition-all active:scale-95"
            >
              <StopCircle className="w-4 h-4" /> Cerrar turno
            </button>
          ) : (
            <button
              onClick={() => setModalApertura(true)}
              className="flex items-center gap-2 px-4 py-2.5 bg-emerald-500 dark:bg-brand-cesped hover:bg-emerald-600 text-white dark:text-ui-obsidiana rounded-xl font-black text-sm shadow-lg shadow-emerald-500/20 transition-all active:scale-95"
            >
              <PlayCircle className="w-4 h-4" /> Abrir turno
            </button>
          )}
        </div>

        {turnoActivo && (
          <div className="mt-4 pt-4 border-t-2 border-slate-100 dark:border-ui-border grid grid-cols-3 gap-4">
            {[
              { label: 'Apertura', val: apertura },
              { label: 'Duración', val: tiempoTranscurrido() },
              {
                label: 'Fondo',
                val: `$${Number(fondo).toLocaleString('es-MX')}`,
              },
            ].map(({ label, val }) => (
              <div key={label}>
                <p className="text-[10px] font-black text-slate-400 dark:text-ui-muted uppercase tracking-widest">
                  {label}
                </p>
                <p className="font-black text-sm text-slate-700 dark:text-brand-nacar mt-0.5">
                  {val}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* MODAL APERTURA */}
      {modalApertura && (
        <div className="fixed inset-0 bg-slate-900/60 dark:bg-ui-obsidiana/80 backdrop-blur-sm flex items-center justify-center z-[200] p-4 animate-in fade-in">
          <div className="bg-white dark:bg-ui-humo rounded-[2.5rem] border-2 border-slate-100 dark:border-ui-border p-8 shadow-2xl w-full max-w-sm animate-in zoom-in-95">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="text-2xl font-black font-syne text-slate-800 dark:text-brand-nacar">
                  Abrir Turno
                </h3>
                <p className="text-xs font-bold text-slate-400 dark:text-ui-muted mt-0.5">
                  {new Date().toLocaleDateString('es-MX', {
                    weekday: 'long',
                    day: 'numeric',
                    month: 'long',
                  })}
                </p>
              </div>
              <button
                onClick={() => setModalApertura(false)}
                className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-brand-nacar rounded-xl hover:bg-slate-100 dark:hover:bg-ui-border transition-all"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <label className="text-[10px] font-black text-slate-500 dark:text-ui-muted uppercase tracking-widest block mb-2">
                Fondo de caja inicial
              </label>
              <div className="flex items-center gap-3">
                <DollarSign className="w-5 h-5 text-slate-400 dark:text-ui-muted" />
                <input
                  type="number"
                  min="0"
                  value={fondoCaja}
                  onChange={(e) => setFondoCaja(e.target.value)}
                  autoFocus
                  placeholder="0.00"
                  className="flex-1 px-4 py-3 bg-slate-50 dark:bg-ui-obsidiana border-2 border-slate-200 dark:border-ui-border rounded-xl font-black text-xl text-slate-800 dark:text-brand-nacar outline-none focus:border-emerald-500 dark:focus:border-brand-cesped transition-all"
                />
              </div>
              <div className="flex items-start gap-2 px-3 py-2.5 bg-amber-50 dark:bg-brand-ambar/10 border border-amber-200 dark:border-brand-ambar/30 rounded-xl">
                <AlertTriangle className="w-4 h-4 text-amber-500 dark:text-brand-ambar shrink-0 mt-0.5" />
                <p className="text-xs font-bold text-amber-700 dark:text-brand-ambar">
                  El fondo quedará registrado en la auditoría del turno.
                </p>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setModalApertura(false)}
                className="flex-1 py-3.5 rounded-xl border-2 border-slate-200 dark:border-ui-border font-bold text-slate-500 dark:text-ui-muted hover:bg-slate-50 dark:hover:bg-ui-border transition-all"
              >
                Cancelar
              </button>
              <button
                onClick={handleAbrirTurno}
                disabled={fondoCaja === ''}
                className="flex-1 py-3.5 rounded-xl bg-emerald-500 dark:bg-brand-cesped hover:bg-emerald-600 font-black text-white dark:text-ui-obsidiana shadow-lg shadow-emerald-500/20 transition-all active:scale-95 flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <PlayCircle className="w-5 h-5" /> Abrir turno
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL CIERRE */}
      {modalCierre && (
        <div className="fixed inset-0 bg-slate-900/60 dark:bg-ui-obsidiana/80 backdrop-blur-sm flex items-center justify-center z-[200] p-4 animate-in fade-in">
          <div className="bg-white dark:bg-ui-humo rounded-[2.5rem] border-2 border-slate-100 dark:border-ui-border p-8 shadow-2xl w-full max-w-sm animate-in zoom-in-95">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 bg-rose-100 dark:bg-brand-arrecife/20 rounded-2xl flex items-center justify-center">
                <StopCircle className="w-6 h-6 text-rose-500 dark:text-brand-arrecife" />
              </div>
              <div>
                <h3 className="text-xl font-black font-syne text-slate-800 dark:text-brand-nacar">
                  Cerrar Turno
                </h3>
                <p className="text-xs font-bold text-slate-400 dark:text-ui-muted">
                  Esta acción bloqueará las operaciones
                </p>
              </div>
            </div>

            <div className="bg-slate-50 dark:bg-ui-obsidiana rounded-2xl p-4 mb-5 space-y-2">
              {[
                { label: 'Apertura', val: apertura },
                { label: 'Duración', val: tiempoTranscurrido() },
                {
                  label: 'Responsable',
                  val: user?.nombre || user?.username || '—',
                },
              ].map(({ label, val }) => (
                <div key={label} className="flex justify-between">
                  <span className="text-xs font-black text-slate-500 dark:text-ui-muted uppercase tracking-widest">
                    {label}
                  </span>
                  <span className="text-sm font-bold text-slate-700 dark:text-brand-nacar">
                    {val}
                  </span>
                </div>
              ))}
            </div>

            <div className="flex items-start gap-2 px-3 py-2.5 bg-rose-50 dark:bg-brand-arrecife/10 border border-rose-200 dark:border-brand-arrecife/30 rounded-xl mb-6">
              <AlertTriangle className="w-4 h-4 text-rose-500 dark:text-brand-arrecife shrink-0 mt-0.5" />
              <p className="text-xs font-bold text-rose-600 dark:text-brand-arrecife">
                Los meseros activos quedarán bloqueados hasta el siguiente
                turno.
              </p>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setModalCierre(false)}
                className="flex-1 py-3.5 rounded-xl border-2 border-slate-200 dark:border-ui-border font-bold text-slate-500 dark:text-ui-muted hover:bg-slate-50 dark:hover:bg-ui-border transition-all"
              >
                Cancelar
              </button>
              <button
                onClick={handleCerrarTurno}
                className="flex-1 py-3.5 rounded-xl bg-rose-500 dark:bg-brand-arrecife hover:bg-rose-600 font-black text-white shadow-lg shadow-rose-500/20 transition-all active:scale-95 flex items-center justify-center gap-2"
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
