import { useMemo } from 'react';
import { useAppStore } from '../../../store/useAppStore';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, ShoppingCart, ArrowRight } from 'lucide-react';

export default function WidgetDesabasto() {
  const { productos: insumos } = useAppStore(); 
  const navigate = useNavigate();

  const insumosCriticos = useMemo(() => {
    const seguros = insumos || [];
    return seguros.filter(ins => (Number(ins.stock) || 0) <= (Number(ins.minimo) || 0))
                  .slice(0, 5); 
  }, [insumos]);

  return (
    <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 flex flex-col h-72">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-black text-ui-text flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 text-amber-500" /> 
          Alerta de Desabasto
        </h3>
        {insumosCriticos.length > 0 && (
          <span className="bg-red-100 text-red-600 text-xs font-black px-2 py-1 rounded-lg">
            {insumosCriticos.length} Urgentes
          </span>
        )}
      </div>

      <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar space-y-3">
        {insumosCriticos.length > 0 ? (
          insumosCriticos.map(ins => (
            <div key={ins.id} className="flex justify-between items-center p-3 bg-slate-50 rounded-2xl border border-slate-100">
              <div>
                <p className="font-bold text-ui-text text-sm leading-tight">{ins.nombre}</p>
                <p className="text-xs font-bold text-red-500">
                  Stock: {ins.stock} / Min: {ins.minimo} {ins.unidad}
                </p>
              </div>
              <button 
                onClick={() => navigate('/compras')}
                className="bg-white border border-slate-200 hover:border-indigo-500 hover:text-indigo-600 p-2 rounded-xl text-slate-400 transition-colors"
              >
                <ShoppingCart className="w-4 h-4" />
              </button>
            </div>
          ))
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-emerald-500">
            <div className="bg-emerald-100 p-3 rounded-full mb-2">
              <ShoppingCart className="w-6 h-6" />
            </div>
            <p className="font-bold text-sm">Inventario Saludable</p>
            <p className="text-xs text-emerald-600/70 font-medium">No hay insumos críticos.</p>
          </div>
        )}
      </div>

      {insumosCriticos.length > 0 && (
        <button 
          onClick={() => navigate('/compras')}
          className="mt-4 w-full py-3 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold rounded-xl text-sm flex items-center justify-center gap-2 transition-colors"
        >
          Crear Orden Múltiple <ArrowRight className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}