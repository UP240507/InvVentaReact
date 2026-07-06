import { useState, useMemo } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { 
  ShieldCheck, Search, AlertTriangle, Info, 
  Clock, User, Tag, Unlock, Trash2, ShieldAlert,
  Percent, FileWarning
} from 'lucide-react';

export default function AuditoriaScreen() {
  const { auditoria } = useAppStore();

  const [busqueda, setBusqueda] = useState('');
  const [filtroNivel, setFiltroNivel] = useState('todos');

  // Rango de fechas por defecto (Hoy)
  const hoy = new Date().toISOString().split('T')[0];
  const [fechaInicio, setFechaInicio] = useState(hoy);
  const [fechaFin, setFechaFin] = useState(hoy);

  // ─── MOTOR DE FILTRADO ──────────────────────────────────────────────────
  const logsFiltrados = useMemo(() => {
    const inicio = new Date(fechaInicio + 'T00:00:00');
    const fin = new Date(fechaFin + 'T23:59:59');

    return (auditoria || [])
      .filter(log => {
        const fechaLog = new Date(log.fecha);
        const entraEnFecha = fechaLog >= inicio && fechaLog <= fin;
        const entraEnNivel = filtroNivel === 'todos' || log.nivel === filtroNivel;
        
        const term = busqueda.toLowerCase();
        const entraEnBusqueda = 
          (log.usuario || '').toLowerCase().includes(term) ||
          (log.accion || '').toLowerCase().includes(term) ||
          (log.detalles || '').toLowerCase().includes(term);

        return entraEnFecha && entraEnNivel && entraEnBusqueda;
      })
      .sort((a, b) => new Date(b.fecha) - new Date(a.fecha)); // Siempre los más recientes arriba
  }, [auditoria, busqueda, filtroNivel, fechaInicio, fechaFin]);

  // KPIs de Seguridad
  const alertasCriticas = logsFiltrados.filter(l => l.nivel === 'critico').length;
  const advertencias = logsFiltrados.filter(l => l.nivel === 'warning').length;

  // ─── HELPERS VISUALES ───────────────────────────────────────────────────
  const getIconoAccion = (accion) => {
    const act = accion.toUpperCase();
    if (act.includes('CAJON') || act.includes('APERTURA')) return Unlock;
    if (act.includes('CANCELACION') || act.includes('ELIMINAR')) return Trash2;
    if (act.includes('DESCUENTO')) return Percent;
    if (act.includes('STOCK') || act.includes('MERMA')) return FileWarning;
    return Tag;
  };

  const getColorNivel = (nivel) => {
    switch (nivel) {
      case 'critico': return 'bg-rose-100 text-rose-700 border-rose-200';
      case 'warning': return 'bg-amber-100 text-amber-700 border-amber-200';
      default: return 'bg-slate-100 text-slate-600 border-slate-200';
    }
  };

  return (
    <div className="p-8 max-w-7xl mx-auto flex flex-col h-full animate-in fade-in duration-500">
      
      
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6 bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-xl shadow-slate-200/50 mb-8 relative overflow-hidden">
        <div className="absolute top-0 right-0 p-12 bg-slate-100 rounded-full -mr-12 -mt-12 opacity-50" />
        <div className="flex items-center gap-6 relative z-10">
          <div className="bg-slate-900 p-4 rounded-3xl shadow-lg shadow-slate-900/40">
            <ShieldCheck className="w-8 h-8 text-ui-text"/>
          </div>
          <div>
            <h1 className="text-3xl font-black text-slate-900 tracking-tight">Log de Auditoría</h1>
            <p className="text-slate-500 font-bold mt-1">Registro inmutable de seguridad y operaciones</p>
          </div>
        </div>

        <div className="flex items-center gap-4 relative z-10 w-full lg:w-auto">
           {alertasCriticas > 0 && (
              <div className="bg-rose-50 border border-rose-200 px-4 py-2 rounded-2xl flex items-center gap-2 animate-pulse">
                <ShieldAlert className="w-5 h-5 text-rose-600"/>
                <div>
                  <p className="text-[10px] font-black text-rose-500 uppercase tracking-widest">Alertas Críticas</p>
                  <p className="text-lg font-black text-rose-700 leading-none">{alertasCriticas}</p>
                </div>
              </div>
           )}
           <div className="flex items-center bg-slate-50 border-2 border-slate-100 p-2 rounded-2xl shadow-inner flex-1 lg:flex-none">
              <div className="px-3 border-r border-slate-200">
                 <input type="date" value={fechaInicio} onChange={e => setFechaInicio(e.target.value)} className="bg-transparent font-black text-slate-700 outline-none w-28 text-sm" />
              </div>
              <div className="px-3">
                 <input type="date" value={fechaFin} onChange={e => setFechaFin(e.target.value)} className="bg-transparent font-black text-slate-700 outline-none w-28 text-sm" />
              </div>
           </div>
        </div>
      </div>

      
      <div className="flex flex-col md:flex-row gap-4 mb-6">
        <div className="relative flex-1 group">
          <Search className="w-5 h-5 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2 group-focus-within:text-slate-900 transition-colors"/>
          <input type="text" placeholder="Buscar por usuario, acción o folio..." value={busqueda} onChange={e => setBusqueda(e.target.value)} 
            className="w-full pl-12 pr-4 py-3.5 bg-white border-2 border-slate-100 rounded-2xl text-ui-text font-bold outline-none focus:border-slate-900 shadow-sm transition-all" />
        </div>
        <div className="flex bg-slate-200/50 p-1.5 rounded-2xl border border-slate-200/50 shrink-0">
          {[
            { id: 'todos', label: 'Todos' },
            { id: 'critico', label: 'Críticos' },
            { id: 'warning', label: 'Advertencias' }
          ].map(f => (
            <button key={f.id} onClick={() => setFiltroNivel(f.id)} 
              className={`px-6 py-2 rounded-xl text-sm font-black transition-all ${filtroNivel === f.id ? 'bg-white text-slate-900 shadow-md scale-100' : 'text-slate-500 hover:text-ui-text hover:scale-95'}`}>
              {f.label}
            </button>
          ))}
        </div>
      </div>

      
      <div className="flex-1 overflow-hidden bg-white rounded-[2rem] border-2 border-slate-50 shadow-sm flex flex-col">
        <div className="overflow-y-auto custom-scrollbar flex-1">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50/80 sticky top-0 backdrop-blur-md border-b border-slate-100 z-10 text-xs uppercase tracking-widest text-slate-400">
              <tr>
                <th className="p-5 font-black">Fecha y Hora</th>
                <th className="p-5 font-black">Usuario</th>
                <th className="p-5 font-black">Acción</th>
                <th className="p-5 font-black">Módulo</th>
                <th className="p-5 font-black">Detalles</th>
                <th className="p-5 text-center font-black">Nivel</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {logsFiltrados.length === 0 ? (
                <tr>
                  <td colSpan="6" className="p-16 text-center">
                    <ShieldCheck className="w-16 h-16 text-slate-200 mx-auto mb-4"/>
                    <h3 className="text-xl font-black text-slate-400 uppercase tracking-widest">Sin registros</h3>
                    <p className="text-slate-400 font-bold mt-2">No se encontraron eventos con estos filtros.</p>
                  </td>
                </tr>
              ) : (
                logsFiltrados.map((log) => {
                  const Icono = getIconoAccion(log.accion);
                  const colorBadge = getColorNivel(log.nivel);

                  return (
                    <tr key={log.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="p-5">
                        <div className="flex items-center gap-2 text-slate-600 font-bold text-xs">
                          <Clock className="w-4 h-4 text-slate-400"/>
                          {new Date(log.fecha).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'medium' })}
                        </div>
                      </td>
                      <td className="p-5">
                        <div className="flex items-center gap-2 font-black text-ui-text">
                          <div className="w-6 h-6 rounded-full bg-slate-200 flex items-center justify-center text-[10px] text-slate-600">
                            <User className="w-3 h-3"/>
                          </div>
                          {log.usuario}
                        </div>
                      </td>
                      <td className="p-5">
                        <div className="flex items-center gap-2 font-bold text-slate-700">
                          <Icono className="w-4 h-4 text-slate-400"/>
                          {log.accion}
                        </div>
                      </td>
                      <td className="p-5 text-xs font-black text-slate-400 uppercase tracking-widest">
                        {log.modulo}
                      </td>
                      <td className="p-5 text-sm font-medium text-slate-600 w-1/3">
                        {log.detalles}
                      </td>
                      <td className="p-5 text-center">
                        <span className={`px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest border ${colorBadge}`}>
                          {log.nivel}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}