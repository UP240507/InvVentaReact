// PerfilScreen — perfil REAL de la sesión activa (antes era 100% mock).
// Identidad desde useAuthStore/useSessionStore, métricas del día desde
// ventas/asistencias, teléfono espejado a staff, contraseña vía Supabase
// Auth (solo elevados: los operativos entran por PIN y su credencial la
// gestiona el Admin), y logout con el MISMO candado de jornada del sidebar.
import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '../../store/useAppStore';
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
    <div className="p-6 md:p-8 max-w-5xl mx-auto flex flex-col h-full animate-in fade-in duration-500 pb-20 text-slate-800 dark:text-ui-text transition-colors">
      {/* ─── HEADER ─── */}
      <div className="bg-white dark:bg-ui-humo p-8 rounded-[2.5rem] border-2 border-slate-100 dark:border-ui-border shadow-sm mb-8 flex flex-col sm:flex-row items-start sm:items-center gap-6 transition-colors">
        <div className="w-24 h-24 rounded-[2rem] bg-gradient-to-br from-indigo-500 to-violet-600 dark:from-brand-amatista dark:to-indigo-700 flex items-center justify-center text-white dark:text-ui-obsidiana text-4xl font-black shadow-xl shrink-0">
          {(nombre[0] || '?').toUpperCase()}
        </div>
        <div className="min-w-0">
          <h1 className="text-3xl font-black font-syne text-slate-900 dark:text-brand-nacar tracking-tight truncate">
            {nombre}
          </h1>
          <p className="text-indigo-600 dark:text-brand-amatista font-black flex items-center gap-2 uppercase text-xs tracking-widest bg-indigo-50 dark:bg-brand-amatista/10 px-3 py-1.5 rounded-xl w-fit mt-2 border border-indigo-100 dark:border-brand-amatista/30">
            <Shield className="w-3.5 h-3.5" /> {rol}
          </p>
          {filaStaff?.fecha_ingreso && (
            <p className="text-[10px] font-bold text-slate-400 dark:text-ui-muted uppercase tracking-widest mt-2 flex items-center gap-1.5">
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
          <h3 className="text-xs font-black text-slate-400 dark:text-ui-muted uppercase tracking-widest px-2">
            Mi día, en números
          </h3>
          <div className="bg-white dark:bg-ui-humo p-6 rounded-3xl border-2 border-slate-100 dark:border-ui-border shadow-sm transition-colors">
            <div className="flex justify-between items-start mb-3">
              <div className="p-3 rounded-2xl bg-emerald-50 dark:bg-brand-cesped/10">
                <Target className="w-5 h-5 text-emerald-600 dark:text-brand-cesped" />
              </div>
              <span className="text-[10px] font-black text-slate-400 dark:text-ui-muted uppercase tracking-widest">
                {metricas.tickets} tickets
              </span>
            </div>
            <p className="text-xs font-bold text-slate-400 dark:text-ui-muted uppercase mb-1">
              Ventas cobradas hoy
            </p>
            <p className="text-2xl font-black text-slate-900 dark:text-brand-nacar">
              {fmt(metricas.totalHoy)}
            </p>
          </div>
          <div className="bg-white dark:bg-ui-humo p-6 rounded-3xl border-2 border-slate-100 dark:border-ui-border shadow-sm transition-colors">
            <div className="p-3 rounded-2xl bg-amber-50 dark:bg-brand-ambar/10 w-fit mb-3">
              <Coins className="w-5 h-5 text-amber-500 dark:text-brand-ambar" />
            </div>
            <p className="text-xs font-bold text-slate-400 dark:text-ui-muted uppercase mb-1">
              Propinas generadas hoy
            </p>
            <p className="text-2xl font-black text-slate-900 dark:text-brand-nacar">
              {fmt(metricas.propinasHoy)}
            </p>
          </div>
          <div className="bg-white dark:bg-ui-humo p-6 rounded-3xl border-2 border-slate-100 dark:border-ui-border shadow-sm transition-colors">
            <div className="p-3 rounded-2xl bg-indigo-50 dark:bg-brand-amatista/10 w-fit mb-3">
              <Clock className="w-5 h-5 text-indigo-500 dark:text-brand-amatista" />
            </div>
            <p className="text-xs font-bold text-slate-400 dark:text-ui-muted uppercase mb-1">
              Entrada de hoy
            </p>
            <p className="text-2xl font-black text-slate-900 dark:text-brand-nacar">
              {metricas.horaEntrada || 'Sin registro'}
            </p>
          </div>
        </div>

        {/* ─── DATOS + ACCIONES ─── */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white dark:bg-ui-humo p-8 rounded-[2.5rem] border-2 border-slate-100 dark:border-ui-border shadow-sm transition-colors">
            <h3 className="text-xl font-black font-syne text-slate-900 dark:text-brand-nacar flex items-center gap-3 mb-6">
              <User className="w-6 h-6 text-indigo-500 dark:text-brand-amatista" />{' '}
              Datos de contacto
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2 opacity-80">
                <label className="text-[10px] font-black text-slate-400 dark:text-ui-muted uppercase tracking-widest px-2 flex justify-between">
                  Correo <span className="text-slate-300 dark:text-ui-muted/60">Lo gestiona el Admin en Staff</span>
                </label>
                <div className="relative">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 dark:text-ui-muted" />
                  <input
                    type="email"
                    value={email}
                    readOnly
                    className="w-full pl-12 pr-4 py-3.5 bg-slate-100 dark:bg-ui-obsidiana/50 border-2 border-transparent rounded-2xl font-bold text-slate-500 dark:text-ui-muted outline-none cursor-not-allowed"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 dark:text-ui-muted uppercase tracking-widest px-2">
                  Teléfono de contacto
                </label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Smartphone className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 dark:text-ui-muted" />
                    <input
                      type="tel"
                      value={telefono}
                      disabled={!filaStaff}
                      onChange={(e) => setTelefono(e.target.value)}
                      placeholder={filaStaff ? '000 000 0000' : 'Sin fila de staff'}
                      className="w-full pl-12 pr-4 py-3.5 bg-slate-50 dark:bg-ui-obsidiana border-2 border-slate-100 dark:border-ui-border rounded-2xl font-bold text-slate-800 dark:text-brand-nacar outline-none focus:border-indigo-500 dark:focus:border-brand-amatista transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    />
                  </div>
                  {filaStaff && (
                    <button
                      onClick={guardarTelefono}
                      disabled={
                        (telefono || '').trim() ===
                        (filaStaff.telefono || '').trim()
                      }
                      className="px-4 rounded-2xl bg-slate-900 dark:bg-brand-arrecife text-white dark:text-ui-obsidiana font-black disabled:opacity-30 active:scale-95 transition-all"
                      title="Guardar teléfono"
                    >
                      <Save className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Tema */}
            <button
              onClick={toggleTemaGlobal}
              className="p-6 rounded-[2rem] border-2 border-slate-100 dark:border-ui-border bg-white dark:bg-ui-humo flex items-center justify-between transition-all hover:border-indigo-200 dark:hover:border-brand-amatista/40"
            >
              <div className="flex items-center gap-3">
                <div className={`p-2.5 rounded-xl ${temaGlobal === 'dark' ? 'bg-brand-amatista/20' : 'bg-amber-50'}`}>
                  {temaGlobal === 'dark' ? (
                    <Moon className="w-5 h-5 text-brand-amatista" />
                  ) : (
                    <Sun className="w-5 h-5 text-amber-500" />
                  )}
                </div>
                <div className="text-left">
                  <span className="font-black text-slate-800 dark:text-brand-nacar block">
                    Modo visual
                  </span>
                  <span className="text-[10px] font-bold text-slate-400 dark:text-ui-muted uppercase tracking-widest">
                    {temaGlobal === 'dark' ? 'Nocturno activado' : 'Claro activado'}
                  </span>
                </div>
              </div>
              <div className={`w-12 h-7 rounded-full relative transition-colors ${temaGlobal === 'dark' ? 'bg-brand-amatista' : 'bg-slate-200'}`}>
                <div className={`absolute top-1 bg-white w-5 h-5 rounded-full transition-all shadow-sm ${temaGlobal === 'dark' ? 'left-6' : 'left-1'}`} />
              </div>
            </button>

            {/* Contraseña */}
            {esElevado ? (
              <button
                onClick={() => setModalPass(true)}
                className="bg-white dark:bg-ui-humo border-2 border-slate-100 dark:border-ui-border p-6 rounded-[2rem] flex items-center gap-4 hover:border-indigo-200 dark:hover:border-brand-amatista/40 transition-all group"
              >
                <div className="bg-indigo-50 dark:bg-brand-amatista/10 p-2.5 rounded-xl group-hover:bg-indigo-100 dark:group-hover:bg-brand-amatista/20 transition-colors">
                  <Key className="w-5 h-5 text-indigo-600 dark:text-brand-amatista" />
                </div>
                <div className="text-left">
                  <p className="font-black text-slate-800 dark:text-brand-nacar">
                    Contraseña
                  </p>
                  <p className="text-[10px] font-bold text-slate-400 dark:text-ui-muted uppercase tracking-widest">
                    Cambiar mi acceso
                  </p>
                </div>
              </button>
            ) : (
              <div className="bg-slate-50 dark:bg-ui-obsidiana border-2 border-dashed border-slate-200 dark:border-ui-border p-6 rounded-[2rem] flex items-center gap-4">
                <Key className="w-5 h-5 text-slate-300 dark:text-ui-muted shrink-0" />
                <p className="text-xs font-bold text-slate-400 dark:text-ui-muted">
                  Tu acceso es por PIN. Si necesitas cambiarlo, pídelo a un
                  Admin en la pantalla de Staff.
                </p>
              </div>
            )}

            {/* Logout (candado de jornada incluido) */}
            <button
              onClick={intentarLogout}
              className="md:col-span-2 bg-rose-50 dark:bg-brand-arrecife/10 border-2 border-rose-100 dark:border-brand-arrecife/20 p-6 rounded-[2rem] flex items-center justify-center gap-3 hover:bg-rose-100 dark:hover:bg-brand-arrecife/20 transition-all"
            >
              <LogOut className="w-5 h-5 text-rose-500 dark:text-brand-arrecife" />
              <span className="font-black text-rose-700 dark:text-brand-arrecife">
                Cerrar sesión
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* MODAL: cambiar contraseña */}
      {modalPass && (
        <div className="fixed inset-0 bg-slate-900/60 dark:bg-ui-obsidiana/80 backdrop-blur-md z-[150] flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white dark:bg-ui-humo rounded-[2.5rem] p-8 max-w-sm w-full shadow-2xl border-2 border-slate-100 dark:border-ui-border animate-in zoom-in-95">
            <div className="flex justify-between items-center mb-5">
              <h2 className="text-xl font-black font-syne text-slate-900 dark:text-brand-nacar">
                Cambiar contraseña
              </h2>
              <button
                onClick={() => setModalPass(false)}
                className="p-2 text-slate-400 hover:text-brand-arrecife"
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
                className="w-full px-5 py-3.5 bg-slate-50 dark:bg-ui-obsidiana border-2 border-slate-100 dark:border-ui-border rounded-2xl font-bold text-slate-800 dark:text-brand-nacar outline-none focus:border-indigo-500 dark:focus:border-brand-amatista transition-all"
              />
              <input
                type="password"
                placeholder="Confirmar contraseña"
                value={pass2}
                onChange={(e) => setPass2(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') cambiarPassword();
                }}
                className="w-full px-5 py-3.5 bg-slate-50 dark:bg-ui-obsidiana border-2 border-slate-100 dark:border-ui-border rounded-2xl font-bold text-slate-800 dark:text-brand-nacar outline-none focus:border-indigo-500 dark:focus:border-brand-amatista transition-all"
              />
              <button
                onClick={cambiarPassword}
                disabled={guardandoPass || pass1.length < 8 || pass1 !== pass2}
                className="w-full py-4 rounded-2xl font-black uppercase tracking-widest bg-indigo-500 dark:bg-brand-amatista text-white dark:text-ui-obsidiana disabled:opacity-40 active:scale-95 transition-all"
              >
                {guardandoPass ? 'Guardando...' : 'Actualizar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: jornada abierta (candado) */}
      {modalJornada && (
        <div className="fixed inset-0 bg-slate-900/60 dark:bg-ui-obsidiana/80 backdrop-blur-md z-[150] flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white dark:bg-ui-humo rounded-[2.5rem] p-8 max-w-sm w-full shadow-2xl text-center border-2 border-slate-100 dark:border-ui-border animate-in zoom-in-95">
            <div className="w-16 h-16 bg-indigo-100 dark:bg-brand-amatista/20 rounded-full flex items-center justify-center mx-auto mb-5">
              <BookMarked className="w-8 h-8 text-indigo-500 dark:text-brand-amatista" />
            </div>
            <h2 className="text-2xl font-black font-syne text-slate-900 dark:text-brand-nacar mb-2">
              Tu jornada sigue abierta
            </h2>
            <p className="text-slate-500 dark:text-ui-muted font-bold text-sm mb-8">
              Registra tu salida en el checador antes de cerrar sesión.
            </p>
            <div className="flex flex-col gap-3">
              <button
                onClick={() => {
                  setModalJornada(false);
                  navigate('/checador');
                }}
                className="w-full bg-indigo-500 dark:bg-brand-amatista hover:bg-indigo-600 text-white dark:text-ui-obsidiana py-4 rounded-xl font-black uppercase tracking-widest shadow-lg active:scale-95 transition-transform"
              >
                Ir al checador
              </button>
              <button
                onClick={() => setModalJornada(false)}
                className="w-full bg-slate-100 dark:bg-ui-obsidiana text-slate-600 dark:text-brand-nacar py-4 rounded-xl font-bold transition-colors"
              >
                Seguir trabajando
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: confirmar logout */}
      {confirmLogout && (
        <div className="fixed inset-0 bg-slate-900/60 dark:bg-ui-obsidiana/80 backdrop-blur-md z-[150] flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white dark:bg-ui-humo rounded-[2.5rem] p-8 max-w-sm w-full shadow-2xl text-center border-2 border-slate-100 dark:border-ui-border animate-in zoom-in-95">
            <div className="w-16 h-16 bg-rose-100 dark:bg-brand-arrecife/20 rounded-full flex items-center justify-center mx-auto mb-5">
              <LogOut className="w-8 h-8 text-rose-500 dark:text-brand-arrecife" />
            </div>
            <h2 className="text-2xl font-black font-syne text-slate-900 dark:text-brand-nacar mb-2">
              ¿Cerrar sesión?
            </h2>
            <p className="text-slate-500 dark:text-ui-muted font-bold text-sm mb-8">
              Se cerrará tu sesión en esta terminal.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmLogout(false)}
                className="flex-1 bg-slate-100 dark:bg-ui-obsidiana text-slate-600 dark:text-brand-nacar py-4 rounded-xl font-bold transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={ejecutarLogout}
                className="flex-1 bg-rose-500 dark:bg-brand-arrecife hover:bg-rose-600 text-white dark:text-ui-obsidiana py-4 rounded-xl font-black uppercase tracking-widest shadow-lg active:scale-95 transition-transform"
              >
                Salir
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
