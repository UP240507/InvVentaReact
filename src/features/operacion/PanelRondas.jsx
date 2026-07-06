import { useState, useMemo, useEffect } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { useSyncStore } from '../../store/useSyncStore';
import { useAuthStore } from '../auth/useAuthStore';
import {
  Clock,
  CheckCircle2,
  ChefHat,
  Coffee,
  UtensilsCrossed,
  Hand,
  Ban,
  X,
  AlertTriangle,
} from 'lucide-react';

// ── Helpers de estado (compat con el modelo de item del KDS) ────────────────
const itemEstaListo = (it) => it?.estado === 'listo' || it?.completado === true;
const itemDestino = (it) => it?.destino || 'Cocina';

// Estado derivado de una comanda a partir de sus items + su estado guardado.
//  - 'entregada' / 'cancelada' vienen del campo estado (acciones del mesero).
//  - 'lista'      → todos los items listos en KDS (cocina + barra), aún sin entregar.
//  - 'preparando' → al menos un item pendiente.
const estadoComanda = (c) => {
  if (c.estado === 'entregada') return 'entregada';
  if (c.estado === 'cancelada') return 'cancelada';
  const items = c.items || [];
  if (items.length > 0 && items.every(itemEstaListo)) return 'lista';
  return 'preparando';
};

const iconoEstacion = (nombre) => {
  const n = (nombre || '').toLowerCase();
  if (n.includes('barra') || n.includes('bar')) return Coffee;
  return UtensilsCrossed;
};

// Cronómetro por ronda (minutos desde que entró a producción).
const RondaTimer = ({ desde }) => {
  const [min, setMin] = useState(0);
  useEffect(() => {
    const calc = () =>
      setMin(
        Math.floor(
          (Date.now() - new Date(desde || Date.now()).getTime()) / 60000,
        ),
      );
    calc();
    const i = setInterval(calc, 10000);
    return () => clearInterval(i);
  }, [desde]);
  let cls = 'text-emerald-600 dark:text-brand-cesped';
  if (min >= 15) cls = 'text-rose-600 dark:text-brand-arrecife';
  else if (min >= 10) cls = 'text-amber-600 dark:text-brand-ambar';
  return (
    <span
      className={`flex items-center gap-1 text-[10px] font-black uppercase tracking-widest ${cls}`}
    >
      <Clock className="w-3 h-3" /> {min} min
    </span>
  );
};

/**
 * Panel de rondas de servicio de una mesa.
 * Lee comandas_activas (camino A) y las filtra por mesa_id.
 * Permite: entregar (solo si lista) y cancelar (motivo obligatorio).
 */
