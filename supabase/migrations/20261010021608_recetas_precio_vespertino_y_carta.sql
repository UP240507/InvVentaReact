-- Carta de la manana y de la tarde (AZUL, 09-oct).
--
-- A las 2:00 cambia la carta: algunas bebidas cuestan distinto en la tarde
-- (agua de fruta, 34 en la manana y 38 en la tarde) y los desayunos no se
-- venden en la tarde ni las cenas en la manana. La hora es la misma
-- `configuracion.franja_corte` que ya parte el dia para los reportes.
--
-- 1. `recetas.precio_vespertino`: precio de la tarde. Null = el mismo todo el
--    dia. Es el unico caso que existe hoy, asi que es una columna y no una
--    tabla de listas de precio.
-- 2. `recetas.franja_carta`: 'matutino', 'vespertino' o null (todo el dia).
--    Solo decide que ensena la caja; no bloquea nada en el servidor.
-- 3. El cotejo de `verificar_total_venta` acepta el precio normal O el de la
--    tarde. No mira la hora: el precio se fija al pedir y la venta se cobra
--    despues, asi que una linea pedida a la 1:50 y cobrada a las 2:10 lleva
--    el de la manana con toda razon. Si tampoco cuadra con ninguno de los
--    dos, se apunta como antes, ahora con los dos precios del catalogo.
--
-- Compatible con la app instalada: las columnas nacen nulas y una app vieja
-- que guarda una receta sin ellas no las toca (el upsert solo escribe las
-- columnas que manda). Aguanta la segunda pasada: `if not exists` y
-- `create or replace`, que conserva los privilegios.

alter table public.recetas
  add column if not exists precio_vespertino numeric,
  add column if not exists franja_carta text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'recetas_precio_vespertino_no_negativo'
  ) then
    alter table public.recetas
      add constraint recetas_precio_vespertino_no_negativo
      check (precio_vespertino is null or precio_vespertino >= 0);
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'recetas_franja_carta_valida'
  ) then
    alter table public.recetas
      add constraint recetas_franja_carta_valida
      check (franja_carta is null or franja_carta in ('matutino', 'vespertino'));
  end if;
end $$;

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
      v_tarde numeric;
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
        select rc.precio_venta, rc.precio_vespertino into v_cat, v_tarde
        from public.recetas rc
        where rc.id = r.receta_id
          and rc.restaurante_id = new.restaurante_id;

        if v_cat is not null
           and abs(v_cat - (r.precio - r.extras)) > v_tol
           and (v_tarde is null or abs(v_tarde - (r.precio - r.extras)) > v_tol)
        then
          v_precios := v_precios || jsonb_build_object(
            'receta_id', r.receta_id,
            'nombre',    r.nombre,
            'cobrado',   r.precio,
            'catalogo',  v_cat,
            'catalogo_tarde', v_tarde,
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
