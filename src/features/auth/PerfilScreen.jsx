// PerfilScreen — perfil REAL de la sesión activa (antes era 100% mock).
// Identidad desde useAuthStore/useSessionStore, métricas del día desde
// ventas/asistencias, teléfono espejado a staff, contraseña vía Supabase
// Auth (solo elevados: los operativos entran por PIN y su credencial la
// gestiona el Admin), y logout con el MISMO candado de jornada del sidebar.
import { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '../../store/useAppStore';
import { PageShell } from '../../components/ui';
import { useAuthStore } from './useAuthStore';
import { useSessionStore } from '../../store/useSessionStore';
import { useSyncStore } from '../../store/useSyncStore';
import { supabase } from '../../api/supabase';
import { getCapacidades, tieneFlag } from '../../lib/Permisos';
import {
  User,
  Mail,
  Shield,
  Key,
  LogOut,
  Smartphone,
  Target,
  Calendar,
  Save,
  Moon,
  Sun,
  Coins,
  Clock,
  X,
  BookMarked,
  Store,
  Copy,
} from 'lucide-react';

export default function PerfilScreen() {
  const {
    showToast,
    temaGlobal,
    toggleTemaGlobal,
    ventas,
    asistencias,
    staff,
    roles_permisos,
  } = useAppStore();
  const { user, logout } = useAuthStore();
  const { empleadoActivo } = useSessionStore();
  const { enqueueAction } = useSyncStore();
  const navigate = useNavigate();

  // ── Identidad real de la sesión ────────────────────────────────────────────
  const nombre = empleadoActivo?.nombre || user?.nombre || 'Usuario';
  const rol =
    empleadoActivo?.rol ||
    empleadoActivo?.puesto ||
    user?.rol ||
    user?.puesto ||
    '—';
  // Elevados (o sesión de gestión sin empleado) pueden cambiar SU contraseña.
  const esElevado =
    tieneFlag(getCapacidades(rol, roles_permisos), 'elevado') ||
    (!empleadoActivo && !!user);

  // Fila staff viva (teléfono/email/fecha de ingreso) — solo si la sesión es
  // de un empleado; la cuenta del dueño vive en 'usuarios'.
  const filaStaff = useMemo(
    () =>
      empleadoActivo
        ? (staff || []).find(
            (s) => String(s.id) === String(empleadoActivo.id),
          ) || null
        : null,
    [staff, empleadoActivo],
  );

  const email = filaStaff?.email || user?.email || '—';
  const [telefono, setTelefono] = useState(filaStaff?.telefono || '');

  // ── Código del restaurante (Fase 1.6) — solo sesión de gestión ────────────
  // La llave que el staff teclea con su PIN al estrenar un dispositivo.
  const esGestion = tieneFlag(getCapacidades(rol, roles_permisos), 'gestion');
  const restauranteIdSesion = useAuthStore.getState().restauranteId;
  const [codigoRestaurante, setCodigoRestaurante] = useState('');
  const [codigoCopiado, setCodigoCopiado] = useState(false);
  useEffect(() => {
    if (!esGestion || !restauranteIdSesion) return;
    supabase
      .from('restaurantes')
      .select('codigo')
      .eq('id', restauranteIdSesion)
      .maybeSingle()
      .then(({ data }) => setCodigoRestaurante(data?.codigo || ''));
  }, [esGestion, restauranteIdSesion]);
  const copiarCodigoRestaurante = async () => {
    try {
      await navigator.clipboard.writeText(codigoRestaurante);
      setCodigoCopiado(true);
      setTimeout(() => setCodigoCopiado(false), 2000);
    } catch {
      /* noop */
    }
  };

  // ── Métricas REALES de hoy ─────────────────────────────────────────────────
  const hoyStr = new Date().toDateString();
  const metricas = useMemo(() => {
    const ventasHoy = (ventas || []).filter(
      (v) =>
        v.usuario === nombre &&
        v.fecha &&
        new Date(v.fecha).toDateString() === hoyStr,
    );
    const totalHoy = ventasHoy.reduce((s, v) => s + Number(v.total || 0), 0);
    const propinasHoy = ventasHoy.reduce(
      (s, v) => s + Number(v.propina || 0),
      0,
    );
    const regsHoy = (asistencias || [])
      .filter(
        (a) =>
          a.empleado_nombre === nombre &&
          a.fecha_hora &&
          new Date(a.fecha_hora).toDateString() === hoyStr,
      )
      .sort((a, b) => new Date(a.fecha_hora) - new Date(b.fecha_hora));
    const entrada = regsHoy.find(
      (r) => (r.tipo || '').toLowerCase() === 'entrada',
    );
    return {
      tickets: ventasHoy.length,
      totalHoy,
      propinasHoy,
      horaEntrada: entrada
        ? new Date(entrada.fecha_hora).toLocaleTimeString('es-MX', {
            hour: '2-digit',
            minute: '2-digit',
          })
        : null,
    };
  }, [ventas, asistencias, nombre, hoyStr]);

  const fmt = (n) =>
    `$${Number(n || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}`;

  // ── Teléfono → espejo en staff (offline-first) ─────────────────────────────
  const guardarTelefono = () => {
    if (!filaStaff) return;
    const actualizado = { ...filaStaff, telefono: telefono.trim() };
    enqueueAction('staff', 'upsert', actualizado);
    useAppStore.getState().upsertStaff(actualizado);
    showToast('Teléfono actualizado', 'success');
  };

  // ── Contraseña (Supabase Auth, solo elevados con correo real) ──────────────
  const [modalPass, setModalPass] = useState(false);
  const [pass1, setPass1] = useState('');
  const [pass2, setPass2] = useState('');
  const [guardandoPass, setGuardandoPass] = useState(false);

  const cambiarPassword = async () => {
    if (pass1.length < 8)
      return showToast('La contraseña necesita al menos 8 caracteres', 'error');
    if (pass1 !== pass2)
      return showToast('Las contraseñas no coinciden', 'error');
    setGuardandoPass(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: pass1 });
      if (error) throw error;
      showToast('Contraseña actualizada', 'success');
      setModalPass(false);
      setPass1('');
      setPass2('');
    } catch (e) {
      showToast(`No se pudo actualizar: ${e?.message || e}`, 'error');
    } finally {
      setGuardandoPass(false);
    }
  };

  // ── Logout con el MISMO candado de jornada del sidebar ─────────────────────
  const [modalJornada, setModalJornada] = useState(false);
  const [confirmLogout, setConfirmLogout] = useState(false);

  const intentarLogout = () => {
    const rolEmp = empleadoActivo?.rol || empleadoActivo?.puesto;
    const exento = tieneFlag(
      getCapacidades(rolEmp, roles_permisos),
      'exento_jornada',
    );
    if (empleadoActivo && !exento) {
      const regs = (asistencias || [])
        .filter((a) => a.empleado_nombre === empleadoActivo.nombre)
        .sort((a, b) => new Date(b.fecha_hora) - new Date(a.fecha_hora));
      if ((regs[0]?.tipo || '').toLowerCase() === 'entrada') {
        setModalJornada(true);
        return;
      }
    }
    setConfirmLogout(true);
  };

  const ejecutarLogout = async () => {
    try {
      useAppStore.getState().detenerSuscripcionKDS?.();
    } catch {
      /* noop */
    }
    if (logout) await logout();
    localStorage.removeItem('auth-storage');
    sessionStorage.clear();
    navigate('/login', { replace: true });
  };

  return (
    <PageShell ancho="max-w-5xl" className="pb-20 overflow-y-auto">
      {/* ─── HEADER ─── */}
      {/* `items-stretch` en columna, mismo motivo que en `OpsHeader`: con
          `items-start` el bloque del nombre mide su contenido y el `truncate`
          de abajo no tiene ancho contra el que recortar. El avatar no se
          deforma porque lleva `w-24` explícito, que gana al estirado. */}
      <div className="bg-white dark:bg-adm-panel p-8 rounded-ui-lg border-2 border-adm-border shadow-sm mb-8 flex flex-col sm:flex-row items-stretch sm:items-center gap-6 transition-colors">
        <div className="w-24 h-24 rounded-ui-lg bg-adm-info flex items-center justify-center text-adm-bg text-4xl font-black shadow-xl shrink-0">
          {(nombre[0] || '?').toUpperCase()}
        </div>
        <div className="min-w-0">
          <h1 className="text-3xl font-black font-syne text-adm-ink tracking-tight truncate">
            {nombre}
          </h1>
          <p className="text-adm-info font-black flex items-center gap-2 uppercase text-xs tracking-widest bg-adm-info/10 px-3 py-1.5 rounded-ui w-fit mt-2 border border-adm-info/30">
            <Shield className="w-3.5 h-3.5" /> {rol}
          </p>
          {filaStaff?.fecha_ingreso && (
            <p className="text-[10px] font-bold text-adm-muted uppercase tracking-widest mt-2 flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5" /> En el equipo desde{' '}
              {new Date(filaStaff.fecha_ingreso).toLocaleDateString('es-MX', {
                dateStyle: 'medium',
              })}
            </p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* ─── MÉTRICAS DE HOY (reales) ─── */}
        <div className="space-y-4">
          <h3 className="text-xs font-black text-adm-muted uppercase tracking-widest px-2">
            Mi día, en números
          </h3>
          <div className="bg-white dark:bg-adm-panel p-6 rounded-ui-lg border-2 border-adm-border shadow-sm transition-colors">
            <div className="flex justify-between items-start mb-3">
              <div className="p-3 rounded-ui bg-adm-ok/10">
                <Target className="w-5 h-5 text-adm-ok" />
              </div>
              <span className="text-[10px] font-black text-adm-muted uppercase tracking-widest">
                {metricas.tickets} tickets
              </span>
            </div>
            <p className="text-xs font-bold text-adm-muted uppercase mb-1">
              Ventas cobradas hoy
            </p>
            <p className="text-2xl font-black text-adm-ink">
              {fmt(metricas.totalHoy)}
            </p>
          </div>
          <div className="bg-white dark:bg-adm-panel p-6 rounded-ui-lg border-2 border-adm-border shadow-sm transition-colors">
            <div className="p-3 rounded-ui bg-adm-warn/10 w-fit mb-3">
              <Coins className="w-5 h-5 text-adm-warn" />
            </div>
            <p className="text-xs font-bold text-adm-muted uppercase mb-1">
              Propinas generadas hoy
            </p>
            <p className="text-2xl font-black text-adm-ink">
              {fmt(metricas.propinasHoy)}
            </p>
          </div>
          <div className="bg-white dark:bg-adm-panel p-6 rounded-ui-lg border-2 border-adm-border shadow-sm transition-colors">
            <div className="p-3 rounded-ui bg-adm-info/10 w-fit mb-3">
              <Clock className="w-5 h-5 text-adm-info" />
            </div>
            <p className="text-xs font-bold text-adm-muted uppercase mb-1">
              Entrada de hoy
            </p>
            <p className="text-2xl font-black text-adm-ink">
              {metricas.horaEntrada || 'Sin registro'}
            </p>
          </div>
        </div>

        {/* ─── DATOS + ACCIONES ─── */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white dark:bg-adm-panel p-8 rounded-ui-lg border-2 border-adm-border shadow-sm transition-colors">
            <h3 className="text-xl font-black font-syne text-adm-ink flex items-center gap-3 mb-6">
              <User className="w-6 h-6 text-adm-info" /> Datos de contacto
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2 opacity-80">
                <label className="text-[10px] font-black text-adm-muted uppercase tracking-widest px-2 flex justify-between">
                  Correo{' '}
                  <span className="text-adm-muted">
                    Lo gestiona el Admin en Staff
                  </span>
                </label>
                <div className="relative">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-adm-muted" />
                  <input
                    type="email"
                    value={email}
                    readOnly
                    className="w-full pl-12 pr-4 py-3.5 bg-adm-chip dark:bg-adm-bg/50 border-2 border-transparent rounded-ui font-bold text-adm-muted outline-none cursor-not-allowed"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-adm-muted uppercase tracking-widest px-2">
                  Teléfono de contacto
                </label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Smartphone className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-adm-muted" />
                    <input
                      type="tel"
                      value={telefono}
                      disabled={!filaStaff}
                      onChange={(e) => setTelefono(e.target.value)}
                      placeholder={
                        filaStaff ? '000 000 0000' : 'Sin fila de staff'
                      }
                      className="w-full pl-12 pr-4 py-3.5 bg-adm-bg border-2 border-adm-field rounded-ui font-bold text-adm-ink outline-none focus:border-adm-info dark:focus:border-adm-info transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    />
                  </div>
                  {filaStaff && (
                    <button
                      onClick={guardarTelefono}
                      disabled={
                        (telefono || '').trim() ===
                        (filaStaff.telefono || '').trim()
                      }
                      className="px-4 rounded-ui bg-adm-ink dark:bg-adm-danger text-adm-danger-fg font-black disabled:opacity-30 active:scale-95 transition-all"
                      title="Guardar teléfono"
                    >
                      <Save className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* ── Código del restaurante — solo gestión ── */}
          {esGestion && codigoRestaurante && (
            <div className="bg-white dark:bg-adm-panel p-8 rounded-ui-lg border-2 border-adm-border shadow-sm transition-colors">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h3 className="text-xl font-black font-syne text-adm-ink flex items-center gap-3">
                    <Store className="w-6 h-6 text-adm-info" /> Código del
                    restaurante
                  </h3>
                  <p className="text-xs font-bold text-adm-muted mt-1">
                    Tu equipo lo usa junto con su PIN para activar dispositivos
                    nuevos.
                  </p>
                </div>
                <button
                  onClick={copiarCodigoRestaurante}
                  title="Copiar código"
                  className="shrink-0 flex items-center gap-2.5 px-5 py-3 rounded-ui border-2 border-adm-border bg-adm-bg font-black text-xl tracking-widest tabular-nums text-adm-ink hover:border-adm-info dark:hover:border-adm-ok transition-colors"
                >
                  {codigoRestaurante}
                  <Copy className="w-4 h-4 text-adm-muted" />
                </button>
              </div>
              {codigoCopiado && (
                <p className="text-[11px] font-black text-adm-ok mt-2 text-right">
                  Copiado ✓
                </p>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Tema */}
            <button
              onClick={toggleTemaGlobal}
              className="p-6 rounded-ui-lg border-2 border-adm-border bg-white dark:bg-adm-panel flex items-center justify-between transition-all hover:border-adm-info/30 dark:hover:border-adm-info/40"
            >
              <div className="flex items-center gap-3">
                <div
                  className={`p-2.5 rounded-ui ${temaGlobal === 'dark' ? 'bg-adm-info/20' : 'bg-adm-warn/10'}`}
                >
                  {temaGlobal === 'dark' ? (
                    <Moon className="w-5 h-5 text-adm-info" />
                  ) : (
                    <Sun className="w-5 h-5 text-adm-warn" />
                  )}
                </div>
                <div className="text-left">
                  <span className="font-black text-adm-ink block">
                    Modo visual
                  </span>
                  <span className="text-[10px] font-bold text-adm-muted uppercase tracking-widest">
                    {temaGlobal === 'dark'
                      ? 'Nocturno activado'
                      : 'Claro activado'}
                  </span>
                </div>
              </div>
              <div
                className={`w-12 h-7 rounded-full relative transition-colors ${temaGlobal === 'dark' ? 'bg-adm-info' : 'bg-adm-chip'}`}
              >
                <div
                  className={`absolute top-1 bg-white w-5 h-5 rounded-full transition-all shadow-sm ${temaGlobal === 'dark' ? 'left-6' : 'left-1'}`}
                />
              </div>
            </button>

            {/* Contraseña */}
            {esElevado ? (
              <button
                onClick={() => setModalPass(true)}
                className="bg-white dark:bg-adm-panel border-2 border-adm-border p-6 rounded-ui-lg flex items-center gap-4 hover:border-adm-info/30 dark:hover:border-adm-info/40 transition-all group"
              >
                <div className="bg-adm-info/10 p-2.5 rounded-ui group-hover:bg-adm-info/15 dark:group-hover:bg-adm-info/20 transition-colors">
                  <Key className="w-5 h-5 text-adm-info" />
                </div>
                <div className="text-left">
                  <p className="font-black text-adm-ink">Contraseña</p>
                  <p className="text-[10px] font-bold text-adm-muted uppercase tracking-widest">
                    Cambiar mi acceso
                  </p>
                </div>
              </button>
            ) : (
              <div className="bg-adm-bg border-2 border-dashed border-adm-border p-6 rounded-ui-lg flex items-center gap-4">
                <Key className="w-5 h-5 text-adm-muted shrink-0" />
                <p className="text-xs font-bold text-adm-muted">
                  Tu acceso es por PIN. Si necesitas cambiarlo, pídelo a un
                  Admin en la pantalla de Staff.
                </p>
              </div>
            )}

            {/* Logout (candado de jornada incluido) */}
            <button
              onClick={intentarLogout}
              className="md:col-span-2 bg-adm-danger/10 border-2 border-adm-danger/30 p-6 rounded-ui-lg flex items-center justify-center gap-3 hover:bg-adm-danger/15 dark:hover:bg-adm-danger/20 transition-all"
            >
              <LogOut className="w-5 h-5 text-adm-danger" />
              <span className="font-black text-adm-danger">Cerrar sesión</span>
            </button>
          </div>
        </div>
      </div>

      {/* MODAL: cambiar contraseña */}
      {modalPass && (
        <div className="fixed inset-0 bg-adm-ink/60 dark:bg-adm-bg/80 backdrop-blur-md z-[150] flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white dark:bg-adm-panel rounded-ui-lg p-8 max-w-sm w-full shadow-2xl border-2 border-adm-border animate-in zoom-in-95">
            <div className="flex justify-between items-center mb-5">
              <h2 className="text-xl font-black font-syne text-adm-ink">
                Cambiar contraseña
              </h2>
              <button
                onClick={() => setModalPass(false)}
                className="p-2 text-adm-muted hover:text-adm-danger"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-3">
              <input
                type="password"
                autoFocus
                placeholder="Nueva contraseña (mín. 8)"
                value={pass1}
                onChange={(e) => setPass1(e.target.value)}
                className="w-full px-5 py-3.5 bg-adm-bg border-2 border-adm-field rounded-ui font-bold text-adm-ink outline-none focus:border-adm-info dark:focus:border-adm-info transition-all"
              />
              <input
                type="password"
                placeholder="Confirmar contraseña"
                value={pass2}
                onChange={(e) => setPass2(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') cambiarPassword();
                }}
                className="w-full px-5 py-3.5 bg-adm-bg border-2 border-adm-field rounded-ui font-bold text-adm-ink outline-none focus:border-adm-info dark:focus:border-adm-info transition-all"
              />
              <button
                onClick={cambiarPassword}
                disabled={guardandoPass || pass1.length < 8 || pass1 !== pass2}
                className="w-full py-4 rounded-ui font-black uppercase tracking-widest bg-adm-info text-adm-info-fg disabled:opacity-40 active:scale-95 transition-all"
              >
                {guardandoPass ? 'Guardando...' : 'Actualizar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: jornada abierta (candado) */}
      {modalJornada && (
        <div className="fixed inset-0 bg-adm-ink/60 dark:bg-adm-bg/80 backdrop-blur-md z-[150] flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white dark:bg-adm-panel rounded-ui-lg p-8 max-w-sm w-full shadow-2xl text-center border-2 border-adm-border animate-in zoom-in-95">
            <div className="w-16 h-16 bg-adm-info/15 rounded-full flex items-center justify-center mx-auto mb-5">
              <BookMarked className="w-8 h-8 text-adm-info" />
            </div>
            <h2 className="text-2xl font-black font-syne text-adm-ink mb-2">
              Tu jornada sigue abierta
            </h2>
            <p className="text-adm-muted font-bold text-sm mb-8">
              Registra tu salida en el checador antes de cerrar sesión.
            </p>
            <div className="flex flex-col gap-3">
              <button
                onClick={() => {
                  setModalJornada(false);
                  navigate('/checador');
                }}
                className="w-full bg-adm-info hover:bg-adm-info text-adm-info-fg py-4 rounded-ui font-black uppercase tracking-widest shadow-lg active:scale-95 transition-transform"
              >
                Ir al checador
              </button>
              <button
                onClick={() => setModalJornada(false)}
                className="w-full bg-adm-chip dark:bg-adm-bg text-adm-muted dark:text-adm-ink py-4 rounded-ui font-bold transition-colors"
              >
                Seguir trabajando
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: confirmar logout */}
      {confirmLogout && (
        <div className="fixed inset-0 bg-adm-ink/60 dark:bg-adm-bg/80 backdrop-blur-md z-[150] flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white dark:bg-adm-panel rounded-ui-lg p-8 max-w-sm w-full shadow-2xl text-center border-2 border-adm-border animate-in zoom-in-95">
            <div className="w-16 h-16 bg-adm-danger/15 rounded-full flex items-center justify-center mx-auto mb-5">
              <LogOut className="w-8 h-8 text-adm-danger" />
            </div>
            <h2 className="text-2xl font-black font-syne text-adm-ink mb-2">
              ¿Cerrar sesión?
            </h2>
            <p className="text-adm-muted font-bold text-sm mb-8">
              Se cerrará tu sesión en esta terminal.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmLogout(false)}
                className="flex-1 bg-adm-chip dark:bg-adm-bg text-adm-muted dark:text-adm-ink py-4 rounded-ui font-bold transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={ejecutarLogout}
                className="flex-1 bg-adm-danger text-adm-danger-fg py-4 rounded-ui font-black uppercase tracking-widest shadow-lg active:scale-95 transition-transform"
              >
                Salir
              </button>
            </div>
          </div>
        </div>
      )}
    </PageShell>
  );
}