export default function PanelRondas({ mesaId }) {
  const { comandas_activas, showToast } = useAppStore();
  const { enqueueAction } = useSyncStore();
  const { user } = useAuthStore();

  const [modalCancelar, setModalCancelar] = useState({
    show: false,
    comanda: null,
  });
  const [motivo, setMotivo] = useState('');

  // Rondas activas de ESTA mesa (excluye completadas/canceladas; defensivo
  // ante el realtime que no expulsa terminadas de comandas_activas).
  const rondas = useMemo(() => {
    return (comandas_activas || [])
      .filter((c) => String(c.mesa_id) === String(mesaId))
      .filter((c) => !['completada', 'cancelada'].includes(c.estado))
      .sort(
        (a, b) => new Date(a.fecha_hora || 0) - new Date(b.fecha_hora || 0),
      );
  }, [comandas_activas, mesaId]);

  const entregarRonda = (comanda) => {
    const est = estadoComanda(comanda);
    if (est !== 'lista') {
      showToast('Aún hay platillos en preparación en esta ronda', 'error');
      return;
    }
    const actualizada = {
      ...comanda,
      estado: 'entregada',
      entregada_en: new Date().toISOString(),
    };
    enqueueAction('comandas', 'upsert', actualizada);
    useAppStore.setState((prev) => ({
      comandas_activas: prev.comandas_activas.map((c) =>
        String(c.id) === String(comanda.id) ? actualizada : c,
      ),
    }));
    showToast('Ronda entregada', 'success');
  };

  const abrirCancelar = (comanda) => {
    setModalCancelar({ show: true, comanda });
    setMotivo('');
  };

  const confirmarCancelar = () => {
    if (!motivo.trim()) {
      showToast('El motivo de cancelación es obligatorio', 'error');
      return;
    }
    const comanda = modalCancelar.comanda;
    const actualizada = {
      ...comanda,
      estado: 'cancelada',
      motivo_cancelacion: motivo.trim(),
    };
    enqueueAction('comandas', 'upsert', actualizada);
    useAppStore.setState((prev) => ({
      comandas_activas: prev.comandas_activas.map((c) =>
        String(c.id) === String(comanda.id) ? actualizada : c,
      ),
    }));
    // Auditoría: la cancelación es un evento sensible (puede cobrarse).
    useAppStore.getState().registrarAuditoria?.({
      usuario: user?.nombre || 'Sistema',
      accion: 'CANCELACION_COMANDA',
      modulo: 'POS',
      nivel: 'warning',
      detalles: `Ronda ${comanda.folio || comanda.id} cancelada. Motivo: ${motivo.trim()}`,
    });
    showToast('Ronda cancelada', 'success');
    setModalCancelar({ show: false, comanda: null });
    setMotivo('');
  };

  if (rondas.length === 0) {
    return (
      <div className="px-5 py-4 text-center">
        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-ui-muted">
          Sin rondas en producción
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3 px-5 py-4">
      <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-ui-muted flex items-center gap-2">
        <ChefHat className="w-3.5 h-3.5" /> Rondas en producción (
        {rondas.length})
      </p>

      {rondas.map((comanda) => {
        const est = estadoComanda(comanda);
        const items = comanda.items || [];
        const esLista = est === 'lista';
        const esEntregada = est === 'entregada';

        const badge = esEntregada
          ? 'bg-slate-100 text-slate-500 dark:bg-ui-obsidiana dark:text-ui-muted border-slate-200 dark:border-ui-border'
          : esLista
            ? 'bg-emerald-50 text-emerald-600 border-emerald-200 dark:bg-brand-cesped/10 dark:text-brand-cesped dark:border-brand-cesped/30'
            : 'bg-amber-50 text-amber-600 border-amber-200 dark:bg-brand-ambar/10 dark:text-brand-ambar dark:border-brand-ambar/30';

        const etiqueta = esEntregada
          ? 'Entregada'
          : esLista
            ? 'Lista para entregar'
            : 'En preparación';

        return (
          <div
            key={comanda.id}
            className={`border-2 rounded-2xl overflow-hidden ${esEntregada ? 'border-slate-200 dark:border-ui-border opacity-70' : 'border-slate-200 dark:border-ui-border'}`}
          >
            <div className="flex items-center justify-between px-4 py-2.5 bg-slate-50/60 dark:bg-ui-obsidiana/40">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-black text-slate-600 dark:text-brand-nacar uppercase tracking-widest">
                  {comanda.folio || String(comanda.id).slice(-5)}
                </span>
                <span
                  className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md border ${badge}`}
                >
                  {etiqueta}
                </span>
              </div>
              {!esEntregada && <RondaTimer desde={comanda.fecha_hora} />}
            </div>

            <div className="px-4 py-2.5 space-y-1.5">
              {items.map((it, idx) => {
                const Icon = iconoEstacion(itemDestino(it));
                const listo = itemEstaListo(it);
                return (
                  <div
                    key={it.id || idx}
                    className="flex items-center justify-between text-sm"
                  >
                    <span
                      className={`font-bold ${listo ? 'text-emerald-600 dark:text-brand-cesped' : 'text-slate-700 dark:text-brand-nacar'}`}
                    >
                      <span className="text-indigo-500 dark:text-brand-amatista font-black mr-1.5">
                        {it.cantidad}x
                      </span>
                      {it.nombre}
                    </span>
                    <span className="flex items-center gap-1.5 shrink-0">
                      <Icon className="w-3 h-3 text-slate-400 dark:text-ui-muted" />
                      {listo ? (
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 dark:text-brand-cesped" />
                      ) : (
                        <Clock className="w-3.5 h-3.5 text-amber-500 dark:text-brand-ambar" />
                      )}
                    </span>
                  </div>
                );
              })}
            </div>

            {!esEntregada && (
              <div className="flex gap-2 px-4 py-3 border-t-2 border-slate-100 dark:border-ui-border">
                <button
                  onClick={() => entregarRonda(comanda)}
                  disabled={!esLista}
                  className={`flex-1 py-2.5 rounded-xl font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2 transition-all active:scale-95 ${
                    esLista
                      ? 'bg-emerald-500 dark:bg-brand-cesped text-white dark:text-ui-obsidiana hover:bg-emerald-600 shadow-md'
                      : 'bg-slate-100 dark:bg-ui-obsidiana text-slate-400 dark:text-ui-muted cursor-not-allowed'
                  }`}
                >
                  <Hand className="w-4 h-4" /> Entregar
                </button>
                <button
                  onClick={() => abrirCancelar(comanda)}
                  className="px-4 py-2.5 rounded-xl font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2 bg-rose-50 dark:bg-brand-arrecife/10 text-rose-600 dark:text-brand-arrecife border-2 border-rose-200 dark:border-brand-arrecife/20 hover:bg-rose-100 dark:hover:bg-brand-arrecife/20 transition-all active:scale-95"
                >
                  <Ban className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        );
      })}

      {/* MODAL CANCELACIÓN (motivo obligatorio) */}
      {modalCancelar.show && (
        <div className="fixed inset-0 bg-slate-900/60 dark:bg-ui-obsidiana/80 backdrop-blur-md z-[120] flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white dark:bg-ui-humo rounded-[2rem] border-2 border-slate-100 dark:border-ui-border p-6 max-w-md w-full shadow-2xl animate-in zoom-in-95">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-black font-syne text-slate-900 dark:text-brand-nacar flex items-center gap-2">
                <Ban className="w-5 h-5 text-rose-500 dark:text-brand-arrecife" />{' '}
                Cancelar ronda
              </h3>
              <button
                onClick={() => setModalCancelar({ show: false, comanda: null })}
                className="text-slate-400 dark:text-ui-muted hover:text-rose-500 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Warning: puede cobrarse el consumo */}
            <div className="flex items-start gap-3 px-4 py-3 bg-amber-50 dark:bg-brand-ambar/10 border-2 border-amber-200 dark:border-brand-ambar/30 rounded-2xl mb-5">
              <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-brand-ambar shrink-0 mt-0.5" />
              <p className="text-xs font-bold text-amber-700 dark:text-brand-ambar leading-snug">
                Si la cocina ya preparó estos platillos, el consumo{' '}
                <strong>puede cobrarse</strong> al cliente. Registra el motivo
                real.
              </p>
            </div>

            <label className="block text-[10px] font-black text-slate-500 dark:text-ui-muted uppercase tracking-widest mb-2">
              Motivo de cancelación *
            </label>
            <textarea
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              rows={3}
              autoFocus
              placeholder="Ej. Cliente se retiró, demora excesiva, error de captura..."
              className="w-full px-4 py-3 bg-slate-50 dark:bg-ui-obsidiana border-2 border-slate-200 dark:border-ui-border rounded-xl font-bold text-sm text-slate-800 dark:text-brand-nacar placeholder:text-slate-400 dark:placeholder:text-ui-muted/50 outline-none focus:border-rose-500 dark:focus:border-brand-arrecife resize-none transition-all"
            />

            <div className="flex gap-3 mt-5">
              <button
                onClick={() => setModalCancelar({ show: false, comanda: null })}
                className="flex-1 py-3.5 bg-slate-100 dark:bg-ui-obsidiana text-slate-500 dark:text-ui-muted font-bold rounded-xl border-2 border-transparent hover:border-slate-200 dark:hover:border-ui-border transition-colors"
              >
                Volver
              </button>
              <button
                onClick={confirmarCancelar}
                disabled={!motivo.trim()}
                className="flex-1 py-3.5 bg-rose-500 dark:bg-brand-arrecife hover:bg-rose-600 dark:hover:bg-orange-600 text-white dark:text-ui-obsidiana font-black rounded-xl shadow-lg transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Confirmar cancelación
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Helper exportado para el POS: ¿esta mesa tiene rondas sin entregar?
// Úsalo para el aviso antes de cobrar.
export const hayRondasSinEntregar = (comandas_activas, mesaId) =>
  (comandas_activas || []).some(
    (c) =>
      String(c.mesa_id) === String(mesaId) &&
      !['completada', 'cancelada', 'entregada'].includes(c.estado),
  );
