-- ── CRM: el cliente entra al flujo de venta ──────────────────────────────────
-- ventas.cliente_id: asociación opcional (venta de mostrador = null, cero fricción).
alter table public.ventas
  add column if not exists cliente_id bigint references public.clientes(id) on delete set null;

create index if not exists idx_ventas_restaurante_cliente
  on public.ventas (restaurante_id, cliente_id)
  where cliente_id is not null;

-- Siembra CFDI 4.0 (Facturama): el cliente de factura ES el cliente del CRM.
alter table public.clientes
  add column if not exists rfc text,
  add column if not exists razon_social text;

-- Regla de puntos POR TENANT, definida por el dueño en Configuración.
-- pesos_por_punto: cuántos pesos gastados otorgan 1 punto (ej. 10 = 1 pto/$10).
-- 0 = programa de puntos apagado (default).
alter table public.configuracion
  add column if not exists pesos_por_punto numeric not null default 0;

-- ── Ledger de visitas: idempotencia real contra reintentos de la cola ────────
-- La cola offline reintenta transitorios (timeout post-commit = riesgo de doble
-- conteo). PK (restaurante_id, venta_id): una venta solo acumula UNA vez.
-- Solo la RPC (security definer) escribe; authenticated solo lee su tenant.
create table if not exists public.crm_visitas (
  restaurante_id uuid not null,
  venta_id bigint not null,
  cliente_id bigint not null references public.clientes(id) on delete cascade,
  total numeric not null default 0,
  puntos integer not null default 0,
  fecha timestamptz not null default now(),
  primary key (restaurante_id, venta_id)
);

alter table public.crm_visitas enable row level security;

drop policy if exists crm_visitas_select_tenant on public.crm_visitas;
create policy crm_visitas_select_tenant on public.crm_visitas
  for select to authenticated
  using (restaurante_id = public.get_restaurante_id());

-- ── RPC atómica: registrar visita + acumular contadores ──────────────────────
-- Mismo hardening multi-tenant que decrementar_stock:
--  * authenticated: solo su tenant (get_restaurante_id()).
--  * anon: rechazado (y sin EXECUTE; defensa en profundidad).
--  * service_role / SQL directo: pasa (contexto confiable).
-- SELECT FOR UPDATE sobre el cliente → sin carreras multi-terminal.
-- Puntos calculados SERVER-SIDE desde configuracion.pesos_por_punto.
create or replace function public.registrar_visita_cliente(
  p_venta_id bigint,
  p_cliente_id bigint,
  p_restaurante_id uuid,
  p_total numeric
)
returns table(visitas integer, total_gastado numeric, puntos_lealtad integer)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_rol text := coalesce(auth.jwt() ->> 'role', '');
  v_tenant uuid;
  v_ppp numeric := 0;
  v_puntos integer := 0;
begin
  if v_rol = 'authenticated' then
    v_tenant := public.get_restaurante_id();
    if v_tenant is null or v_tenant is distinct from p_restaurante_id then
      raise exception 'registrar_visita_cliente: tenant inválido para este usuario';
    end if;
  elsif v_rol = 'anon' then
    raise exception 'registrar_visita_cliente: no autorizado';
  end if;

  if p_venta_id is null or p_cliente_id is null or p_restaurante_id is null then
    raise exception 'registrar_visita_cliente: faltan parámetros (venta, cliente, tenant)';
  end if;

  -- Regla de puntos del tenant (0 u omitida = apagada).
  select coalesce(c.pesos_por_punto, 0) into v_ppp
  from public.configuracion c
  where c.restaurante_id = p_restaurante_id
  limit 1;
  if coalesce(v_ppp, 0) > 0 then
    v_puntos := floor(greatest(coalesce(p_total, 0), 0) / v_ppp)::int;
  end if;

  -- Candado contra carreras multi-terminal (patrón decrementar_stock).
  perform 1
    from public.clientes c
   where c.id = p_cliente_id
     and c.restaurante_id = p_restaurante_id
     for update;
  if not found then
    raise exception 'registrar_visita_cliente: cliente inexistente en el tenant';
  end if;

  -- Idempotencia: si el ledger ya tiene esta venta, es un reintento de la
  -- cola tras un timeout post-commit → devolver estado actual sin recontar.
  begin
    insert into public.crm_visitas (restaurante_id, venta_id, cliente_id, total, puntos)
    values (p_restaurante_id, p_venta_id, p_cliente_id, coalesce(p_total, 0), v_puntos);
  exception when unique_violation then
    return query
      select c.visitas, c.total_gastado, c.puntos_lealtad
        from public.clientes c
       where c.id = p_cliente_id;
    return;
  end;

  return query
  update public.clientes c
     set visitas        = coalesce(c.visitas, 0) + 1,
         total_gastado  = coalesce(c.total_gastado, 0) + coalesce(p_total, 0),
         puntos_lealtad = coalesce(c.puntos_lealtad, 0) + v_puntos
   where c.id = p_cliente_id
     and c.restaurante_id = p_restaurante_id
  returning c.visitas, c.total_gastado, c.puntos_lealtad;
end;
$$;

revoke all on function public.registrar_visita_cliente(bigint, bigint, uuid, numeric) from public;
revoke all on function public.registrar_visita_cliente(bigint, bigint, uuid, numeric) from anon;
grant execute on function public.registrar_visita_cliente(bigint, bigint, uuid, numeric) to authenticated;
grant execute on function public.registrar_visita_cliente(bigint, bigint, uuid, numeric) to service_role;

-- ── Realtime: acumulación en vivo entre terminales ────────────────────────────
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'clientes'
  ) then
    alter publication supabase_realtime add table public.clientes;
  end if;
end $$;

alter table public.clientes replica identity full;
