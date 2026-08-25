-- --- PROCEDENCIA (recuperado el 24-ago) ------------------------------------
--
-- Esta migracion estaba APLICADA en la base de AZUL desde el 13-ago y su
-- archivo nunca llego al repositorio. El cuerpo que sigue se recupero literal
-- de `supabase_migrations.schema_migrations`, no se reescribio: es exactamente
-- lo que corre hoy en produccion.
--
-- POR QUE IMPORTA QUE EL ARCHIVO EXISTA
--
-- Sin ella, cualquier base levantada desde el repo -el tenant desechable de
-- las E2E, el segundo cliente- nace con el descuento de stock NO idempotente:
-- un reintento del POS descuenta dos veces y nada da error. La base de AZUL y
-- el repositorio decian cosas distintas, que es la peor forma de tener razon.
--
-- QUE HACE
--
-- Anade `stock_salidas`, un ledger de "esta venta ya desconto inventario", y
-- reescribe `decrementar_stock` para consultarlo antes de tocar `productos`.
-- Si la venta ya estaba en el ledger, devuelve el stock actual sin restar.
--
-- OJO: la migracion siguiente (20260813190704) SUSTITUYE esta tabla por una
-- con clave `origen` en vez de `venta_id`. Las dos se conservan porque las dos
-- se aplicaron; para una base nueva, el estado final es el de la segunda.
-- ---------------------------------------------------------------------------

create table if not exists public.stock_salidas (
  restaurante_id uuid not null references public.restaurantes(id) on delete cascade,
  venta_id       bigint not null,
  aplicado_en    timestamptz not null default now(),
  primary key (restaurante_id, venta_id)
);

alter table public.stock_salidas enable row level security;

drop policy if exists tenant_stock_salidas on public.stock_salidas;
create policy tenant_stock_salidas on public.stock_salidas
  for all
  using (restaurante_id = public.get_restaurante_id())
  with check (restaurante_id = public.get_restaurante_id());

comment on table public.stock_salidas is
  'Ledger de idempotencia de decrementar_stock: una fila por venta que ya descontó inventario. Mismo patrón que crm_visitas y crm_canjes.';

drop function if exists public.decrementar_stock(jsonb, uuid, text, text);

create function public.decrementar_stock(
  p_items          jsonb,
  p_restaurante_id uuid,
  p_referencia     text default null,
  p_usuario        text default null,
  p_venta_id       bigint default null
)
returns table(producto_id bigint, nuevo_stock numeric, insuficiente boolean)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  r record;
  v_rol text := coalesce(auth.jwt() ->> 'role', '');
  v_tenant uuid;
  v_stock_ant numeric;
  v_ya_aplicado boolean := false;
begin
  if v_rol = 'authenticated' then
    v_tenant := public.get_restaurante_id();
    if v_tenant is null or v_tenant is distinct from p_restaurante_id then
      raise exception 'decrementar_stock: tenant inválido para este usuario';
    end if;
  elsif v_rol = 'anon' then
    raise exception 'decrementar_stock: no autorizado';
  end if;

  if p_venta_id is not null then
    insert into public.stock_salidas (restaurante_id, venta_id)
    values (p_restaurante_id, p_venta_id)
    on conflict (restaurante_id, venta_id) do nothing;

    if not found then
      v_ya_aplicado := true;
    end if;
  end if;

  if v_ya_aplicado then
    for r in
      select (e->>'productoId')::bigint as pid
      from jsonb_array_elements(p_items) as e
      where coalesce(e->>'productoId', e->>'id_producto') is not null
    loop
      select p.id, p.stock, (p.stock < 0)
        into producto_id, nuevo_stock, insuficiente
        from public.productos p
       where p.id = r.pid
         and p.restaurante_id = p_restaurante_id;
      if found then
        return next;
      end if;
    end loop;
    return;
  end if;

  for r in
    select (e->>'productoId')::bigint as pid,
           coalesce(nullif(e->>'cantidad','')::numeric, 0) as cant
    from jsonb_array_elements(p_items) as e
    where coalesce(e->>'productoId', e->>'id_producto') is not null
  loop
    update public.productos p
       set stock = coalesce(p.stock, 0) - r.cant
     where p.id = r.pid
       and p.restaurante_id = p_restaurante_id
    returning p.id, p.stock, p.stock + r.cant
         into producto_id, nuevo_stock, v_stock_ant;

    if found then
      insuficiente := nuevo_stock < 0;

      insert into public.movimientos
        (id, tipo, producto_id, cantidad, referencia, fecha, usuario,
         stock_anterior, stock_nuevo, restaurante_id)
      values
        (nextval('public.movimientos_srv_id_seq'), 'Salida POS', r.pid, r.cant,
         p_referencia, now(), coalesce(p_usuario, 'POS'),
         v_stock_ant, nuevo_stock, p_restaurante_id);

      return next;
    end if;
  end loop;
end;
$$;

revoke all on function public.decrementar_stock(jsonb, uuid, text, text, bigint) from public;
revoke all on function public.decrementar_stock(jsonb, uuid, text, text, bigint) from anon;
grant execute on function public.decrementar_stock(jsonb, uuid, text, text, bigint) to authenticated;
grant execute on function public.decrementar_stock(jsonb, uuid, text, text, bigint) to service_role;
