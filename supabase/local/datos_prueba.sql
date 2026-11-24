-- ─── DATOS DE PRUEBA DEL LOCAL DESECHABLE ───────────────────────────────────
--
-- Lo que `supabase/seed/plantilla_local.sql` deja fuera a proposito porque es
-- "el local concreto": empleados, mesas, insumos y recetas. Aqui se inventan
-- para que las E2E que escriben (flujo-pos, realtime-turnos) tengan donde
-- escribir sin tocar AZUL.
--
-- TODO ES INVENTADO. Ningun nombre, PIN ni precio sale de AZUL. Los PIN son
-- conocidos a proposito: es una base que vive en Docker en tu maquina y se
-- tira con cada `npm run base:local`.
--
-- Lo corre `scripts/base-local.mjs` despues de crear el restaurante y la
-- plantilla, con `:rid` = el id del restaurante. Las cuentas de Auth de los
-- empleados no van aqui: las crea el script por la API de Auth local, igual
-- que lo hace `crear-empleado-auth` en produccion, para que el login por PIN
-- recorra el mismo camino que en una caja de verdad.

begin;

-- ── 1 · El catalogo de planes ───────────────────────────────────────────────
--
-- `planes` es catalogo global, no dato de un local, y por eso no viene en el
-- volcado de esquema. Sin el, `suscripciones.plan` no tiene a que apuntar
-- (FK `suscripciones_plan_fk`). Copiado de la base viva el 23-nov SIN
-- `stripe_price_id`: en local no se cobra.
insert into public.planes (id, nombre, precio_anual_centavos, limites, activo, orden) values
  ('fundador',    'Fundador',     399000, '{"modulos":[],"empleados":10}', true, 1),
  ('basico',      'Básico',       499000, '{"modulos":[],"empleados":10}', true, 2),
  ('pro',         'Pro',          799000, '{"modulos":["lealtad"],"empleados":25}', true, 3),
  ('empresarial', 'Empresarial', 1199000, '{"modulos":["lealtad","multisucursal"],"empleados":60}', true, 4)
on conflict (id) do nothing;

-- Pro y no Basico: asi la pantalla de lealtad tambien se puede probar en local.
insert into public.suscripciones (restaurante_id, plan, estado, fecha_vencimiento)
values (:rid, 'pro', 'activo', current_date + 365);

-- ── 2 · El nombre del local y el enrutamiento ───────────────────────────────
--
-- Las dos zonas (Cocina y Barra) ya vienen por omision en la columna; aqui
-- solo se reparte el menu de la plantilla entre ellas.
update public.configuracion
   set nombre_empresa = 'Local de prueba',
       enrutamiento = '{"Desayunos":"Cocina","Platos fuertes":"Cocina","Postres":"Cocina","Bebidas":"Barra"}'
 where restaurante_id = :rid;

-- ── 3 · Los empleados ───────────────────────────────────────────────────────
--
-- Cinco, todos de rol con PIN (los elevados entran con contrasena y para eso
-- esta el dueno). Seis digitos, como pide la puerta de autorizacion desde la
-- fase 1 (minimo 4) y como sugiere `e2e/helpers.js`.
--
-- El Capitan autoriza descuentos y salidas: es el que contesta los PIN de
-- encargado sin tener que entrar como dueno.
insert into public.staff (restaurante_id, nombre, puesto, rol, pin, activo) values
  (:rid, 'Caja Prueba',     'Cajero',             'Cajero',             '111111', true),
  (:rid, 'Mesero Prueba',   'Mesero',             'Mesero',             '222222', true),
  (:rid, 'Cocina Prueba',   'Chef',               'Chef',               '333333', true),
  (:rid, 'Barra Prueba',    'Barista',            'Barista',            '444444', true),
  (:rid, 'Capitan Prueba',  'Capitán de Meseros', 'Capitán de Meseros', '555555', true);

-- ── 4 · Las mesas ───────────────────────────────────────────────────────────
insert into public.mesas (restaurante_id, nombre, zona, capacidad) values
  (:rid, 'Mesa 1', 'Salón',   4),
  (:rid, 'Mesa 2', 'Salón',   4),
  (:rid, 'Mesa 3', 'Terraza', 2);

