import { Timer, ChefHat, Coffee } from 'lucide-react';

export default function WidgetCuellos() {
  return (
    <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 flex flex-col h-64">
      <div className="flex items-center gap-2 mb-4">
        <Timer className="w-5 h-5 text-rose-500" />
        <h3 className="text-lg font-black text-ui-text">Tiempos de Cocina</h3>
      </div>
      
      <div className="flex-1 flex flex-col gap-3 justify-center">
        {/* Simulación de Cocina Caliente */}
        <div className="p-3 bg-rose-50 border border-rose-100 rounded-2xl flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-rose-200 p-2 rounded-xl text-rose-700"><ChefHat className="w-5 h-5" /></div>
            <div>
              <p className="font-bold text-ui-text text-sm">Cocina Caliente</p>
              <p className="text-xs font-bold text-rose-500">3 órdenes retrasadas (15m)</p>
            </div>
          </div>
          <span className="font-black text-rose-600 text-lg">⚠️</span>
        </div>

        {/* Simulación de Barra de Bebidas */}
        <div className="p-3 bg-emerald-50 border border-emerald-100 rounded-2xl flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-emerald-200 p-2 rounded-xl text-emerald-700"><Coffee className="w-5 h-5" /></div>
            <div>
              <p className="font-bold text-ui-text text-sm">Barra / Bebidas</p>
              <p className="text-xs font-bold text-emerald-600">Flujo óptimo</p>
            </div>
          </div>
          <span className="font-black text-emerald-600 text-sm">3 min prom.</span>
        </div>
      </div>
    </div>
  );
}