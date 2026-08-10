import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../../api/supabase';
import { useAppStore } from '../../store/useAppStore';
import { useSyncStore } from '../../store/useSyncStore';
import { useSessionStore } from '../../store/useSessionStore';
import { getRolEfectivo, getCapacidades, tieneFlag } from '../../lib/Permisos';
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
import { entradaActiva, horasDesde } from '../../lib/Asistencias';

export default function RelojChecadorScreen() {
  // PIN: las altas nuevas son de 6 dígitos; PINs legados de 4-5 se toleran
  // (mismo criterio que la edición en EmpleadosScreen). El match contra staff
  // es por igualdad exacta de string, así que aceptar el rango es seguro.
  const PIN_MIN = 4;
  const PIN_MAX = 6;

  // Candado de jornada: configuracion.horas_jornada (0 = desactivado).
  // La SALIDA se bloquea hasta cumplir las horas; quien tenga el flag
  // 'autoriza_salidas' (hoy: Admin) autoriza la anticipada con su PIN.
  // Exentos del candado: flag 'exento_jornada'. (Proyecto L — flags, no roles.)
  const [salidaPendiente, setSalidaPendiente] = useState(null); // {empleado, horas, faltan}
  const [pinAdminSalida, setPinAdminSalida] = useState('');
  const [pinAdminError, setPinAdminError] = useState('');

  const {
    staff,
    asistencias,
    turnos,
    configuracion,
    registrarAuditoria,
    roles_permisos,
  } = useAppStore();
  const capDeRol = (rol) => getCapacidades(rol, roles_permisos);
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
        tieneFlag(capDeRol(rolS), 'autoriza_salidas') &&
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
        capDeRol(getRolEfectivo(empleadoActivo)).ruta_inicial || '/dashboard';
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
    const esGestion = tieneFlag(capDeRol(rolSesion), 'gestion');
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
        mostrarFeedback(
          'error',
          `El PIN debe tener al menos ${PIN_MIN} dígitos.`,
        );
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

      // ── LA COMPARACIÓN DE FECHAS, QUE ESTABA A MEDIO ARREGLAR ───────────────
      //
      // `hoyStr` es la fecha de calendario LOCAL ('2026-08-05'), pero
      // `fecha_hora` se guarda con `toISOString()`, que es **UTC**. Comparar
      // con `startsWith` mezclaba los dos husos, y en México (UTC−6) el
      // resultado era éste:
      //
      //   • Una entrada marcada a las 20:00 del 5-ago se guarda como
      //     '2026-08-06T02:00:00Z'. Al pedir la salida, el filtro busca
      //     '2026-08-05' → NO la encuentra → «No tienes entrada activa para
      //     registrar salida». El trabajador no podía cerrar su turno.
      //   • Y al día siguiente antes de las 18:00, esa misma entrada SÍ
      //     aparecía —porque entonces `hoyStr` ya era '2026-08-06'—, así que
      //     el checador decía «ya tienes entrada registrada» a alguien que
      //     acababa de llegar.
      //
      // Por eso "se volvía loco": funcionaba de día y fallaba de noche, que es
      // justo cuando trabaja un restaurante. El arreglo del 27-jul cambió el
      // lado izquierdo de la comparación a fecha local, pero el derecho siguió
      // siendo UTC; hay que convertir CADA registro a su día local, igual que
      // hace `lib/Nominas.diasTrabajados`.
      // La regla vive en `lib/Asistencias.js`, con 15 aserciones que fijan el
      // caso del turno de noche en las dos direcciones. Aquí solo se consulta.
      const turnoActivoEmpleado = entradaActiva(asistencias, empleado.id);

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

        const rolSistema = getRolEfectivo(empleado);
        const rolNecesitaTurno = !tieneFlag(
          capDeRol(rolSistema),
          'exento_turno',
        );

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
            const ruta =
              capDeRol(getRolEfectivo(empleado)).ruta_inicial || '/mesas';
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
        const exento = tieneFlag(capDeRol(rolEmpleado), 'exento_jornada');
        if (horasJornada > 0 && !exento) {
          const horasTranscurridas = horasDesde(turnoActivoEmpleado);
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
    <div className="min-h-screen bg-ops-panel-2 dark:bg-ops-bg flex items-center justify-center p-6 transition-colors duration-lenta relative overflow-hidden">
      <button
        onClick={handleSalir}
        className="absolute top-6 left-6 p-4 bg-white dark:bg-ops-panel border-2 border-ops-border rounded-ui text-ops-muted hover:text-ops-danger dark:hover:text-ops-danger hover:border-ops-danger/30 dark:hover:border-ops-danger/50 transition-all shadow-sm z-50 flex items-center gap-2 group"
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
          <div className="bg-white dark:bg-ops-panel p-6 rounded-ui-lg border-2 border-ops-border shadow-xl inline-flex mb-4 transition-colors">
            <Clock className="w-12 h-12 text-ops-info" />
          </div>
          <h1 className="text-7xl lg:text-8xl font-black font-syne text-ops-ink tracking-tighter tabular-nums leading-none">
            {horaActual.toLocaleTimeString('es-MX', {
              hour: '2-digit',
              minute: '2-digit',
            })}
          </h1>
          <p className="text-lg font-bold text-ops-muted uppercase tracking-widest">
            {horaActual.toLocaleDateString('es-MX', {
              weekday: 'long',
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            })}
          </p>

          <div
            className={`px-5 py-3 rounded-ui border-2 flex items-center gap-3 ${
              turnoAbierto
                ? 'bg-ops-ok/10 border-ops-ok/30'
                : 'bg-ops-danger/10 border-ops-danger/30'
            }`}
          >
            <div
              className={`w-2.5 h-2.5 rounded-full ${turnoAbierto ? 'bg-ops-ok animate-pulse' : 'bg-ops-danger'}`}
            />
            <div>
              <p
                className={`text-[10px] font-black uppercase tracking-widest ${turnoAbierto ? 'text-ops-ok' : 'text-ops-danger'}`}
              >
                Turno de caja
              </p>
              <p
                className={`text-sm font-bold ${turnoAbierto ? 'text-ops-ok' : 'text-ops-danger'}`}
              >
                {turnoAbierto
                  ? 'Abierto — operaciones habilitadas'
                  : 'Cerrado — solo Admin/Gerente'}
              </p>
            </div>
          </div>

          <div>
            <p className="text-sm font-black text-ops-danger uppercase tracking-widest">
              {configuracion?.nombre_empresa || 'AZUL Restaurante'}
            </p>
            <p className="text-xs font-bold text-ops-muted">
              InvVenta · Control de Acceso
            </p>
          </div>
        </div>

        <div className="bg-white/80 dark:bg-ops-panel/90 backdrop-blur-xl rounded-ui-lg border-2 border-ops-border shadow-2xl p-8 md:p-12 relative overflow-hidden transition-colors">
          {feedback && (
            <div className="absolute inset-0 z-50 bg-white/95 dark:bg-ops-panel/95 backdrop-blur-md flex flex-col items-center justify-center p-8 text-center animate-in fade-in zoom-in duration-media">
              {feedback.tipo === 'success' && (
                <>
                  <div className="w-24 h-24 bg-ops-ok/15 rounded-full flex items-center justify-center mb-5">
                    <CheckCircle className="w-12 h-12 text-ops-ok" />
                  </div>
                  <p className="text-[10px] font-black text-ops-muted uppercase tracking-widest mb-1">
                    Acceso Concedido
                  </p>
                  <h2 className="text-3xl font-black font-syne text-ops-ink mb-1">
                    {feedback.usuario}
                  </h2>
                  <span className="text-[10px] font-black uppercase tracking-widest px-3 py-1.5 bg-ops-info/15 text-ops-info rounded-full mb-3">
                    {feedback.rol}
                  </span>
                  <p className="text-ops-ok font-bold">{feedback.mensaje}</p>
                </>
              )}
              {feedback.tipo === 'error' && (
                <>
                  <div className="w-24 h-24 bg-ops-danger/15 rounded-full flex items-center justify-center mb-5">
                    <AlertTriangle className="w-12 h-12 text-ops-danger" />
                  </div>
                  <h2 className="text-3xl font-black font-syne text-ops-ink mb-3">
                    Acceso Denegado
                  </h2>
                  <p className="text-ops-danger font-bold">
                    {feedback.mensaje}
                  </p>
                </>
              )}
              {feedback.tipo === 'sin_turno' && (
                <>
                  <div className="w-24 h-24 bg-ops-warn/15 rounded-full flex items-center justify-center mb-5">
                    <ShieldOff className="w-12 h-12 text-ops-warn" />
                  </div>
                  <p className="text-[10px] font-black text-ops-muted uppercase tracking-widest mb-1">
                    Hola,
                  </p>
                  <h2 className="text-3xl font-black font-syne text-ops-ink mb-3">
                    {feedback.usuario}
                  </h2>
                  <p className="text-ops-warn font-bold">{feedback.mensaje}</p>
                  <p className="text-ops-muted text-sm font-bold mt-2">
                    Avisa al gerente para abrir el turno.
                  </p>
                </>
              )}
            </div>
          )}

          <div className="mb-8">
            <p className="text-center text-xs font-black text-ops-muted uppercase tracking-widest mb-4">
              Ingresa tu PIN personal
            </p>
            {empleadoActivo && (
              <div className="mb-4 px-4 py-3 rounded-ui bg-ops-info/10 border border-ops-info/30 text-center">
                <p className="text-sm font-black text-ops-info">
                  Hola, {empleadoActivo.nombre?.split(' ')[0]} 👋
                </p>
                <p className="text-[11px] font-bold text-ops-muted mt-0.5">
                  Registra tu <span className="font-black">Entrada</span> con tu
                  PIN para comenzar el día.
                </p>
              </div>
            )}
            <div className="flex justify-center gap-2.5">
              {Array.from({ length: PIN_MAX }, (_, i) => i).map((i) => (
                <div
                  key={i}
                  className={`w-11 h-14 rounded-ui flex items-center justify-center border-2 transition-all ${pin.length > i ? 'border-ops-info bg-ops-info/10 shadow-[0_0_15px_rgba(139,92,246,0.3)]' : 'border-ops-border bg-ops-bg'}`}
                >
                  {pin.length > i && (
                    <div className="w-3.5 h-3.5 bg-ops-info rounded-full" />
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
                className="aspect-square text-3xl font-black font-syne text-ops-ink bg-ops-bg border border-ops-border rounded-ui hover:bg-ops-panel-2 dark:hover:bg-ops-border active:scale-95 transition-all flex items-center justify-center shadow-sm"
              >
                {num}
              </button>
            ))}
            <button
              onClick={() => setPin('')}
              className="aspect-square text-sm font-black text-ops-muted bg-ops-panel-2 dark:bg-ops-bg/50 border border-transparent dark:border-ops-border rounded-ui hover:bg-ops-panel-2 dark:hover:bg-ops-border active:scale-95 transition-all flex items-center justify-center uppercase tracking-widest"
            >
              Limpiar
            </button>
            <button
              onClick={() => setPin((p) => (p.length < PIN_MAX ? p + '0' : p))}
              className="aspect-square text-3xl font-black font-syne text-ops-ink bg-ops-bg border border-ops-border rounded-ui hover:bg-ops-panel-2 dark:hover:bg-ops-border active:scale-95 transition-all flex items-center justify-center shadow-sm"
            >
              0
            </button>
            <button
              onClick={() => setPin((p) => p.slice(0, -1))}
              disabled={pin.length === 0}
              className="aspect-square text-ops-muted bg-ops-panel-2 dark:bg-ops-bg/50 border border-transparent dark:border-ops-border rounded-ui hover:text-ops-danger dark:hover:text-ops-danger active:scale-95 transition-all flex items-center justify-center disabled:opacity-40"
            >
              <Delete className="w-8 h-8" />
            </button>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <button
              onClick={() => registrarMovimiento('Entrada')}
              disabled={pin.length < PIN_MIN}
              className="bg-ops-ok dark:hover:bg-[#00c98c] disabled:bg-ops-panel-2 dark:disabled:bg-ops-border disabled:text-ops-muted dark:disabled:text-ops-muted text-ops-ok-fg py-5 rounded-ui font-black shadow-lg dark:shadow-[0_0_20px_rgba(0,229,160,0.2)] disabled:shadow-none active:scale-95 transition-all flex flex-col items-center justify-center gap-1"
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
              className="bg-ops-ink hover:bg-ops-ink dark:bg-ops-danger dark:hover:bg-ops-warn disabled:bg-ops-panel-2 dark:disabled:bg-ops-border disabled:text-ops-muted dark:disabled:text-ops-muted text-ops-danger-fg py-5 rounded-ui font-black shadow-lg dark:shadow-[0_0_20px_rgba(255,95,64,0.2)] disabled:shadow-none active:scale-95 transition-all flex flex-col items-center justify-center gap-1"
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
              className="w-full mt-4 py-3 text-xs font-black uppercase tracking-widest text-ops-muted hover:text-ops-info dark:hover:text-ops-info transition-colors"
            >
              Ya registré mi entrada — continuar →
            </button>
          )}
        </div>
      </div>

      {/* CANDADO DE JORNADA: salida antes de tiempo requiere PIN del dueño */}
      {salidaPendiente && (
        <div className="fixed inset-0 bg-ops-ink/70 dark:bg-ops-bg/85 backdrop-blur-sm z-[120] flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white dark:bg-ops-panel rounded-ui-lg p-7 max-w-sm w-full shadow-2xl border-2 border-ops-border text-center animate-in zoom-in-95">
            <div className="w-16 h-16 bg-ops-warn/15 rounded-full flex items-center justify-center mx-auto mb-4">
              <Clock className="w-8 h-8 text-ops-warn" />
            </div>
            <h3 className="font-black text-ops-ink text-xl font-syne mb-1">
              Jornada incompleta
            </h3>
            <p className="text-ops-muted text-sm font-bold mb-1">
              {salidaPendiente.empleado.nombre} lleva{' '}
              <span className="text-ops-ink">
                {salidaPendiente.horas.toFixed(1)} hrs
              </span>{' '}
              de {Number(configuracion?.horas_jornada) || 0} hrs.
            </p>
            <p className="text-ops-warn text-xs font-black uppercase tracking-widest mb-5">
              Faltan ~{salidaPendiente.faltanMin} min para poder salir
            </p>
            <p className="text-ops-muted text-[11px] font-bold mb-3">
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
              className="w-full text-center text-3xl tracking-[0.5em] font-black bg-ops-bg border-2 border-ops-field focus:border-ops-warn dark:focus:border-ops-warn rounded-ui py-4 outline-none text-ops-ink transition-colors mb-3"
            />
            {pinAdminError && (
              <p className="text-ops-danger text-xs font-bold mb-3">
                {pinAdminError}
              </p>
            )}
            <div className="flex gap-3">
              <button
                onClick={() => setSalidaPendiente(null)}
                className="flex-1 py-3.5 rounded-ui border-2 border-ops-border font-bold text-ops-muted hover:bg-ops-bg dark:hover:bg-ops-border transition-colors"
              >
                Esperar
              </button>
              <button
                onClick={autorizarSalidaAnticipada}
                disabled={pinAdminSalida.length < PIN_MIN}
                className="flex-1 py-3.5 rounded-ui bg-ops-warn text-ops-danger-fg font-black disabled:opacity-40 active:scale-95 transition-all"
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
