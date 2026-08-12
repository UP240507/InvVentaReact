// ─── TOPBAR ADMIN (Proyecto D · tandas 2-3) ──────────────────────────────────
// Franja superior del shell editorial: colapsar sidebar, ubicación actual,
// disparador de la búsqueda y centro de alertas.
//
// Tanda 3: el buscador inline con su propio dropdown SE FUE. Ahora este control
// abre la command palette (Ctrl+K), que hace lo mismo y además ejecuta acciones.
// Mantener dos buscadores con dos comportamientos de teclado era duplicidad
// pura; el motor (lib/BuscadorGlobal) siempre fue el mismo.
//
// El centro de alertas se MUDÓ aquí desde el sidebar en la tanda 2: con el
// sidebar colapsado a 56px no cabía la campana, y una alerta de cobro no puede
// depender de que la barra esté expandida.

import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Search,
  PanelLeftClose,
  PanelLeftOpen,
  Bell,
  X,
  CheckCircle,
  CreditCard,
  AlertTriangle,
  ShoppingCart,
  User,
} from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { useShellStore } from '../store/useShellStore';
import { usePermisos } from '../hooks/usePermisos';
import { tituloDeRuta, grupoDeRuta } from '../lib/Navegacion';
import { useAcoplado } from '../hooks/useAcoplado';
import { useAuthStore } from '../features/auth/useAuthStore';
import { useSessionStore } from '../store/useSessionStore';

// Estados de comanda que cuentan como "lista para entregar" (mismo criterio que
// tenía el sidebar; si cambia el flujo del KDS, se cambia en un solo lugar).
const ESTADOS_LISTOS = ['lista', 'listo', 'preparada', 'para_entregar'];

