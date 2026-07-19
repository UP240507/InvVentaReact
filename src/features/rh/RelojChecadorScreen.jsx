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
  // PIN: las altas nuevas son de 6 dígitos; PINs legados de 4-5 se toleran
  // (mismo criterio que la edición en EmpleadosScreen). El match contra staff
  // es por igualdad exacta de string, así que aceptar el rango es seguro.
  const PIN_MIN = 4;
  const PIN_MAX = 6;

  // Candado de jornada: configuracion.horas_jornada (0 = desactivado).
  // La SALIDA se bloquea hasta cumplir las horas; el dueño (Admin) puede
  // autorizar una salida anticipada con su PIN. Exentos: Admin.
  const ROLES_EXENTOS_JORNADA = ['Admin'];
  const [salidaPendiente, setSalidaPendiente] = useState(null); // {empleado, horas, faltan}
  const [pinAdminSalida, setPinAdminSalida] = useState('');
  const [pinAdminError, setPinAdminError] = useState('');

  const { staff, asistencias, turnos, configuracion, registrarAuditoria } =
    useAppStore();
  const { enqueueAction } = useSyncStore();
  const { abrirSesionEmpleado, cerrarSesionEmpleado, empleadoActivo } =
    useSessionStore();
  const { user, logout } = useAuthStore(); // FIX 3: tenant user + salida real

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

  // Salida anticipada autorizada: un Admin teclea SU PIN → se registra la
  // salida con rastro de auditoría (quién autorizó, horas cumplidas vs jornada).
  const autorizarSalidaAnticipada = async () => {
    const p = String(pinAdminSalida).trim();
    if (p.length < PIN_MIN) {
      setPinAdminError('PIN incompleto.');
      return;
    }
    const autorizador = (staff || []).find((s) => {
      const rolS = s.rol || s.puesto || '';
      const activo =
        s.activo !== false && s.activo !== 'false' && s.activo !== 0;
      const p1 = String(s.pin ?? '').trim();
      const p2 = String(s.pin_acceso ?? '').trim();
      return (
        ROLES_EXENTOS_JORNADA.includes(rolS) &&
        activo &&
        ((p1 === p && p1 !== '') || (p2 === p && p2 !== ''))
      );
    });
    if (!autorizador) {
      setPinAdminError('PIN inválido: solo el Admin puede autorizar.');
      setPinAdminSalida('');
      return;
    }

    const { empleado, horas } = salidaPendiente;
    const restauranteId =
      empleado.restaurante_id ||
      configuracion?.restaurante_id ||
      useAuthStore.getState().restauranteId;

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

    registrarAuditoria({
      usuario: autorizador.nombre,
      accion: 'SALIDA_ANTICIPADA',
      modulo: 'CHECADOR',
      nivel: 'warning',
      detalles: `${empleado.nombre} salió con ${horas.toFixed(2)} hrs de ${Number(configuracion?.horas_jornada) || 0} hrs de jornada. Autorizó: ${autorizador.nombre}.`,
    });

    setSalidaPendiente(null);
    mostrarFeedback(
      'success',
      `Salida anticipada autorizada por ${autorizador.nombre}.`,
      empleado.nombre,
      empleado.rol || empleado.puesto,
    );
  };

  const handleSalir = async () => {
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
      return;
    }

    // Estado "zombi": hay sesión de Supabase pero sin empleadoActivo.
    // Antes: navigate('/dashboard') → EmpleadoRoute lo rebotaba a /checador
    // (bucle infinito, imposible salir). Regla nueva:
    //  - Sesión de gestión (kiosko/terminal del admin) → dashboard, como antes.
    //  - Sesión de empleado → logout REAL y al login de empleados. Su sesión
    //    sin identidad activa no sirve para nada más que rebotar.
    const rolSesion = user?.rol || user?.puesto || '';
    const esGestion = ['Admin', 'Gerente'].includes(rolSesion);
    if (esGestion && !user?.esEmpleado) {
      navigate('/dashboard');
      return;
    }
    try {
      await logout();
    } catch {
      /* noop */
    }
    navigate('/loginempleados', { replace: true });
  };

  const registrarMovimiento = useCallback(
    async (tipoMovimiento, pinOverride) => {
      const pinUsado = pinOverride || pin;
      const pinIngresadoStr = String(pinUsado).trim();

      if (pinIngresadoStr.length < PIN_MIN) {
        mostrarFeedback('error', `El PIN debe tener al menos ${PIN_MIN} dígitos.`);
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

        // ── CANDADO DE JORNADA ──────────────────────────────────────────────
        // horas_jornada > 0 → la salida exige haber cumplido la jornada,
        // salvo rol exento o autorización del dueño (flujo del pinpad abajo).
        const horasJornada = Number(configuracion?.horas_jornada) || 0;
        const rolEmpleado = empleado.rol || empleado.puesto || '';
        const exento = ROLES_EXENTOS_JORNADA.includes(rolEmpleado);
        if (horasJornada > 0 && !exento) {
          const entradaT = new Date(turnoActivoEmpleado.fecha_hora).getTime();
          const horasTranscurridas = (Date.now() - entradaT) / 3600000;
          if (horasTranscurridas < horasJornada) {
            const faltanMin = Math.ceil(
              (horasJornada - horasTranscurridas) * 60,
            );
            setSalidaPendiente({
              empleado,
              horas: horasTranscurridas,
              faltanMin,
            });
            setPinAdminSalida('');
            setPinAdminError('');
            setPin('');
            return;
          }
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
      pinUrl?.length >= PIN_MIN &&
      pinUrl?.length <= PIN_MAX &&
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
        setPin((prev) => (prev.length < PIN_MAX ? prev + e.key : prev));
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
            {empleadoActivo && (
              <div className="mb-4 px-4 py-3 rounded-2xl bg-indigo-50 dark:bg-brand-amatista/10 border border-indigo-200 dark:border-brand-amatista/30 text-center">
                <p className="text-sm font-black text-indigo-600 dark:text-brand-amatista">
                  Hola, {empleadoActivo.nombre?.split(' ')[0]} 👋
                </p>
                <p className="text-[11px] font-bold text-slate-500 dark:text-ui-muted mt-0.5">
                  Registra tu <span className="font-black">Entrada</span> con
                  tu PIN para comenzar el día.
                </p>
              </div>
            )}
            <div className="flex justify-center gap-2.5">
              {Array.from({ length: PIN_MAX }, (_, i) => i).map((i) => (
                <div
                  key={i}
                  className={`w-11 h-14 rounded-2xl flex items-center justify-center border-2 transition-all ${pin.length > i ? 'border-indigo-500 dark:border-brand-amatista bg-indigo-50 dark:bg-brand-amatista/10 shadow-[0_0_15px_rgba(139,92,246,0.3)]' : 'border-slate-200 dark:border-ui-border bg-slate-50 dark:bg-ui-obsidiana'}`}
                >
                  {pin.length > i && (
                    <div className="w-3.5 h-3.5 bg-indigo-500 dark:bg-brand-amatista rounded-full" />
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
                  setPin((p) => (p.length < PIN_MAX ? p + String(num) : p))
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
              onClick={() => setPin((p) => (p.length < PIN_MAX ? p + '0' : p))}
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
              disabled={pin.length < PIN_MIN}
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
              disabled={pin.length < PIN_MIN}
              className="bg-slate-800 hover:bg-slate-900 dark:bg-brand-arrecife dark:hover:bg-orange-600 disabled:bg-slate-200 dark:disabled:bg-ui-border disabled:text-slate-400 dark:disabled:text-ui-muted text-white dark:text-ui-obsidiana py-5 rounded-2xl font-black shadow-lg dark:shadow-[0_0_20px_rgba(255,95,64,0.2)] disabled:shadow-none active:scale-95 transition-all flex flex-col items-center justify-center gap-1"
            >
              <LogOut className="w-6 h-6 mb-1" />
              <span className="uppercase tracking-widest text-[10px]">
                Registrar
              </span>
              <span className="text-lg leading-none">Salida</span>
            </button>
          </div>

          {/* Escape del flujo dirigido: re-login a media jornada (la entrada ya
              quedó registrada antes) no debe forzar otro registro. handleSalir
              navega a la ruta por rol y TurnoRoute rebota a /espera si aplica. */}
          {empleadoActivo && (
            <button
              onClick={handleSalir}
              className="w-full mt-4 py-3 text-xs font-black uppercase tracking-widest text-slate-400 dark:text-ui-muted hover:text-indigo-500 dark:hover:text-brand-amatista transition-colors"
            >
              Ya registré mi entrada — continuar →
            </button>
          )}
        </div>
      </div>

      {/* CANDADO DE JORNADA: salida antes de tiempo requiere PIN del dueño */}
      {salidaPendiente && (
        <div className="fixed inset-0 bg-slate-900/70 dark:bg-ui-obsidiana/85 backdrop-blur-sm z-[120] flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white dark:bg-ui-humo rounded-[2rem] p-7 max-w-sm w-full shadow-2xl border-2 border-slate-100 dark:border-ui-border text-center animate-in zoom-in-95">
            <div className="w-16 h-16 bg-amber-100 dark:bg-brand-ambar/20 rounded-full flex items-center justify-center mx-auto mb-4">
              <Clock className="w-8 h-8 text-amber-500 dark:text-brand-ambar" />
            </div>
            <h3 className="font-black text-slate-900 dark:text-brand-nacar text-xl font-syne mb-1">
              Jornada incompleta
            </h3>
            <p className="text-slate-500 dark:text-ui-muted text-sm font-bold mb-1">
              {salidaPendiente.empleado.nombre} lleva{' '}
              <span className="text-slate-800 dark:text-brand-nacar">
                {salidaPendiente.horas.toFixed(1)} hrs
              </span>{' '}
              de {Number(configuracion?.horas_jornada) || 0} hrs.
            </p>
            <p className="text-amber-600 dark:text-brand-ambar text-xs font-black uppercase tracking-widest mb-5">
              Faltan ~{salidaPendiente.faltanMin} min para poder salir
            </p>
            <p className="text-slate-400 dark:text-ui-muted text-[11px] font-bold mb-3">
              Para salir antes, el Admin autoriza con su PIN:
            </p>
            <input
              type="password"
              inputMode="numeric"
              autoFocus
              maxLength={PIN_MAX}
              value={pinAdminSalida}
              onChange={(e) => {
                setPinAdminSalida(e.target.value.replace(/\D/g, ''));
                setPinAdminError('');
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') autorizarSalidaAnticipada();
              }}
              placeholder="••••••"
              className="w-full text-center text-3xl tracking-[0.5em] font-black bg-slate-50 dark:bg-ui-obsidiana border-2 border-slate-200 dark:border-ui-border focus:border-amber-500 dark:focus:border-brand-ambar rounded-2xl py-4 outline-none text-slate-900 dark:text-brand-nacar transition-colors mb-3"
            />
            {pinAdminError && (
              <p className="text-rose-500 dark:text-brand-arrecife text-xs font-bold mb-3">
                {pinAdminError}
              </p>
            )}
            <div className="flex gap-3">
              <button
                onClick={() => setSalidaPendiente(null)}
                className="flex-1 py-3.5 rounded-xl border-2 border-slate-200 dark:border-ui-border font-bold text-slate-500 dark:text-ui-muted hover:bg-slate-50 dark:hover:bg-ui-border transition-colors"
              >
                Esperar
              </button>
              <button
                onClick={autorizarSalidaAnticipada}
                disabled={pinAdminSalida.length < PIN_MIN}
                className="flex-1 py-3.5 rounded-xl bg-amber-500 dark:bg-brand-ambar text-white dark:text-ui-obsidiana font-black disabled:opacity-40 active:scale-95 transition-all"
              >
                Autorizar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}