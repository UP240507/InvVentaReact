import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../../api/supabase';
import { useAppStore } from '../../store/useAppStore';
import { useSyncStore } from '../../store/useSyncStore';
import {
  useSessionStore,
  RUTA_INICIAL_POR_ROL,
} from '../../store/useSessionStore';
import { useAuthStore } from '../auth/useAuthStore'; // FIX 3: sesión raíz (tenant)

import {
  Clock,
  Delete,
  CheckCircle,
  AlertTriangle,
  LogIn,
  LogOut,
  ShieldOff,
  ChevronLeft,
} from 'lucide-react';

export default function RelojChecadorScreen() {
  const { staff, asistencias, turnos, configuracion } = useAppStore();
  const { enqueueAction } = useSyncStore();
  const { abrirSesionEmpleado, cerrarSesionEmpleado, empleadoActivo } =
    useSessionStore();
  const { user } = useAuthStore(); // FIX 3: tenant user

  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const [horaActual, setHoraActual] = useState(new Date());
  const [pin, setPin] = useState(searchParams.get('pin') || '');
  const [feedback, setFeedback] = useState(null);

  const autoLoginIntentado = useRef(false);

  const turnoAbierto =
    (turnos || []).find((t) => t.estado === 'abierto') || null;

  const mostrarFeedback = (tipo, mensaje, usuario = '', rol = '') => {
    setFeedback({ tipo, mensaje, usuario, rol });
    setTimeout(() => setFeedback(null), tipo === 'success' ? 2500 : 3000);
  };

  const handleSalir = () => {
    // FIX 3: bloquear navegación si la tablet no tiene sesión base iniciada
    if (!user) {
      navigate('/login');
      return;
    }

    if (empleadoActivo) {
      const ruta =
        RUTA_INICIAL_POR_ROL[
          empleadoActivo.rol || empleadoActivo.puesto || 'Mesero'
        ] || '/dashboard';
      navigate(ruta);
    } else {
      navigate('/dashboard');
    }
  };

  const registrarMovimiento = useCallback(
    async (tipoMovimiento, pinOverride) => {
      const pinUsado = pinOverride || pin;
      const pinIngresadoStr = String(pinUsado).trim();

      if (pinIngresadoStr.length < 4) {
        mostrarFeedback('error', 'El PIN debe tener 4 dígitos.');
        return;
      }

      if (!staff || staff.length === 0) {
        mostrarFeedback(
          'error',
          'Sincronizando empleados, intenta en 2 segundos...',
        );
        setPin('');
        return;
      }

      const empleado = staff.find((s) => {
        const p1 = String(s.pin).trim();
        const p2 = String(s.pin_acceso).trim();
        const tieneElPin =
          (p1 === pinIngresadoStr && p1 !== 'null' && p1 !== 'undefined') ||
          (p2 === pinIngresadoStr && p2 !== 'null' && p2 !== 'undefined');
        const estaActivo =
          s.activo !== false && s.activo !== 'false' && s.activo !== 0;
        return tieneElPin && estaActivo;
      });

      if (!empleado) {
        mostrarFeedback('error', 'PIN incorrecto o empleado inactivo.');
        setPin('');
        return;
      }

      // La fuente de verdad es la sesión VIVA del cliente Supabase, no el campo
      // del store (que puede desincronizarse y quedar null aunque el token sea
      // válido). getSession refresca el token si hace falta y refleja el estado real.
      // Sin sesión viva, el write a asistencias daría 401 (get_restaurante_id null).
      const {
        data: { session: sesionViva },
      } = await supabase.auth.getSession();
      if (!sesionViva) {
        mostrarFeedback(
          'error',
          'La terminal no tiene sesión activa. Pide al administrador iniciar sesión en este dispositivo.',
        );
        setPin('');
        return;
      }

      const hoyStr = new Date().toISOString().split('T')[0];

      const asistenciasHoy = (asistencias || []).filter(
        (a) =>
          String(a.empleado_id) === String(empleado.id) &&
          a.fecha_hora?.startsWith(hoyStr),
      );

      const asistenciasOrdenadas = [...asistenciasHoy].sort(
        (a, b) => new Date(b.fecha_hora) - new Date(a.fecha_hora),
      );

      const turnoActivoEmpleado =
        asistenciasOrdenadas[0]?.tipo === 'entrada'
          ? asistenciasOrdenadas[0]
          : null;

      // Última red para el tenant: empleado → configuración → sesión raíz.
      // asistencias quedó en RLS estricto (post-migración 022); un null se rechaza.
      const restauranteId =
        empleado.restaurante_id ||
        configuracion?.restaurante_id ||
        useAuthStore.getState().restauranteId;

      // ── ENTRADA ──────────────────────────────────────────────────────────────
      if (tipoMovimiento === 'Entrada') {
        if (turnoActivoEmpleado) {
          mostrarFeedback(
            'error',
            `Ya tienes entrada registrada a las ${new Date(
              turnoActivoEmpleado.fecha_hora,
            ).toLocaleTimeString('es-MX', {
              hour: '2-digit',
              minute: '2-digit',
            })}.`,
          );
          setPin('');
          return;
        }

        const rolSistema = empleado.rol || empleado.puesto || 'Mesero';
        const rolNecesitaTurno = ![
          'Administrador',
          'Admin',
          'Gerente',
        ].includes(rolSistema);

        if (rolNecesitaTurno && !turnoAbierto) {
          mostrarFeedback(
            'sin_turno',
            'El turno de caja aún no ha sido abierto.',
            empleado.nombre,
            rolSistema,
          );
          setPin('');
          return;
        }

        const nuevoRegistro = {
          id: Date.now(),
          empleado_id: String(empleado.id),
          empleado_nombre: empleado.nombre,
          tipo: 'entrada',
          fecha_hora: new Date().toISOString(),
          restaurante_id: restauranteId,
        };

        enqueueAction('asistencias', 'upsert', nuevoRegistro);
        useAppStore.setState((prev) => ({
          asistencias: [nuevoRegistro, ...(prev.asistencias || [])],
        }));

        abrirSesionEmpleado(empleado);

        mostrarFeedback(
          'success',
          '¡Entrada registrada! Buen turno.',
          empleado.nombre,
          rolSistema,
        );

        setTimeout(() => {
          // FIX 3: validar sesión de tenant antes de navegar a rutas protegidas
          if (!useAuthStore.getState().user) {
            navigate('/login', { replace: true });
          } else {
            const rolParaRuta = empleado.rol || empleado.puesto || 'Mesero';
            const ruta = RUTA_INICIAL_POR_ROL[rolParaRuta] || '/mesas';
            navigate(ruta, { replace: true });
          }
        }, 2000);

        // ── SALIDA ────────────────────────────────────────────────────────────────
      } else if (tipoMovimiento === 'Salida') {
        if (!turnoActivoEmpleado) {
          mostrarFeedback(
            'error',
            'No tienes entrada activa para registrar salida.',
          );
          setPin('');
          return;
        }

        const registroSalida = {
          id: Date.now(),
          empleado_id: String(empleado.id),
          empleado_nombre: empleado.nombre,
          tipo: 'salida',
          fecha_hora: new Date().toISOString(),
          restaurante_id: restauranteId,
        };

        enqueueAction('asistencias', 'upsert', registroSalida);

        useAppStore.setState((prev) => ({
          asistencias: [registroSalida, ...(prev.asistencias || [])],
        }));

        if (String(empleadoActivo?.id) === String(empleado.id)) {
          cerrarSesionEmpleado();
        }

        mostrarFeedback(
          'success',
          '¡Hasta pronto! Salida registrada.',
          empleado.nombre,
          empleado.rol || empleado.puesto,
        );
      }

      setPin('');
    },
    [
      pin,
      staff,
      asistencias,
      turnos,
      empleadoActivo,
      turnoAbierto,
      configuracion,
      enqueueAction,
      abrirSesionEmpleado,
      cerrarSesionEmpleado,
      navigate,
      user,
    ],
  );

  useEffect(() => {
    const t = setInterval(() => setHoraActual(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const pinUrl = searchParams.get('pin');
    if (
      pinUrl?.length === 4 &&
      staff?.length > 0 &&
      !autoLoginIntentado.current
    ) {
      autoLoginIntentado.current = true;
      const t = setTimeout(() => {
        registrarMovimiento('Entrada', pinUrl);
        setSearchParams({}, { replace: true });
      }, 500);
      return () => clearTimeout(t);
    }
  }, [searchParams, staff, registrarMovimiento, setSearchParams]);

  useEffect(() => {
    const onKey = (e) => {
      if (document.activeElement?.tagName === 'INPUT') return;
      if (e.key >= '0' && e.key <= '9') {
        setPin((prev) => (prev.length < 4 ? prev + e.key : prev));
      }
      if (e.key === 'Backspace') setPin((prev) => prev.slice(0, -1));
      if (e.key === 'Enter') registrarMovimiento('Entrada');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [registrarMovimiento]);

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-ui-obsidiana flex items-center justify-center p-6 transition-colors duration-500 relative overflow-hidden">
      <button
        onClick={handleSalir}
        className="absolute top-6 left-6 p-4 bg-white dark:bg-ui-humo border-2 border-slate-200 dark:border-ui-border rounded-2xl text-slate-500 dark:text-ui-muted hover:text-rose-500 dark:hover:text-brand-arrecife hover:border-rose-200 dark:hover:border-brand-arrecife/50 transition-all shadow-sm z-50 flex items-center gap-2 group"
      >
        <ChevronLeft className="w-6 h-6 group-hover:-translate-x-1 transition-transform" />
        <span className="text-xs font-black uppercase tracking-widest hidden sm:block">
          Salir de Terminal
        </span>
      </button>

      <div
        className="absolute inset-0 opacity-[0.03] dark:opacity-[0.05] pointer-events-none"
        style={{
          backgroundImage:
            'radial-gradient(circle at 2px 2px, currentColor 1px, transparent 0)',
          backgroundSize: '32px 32px',
        }}
      />

      <div className="max-w-5xl w-full grid grid-cols-1 lg:grid-cols-2 gap-10 items-center relative z-10">
        <div className="flex flex-col items-center lg:items-start text-center lg:text-left space-y-6 mt-12 lg:mt-0">
          <div className="bg-white dark:bg-ui-humo p-6 rounded-[2rem] border-2 border-slate-200 dark:border-ui-border shadow-xl inline-flex mb-4 transition-colors">
            <Clock className="w-12 h-12 text-indigo-600 dark:text-brand-amatista" />
          </div>
          <h1 className="text-7xl lg:text-8xl font-black font-syne text-slate-900 dark:text-brand-nacar tracking-tighter tabular-nums leading-none">
            {horaActual.toLocaleTimeString('es-MX', {
              hour: '2-digit',
              minute: '2-digit',
            })}
          </h1>
          <p className="text-lg font-bold text-slate-500 dark:text-ui-muted uppercase tracking-widest">
            {horaActual.toLocaleDateString('es-MX', {
              weekday: 'long',
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            })}
          </p>

          <div
            className={`px-5 py-3 rounded-2xl border-2 flex items-center gap-3 ${
              turnoAbierto
                ? 'bg-emerald-50 dark:bg-brand-cesped/10 border-emerald-200 dark:border-brand-cesped/40'
                : 'bg-rose-50 dark:bg-brand-arrecife/10 border-rose-200 dark:border-brand-arrecife/40'
            }`}
          >
            <div
              className={`w-2.5 h-2.5 rounded-full ${turnoAbierto ? 'bg-emerald-500 dark:bg-brand-cesped animate-pulse' : 'bg-rose-400 dark:bg-brand-arrecife'}`}
            />
            <div>
              <p
                className={`text-[10px] font-black uppercase tracking-widest ${turnoAbierto ? 'text-emerald-600 dark:text-brand-cesped' : 'text-rose-500 dark:text-brand-arrecife'}`}
              >
                Turno de caja
              </p>
              <p
                className={`text-sm font-bold ${turnoAbierto ? 'text-emerald-700 dark:text-brand-cesped' : 'text-rose-600 dark:text-brand-arrecife'}`}
              >
                {turnoAbierto
                  ? 'Abierto — operaciones habilitadas'
                  : 'Cerrado — solo Admin/Gerente'}
              </p>
            </div>
          </div>

          <div>
            <p className="text-sm font-black text-brand-arrecife uppercase tracking-widest">
              {configuracion?.nombre_empresa || 'AZUL Restaurante'}
            </p>
            <p className="text-xs font-bold text-slate-400 dark:text-ui-muted">
              InvVenta · Control de Acceso
            </p>
          </div>
        </div>

        <div className="bg-white/80 dark:bg-ui-humo/90 backdrop-blur-xl rounded-[3rem] border-2 border-slate-200 dark:border-ui-border shadow-2xl p-8 md:p-12 relative overflow-hidden transition-colors">
          {feedback && (
            <div className="absolute inset-0 z-50 bg-white/95 dark:bg-ui-humo/95 backdrop-blur-md flex flex-col items-center justify-center p-8 text-center animate-in fade-in zoom-in duration-300">
              {feedback.tipo === 'success' && (
                <>
                  <div className="w-24 h-24 bg-emerald-100 dark:bg-brand-cesped/20 rounded-full flex items-center justify-center mb-5">
                    <CheckCircle className="w-12 h-12 text-emerald-500 dark:text-brand-cesped" />
                  </div>
                  <p className="text-[10px] font-black text-slate-400 dark:text-ui-muted uppercase tracking-widest mb-1">
                    Acceso Concedido
                  </p>
                  <h2 className="text-3xl font-black font-syne text-slate-800 dark:text-brand-nacar mb-1">
                    {feedback.usuario}
                  </h2>
                  <span className="text-[10px] font-black uppercase tracking-widest px-3 py-1.5 bg-indigo-100 dark:bg-brand-amatista/20 text-indigo-600 dark:text-brand-amatista rounded-full mb-3">
                    {feedback.rol}
                  </span>
                  <p className="text-emerald-600 dark:text-brand-cesped font-bold">
                    {feedback.mensaje}
                  </p>
                </>
              )}
              {feedback.tipo === 'error' && (
                <>
                  <div className="w-24 h-24 bg-rose-100 dark:bg-brand-arrecife/20 rounded-full flex items-center justify-center mb-5">
                    <AlertTriangle className="w-12 h-12 text-rose-500 dark:text-brand-arrecife" />
                  </div>
                  <h2 className="text-3xl font-black font-syne text-slate-800 dark:text-brand-nacar mb-3">
                    Acceso Denegado
                  </h2>
                  <p className="text-rose-600 dark:text-brand-arrecife font-bold">
                    {feedback.mensaje}
                  </p>
                </>
              )}
              {feedback.tipo === 'sin_turno' && (
                <>
                  <div className="w-24 h-24 bg-amber-100 dark:bg-brand-ambar/20 rounded-full flex items-center justify-center mb-5">
                    <ShieldOff className="w-12 h-12 text-amber-500 dark:text-brand-ambar" />
                  </div>
                  <p className="text-[10px] font-black text-slate-400 dark:text-ui-muted uppercase tracking-widest mb-1">
                    Hola,
                  </p>
                  <h2 className="text-3xl font-black font-syne text-slate-800 dark:text-brand-nacar mb-3">
                    {feedback.usuario}
                  </h2>
                  <p className="text-amber-600 dark:text-brand-ambar font-bold">
                    {feedback.mensaje}
                  </p>
                  <p className="text-slate-400 dark:text-ui-muted text-sm font-bold mt-2">
                    Avisa al gerente para abrir el turno.
                  </p>
                </>
              )}
            </div>
          )}

          <div className="mb-8">
            <p className="text-center text-xs font-black text-slate-400 dark:text-ui-muted uppercase tracking-widest mb-4">
              Ingresa tu PIN personal
            </p>
            <div className="flex justify-center gap-4">
              {[0, 1, 2, 3].map((i) => (
                <div
                  key={i}
                  className={`w-14 h-16 rounded-2xl flex items-center justify-center border-2 transition-all ${pin.length > i ? 'border-indigo-500 dark:border-brand-amatista bg-indigo-50 dark:bg-brand-amatista/10 shadow-[0_0_15px_rgba(139,92,246,0.3)]' : 'border-slate-200 dark:border-ui-border bg-slate-50 dark:bg-ui-obsidiana'}`}
                >
                  {pin.length > i && (
                    <div className="w-4 h-4 bg-indigo-500 dark:bg-brand-amatista rounded-full" />
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4 mb-8">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
              <button
                key={num}
                onClick={() =>
                  setPin((p) => (p.length < 4 ? p + String(num) : p))
                }
                className="aspect-square text-3xl font-black font-syne text-slate-800 dark:text-brand-nacar bg-slate-50 dark:bg-ui-obsidiana border border-slate-200 dark:border-ui-border rounded-2xl hover:bg-slate-200 dark:hover:bg-ui-border active:scale-95 transition-all flex items-center justify-center shadow-sm"
              >
                {num}
              </button>
            ))}
            <button
              onClick={() => setPin('')}
              className="aspect-square text-sm font-black text-slate-500 dark:text-ui-muted bg-slate-100 dark:bg-ui-obsidiana/50 border border-transparent dark:border-ui-border rounded-2xl hover:bg-slate-200 dark:hover:bg-ui-border active:scale-95 transition-all flex items-center justify-center uppercase tracking-widest"
            >
              Limpiar
            </button>
            <button
              onClick={() => setPin((p) => (p.length < 4 ? p + '0' : p))}
              className="aspect-square text-3xl font-black font-syne text-slate-800 dark:text-brand-nacar bg-slate-50 dark:bg-ui-obsidiana border border-slate-200 dark:border-ui-border rounded-2xl hover:bg-slate-200 dark:hover:bg-ui-border active:scale-95 transition-all flex items-center justify-center shadow-sm"
            >
              0
            </button>
            <button
              onClick={() => setPin((p) => p.slice(0, -1))}
              disabled={pin.length === 0}
              className="aspect-square text-slate-500 dark:text-ui-muted bg-slate-100 dark:bg-ui-obsidiana/50 border border-transparent dark:border-ui-border rounded-2xl hover:text-rose-500 dark:hover:text-brand-arrecife active:scale-95 transition-all flex items-center justify-center disabled:opacity-40"
            >
              <Delete className="w-8 h-8" />
            </button>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <button
              onClick={() => registrarMovimiento('Entrada')}
              disabled={pin.length < 4}
              className="bg-emerald-500 hover:bg-emerald-600 dark:bg-brand-cesped dark:hover:bg-[#00c98c] disabled:bg-slate-200 dark:disabled:bg-ui-border disabled:text-slate-400 dark:disabled:text-ui-muted text-white dark:text-ui-obsidiana py-5 rounded-2xl font-black shadow-lg dark:shadow-[0_0_20px_rgba(0,229,160,0.2)] disabled:shadow-none active:scale-95 transition-all flex flex-col items-center justify-center gap-1"
            >
              <LogIn className="w-6 h-6 mb-1" />
              <span className="uppercase tracking-widest text-[10px]">
                Registrar
              </span>
              <span className="text-lg leading-none">Entrada</span>
            </button>
            <button
              onClick={() => registrarMovimiento('Salida')}
              disabled={pin.length < 4}
              className="bg-slate-800 hover:bg-slate-900 dark:bg-brand-arrecife dark:hover:bg-orange-600 disabled:bg-slate-200 dark:disabled:bg-ui-border disabled:text-slate-400 dark:disabled:text-ui-muted text-white dark:text-ui-obsidiana py-5 rounded-2xl font-black shadow-lg dark:shadow-[0_0_20px_rgba(255,95,64,0.2)] disabled:shadow-none active:scale-95 transition-all flex flex-col items-center justify-center gap-1"
            >
              <LogOut className="w-6 h-6 mb-1" />
              <span className="uppercase tracking-widest text-[10px]">
                Registrar
              </span>
              <span className="text-lg leading-none">Salida</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
