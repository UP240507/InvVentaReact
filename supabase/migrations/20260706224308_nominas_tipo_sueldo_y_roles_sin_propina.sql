-- #2 Nóminas/propinas — base de esquema:
-- staff.tipo_sueldo: base del cálculo de sueldo en Nóminas.
--   'hora'  → horas de asistencias (checador)
--   'dia'   → días con al menos una asistencia
--   'turno' → turnos del periodo en los que participó
-- default 'dia' para que las filas legadas queden válidas sin backfill manual.
alter table public.staff
  add column if not exists tipo_sueldo text not null default 'dia'
  check (tipo_sueldo in ('hora','dia','turno'));

-- configuracion.roles_sin_propina: roles excluidos del reparto del Propinero
-- (toggle por tenant; hay restaurantes que no reparten propina a gestión).
-- 'Capitán' queda para cuando se unifique el vocabulario de roles (proyecto L).
alter table public.configuracion
  add column if not exists roles_sin_propina jsonb
  not null default '["Admin","Administrador","Gerente"]'::jsonb;
