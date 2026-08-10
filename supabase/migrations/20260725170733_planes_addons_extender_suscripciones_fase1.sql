-- Fase 1 (monetización): catálogo de planes/addons + extensión IN PLACE de la
-- suscripciones legada (viva y consumida por useAuthStore/SuscripcionRoute).
-- Precios en CENTAVOS MXN sin IVA. Anualidad única. Dispositivos ilimitados:
-- el único enforcement duro es EMPLEADOS; módulos premium se ocultan por plan/addon.
-- Aplicada en vivo el 25-jul-2026 vía MCP (versión 20260725170733).

create table public.planes (
  id text primary key,                        -- 'fundador' | 'basico' | 'pro' | 'empresarial'
  nombre text not null,
  precio_anual_centavos integer not null,     -- sin IVA
  limites jsonb not null default '{}'::jsonb, -- { "empleados": 10, "modulos": ["lealtad"] }
  stripe_price_id text,
  activo boolean not null default true,       -- fundador se apaga tras 10 clientes
  orden integer not null default 0
);

create table public.addons (
  id text primary key,                        -- 'lealtad' | 'cfdi'
  nombre text not null,
  precio_anual_centavos integer not null,
  disponible boolean not null default true,   -- cfdi=false hasta que exista
  stripe_price_id text
);

-- Seed (PRECIOS_InvVenta.md, jul-2026)
insert into public.planes (id, nombre, precio_anual_centavos, limites, activo, orden) values
  ('fundador',    'Fundador',    399000,  '{"empleados": 10, "modulos": []}',                          true, 1),
  ('basico',      'Básico',      499000,  '{"empleados": 10, "modulos": []}',                          true, 2),
  ('pro',         'Pro',         799000,  '{"empleados": 25, "modulos": ["lealtad"]}',                 true, 3),
  ('empresarial', 'Empresarial', 1199000, '{"empleados": 60, "modulos": ["lealtad","multisucursal"]}', true, 4);

insert into public.addons (id, nombre, precio_anual_centavos, disponible) values
  ('lealtad', 'Sistema de Lealtad',  99000, true),
  ('cfdi',    'Facturación CFDI',   199000, false);

-- ── Extender suscripciones (legada) sin romper consumidores ──────────────────
-- Se conserva: plan (text), estado ('activo'), fecha_inicio, fecha_vencimiento.
alter table public.suscripciones
  add column dias_gracia integer not null default 3,           -- App.jsx ya lo lee; ahora existe
  add column addons jsonb not null default '[]'::jsonb,        -- ["lealtad"]
  add column trial_hasta date,
  add column stripe_customer_id text,
  add column stripe_subscription_id text,
  add column cancelar_al_final boolean not null default false,
  add column updated_at timestamptz not null default now();

alter table public.suscripciones
  add constraint suscripciones_plan_fk foreign key (plan) references public.planes(id),
  add constraint suscripciones_estado_chk check (estado in ('trial','activo','moroso','suspendido','cancelado')),
  add constraint suscripciones_restaurante_unica unique (restaurante_id);

create or replace function public.touch_suscripciones()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end; $$;
alter function public.touch_suscripciones() set search_path = '';
create trigger trg_touch_suscripciones
  before update on public.suscripciones
  for each row execute function public.touch_suscripciones();

-- ── RLS ──────────────────────────────────────────────────────────────────────
-- La política legada era FOR ALL → el tenant podía EDITAR su propia suscripción
-- (alargarse la vigencia). Escrituras: SOLO service_role (webhook Stripe / EFs).
drop policy tenant_suscripciones on public.suscripciones;
create policy suscripciones_select_propia on public.suscripciones
  for select to authenticated
  using (restaurante_id = public.get_restaurante_id());

alter table public.planes enable row level security;
alter table public.addons enable row level security;
create policy planes_select on public.planes
  for select to authenticated using (true);
create policy addons_select on public.addons
  for select to authenticated using (true);

-- AZUL ya está en 'pro' (incluye lealtad, 25 empleados): no se toca su fila.
