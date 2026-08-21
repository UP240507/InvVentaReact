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
//   kds_solo_lectura    bool     — entra al KDS a MIRAR: no marca platillos
//   kds_estacion_fija   bool     — sólo marca los platillos de SU estación
//
// ── POR QUÉ LOS DOS ÚLTIMOS SON RESTRICCIONES Y NO PERMISOS ─────────────────
// Es la diferencia entre añadir una capacidad sin romper nada y romper el KDS
// de todos los locales a la vez. `getCapacidades` **reemplaza**: si el rol tiene
// fila en `roles_permisos`, la base de aquí abajo NO se consulta. O sea que un
// flag nuevo llega como `undefined` a todo tenant que ya tenga sus filas —y los
// tienen todos— y `tieneFlag` lo lee como `false`.
//
// Con un flag en positivo (`kds_marca`) eso significaría que **nadie puede
// marcar nada** en cuanto se publique la versión: la cocina se queda mirando una
// pantalla que no responde, sin ningún error. Con el flag en negativo, ausente
// = sin restricción = exactamente como funcionaba ayer, y cada local activa lo
// que necesite desde Roles y Permisos. Que es además lo que se decidió el
// 17-ago: esto se configura, no se codifica.

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
      'gastos',
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
  const slug =
    String(ruta || '')
      .replace(/^\//, '')
      .split('/')[0] || 'dashboard';
  return rutas.includes(slug);
}

// Flag booleano estricto (capacidades corruptas o ausentes = false).
export function tieneFlag(cap, flag) {
  return cap?.[flag] === true;
}

/**
 * ¿Puede este usuario marcar ESTE platillo en el KDS?
 *
 * ── QUÉ PROBLEMA RESUELVE ───────────────────────────────────────────────────
 * Lo pidió Chris el 17-ago: que un barista no marque listo un platillo de
 * cocina por error, ni al revés; y que quien entra a supervisar —dueño,
 * gerente— entre a mirar. No es una muralla de permisos: es un seguro contra el
 * toque involuntario en una pantalla que se usa con las manos ocupadas.
 *
 * Devuelve un MOTIVO y no un booleano porque la pantalla tiene que poder decir
 * por qué. Un botón que está y no responde es exactamente el fallo del «Salir»
 * del barista que se arregló el 12-ago: las dos salidas honestas son no
 * pintarlo, o pintarlo apagado **diciendo por qué**.
 *
 * `sin_estacion` es el caso incómodo y por eso tiene nombre propio: el rol lleva
 * la restricción activada pero el empleado no tiene estación asignada, así que
 * no hay con qué comparar. Se deja pasar —bloquear todo sería un muro que nadie
 * entiende— y la pantalla avisa de que la restricción no está haciendo nada. Un
 * ajuste que promete y no cumple es peor que uno apagado.
 *
 * @returns {{puede: boolean, motivo: 'ok'|'solo_lectura'|'otra_estacion'|'sin_estacion'}}
 */
export function permisoDeMarcadoKds(
  cap,
  { estacionUsuario = null, estacionItem = null } = {},
) {
  if (tieneFlag(cap, 'kds_solo_lectura')) {
    return { puede: false, motivo: 'solo_lectura' };
  }
  if (!tieneFlag(cap, 'kds_estacion_fija')) {
    return { puede: true, motivo: 'ok' };
  }
  const suya = String(estacionUsuario || '').trim();
  if (!suya) return { puede: true, motivo: 'sin_estacion' };

  return String(estacionItem || '').trim() === suya
    ? { puede: true, motivo: 'ok' }
    : { puede: false, motivo: 'otra_estacion' };
}
