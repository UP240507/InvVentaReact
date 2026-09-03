-- El empaque de compra: "1 arpilla = 30 kg".
--
-- EL FALLO QUE VIENE A CERRAR
--
-- Hoy, con `naranja.unidad = 'kg'`, recibir una arpilla obliga a teclear
-- `cantidad = 30` y `precio_unitario = precio_de_la_arpilla / 30`: una DIVISION
-- HECHA A MANO. Y ese numero no se queda en la recepcion: entra al costo
-- promedio ponderado (RecepcionScreen.jsx:87-105), de ahi al costo de cada
-- platillo que lleve naranja, y de ahi al margen.
--
-- Nada valida la unidad ni el orden de magnitud: un 1500 donde iba 50 se
-- promedia sin quejarse. El promedio ponderado no olvida -el error se diluye
-- despacio en vez de corregirse- y corregir una recepcion es otra operacion,
-- no un "editar fila". Y como en AZUL no se hace conteo fisico, NADA corrige
-- nunca el inventario contra la realidad: no hay red debajo.
--
-- Ver claude/DISENO_ALCANCE_INVENTARIO.md §4 y claude/ALCANCE_0.3.0.md §1.
--
-- POR QUE CUELGA DEL PROVEEDOR Y NO DEL PRODUCTO
--
-- Decision de Chris, 01-sep. Cada proveedor empaca distinto: la misma naranja
-- viene en arpilla de 30 kg de uno y en reja de 20 de otro. Colgarlo del
-- producto obligaria a rehacerlo el dia que haya dos proveedores del mismo
-- insumo, que en un restaurante es el primer mes.
--
-- LO QUE ESTA TABLA NO ES
--
-- No es una lista de precios. El precio vive en la linea de la orden, que es
-- donde cambia. Aqui solo esta CUANTAS unidades de consumo trae un empaque,
-- que es un dato fisico y estable.
--
-- Y `factor` esta en la unidad de CONSUMO del producto, la misma que usa la
-- receta -esa es la regla del diseno: la unidad de inventario es la unidad de
-- consumo-. Si la receta cuenta piezas, el empaque es "1 caja = 360 piezas",
-- un conteo fijo, y no un peso: kg -> piezas es un promedio que miente un poco
-- y el error se acumula porque el consumo es discreto.
--
-- Aguanta la segunda pasada: `if not exists` en todo, y la politica se crea
-- solo si falta.

create table if not exists public.proveedor_producto (
  id             bigint generated always as identity primary key,
  restaurante_id uuid    not null,
  proveedor_id   bigint  not null references public.proveedores(id) on delete cascade,
  producto_id    bigint  not null references public.productos(id)   on delete cascade,
  -- Como lo llama quien compra: "arpilla", "reja", "caja de 12".
  nombre         text    not null,
  -- Cuantas unidades de consumo del producto trae UN empaque. Nunca cero:
  -- un factor 0 haria una division por cero al derivar el precio unitario.
  factor         numeric not null check (factor > 0),
  activo         boolean not null default true,
  created_at     timestamptz not null default now()
);

-- Un empaque se identifica por su nombre dentro de la pareja proveedor-producto.
create unique index if not exists proveedor_producto_unico
  on public.proveedor_producto (restaurante_id, proveedor_id, producto_id, nombre);

-- El acceso real: "que empaques tiene este proveedor para este insumo".
create index if not exists proveedor_producto_busqueda
  on public.proveedor_producto (restaurante_id, proveedor_id, producto_id)
  where activo;

alter table public.proveedor_producto enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
     where schemaname = 'public'
       and tablename  = 'proveedor_producto'
       and policyname = 'tenant_proveedor_producto'
  ) then
    create policy tenant_proveedor_producto on public.proveedor_producto
      for all to authenticated
      using (restaurante_id = public.get_restaurante_id())
      with check (restaurante_id = public.get_restaurante_id());
  end if;
end $$;

-- ── LOS GRANTS, UNO POR UNO Y COMPROBADOS ───────────────────────────────────
--
-- `revoke all ... from public` NO toca los grants por ROL, y `authenticated`
-- recibe los suyos por privilegios por defecto. Es exactamente el hueco del
-- 22-ago con `folios_reservados`.
--
-- Y aqui volvio a morder: la primera version de esta migracion hacia
-- `grant select, insert, update` creyendo que con eso bastaba, y al
-- COMPROBARLO en la base -no al leerlo- `authenticated` seguia teniendo
-- DELETE, REFERENCES y TRIGGER, que ya traia de fabrica. Un grant no quita
-- nada: hay que revocar.
revoke all    on public.proveedor_producto from public;
revoke all    on public.proveedor_producto from anon;
revoke delete, references, trigger, truncate
              on public.proveedor_producto from authenticated;

-- Sin `delete`: un empaque no se borra, se apaga con `activo`. Borrarlo dejaria
-- ordenes viejas hablando de una "arpilla" que ya no existe en ningun sitio.
grant select, insert, update on public.proveedor_producto to authenticated;

comment on table public.proveedor_producto is
  'Empaques de compra por pareja proveedor-producto: cuantas unidades de '
  'CONSUMO trae un empaque ("1 arpilla = 30 kg"). Existe para que la linea de '
  'la orden no obligue a dividir a mano, porque esa division entra al costo '
  'promedio ponderado y nada la valida. Ver claude/DISENO_ALCANCE_INVENTARIO.md';

comment on column public.proveedor_producto.factor is
  'Unidades de consumo por empaque, en la unidad del producto. Siempre > 0.';
