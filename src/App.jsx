import { useEffect } from 'react';
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  Outlet,
  useLocation,
} from 'react-router-dom';
import { useAppStore } from './store/useAppStore';
import { useAuthStore } from './features/auth/useAuthStore';
import { useSessionStore } from './store/useSessionStore';
import { useNetworkListener } from './hooks/useNetworkListener';
import { getCapacidades, tieneFlag } from './lib/Permisos';

import SidebarLayout from './components/SidebarLayout';

import LoginScreen from './features/auth/LoginScreen';
import RelojChecadorScreen from './features/rh/RelojChecadorScreen';
import EsperaScreen from './features/operacion/EsperaScreen';

import PaywallScreen from './features/suscripciones/PaywallScreen';
import BillingScreen from './features/suscripciones/BillingScreen';

import PerfilScreen from './features/auth/PerfilScreen';
import DashboardScreen from './features/dashboard/DashboardScreen';
import MesasScreen from './features/operacion/MesasScreen';
import PosScreen from './features/pos/PosScreen';
import KdsScreen from './features/kds/KdsScreen';
import PropineroScreen from './features/operacion/PropineroScreen';
import RecetasScreen from './features/catalogos/RecetasScreen';
import ModificadoresScreen from './features/catalogos/ModificadoresScreen';
import IngredientesScreen from './features/catalogos/IngredientesScreen';
import ComprasScreen from './features/compras/ComprasScreen';
import RecepcionScreen from './features/compras/RecepcionScreen';
import MermasScreen from './features/inventario/MermasScreen';
import ProveedoresScreen from './features/inventario/ProveedoresScreen';
import EmpleadosScreen from './features/rh/EmpleadosScreen';
import NominasScreen from './features/rh/NominasScreen';
import PermisosScreen from './features/rh/PermisosScreen';
import ClientesScreen from './features/crm/ClientesScreen';
import ReportesScreen from './features/analisis/ReportesScreen';
import FacturasScreen from './features/analisis/FacturasScreen';
import ConfiguracionScreen from './features/ajustes/ConfiguracionScreen';
import AuditoriaScreen from './features/ajustes/AuditoriaScreen';
import ZonasImpresionScreen from './features/ajustes/ZonasImpresionScreen';
import LoginEmpleadoScreen from './features/auth/LoginEmpleadosScreen';

import EscritorioTest from './views/EscritorioTest';

// ─── GUARDS DE NAVEGACIÓN ──────────────────────────────────────────────────

function AdminRoute() {
  const user = useAuthStore((s) => s.user);
  const authLoading = useAuthStore((s) => s.isLoading);
  if (authLoading) return null;
  return user ? <Outlet /> : <Navigate to="/login" replace />;
}

function SuscripcionRoute() {
  const suscripcion = useAuthStore((s) => s.suscripcion);
  const authLoading = useAuthStore((s) => s.isLoading);
  if (authLoading) return null;

  const hoy = new Date();
  const vencimiento = suscripcion?.fecha_vencimiento
    ? new Date(suscripcion.fecha_vencimiento)
    : null;
  const diasGracia = suscripcion?.dias_gracia ?? 3;
  const vigente = vencimiento
    ? hoy <= new Date(vencimiento.getTime() + diasGracia * 86400000)
    : false;

  if (!vigente) return <Navigate to="/paywall" replace />;
  return <Outlet />;
}

function EmpleadoRoute() {
  const { empleadoActivo, puedeAcceder, getRutaInicial } = useSessionStore();
  const { user } = useAuthStore();
  const rolesPermisos = useAppStore((s) => s.roles_permisos);
  const location = useLocation();

  // (Proyecto L) shell de administración por FLAG, no por nombre de rol
  const rolAdmin = tieneFlag(
    getCapacidades(user?.rol, rolesPermisos),
    'gestion',
  );
  if (rolAdmin) return <Outlet />;

  if (!empleadoActivo) return <Navigate to="/checador" replace />;

  // Si no tiene permiso, lo mandamos a SU ruta principal, no al perfil general
  if (!puedeAcceder(location.pathname)) {
    return <Navigate to={getRutaInicial()} replace />;
  }

  return <Outlet />;
}

function TurnoRoute() {
  const { hayTurnoActivo } = useSessionStore();
  const { user } = useAuthStore();
  const rolesPermisos = useAppStore((s) => s.roles_permisos);

  // Reactividad para expulsar meseros en tiempo real si cierran la caja
  useAppStore((s) => s.turnos);

  if (tieneFlag(getCapacidades(user?.rol, rolesPermisos), 'exento_turno'))
    return <Outlet />;
  return hayTurnoActivo() ? <Outlet /> : <Navigate to="/espera" replace />;
}

