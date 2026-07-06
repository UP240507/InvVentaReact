import { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { Award } from 'lucide-react';

export default function WidgetTopPlatillos({ ventasFiltradas }) {
  const rankingProductos = useMemo(() => {
    const conteo = {};
    if (!ventasFiltradas) return [];

    ventasFiltradas.forEach(venta => {
      // Asumimos que cada venta guarda sus platillos en un array 'items' o 'productos'
      const items = venta.items || venta.productos || [];
      items.forEach(item => {
        const nombre = item.nombre || 'Desconocido';
        conteo[nombre] = (conteo[nombre] || 0) + (Number(item.cantidad) || 1);
      });
    });

    return Object.keys(conteo)
      .map(nombre => ({ name: nombre, cantidad: conteo[nombre] }))
      .sort((a, b) => b.cantidad - a.cantidad)
      .slice(0, 5); // Solo el Top 5
  }, [ventasFiltradas]);

  const COLORS = ['#f97316', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6'];

  return (
    <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 flex flex-col h-64">
      <div className="flex items-center gap-2 mb-4">
        <Award className="w-5 h-5 text-orange-500" />
        <h3 className="text-lg font-black text-ui-text">Top 5 Platillos</h3>
      </div>
      
      <div className="w-full flex-1" style={{ height: '150px' }}>
        {rankingProductos.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={rankingProductos} layout="vertical" margin={{ top: 0, right: 20, left: 20, bottom: 0 }}>
              <XAxis type="number" hide />
              <YAxis 
                dataKey="name" 
                type="category" 
                axisLine={false} 
                tickLine={false} 
                tick={{ fontSize: 11, fill: '#64748b', fontWeight: 'bold' }} 
                width={100} 
              />
              <Tooltip 
                cursor={{ fill: '#f8fafc' }} 
                contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }} 
              />
              <Bar dataKey="cantidad" radius={[0, 8, 8, 0]} barSize={20}>
                {rankingProductos.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-slate-300">
            <p className="font-bold text-sm">Sin ventas registradas</p>
          </div>
        )}
      </div>
    </div>
  );
}