export default function Topbar() {
  const navigate = useNavigate();
  const location = useLocation();

  const sidebarColapsado = useShellStore((s) => s.sidebarColapsado);
  const toggleSidebar = useShellStore((s) => s.toggleSidebar);
  const abrirPalette = useShellStore((s) => s.abrirBuscador);

  const { flag } = usePermisos();
  const acoplado = useAcoplado();

  const mesas = useAppStore((s) => s.mesas);
  const productos = useAppStore((s) => s.productos);
  const ordenesCompra = useAppStore((s) => s.ordenesCompra);
  const comandasActivas = useAppStore((s) => s.comandas_activas);

  const [verAlertas, setVerAlertas] = useState(false);

  // ── QUIÉN ESTÁ USANDO ESTE TELÉFONO ──────────────────────────────────────
  // En el teléfono NO había forma de cerrar sesión. El logout vive en el pie
  // del riel de escritorio, y ese riel sólo se renderiza con pantalla ancha
  // (`SidebarLayout`), así que en móvil quedaba inalcanzable: la barra de
  // pestañas no lo trae y `/perfil` no está en el catálogo de navegación.
  //
  // El botón lleva a Perfil y NO llama a `logout()` directamente. Es
  // deliberado: el logout de `PerfilScreen` pasa por el candado de jornada
  // —quien no ha cumplido sus horas necesita autorización— y un botón que
  // llamara al logout a pelo sería la puerta de atrás que ese candado cierra
  // por delante. Mismo criterio que la reapertura de cuenta con PIN.
  //
  // Al final del turno esto no hace falta: marcar salida en el checador ya
  // cierra la sesión del empleado. Esto cubre lo demás — pasarle el teléfono a
  // un compañero a media jornada, o corregir un inicio de sesión equivocado.
  const { user } = useAuthStore();
  const empleadoActivo = useSessionStore((s) => s.empleadoActivo);
  const quien = empleadoActivo?.nombre || user?.nombre || '';
  const iniciales = quien
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase();

  // ── Centro de alertas (mismas reglas de rol que tenía el sidebar) ──────────
  const esGestion = flag('gestion');
  const verCobros = esGestion || flag('abre_caja');
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
  const pedidosListos = (comandasActivas || []).filter((c) =>
    ESTADOS_LISTOS.includes(c?.estado),
  );

  const totalNotificaciones =
    (verCobros ? mesasCobrar.length : 0) +
    (verStock ? stockCritico.length : 0) +
    (verCompras ? ordenesPendientes.length : 0) +
    (verListos ? pedidosListos.length : 0);

  const grupo = grupoDeRuta(location.pathname);
  const titulo = tituloDeRuta(location.pathname);

  const alerta = (key, Icono, tono, titular, detalle, ruta) => (
    <button
      key={key}
      onClick={() => {
        navigate(ruta);
        setVerAlertas(false);
      }}
      className="w-full text-left p-3 rounded-ui hover:bg-adm-bg transition-colors flex gap-3"
    >
      <div className={`p-2 rounded-ui h-fit shrink-0 ${tono}`}>
        <Icono className="w-4 h-4" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-adm-ink leading-tight">
          {titular}
        </p>
        <p className="text-xs text-adm-muted font-medium truncate">{detalle}</p>
      </div>
    </button>
  );

  return (
    <header className="h-14 shrink-0 bg-adm-panel border-b border-adm-border flex items-center gap-3 px-3 font-figtree relative z-30">
      {/* Colapsar / expandir sidebar. Sin riel que colapsar no pinta nada, y en
          un teléfono ese botón ocupa la esquina donde debería estar el título. */}
      {acoplado && (
        <button
          onClick={toggleSidebar}
          title={
            sidebarColapsado
              ? 'Expandir menú (Ctrl+B)'
              : 'Colapsar menú (Ctrl+B)'
          }
          aria-label={sidebarColapsado ? 'Expandir menú' : 'Colapsar menú'}
          className="p-2 rounded-ui text-adm-muted hover:text-adm-ink hover:bg-adm-bg transition-colors shrink-0"
        >
          {sidebarColapsado ? (
            <PanelLeftOpen className="w-5 h-5" />
          ) : (
            <PanelLeftClose className="w-5 h-5" />
          )}
        </button>
      )}

      {/* Ubicación actual.
          Estaba en `hidden md:block`, o sea que en un teléfono el Topbar no
          decía dónde estabas y cada pantalla tenía que repetirlo por su cuenta
          — con su icono, su título y su subtítulo, unos 90 px de alto en la
          pantalla donde menos sobra.
          Ahora se ve SIEMPRE, y son las pantallas las que callan cuando no hay
          ancho. El título lo dice el chasis una vez, no cada pantalla. */}
      <div className="min-w-0 flex-1 lg:flex-none">
        {grupo && (
          <p className="text-[10px] uppercase tracking-[0.2em] font-bold text-adm-muted leading-none">
            {grupo}
          </p>
        )}
        <h2 className="font-fraunces font-bold text-adm-ink text-lg leading-tight truncate">
          {titulo}
        </h2>
      </div>

      {/* Disparador de la palette. Es un BOTÓN con pinta de campo: si fuera un
          input real, el usuario teclearía aquí y en el cuadro de Ctrl+K, con
          dos comportamientos distintos para la misma intención. */}
      {/* Sin ancho se queda en icono. El rótulo largo —«Buscar mesa,
          ingrediente, receta, proveedor…»— nunca cupo en un teléfono: salía
          cortado a media palabra y encima empujaba al título fuera de la barra.
          Un campo que no puede enseñar su propio texto no está informando de
          nada, sólo ocupando. */}
      <button
        onClick={abrirPalette}
        aria-label="Buscar o ejecutar una acción (Ctrl+K)"
        className={`flex items-center gap-2 h-9 rounded-ui border border-adm-border bg-adm-bg text-left hover:border-adm-accent transition-colors ${
          acoplado
            ? 'flex-1 max-w-xl mx-auto px-3'
            : 'w-9 justify-center shrink-0 ml-auto'
        }`}
      >
        <Search className="w-4 h-4 text-adm-muted shrink-0" />
        {acoplado && (
          <>
            <span className="flex-1 text-sm text-adm-muted truncate">
              Buscar mesa, ingrediente, receta, proveedor…
            </span>
            <kbd className="hidden lg:inline text-[10px] font-bold text-adm-muted border border-adm-border rounded-ui px-1.5 py-0.5 shrink-0">
              Ctrl K
            </kbd>
          </>
        )}
      </button>

      {/* ── QUIÉN ESTÁ DENTRO, Y LA SALIDA ── */}
      {quien && (
        <button
          onClick={() => navigate('/perfil')}
          aria-label={`${quien} — abrir perfil y cerrar sesión`}
          title={`${quien} — perfil y cerrar sesión`}
          className="shrink-0 flex items-center gap-2 h-9 pl-1 pr-2 rounded-ui hover:bg-adm-bg transition-colors"
        >
          <span className="w-7 h-7 rounded-full bg-adm-accent/15 text-adm-accent grid place-items-center text-[11px] font-black">
            {iniciales || <User className="w-4 h-4" />}
          </span>
          {/* El nombre sólo con sitio: en un teléfono el ancho es para el
              trabajo, y las iniciales ya identifican a quien tiene el aparato
              en la mano. El nombre completo sigue disponible para el lector de
              pantalla y al posar el cursor. */}
          {acoplado && (
            <span className="text-sm font-bold text-adm-ink truncate max-w-32">
              {quien}
            </span>
          )}
        </button>
      )}

      {/* ── CENTRO DE ALERTAS ── */}
      <div className="relative shrink-0">
        <button
          onClick={() => setVerAlertas((v) => !v)}
          aria-label={`Alertas${totalNotificaciones ? ` (${totalNotificaciones})` : ''}`}
          className="relative p-2 rounded-ui text-adm-muted hover:text-adm-ink hover:bg-adm-bg transition-colors"
        >
          <Bell
            className={`w-5 h-5 ${totalNotificaciones > 0 ? 'text-adm-accent' : ''}`}
          />
          {totalNotificaciones > 0 && (
            <span className="absolute top-0.5 right-0.5 bg-adm-danger text-adm-accent-fg text-[9px] font-bold min-w-4 h-4 px-1 rounded-full flex items-center justify-center">
              {totalNotificaciones}
            </span>
          )}
        </button>

        {verAlertas && (
          <div className="absolute right-0 top-12 w-80 bg-adm-panel border border-adm-border rounded-ui shadow-2xl overflow-hidden animate-in fade-in slide-in-from-top-1 duration-media">
            <div className="bg-adm-bg px-4 py-3 flex justify-between items-center border-b border-adm-border">
              <h3 className="text-adm-ink font-bold font-fraunces">
                Centro de Alertas
              </h3>
              <button
                onClick={() => setVerAlertas(false)}
                className="text-adm-muted hover:text-adm-ink"
                aria-label="Cerrar alertas"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="max-h-96 overflow-y-auto p-2 space-y-1 custom-scrollbar">
              {totalNotificaciones === 0 ? (
                <div className="p-8 text-center text-adm-muted">
                  <CheckCircle className="w-10 h-10 mx-auto mb-2 opacity-30" />
                  <p className="font-bold text-sm text-adm-ink">
                    Todo en orden
                  </p>
                  <p className="text-xs">No hay alertas pendientes.</p>
                </div>
              ) : (
                <>
                  {verCobros &&
                    mesasCobrar.map((m) =>
                      alerta(
                        `cobro-${m.id}`,
                        CreditCard,
                        'bg-adm-danger/10 text-adm-danger',
                        'Cobro solicitado',
                        `${m.nombre} está esperando la cuenta.`,
                        '/mesas',
                      ),
                    )}
                  {verStock &&
                    stockCritico.map((p) =>
                      alerta(
                        `stock-${p.id}`,
                        AlertTriangle,
                        'bg-adm-accent/10 text-adm-accent',
                        'Stock crítico',
                        `${p.nombre} (${p.stock} ${p.unidad || ''} restante).`,
                        '/compras',
                      ),
                    )}
                  {verCompras &&
                    ordenesPendientes.map((o) =>
                      alerta(
                        `oc-${o.id}`,
                        ShoppingCart,
                        'bg-adm-chip text-adm-chip-fg',
                        'Orden pendiente',
                        `Folio ${o.numero || o.folio} requiere recepción.`,
                        '/recepcion',
                      ),
                    )}
                  {verListos &&
                    pedidosListos.map((c) =>
                      alerta(
                        `listo-${c.id}`,
                        CheckCircle,
                        'bg-adm-ok/10 text-adm-ok',
                        'Pedido listo',
                        `${c.mesa_nombre || c.mesa || `Comanda ${c.numero || c.id}`} lista para entregar.`,
                        '/mesas',
                      ),
                    )}
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </header>
  );
}
