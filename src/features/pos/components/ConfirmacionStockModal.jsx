import { useState, useMemo } from 'react';
import {
  AlertTriangle,
  PackageX,
  TrendingDown,
  X,
  ArrowRightLeft,
} from 'lucide-react';
import { verificarStock } from '../../../lib/Inventario';

// Gate de inventario antes de cobrar: lista insumos agotados / bajo mínimo,
// permite sustituir por otro producto con stock, o continuar de todas formas
// (sobreventa notificada — decisión de negocio).
export default function ConfirmacionStockModal({
  carrito,
  productos,
  onConfirmar,
  onCancel,
}) {
  const [subs, setSubs] = useState({});

  const problemas = useMemo(
    () => verificarStock(carrito, productos, subs),
    [carrito, productos, subs],
  );

  const opcionesSustituto = (requerido, excluirId) =>
    (productos || [])
      .filter(
        (p) =>
          String(p.id) !== String(excluirId) &&
          (Number(p.stock) || 0) >= requerido,
      )
      .sort((a, b) => (Number(b.stock) || 0) - (Number(a.stock) || 0));

  const setSustituto = (origId, subId) =>
    setSubs((prev) => {
      const next = { ...prev };
      if (subId) next[String(origId)] = Number(subId);
      else delete next[String(origId)];
      return next;
    });

  const hayAgotados = problemas.some((p) => p.severidad === 'agotado');
  const resuelto = problemas.length === 0;

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-ops-ink/80 dark:bg-ops-bg/90 backdrop-blur-md animate-in fade-in">
      <div className="bg-white dark:bg-ops-panel rounded-ui-lg border-2 border-ops-border w-full max-w-2xl shadow-2xl flex flex-col max-h-[90dvh] animate-in zoom-in-95 duration-media">
        {/* HEADER */}
        <div className="flex justify-between items-start p-8 pb-4 shrink-0">
          <div className="flex items-center gap-4">
            <div
              className={`p-4 rounded-ui ${resuelto ? 'bg-ops-ok/10 text-ops-ok' : 'bg-ops-warn/10 text-ops-warn'}`}
            >
              <AlertTriangle className="w-7 h-7" />
            </div>
            <div>
              <h2 className="text-2xl font-black font-syne text-ops-ink tracking-tight">
                Revisión de inventario
              </h2>
              <p className="text-sm font-bold text-ops-muted mt-1">
                {resuelto
                  ? 'Sustituciones aplicadas: ya hay stock suficiente.'
                  : 'Algunos insumos no alcanzan para esta venta.'}
              </p>
            </div>
          </div>
          <button
            onClick={onCancel}
            className="p-2 bg-ops-panel-2 dark:bg-ops-bg rounded-full text-ops-muted hover:text-ops-danger transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* LISTA DE PROBLEMAS */}
        <div className="flex-1 overflow-y-auto custom-scrollbar px-8 pb-4 space-y-4">
          {resuelto && (
            <div className="p-6 bg-ops-ok/10 rounded-ui text-center font-bold text-ops-ok">
              Todo listo. Puedes continuar al cobro.
            </div>
          )}
          {problemas.map((p) => {
            const agotado = p.severidad === 'agotado';
            const opciones = opcionesSustituto(p.requerido, p.productoId);
            return (
              <div
                key={p.productoId}
                className={`p-5 rounded-ui border-2 ${agotado ? 'border-ops-danger/30 bg-ops-danger/50' : 'border-ops-warn/30 bg-ops-warn/50'}`}
              >
                <div className="flex items-center justify-between gap-4 mb-3">
                  <div className="flex items-center gap-3 min-w-0">
                    {agotado ? (
                      <PackageX className="w-5 h-5 text-ops-danger shrink-0" />
                    ) : (
                      <TrendingDown className="w-5 h-5 text-ops-warn shrink-0" />
                    )}
                    <span className="font-black text-ops-ink truncate">
                      {p.nombre}
                    </span>
                  </div>
                  <span
                    className={`text-[10px] font-black uppercase px-2.5 py-1 rounded-full shrink-0 ${agotado ? 'bg-ops-danger text-ops-danger-fg' : 'bg-ops-warn text-ops-danger-fg'}`}
                  >
                    {agotado ? 'Agotado' : 'Bajo mínimo'}
                  </span>
                </div>
                <p className="text-xs font-bold text-ops-muted mb-3">
                  Requiere {p.requerido} {p.unidad || ''} · en stock {p.stock}{' '}
                  {p.unidad || ''} · quedaría{' '}
                  <span className={agotado ? 'text-ops-danger' : ''}>
                    {p.resultante}
                  </span>
                </p>
                <label className="flex items-center gap-2 text-xs font-black text-ops-muted dark:text-ops-ink">
                  <ArrowRightLeft className="w-4 h-4" /> Sustituir por:
                  <select
                    value={subs[String(p.productoId)] ?? ''}
                    onChange={(e) => setSustituto(p.productoId, e.target.value)}
                    className="flex-1 bg-white dark:bg-ops-bg border-2 border-ops-field rounded-ui px-3 py-2 font-bold text-ops-ink outline-none focus:border-ops-danger"
                  >
                    <option value="">— mantener {p.nombre} —</option>
                    {opciones.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.nombre} ({o.stock} {o.unidad || ''})
                      </option>
                    ))}
                  </select>
                </label>
                {opciones.length === 0 && (
                  <p className="text-[11px] font-bold text-ops-muted mt-2">
                    No hay otro producto con stock suficiente para sustituir.
                  </p>
                )}
              </div>
            );
          })}
        </div>

        {/* FOOTER */}
        <div className="flex flex-col sm:flex-row gap-3 p-8 pt-4 shrink-0 border-t border-ops-border">
          <button
            onClick={onCancel}
            className="flex-1 py-4 bg-ops-panel-2 dark:bg-ops-bg hover:bg-ops-panel-2 dark:hover:bg-ops-border text-ops-muted dark:text-ops-ink font-black rounded-ui transition-all"
          >
            Cancelar venta
          </button>
          <button
            onClick={() => onConfirmar(subs)}
            className={`flex-1 py-4 font-black rounded-ui shadow-lg transition-all active:scale-95 ${
              resuelto
                ? 'bg-ops-ok text-ops-ok-fg'
                : hayAgotados
                  ? 'bg-ops-danger text-ops-danger-fg'
                  : 'bg-ops-warn text-ops-danger-fg'
            }`}
          >
            {resuelto
              ? 'Continuar al cobro'
              : hayAgotados
                ? 'Vender de todas formas'
                : 'Continuar de todas formas'}
          </button>
        </div>
      </div>
    </div>
  );
}
