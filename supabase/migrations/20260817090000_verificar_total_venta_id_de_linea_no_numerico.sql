-- Corrección de 20260811042805.
--
-- ── EL FALLO, ENCONTRADO EN AZUL EL 15-AGO ──────────────────────────────────
-- El INSERT de una venta con nota o modificador moría así:
--
--   ventas INSERT · PERMANENTE (22P02)
--   invalid input syntax for type bigint:
--     "1781461782580::nota:Sin cebolla, sin mostaza"
--
-- La línea culpable era `nullif(it->>'id','')::bigint as receta_id`. Hasta el
-- 14-ago el `id` de una línea del carrito ERA el id del producto. Ese día
-- entraron los modificadores y `firmaDeLinea()` pasó a meter la selección y la
-- nota dentro del id — a propósito, y es lo que impide que «término medio» y
-- «bien cocido» se fundan en un «2x» que haría a la cocina sacar dos iguales.
--
-- Ninguno de los dos lados estaba mal. El trigger era correcto para el dato del
-- 11-ago y la firma de línea es correcta para lo que resuelve. El hueco estaba
-- justo en medio, y no dio error en ningún sitio salvo aquí, en el último salto:
-- Postgres rechaza el cast y tumba el INSERT entero. La venta se queda en el
-- equipo, marcada como fallo permanente, sin reintento.
--
-- ── LA CORRECCIÓN, Y POR QUÉ ASÍ Y NO SÓLO CAMBIANDO EL CAMPO ───────────────
-- El item ya trae `receta_id` al lado del `id` desde el 14-ago, así que bastaría
-- con leer ése. Pero eso vuelve a atar el trigger a la forma exacta del payload
-- de hoy, que es lo que acaba de fallar.
--
-- Así que se lee igual que esta misma función lee la configuración: a la
-- defensiva. Se prefiere `receta_id`, se cae a `id`, y **sólo se castea lo que
-- parece un entero**. Si ninguno de los dos lo parece, `receta_id` queda en NULL.
--
-- Que quede NULL no rompe nada: la única cosa que hace con él es el cotejo
-- informativo contra el catálogo, que ya está guardado con un `if r.receta_id is
-- not null`. La degradación es «esta línea no se coteja», no «esta venta no
-- existe». Un dato raro deja de costar una venta y pasa a costar una
-- comprobación opcional, que es la proporción correcta.
--
-- NO se toca la aritmética en esta migración, aunque ahí hay otro fallo abierto
-- (el total sale con un centavo de más; ver `docs/VERIFICADO_15-AGO.md`, fallo
-- 3). Son dos cosas distintas y mezclarlas dejaría sin saber cuál arregló qué.

CREATE OR REPLACE FUNCTION public.verificar_total_venta()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  -- Dos centavos: `round2` del cliente redondea cada paso, así que una
  -- diferencia de un centavo por línea es aritmética normal, no manipulación.
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
  -- Sin ítems legibles no hay nada contra qué comparar. Se deja pasar sin
  -- marcar: marcar lo que no se puede verificar es fabricar ruido.
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
           -- Ver la cabecera. `receta_id` primero, `id` como respaldo para las
           -- ventas anteriores al 14-ago, y NUNCA se castea lo que no es un
           -- entero: desde los modificadores, `id` puede ser
           -- `1781461782580::nota:Sin cebolla` y ese cast tumbaba el INSERT.
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
      -- Descuento de línea, con el mismo criterio que `importeDeLinea`.
      if v_dtipo = 'cortesia' then
        v_linea := 0;
      elsif v_dtipo = 'porcentaje' then
        v_linea := v_linea - (v_linea * least(100, greatest(0, v_dval)) / 100);
      elsif v_dtipo = 'monto' then
        v_linea := greatest(0, v_linea - v_dval);
      end if;

      v_bruto := v_bruto + v_linea;

      -- Cotejo con el catálogo. Sólo informativo: ver la cabecera de 042704.
      -- Con `receta_id` en NULL simplemente no se coteja esta línea, que es la
      -- degradación que la corrección de arriba busca.
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

  -- Base gravable con el mismo desglose hacia atrás que hace `calcularVenta`.
  v_base := case when v_incluye then v_bruto / (1 + v_iva_rate) else v_bruto end;
  -- El descuento de ticket ya viene expresado en base.
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
