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
    <div className="fixed inset-0 z-[200] bg-adm-ink/60 dark:bg-adm-bg/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
      <div className="bg-white dark:bg-adm-panel rounded-ui-lg border border-adm-border shadow-2xl w-full max-w-md flex flex-col overflow-hidden animate-in zoom-in-95 transition-colors">
        <div className="px-8 py-6 border-b border-adm-border flex justify-between items-center bg-adm-bg">
          <div>
            <h2 className="text-2xl font-black font-syne text-adm-ink">
              Abrir Turno
            </h2>
            <p className="text-sm font-bold text-adm-muted uppercase tracking-widest mt-1">
              Apertura de Caja
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-adm-muted hover:bg-adm-chip dark:hover:bg-adm-border rounded-ui transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="p-8 bg-white dark:bg-adm-panel space-y-6">
          <div className="flex items-center gap-4 p-4 bg-adm-ok/10 rounded-ui border border-adm-ok/30">
            <div className="w-12 h-12 bg-adm-ok/15 rounded-full flex items-center justify-center shrink-0">
              <Wallet className="w-6 h-6 text-adm-ok" />
            </div>
            <div>
              <p className="text-sm font-black text-adm-ok uppercase tracking-widest">
                Responsable
              </p>
              <p className="font-bold text-adm-ink">{responsable}</p>
            </div>
          </div>

          <div>
            <label className="text-[10px] font-black text-adm-info uppercase tracking-widest mb-2 block">
              Fondo inicial de caja (Efectivo para cambios)
            </label>
            <div className="relative">
              <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-adm-muted" />
              <input
                type="number"
                step="0.01"
                min="0"
                value={fondo}
                onChange={(e) => setFondo(e.target.value)}
                placeholder="0.00"
                autoFocus
                className="w-full pl-10 pr-4 py-4 bg-adm-bg border-2 border-adm-field focus:border-adm-ok rounded-ui text-2xl font-black font-syne text-adm-ink outline-none transition-colors"
              />
            </div>
          </div>
        </div>

        <div className="px-8 py-6 border-t border-adm-border bg-adm-bg flex gap-4">
          <button
            onClick={onClose}
            className="flex-1 py-4 rounded-ui font-bold text-adm-muted dark:text-adm-ink hover:bg-adm-chip dark:hover:bg-adm-border transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleConfirmarApertura}
            disabled={fondo === ''}
            className="flex-1 py-4 rounded-ui font-black text-adm-ok-fg bg-adm-ok dark:text-adm-bg shadow-lg shadow-adm-ok/30 transition-transform active:scale-95 flex items-center justify-center gap-2 disabled:opacity-50"
          >
            <Play className="w-5 h-5 fill-current" /> Iniciar Turno
          </button>
        </div>
      </div>
    </div>
  );
}
