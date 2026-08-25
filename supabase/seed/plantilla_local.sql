-- ─── PLANTILLA DE LOCAL NUEVO ───────────────────────────────────────────────
--
-- Lo minimo con lo que un restaurante deberia nacer para no empezar en cero:
-- los siete roles con sus capacidades, y una configuracion con las unidades y
-- las categorias ya decididas.
--
-- POR QUE ESTO ES UN ARCHIVO Y NO "LAS FILAS QUE QUEDARON EN AZUL"
--
-- Chris pidio (23-ago) dejar una plantilla base al limpiar AZUL. Conservar las
-- filas serviria una vez; esto sirve siempre y ademas se puede leer, discutir y
-- corregir. Una plantilla que es "lo que quedo" no se sabe si es una decision o
-- un residuo -que es exactamente lo que paso con los diez insumos de prueba y
-- sus tres formas de escribir litro-.
--
-- Y hace barato algo que llevaba semanas pendiente: crear el TENANT DESECHABLE
-- para las E2E de flujo, que hoy escriben en el local vivo.
--
-- USO
--   1. Crear la fila del local en `restaurantes` y anotar su id.
--   2. Sustituir :rid por ese id en todo el archivo.
--   3. Correrlo entero, en una transaccion.
--
-- Lo que este archivo NO trae, a proposito: recetas, insumos, mesas,
-- proveedores y empleados. Eso es el local concreto, no la plantilla.

begin;

-- ── 1 · Los siete roles ─────────────────────────────────────────────────────
--
-- Copiados de los de AZUL, que llevan meses funcionando y estan probados en la
-- practica. La forma importa: `getCapacidades` REEMPLAZA la base cuando el rol
-- tiene fila propia, NO mezcla. Por eso cada rol lleva su lista de rutas
-- completa y sus flags explicitos: un flag que falta no hereda, llega
-- `undefined` -y ese fue el fallo que dicto el diseno del KDS-.

insert into public.roles_permisos (restaurante_id, rol, capacidades) values
(:rid, 'Admin', '{
  "rutas": ["*"], "ruta_inicial": "/dashboard",
  "elevado": true, "gestion": true, "abre_caja": true, "es_sistema": true,
  "admin_config": true, "exento_turno": true, "exento_jornada": true,
  "autoriza_salidas": true, "autoriza_descuentos": true }'::jsonb),

(:rid, 'Gerente', '{
  "rutas": ["dashboard","mesas","pos","kds","propinas","ingredientes","compras",
            "recepcion","mermas","proveedores","empleados","asistencias",
            "nominas","permisos","clientes","reportes","facturas",
            "zonas-produccion","auditoria","configuracion","perfil","mi-plan"],
  "ruta_inicial": "/dashboard",
  "elevado": true, "gestion": true, "abre_caja": true, "es_sistema": false,
  "admin_config": false, "exento_turno": true, "exento_jornada": false,
  "autoriza_salidas": false, "autoriza_descuentos": true }'::jsonb),

(:rid, 'Capitán de Meseros', '{
  "rutas": ["dashboard","mesas","pos","propinas","empleados","asistencias",
            "permisos","configuracion","perfil"],
  "ruta_inicial": "/dashboard",
  "elevado": false, "gestion": false, "abre_caja": true, "es_sistema": false,
  "admin_config": false, "exento_turno": true, "exento_jornada": true,
  "autoriza_salidas": true, "autoriza_descuentos": true }'::jsonb),

(:rid, 'Cajero', '{
  "rutas": ["pos","mesas","propinas","perfil"], "ruta_inicial": "/mesas",
  "elevado": false, "gestion": false, "abre_caja": true, "es_sistema": false,
  "admin_config": false, "exento_turno": false, "exento_jornada": false,
  "autoriza_salidas": false, "autoriza_descuentos": false }'::jsonb),

(:rid, 'Mesero', '{
  "rutas": ["mesas","pos","perfil"], "ruta_inicial": "/mesas",
  "elevado": false, "gestion": false, "abre_caja": false, "es_sistema": false,
  "admin_config": false, "exento_turno": false, "exento_jornada": false,
  "autoriza_salidas": false, "autoriza_descuentos": false }'::jsonb),

(:rid, 'Chef', '{
  "rutas": ["kds","perfil"], "ruta_inicial": "/kds",
  "elevado": false, "gestion": false, "abre_caja": false, "es_sistema": false,
  "admin_config": false, "exento_turno": false, "exento_jornada": false,
  "autoriza_salidas": false, "autoriza_descuentos": false }'::jsonb),

(:rid, 'Barista', '{
  "rutas": ["kds","perfil"], "ruta_inicial": "/kds",
  "elevado": false, "gestion": false, "abre_caja": false, "es_sistema": false,
  "admin_config": false, "exento_turno": false, "exento_jornada": false,
  "autoriza_salidas": false, "autoriza_descuentos": false }'::jsonb);

-- ── 2 · La configuracion ────────────────────────────────────────────────────
--
-- LAS UNIDADES SON UNA DECISION, NO UNA LISTA
--
-- La regla que las gobierna: **la unidad de inventario debe ser la unidad de
-- consumo** (ver docs/DISENO_ALCANCE_INVENTARIO.md). Si la receta gasta piezas
-- de nopal, el nopal se inventaria en piezas aunque se compre por kilo; el
-- factor de compra vive en la linea de la orden, no en la unidad del insumo.
--
-- La lista va sin sinonimos a proposito. En AZUL, con DIEZ insumos, ya convivian
-- `L` con `lt` y `pz` con `pza`: dos insumos que son lo mismo y no se pueden
-- sumar, sin que nada de error. Con doscientos, eso es el inventario partido.
--
-- Si hace falta una unidad nueva, se anade AQUI y se piensa una vez, en vez de
-- teclearla distinta cada vez que alguien captura un insumo.

insert into public.configuracion (
  restaurante_id, nombre_empresa, iva, mensaje_ticket,
  unidades, categorias,
  flujo_cuenta, precios_incluyen_iva,
  franjas_activas, franja_corte
) values (
  :rid,
  'Nombre del local',          -- se cambia en Ajustes al dar de alta
  0.16,
  '¡Gracias por su preferencia!',
  '["kg","g","L","ml","pz","paq","caja","bolsa"]'::jsonb,
  '["Abarrotes","Carnes","Lácteos","Frutas y verduras","Bebidas","Limpieza"]'::jsonb,
  -- Un solo papel: la cuenta que se lleva el cliente ES el comprobante y lleva
  -- folio. El otro flujo (`precuenta_y_ticket`) existe para quien ya trabaja
  -- asi, pero para un local nuevo dos papeles es papel de mas.
  'ticket_final',
  -- En Mexico el precio de la carta ya trae IVA. Ponerlo en false hace que la
  -- caja sume 16 % encima de lo que dice el menu.
  true,
  -- Franjas apagadas: un local de un solo turno no tiene por que enterarse de
  -- que esto existe.
  false,
  '16:00'
);

-- ── 3 · Lo que hay que hacer a mano despues ─────────────────────────────────
--
--   * Datos fiscales: razon social y RFC. **Sin inventar uno de ejemplo**: en
--     AZUL quedo `ROGC010401AQ9`, que no corresponde a la razon social, y ese
--     dato se imprime como emisor en cada ticket.
--   * Los empleados, con PIN de verdad.
--   * Las mesas del local.
--   * El menu y los insumos.
--
-- Las categorias de gasto NO se siembran: son globales y ya existen (Renta,
-- Servicios, Nomina, Mantenimiento...), compartidas por todos los locales.

commit;
