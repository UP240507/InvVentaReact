import Dexie from 'dexie';

export const localDB = new Dexie('invVentaDB');

// Versiones previas intactas para no perder datos de usuarios en producción
localDB.version(1).stores({
  configuracion: 'id',
  productos: 'id',
  recetas: 'id',
  mesas: 'id',
  ventas: 'id',
  movimientos: 'id',
  ordenes_compra: 'id',
  usuarios: 'id',
  turnos: 'id',
  sync_queue: '++id, tabla, metodo, fecha',
});

localDB.version(2).stores({
  configuracion: 'id',
  productos: 'id',
  recetas: 'id',
  mesas: 'id',
  ventas: 'id',
  movimientos: 'id',
  ordenes_compra: 'id',
  proveedores: 'id',
  usuarios: 'id',
  turnos: 'id',
  sync_queue: '++id, tabla, metodo, fecha',
});

localDB.version(3).stores({
  configuracion: 'id',
  productos: 'id',
  recetas: 'id',
  mesas: 'id',
  ventas: 'id',
  movimientos: 'id',
  ordenes_compra: 'id',
  proveedores: 'id',
  usuarios: 'id',
  turnos: 'id',
  sync_queue: '++id, tabla, metodo, estado, fecha, createdAt',
});

localDB.version(4).stores({
  configuracion: 'id',
  productos: 'id',
  recetas: 'id',
  mesas: 'id',
  ventas: 'id',
  movimientos: 'id',
  ordenes_compra: 'id',
  proveedores: 'id',
  usuarios: 'id',
  turnos: 'id',
  sync_queue:
    '++id, tabla, metodo, estado, fecha, createdAt, nextAttemptAt, intentos',
  facturas: '++id, folio_venta, rfc_receptor, fecha_emision, estado',
  sync_dead: '++id, tabla, metodo, estado, createdAt',
});

localDB.version(5).stores({
  configuracion: 'id',
  productos: 'id',
  recetas: 'id',
  mesas: 'id',
  ventas: 'id',
  movimientos: 'id',
  ordenes_compra: 'id',
  proveedores: 'id',
  usuarios: 'id',
  turnos: 'id',
  sync_queue:
    '++id, tabla, metodo, estado, fecha, createdAt, nextAttemptAt, intentos',
  facturas: '++id, folio_venta, rfc_receptor, fecha_emision, estado',
  sync_dead: '++id, tabla, metodo, estado, createdAt',
  modificadores: 'id',
});

localDB.version(6).stores({
  configuracion: 'id',
  productos: 'id',
  recetas: 'id',
  mesas: 'id',
  ventas: 'id',
  movimientos: 'id',
  ordenes_compra: 'id',
  proveedores: 'id',
  usuarios: 'id',
  turnos: 'id',
  sync_queue:
    '++id, tabla, metodo, estado, fecha, createdAt, nextAttemptAt, intentos',
  facturas: '++id, folio_venta, rfc_receptor, fecha_emision, estado',
  sync_dead: '++id, tabla, metodo, estado, createdAt',
  modificadores: 'id',
  staff: 'id',
});

localDB.version(7).stores({
  configuracion: 'id',
  productos: 'id',
  recetas: 'id',
  mesas: 'id',
  ventas: 'id',
  movimientos: 'id',
  ordenes_compra: 'id',
  proveedores: 'id',
  usuarios: 'id',
  turnos: 'id',
  sync_queue:
    '++id, tabla, metodo, estado, fecha, createdAt, nextAttemptAt, intentos',
  facturas: '++id, folio_venta, rfc_receptor, fecha_emision, estado',
  sync_dead: '++id, tabla, metodo, estado, createdAt',
  modificadores: 'id',
  staff: 'id',
  nominas: 'id',
});

localDB.version(8).stores({
  configuracion: 'id',
  productos: 'id',
  recetas: 'id',
  mesas: 'id',
  ventas: 'id',
  movimientos: 'id',
  ordenes_compra: 'id',
  proveedores: 'id',
  usuarios: 'id',
  turnos: 'id',
  sync_queue:
    '++id, tabla, metodo, estado, fecha, createdAt, nextAttemptAt, intentos',
  facturas: '++id, folio_venta, rfc_receptor, fecha_emision, estado',
  sync_dead: '++id, tabla, metodo, estado, createdAt',
  modificadores: 'id',
  staff: 'id',
  nominas: 'id',
  roles_permisos: 'rol', // PK original (se migra en v13)
});

