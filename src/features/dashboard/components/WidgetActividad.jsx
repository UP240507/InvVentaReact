import { ShieldAlert, UserCheck, Receipt } from 'lucide-react';

export default function WidgetActividad() {
  const eventosRecientes = [
    { id: 1, user: '@maria_caja', accion: 'Canceló ticket #042 ($150)', icon: Receipt, color: 'text-rose-500', bg: 'bg-rose-100' },
    { id: 2, user: '@admin', accion: 'Ajustó stock de "Carne Res"', icon: ShieldAlert, color: 'text-amber-500', bg: 'bg-amber-100' },
    { id: 3, user: '@juan_piso', accion: 'Inició turno', icon: UserCheck, color: 'text-emerald-500', bg: 'bg-emerald-100' },
  ];

  return (
    <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 flex flex-col h-72">
      <div className="flex items-center gap-2 mb-4">
        <ShieldAlert className="w-5 h-5 text-slate-700" />
        <h3 className="text-lg font-black text-ui-text">Actividad Reciente</h3>
      </div>

      <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar space-y-4 mt-2">
        {eventosRecientes.map(evento => (
          <div key={evento.id} className="flex gap-3 items-start">
            <div className={`${evento.bg} ${evento.color} p-2 rounded-xl mt-1`}>
              <evento.icon className="w-4 h-4" />
            </div>
            <div>
              <p className="text-sm font-bold text-ui-text leading-tight">{evento.accion}</p>
              <p className="text-xs font-bold text-slate-400">{evento.user} • Hace unos minutos</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}