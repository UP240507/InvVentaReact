import { TrendingUp, Wallet, PieChart, Receipt } from 'lucide-react';

export default function WidgetKpis({ ventasFiltradas }) {
  const ventasHoy = ventasFiltradas.length;
  
  // Matemáticas blindadas
  const totalIngresos = ventasFiltradas.reduce((acc, v) => acc + (Number(v.granTotal) || 0), 0);
  const totalSubtotal = ventasFiltradas.reduce((acc, v) => acc + (Number(v.subtotal) || 0), 0);
  
  // Asumimos un Food Cost ideal del 30% para el cálculo de margen bruto rápido (puedes ajustarlo luego con datos reales de recetas)
  const costoEstimado = totalSubtotal * 0.30; 
  const margenBruto = totalSubtotal - costoEstimado;

  const ticketPromedio = ventasHoy > 0 ? (totalIngresos / ventasHoy) : 0;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
      {/* TARJETA 1: Ingresos Totales */}
      <div className="bg-brand-cesped rounded-3xl p-6 text-ui-text shadow-xl shadow-emerald-500/20 relative overflow-hidden flex flex-col justify-between">
        <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full blur-2xl -mr-10 -mt-10"></div>
        <div className="relative z-10 flex justify-between items-start mb-2">
          <p className="font-bold uppercase text-xs tracking-widest text-emerald-100">Ingresos Totales</p>
          <TrendingUp className="w-5 h-5 text-emerald-200" />
        </div>
        <h3 className="text-4xl font-black relative z-10">${totalIngresos.toLocaleString('es-MX', {minimumFractionDigits: 2})}</h3>
        <div className="mt-4 flex items-center gap-2 text-emerald-100 text-sm font-bold relative z-10 bg-emerald-600/50 py-1.5 px-3 rounded-lg w-max">
          <Receipt className="w-4 h-4" /> {ventasHoy} tickets cobrados
        </div>
      </div>

      {/* TARJETA 2: Margen Bruto */}
      <div className="bg-slate-900 rounded-3xl p-6 border border-slate-800 shadow-xl shadow-slate-900/10 flex flex-col justify-between relative overflow-hidden">
        <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-500/20 rounded-full blur-2xl -mr-10 -mt-10"></div>
        <div className="flex items-center gap-3 mb-3 relative z-10">
          <div className="bg-indigo-500/20 p-2.5 rounded-xl text-indigo-400"><PieChart className="w-5 h-5"/></div>
          <p className="font-bold uppercase text-xs tracking-widest text-slate-400">Margen Bruto (Est.)</p>
        </div>
        <h3 className="text-3xl font-black text-ui-text relative z-10">${margenBruto.toLocaleString('es-MX', {minimumFractionDigits: 2})}</h3>
      </div>

      {/* TARJETA 3: Ticket Promedio */}
      <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm flex flex-col justify-between">
        <div className="flex items-center gap-3 mb-3">
          <div className="bg-blue-100 p-2.5 rounded-xl text-blue-600"><Wallet className="w-5 h-5"/></div>
          <p className="font-bold uppercase text-xs tracking-widest text-slate-500">Ticket Promedio</p>
        </div>
        <h3 className="text-3xl font-black text-ui-text">${ticketPromedio.toLocaleString('es-MX', {minimumFractionDigits: 2})}</h3>
      </div>

      {/* TARJETA 4: Propinas / Tronco */}
      <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm flex flex-col justify-between">
        <div className="flex items-center gap-3 mb-3">
          <div className="bg-orange-100 p-2.5 rounded-xl text-orange-600"><TrendingUp className="w-5 h-5"/></div>
          <p className="font-bold uppercase text-xs tracking-widest text-slate-500">Propinas</p>
        </div>
        <h3 className="text-3xl font-black text-ui-text">
          ${ventasFiltradas.reduce((acc, v) => acc + (Number(v.propina) || 0), 0).toLocaleString('es-MX', {minimumFractionDigits: 2})}
        </h3>
      </div>
    </div>
  );
}