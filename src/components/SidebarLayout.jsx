import { useState, useEffect, useRef } from 'react';
import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
import {
  Clock,
  LogOut,
  AlertTriangle,
  CreditCard,
  X,
  CheckCircle,
  Info,
  Sun,
  Moon,
  WifiOff,
} from 'lucide-react';
import { useSyncStore } from '../store/useSyncStore';
import { useAppStore } from '../store/useAppStore';
import { useAuthStore } from '../features/auth/useAuthStore';
import { useSessionStore } from '../store/useSessionStore';
import {
  useShellStore,
  ANCHO_SIDEBAR,
  ANCHO_SIDEBAR_MIN,
} from '../store/useShellStore';
import {
  getRolEfectivo,
  getCapacidades,
  puedeVerRuta as capVerRuta,
  tieneFlag,
} from '../lib/Permisos';
import {
  gruposVisibles as calcularGruposVisibles,
  esRutaOperacion,
  esPantallaCompleta,
} from '../lib/Navegacion';
import { useAcoplado } from '../hooks/useAcoplado';
import BarraPestanas from './BarraPestanas';

// 🌟 FIX: Importamos el Modal directamente en lugar del Widget
import CierreTurnoModal from '../features/dashboard/CierreTurnoModal';
import StatusBar from './StatusBar';
import Topbar from './Topbar';
import CommandPalette from './CommandPalette';
import AyudaAtajos from './AyudaAtajos';
import { usePlan } from '../hooks/usePlan';
import { useAtajos } from '../hooks/useAtajos';

// El catálogo del menú vive en lib/Navegacion.js: lo comparten el sidebar, el
// buscador global del topbar y (tanda 3) la command palette. Una sola fuente.

const TOAST_STYLES = {
  error: {
    bg: 'bg-adm-danger text-adm-danger-fg',
    Icon: AlertTriangle,
    label: 'Acción no permitida',
  },
  success: {
    bg: 'bg-adm-ok text-adm-bg',
    Icon: CheckCircle,
    label: 'Operación exitosa',
  },
  info: {
    bg: 'bg-adm-info text-adm-info-fg',
    Icon: Info,
    label: 'Información',
  },
  warning: {
    bg: 'bg-adm-warn text-adm-bg',
    Icon: AlertTriangle,
    label: 'Atención',
  },
};