// Enrutador inteligente para la ruta raíz "/"
function RootRedirect() {
  const { user } = useAuthStore();
  const { getRutaInicial } = useSessionStore();
  const rolesPermisos = useAppStore((s) => s.roles_permisos);

  const capUser = getCapacidades(user?.rol, rolesPermisos);
  if (tieneFlag(capUser, 'gestion')) {
    return <Navigate to={capUser.ruta_inicial || '/dashboard'} replace />;
  }
  return <Navigate to={getRutaInicial()} replace />;
}

// ─── APLICACIÓN PRINCIPAL ──────────────────────────────────────────────────

export default function App() {
  useNetworkListener();

  const checkSession = useAuthStore((s) => s.checkSession);
  const authLoading = useAuthStore((s) => s.isLoading);
  const dataLoading = useAppStore((s) => s.isLoading);

  useEffect(() => {
    const isDark =
      localStorage.getItem('theme') === 'dark' ||
      (!('theme' in localStorage) &&
        window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.classList.toggle('dark', isDark);
    // (Proyecto D) adelantar el tema de color del tenant sin esperar el fetch
    const temaC = localStorage.getItem('tema_color');
    if (temaC && temaC !== 'terracota') {
      document.documentElement.dataset.tema = temaC;
    }
  }, []);

  useEffect(() => {
    if (checkSession) checkSession();
  }, [checkSession]);

  return (
    <div className="bg-slate-100 dark:bg-ui-obsidiana min-h-screen transition-colors duration-500 font-sans">
      {(authLoading || dataLoading) && (
        <div className="fixed inset-0 z-[999] bg-slate-100 dark:bg-ui-obsidiana flex flex-col items-center justify-center transition-colors duration-500">
          <div className="w-12 h-12 border-4 border-brand-arrecife border-t-transparent rounded-full animate-spin mb-4" />
          <h2 className="text-xl font-bold font-syne tracking-widest uppercase text-slate-800 dark:text-brand-nacar">
            Cargando Contenido...
          </h2>
        </div>
      )}

      <BrowserRouter>
        <Routes>
          {/* ─── RUTAS PÚBLICAS (sin sesión) ─── */}
          {/* El login del empleado DEBE ser público: el empleado llega a su */}
          {/* dispositivo sin sesión. Si estuviera tras AdminRoute, sin user */}
          {/* lo rebotaría a /login (el del admin) y nunca renderizaría. */}
          <Route path="/login" element={<LoginScreen />} />
          <Route path="/loginempleados" element={<LoginEmpleadoScreen />} />
          <Route path="/checador" element={<RelojChecadorScreen />} />
          <Route path="/espera" element={<EsperaScreen />} />

          <Route element={<AdminRoute />}>
            <Route path="/paywall" element={<PaywallScreen />} />

            <Route element={<SuscripcionRoute />}>
              <Route element={<SidebarLayout />}>
                <Route element={<EmpleadoRoute />}>
                  <Route path="/perfil" element={<PerfilScreen />} />
                  <Route
                    path="/asistencias"
                    element={<RelojChecadorScreen />}
                  />

                  <Route element={<TurnoRoute />}>
                    <Route path="/mesas" element={<MesasScreen />} />
                    <Route path="/pos" element={<PosScreen />} />
                    <Route path="/propinas" element={<PropineroScreen />} />
                    <Route path="/kds" element={<KdsScreen />} />
                  </Route>

                  <Route path="/dashboard" element={<DashboardScreen />} />
                  <Route path="/recetas" element={<RecetasScreen />} />
                  <Route
                    path="/modificadores"
                    element={<ModificadoresScreen />}
                  />
                  <Route
                    path="/ingredientes"
                    element={<IngredientesScreen />}
                  />
                  <Route path="/compras" element={<ComprasScreen />} />
                  <Route path="/recepcion" element={<RecepcionScreen />} />
                  <Route path="/mermas" element={<MermasScreen />} />
                  <Route path="/proveedores" element={<ProveedoresScreen />} />
                  <Route path="/empleados" element={<EmpleadosScreen />} />
                  <Route path="/nominas" element={<NominasScreen />} />
                  <Route path="/permisos" element={<PermisosScreen />} />
                  <Route path="/clientes" element={<ClientesScreen />} />
                  <Route path="/reportes" element={<ReportesScreen />} />
                  <Route path="/facturas" element={<FacturasScreen />} />
                  <Route path="/mi-plan" element={<BillingScreen />} />
                  <Route
                    path="/zonas-produccion"
                    element={<ZonasImpresionScreen />}
                  />
                  <Route path="/auditoria" element={<AuditoriaScreen />} />
                  <Route
                    path="/configuracion"
                    element={<ConfiguracionScreen />}
                  />
                </Route>

                <Route path="/" element={<RootRedirect />} />
                <Route
                  path="/inventario"
                  element={<Navigate to="/ingredientes" replace />}
                />
                <Route path="*" element={<RootRedirect />} />
              </Route>
            </Route>
          </Route>
          <Route path="/escritorio-test" element={<EscritorioTest />} />
        </Routes>
      </BrowserRouter>
    </div>
  );
}
