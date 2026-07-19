-- Tanda 4 Proyecto L: ROLES LIBRES.
-- Muere el vocabulario quemado de staff: el CHECK se reemplaza por una FK
-- compuesta hacia roles_permisos — el tenant define sus roles.
--   ON UPDATE CASCADE  → renombrar un rol propaga a staff.rol automáticamente.
--   ON DELETE RESTRICT → no se puede borrar un rol con empleados asignados.
-- staff.puesto queda como espejo cosmético SIN constraint (la EF lo sigue
-- espejando; su eliminación es una tanda aparte).

-- 1. El índice único de la tanda 1 se promueve a CONSTRAINT (requisito de FK).
alter table roles_permisos
  add constraint roles_permisos_restaurante_rol_uq
  unique using index roles_permisos_restaurante_rol_key;

-- 2. Fuera los CHECKs de vocabulario quemado.
alter table staff drop constraint if exists staff_rol_check;
alter table staff drop constraint if exists staff_puesto_check;

-- 3. FK compuesta (pre-check verificado: 0 huérfanos).
alter table staff
  add constraint staff_rol_fk
  foreign key (restaurante_id, rol)
  references roles_permisos (restaurante_id, rol)
  on update cascade
  on delete restrict;
