-- El cotejo de precios contra el catalogo descuenta los extras de la linea.
--
-- Desde el 01-oct el precio de los extras de un modificador va DENTRO del
-- precio de la linea (`lineaConOpciones`, lib/Modificadores.js): un latte de
-- 65 con un shot de 15 viaja con `precio_venta: 80` y `precio_extras: 15`.
--
-- La aritmetica del total no cambia: suma `cantidad * precio`, y ese precio ya
-- es el que se cobro. Lo que cambia es el cotejo informativo con el catalogo,
-- que comparaba `recetas.precio_venta` (65) con el precio cobrado (80) y
-- habria apuntado CADA bebida con extra como divergencia de precio. Una
-- auditoria que marca todo deja de leerse, y entonces el dia que alguien
-- cambie de verdad un precio a mano nadie lo ve.
--
-- Ahora se coteja el catalogo contra `precio - precio_extras`, y si hay
-- divergencia el renglon lleva tambien los extras, para que quien lo lea
-- sepa de donde sale la cifra.
--
-- Una linea sin `precio_extras` (todas las ventas anteriores, y todo platillo
-- sin modificadores) cuenta 0: el comportamiento es exactamente el de antes.
-- Por eso esta migracion se puede aplicar antes o despues de instalar la app.
--
-- `create or replace` conserva los privilegios. Aguanta la segunda pasada.

CREATE OR REPLACE FUNCTION public.verificar_total_venta()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_tol      numeric := 0.02;
  v_bruto    numeric := 0;
  v_iva_rate numeric;
  v_incluye  boolean;
  v_cfg      jsonb;
  v_base     numeric;
  v_esperado numeric;
  v_precios  jsonb   := '[]'::jsonb;
  v_arit     jsonb;
  v_mal_arit boolean := false;
  r          record;
begin
  if jsonb_typeof(new.items) is distinct from 'array'
     or jsonb_array_length(new.items) = 0 then
    new.total_divergente := false;
    new.divergencia := jsonb_build_object('motivo', 'sin items verificables');
    return new;
  end if;

  select to_jsonb(c) into v_cfg
  from public.configuracion c
  where c.restaurante_id = new.restaurante_id
  limit 1;

  v_iva_rate := coalesce(nullif(v_cfg->>'iva','')::numeric, 0.16);
  v_incluye  := coalesce(nullif(v_cfg->>'precios_incluyen_iva','')::boolean, true);

  for r in
    select coalesce((it->>'cantidad')::numeric, 0) as cant,
           coalesce(nullif(it->>'precio_venta','')::numeric,
                    nullif(it->>'precio','')::numeric, 0) as precio,
           coalesce(nullif(it->>'precio_extras','')::numeric, 0) as extras,
           case
             when nullif(it->>'receta_id','') ~ '^[0-9]+$'
               then (it->>'receta_id')::bigint
             when nullif(it->>'id','') ~ '^[0-9]+$'
               then (it->>'id')::bigint
             else null
           end as receta_id,
           it->>'nombre' as nombre,
           it->'descuento' as desc_linea
    from jsonb_array_elements(new.items) as it
  loop
    declare
      v_linea numeric := r.cant * r.precio;
      v_dtipo text    := r.desc_linea->>'tipo';
      v_dval  numeric := coalesce(nullif(r.desc_linea->>'valor','')::numeric, 0);
      v_cat   numeric;
    begin
      if v_dtipo = 'cortesia' then
        v_linea := 0;
      elsif v_dtipo in ('pct', 'porcentaje') then
        v_linea := v_linea - (v_linea * least(100, greatest(0, v_dval)) / 100);
      elsif v_dtipo = 'monto' then
        v_linea := greatest(0, v_linea - v_dval);
      end if;

      v_bruto := v_bruto + v_linea;

      if r.receta_id is not null then
        select rc.precio_venta into v_cat
        from public.recetas rc
        where rc.id = r.receta_id
          and rc.restaurante_id = new.restaurante_id;

        if v_cat is not null and abs(v_cat - (r.precio - r.extras)) > v_tol then
          v_precios := v_precios || jsonb_build_object(
            'receta_id', r.receta_id,
            'nombre',    r.nombre,
            'cobrado',   r.precio,
            'catalogo',  v_cat,
            'extras',    r.extras
          );
        end if;
      end if;
    end;
  end loop;

  v_base := case when v_incluye then v_bruto / (1 + v_iva_rate) else v_bruto end;
  v_base := v_base - coalesce(new.descuento, 0);

  v_esperado := round(v_base + (v_base * v_iva_rate) + coalesce(new.propina, 0), 2);
  v_mal_arit := abs(coalesce(new.total, 0) - v_esperado) > v_tol;

  v_arit := jsonb_build_object(
    'total_guardado',       coalesce(new.total, 0),
    'total_esperado',       v_esperado,
    'diferencia',           round(coalesce(new.total, 0) - v_esperado, 2),
    'bruto_lineas',         round(v_bruto, 2),
    'iva_rate',             v_iva_rate,
    'precios_incluyen_iva', v_incluye
  );

  new.total_divergente := v_mal_arit;
  new.divergencia := case
    when v_mal_arit or jsonb_array_length(v_precios) > 0
      then jsonb_build_object('aritmetica', v_arit, 'precios', v_precios)
    else null
  end;

  return new;
end;
$function$;
