// ─── CATÁLOGO DE NAVEGACIÓN (Proyecto D · tanda 2) ───────────────────────────
// Vivía embebido en SidebarLayout. Se extrae porque ahora tiene TRES consumidores:
// el sidebar, el buscador global del topbar y —en la tanda 3— el Ctrl+K y los
// Ctrl+1..9. Una sola fuente evita que el menú y la paleta se desincronicen.
//
// Contrato de cada ítem:
//   path   ruta de react-router (también la llave del gate de permisos)
//   icon   componente lucide
//   label  el nombre real del módulo
//   carta  su nombre de lotería (Chris, 21-nov): el rótulo con que se reconoce
//          el lugar en todo el sistema, siempre con `label` debajo para no
//          perder el hilo
//   numero el de su carta. Fijo a propósito: si mañana entra un módulo a media
//          lista, ninguno cambia de número
//   modulo (opcional) módulo premium: exige plan/addon vigente además del permiso
//
// La carta es el RÓTULO; `label` es el texto de trabajo. Lo que se registra o
// se exporta (auditoría, reportes, errores, avisos) sigue con el nombre real:
// «falló al guardar en El Bote» no le dice nada a un contador.

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
    items: [
      {
        path: '/dashboard',
        icon: LayoutDashboard,
        label: 'Dashboard',
        carta: 'La Tabla',
        numero: 1,
      },
    ],
  },
  {
    title: 'Operación',
    items: [
      {
        path: '/mesas',
        icon: Utensils,
        label: 'Mapa de Mesas',
        carta: 'La Mesa',
        numero: 2,
      },
      {
        path: '/pos',
        icon: MonitorSmartphone,
        label: 'Punto de Venta',
        carta: 'La Caja',
        numero: 3,
      },
      {
        path: '/kds',
        icon: MonitorPlay,
        label: 'Monitor Cocina',
        carta: 'El Comal',
        numero: 4,
      },
      {
        path: '/propinas',
        icon: Coins,
        label: 'Propinero',
        carta: 'El Cochinito',
        numero: 5,
      },
    ],
  },
  {
    title: 'Catálogos',
    items: [
      {
        path: '/recetas',
        icon: ChefHat,
        label: 'Recetas',
        carta: 'El Recetario',
        numero: 6,
      },
      {
        path: '/modificadores',
        icon: ListPlus,
        label: 'Modificadores',
        carta: 'La Salsa',
        numero: 7,
      },
      {
        path: '/ingredientes',
        icon: Package,
        label: 'Ingredientes',
        carta: 'La Canasta',
        numero: 8,
      },
    ],
  },
  {
    title: 'Compras y Almacén',
    items: [
      {
        path: '/compras',
        icon: ShoppingCart,
        label: 'Órdenes de Compra',
        carta: 'El Mandado',
        numero: 9,
      },
      {
        path: '/recepcion',
        icon: ClipboardCheck,
        label: 'Recepción',
        carta: 'El Diablito',
        numero: 10,
      },
      {
        path: '/mermas',
        icon: Trash2,
        label: 'Ajustes y Mermas',
        carta: 'El Bote',
        numero: 11,
      },
      {
        path: '/proveedores',
        icon: Truck,
        label: 'Proveedores',
        carta: 'El Marchante',
        numero: 12,
      },
      {
        path: '/gastos',
        icon: Wallet,
        label: 'Gastos y Costos',
        carta: 'La Cartera',
        numero: 13,
      },
    ],
  },
  {
    title: 'Equipo y Clientes',
    items: [
      {
        path: '/empleados',
        icon: Users,
        label: 'Staff',
        carta: 'El Mandil',
        numero: 14,
      },
      {
        path: '/asistencias',
        icon: Clock,
        label: 'Reloj Checador',
        carta: 'El Reloj',
        numero: 15,
      },
      {
        path: '/nominas',
        icon: Coins,
        label: 'Nóminas',
        carta: 'La Raya',
        numero: 16,
      },
      {
        path: '/permisos',
        icon: ShieldCheck,
        label: 'Roles y Permisos',
        carta: 'La Llave',
        numero: 17,
      },
      {
        path: '/clientes',
        icon: HeartHandshake,
        label: 'CRM',
        carta: 'El Comensal',
        numero: 18,
        modulo: 'lealtad',
      },
    ],
  },
  {
    title: 'Análisis',
    items: [
      {
        path: '/reportes',
        icon: FileBarChart,
        label: 'Reportes',
        carta: 'La Libreta',
        numero: 19,
      },
      {
        path: '/facturas',
        icon: FileText,
        label: 'Facturación CFDI',
        carta: 'El Sello',
        numero: 20,
        modulo: 'cfdi',
      },
    ],
  },
  {
    title: 'Sistema',
    items: [
      {
        path: '/zonas-produccion',
        icon: Printer,
        label: 'Zonas de impresión',
        carta: 'La Comanda',
        numero: 21,
      },
      // Separado de "Zonas de impresión" a propósito: aquélla responde "a qué
      // estación va cada categoría" (catálogo), ésta "por dónde salen los
      // bytes y qué pasó con lo que no salió" (hardware). Juntarlas mezcla una
      // decisión de menú con un diagnóstico de red.
      {
        path: '/hub',
        icon: Server,
        label: 'Hub e impresora',
        carta: 'La Antena',
        numero: 22,
      },
      {
        path: '/auditoria',
        icon: ShieldCheck,
        label: 'Auditoría',
        carta: 'El Ojo',
        numero: 23,
      },
      {
        path: '/configuracion',
        icon: Settings,
        label: 'Configuración',
        carta: 'El Engrane',
        numero: 24,
      },
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

// ── Pantallas SIN riel lateral (Proyecto D) ──────────────────────────────────
// `SidebarLayout` se aparta en estas rutas para dejar la pantalla entera a la
// operación. La consecuencia, que costó un encierro descubrir: **en ellas el
// menú no existe, así que la propia pantalla es la única que puede ofrecer una
// salida**. Si mañana se agrega una tercera, agrégala aquí y `Escape.test.js`
// exigirá que tenga salida para todos los roles antes de dejar pasar la suite.
export const RUTAS_PANTALLA_COMPLETA = ['/pos', '/kds'];

export function esPantallaCompleta(path) {
  const limpio = (path || '').replace(/\/+$/, '') || '/';
  return RUTAS_PANTALLA_COMPLETA.includes(limpio);
}

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

/**
 * La carta de lotería de una ruta: `{ numero, nombre, modulo }`, o `null` si la
 * ruta no está en el menú (perfil, plan…), que se titula como siempre.
 */
export function cartaDeRuta(path) {
  const limpio = (path || '').replace(/\/+$/, '') || '/';
  const item = MENU_ITEMS.find((i) => i.path === limpio);
  return item
    ? { numero: item.numero, nombre: item.carta, modulo: item.label }
    : null;
}