localDB.version(9).stores({
  configuracion: 'id',
  productos: 'id',
  recetas: 'id',
  mesas: 'id',
  ventas: 'id',
  movimientos: 'id',
  ordenes_compra: 'id',
  proveedores: 'id',
  usuarios: 'id',
  turnos: 'id',
  sync_queue:
    '++id, tabla, metodo, estado, fecha, createdAt, nextAttemptAt, intentos',
  facturas: '++id, folio_venta, rfc_receptor, fecha_emision, estado',
  sync_dead: '++id, tabla, metodo, estado, createdAt',
  modificadores: 'id',
  staff: 'id',
  nominas: 'id',
  roles_permisos: 'rol',
  clientes: 'id',
});

localDB.version(10).stores({
  configuracion: 'id',
  productos: 'id',
  recetas: 'id',
  mesas: 'id',
  ventas: 'id',
  movimientos: 'id',
  ordenes_compra: 'id',
  proveedores: 'id',
  usuarios: 'id',
  turnos: 'id',
  sync_queue:
    '++id, tabla, metodo, estado, fecha, createdAt, nextAttemptAt, intentos',
  facturas: '++id, folio_venta, rfc_receptor, fecha_emision, estado',
  sync_dead: '++id, tabla, metodo, estado, createdAt',
  modificadores: 'id',
  staff: 'id',
  nominas: 'id',
  roles_permisos: 'rol',
  clientes: 'id',
  auditoria: 'id',
});

localDB.version(11).stores({
  configuracion: 'id',
  productos: 'id',
  recetas: 'id',
  mesas: 'id',
  ventas: 'id',
  movimientos: 'id',
  ordenes_compra: 'id',
  proveedores: 'id',
  usuarios: 'id',
  turnos: 'id',
  sync_queue:
    '++id, tabla, metodo, estado, fecha, createdAt, nextAttemptAt, intentos',
  facturas: '++id, folio_venta, rfc_receptor, fecha_emision, estado',
  sync_dead: '++id, tabla, metodo, estado, createdAt',
  modificadores: 'id',
  staff: 'id',
  nominas: 'id',
  roles_permisos: 'rol',
  clientes: 'id',
  auditoria: 'id',
  asistencias: 'id',
});

localDB.version(12).stores({
  configuracion: 'id',
  productos: 'id',
  recetas: 'id',
  mesas: 'id',
  ventas: 'id',
  movimientos: 'id',
  ordenes_compra: 'id',
  proveedores: 'id',
  usuarios: 'id',
  turnos: 'id',
  sync_queue:
    '++id, tabla, metodo, estado, fecha, createdAt, nextAttemptAt, intentos',
  facturas: '++id, folio_venta, rfc_receptor, fecha_emision, estado',
  sync_dead: '++id, tabla, metodo, estado, createdAt',
  modificadores: 'id',
  staff: 'id',
  nominas: 'id',
  roles_permisos: 'rol',
  clientes: 'id',
  auditoria: 'id',
  asistencias: 'id',
  comandas: 'id',
});

// ✅ FIX #4: roles_permisos migra su PK de 'rol' → 'id'
// El enqueueAction hacía localDB.roles_permisos.delete(payload.id) pero el PK era 'rol',
// causando que ningún borrado de permisos se aplicara offline.
// REQUISITO: la tabla roles_permisos en Supabase debe tener columna 'id' (uuid o serial).
localDB
  .version(13)
  .stores({
    configuracion: 'id',
    productos: 'id',
    recetas: 'id',
    mesas: 'id',
    ventas: 'id',
    movimientos: 'id',
    ordenes_compra: 'id',
    proveedores: 'id',
    usuarios: 'id',
    turnos: 'id',
    sync_queue:
      '++id, tabla, metodo, estado, fecha, createdAt, nextAttemptAt, intentos',
    facturas: '++id, folio_venta, rfc_receptor, fecha_emision, estado',
    sync_dead: '++id, tabla, metodo, estado, createdAt',
    modificadores: 'id',
    staff: 'id',
    nominas: 'id',
    roles_permisos: 'id, rol', // ✅ PK = id; 'rol' queda como índice secundario
    clientes: 'id',
    auditoria: 'id',
    asistencias: 'id',
    comandas: 'id',
  })
  .upgrade((tx) => {
    // Dexie reescribirá la tabla con el nuevo PK automáticamente.
    // Los registros sin campo 'id' quedarán con id autogenerado (Dexie asigna undefined→auto).
    console.log('🔄 [DB v13] Migrando roles_permisos PK: rol → id');
  });

