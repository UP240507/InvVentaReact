alter table public.configuracion
  add column if not exists franjas_activas boolean not null default false,
  add column if not exists franja_corte    time    not null default '16:00';

comment on column public.configuracion.franjas_activas is
  'Si el local separa la manana de la tarde en los reportes. Apagado por defecto: con esto en false el sistema es exactamente el de antes.';
comment on column public.configuracion.franja_corte is
  'Hora local que parte el dia. Antes: matutino. Desde esa hora inclusive: vespertino.';

alter table public.ventas      add column if not exists franja text;
alter table public.movimientos add column if not exists franja text;
alter table public.gastos      add column if not exists franja text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'ventas_franja_valida') then
    alter table public.ventas add constraint ventas_franja_valida
      check (franja is null or franja in ('matutino','vespertino'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'movimientos_franja_valida') then
    alter table public.movimientos add constraint movimientos_franja_valida
      check (franja is null or franja in ('matutino','vespertino'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'gastos_franja_valida') then
    alter table public.gastos add constraint gastos_franja_valida
      check (franja is null or franja in ('matutino','vespertino'));
  end if;
end $$;

create index if not exists ventas_franja_idx
  on public.ventas (restaurante_id, franja, fecha) where franja is not null;
create index if not exists movimientos_franja_idx
  on public.movimientos (restaurante_id, franja, fecha) where franja is not null;
create index if not exists gastos_franja_idx
  on public.gastos (restaurante_id, franja, fecha) where franja is not null;

-- ── LA HISTORIA SE CLASIFICA HACIA ATRAS UNA VEZ, Y A MANO ───────────────────
--
-- Este UPDATE se deja COMENTADO a proposito. Correrlo es una decision, no un
-- efecto secundario: dejarlo activo haria que se ejecutara solo el dia que
-- alguien encienda las franjas, y eso no es lo mismo que decidirlo.
--
-- Clasifica hacia atras las filas que ya existen, calculando la franja desde su
-- propia hora. Solo para los locales que tengan las franjas encendidas -o sea,
-- ninguno el dia que esto se aplique-.
--
-- La zona horaria va explicita: `fecha` es timestamptz, y sin el `at time zone`
-- el corte se calcularia contra UTC y la frontera saldria corrida seis horas.
-- Es el mismo error que motivo `lib/Fechas.js`, en otra columna.
--
--   update public.ventas v set franja = case
--     when (v.fecha at time zone 'America/Mexico_City')::time < c.franja_corte
--       then 'matutino' else 'vespertino' end
--   from public.configuracion c
--   where c.restaurante_id = v.restaurante_id
--     and c.franjas_activas and v.franja is null;
--
--   update public.movimientos m set franja = case
--     when (m.fecha at time zone 'America/Mexico_City')::time < c.franja_corte
--       then 'matutino' else 'vespertino' end
--   from public.configuracion c
--   where c.restaurante_id = m.restaurante_id
--     and c.franjas_activas and m.franja is null;
--
-- `gastos` NO se rellena nunca, y no es un olvido: su `fecha` es un `date` sin
-- hora, asi que no hay de donde deducir la franja. Su `created_at` dice cuando
-- se tecleo, no cuando se gasto -deducirlo de ahi para una fila de hace tres
-- meses seria inventar un dato-.
--
-- NOTA DE PROCEDENCIA (23-ago, noche): las tres primeras secciones de este
-- archivo son el SQL EXACTO que ya esta aplicado en la base de AZUL,
-- recuperado desde `supabase_migrations.schema_migrations` porque el archivo
-- se habia perdido. Este bloque final se anadio despues y son comentarios:
-- no cambia nada de lo aplicado.
