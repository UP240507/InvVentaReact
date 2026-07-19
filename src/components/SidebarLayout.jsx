import { useState, useEffect, useRef } from 'react';
import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Utensils,
  MonitorSmartphone,
  Package,
  ChefHat,
  ListPlus,
  ShoppingCart,
  ClipboardCheck,
  Trash2,
  Truck,
  Users,
  Clock,
  HeartHandshake,
  FileBarChart,
  FileText,
  Printer,
  ShieldCheck,
  Settings,
  LogOut,
  Bell,
  AlertTriangle,
  CreditCard,
  X,
  CheckCircle,
  Info,
  MonitorPlay,
  Coins,
  Sun,
  Moon,
  WifiOff,
} from 'lucide-react';
import { useSyncStore } from '../store/useSyncStore';
import { useAppStore } from '../store/useAppStore';
import { useAuthStore } from '../features/auth/useAuthStore';
import { RUTAS_POR_ROL, useSessionStore } from '../store/useSessionStore';

// 🌟 FIX: Importamos el Modal directamente en lugar del Widget
import CierreTurnoModal from '../features/dashboard/CierreTurnoModal';

const menuGroups = [
  {
    title: 'Principal',
    items: [{ path: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' }],
  },
  {
    title: 'Operación',
    items: [
      { path: '/mesas', icon: Utensils, label: 'Mapa de Mesas' },
      { path: '/pos', icon: MonitorSmartphone, label: 'Punto de Venta' },
      { path: '/kds', icon: MonitorPlay, label: 'Monitor Cocina' },
      { path: '/propinas', icon: Coins, label: 'Propinero' },
    ],
  },
  {
    title: 'Catálogos',
    items: [
      { path: '/recetas', icon: ChefHat, label: 'Recetas' },
      { path: '/modificadores', icon: ListPlus, label: 'Modificadores' },
      { path: '/ingredientes', icon: Package, label: 'Ingredientes' },
    ],
  },
  {
    title: 'Compras y Almacén',
    items: [
      { path: '/compras', icon: ShoppingCart, label: 'Órdenes de Compra' },
      { path: '/recepcion', icon: ClipboardCheck, label: 'Recepción' },
      { path: '/mermas', icon: Trash2, label: 'Ajustes y Mermas' },
      { path: '/proveedores', icon: Truck, label: 'Proveedores' },
    ],
  },
  {
    title: 'Equipo y Clientes',
    items: [
      { path: '/empleados', icon: Users, label: 'Staff' },
      { path: '/asistencias', icon: Clock, label: 'Reloj Checador' },
      { path: '/nominas', icon: Coins, label: 'Nóminas' },
      { path: '/permisos', icon: ShieldCheck, label: 'Roles y Permisos' },
      { path: '/clientes', icon: HeartHandshake, label: 'CRM' },
    ],
  },
  {
    title: 'Análisis',
    items: [
      { path: '/reportes', icon: FileBarChart, label: 'Reportes' },
      { path: '/facturas', icon: FileText, label: 'Facturación CFDI' },
    ],
  },
  {
    title: 'Sistema',
    items: [
      { path: '/zonas-produccion', icon: Printer, label: 'Zonas de impresión' },
      { path: '/auditoria', icon: ShieldCheck, label: 'Auditoría' },
      { path: '/configuracion', icon: Settings, label: 'Configuración' },
    ],
  },
];

const TOAST_STYLES = {
  error: {
    bg: 'bg-brand-arrecife text-white',
    Icon: AlertTriangle,
    label: 'Acción no permitida',
  },
  success: {
    bg: 'bg-brand-cesped text-ui-obsidiana',
    Icon: CheckCircle,
    label: 'Operación exitosa',
  },
  info: {
    bg: 'bg-brand-amatista text-white',
    Icon: Info,
    label: 'Información',
  },
  warning: {
    bg: 'bg-brand-ambar text-ui-obsidiana',
    Icon: AlertTriangle,
    label: 'Atención',
  },
};

// Estados de comanda que cuentan como "lista para entregar" (notificación para
// meseros). AJUSTA según tu flujo del KDS: si tu estado de "listo" es otro, va
// aquí. Si en tu flujo "listo" == 'completada' (que el store trata como terminal
// y la saca de comandas_activas), avísame: ahí hay que ajustar el ciclo, no solo
// esta lista.
const ESTADOS_LISTOS = ['lista', 'listo', 'preparada', 'para_entregar'];

export default function SidebarLayout() {
  const { isOffline, pendingTasks } = useSyncStore();
  // 🌟 FIX: Extraemos 'turnos' para saber si pintar el botón
  const {
    mesas,
    productos,
    ordenesCompra,
    toast,
    configuracion,
    turnos,
    comandas_activas,
    asistencias,
  } = useAppStore();
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

  const [showNotifications, setShowNotifications] = useState(false);
  const [globalPopup, setGlobalPopup] = useState(null);
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [bloqueoSalida, setBloqueoSalida] = useState(false);
  const [showCierreModal, setShowCierreModal] = useState(false);

  const [isDark, setIsDark] = useState(
    localStorage.getItem('theme') === 'dark' ||
      (!('theme' in localStorage) &&
        window.matchMedia('(prefers-color-scheme: dark)').matches),
  );

  const turnoActivo =
    (turnos || []).find((t) => t.estado === 'abierto') || null;

  const toggleTheme = () => {
    const siguiente = !isDark;
    document.documentElement.classList.toggle('dark', siguiente);
    localStorage.setItem('theme', siguiente ? 'dark' : 'light');
    setIsDark(siguiente);
  };

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

  const isFullScreenRoute =
    location.pathname === '/pos' || location.pathname === '/kds';

  // Rol e identidad — fuente única para gatear notificaciones y menú.
  const rolActual = user?.rol || user?.puesto || 'Mesero';
  const esGestion = ['Admin', 'Gerente'].includes(rolActual);
  // Visibilidad de notificaciones por rol: gestión ve cobros/stock/compras; los
  // operativos NO (no les sirven). El mesero solo ve "pedidos listos".
  const verCobros = esGestion || rolActual === 'Cajero';
  const verStock = esGestion;
  const verCompras = esGestion;
  const verListos = !esGestion;

  const mesasCobrar = (mesas || []).filter((m) => m.estado === 'por_cobrar');
  const stockCritico = (productos || []).filter(
    (p) => (Number(p.stock) || 0) <= (Number(p.min) || 0),
  );
  const ordenesPendientes = (ordenesCompra || []).filter(
    (o) => o.estado === 'pendiente',
  );
  const pedidosListos = (comandas_activas || []).filter((c) =>
    ESTADOS_LISTOS.includes(c?.estado),
  );

  // El badge solo cuenta lo que ESTE rol puede ver.
  const totalNotificaciones =
    (verCobros ? mesasCobrar.length : 0) +
    (verStock ? stockCritico.length : 0) +
    (verCompras ? ordenesPendientes.length : 0) +
    (verListos ? pedidosListos.length : 0);

  const prevMesasCobrar = useRef(mesasCobrar.length);

  useEffect(() => {
    // El popup de "mesa pidiendo la cuenta" solo para quien ve cobros (no meseros).
    if (verCobros && mesasCobrar.length > prevMesasCobrar.current) {
      setGlobalPopup({
        title: '¡Mesa pidiendo la cuenta!',
        msg: 'Una mesa acaba de solicitar su cobro. Revisa el mapa de mesas.',
        icon: CreditCard,
        color: 'bg-brand-arrecife',
        link: '/mesas',
      });
      setTimeout(() => setGlobalPopup(null), 6000);
    }
    prevMesasCobrar.current = mesasCobrar.length;
  }, [mesasCobrar.length, verCobros]);

  // Filtrado del menú por rol: MISMO criterio que puedeAcceder() en
  // useSessionStore (fuente única de verdad), para que el sidebar muestre solo
  // lo que el usuario realmente puede abrir y no queden links que rebotan.
  // Admin ve todo; el resto, su lista de RUTAS_POR_ROL.
  const rutasPermitidas = ['Admin'].includes(rolActual)
    ? '*'
    : RUTAS_POR_ROL[rolActual] || RUTAS_POR_ROL['Mesero'];
  const puedeVerRuta = (path) => {
    if (rutasPermitidas === '*') return true;
    const limpia = path.replace(/^\//, '').split('/')[0];
    return rutasPermitidas.includes(limpia);
  };
  const gruposVisibles = menuGroups
    .map((g) => ({
      ...g,
      items: g.items.filter((it) => puedeVerRuta(it.path)),
    }))
    .filter((g) => g.items.length > 0);

  // Quién puede CERRAR la caja: mismo criterio que abrirla en EsperaScreen
  // (ROLES_ABRIR_CAJA). Un Mesero/Chef/Barista no gestiona el turno, así que no
  // ve el botón de corte aunque haya caja abierta.
  const puedeCerrarCaja = [
    'Cajero',
    'Gerente',
    'Admin',
  ].includes(rolActual);

  const toastStyle = toast
    ? (TOAST_STYLES[toast.type] ?? TOAST_STYLES.info)
    : null;

  return (
    <div className="flex h-screen font-sans overflow-hidden relative">
      {/* POPUP GLOBAL */}
      {globalPopup && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[100] animate-in slide-in-from-top-10 fade-in duration-300">
          <div
            className={`${globalPopup.color} text-white px-6 py-4 rounded-2xl shadow-2xl flex items-center gap-4 border border-white/20 min-w-[350px] cursor-pointer hover:scale-105 transition-transform`}
            onClick={() => {
              navigate(globalPopup.link);
              setGlobalPopup(null);
            }}
          >
            <div className="bg-white/20 p-3 rounded-full">
              <globalPopup.icon className="w-8 h-8 text-white" />
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
              <X className="w-5 h-5 text-white" />
            </button>
          </div>
        </div>
      )}

      {/* TOAST GLOBAL */}
      {toast && toastStyle && (
        <div className="fixed top-6 right-6 z-[100] animate-in slide-in-from-top-4 fade-in duration-300 pointer-events-none">
          <div
            className={`px-6 py-4 rounded-2xl shadow-2xl flex items-center gap-3 ${toastStyle.bg}`}
          >
            <toastStyle.Icon className="w-6 h-6 shrink-0" />
            <div>
              <p className="font-bold text-sm">{toastStyle.label}</p>
              <p className="text-xs font-medium opacity-90">{toast.msg}</p>
            </div>
          </div>
        </div>
      )}

      {/* INDICADOR OFFLINE */}
      {isOffline && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] animate-in slide-in-from-bottom-4 fade-in duration-300">
          <div className="bg-slate-800 dark:bg-ui-humo text-white px-5 py-3 rounded-2xl shadow-2xl flex items-center gap-3 border border-slate-700 dark:border-ui-border">
            <WifiOff className="w-4 h-4 text-brand-ambar shrink-0" />
            <span className="text-sm font-bold">Modo Offline</span>
            {pendingTasks > 0 && (
              <span className="bg-brand-ambar text-ui-obsidiana text-[10px] font-black px-2 py-0.5 rounded-full">
                {pendingTasks} pendiente{pendingTasks !== 1 ? 's' : ''}
              </span>
            )}
          </div>
        </div>
      )}

      {/* SIDEBAR */}
      {!isFullScreenRoute && (
        <aside className="w-64 bg-white dark:bg-ui-humo border-r border-slate-200 dark:border-ui-border flex flex-col h-full shadow-2xl z-20 flex-shrink-0 relative transition-colors duration-500">
          {/* Logo + Subtítulo de Empresa Dinámico */}
          <div className="px-5 py-6 border-b border-slate-200 dark:border-ui-border flex items-center justify-between">
            <div className="min-w-0 pr-2">
              <h1 className="text-2xl font-black font-syne text-slate-800 dark:text-brand-nacar tracking-tight">
                <span className="text-brand-amatista">Inv</span>Venta
              </h1>
              <p
                className="text-[10px] uppercase tracking-widest font-black text-slate-500 dark:text-ui-muted mt-0.5 truncate"
                title={configuracion?.nombre_empresa || 'Mi Restaurante'}
              >
                {configuracion?.nombre_empresa || 'Mi Restaurante'}
              </p>
            </div>
            <button
              onClick={() => setShowNotifications(!showNotifications)}
              className="relative p-1.5 rounded-lg text-slate-400 dark:text-ui-muted hover:bg-slate-100 dark:hover:bg-ui-obsidiana transition-colors"
            >
              <Bell
                className={`w-5 h-5 ${totalNotificaciones > 0 ? 'animate-pulse text-brand-ambar' : ''}`}
              />
              {totalNotificaciones > 0 && (
                <span className="absolute -top-1 -right-1 bg-brand-arrecife text-white text-[9px] font-black w-4 h-4 rounded-full flex items-center justify-center shadow-lg">
                  {totalNotificaciones}
                </span>
              )}
            </button>
          </div>

          {/* 🌟 BOTÓN LIMPIO DE CIERRE DE TURNO (solo con caja abierta Y rol que la gestiona) */}
          {turnoActivo && puedeCerrarCaja && (
            <div className="px-4 py-4 border-b border-slate-200 dark:border-ui-border bg-slate-50/50 dark:bg-ui-obsidiana/30">
              <button
                onClick={() => setShowCierreModal(true)}
                className="w-full py-2.5 px-4 bg-white dark:bg-ui-humo hover:bg-rose-50 dark:hover:bg-brand-arrecife/10 text-rose-600 dark:text-brand-arrecife border border-rose-200 dark:border-brand-arrecife/30 rounded-xl font-bold text-sm transition-colors flex items-center justify-center gap-2 shadow-sm"
              >
                <X className="w-4 h-4 shrink-0" />
                <span className="truncate">Cerrar Turno</span>
              </button>
            </div>
          )}

          {/* Panel de notificaciones */}
          {showNotifications && (
            <div className="absolute top-20 left-[260px] w-80 bg-white dark:bg-ui-humo rounded-3xl shadow-2xl border border-slate-200 dark:border-ui-border z-50 overflow-hidden animate-in slide-in-from-left-2 fade-in">
              <div className="bg-slate-50 dark:bg-ui-obsidiana p-4 flex justify-between items-center border-b border-slate-200 dark:border-ui-border">
                <h3 className="text-slate-800 dark:text-brand-nacar font-black">
                  Centro de Alertas
                </h3>
                <button
                  onClick={() => setShowNotifications(false)}
                  className="text-slate-400 hover:text-slate-600 dark:hover:text-brand-nacar"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="max-h-96 overflow-y-auto p-2 space-y-1">
                {totalNotificaciones === 0 ? (
                  <div className="p-8 text-center text-slate-400 dark:text-ui-muted">
                    <CheckCircle className="w-10 h-10 mx-auto mb-2 opacity-20" />
                    <p className="font-bold text-sm">Todo en orden</p>
                    <p className="text-xs">No hay alertas pendientes.</p>
                  </div>
                ) : (
                  <>
                    {verCobros &&
                      mesasCobrar.map((m) => (
                        <button
                          key={m.id}
                          onClick={() => {
                            navigate('/mesas');
                            setShowNotifications(false);
                          }}
                          className="w-full text-left p-3 hover:bg-slate-50 dark:hover:bg-ui-border rounded-xl transition-colors flex gap-3"
                        >
                          <div className="bg-brand-arrecife/20 p-2 rounded-lg h-fit text-brand-arrecife">
                            <CreditCard className="w-4 h-4" />
                          </div>
                          <div className="flex-1">
                            <p className="text-sm font-bold text-slate-800 dark:text-brand-nacar leading-tight">
                              Cobro Solicitado
                            </p>
                            <p className="text-xs text-brand-arrecife font-bold">
                              {m.nombre} está esperando la cuenta.
                            </p>
                          </div>
                        </button>
                      ))}
                    {verStock &&
                      stockCritico.map((p) => (
                        <button
                          key={p.id}
                          onClick={() => {
                            navigate('/compras');
                            setShowNotifications(false);
                          }}
                          className="w-full text-left p-3 hover:bg-slate-50 dark:hover:bg-ui-border rounded-xl transition-colors flex gap-3"
                        >
                          <div className="bg-brand-ambar/20 p-2 rounded-lg h-fit text-amber-600 dark:text-brand-ambar">
                            <AlertTriangle className="w-4 h-4" />
                          </div>
                          <div className="flex-1">
                            <p className="text-sm font-bold text-slate-800 dark:text-brand-nacar leading-tight">
                              Stock Crítico
                            </p>
                            <p className="text-xs text-amber-600 dark:text-brand-ambar font-bold">
                              {p.nombre} ({p.stock} {p.unidad} restante).
                            </p>
                          </div>
                        </button>
                      ))}
                    {verCompras &&
                      ordenesPendientes.map((o) => (
                        <button
                          key={o.id}
                          onClick={() => {
                            navigate('/recepcion');
                            setShowNotifications(false);
                          }}
                          className="w-full text-left p-3 hover:bg-slate-50 dark:hover:bg-ui-border rounded-xl transition-colors flex gap-3"
                        >
                          <div className="bg-brand-amatista/20 p-2 rounded-lg h-fit text-indigo-600 dark:text-brand-amatista">
                            <ShoppingCart className="w-4 h-4" />
                          </div>
                          <div className="flex-1">
                            <p className="text-sm font-bold text-slate-800 dark:text-brand-nacar leading-tight">
                              Orden Pendiente
                            </p>
                            <p className="text-xs text-indigo-600 dark:text-brand-amatista font-bold">
                              Folio {o.numero || o.folio} requiere recepción.
                            </p>
                          </div>
                        </button>
                      ))}
                    {verListos &&
                      pedidosListos.map((c) => (
                        <button
                          key={c.id}
                          onClick={() => {
                            navigate('/mesas');
                            setShowNotifications(false);
                          }}
                          className="w-full text-left p-3 hover:bg-slate-50 dark:hover:bg-ui-border rounded-xl transition-colors flex gap-3"
                        >
                          <div className="bg-brand-cesped/20 p-2 rounded-lg h-fit text-emerald-600 dark:text-brand-cesped">
                            <CheckCircle className="w-4 h-4" />
                          </div>
                          <div className="flex-1">
                            <p className="text-sm font-bold text-slate-800 dark:text-brand-nacar leading-tight">
                              Pedido listo
                            </p>
                            <p className="text-xs text-emerald-600 dark:text-brand-cesped font-bold">
                              {c.mesa_nombre || c.mesa || c.numero
                                ? `${c.mesa_nombre || c.mesa || 'Comanda ' + c.numero} lista para entregar.`
                                : `Comanda ${c.id} lista para entregar.`}
                            </p>
                          </div>
                        </button>
                      ))}
                  </>
                )}
              </div>
            </div>
          )}

          {/* Navegación */}
          <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-5 custom-scrollbar">
            {gruposVisibles.map((group, gi) => (
              <div key={gi}>
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-ui-muted mb-2 px-2">
                  {group.title}
                </p>
                <ul className="space-y-1">
                  {group.items.map((item, ii) => (
                    <li key={ii}>
                      <NavLink
                        to={item.path}
                        onClick={() => setShowNotifications(false)}
                        className={({ isActive }) =>
                          `flex items-center gap-3 px-3 py-2.5 rounded-xl font-bold text-sm transition-all ${
                            isActive
                              ? 'bg-brand-arrecife text-white shadow-lg shadow-brand-arrecife/20'
                              : 'text-slate-500 dark:text-ui-muted hover:bg-slate-50 dark:hover:bg-ui-border hover:text-slate-800 dark:hover:text-brand-nacar'
                          }`
                        }
                      >
                        <item.icon className="w-4 h-4 shrink-0" />
                        <span className="truncate">{item.label}</span>
                      </NavLink>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>

          {/* Footer: theme + perfil + logout */}
          <div className="px-3 py-4 border-t border-slate-200 dark:border-ui-border flex items-center gap-2 bg-slate-50/50 dark:bg-ui-obsidiana/30">
            <button
              onClick={toggleTheme}
              className="p-2.5 text-slate-400 dark:text-ui-muted hover:text-brand-ambar hover:bg-slate-100 dark:hover:bg-ui-border rounded-xl transition-all active:scale-95"
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
              className={({ isActive }) =>
                `flex-1 flex items-center gap-3 px-3 py-2 rounded-xl transition-all ${isActive ? 'bg-slate-100 dark:bg-ui-border' : 'hover:bg-slate-100 dark:hover:bg-ui-border'}`
              }
            >
              <div className="w-9 h-9 bg-brand-amatista rounded-xl flex items-center justify-center text-white font-black text-sm shrink-0 shadow-sm">
                {user?.nombre?.charAt(0).toUpperCase() ?? 'U'}
              </div>
              <div className="flex-1 min-w-0 hidden lg:block">
                <p className="text-sm font-bold text-slate-800 dark:text-brand-nacar leading-none truncate">
                  {user?.nombre ?? 'Usuario'}
                </p>
                <p className="text-[10px] text-slate-400 dark:text-ui-muted font-black uppercase tracking-widest mt-1 truncate">
                  @{user?.username ?? user?.rol ?? 'sin sesión'}
                </p>
              </div>
            </NavLink>

            <button
              onClick={() => {
                // CANDADO: un empleado con jornada ABIERTA (su último registro
                // de asistencia es 'entrada') no puede desloguearse sin checar
                // salida — y la salida tiene su propio candado de horas en el
                // checador (con autorización del Admin). Exentos: gestión.
                const { empleadoActivo } = useSessionStore.getState();
                const rolEmp = empleadoActivo?.rol || empleadoActivo?.puesto;
                const exento = ['Admin'].includes(rolEmp);
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
              className="p-2 text-slate-400 dark:text-ui-muted hover:text-rose-500 dark:hover:text-brand-arrecife hover:bg-rose-50 dark:hover:bg-brand-arrecife/10 rounded-xl transition-colors"
              title="Cerrar Sesión"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </aside>
      )}

      {/* CONTENIDO PRINCIPAL */}
      <main
        className={`flex-1 h-full overflow-y-auto bg-transparent relative ${isFullScreenRoute ? 'w-full' : ''}`}
        onClick={() => setShowNotifications(false)}
      >
        <Outlet />
      </main>

      {/* 🌟 MODAL GLOBAL DE CIERRE DE TURNO */}
      {showCierreModal && (
        <CierreTurnoModal onClose={() => setShowCierreModal(false)} />
      )}

      {/* MODAL: LOGOUT BLOQUEADO POR JORNADA ABIERTA */}
      {bloqueoSalida && (
        <div className="fixed inset-0 bg-slate-900/60 dark:bg-ui-obsidiana/80 backdrop-blur-sm flex items-center justify-center z-[200] p-4 animate-in fade-in">
          <div className="bg-white dark:bg-ui-humo rounded-[2.5rem] border border-slate-100 dark:border-ui-border p-8 shadow-2xl w-full max-w-sm flex flex-col text-center animate-in zoom-in-95">
            <div className="w-16 h-16 bg-amber-100 dark:bg-brand-ambar/20 text-amber-500 dark:text-brand-ambar rounded-full flex items-center justify-center mx-auto mb-4">
              <Clock className="w-8 h-8" />
            </div>
            <h3 className="font-black text-slate-800 dark:text-brand-nacar text-2xl mb-2 font-syne">
              Jornada abierta
            </h3>
            <p className="text-slate-500 dark:text-ui-muted text-sm font-medium mb-8">
              Tienes una <strong>entrada sin salida</strong> en el checador.
              Registra tu salida antes de cerrar sesión (si aún no cumples la
              jornada, el Admin puede autorizarla con su PIN).
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setBloqueoSalida(false)}
                className="flex-1 py-3.5 rounded-xl border-2 border-slate-200 dark:border-ui-border font-bold text-slate-500 dark:text-ui-muted hover:bg-slate-50 dark:hover:bg-ui-border transition-colors"
              >
                Seguir trabajando
              </button>
              <button
                onClick={() => {
                  setBloqueoSalida(false);
                  navigate('/checador');
                }}
                className="flex-1 py-3.5 rounded-xl bg-amber-500 dark:bg-brand-ambar hover:bg-amber-600 shadow-lg shadow-amber-500/30 font-black text-white dark:text-ui-obsidiana transition-transform active:scale-95"
              >
                Ir al checador
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL CERRAR SESIÓN */}
      {confirmLogout && (
        <div className="fixed inset-0 bg-slate-900/60 dark:bg-ui-obsidiana/80 backdrop-blur-sm flex items-center justify-center z-[200] p-4 animate-in fade-in">
          <div className="bg-white dark:bg-ui-humo rounded-[2.5rem] border border-slate-100 dark:border-ui-border p-8 shadow-2xl w-full max-w-sm flex flex-col text-center animate-in zoom-in-95">
            <div className="w-16 h-16 bg-rose-100 dark:bg-brand-arrecife/20 text-rose-500 dark:text-brand-arrecife rounded-full flex items-center justify-center mx-auto mb-4">
              <LogOut className="w-8 h-8 ml-1" />
            </div>
            <h3 className="font-black text-slate-800 dark:text-brand-nacar text-2xl mb-2 font-syne">
              ¿Cerrar sesión?
            </h3>
            <p className="text-slate-500 dark:text-ui-muted text-sm font-medium mb-8">
              Tu sesión actual se cerrará y tendrás que volver a ingresar tus
              credenciales.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmLogout(false)}
                className="flex-1 py-3.5 rounded-xl border-2 border-slate-200 dark:border-ui-border font-bold text-slate-500 dark:text-ui-muted hover:bg-slate-50 dark:hover:bg-ui-border hover:text-slate-800 dark:hover:text-brand-nacar transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleLogout}
                className="flex-1 py-3.5 rounded-xl bg-rose-500 hover:bg-rose-600 dark:bg-brand-arrecife dark:hover:bg-orange-600 shadow-lg shadow-rose-500/30 dark:shadow-brand-arrecife/30 font-black text-white transition-transform active:scale-95"
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
