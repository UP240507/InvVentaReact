-- El descuento por porcentaje se llama `pct` en el cliente y `porcentaje` aqui.
--
-- Encontrado el 01-oct leyendo esta funcion para otra cosa. `lib/Descuentos.js`
-- guarda el descuento de linea como `{ tipo: 'pct', valor }` y
-- `importeDeLinea` lo aplica con ese nombre. Este trigger solo reconoce
-- `'porcentaje'`, asi que para el servidor una linea con 10 % de descuento
-- vale su precio de lista: el total esperado sale mas alto que el cobrado y la
-- venta se marca `total_divergente`, sin error en ningun sitio.
--
-- En AZUL no ha pasado nunca: 0 de 134 ventas llevan un descuento `pct`
-- (consultado el 01-oct). Se arregla porque el camino existe, no porque ya
-- haya quemado a alguien. El primer 10 % que se aplicara en servicio habria
-- salido como divergencia de dinero en la pantalla de auditoria.
--
-- Se aceptan los dos nombres y no se cambia el cliente: `porcentaje` puede
-- estar en ventas viejas o en otro camino, y renombrar en el cliente dejaria
-- las ventas ya guardadas con el nombre que el trigger dejaria de leer.
--
-- `create or replace` conserva los privilegios: la funcion sigue con EXECUTE
-- solo para postgres y service_role (ver 20260811042900). Aguanta la segunda
-- pasada. El resto del cuerpo es identico al que estaba aplicado en AZUL el
-- 01-oct, leido con `pg_get_functiondef`, no copiado del repo.

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

        if v_cat is not null and abs(v_cat - r.precio) > v_tol then
          v_precios := v_precios || jsonb_build_object(
            'receta_id', r.receta_id,
            'nombre',    r.nombre,
            'cobrado',   r.precio,
            'catalogo',  v_cat
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
