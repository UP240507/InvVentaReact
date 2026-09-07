import { useState } from 'react';
import { useSessionStore } from '../../store/useSessionStore';
import { useCierreConEscape } from '../../hooks/useCierreConEscape';
import { useAppStore } from '../../store/useAppStore';
import { useAuthStore } from '../../features/auth/useAuthStore';
import { Play, X, Wallet } from 'lucide-react';
import DesgloseEfectivo from './DesgloseEfectivo';
import { denominacionesDe, arqueoDeDesglose } from '../../lib/Arqueo';

export default function AbrirTurnoModal({ onClose }) {
  // Escape cierra este cuadro. Se pinta con un `div` suelto, así que no hereda
  // el cierre de los componentes base.
  useCierreConEscape(onClose);

  const { empleadoActivo } = useSessionStore();
  const { abrirTurno, configuracion } = useAppStore();
  const { user } = useAuthStore();

  // ── EL DESGLOSE SUSTITUYE AL CAMPO DEL TOTAL ────────────────────────────
  // Antes esto era un `fondo` que alguien tecleaba: una afirmación sin nada
  // detrás. Ahora el total se DERIVA de un conteo que queda guardado. La regla
  // del diseño es que el desglose sustituye al campo, no se pone al lado: con
  // los dos, la gente teclea el total e inventa el desglose.
  const [desglose, setDesglose] = useState({});

  // `{}` es «conté y no había nada»; no haber contado es otra cosa. Sin esto,
  // abrir el cuadro y pulsar sin tocar nada guardaría un conteo de cero que
  // nadie hizo — justo el dato inventado que esto viene a quitar.
  const [conto, setConto] = useState(false);

  const denominaciones = denominacionesDe(configuracion);
  const { contado } = arqueoDeDesglose(desglose);

  // Responsable del turno, en cascada:
  //   1) empleadoActivo (futuro: cajero identificado por PIN)
  //   2) user logueado (hoy: el admin que opera el dispositivo, ej. "Chris")
  //   3) 'Sin identificar' — nunca el genérico "Usuario".
  const responsable =
    empleadoActivo?.nombre || user?.nombre || 'Sin identificar';

  const handleConfirmarApertura = async () => {
    if (!conto) return;

    await abrirTurno({
      usuario: responsable,
      // `fondo_inicial` se queda y pasa a ser CALCULADO: lo leen el corte Z,
      // los reportes y el cálculo de la diferencia.
      fondoCaja: contado,
      fondoDesglose: desglose,
    });

    onClose();
  };

  return (
    <div className="fixed inset-0 z-[200] bg-adm-ink/60 dark:bg-adm-bg/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
      <div className="bg-white dark:bg-adm-panel rounded-ui-lg border border-adm-border shadow-2xl w-full max-w-md max-h-[90dvh] flex flex-col overflow-hidden animate-in zoom-in-95 transition-colors">
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

        {/* ── EL CUADRO TIENE QUE CABER EN LA PANTALLA ──────────────────
            Contar por denominaciones son doce renglones donde antes habia una
            casilla. Con `overflow-hidden` y sin altura maxima, el panel crecia
            por debajo del borde de la pantalla y lo que quedaba fuera se
            RECORTABA: el PIN y el boton de confirmar dejaban de existir, no de
            verse. El cuerpo es lo que rueda; la cabecera, la firma y los
            botones se quedan donde se pueden alcanzar. */}
        <div className="flex-1 min-h-0 overflow-y-auto p-8 bg-white dark:bg-adm-panel space-y-6">
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
            <label className="text-[10px] font-black text-adm-info uppercase tracking-widest mb-1 block">
              Fondo inicial de caja (Efectivo para cambios)
            </label>
            <p className="text-xs font-bold text-adm-muted mb-4">
              Cuenta lo que hay. Un fondo de $1,000 en un solo billete no puede
              dar cambio, y eso sólo se ve contando.
            </p>
            <DesgloseEfectivo
              denominaciones={denominaciones}
              valor={desglose}
              onChange={(d) => {
                setDesglose(d);
                setConto(true);
              }}
            />
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
            disabled={!conto}
            className="flex-1 py-4 rounded-ui font-black text-adm-ok-fg bg-adm-ok dark:text-adm-bg shadow-lg shadow-adm-ok/30 transition-transform active:scale-95 flex items-center justify-center gap-2 disabled:opacity-50"
          >
            <Play className="w-5 h-5 fill-current" /> Iniciar Turno
          </button>
        </div>
      </div>
    </div>
  );
}
