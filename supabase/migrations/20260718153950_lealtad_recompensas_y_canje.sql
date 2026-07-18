-- ── Lealtad libre: el dueño define sus recompensas ───────────────────────────
-- Catálogo por tenant en configuracion (solo Admin lo edita desde Configuración):
-- [{ id: number, nombre: text, costo_puntos: number, activo: bool }]
alter table public.configuracion
  add column if not exists recompensas jsonb not null default '[]'::jsonb;

-- Ledger de canjes: idempotencia (PK restaurante+canje) + historial auditable.
-- Solo la RPC (security definer) escribe; authenticated lee su tenant.
create table if not exists public.crm_canjes (
  restaurante_id uuid not null,
  canje_id bigint not null,
  cliente_id bigint not null references public.clientes(id) on delete cascade,
  puntos integer not null,
  descripcion text,
  fecha timestamptz not null default now(),
  primary key (restaurante_id, canje_id)
);

alter table public.crm_canjes enable row level security;

drop policy if exists crm_canjes_select_tenant on public.crm_canjes;
create policy crm_canjes_select_tenant on public.crm_canjes
  for select to authenticated
  using (restaurante_id = public.get_restaurante_id());

-- ── RPC atómica: canjear puntos por una recompensa ───────────────────────────
-- Hardening multi-tenant idéntico a registrar_visita_cliente. FOR UPDATE sobre
-- el cliente; si no alcanza puntos lanza excepción (la cola la clasifica como
-- error PERMANENTE → dead-letter, sin reintentos que dupliquen).
create or replace function public.canjear_puntos(
  p_canje_id bigint,
  p_cliente_id bigint,
  p_restaurante_id uuid,
  p_puntos integer,
  p_descripcion text default null
)
returns table(puntos_lealtad integer)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_rol text := coalesce(auth.jwt() ->> 'role', '');
  v_tenant uuid;
  v_actual integer;
begin
  if v_rol = 'authenticated' then
    v_tenant := public.get_restaurante_id();
    if v_tenant is null or v_tenant is distinct from p_restaurante_id then
      raise exception 'canjear_puntos: tenant inválido para este usuario';
    end if;
  elsif v_rol = 'anon' then
    raise exception 'canjear_puntos: no autorizado';
  end if;

  if p_canje_id is null or p_cliente_id is null or p_restaurante_id is null
     or coalesce(p_puntos, 0) <= 0 then
    raise exception 'canjear_puntos: faltan parámetros o puntos inválidos';
  end if;

  select c.puntos_lealtad into v_actual
    from public.clientes c
   where c.id = p_cliente_id
     and c.restaurante_id = p_restaurante_id
   for update;
  if not found then
    raise exception 'canjear_puntos: cliente inexistente en el tenant';
  end if;

  -- Idempotencia: reintento de la cola tras timeout post-commit → estado actual.
  begin
    insert into public.crm_canjes (restaurante_id, canje_id, cliente_id, puntos, descripcion)
    values (p_restaurante_id, p_canje_id, p_cliente_id, p_puntos, p_descripcion);
  exception when unique_violation then
    return query
      select c.puntos_lealtad from public.clientes c where c.id = p_cliente_id;
    return;
  end;

  if coalesce(v_actual, 0) < p_puntos then
    raise exception 'canjear_puntos: puntos insuficientes (tiene %, requiere %)',
      coalesce(v_actual, 0), p_puntos;
  end if;

  return query
  update public.clientes c
     set puntos_lealtad = coalesce(c.puntos_lealtad, 0) - p_puntos
   where c.id = p_cliente_id
     and c.restaurante_id = p_restaurante_id
  returning c.puntos_lealtad;
end;
$$;

revoke all on function public.canjear_puntos(bigint, bigint, uuid, integer, text) from public;
revoke all on function public.canjear_puntos(bigint, bigint, uuid, integer, text) from anon;
grant execute on function public.canjear_puntos(bigint, bigint, uuid, integer, text) to authenticated;
grant execute on function public.canjear_puntos(bigint, bigint, uuid, integer, text) to service_role;
