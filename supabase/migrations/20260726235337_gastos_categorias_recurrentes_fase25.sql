-- ─── FASE 2.5: GASTOS Y COSTOS FIJOS ────────────────────────────────────────
-- Hasta ahora el sistema solo conocía el costo de los INSUMOS, así que el
-- Dashboard podía dar MARGEN BRUTO pero no utilidad. Estas tablas cierran esa
-- mitad: luz, agua, renta, internet, mantenimiento, impuestos.
--
-- Decisión de Chris (25-jul): entra ANTES del lanzamiento. Un dueño que ve
-- "margen bruto" y cree estar viendo su utilidad decide con una cifra
-- incompleta, y eso es peor que no darle la cifra.
--
-- Aplicada en vivo el 26-jul-2026 vía MCP (versión 20260726235337).

-- ── Categorías de gasto ─────────────────────────────────────────────────────
-- `fijo` distingue lo que se paga pase lo que pase (renta) de lo que escala con
-- la venta (comisiones). Sirve para leer la estructura de costos, no solo el
-- total: dos negocios con el mismo gasto pero distinta proporción fijo/variable
-- aguantan una mala racha de forma muy distinta.
create table public.categorias_gasto (
  id            text primary key,
  nombre        text not null,
  fijo          boolean not null default true,
  orden         integer not null default 0,
  -- Las de semilla no se borran: son el vocabulario común de los reportes.
  es_sistema    boolean not null default false,
  restaurante_id uuid references public.restaurantes(id) on delete cascade
);

insert into public.categorias_gasto (id, nombre, fijo, orden, es_sistema) values
  ('renta',          'Renta',                   true,  1, true),
  ('servicios',      'Servicios (luz, agua, gas)', false, 2, true),
  ('internet',       'Internet y telefonía',    true,  3, true),
  ('nomina',         'Nómina',                  true,  4, true),
  ('mantenimiento',  'Mantenimiento',           false, 5, true),
  ('insumos_no_inv', 'Insumos no inventariados', false, 6, true),
  ('impuestos',      'Impuestos y derechos',    false, 7, true),
  ('comisiones',     'Comisiones bancarias',    false, 8, true),
  ('otros',          'Otros',                   false, 9, true);

-- ── Gastos ──────────────────────────────────────────────────────────────────
create table public.gastos (
  id             bigint primary key,
  restaurante_id uuid not null references public.restaurantes(id) on delete cascade,
  categoria_id   text not null references public.categorias_gasto(id),
  concepto       text not null,
  -- El monto se guarda como numeric (mismo criterio que ventas/nominas), no en
  -- centavos: aquí no hay pasarela de por medio y la app ya redondea a 2.
  monto          numeric(12,2) not null check (monto >= 0),
  fecha          date not null,
  proveedor      text,
  nota           text,
  comprobante_url text,
  -- 'manual' | 'recurrente' | 'nomina'. El origen importa: un gasto de nómina
  -- NO se edita aquí (se corrige en Nóminas) y no se puede duplicar a mano.
  origen         text not null default 'manual'
                 check (origen in ('manual','recurrente','nomina')),
  -- Trazabilidad hacia la fuente que lo generó (plantilla o nómina).
  origen_ref     text,
  -- 'pendiente' = generado por plantilla, esperando el monto real del recibo.
  estado         text not null default 'pagado'
                 check (estado in ('pendiente','pagado')),
  activo         boolean not null default true,
  usuario        text,
  created_at     timestamptz not null default now()
);

-- Un gasto de nómina o de plantilla no puede entrar dos veces para el mismo
-- origen: es la barrera dura contra el doble conteo (G.5). El índice es
-- parcial porque los gastos manuales sí pueden repetirse legítimamente.
create unique index gastos_origen_unico
  on public.gastos (restaurante_id, origen, origen_ref)
  where origen <> 'manual' and origen_ref is not null;

create index gastos_por_fecha on public.gastos (restaurante_id, fecha desc);

-- ── Plantillas de gasto recurrente ──────────────────────────────────────────
-- Sin esto el dueño recaptura el recibo de luz doce veces al año y abandona la
-- pantalla al tercer mes.
create table public.gastos_recurrentes (
  id             bigint primary key,
  restaurante_id uuid not null references public.restaurantes(id) on delete cascade,
  categoria_id   text not null references public.categorias_gasto(id),
  concepto       text not null,
  monto_estimado numeric(12,2) not null default 0 check (monto_estimado >= 0),
  dia_del_mes    integer not null default 1 check (dia_del_mes between 1 and 28),
  -- Se topa en 28 a propósito: un recurrente el día 30 se saltaría febrero.
  activo         boolean not null default true,
  ultima_generacion date,
  created_at     timestamptz not null default now()
);

-- ── RLS: mismo patrón por tenant que el resto de tablas de datos ────────────
alter table public.gastos enable row level security;
alter table public.gastos_recurrentes enable row level security;
alter table public.categorias_gasto enable row level security;

create policy tenant_gastos on public.gastos
  for all to authenticated
  using (restaurante_id = public.get_restaurante_id())
  with check (restaurante_id = public.get_restaurante_id());

create policy tenant_gastos_recurrentes on public.gastos_recurrentes
  for all to authenticated
  using (restaurante_id = public.get_restaurante_id())
  with check (restaurante_id = public.get_restaurante_id());

-- Categorías: las de sistema las ve todo el mundo; las propias, solo su tenant.
create policy categorias_gasto_select on public.categorias_gasto
  for select to authenticated
  using (es_sistema or restaurante_id = public.get_restaurante_id());

create policy categorias_gasto_escribe_propias on public.categorias_gasto
  for all to authenticated
  using (not es_sistema and restaurante_id = public.get_restaurante_id())
  with check (not es_sistema and restaurante_id = public.get_restaurante_id());
