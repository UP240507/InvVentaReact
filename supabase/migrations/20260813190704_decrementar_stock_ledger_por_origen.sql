-- --- PROCEDENCIA (recuperado el 24-ago) ------------------------------------
--
-- Igual que 20260813190459: aplicada en AZUL el 13-ago, nunca commiteada.
-- Cuerpo recuperado literal de `supabase_migrations.schema_migrations`.
--
-- QUE CORRIGE DE LA ANTERIOR, Y POR QUE NO ES UN DETALLE
--
-- La version anterior indexaba el ledger por `venta_id`. Pero en servicio de
-- MESA el descuento de inventario no lo dispara la venta: lo dispara la
-- COMANDA (`CMD-7`) cuando se manda a produccion, que ocurre mucho antes de
-- que exista una venta -y puede no existir nunca, si la mesa se cancela-.
-- Con `venta_id` esas salidas entraban con `p_venta_id` nulo, es decir, SIN
-- proteccion de idempotencia: reenviar la misma comanda descontaba otra vez.
--
-- Por eso aqui la tabla se tira y se rehace con `origen text`: un identificador
-- del hecho que descuenta, sea comanda o venta. Es un `drop table`, no un
-- `alter`, porque el 13-ago la tabla tenia horas de vida y ninguna fila que
-- valiera la pena conservar.
--
-- Este es el estado que corre hoy en AZUL.
-- ---------------------------------------------------------------------------

drop table if exists public.stock_salidas;

create table public.stock_salidas (
  restaurante_id uuid not null references public.restaurantes(id) on delete cascade,
  origen         text not null,
  aplicado_en    timestamptz not null default now(),
  primary key (restaurante_id, origen)
);

alter table public.stock_salidas enable row level security;

create policy tenant_stock_salidas on public.stock_salidas
  for all
  using (restaurante_id = public.get_restaurante_id())
  with check (restaurante_id = public.get_restaurante_id());

comment on table public.stock_salidas is
  'Ledger de idempotencia de decrementar_stock: una fila por hecho que ya descontó inventario. `origen` es texto y no un id de venta porque en mesa el descuento lo dispara la COMANDA (CMD-7) al mandar a produccion, no la venta. Mismo patron que crm_visitas y crm_canjes.';

drop function if exists public.decrementar_stock(jsonb, uuid, text, text, bigint);
drop function if exists public.decrementar_stock(jsonb, uuid, text, text);

create function public.decrementar_stock(
  p_items          jsonb,
  p_restaurante_id uuid,
  p_referencia     text default null,
  p_usuario        text default null,
  p_origen         text default null
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

  if p_origen is not null and btrim(p_origen) <> '' then
    insert into public.stock_salidas (restaurante_id, origen)
    values (p_restaurante_id, p_origen)
    on conflict (restaurante_id, origen) do nothing;

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

revoke all on function public.decrementar_stock(jsonb, uuid, text, text, text) from public;
revoke all on function public.decrementar_stock(jsonb, uuid, text, text, text) from anon;
grant execute on function public.decrementar_stock(jsonb, uuid, text, text, text) to authenticated;
grant execute on function public.decrementar_stock(jsonb, uuid, text, text, text) to service_role;