// ✅ SPRINT 1 — v14: índices compuestos para reportes financieros OFFLINE.
// Antes 'ventas' y 'movimientos' solo tenían PK 'id' → cualquier reporte por
// período offline era full-scan en JS (criterio 2 de la auditoría).
// Ahora se pueden hacer queries indexadas tipo:
//   localDB.ventas.where('turno_id').equals(t).toArray()
//   localDB.ventas.where('[restaurante_id+fecha]')...  (rango por período)
//   localDB.movimientos.where('producto_id').equals(p)...  (kardex / COGS)
localDB
  .version(14)
  .stores({
    configuracion: 'id',
    productos: 'id',
    recetas: 'id',
    mesas: 'id',
    ventas: 'id, restaurante_id, fecha, turno_id, [restaurante_id+fecha]',
    movimientos:
      'id, restaurante_id, fecha, producto_id, [restaurante_id+fecha]',
    ordenes_compra: 'id',
    proveedores: 'id',
    usuarios: 'id',
    turnos: 'id, restaurante_id, estado',
    sync_queue:
      '++id, tabla, metodo, estado, fecha, createdAt, nextAttemptAt, intentos',
    facturas: '++id, folio_venta, rfc_receptor, fecha_emision, estado',
    sync_dead: '++id, tabla, metodo, estado, createdAt',
    modificadores: 'id',
    staff: 'id',
    nominas: 'id',
    roles_permisos: 'id, rol',
    clientes: 'id',
    auditoria: 'id, fecha',
    asistencias: 'id',
    comandas: 'id',
  })
  .upgrade(() => {
    // Solo añade índices; Dexie reindexa los registros existentes automáticamente.
    console.log(
      '🔄 [DB v14] Índices financieros: ventas/movimientos por fecha+turno+producto',
    );
  });

// ── FASE 2.5 — v15: gastos, sus categorías y las plantillas recurrentes ─────
// Offline-first como el resto: capturar el recibo de la luz no puede depender
// de que haya internet en ese momento.
localDB
  .version(15)
  .stores({
    configuracion: 'id',
    productos: 'id',
    recetas: 'id',
    mesas: 'id',
    ventas: 'id, turno_id, fecha, [restaurante_id+fecha]',
    movimientos: 'id, producto_id, fecha, [restaurante_id+fecha]',
    ordenes_compra: 'id',
    proveedores: 'id',
    usuarios: 'id',
    turnos: 'id',
    sync_queue:
      '++id, tabla, metodo, estado, fecha, createdAt, nextAttemptAt, intentos',
    facturas: '++id, folio_venta, rfc_receptor, fecha_emision, estado',
    sync_dead: '++id, tabla, metodo, estado, createdAt',
    modificadores: 'id',
    staff: 'id',
    nominas: 'id',
    roles_permisos: 'id, rol',
    clientes: 'id',
    auditoria: 'id, fecha',
    asistencias: 'id',
    comandas: 'id',
    gastos: 'id, fecha, categoria_id, [restaurante_id+fecha]',
    categorias_gasto: 'id',
    gastos_recurrentes: 'id',
  })
  .upgrade(() => {
    console.log('🔄 [DB v15] Gastos, categorías y recurrentes');
  });

// ── Defensa multipestaña: evita que un upgrade quede bloqueado a medias ──
localDB.on('blocked', () => {
  console.warn(
    '⚠️ [DB] Upgrade bloqueado por otra pestaña abierta. Ciérrala y recarga.',
  );
});
localDB.on('versionchange', () => {
  localDB.close();
  console.warn(
    '⚠️ [DB] El esquema cambió en otra pestaña; recarga esta pestaña.',
  );
});

// ── Auto-reparación de base inconsistente ────────────────────────────────────
// Si la base quedó en versión nativa 140 SIN object stores (por un upgrade que
// se bloqueó/abortó), Dexie ABRE sin error e incluso lista las tablas, pero
// cualquier lectura real lanza NotFoundError ("No objectStore named ..."), y la
// base queda atorada vacía. Aquí hacemos un probe real y, si está rota, borramos
// y recreamos la base limpia.
// ⚠️ Llamar UNA vez al arranque (main.jsx) ANTES de renderizar la app.
export async function abrirDBSegura() {
  try {
    await localDB.open();
    await localDB.productos.limit(1).toArray(); // probe real de acceso a store
    return localDB;
  } catch (err) {
    const recuperables = [
      'NotFoundError',
      'VersionError',
      'UpgradeError',
      'InvalidStateError',
    ];
    if (recuperables.includes(err?.name)) {
      console.warn(
        `⚠️ [DB] Base inconsistente (${err.name}). Recreando desde cero...`,
      );
      try {
        localDB.close();
      } catch {
        /* noop */
      }
      await localDB.delete(); // si está bloqueado por otra pestaña, espera a que cierre
      await localDB.open();
      console.log('✅ [DB] Base recreada con su esquema completo.');
      return localDB;
    }
    console.error('❌ [DB] Error no recuperable al abrir la base:', err);
    throw err;
  }
}
