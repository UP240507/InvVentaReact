import { useMemo } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { TrendingUp } from 'lucide-react';

export default function WidgetTendencias({ ventasFiltradas }) {
  // Procesamos las ventas para agruparlas por día
  const datosGrafica = useMemo(() => {
    if (!ventasFiltradas || ventasFiltradas.length === 0) return [];

    const ventasPorDia = {};
    
    // Iteramos sobre las ventas filtradas
    ventasFiltradas.forEach(venta => {
      // Asumimos formato ISO (ej. "2026-04-30T14:30:00Z")
      const fechaObj = new Date(venta.fecha || venta.created_at);
      
      // Formateamos la fecha para que sirva de llave (ej. "30 Abr")
      const dia = fechaObj.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });
      
      if (!ventasPorDia[dia]) {
        ventasPorDia[dia] = 0;
      }
      ventasPorDia[dia] += (Number(venta.granTotal) || 0);
    });

    // Convertimos el objeto en un array para Recharts
    return Object.keys(ventasPorDia).map(dia => ({
      fecha: dia,
      total: ventasPorDia[dia]
    }));
  }, [ventasFiltradas]);

  return (
    <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 h-80 flex flex-col">
      <div className="flex justify-between items-center mb-6">
        <h3 className="text-lg font-black text-ui-text flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-indigo-500" /> 
          Tendencia de Ingresos
        </h3>
        <span className="text-xs font-bold text-slate-400 uppercase tracking-widest bg-slate-50 px-3 py-1 rounded-lg">
          Basado en filtro actual
        </span>
      </div>
      
      <div className="flex-1 min-h-[200px]">
        {datosGrafica.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={datosGrafica} margin={{ top: 5, right: 0, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="colorIngresos" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
              <XAxis 
                dataKey="fecha" 
                axisLine={false} 
                tickLine={false} 
                tick={{ fontSize: 12, fill: '#64748b', fontWeight: 'bold' }} 
                dy={10}
              />
              <YAxis 
                axisLine={false} 
                tickLine={false} 
                tickFormatter={(value) => `$${value}`}
                tick={{ fontSize: 12, fill: '#64748b', fontWeight: 'bold' }}
                dx={-10}
              />
              <Tooltip 
                formatter={(value) => [`$${value.toLocaleString()}`, 'Ingresos']}
                contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', fontWeight: 'bold' }}
              />
              <Area 
                type="monotone" 
                dataKey="total" 
                stroke="#6366f1" 
                strokeWidth={3}
                fillOpacity={1} 
                fill="url(#colorIngresos)" 
              />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-slate-400">
            <TrendingUp className="w-12 h-12 mb-2 opacity-20" />
            <p className="font-bold">No hay ventas en este periodo</p>
          </div>
        )}
      </div>
    </div>
  );
}