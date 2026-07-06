import { useState } from 'react';
import { useSessionStore } from '../../store/useSessionStore';
import { useAppStore } from '../../store/useAppStore';
import { useAuthStore } from '../../features/auth/useAuthStore';
import { Play, DollarSign, X, Wallet } from 'lucide-react';

export default function AbrirTurnoModal({ onClose }) {
  const { empleadoActivo } = useSessionStore();
  const { abrirTurno } = useAppStore();
  const { user } = useAuthStore();

  const [fondo, setFondo] = useState('');

  // Responsable del turno, en cascada:
  //   1) empleadoActivo (futuro: cajero identificado por PIN)
  //   2) user logueado (hoy: el admin que opera el dispositivo, ej. "Chris")
  //   3) 'Sin identificar' — nunca el genérico "Usuario".
  const responsable =
    empleadoActivo?.nombre || user?.nombre || 'Sin identificar';

  const handleConfirmarApertura = async () => {
    if (fondo === '') return;

    await abrirTurno({
      usuario: responsable,
      fondoCaja: parseFloat(fondo),
    });

    onClose();
  };

  return (
    <div className="fixed inset-0 z-[200] bg-slate-900/60 dark:bg-ui-obsidiana/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
      <div className="bg-white dark:bg-ui-humo rounded-[2rem] border border-slate-200 dark:border-ui-border shadow-2xl w-full max-w-md flex flex-col overflow-hidden animate-in zoom-in-95 transition-colors">
        <div className="px-8 py-6 border-b border-slate-200 dark:border-ui-border flex justify-between items-center bg-slate-50 dark:bg-ui-obsidiana/50">
          <div>
            <h2 className="text-2xl font-black font-syne text-slate-900 dark:text-brand-nacar">
              Abrir Turno
            </h2>
            <p className="text-sm font-bold text-slate-500 dark:text-ui-muted uppercase tracking-widest mt-1">
              Apertura de Caja
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:bg-slate-200 dark:hover:bg-ui-border rounded-xl transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="p-8 bg-white dark:bg-ui-humo space-y-6">
          <div className="flex items-center gap-4 p-4 bg-emerald-50 dark:bg-brand-cesped/10 rounded-2xl border border-emerald-200 dark:border-brand-cesped/30">
            <div className="w-12 h-12 bg-emerald-100 dark:bg-brand-cesped/20 rounded-full flex items-center justify-center shrink-0">
              <Wallet className="w-6 h-6 text-emerald-600 dark:text-brand-cesped" />
            </div>
            <div>
              <p className="text-sm font-black text-emerald-800 dark:text-brand-cesped uppercase tracking-widest">
                Responsable
              </p>
              <p className="font-bold text-slate-700 dark:text-brand-nacar">
                {responsable}
              </p>
            </div>
          </div>

          <div>
            <label className="text-[10px] font-black text-brand-amatista uppercase tracking-widest mb-2 block">
              Fondo inicial de caja (Efectivo para cambios)
            </label>
            <div className="relative">
              <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
              <input
                type="number"
                step="0.01"
                min="0"
                value={fondo}
                onChange={(e) => setFondo(e.target.value)}
                placeholder="0.00"
                autoFocus
                className="w-full pl-10 pr-4 py-4 bg-slate-50 dark:bg-ui-obsidiana border-2 border-slate-200 dark:border-ui-border focus:border-brand-cesped rounded-xl text-2xl font-black font-syne text-slate-900 dark:text-brand-nacar outline-none transition-colors"
              />
            </div>
          </div>
        </div>

        <div className="px-8 py-6 border-t border-slate-200 dark:border-ui-border bg-slate-50 dark:bg-ui-obsidiana/50 flex gap-4">
          <button
            onClick={onClose}
            className="flex-1 py-4 rounded-2xl font-bold text-slate-600 dark:text-brand-nacar hover:bg-slate-200 dark:hover:bg-ui-border transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleConfirmarApertura}
            disabled={fondo === ''}
            className="flex-1 py-4 rounded-2xl font-black text-white bg-emerald-500 hover:bg-emerald-600 dark:bg-brand-cesped dark:text-ui-obsidiana shadow-lg shadow-emerald-500/30 transition-transform active:scale-95 flex items-center justify-center gap-2 disabled:opacity-50"
          >
            <Play className="w-5 h-5 fill-current" /> Iniciar Turno
          </button>
        </div>
      </div>
    </div>
  );
}
