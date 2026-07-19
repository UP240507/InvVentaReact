-- Tanda 1 Proyecto L: vocabulario canónico A en roles_permisos + limpieza.
-- 'Administrador' y 'Cocinero' eran vocabulario huérfano de PermisosScreen;
-- el canónico es el del CHECK de staff: Admin/Gerente/Cajero/Mesero/Chef/Barista.

-- 1. Renombres C → A (idempotentes: solo si no existe ya el destino en el tenant)
update roles_permisos rp set rol = 'Admin'
where rol = 'Administrador'
  and not exists (select 1 from roles_permisos x
                  where x.restaurante_id = rp.restaurante_id and x.rol = 'Admin');

update roles_permisos rp set rol = 'Chef'
where rol = 'Cocinero'
  and not exists (select 1 from roles_permisos x
                  where x.restaurante_id = rp.restaurante_id and x.rol = 'Chef');

-- 2. Purgar módulo legacy 'Corte_Caja' de los arrays de permisos
update roles_permisos
set permisos = coalesce(
  (select jsonb_agg(e) from jsonb_array_elements(permisos) e where e <> '"Corte_Caja"'),
  '[]'::jsonb)
where permisos ? 'Corte_Caja';

-- 3. Sembrar roles base faltantes por tenant (hoy: Barista)
insert into roles_permisos (id, restaurante_id, rol, permisos)
select gen_random_uuid(), t.restaurante_id, r.rol, r.permisos
from (select distinct restaurante_id from roles_permisos) t
cross join (values
  ('Admin',   '["TODO"]'::jsonb),
  ('Gerente', '["POS","Mesas","Inventario","Staff","Reportes"]'::jsonb),
  ('Cajero',  '["POS","Mesas"]'::jsonb),
  ('Mesero',  '["Mesas"]'::jsonb),
  ('Chef',    '["Comandas"]'::jsonb),
  ('Barista', '["Comandas"]'::jsonb)
) as r(rol, permisos)
where not exists (select 1 from roles_permisos x
                  where x.restaurante_id = t.restaurante_id and x.rol = r.rol);

-- 4. Endurecer: NOT NULL + unicidad (base de la futura FK desde staff)
alter table roles_permisos alter column restaurante_id set not null;
create unique index if not exists roles_permisos_restaurante_rol_key
  on roles_permisos (restaurante_id, rol);

-- 5. configuracion.roles_sin_propina: 'Administrador' → 'Admin' (con dedupe)
update configuracion
set roles_sin_propina = (
  select jsonb_agg(distinct case when e = 'Administrador' then 'Admin' else e end)
  from jsonb_array_elements_text(roles_sin_propina) e)
where roles_sin_propina ? 'Administrador';
