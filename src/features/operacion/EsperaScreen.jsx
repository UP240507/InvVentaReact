import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ShieldOff,
  LogOut,
  Clock,
  DoorOpen,
  DollarSign,
  Loader2,
} from 'lucide-react';
import { useSessionStore } from '../../store/useSessionStore';
import { useAppStore } from '../../store/useAppStore';
import { getCapacidades, tieneFlag } from '../../lib/Permisos';

// Quién puede ABRIR la caja desde /espera: flag 'abre_caja' (Proyecto L).
// Gestión hace bypass de TurnoRoute (no llega aquí), pero el flag la cubre por
// defensa. El resto del staff espera a que alguien con el flag abra el turno.
export default function EsperaScreen() {
  const { empleadoActivo, cerrarSesionEmpleado, getRutaInicial } =
    useSessionStore();
  const { turnos, abrirTurno, roles_permisos } = useAppStore();
  const navigate = useNavigate();

  const [fondo, setFondo] = useState('');
  const [abriendo, setAbriendo] = useState(false);

  const rol = empleadoActivo?.rol || empleadoActivo?.puesto || '';
  const puedeAbrirCaja = tieneFlag(
    getCapacidades(rol, roles_permisos),
    'abre_caja',
  );

  // En cuanto se abra el turno, redirigir automáticamente.
  useEffect(() => {
    const turnoAbierto = (turnos || []).some((t) => t.estado === 'abierto');
    if (turnoAbierto) {
      navigate(getRutaInicial(), { replace: true });
    }
  }, [turnos, navigate, getRutaInicial]);

  const handleAbrirCaja = async () => {
    if (abriendo) return;
    setAbriendo(true);
    try {
      // abrirTurno mete el turno optimista en RAM → el useEffect de arriba
      // detecta el turno 'abierto' y redirige a la ruta inicial del rol.
      await abrirTurno({
        usuario: empleadoActivo?.nombre || 'Empleado',
        fondoCaja: Number(fondo) || 0,
      });
    } finally {
      setAbriendo(false);
    }
  };

  const handleSalir = () => {
    cerrarSesionEmpleado();
    navigate('/checador', { replace: true });
  };

  return (
    <div className="min-h-screen bg-ops-panel-2 dark:bg-ops-bg flex flex-col items-center justify-center p-6 transition-colors duration-lenta relative">
      {/* Dot grid */}
      <div
        className="absolute inset-0 opacity-[0.03] dark:opacity-[0.05] pointer-events-none"
        style={{
          backgroundImage:
            'radial-gradient(circle at 2px 2px, currentColor 1px, transparent 0)',
          backgroundSize: '32px 32px',
        }}
      />

      <div className="relative z-10 max-w-md w-full text-center space-y-8">
        {/* Ícono animado */}
        <div className="flex justify-center">
          <div className="relative">
            <div className="w-32 h-32 bg-ops-warn/15 rounded-full flex items-center justify-center border-2 border-ops-warn/30">
              <ShieldOff className="w-16 h-16 text-ops-warn" />
            </div>
            {/* Pulso */}
            <div className="absolute inset-0 rounded-full border-2 border-ops-warn/30 animate-ping opacity-30" />
          </div>
        </div>

        {/* Saludo */}
        <div className="space-y-2">
          <p className="text-[10px] font-black text-ops-muted uppercase tracking-widest">
            Bienvenido
          </p>
          <h1 className="text-4xl font-black font-syne text-ops-ink">
            {empleadoActivo?.nombre || 'Empleado'}
          </h1>
          <span className="inline-block text-[10px] font-black uppercase tracking-widest px-3 py-1.5 bg-ops-accent/15 text-ops-accent rounded-full">
            {empleadoActivo?.rol || 'Operativo'}
          </span>
        </div>

        {/* Card de estado: panel activo (puede abrir caja) o espera pasiva */}
        {puedeAbrirCaja ? (
          <div className="bg-white dark:bg-ops-panel rounded-ui-lg border-2 border-ops-ok/30 p-8 shadow-xl space-y-5">
            <div className="flex items-center justify-center gap-3">
              <DoorOpen className="w-5 h-5 text-ops-ok" />
              <p className="text-sm font-black text-ops-ok uppercase tracking-widest">
                Abrir turno de caja
              </p>
            </div>
            <p className="text-ops-muted font-bold text-sm leading-relaxed">
              No hay una caja abierta. Ingresa el fondo inicial y abre el turno
              para empezar a operar.
            </p>

            <div className="space-y-2 text-left">
              <label className="text-[10px] font-black text-ops-muted uppercase tracking-widest px-2">
                Fondo inicial en caja
              </label>
              <div className="relative">
                <DollarSign className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-ops-muted" />
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  inputMode="decimal"
                  value={fondo}
                  onChange={(e) => setFondo(e.target.value)}
                  placeholder="0.00"
                  className="w-full pl-12 pr-4 py-3.5 bg-ops-panel-2 dark:bg-ops-bg border-2 border-ops-field rounded-ui font-black text-ops-ink outline-none focus:border-ops-ok transition-colors"
                />
              </div>
            </div>

            <button
              onClick={handleAbrirCaja}
              disabled={abriendo}
              className="w-full bg-ops-ok disabled:opacity-60 disabled:cursor-not-allowed text-ops-ok-fg font-black py-4 rounded-ui active:scale-95 transition-all shadow-lg shadow-ops-ok/30 flex items-center justify-center gap-2"
            >
              {abriendo ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" /> Abriendo...
                </>
              ) : (
                <>
                  <DoorOpen className="w-5 h-5" /> Abrir caja
                </>
              )}
            </button>
          </div>
        ) : (
          <div className="bg-white dark:bg-ops-panel rounded-ui-lg border-2 border-ops-warn/30 p-8 shadow-xl space-y-4">
            <div className="flex items-center justify-center gap-3">
              <div className="w-3 h-3 rounded-full bg-ops-warn animate-pulse" />
              <p className="text-sm font-black text-ops-warn uppercase tracking-widest">
                Turno de caja cerrado
              </p>
            </div>
            <p className="text-ops-muted font-bold text-base leading-relaxed">
              El turno de caja aún no ha sido abierto. Tus pantallas se
              habilitarán automáticamente en cuanto el cajero o el gerente lo
              abra.
            </p>
            <div className="flex items-center justify-center gap-2 text-ops-muted">
              <Clock className="w-4 h-4" />
              <span className="text-xs font-bold">
                Esperando apertura de caja...
              </span>
            </div>
          </div>
        )}

        {/* Reloj actual */}
        <p className="text-5xl font-black font-syne text-ops-muted dark:text-ops-border tabular-nums">
          {new Date().toLocaleTimeString('es-MX', {
            hour: '2-digit',
            minute: '2-digit',
          })}
        </p>

        {/* Botón salir */}
        <button
          onClick={handleSalir}
          className="flex items-center gap-2 mx-auto px-6 py-3 rounded-ui border-2 border-ops-border text-ops-muted font-bold hover:border-ops-danger/30 dark:hover:border-ops-danger hover:text-ops-danger dark:hover:text-ops-danger transition-all active:scale-95"
        >
          <LogOut className="w-4 h-4" />
          No soy yo — volver al checador
        </button>
      </div>
    </div>
  );
}
