import { useMemo, useState } from 'react';
import { useAppStore, parseUTC } from '../../store/useAppStore';
import { calcularTotalesTurno } from '../../lib/Arqueo';
import { useSessionStore } from '../../store/useSessionStore';
import { useAuthStore } from '../../features/auth/useAuthStore';
import {
  X,
  AlertTriangle,
  DollarSign,
  CreditCard,
  Landmark,
  Coins,
  Receipt,
  CheckCircle2,
} from 'lucide-react';

export default function CierreTurnoModal({ onClose }) {
  const { mesas, ventas, turnos, configuracion, cerrarTurno, showToast } =
    useAppStore();
  const { empleadoActivo } = useSessionStore();
  const { user } = useAuthStore();

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [efectivoContado, setEfectivoContado] = useState('');

  // ✅ FIX: turnoActivo viene de useAppStore (fuente única de verdad)
  const turnoActivo =
    (turnos || []).find((t) => t.estado === 'abierto') || null;

  const mesasAbiertas = (mesas || []).filter((m) =>
    ['ocupada', 'por_cobrar'].includes(m.estado),
  );

  // D5: el desglose efectivo/tarjeta sale de cada venta (no del string metodo_pago).
  const metricas = useMemo(
    () => calcularTotalesTurno(ventas, turnoActivo, parseUTC),
    [ventas, turnoActivo],
  );

  const esperadoEnCaja =
    (turnoActivo?.fondo_inicial || 0) + (metricas?.efectivo || 0);
  const contado = parseFloat(efectivoContado) || 0;
  const diferencia = efectivoContado !== '' ? contado - esperadoEnCaja : 0;

  const handleConfirmarCierre = async () => {
    if (!turnoActivo) return;
    setIsSubmitting(true);

    // ✅ Mandamos TODOS los datos financieros a tu store.
    // Responsable en cascada: PIN → logueado → 'Sin identificar' (nunca genérico).
    await cerrarTurno({
      usuario: empleadoActivo?.nombre || user?.nombre || 'Sin identificar',
      ventasTotales: metricas?.totalVentas || 0,
      efectivo_esperado: esperadoEnCaja,
      efectivo_declarado: contado,
      diferencia: diferencia,
      // Sprint 4: desglose completo para que el corte quede en la BD.
      tarjeta_total: metricas?.tarjeta || 0,
      transferencia_total: metricas?.transferencia || 0,
      propinas_total: metricas?.propinas || 0,
    });

    showToast('Turno cerrado exitosamente', 'success');
    setIsSubmitting(false);
    onClose();
  };

  if (!turnoActivo) return null;

  return (
    <div className="fixed inset-0 z-[200] bg-adm-ink/60 dark:bg-adm-bg/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
      <div className="bg-white dark:bg-adm-panel rounded-ui-lg border border-adm-border shadow-2xl w-full max-w-2xl flex flex-col overflow-hidden animate-in zoom-in-95 transition-colors">
        <div className="px-8 py-6 border-b border-adm-border flex justify-between items-center bg-adm-bg">
          <div>
            <h2 className="text-2xl font-black font-syne text-adm-ink">
              Corte de Caja
            </h2>
            <p className="text-sm font-bold text-adm-muted uppercase tracking-widest mt-1">
              {configuracion?.nombre_empresa || 'Restaurante'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-adm-muted hover:bg-adm-chip dark:hover:bg-adm-border rounded-ui transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {mesasAbiertas.length > 0 && (
          <div className="px-8 py-4 bg-adm-warn/10 border-b border-adm-warn/20 flex items-start gap-4">
            <AlertTriangle className="w-6 h-6 text-adm-warn shrink-0 mt-0.5" />
            <div>
              <h3 className="font-black text-adm-warn">
                Aún hay {mesasAbiertas.length} mesas abiertas
              </h3>
              <p className="text-sm font-medium text-adm-warn">
                Cobra o cancela todas las mesas antes del corte para que los
                ingresos entren en este turno.
              </p>
            </div>
          </div>
        )}

        <div className="p-8 grid grid-cols-1 md:grid-cols-2 gap-8 bg-white dark:bg-adm-panel">
          {/* ARQUEO */}
          <div className="space-y-6">
            <h3 className="text-[10px] font-black uppercase tracking-widest text-adm-muted">
              Arqueo de Efectivo
            </h3>
            <div className="bg-adm-bg rounded-ui p-5 border border-adm-border space-y-4">
              <div className="space-y-2">
                {[
                  {
                    label: 'Fondo inicial',
                    val: `$${(turnoActivo.fondo_inicial || 0).toFixed(2)}`,
                    color: '',
                  },
                  {
                    label: 'Ingresos del turno',
                    val: `+ $${(metricas?.efectivo || 0).toFixed(2)}`,
                    color: 'text-adm-ok',
                  },
                ].map(({ label, val, color }) => (
                  <div
                    key={label}
                    className="flex justify-between items-center"
                  >
                    <span className="text-xs font-bold text-adm-muted">
                      {label}
                    </span>
                    <span
                      className={`font-mono font-bold ${color || 'text-adm-ink'}`}
                    >
                      {val}
                    </span>
                  </div>
                ))}
                <div className="pt-2 border-t border-adm-border flex justify-between items-center">
                  <span className="text-xs font-black text-adm-ink uppercase">
                    Sistema espera
                  </span>
                  <span className="text-lg font-black font-syne text-adm-ink">
                    ${esperadoEnCaja.toFixed(2)}
                  </span>
                </div>
              </div>

              <div className="pt-4 border-t border-adm-border">
                <label className="text-[10px] font-black text-adm-info uppercase tracking-widest mb-2 block">
                  ¿Cuánto efectivo hay en cajón?
                </label>
                <div className="relative">
                  <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-adm-muted" />
                  <input
                    type="number"
                    step="0.01"
                    value={efectivoContado}
                    onChange={(e) => setEfectivoContado(e.target.value)}
                    placeholder="0.00"
                    className="w-full pl-10 pr-4 py-3 bg-white dark:bg-adm-panel border-2 border-adm-info/30 focus:border-adm-info rounded-ui text-xl font-black font-syne text-adm-ink outline-none transition-colors"
                  />
                </div>
                {efectivoContado !== '' && (
                  <div
                    className={`mt-3 p-3 rounded-ui flex items-center justify-between border ${
                      diferencia === 0
                        ? 'bg-adm-ok/10 border-adm-ok/30 text-adm-ok'
                        : diferencia > 0
                          ? 'bg-adm-warn/10 border-adm-warn/30 text-adm-warn'
                          : 'bg-adm-danger/10 border-adm-danger/30 text-adm-danger'
                    }`}
                  >
                    <span className="text-xs font-black uppercase tracking-widest">
                      {diferencia === 0
                        ? 'Cuadre Perfecto'
                        : diferencia > 0
                          ? 'Sobrante'
                          : 'Faltante'}
                    </span>
                    <span className="font-black text-lg">
                      ${Math.abs(diferencia).toFixed(2)}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* MEDIOS DIGITALES */}
          <div className="space-y-4">
            <h3 className="text-[10px] font-black uppercase tracking-widest text-adm-muted">
              Medios Digitales
            </h3>
            {[
              {
                icon: CreditCard,
                label: 'Tarjeta',
                val: metricas?.tarjeta || 0,
              },
              {
                icon: Landmark,
                label: 'Transferencia',
                val: metricas?.transferencia || 0,
              },
            ].map(({ icon: Icon, label, val }) => (
              <div
                key={label}
                className="bg-adm-bg rounded-ui p-4 flex justify-between items-center border border-adm-border"
              >
                <span className="text-sm font-bold text-adm-muted dark:text-adm-ink flex items-center gap-2">
                  <Icon className="w-4 h-4 text-adm-muted" /> {label}
                </span>
                <span className="font-mono font-black text-adm-ink">
                  ${val.toFixed(2)}
                </span>
              </div>
            ))}
            <div className="bg-adm-danger/10 rounded-ui p-4 border border-adm-danger/20 flex justify-between items-center">
              <span className="text-sm font-bold text-adm-danger flex items-center gap-2">
                <Coins className="w-4 h-4" /> Propinas
              </span>
              <span className="font-mono font-black text-adm-danger">
                ${(metricas?.propinas || 0).toFixed(2)}
              </span>
            </div>
            <div className="pt-4 flex items-center justify-between border-t border-adm-border">
              <div className="flex items-center gap-2 text-adm-muted">
                <Receipt className="w-5 h-5" />
                <span className="text-sm font-bold">
                  {metricas?.ticketsCount || 0} Tickets
                </span>
              </div>
              <div className="text-right">
                <p className="text-[10px] font-black uppercase tracking-widest text-adm-muted">
                  Venta Total Neta
                </p>
                <p className="text-xl font-black text-adm-ink">
                  ${(metricas?.totalVentas || 0).toFixed(2)}
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="px-8 py-6 border-t border-adm-border bg-adm-bg flex gap-4">
          <button
            onClick={onClose}
            className="flex-1 py-4 rounded-ui font-bold text-adm-muted dark:text-adm-ink hover:bg-adm-chip dark:hover:bg-adm-border transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleConfirmarCierre}
            disabled={isSubmitting || efectivoContado === ''}
            className="flex-1 py-4 rounded-ui font-black text-adm-danger-fg bg-adm-danger shadow-lg shadow-adm-danger/30 transition-transform active:scale-95 flex items-center justify-center gap-2 disabled:opacity-50"
          >
            <CheckCircle2 className="w-5 h-5" />
            {isSubmitting ? 'Procesando...' : 'Confirmar Cierre'}
          </button>
        </div>
      </div>
    </div>
  );
}
