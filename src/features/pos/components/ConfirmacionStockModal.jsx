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
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-900/80 dark:bg-ui-obsidiana/90 backdrop-blur-md animate-in fade-in">
      <div className="bg-white dark:bg-ui-humo rounded-[2rem] border-2 border-slate-100 dark:border-ui-border w-full max-w-2xl shadow-2xl flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-300">
        {/* HEADER */}
        <div className="flex justify-between items-start p-8 pb-4 shrink-0">
          <div className="flex items-center gap-4">
            <div
              className={`p-4 rounded-2xl ${resuelto ? 'bg-emerald-50 text-emerald-500 dark:bg-brand-cesped/10 dark:text-brand-cesped' : 'bg-amber-50 text-amber-500 dark:bg-brand-ambar/10 dark:text-brand-ambar'}`}
            >
              <AlertTriangle className="w-7 h-7" />
            </div>
            <div>
              <h2 className="text-2xl font-black font-syne text-slate-900 dark:text-brand-nacar tracking-tight">
                Revisión de inventario
              </h2>
              <p className="text-sm font-bold text-slate-500 dark:text-ui-muted mt-1">
                {resuelto
                  ? 'Sustituciones aplicadas: ya hay stock suficiente.'
                  : 'Algunos insumos no alcanzan para esta venta.'}
              </p>
            </div>
          </div>
          <button
            onClick={onCancel}
            className="p-2 bg-slate-100 dark:bg-ui-obsidiana rounded-full text-slate-400 dark:text-ui-muted hover:text-brand-arrecife transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* LISTA DE PROBLEMAS */}
        <div className="flex-1 overflow-y-auto custom-scrollbar px-8 pb-4 space-y-4">
          {resuelto && (
            <div className="p-6 bg-emerald-50 dark:bg-brand-cesped/10 rounded-2xl text-center font-bold text-emerald-700 dark:text-brand-cesped">
              Todo listo. Puedes continuar al cobro.
            </div>
          )}
          {problemas.map((p) => {
            const agotado = p.severidad === 'agotado';
            const opciones = opcionesSustituto(p.requerido, p.productoId);
            return (
              <div
                key={p.productoId}
                className={`p-5 rounded-2xl border-2 ${agotado ? 'border-rose-200 bg-rose-50/50 dark:border-brand-arrecife/30 dark:bg-brand-arrecife/5' : 'border-amber-200 bg-amber-50/50 dark:border-brand-ambar/30 dark:bg-brand-ambar/5'}`}
              >
                <div className="flex items-center justify-between gap-4 mb-3">
                  <div className="flex items-center gap-3 min-w-0">
                    {agotado ? (
                      <PackageX className="w-5 h-5 text-rose-500 dark:text-brand-arrecife shrink-0" />
                    ) : (
                      <TrendingDown className="w-5 h-5 text-amber-500 dark:text-brand-ambar shrink-0" />
                    )}
                    <span className="font-black text-slate-800 dark:text-brand-nacar truncate">
                      {p.nombre}
                    </span>
                  </div>
                  <span
                    className={`text-[10px] font-black uppercase px-2.5 py-1 rounded-full shrink-0 ${agotado ? 'bg-rose-500 text-white dark:bg-brand-arrecife' : 'bg-amber-400 text-white dark:bg-brand-ambar'}`}
                  >
                    {agotado ? 'Agotado' : 'Bajo mínimo'}
                  </span>
                </div>
                <p className="text-xs font-bold text-slate-500 dark:text-ui-muted mb-3">
                  Requiere {p.requerido} {p.unidad || ''} · en stock {p.stock}{' '}
                  {p.unidad || ''} · quedaría{' '}
                  <span
                    className={
                      agotado ? 'text-rose-600 dark:text-brand-arrecife' : ''
                    }
                  >
                    {p.resultante}
                  </span>
                </p>
                <label className="flex items-center gap-2 text-xs font-black text-slate-600 dark:text-ui-text">
                  <ArrowRightLeft className="w-4 h-4" /> Sustituir por:
                  <select
                    value={subs[String(p.productoId)] ?? ''}
                    onChange={(e) => setSustituto(p.productoId, e.target.value)}
                    className="flex-1 bg-white dark:bg-ui-obsidiana border-2 border-slate-200 dark:border-ui-border rounded-xl px-3 py-2 font-bold text-slate-800 dark:text-brand-nacar outline-none focus:border-brand-arrecife"
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
                  <p className="text-[11px] font-bold text-slate-400 dark:text-ui-muted mt-2">
                    No hay otro producto con stock suficiente para sustituir.
                  </p>
                )}
              </div>
            );
          })}
        </div>

        {/* FOOTER */}
        <div className="flex flex-col sm:flex-row gap-3 p-8 pt-4 shrink-0 border-t border-slate-100 dark:border-ui-border">
          <button
            onClick={onCancel}
            className="flex-1 py-4 bg-slate-100 dark:bg-ui-obsidiana hover:bg-slate-200 dark:hover:bg-ui-border text-slate-600 dark:text-brand-nacar font-black rounded-2xl transition-all"
          >
            Cancelar venta
          </button>
          <button
            onClick={() => onConfirmar(subs)}
            className={`flex-1 py-4 font-black rounded-2xl shadow-lg transition-all active:scale-95 text-white dark:text-ui-obsidiana ${
              resuelto
                ? 'bg-emerald-500 dark:bg-brand-cesped hover:bg-emerald-600'
                : hayAgotados
                  ? 'bg-rose-500 dark:bg-brand-arrecife hover:bg-rose-600'
                  : 'bg-amber-500 dark:bg-brand-ambar hover:bg-amber-600'
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