-- ── 5 · Los insumos ─────────────────────────────────────────────────────────
--
-- En las unidades de fabrica (g, ml, pz) y con stock de sobra, para que una
-- prueba no se atore en «sin existencias» a la tercera vuelta.
insert into public.productos (restaurante_id, codigo, nombre, categoria, unidad, stock, min, precio) values
  (:rid, 'INS-01', 'Tortilla de maíz', 'Abarrotes',         'pz', 5000,  100, 0.80),
  (:rid, 'INS-02', 'Carne de res',     'Carnes',            'g',  50000, 2000, 0.25),
  (:rid, 'INS-03', 'Queso fresco',     'Lácteos',           'g',  20000, 1000, 0.18),
  (:rid, 'INS-04', 'Huevo',            'Abarrotes',         'pz', 600,   30,  3.00),
  (:rid, 'INS-05', 'Frijol cocido',    'Abarrotes',         'g',  20000, 1000, 0.05),
  (:rid, 'INS-06', 'Café molido',      'Abarrotes',         'g',  10000, 500, 0.40),
  (:rid, 'INS-07', 'Leche',            'Lácteos',           'ml', 40000, 2000, 0.03),
  (:rid, 'INS-08', 'Naranja',          'Frutas y verduras', 'pz', 800,   40,  2.50),
  (:rid, 'INS-09', 'Harina para hot cakes', 'Abarrotes',    'g',  10000, 500, 0.06),
  (:rid, 'INS-10', 'Azúcar',           'Abarrotes',         'g',  10000, 500, 0.03);

-- ── 6 · Las recetas ─────────────────────────────────────────────────────────
--
-- Diez, cada una con su receta COMPLETA (ninguna cantidad pendiente), en la
-- forma que guarda RecetasScreen: `[{productoId, cantidad, merma}]`. Los
-- productoId se buscan por codigo y no se escriben a mano: el id lo pone la
-- identidad de la tabla.
with i as (
  select codigo, id from public.productos where restaurante_id = :rid
), r(nombre, codigo_pos, categoria, precio, partes) as (values
  ('Tacos de res',        'P-01', 'Platos fuertes', 95,  '[["INS-01",3],["INS-02",150]]'),
  ('Quesadilla',          'P-02', 'Platos fuertes', 55,  '[["INS-01",1],["INS-03",60]]'),
  ('Enfrijoladas',        'P-03', 'Platos fuertes', 85,  '[["INS-01",3],["INS-05",200],["INS-03",30]]'),
  ('Huevos al gusto',     'D-01', 'Desayunos',      80,  '[["INS-04",2],["INS-05",100],["INS-01",2]]'),
  ('Hot cakes',           'D-02', 'Desayunos',      75,  '[["INS-09",120],["INS-07",100],["INS-04",1]]'),
  ('Café americano',      'B-01', 'Bebidas',        35,  '[["INS-06",18]]'),
  ('Café con leche',      'B-02', 'Bebidas',        45,  '[["INS-06",18],["INS-07",150]]'),
  ('Jugo de naranja',     'B-03', 'Bebidas',        40,  '[["INS-08",3]]'),
  ('Agua fresca',         'B-04', 'Bebidas',        30,  '[["INS-08",1],["INS-10",20]]'),
  ('Arroz con leche',     'S-01', 'Postres',        45,  '[["INS-07",200],["INS-10",30]]')
)
insert into public.recetas (restaurante_id, nombre, codigo_pos, categoria, precio_venta, activo, insumos)
select :rid, r.nombre, r.codigo_pos, r.categoria, r.precio, true,
       (select jsonb_agg(jsonb_build_object(
                 'productoId', i.id,
                 'cantidad', (p->>1)::numeric,
                 'merma', 0) order by ord)
          from jsonb_array_elements(r.partes::jsonb) with ordinality as x(p, ord)
          join i on i.codigo = p->>0)
  from r;

-- Una receta cuyo insumo no se encontro quedaria con `insumos` nulo y seria
-- justo la «cantidad pendiente» que este archivo promete no tener.
do $$
begin
  if exists (select 1 from public.recetas where insumos is null) then
    raise exception 'Hay recetas sin insumos: revisa los codigos INS-xx';
  end if;
end $$;

commit;
