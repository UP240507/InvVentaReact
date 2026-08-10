// ─── ACCIONES RÁPIDAS DE LA PALETTE (Proyecto D · tanda 3) ───────────────────
// Catálogo de lo que se puede HACER desde Ctrl+K, además de navegar y buscar.
// Puro: recibe un contexto con banderas y callbacks, devuelve la lista visible.
// Sin React aquí, para que el filtrado por rol se pueda testear en frío.
//
// REGLA DE SEGURIDAD: cada acción declara su `visible(ctx)`. Que un rol no vea
// el botón "Cerrar turno" en la UI no basta — la palette es otra puerta de
// entrada y tiene que aplicar el MISMO criterio de capacidades. Aquí no se
// inventan permisos nuevos: se reusan los flags de lib/Permisos.

import {
  Sun,
  Moon,
  PanelLeftClose,
  Keyboard,
  LogOut,
  User,
  CreditCard,
  DoorOpen,
  DoorClosed,
  RefreshCw,
} from 'lucide-react';

/**
 * @param {object} ctx
 * @param {(flag:string)=>boolean} ctx.flag          capacidades del rol activo
 * @param {(ruta:string)=>boolean} ctx.puedeVerRuta  gate de rutas
 * @param {boolean} ctx.turnoActivo                  hay caja abierta
 * @param {boolean} ctx.esOscuro                     modo actual
 * @param {boolean} ctx.sidebarColapsado
 * @param {object}  ctx.on                           callbacks de ejecución
 * @returns {Array} acciones visibles para este usuario y este momento
 */
export function accionesDisponibles(ctx = {}) {
  const {
    flag = () => false,
    puedeVerRuta = () => false,
    turnoActivo = false,
    esOscuro = false,
    sidebarColapsado = false,
    on = {},
  } = ctx;

  const CATALOGO = [
    {
      id: 'tema',
      titulo: esOscuro ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro',
      subtitulo: 'Apariencia',
      icono: esOscuro ? Sun : Moon,
      combo: 'ctrl+shift+l',
      visible: () => true,
      ejecutar: on.alternarTema,
    },
    {
      id: 'sidebar',
      titulo: sidebarColapsado ? 'Expandir el menú' : 'Colapsar el menú',
      subtitulo: 'Apariencia',
      icono: PanelLeftClose,
      combo: 'ctrl+b',
      visible: () => true,
      ejecutar: on.alternarSidebar,
    },
    {
      id: 'atajos',
      titulo: 'Ver todos los atajos',
      subtitulo: 'Ayuda',
      icono: Keyboard,
      combo: 'f1',
      visible: () => true,
      ejecutar: on.verAtajos,
    },
    {
      id: 'abrir-turno',
      titulo: 'Abrir turno de caja',
      subtitulo: 'Caja',
      icono: DoorOpen,
      // Mismo flag que gobierna EsperaScreen: quien no gestiona la caja no la
      // abre, ni por menú ni por palette.
      visible: () => flag('abre_caja') && !turnoActivo,
      ejecutar: on.abrirTurno,
    },
    {
      id: 'cerrar-turno',
      titulo: 'Cerrar turno de caja',
      subtitulo: 'Caja',
      icono: DoorClosed,
      visible: () => flag('abre_caja') && turnoActivo,
      ejecutar: on.cerrarTurno,
    },
    {
      id: 'perfil',
      titulo: 'Mi perfil',
      subtitulo: 'Cuenta',
      icono: User,
      visible: () => puedeVerRuta('/perfil'),
      ejecutar: on.irAPerfil,
    },
    {
      id: 'mi-plan',
      titulo: 'Mi plan y facturación',
      subtitulo: 'Cuenta',
      icono: CreditCard,
      // La suscripción la toca gestión, no un cajero.
      visible: () => flag('gestion') && puedeVerRuta('/mi-plan'),
      ejecutar: on.irAMiPlan,
    },
    {
      id: 'sincronizar',
      titulo: 'Forzar sincronización',
      subtitulo: 'Sistema',
      icono: RefreshCw,
      visible: () => typeof on.sincronizar === 'function',
      ejecutar: on.sincronizar,
    },
    {
      id: 'salir',
      titulo: 'Cerrar sesión',
      subtitulo: 'Cuenta',
      icono: LogOut,
      visible: () => true,
      ejecutar: on.cerrarSesion,
    },
  ];

  // Una acción sin callback no se muestra: mejor que no aparezca a que aparezca
  // y no haga nada al pulsarla.
  return CATALOGO.filter(
    (a) => a.visible(ctx) && typeof a.ejecutar === 'function',
  ).map(({ visible, ...resto }) => resto); // eslint-disable-line no-unused-vars
}
