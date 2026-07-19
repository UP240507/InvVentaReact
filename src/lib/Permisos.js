// ─── PERMISOS: FUENTE ÚNICA DE CAPACIDADES POR ROL (Proyecto L, tanda 2) ──────
// Los guards YA NO comparan nombres de rol: leen FLAGS de capacidad.
// Fuente primaria: roles_permisos.capacidades (jsonb, editable por tenant).
// Fallback: CAPACIDADES_BASE (espejo del comportamiento histórico) — cubre la
// primera sesión sin fetch y roles sin fila todavía. Roles desconocidos caen a
// la base de Mesero (mismo criterio que el RUTAS_POR_ROL[rol] || Mesero legado).
//
// Flags:
//   rutas               string[] — slugs de ruta permitidos; ['*'] = todas
//   ruta_inicial        string   — landing tras login/checador
//   elevado             bool     — credencial por contraseña (no PIN); ve Perfil completo
//   gestion             bool     — shell de administración (App.jsx / secciones sidebar)
//   autoriza_descuentos bool     — puede autorizar descuentos en cobro
//   abre_caja           bool     — puede abrir caja/turno
//   autoriza_salidas    bool     — su PIN autoriza salidas anticipadas del checador
//   exento_jornada      bool     — sin candado de horas_jornada al salir
//   exento_turno        bool     — navega sin turno de caja abierto
//   admin_config        bool     — edita configuración sensible (jornada, lealtad)
//   es_sistema          bool     — rol no borrable/renombrable (Admin)

export const CAPACIDADES_BASE = {
  Admin: {
    rutas: ['*'],
    ruta_inicial: '/dashboard',
    elevado: true,
    gestion: true,
    autoriza_descuentos: true,
    abre_caja: true,
    autoriza_salidas: true,
    exento_jornada: true,
    exento_turno: true,
    admin_config: true,
    es_sistema: true,
  },
  Gerente: {
    rutas: [
      'dashboard',
      'mesas',
      'pos',
      'kds',
      'propinas',
      'ingredientes',
      'compras',
      'recepcion',
      'mermas',
      'proveedores',
      'empleados',
      'asistencias',
      'nominas',
      'permisos',
      'clientes',
      'reportes',
      'facturas',
      'zonas-produccion',
      'auditoria',
      'configuracion',
      'perfil',
      'mi-plan',
    ],
    ruta_inicial: '/dashboard',
    elevado: true,
    gestion: true,
    autoriza_descuentos: true,
    abre_caja: true,
    autoriza_salidas: false,
    exento_jornada: false,
    exento_turno: true,
    admin_config: false,
    es_sistema: false,
  },
  Cajero: {
    rutas: ['pos', 'mesas', 'propinas', 'facturas', 'reportes', 'perfil'],
    ruta_inicial: '/mesas',
    elevado: false,
    gestion: false,
    autoriza_descuentos: false,
    abre_caja: true,
    autoriza_salidas: false,
    exento_jornada: false,
    exento_turno: false,
    admin_config: false,
    es_sistema: false,
  },
  Mesero: {
    rutas: ['mesas', 'pos', 'perfil'],
    ruta_inicial: '/mesas',
    elevado: false,
    gestion: false,
    autoriza_descuentos: false,
    abre_caja: false,
    autoriza_salidas: false,
    exento_jornada: false,
    exento_turno: false,
    admin_config: false,
    es_sistema: false,
  },
  Chef: {
    rutas: ['kds', 'perfil'],
    ruta_inicial: '/kds',
    elevado: false,
    gestion: false,
    autoriza_descuentos: false,
    abre_caja: false,
    autoriza_salidas: false,
    exento_jornada: false,
    exento_turno: false,
    admin_config: false,
    es_sistema: false,
  },
  Barista: {
    rutas: ['kds', 'perfil'],
    ruta_inicial: '/kds',
    elevado: false,
    gestion: false,
    autoriza_descuentos: false,
    abre_caja: false,
    autoriza_salidas: false,
    exento_jornada: false,
    exento_turno: false,
    admin_config: false,
    es_sistema: false,
  },
};

// Rol efectivo de una persona (empleado por PIN o dueño/elevado por correo).
// Mantiene el criterio legado: rol || puesto || 'Mesero'.
export function getRolEfectivo(persona) {
  return persona?.rol || persona?.puesto || 'Mesero';
}

// Capacidades de un rol: fila viva (Dexie/fetch) → base quemada → base Mesero.
export function getCapacidades(rol, rolesPermisos) {
  const fila = Array.isArray(rolesPermisos)
    ? rolesPermisos.find((r) => r?.rol === rol)
    : null;
  if (fila?.capacidades && typeof fila.capacidades === 'object') {
    return fila.capacidades;
  }
  return CAPACIDADES_BASE[rol] || CAPACIDADES_BASE.Mesero;
}

// ¿La capacidad permite ver esta ruta? ('*' = todas; slug = primer segmento)
export function puedeVerRuta(cap, ruta) {
  const rutas = Array.isArray(cap?.rutas) ? cap.rutas : [];
  if (rutas.includes('*')) return true;
  const slug = String(ruta || '').replace(/^\//, '').split('/')[0] || 'dashboard';
  return rutas.includes(slug);
}

// Flag booleano estricto (capacidades corruptas o ausentes = false).
export function tieneFlag(cap, flag) {
  return cap?.[flag] === true;
}
