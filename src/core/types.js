// src/core/types.js
// Shapes que reflejan exactamente las tablas de Supabase.
// Los mocks de los stores deben seguir esta estructura.
// Al conectar Supabase, solo cambia de dónde vienen los datos.

/**
 * Tabla: recetas (lo que en POS llamamos "platillos del menú")
 * @typedef {Object} Receta
 * @property {number}  id
 * @property {string}  nombre
 * @property {number}  precio_venta
 * @property {string}  categoria
 * @property {string}  [codigo_pos]    — código de barras / atajo de teclado
 * @property {string}  [descripcion]
 * @property {boolean} [activo]
 * @property {Ingrediente[]} ingredientes — viene de JOIN con productos
 */

/**
 * Ingrediente dentro de una receta (tabla: receta_ingredientes o JSONB)
 * @typedef {Object} Ingrediente
 * @property {number}  productoId     — FK a productos.id
 * @property {number}  cantidad       — cantidad neta requerida
 * @property {number}  [merma]        — % de merma (0-100)
 */

/**
 * Tabla: productos (insumos / materias primas)
 * @typedef {Object} Producto
 * @property {number}  id
 * @property {string}  nombre
 * @property {number}  stock
 * @property {string}  unidad         — 'kg', 'pzas', 'lt', etc.
 * @property {number}  costo_unitario
 * @property {number}  stock_minimo
 * @property {string}  [categoria]
 * @property {boolean} [activo]
 */

/**
 * Tabla: mesas
 * @typedef {Object} Mesa
 * @property {number}  id
 * @property {string}  nombre
 * @property {string}  zona
 * @property {number}  capacidad
 * @property {string}  estado         — 'libre' | 'ocupada' | 'por_cobrar'
 * @property {string}  [abierta_en]   — ISO timestamp
 * @property {Object}  [orden_actual] — { items: [], total: 0 }
 * @property {string}  [usuario]      — nombre del mesero
 */

/**
 * Tabla: ventas
 * @typedef {Object} Venta
 * @property {number}  id
 * @property {string}  folio
 * @property {number}  subtotal
 * @property {number}  total
 * @property {number}  [descuento]
 * @property {number}  [propina]
 * @property {string}  metodo_pago    — 'efectivo' | 'tarjeta' | 'mixto'
 * @property {string}  usuario
 * @property {string}  [turno_id]
 * @property {Object[]} items
 * @property {string}  fecha
 */

/**
 * Tabla: configuracion (fila única, id=1)
 * @typedef {Object} Configuracion
 * @property {number}   id
 * @property {string}   nombre_empresa
 * @property {string}   [rfc]
 * @property {number}   iva            — decimal: 0.16
 * @property {string[]} categorias     — lista de categorías de productos
 * @property {string[]} unidades       — lista de unidades de medida
 * @property {string}   [mensaje_ticket]
 * @property {Object}   [cfdi_config]
 * @property {number}   [printer_baud]
 */
