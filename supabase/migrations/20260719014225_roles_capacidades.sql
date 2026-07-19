-- Tanda 2 Proyecto L: capacidades data-driven por rol.
-- Columna NUEVA para no romper PermisosScreen (que edita el array `permisos`);
-- el seed es ESPEJO EXACTO del comportamiento quemado del front al 18-jul-2026.
-- Los guards leerán esto con fallback a CAPACIDADES_BASE (lib/Permisos.js).

alter table roles_permisos add column if not exists capacidades jsonb;

update roles_permisos set capacidades = case rol
  when 'Admin' then '{
    "rutas": ["*"], "ruta_inicial": "/dashboard",
    "elevado": true, "gestion": true, "autoriza_descuentos": true,
    "abre_caja": true, "autoriza_salidas": true, "exento_jornada": true,
    "exento_turno": true, "admin_config": true, "es_sistema": true
  }'::jsonb
  when 'Gerente' then '{
    "rutas": ["dashboard","mesas","pos","kds","propinas","ingredientes","compras","recepcion","mermas","proveedores","empleados","asistencias","nominas","permisos","clientes","reportes","facturas","zonas-produccion","auditoria","configuracion","perfil","mi-plan"],
    "ruta_inicial": "/dashboard",
    "elevado": true, "gestion": true, "autoriza_descuentos": true,
    "abre_caja": true, "autoriza_salidas": false, "exento_jornada": false,
    "exento_turno": true, "admin_config": false, "es_sistema": false
  }'::jsonb
  when 'Cajero' then '{
    "rutas": ["pos","mesas","propinas","facturas","reportes","perfil"],
    "ruta_inicial": "/mesas",
    "elevado": false, "gestion": false, "autoriza_descuentos": false,
    "abre_caja": true, "autoriza_salidas": false, "exento_jornada": false,
    "exento_turno": false, "admin_config": false, "es_sistema": false
  }'::jsonb
  when 'Mesero' then '{
    "rutas": ["mesas","pos","perfil"], "ruta_inicial": "/mesas",
    "elevado": false, "gestion": false, "autoriza_descuentos": false,
    "abre_caja": false, "autoriza_salidas": false, "exento_jornada": false,
    "exento_turno": false, "admin_config": false, "es_sistema": false
  }'::jsonb
  when 'Chef' then '{
    "rutas": ["kds","perfil"], "ruta_inicial": "/kds",
    "elevado": false, "gestion": false, "autoriza_descuentos": false,
    "abre_caja": false, "autoriza_salidas": false, "exento_jornada": false,
    "exento_turno": false, "admin_config": false, "es_sistema": false
  }'::jsonb
  when 'Barista' then '{
    "rutas": ["kds","perfil"], "ruta_inicial": "/kds",
    "elevado": false, "gestion": false, "autoriza_descuentos": false,
    "abre_caja": false, "autoriza_salidas": false, "exento_jornada": false,
    "exento_turno": false, "admin_config": false, "es_sistema": false
  }'::jsonb
  else capacidades end
where capacidades is null;
