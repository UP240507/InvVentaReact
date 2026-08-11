-- Corrección de 20260811042704.
--
-- La función leía `configuracion.precios_incluyen_iva` y esa columna NO EXISTE.
-- El trigger reventaba con 42703 en el primer UPDATE contra datos reales.
--
-- Lo interesante es de dónde salió el nombre: `PosScreen.jsx:237` y
-- `MesasScreen.jsx:92` hacen `configuracion?.precios_incluyen_iva ?? true`.
-- Dos pantallas leen un campo que no existe en la tabla y que nadie escribe
-- nunca, así que siempre vale `undefined` y siempre cae al `?? true`. Es el
-- mismo patrón que el `nombre_restaurante` del 6-ago y la llave de `Puerta.js`:
-- no falla, sólo deja de encontrar. Aquí encima el valor por defecto es el
-- correcto para México —el precio de menú ya trae IVA—, así que nada se ve mal
-- y el ajuste es, de hecho, inconfigurable.
--
-- Se lee con `to_jsonb(fila) ->> 'campo'` en vez de por columna: así funciona
-- hoy, que no existe, y seguirá funcionando el día que se añada, sin tener que
-- acordarse de volver aquí.

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
           nullif(it->>'id','')::bigint as receta_id,
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
