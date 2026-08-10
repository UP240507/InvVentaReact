// ─── CATÁLOGO DE NAVEGACIÓN (Proyecto D · tanda 2) ───────────────────────────
// Vivía embebido en SidebarLayout. Se extrae porque ahora tiene TRES consumidores:
// el sidebar, el buscador global del topbar y —en la tanda 3— el Ctrl+K y los
// Ctrl+1..9. Una sola fuente evita que el menú y la paleta se desincronicen.
//
// Contrato de cada ítem:
//   path   ruta de react-router (también la llave del gate de permisos)
//   icon   componente lucide
//   label  texto visible
//   modulo (opcional) módulo premium: exige plan/addon vigente además del permiso

import {
  LayoutDashboard,
  Utensils,
  MonitorSmartphone,
  MonitorPlay,
  Coins,
  ChefHat,
  ListPlus,
  Package,
  ShoppingCart,
  ClipboardCheck,
  Wallet,
  Trash2,
  Truck,
  Users,
  Clock,
  ShieldCheck,
  HeartHandshake,
  FileBarChart,
  FileText,
  Printer,
  Server,
  Settings,
} from 'lucide-react';

export const MENU_GRUPOS = [
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
      { path: '/gastos', icon: Wallet, label: 'Gastos y Costos' },
    ],
  },
  {
    title: 'Equipo y Clientes',
    items: [
      { path: '/empleados', icon: Users, label: 'Staff' },
      { path: '/asistencias', icon: Clock, label: 'Reloj Checador' },
      { path: '/nominas', icon: Coins, label: 'Nóminas' },
      { path: '/permisos', icon: ShieldCheck, label: 'Roles y Permisos' },
      {
        path: '/clientes',
        icon: HeartHandshake,
        label: 'CRM',
        modulo: 'lealtad',
      },
    ],
  },
  {
    title: 'Análisis',
    items: [
      { path: '/reportes', icon: FileBarChart, label: 'Reportes' },
      {
        path: '/facturas',
        icon: FileText,
        label: 'Facturación CFDI',
        modulo: 'cfdi',
      },
    ],
  },
  {
    title: 'Sistema',
    items: [
      { path: '/zonas-produccion', icon: Printer, label: 'Zonas de impresión' },
      // Separado de "Zonas de impresión" a propósito: aquélla responde "a qué
      // estación va cada categoría" (catálogo), ésta "por dónde salen los
      // bytes y qué pasó con lo que no salió" (hardware). Juntarlas mezcla una
      // decisión de menú con un diagnóstico de red.
      { path: '/hub', icon: Server, label: 'Hub e impresora' },
      { path: '/auditoria', icon: ShieldCheck, label: 'Auditoría' },
      { path: '/configuracion', icon: Settings, label: 'Configuración' },
    ],
  },
];

// Plano, para búsquedas y para el orden de los Ctrl+1..9 de la tanda 3.
export const MENU_ITEMS = MENU_GRUPOS.flatMap((g) =>
  g.items.map((it) => ({ ...it, grupo: g.title })),
);

// Rutas que existen pero NO están en el menú (se llega por otro lado). El topbar
// igual necesita saber cómo titularlas.
const RUTAS_EXTRA = {
  '/perfil': 'Mi perfil',
  '/mi-plan': 'Mi plan',
  '/paywall': 'Suscripción',
  '/inventario': 'Inventario',
};

// ── Superficie por ruta (Proyecto D) ─────────────────────────────────────────
// El híbrido se decide AQUÍ, no dentro de cada pantalla: operación conserva la
// paleta industrial (obsidiana/cesped/arrecife, targets grandes) y todo lo demás
// vive en el editorial adm-*. Mover una ruta de superficie = editar esta lista.
export const RUTAS_OPERACION = [
  '/mesas',
  '/pos',
  '/kds',
  '/propinas',
  '/espera',
  '/checador',
  '/loginempleados',
];

export function esRutaOperacion(path) {
  const limpio = (path || '').replace(/\/+$/, '') || '/';
  return RUTAS_OPERACION.includes(limpio);
}

/** Título legible de una ruta, para el encabezado del topbar. */
export function tituloDeRuta(path) {
  const limpio = (path || '').replace(/\/+$/, '') || '/';
  const item = MENU_ITEMS.find((i) => i.path === limpio);
  if (item) return item.label;
  return RUTAS_EXTRA[limpio] || 'InvVenta';
}

/** Grupo al que pertenece la ruta (breadcrumb de un solo nivel). */
export function grupoDeRuta(path) {
  const limpio = (path || '').replace(/\/+$/, '') || '/';
  return MENU_ITEMS.find((i) => i.path === limpio)?.grupo || '';
}

/**
 * Filtra el menú por capacidades del rol Y por módulos premium contratados.
 * Mismo criterio que usa el guard de rutas: si aquí aparece, se puede abrir.
 *
 * @param {(ruta:string)=>boolean} puedeVerRuta   de usePermisos / lib/Permisos
 * @param {(modulo:string)=>boolean} tieneModulo  de usePlan
 */
export function gruposVisibles(puedeVerRuta, tieneModulo) {
  return MENU_GRUPOS.map((g) => ({
    ...g,
    items: g.items.filter(
      (it) => puedeVerRuta(it.path) && (!it.modulo || tieneModulo(it.modulo)),
    ),
  })).filter((g) => g.items.length > 0);
}

/** Versión plana del anterior — la consumen el buscador y (pronto) Ctrl+1..9. */
export function itemsVisibles(puedeVerRuta, tieneModulo) {
  return gruposVisibles(puedeVerRuta, tieneModulo).flatMap((g) =>
    g.items.map((it) => ({ ...it, grupo: g.title })),
  );
}