export default function SidebarLayout() {
  const { isOffline, pendingTasks } = useSyncStore();
  // 🌟 FIX: Extraemos 'turnos' para saber si pintar el botón
  const { mesas, toast, configuracion, turnos, asistencias } = useAppStore();
  // ⚠️ Realtime: la suscripción global YA NO se monta aquí. Vive en
  // fetchInitialData (useAppStore), que corre para CUALQUIER sesión autenticada.
  // Montarla aquí tenía dos fallas: (1) las rutas FUERA de este layout
  // (/espera, /loginempleados) nunca abrían el canal, y (2) el cleanup del
  // useEffect ejecutaba detenerSuscripcionKDS() al desmontar el layout →
  // navegar a /espera MATABA el canal global y el empleado quedaba en una
  // pantalla sorda (el bug de "no redirige al abrir turno sin recargar").
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();

  const [globalPopup, setGlobalPopup] = useState(null);
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [bloqueoSalida, setBloqueoSalida] = useState(false);
  const [showCierreModal, setShowCierreModal] = useState(false);
  const [verAyuda, setVerAyuda] = useState(false); // F1

  // Proyecto D · tanda 2: colapso del sidebar (persistido por dispositivo).
  const colapsado = useShellStore((s) => s.sidebarColapsado);
  const toggleSidebar = useShellStore((s) => s.toggleSidebar);
  const abrirPalette = useShellStore((s) => s.abrirBuscador);

  // Tanda 3: el modo claro/oscuro ya vivía en useAppStore (temaGlobal +
  // toggleTemaGlobal) pero este layout llevaba SU PROPIA copia en useState.
  // Resultado: alternar aquí no actualizaba el switch de PerfilScreen. Ahora
  // hay una sola fuente — y además Ctrl+Shift+L puede dispararla.
  const isDark = useAppStore((s) => s.temaGlobal) === 'dark';
  const toggleTheme = useAppStore((s) => s.toggleTemaGlobal);

  const turnoActivo =
    (turnos || []).find((t) => t.estado === 'abierto') || null;

  const handleLogout = async () => {
    // Cerrar el canal realtime ANTES de tirar la sesión: aquí sí aplica el
    // teardown (fin de sesión), no en el desmontaje del layout.
    try {
      useAppStore.getState().detenerSuscripcionKDS?.();
    } catch {
      /* noop */
    }
    if (logout) await logout();
    localStorage.removeItem('auth-storage');
    sessionStorage.clear();
    setConfirmLogout(false);
    navigate('/login', { replace: true });
  };

  // La lista vive en `lib/Navegacion.js`, no aquí. Esta condición era la ÚNICA
  // definición de «pantalla sin riel» y por eso nadie relacionó el encierro del
  // barista con ella: en el KDS no hay menú, así que la pantalla es la única
  // que puede ofrecer salida. Compartida, `Escape.test.js` puede recorrerla y
  // exigir salida para cada rol.
  const isFullScreenRoute = esPantallaCompleta(location.pathname);

  // Rol e identidad — capacidades vivas (Proyecto L): flags, no nombres.
  const rolesPermisos = useAppStore((s) => s.roles_permisos);
  const rolActual = getRolEfectivo(user);
  const capActual = getCapacidades(rolActual, rolesPermisos);
  const esGestion = tieneFlag(capActual, 'gestion');
  const { tieneModulo } = usePlan(); // Fase 1: gates de módulos premium
  // El popup de "mesa pidiendo la cuenta" solo para quien ve cobros (no meseros).
  const verCobros = esGestion || tieneFlag(capActual, 'abre_caja');

  const mesasCobrar = (mesas || []).filter((m) => m.estado === 'por_cobrar');
  const prevMesasCobrar = useRef(mesasCobrar.length);

  useEffect(() => {
    if (verCobros && mesasCobrar.length > prevMesasCobrar.current) {
      setGlobalPopup({
        title: '¡Mesa pidiendo la cuenta!',
        msg: 'Una mesa acaba de solicitar su cobro. Revisa el mapa de mesas.',
        icon: CreditCard,
        color: 'bg-adm-danger',
        link: '/mesas',
      });
      setTimeout(() => setGlobalPopup(null), 6000);
    }
    prevMesasCobrar.current = mesasCobrar.length;
  }, [mesasCobrar.length, verCobros]);

  // Filtrado del menú por capacidades: MISMO criterio que puedeAcceder() en
  // useSessionStore (ambos usan lib/Permisos), para que el sidebar muestre solo
  // lo que el usuario realmente puede abrir y no queden links que rebotan.
  // Fase 1: los módulos premium (item.modulo) además exigen plan/addon vigente.
  const gruposVisibles = calcularGruposVisibles(
    (path) => capVerRuta(capActual, path),
    tieneModulo,
  );

  // ¿Cabe el riel al lado del contenido? Mismo umbral que el resto de la app.
  const acoplado = useAcoplado();

  // La MISMA lista que pinta el riel, aplanada para la barra de pestañas. No se
  // recalculan permisos ni se declara un menú «de móvil»: si aquí apareciera un
  // destino que el riel no enseña, sería un permiso mal leído en uno de los dos
  // sitios, y el que se descubre tarde es siempre el que no miras.
  const destinosPlanos = gruposVisibles.flatMap((g) => g.items);

  // Quién puede CERRAR la caja: mismo flag que abrirla en EsperaScreen
  // (abre_caja). Un Mesero/Chef/Barista no gestiona el turno, así que no
  // ve el botón de corte aunque haya caja abierta.
  const puedeCerrarCaja = tieneFlag(capActual, 'abre_caja');

  // ── ATAJOS GLOBALES (Proyecto D · tanda 3) ────────────────────────────────
  // Scope 'global': el de MENOR precedencia. Cualquier módulo que registre el
  // mismo combo lo sobrescribe mientras esté montado (ver lib/Atajos).
  //
  // Decisión (Chris, 25-jul): el teclado es para la OPERACIÓN del día —cobrar,
  // mandar a producción, marcar comandas, reservar—, no para saltar de módulo.
  // Por eso aquí quedan solo cuatro atajos de chasis y se retiraron los
  // Ctrl+1..9: navegar ya se hace con Ctrl+K, que además busca. Un atajo que
  // el cajero no usa cinco veces al día no se memoriza y solo estorba en la
  // ayuda de F1.
  const atajosGlobales = {
    'ctrl+k': {
      descripcion: 'Buscar o ejecutar una acción',
      accion: abrirPalette,
      permitirEnInput: true, // vale también escribiendo en un formulario
    },
    'ctrl+b': {
      descripcion: colapsado ? 'Expandir el menú' : 'Colapsar el menú',
      accion: toggleSidebar,
    },
    'ctrl+shift+l': {
      descripcion: 'Cambiar entre modo claro y oscuro',
      accion: toggleTheme,
    },
    f1: {
      descripcion: 'Ver los atajos de esta pantalla',
      accion: () => setVerAyuda(true),
      permitirEnInput: true,
    },
  };

  useAtajos('global', atajosGlobales, { titulo: 'Generales' });

  const toastStyle = toast
    ? (TOAST_STYLES[toast.type] ?? TOAST_STYLES.info)
    : null;

  return (
    <div className="flex h-screen font-sans overflow-hidden relative">
      {/* POPUP GLOBAL */}
      {globalPopup && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[100] animate-in slide-in-from-top-10 fade-in duration-media">
          <div
            className={`${globalPopup.color} text-adm-danger-fg px-6 py-4 rounded-ui shadow-2xl flex items-center gap-4 border border-white/20 min-w-[350px] cursor-pointer hover:scale-105 transition-transform`}
            onClick={() => {
              navigate(globalPopup.link);
              setGlobalPopup(null);
            }}
          >
            <div className="bg-white/20 p-3 rounded-full">
              <globalPopup.icon className="w-8 h-8" />
            </div>
            <div className="flex-1">
              <p className="font-black text-lg leading-tight">
                {globalPopup.title}
              </p>
              <p className="text-sm font-medium opacity-90 mt-1">
                {globalPopup.msg}
              </p>
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setGlobalPopup(null);
              }}
              className="p-2 hover:bg-white/20 rounded-full transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}

      {/* TOAST GLOBAL */}
      {toast && toastStyle && (
        <div className="fixed top-6 right-6 z-[100] animate-in slide-in-from-top-4 fade-in duration-media pointer-events-none">
          <div
            className={`px-6 py-4 rounded-ui shadow-2xl flex items-center gap-3 ${toastStyle.bg}`}
          >
            <toastStyle.Icon className="w-6 h-6 shrink-0" />
            <div>
              <p className="font-bold text-sm">{toastStyle.label}</p>
              <p className="text-xs font-medium opacity-90">{toast.msg}</p>
            </div>
          </div>
        </div>
      )}

      {/* INDICADOR OFFLINE
          Sube por encima de la barra de pestañas cuando la hay. `bottom-12`
          son 48 px y las pestañas miden ~56 más la franja del gesto: el aviso
          quedaba detrás justo de lo que se toca.

          Este aviso es además el motivo de que la barra de estado pueda
          desaparecer en teléfono sin perder nada urgente: lo único de allí que
          no puede esperar —estar sin red, en una app que presume de seguir
          cobrando sin ella— se avisa aquí, y este banner no depende de aquella
          barra. */}
      {isOffline && (
        <div
          className={`fixed left-1/2 -translate-x-1/2 z-[100] animate-in slide-in-from-bottom-4 fade-in duration-media ${
            acoplado ? 'bottom-12' : 'bottom-24'
          }`}
        >
          <div className="bg-adm-ink dark:bg-adm-panel text-adm-bg px-5 py-3 rounded-ui shadow-2xl flex items-center gap-3 border border-adm-border">
            <WifiOff className="w-4 h-4 text-adm-warn shrink-0" />
            <span className="text-sm font-bold">Modo Offline</span>
            {pendingTasks > 0 && (
              <span className="bg-adm-warn text-adm-bg text-[10px] font-black px-2 py-0.5 rounded-full">
                {pendingTasks} pendiente{pendingTasks !== 1 ? 's' : ''}
              </span>
            )}
          </div>
        </div>
      )}

      {/* SIDEBAR — 208px expandido ↔ 56px modo icono (Ctrl+B)
          Sólo con ancho. En un teléfono de 390 px el riel colapsado se lleva 56
          —el 14 % del ancho, permanentemente— para algo que se toca dos o tres
          veces por turno, y encima en la esquina más lejana del pulgar. Abajo
          hay una barra de pestañas que no roba ancho a nadie. */}
      {!isFullScreenRoute && acoplado && (
        <aside
          style={{
            width: colapsado ? ANCHO_SIDEBAR_MIN : ANCHO_SIDEBAR,
          }}
          className="bg-adm-sidebar border-r border-adm-border flex flex-col h-full z-20 flex-shrink-0 relative font-figtree transition-[width] duration-[250ms] ease-out overflow-hidden"
        >
          {/* Lockup de marca */}
          <div
            className={`h-14 shrink-0 border-b border-adm-sidebar-2 flex items-center ${
              colapsado ? 'justify-center px-0' : 'px-5'
            }`}
          >
            {colapsado ? (
              <span
                className="font-fraunces font-bold text-xl text-adm-accent leading-none"
                title={`InvVenta · ${configuracion?.nombre_empresa || 'Mi Restaurante'}`}
              >
                I
              </span>
            ) : (
              <div className="min-w-0">
                <h1 className="text-xl font-bold font-fraunces text-adm-sidebar-fg tracking-tight leading-none">
                  <span className="text-adm-accent">Inv</span>Venta
                </h1>
                <p
                  className="text-[10px] uppercase tracking-[0.18em] font-bold text-adm-sidebar-muted mt-1 truncate"
                  title={configuracion?.nombre_empresa || 'Mi Restaurante'}
                >
                  {configuracion?.nombre_empresa || 'Mi Restaurante'}
                </p>
              </div>
            )}
          </div>

          {/* 🌟 BOTÓN LIMPIO DE CIERRE DE TURNO (solo con caja abierta Y rol que la gestiona) */}
          {turnoActivo && puedeCerrarCaja && (
            <div
              className={`py-3 border-b border-adm-sidebar-2 ${colapsado ? 'px-2' : 'px-4'}`}
            >
              <button
                onClick={() => setShowCierreModal(true)}
                title="Cerrar Turno"
                className={`w-full py-2.5 bg-adm-cobro hover:opacity-90 text-adm-cobro-fg rounded-ui font-bold text-sm transition-opacity flex items-center justify-center gap-2 ${
                  colapsado ? 'px-0' : 'px-4'
                }`}
              >
                <X className="w-4 h-4 shrink-0" />
                {!colapsado && <span className="truncate">Cerrar Turno</span>}
              </button>
            </div>
          )}

          {/* Navegación */}
          <nav
            className={`flex-1 overflow-y-auto overflow-x-hidden py-4 custom-scrollbar ${
              colapsado ? 'px-2 space-y-3' : 'px-3 space-y-5'
            }`}
          >
            {gruposVisibles.map((group, gi) => (
              <div key={gi}>
                {colapsado ? (
                  // Sin espacio para el microtítulo: una regla separa los grupos.
                  gi > 0 && <div className="h-px bg-adm-sidebar-2 mb-3 mx-1" />
                ) : (
                  <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-adm-sidebar-muted/70 mb-2 px-2">
                    {group.title}
                  </p>
                )}
                <ul className="space-y-0.5">
                  {group.items.map((item, ii) => (
                    <li key={ii}>
                      <NavLink
                        to={item.path}
                        title={colapsado ? item.label : undefined}
                        className={({ isActive }) =>
                          `flex items-center gap-3 py-2.5 font-medium text-sm transition-colors border-l-2 ${
                            colapsado ? 'justify-center px-0' : 'px-3'
                          } ${
                            isActive
                              ? 'bg-adm-sidebar-2 text-adm-sidebar-fg border-adm-accent'
                              : 'text-adm-sidebar-muted border-transparent hover:bg-adm-sidebar-2 hover:text-adm-sidebar-fg'
                          }`
                        }
                      >
                        <item.icon className="w-4 h-4 shrink-0" />
                        {!colapsado && (
                          <span className="truncate">{item.label}</span>
                        )}
                      </NavLink>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>

          {/* Footer: theme + perfil + logout */}
          <div
            className={`py-3 border-t border-adm-sidebar-2 ${
              colapsado
                ? 'px-2 flex flex-col items-center gap-1'
                : 'px-3 flex items-center gap-2'
            }`}
          >
            <button
              onClick={toggleTheme}
              className="p-2.5 text-adm-sidebar-muted hover:text-adm-accent hover:bg-adm-sidebar-2 rounded-ui transition-colors active:scale-95"
              title="Cambiar Ambiente"
            >
              {isDark ? (
                <Sun className="w-5 h-5" />
              ) : (
                <Moon className="w-5 h-5" />
              )}
            </button>

            <NavLink
              to="/perfil"
              title={colapsado ? (user?.nombre ?? 'Mi perfil') : undefined}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-ui transition-colors ${
                  colapsado ? 'p-1' : 'flex-1 px-3 py-2 min-w-0'
                } ${isActive ? 'bg-adm-sidebar-2' : 'hover:bg-adm-sidebar-2'}`
              }
            >
              <div className="w-9 h-9 bg-adm-accent rounded-ui flex items-center justify-center text-adm-accent-fg font-bold font-fraunces text-sm shrink-0">
                {user?.nombre?.charAt(0).toUpperCase() ?? 'U'}
              </div>
              {!colapsado && (
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-adm-sidebar-fg leading-none truncate">
                    {user?.nombre ?? 'Usuario'}
                  </p>
                  <p className="text-[10px] text-adm-sidebar-muted font-bold uppercase tracking-[0.18em] mt-1 truncate">
                    @{user?.username ?? user?.rol ?? 'sin sesión'}
                  </p>
                </div>
              )}
            </NavLink>

            <button
              onClick={() => {
                // CANDADO: un empleado con jornada ABIERTA (su último registro
                // de asistencia es 'entrada') no puede desloguearse sin checar
                // salida — y la salida tiene su propio candado de horas en el
                // checador (con autorización del Admin). Exentos: gestión.
                const { empleadoActivo } = useSessionStore.getState();
                const exento = tieneFlag(
                  getCapacidades(
                    getRolEfectivo(empleadoActivo),
                    useAppStore.getState().roles_permisos,
                  ),
                  'exento_jornada',
                );
                if (empleadoActivo && !exento) {
                  const regs = (asistencias || [])
                    .filter((a) => a.empleado_nombre === empleadoActivo.nombre)
                    .sort(
                      (a, b) => new Date(b.fecha_hora) - new Date(a.fecha_hora),
                    );
                  if (regs[0]?.tipo === 'entrada') {
                    setBloqueoSalida(true);
                    return;
                  }
                }
                setConfirmLogout(true);
              }}
              className="p-2 text-adm-sidebar-muted hover:text-adm-danger hover:bg-adm-sidebar-2 rounded-ui transition-colors"
              title="Cerrar Sesión"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </aside>
      )}

      {/* CONTENIDO PRINCIPAL: TOPBAR + OUTLET + STATUS BAR (Proyecto D) */}
      <div
        className={`flex-1 h-full flex flex-col min-h-0 min-w-0 ${isFullScreenRoute ? 'w-full' : ''}`}
      >
        {!isFullScreenRoute && <Topbar />}
        {/* La SUPERFICIE la decide la ruta (Proyecto D, híbrido). Las dos son
            del TENANT desde el 25-jul: admin sobre adm-*, operación sobre
            ops-*. Lo que cambia entre ellas es el carácter (densidad, radios,
            targets), no si respetan o no el tema. */}
        <main
          className={`flex-1 overflow-y-auto relative transition-colors duration-[250ms] ${
            esRutaOperacion(location.pathname)
              ? 'bg-ops-bg text-ops-ink'
              : 'bg-adm-bg text-adm-ink'
          }`}
        >
          <Outlet />
        </main>
        {/* Abajo del todo: con ancho, la barra de estado del escritorio —«En
            línea · Turno abierto · Sesión»—; sin él, las pestañas.

            No conviven a propósito. Serían 32 px de mobiliario más 56 de
            navegación en una pantalla donde el mobiliario ya se llevaba la
            mitad del alto, y lo que dice la barra de estado no es algo que se
            consulte de pie: es contexto de la caja. Lo único que sí urge de ahí
            —estar sin red— ya se avisa aparte, y ese aviso no depende de esta
            barra. */}
        {!isFullScreenRoute &&
          (acoplado ? <StatusBar /> : <BarraPestanas items={destinosPlanos} />)}
      </div>

      {/* ── TECLADO GLOBAL (Proyecto D · tanda 3) ── */}
      {/* Se montan SIEMPRE, también en POS/KDS: el teclado no depende del
          chrome. Las acciones que ofrecen siguen filtradas por capacidades. */}
      <CommandPalette
        onVerAtajos={() => setVerAyuda(true)}
        onAbrirTurno={() => navigate('/espera')}
        onCerrarTurno={
          puedeCerrarCaja && turnoActivo
            ? () => setShowCierreModal(true)
            : undefined
        }
        onCerrarSesion={() => setConfirmLogout(true)}
      />
      <AyudaAtajos abierta={verAyuda} onCerrar={() => setVerAyuda(false)} />

      {/* 🌟 MODAL GLOBAL DE CIERRE DE TURNO */}
      {showCierreModal && (
        <CierreTurnoModal onClose={() => setShowCierreModal(false)} />
      )}

      {/* MODAL: LOGOUT BLOQUEADO POR JORNADA ABIERTA */}
      {bloqueoSalida && (
        <div className="fixed inset-0 bg-adm-ink/60 dark:bg-adm-bg/80 backdrop-blur-sm flex items-center justify-center z-[200] p-4 animate-in fade-in">
          <div className="bg-white dark:bg-adm-panel rounded-ui-lg border border-adm-border p-8 shadow-2xl w-full max-w-sm flex flex-col text-center animate-in zoom-in-95">
            <div className="w-16 h-16 bg-adm-warn/15 text-adm-warn rounded-full flex items-center justify-center mx-auto mb-4">
              <Clock className="w-8 h-8" />
            </div>
            <h3 className="font-black text-adm-ink text-2xl mb-2 font-syne">
              Jornada abierta
            </h3>
            <p className="text-adm-muted text-sm font-medium mb-8">
              Tienes una <strong>entrada sin salida</strong> en el checador.
              Registra tu salida antes de cerrar sesión (si aún no cumples la
              jornada, el Admin puede autorizarla con su PIN).
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setBloqueoSalida(false)}
                className="flex-1 py-3.5 rounded-ui border-2 border-adm-border font-bold text-adm-muted hover:bg-adm-bg dark:hover:bg-adm-border transition-colors"
              >
                Seguir trabajando
              </button>
              <button
                onClick={() => {
                  setBloqueoSalida(false);
                  navigate('/checador');
                }}
                className="flex-1 py-3.5 rounded-ui bg-adm-warn hover:bg-adm-warn shadow-lg shadow-adm-warn/30 font-black text-adm-bg transition-transform active:scale-95"
              >
                Ir al checador
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL CERRAR SESIÓN */}
      {confirmLogout && (
        <div className="fixed inset-0 bg-adm-ink/60 dark:bg-adm-bg/80 backdrop-blur-sm flex items-center justify-center z-[200] p-4 animate-in fade-in">
          <div className="bg-white dark:bg-adm-panel rounded-ui-lg border border-adm-border p-8 shadow-2xl w-full max-w-sm flex flex-col text-center animate-in zoom-in-95">
            <div className="w-16 h-16 bg-adm-danger/15 text-adm-danger rounded-full flex items-center justify-center mx-auto mb-4">
              <LogOut className="w-8 h-8 ml-1" />
            </div>
            <h3 className="font-black text-adm-ink text-2xl mb-2 font-syne">
              ¿Cerrar sesión?
            </h3>
            <p className="text-adm-muted text-sm font-medium mb-8">
              Tu sesión actual se cerrará y tendrás que volver a ingresar tus
              credenciales.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmLogout(false)}
                className="flex-1 py-3.5 rounded-ui border-2 border-adm-border font-bold text-adm-muted hover:bg-adm-bg dark:hover:bg-adm-border hover:text-adm-ink dark:hover:text-adm-ink transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleLogout}
                className="flex-1 py-3.5 rounded-ui bg-adm-danger dark:hover:bg-adm-warn shadow-lg shadow-adm-danger/30 font-black text-adm-danger-fg transition-transform active:scale-95"
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
