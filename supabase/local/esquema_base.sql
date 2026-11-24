


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE OR REPLACE FUNCTION "public"."canjear_puntos"("p_canje_id" bigint, "p_cliente_id" bigint, "p_restaurante_id" "uuid", "p_puntos" integer, "p_descripcion" "text" DEFAULT NULL::"text") RETURNS TABLE("puntos_lealtad" integer)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_rol text := coalesce(auth.jwt() ->> 'role', '');
  v_tenant uuid;
  v_actual integer;
begin
  if v_rol = 'authenticated' then
    v_tenant := public.get_restaurante_id();
    if v_tenant is null or v_tenant is distinct from p_restaurante_id then
      raise exception 'canjear_puntos: tenant inválido para este usuario';
    end if;
  elsif v_rol = 'anon' then
    raise exception 'canjear_puntos: no autorizado';
  end if;

  if p_canje_id is null or p_cliente_id is null or p_restaurante_id is null
     or coalesce(p_puntos, 0) <= 0 then
    raise exception 'canjear_puntos: faltan parámetros o puntos inválidos';
  end if;

  select c.puntos_lealtad into v_actual
    from public.clientes c
   where c.id = p_cliente_id
     and c.restaurante_id = p_restaurante_id
   for update;
  if not found then
    raise exception 'canjear_puntos: cliente inexistente en el tenant';
  end if;

  -- Idempotencia: reintento de la cola tras timeout post-commit → estado actual.
  begin
    insert into public.crm_canjes (restaurante_id, canje_id, cliente_id, puntos, descripcion)
    values (p_restaurante_id, p_canje_id, p_cliente_id, p_puntos, p_descripcion);
  exception when unique_violation then
    return query
      select c.puntos_lealtad from public.clientes c where c.id = p_cliente_id;
    return;
  end;

  if coalesce(v_actual, 0) < p_puntos then
    raise exception 'canjear_puntos: puntos insuficientes (tiene %, requiere %)',
      coalesce(v_actual, 0), p_puntos;
  end if;

  return query
  update public.clientes c
     set puntos_lealtad = coalesce(c.puntos_lealtad, 0) - p_puntos
   where c.id = p_cliente_id
     and c.restaurante_id = p_restaurante_id
  returning c.puntos_lealtad;
end;
$$;


ALTER FUNCTION "public"."canjear_puntos"("p_canje_id" bigint, "p_cliente_id" bigint, "p_restaurante_id" "uuid", "p_puntos" integer, "p_descripcion" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."decrementar_stock"("p_items" "jsonb", "p_restaurante_id" "uuid", "p_referencia" "text" DEFAULT NULL::"text", "p_usuario" "text" DEFAULT NULL::"text", "p_origen" "text" DEFAULT NULL::"text") RETURNS TABLE("producto_id" bigint, "nuevo_stock" numeric, "insuficiente" boolean)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."decrementar_stock"("p_items" "jsonb", "p_restaurante_id" "uuid", "p_referencia" "text", "p_usuario" "text", "p_origen" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_restaurante_id"() RETURNS "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  SELECT restaurante_id FROM (
    SELECT restaurante_id, 1 AS prio FROM public.usuarios WHERE auth_id = auth.uid()
    UNION ALL
    SELECT restaurante_id, 2 AS prio FROM public.staff    WHERE auth_id = auth.uid()
  ) t
  WHERE restaurante_id IS NOT NULL
  ORDER BY prio
  LIMIT 1;
$$;


ALTER FUNCTION "public"."get_restaurante_id"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."registrar_visita_cliente"("p_venta_id" bigint, "p_cliente_id" bigint, "p_restaurante_id" "uuid", "p_total" numeric) RETURNS TABLE("visitas" integer, "total_gastado" numeric, "puntos_lealtad" integer)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_rol text := coalesce(auth.jwt() ->> 'role', '');
  v_tenant uuid;
  v_ppp numeric := 0;
  v_puntos integer := 0;
begin
  if v_rol = 'authenticated' then
    v_tenant := public.get_restaurante_id();
    if v_tenant is null or v_tenant is distinct from p_restaurante_id then
      raise exception 'registrar_visita_cliente: tenant inválido para este usuario';
    end if;
  elsif v_rol = 'anon' then
    raise exception 'registrar_visita_cliente: no autorizado';
  end if;

  if p_venta_id is null or p_cliente_id is null or p_restaurante_id is null then
    raise exception 'registrar_visita_cliente: faltan parámetros (venta, cliente, tenant)';
  end if;

  -- Regla de puntos del tenant (0 u omitida = apagada).
  select coalesce(c.pesos_por_punto, 0) into v_ppp
  from public.configuracion c
  where c.restaurante_id = p_restaurante_id
  limit 1;
  if coalesce(v_ppp, 0) > 0 then
    v_puntos := floor(greatest(coalesce(p_total, 0), 0) / v_ppp)::int;
  end if;

  -- Candado contra carreras multi-terminal (patrón decrementar_stock).
  perform 1
    from public.clientes c
   where c.id = p_cliente_id
     and c.restaurante_id = p_restaurante_id
     for update;
  if not found then
    raise exception 'registrar_visita_cliente: cliente inexistente en el tenant';
  end if;

  -- Idempotencia: si el ledger ya tiene esta venta, es un reintento de la
  -- cola tras un timeout post-commit → devolver estado actual sin recontar.
  begin
    insert into public.crm_visitas (restaurante_id, venta_id, cliente_id, total, puntos)
    values (p_restaurante_id, p_venta_id, p_cliente_id, coalesce(p_total, 0), v_puntos);
  exception when unique_violation then
    return query
      select c.visitas, c.total_gastado, c.puntos_lealtad
        from public.clientes c
       where c.id = p_cliente_id;
    return;
  end;

  return query
  update public.clientes c
     set visitas        = coalesce(c.visitas, 0) + 1,
         total_gastado  = coalesce(c.total_gastado, 0) + coalesce(p_total, 0),
         puntos_lealtad = coalesce(c.puntos_lealtad, 0) + v_puntos
   where c.id = p_cliente_id
     and c.restaurante_id = p_restaurante_id
  returning c.visitas, c.total_gastado, c.puntos_lealtad;
end;
$$;


ALTER FUNCTION "public"."registrar_visita_cliente"("p_venta_id" bigint, "p_cliente_id" bigint, "p_restaurante_id" "uuid", "p_total" numeric) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."touch_suscripciones"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
begin new.updated_at := now(); return new; end; $$;


ALTER FUNCTION "public"."touch_suscripciones"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."verificar_total_venta"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
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
$_$;


ALTER FUNCTION "public"."verificar_total_venta"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."addons" (
    "id" "text" NOT NULL,
    "nombre" "text" NOT NULL,
    "precio_anual_centavos" integer NOT NULL,
    "disponible" boolean DEFAULT true NOT NULL,
    "stripe_price_id" "text"
);


ALTER TABLE "public"."addons" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."asistencias" (
    "id" bigint NOT NULL,
    "empleado_id" "text" NOT NULL,
    "empleado_nombre" "text" NOT NULL,
    "tipo" "text" NOT NULL,
    "fecha_hora" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "restaurante_id" "uuid",
    CONSTRAINT "asistencias_tipo_check" CHECK (("tipo" = ANY (ARRAY['entrada'::"text", 'salida'::"text"])))
);


ALTER TABLE "public"."asistencias" OWNER TO "postgres";


ALTER TABLE "public"."asistencias" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."asistencias_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."auditoria" (
    "id" bigint NOT NULL,
    "fecha" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "usuario" "text",
    "accion" "text",
    "detalles" "text",
    "nivel" "text",
    "modulo" "text",
    "restaurante_id" "uuid"
);


ALTER TABLE "public"."auditoria" OWNER TO "postgres";


ALTER TABLE "public"."auditoria" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."auditoria_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."categorias_gasto" (
    "id" "text" NOT NULL,
    "nombre" "text" NOT NULL,
    "fijo" boolean DEFAULT true NOT NULL,
    "orden" integer DEFAULT 0 NOT NULL,
    "es_sistema" boolean DEFAULT false NOT NULL,
    "restaurante_id" "uuid"
);


ALTER TABLE "public"."categorias_gasto" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."clientes" (
    "id" bigint NOT NULL,
    "nombre" "text" NOT NULL,
    "telefono" "text",
    "email" "text",
    "cumpleanos" "date",
    "preferencias" "text",
    "visitas" integer DEFAULT 0,
    "total_gastado" numeric DEFAULT 0,
    "puntos_lealtad" integer DEFAULT 0,
    "activo" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "restaurante_id" "uuid",
    "rfc" "text",
    "razon_social" "text"
);

ALTER TABLE ONLY "public"."clientes" REPLICA IDENTITY FULL;


ALTER TABLE "public"."clientes" OWNER TO "postgres";


ALTER TABLE "public"."clientes" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."clientes_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."comandas" (
    "id" "text" NOT NULL,
    "folio" "text" NOT NULL,
    "mesa" "text" NOT NULL,
    "mesero" "text" NOT NULL,
    "fecha_hora" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()),
    "items" "jsonb" NOT NULL,
    "estado" "text" DEFAULT 'preparando'::"text",
    "restaurante_id" "uuid",
    "mesa_id" "uuid",
    "entregada_en" timestamp with time zone,
    "motivo_cancelacion" "text",
    CONSTRAINT "comandas_estado_check" CHECK (("estado" = ANY (ARRAY['preparando'::"text", 'entregada'::"text", 'completada'::"text", 'cancelada'::"text"])))
);

ALTER TABLE ONLY "public"."comandas" REPLICA IDENTITY FULL;


ALTER TABLE "public"."comandas" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."configuracion" (
    "id" bigint NOT NULL,
    "nombre_empresa" "text",
    "iva" numeric,
    "categorias" "jsonb",
    "unidades" "jsonb",
    "telefono" "text",
    "mensaje_ticket" "text",
    "direccion" "text",
    "logo_url" "text",
    "rfc" "text",
    "permisos_roles" "jsonb",
    "cfdi_config" "jsonb",
    "printer_baud" "text",
    "restaurante_id" "uuid",
    "asignaciones_zona" "jsonb" DEFAULT '{}'::"jsonb",
    "zonas_produccion" "jsonb" DEFAULT '["Cocina", "Barra"]'::"jsonb",
    "enrutamiento" "jsonb" DEFAULT '{}'::"jsonb",
    "roles_sin_propina" "jsonb" DEFAULT '["Admin", "Administrador", "Gerente"]'::"jsonb" NOT NULL,
    "horas_jornada" numeric DEFAULT 0 NOT NULL,
    "pesos_por_punto" numeric DEFAULT 0 NOT NULL,
    "recompensas" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "tema_color" "text" DEFAULT 'terracota'::"text" NOT NULL,
    "razon_social" "text",
    "imprimir_comandas" "text" DEFAULT 'siempre'::"text" NOT NULL,
    "flujo_cuenta" "text" DEFAULT 'precuenta_y_ticket'::"text" NOT NULL,
    "logo_bitmap" "text",
    "logo_ancho" integer,
    "logo_alto" integer,
    "franjas_activas" boolean DEFAULT false NOT NULL,
    "franja_corte" time without time zone DEFAULT '16:00:00'::time without time zone NOT NULL,
    "categorias_insumo" "jsonb",
    "denominaciones" "jsonb",
    "franja_por_corte" boolean DEFAULT false NOT NULL,
    CONSTRAINT "configuracion_flujo_cuenta_valido" CHECK (("flujo_cuenta" = ANY (ARRAY['precuenta_y_ticket'::"text", 'ticket_final'::"text"]))),
    CONSTRAINT "configuracion_imprimir_comandas_valido" CHECK (("imprimir_comandas" = ANY (ARRAY['siempre'::"text", 'sin_nube'::"text", 'nunca'::"text"]))),
    CONSTRAINT "configuracion_tema_color_check" CHECK (("tema_color" = ANY (ARRAY['terracota'::"text", 'vino-cesped'::"text", 'fenix'::"text"])))
);


ALTER TABLE "public"."configuracion" OWNER TO "postgres";


COMMENT ON COLUMN "public"."configuracion"."cfdi_config" IS 'JSON con: facturama_user, facturama_pass, sandbox, regimen_fiscal, codigo_postal, serie';



COMMENT ON COLUMN "public"."configuracion"."razon_social" IS 'Nombre fiscal del emisor (persona física o moral). Distinto de nombre_empresa, que es el comercial. Se imprime en la cabecera del ticket junto al RFC.';



COMMENT ON COLUMN "public"."configuracion"."imprimir_comandas" IS 'siempre = cocina sin pantalla, el papel es el único canal. sin_nube = el papel sólo cuando la comanda NO llegó a Supabase y el KDS no pudo verla. nunca = se confía en las pantallas.';



COMMENT ON COLUMN "public"."configuracion"."flujo_cuenta" IS 'ticket_final = un solo papel: al pedir la cuenta sale el ticket con folio, y al cobrar no se imprime nada. precuenta_y_ticket = dos papeles, el histórico.';



COMMENT ON COLUMN "public"."configuracion"."logo_bitmap" IS 'Mapa de bits 1-bit del logo, en base64, listo para GS v 0. Lo genera src/lib/LogoTermico.js. NULL = sin logo. Ver logo_ancho y logo_alto: los tres tienen que cuadrar o el hub no lo imprime (una cabecera que anuncia mas bytes de los que llegan deja la impresora esperando).';



COMMENT ON COLUMN "public"."configuracion"."franjas_activas" IS 'Si el local separa la manana de la tarde en los reportes. Apagado por defecto: con esto en false el sistema es exactamente el de antes.';



COMMENT ON COLUMN "public"."configuracion"."franja_corte" IS 'Hora local que parte el dia. Antes: matutino. Desde esa hora inclusive: vespertino.';



COMMENT ON COLUMN "public"."configuracion"."categorias_insumo" IS 'Categorias del ALMACEN (Abarrotes, Carnes, Lacteos...): la lista que ofrece la pantalla de insumos. Distinta de `categorias`, que son las del MENU y las que enruta ZonasImpresionScreen a las zonas de produccion. NULL o [] hace que la app use la lista canonica de src/lib/Catalogo.js, para que un local recien instalado pueda capturar desde el primer minuto. Se edita en Ajustes -> Categorias. Ver supabase/seed/plantilla_local.sql.';



COMMENT ON COLUMN "public"."configuracion"."denominaciones" IS 'Denominaciones para contar efectivo en apertura y cierre de turno: {"billetes":[...],"monedas":[...]}. NULL o vacio = la app usa la lista canonica de src/lib/Arqueo.js. Se edita en Ajustes. El desglose contado se guarda en turnos.fondo_desglose y turnos.efectivo_desglose.';



ALTER TABLE "public"."configuracion" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."configuracion_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."crm_canjes" (
    "restaurante_id" "uuid" NOT NULL,
    "canje_id" bigint NOT NULL,
    "cliente_id" bigint NOT NULL,
    "puntos" integer NOT NULL,
    "descripcion" "text",
    "fecha" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."crm_canjes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."crm_visitas" (
    "restaurante_id" "uuid" NOT NULL,
    "venta_id" bigint NOT NULL,
    "cliente_id" bigint NOT NULL,
    "total" numeric DEFAULT 0 NOT NULL,
    "puntos" integer DEFAULT 0 NOT NULL,
    "fecha" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."crm_visitas" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."facturas" (
    "id" bigint NOT NULL,
    "folio_venta" "text",
    "folio_fiscal" "uuid",
    "serie" "text" DEFAULT 'A'::"text",
    "folio" "text",
    "fecha_emision" timestamp with time zone DEFAULT "now"(),
    "rfc_emisor" "text" NOT NULL,
    "rfc_receptor" "text" NOT NULL,
    "nombre_receptor" "text" NOT NULL,
    "uso_cfdi" "text" DEFAULT 'G03'::"text",
    "subtotal" numeric(12,4) NOT NULL,
    "iva" numeric(12,4) NOT NULL,
    "total" numeric(12,4) NOT NULL,
    "estado" "text" DEFAULT 'vigente'::"text",
    "facturama_id" "text",
    "pac_response" "jsonb",
    "usuario" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "restaurante_id" "uuid",
    CONSTRAINT "facturas_estado_check" CHECK (("estado" = ANY (ARRAY['vigente'::"text", 'cancelado'::"text"])))
);


ALTER TABLE "public"."facturas" OWNER TO "postgres";


COMMENT ON TABLE "public"."facturas" IS 'CFDIs 4.0 emitidos via Facturama PAC';



COMMENT ON COLUMN "public"."facturas"."folio_fiscal" IS 'UUID del timbre fiscal digital del SAT';



COMMENT ON COLUMN "public"."facturas"."facturama_id" IS 'ID interno de Facturama para descargar PDF/XML y cancelar';



COMMENT ON COLUMN "public"."facturas"."pac_response" IS 'Respuesta JSON completa del PAC, guardada para auditoría';



CREATE SEQUENCE IF NOT EXISTS "public"."facturas_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."facturas_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."facturas_id_seq" OWNED BY "public"."facturas"."id";



CREATE TABLE IF NOT EXISTS "public"."folios_reservados" (
    "id" "text" NOT NULL,
    "restaurante_id" "uuid" NOT NULL,
    "serie" "text" DEFAULT 'V'::"text" NOT NULL,
    "mesa_id" "text",
    "mesa_nombre" "text",
    "dispositivo" "text",
    "usuario" "text",
    "total_impreso" numeric(12,2),
    "reservado_en" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."folios_reservados" OWNER TO "postgres";


COMMENT ON TABLE "public"."folios_reservados" IS 'Folios acunados al imprimir una cuenta, antes de que exista la venta. Solo se inserta y se lee: que una reserva se consumio se sabe mirando si hay una venta con ese folio. Sirve para conciliar el papel que tiene el cliente con la venta emitida cuando el aparato que imprimio muere por el camino.';



CREATE TABLE IF NOT EXISTS "public"."gastos" (
    "id" bigint NOT NULL,
    "restaurante_id" "uuid" NOT NULL,
    "categoria_id" "text" NOT NULL,
    "concepto" "text" NOT NULL,
    "monto" numeric(12,2) NOT NULL,
    "fecha" "date" NOT NULL,
    "proveedor" "text",
    "nota" "text",
    "comprobante_url" "text",
    "origen" "text" DEFAULT 'manual'::"text" NOT NULL,
    "origen_ref" "text",
    "estado" "text" DEFAULT 'pagado'::"text" NOT NULL,
    "activo" boolean DEFAULT true NOT NULL,
    "usuario" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "escala" "text",
    "franja" "text",
    CONSTRAINT "gastos_escala_check" CHECK ((("escala" IS NULL) OR ("escala" = ANY (ARRAY['turno'::"text", 'fuerte'::"text"])))),
    CONSTRAINT "gastos_estado_check" CHECK (("estado" = ANY (ARRAY['pendiente'::"text", 'pagado'::"text"]))),
    CONSTRAINT "gastos_franja_valida" CHECK ((("franja" IS NULL) OR ("franja" = ANY (ARRAY['matutino'::"text", 'vespertino'::"text"])))),
    CONSTRAINT "gastos_monto_check" CHECK (("monto" >= (0)::numeric)),
    CONSTRAINT "gastos_origen_check" CHECK (("origen" = ANY (ARRAY['manual'::"text", 'recurrente'::"text", 'nomina'::"text"])))
);


ALTER TABLE "public"."gastos" OWNER TO "postgres";


COMMENT ON COLUMN "public"."gastos"."escala" IS 'turno = gasto pequeno del servicio, capturado con prisa. fuerte = gasto grande y planificado. NULL = sin clasificar (filas anteriores al 22-ago); la pantalla las ensena en las dos pestanas para que no desaparezca dinero de la vista. NO es una caja con saldo: es una etiqueta.';



CREATE TABLE IF NOT EXISTS "public"."gastos_recurrentes" (
    "id" bigint NOT NULL,
    "restaurante_id" "uuid" NOT NULL,
    "categoria_id" "text" NOT NULL,
    "concepto" "text" NOT NULL,
    "monto_estimado" numeric(12,2) DEFAULT 0 NOT NULL,
    "dia_del_mes" integer DEFAULT 1 NOT NULL,
    "activo" boolean DEFAULT true NOT NULL,
    "ultima_generacion" "date",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "gastos_recurrentes_dia_del_mes_check" CHECK ((("dia_del_mes" >= 1) AND ("dia_del_mes" <= 28))),
    CONSTRAINT "gastos_recurrentes_monto_estimado_check" CHECK (("monto_estimado" >= (0)::numeric))
);


ALTER TABLE "public"."gastos_recurrentes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."login_intentos" (
    "id" bigint NOT NULL,
    "restaurante_id" "uuid",
    "ip" "text" DEFAULT 'desconocida'::"text" NOT NULL,
    "exito" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."login_intentos" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."login_intentos_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."login_intentos_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."login_intentos_id_seq" OWNED BY "public"."login_intentos"."id";



CREATE TABLE IF NOT EXISTS "public"."mesas" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "nombre" "text" NOT NULL,
    "zona" "text" DEFAULT 'General'::"text",
    "capacidad" integer DEFAULT 4,
    "estado" "text" DEFAULT 'libre'::"text",
    "orden_actual" "jsonb",
    "abierta_en" timestamp with time zone,
    "usuario" "text",
    "mesero_id" "text",
    "comensales_reales" integer DEFAULT 0,
    "restaurante_id" "uuid",
    "mesa_principal_id" "uuid",
    "reserva" "jsonb"
);

ALTER TABLE ONLY "public"."mesas" REPLICA IDENTITY FULL;


ALTER TABLE "public"."mesas" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."mesas_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."mesas_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."mesas_id_seq" OWNED BY "public"."mesas"."id";



CREATE TABLE IF NOT EXISTS "public"."modificadores" (
    "id" bigint NOT NULL,
    "nombre" "text" NOT NULL,
    "tipo" "text" DEFAULT 'multiple'::"text",
    "obligatorio" boolean DEFAULT false,
    "opciones" "jsonb" DEFAULT '[]'::"jsonb",
    "restaurante_id" "uuid",
    "activo" boolean DEFAULT true
);


ALTER TABLE "public"."modificadores" OWNER TO "postgres";


ALTER TABLE "public"."modificadores" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."modificadores_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."movimientos" (
    "id" bigint NOT NULL,
    "tipo" "text",
    "producto_id" bigint,
    "cantidad" numeric,
    "referencia" "text",
    "fecha" timestamp with time zone DEFAULT "now"(),
    "usuario" "text",
    "stock_anterior" numeric,
    "stock_nuevo" numeric,
    "restaurante_id" "uuid",
    "franja" "text",
    CONSTRAINT "movimientos_franja_valida" CHECK ((("franja" IS NULL) OR ("franja" = ANY (ARRAY['matutino'::"text", 'vespertino'::"text"]))))
);


ALTER TABLE "public"."movimientos" OWNER TO "postgres";


ALTER TABLE "public"."movimientos" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."movimientos_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE SEQUENCE IF NOT EXISTS "public"."movimientos_srv_id_seq"
    START WITH 2000000000000000
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."movimientos_srv_id_seq" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."nominas" (
    "id" bigint NOT NULL,
    "fecha_inicio" "date" NOT NULL,
    "fecha_fin" "date" NOT NULL,
    "total_sueldos" numeric DEFAULT 0,
    "total_propinas" numeric DEFAULT 0,
    "gran_total" numeric DEFAULT 0,
    "detalles" "jsonb" DEFAULT '[]'::"jsonb",
    "estado" "text" DEFAULT 'Pagada'::"text",
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "activo" boolean DEFAULT true,
    "restaurante_id" "uuid"
);

ALTER TABLE ONLY "public"."nominas" REPLICA IDENTITY FULL;


ALTER TABLE "public"."nominas" OWNER TO "postgres";


ALTER TABLE "public"."nominas" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."nominas_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."ordenes_compra" (
    "id" bigint NOT NULL,
    "numero" "text",
    "proveedor" "text",
    "fecha" timestamp with time zone DEFAULT "now"(),
    "estado" "text",
    "total" numeric,
    "items" "jsonb",
    "referencia" "text",
    "usuario" "text",
    "subtotal" numeric DEFAULT 0,
    "iva" numeric DEFAULT 0,
    "restaurante_id" "uuid",
    "proveedor_id" bigint
);


ALTER TABLE "public"."ordenes_compra" OWNER TO "postgres";


COMMENT ON COLUMN "public"."ordenes_compra"."proveedor_id" IS 'Identidad del proveedor. Para BUSCAR se usa esta columna, nunca `proveedor`, que es el nombre que tenia el dia de la orden y se conserva como historia. NULL = orden sin proveedor reconciliable (en AZUL, la de "Sin asignar").';



ALTER TABLE "public"."ordenes_compra" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."ordenes_compra_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."planes" (
    "id" "text" NOT NULL,
    "nombre" "text" NOT NULL,
    "precio_anual_centavos" integer NOT NULL,
    "limites" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "stripe_price_id" "text",
    "activo" boolean DEFAULT true NOT NULL,
    "orden" integer DEFAULT 0 NOT NULL
);


ALTER TABLE "public"."planes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."productos" (
    "id" bigint NOT NULL,
    "codigo" "text",
    "nombre" "text",
    "categoria" "text",
    "stock" numeric DEFAULT 0,
    "min" numeric DEFAULT 0,
    "precio" numeric DEFAULT 0,
    "unidad" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "activo" boolean DEFAULT true,
    "restaurante_id" "uuid"
);


ALTER TABLE "public"."productos" OWNER TO "postgres";


ALTER TABLE "public"."productos" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."productos_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."propinas_reparto" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "restaurante_id" "uuid" NOT NULL,
    "turno_id" "uuid",
    "modo" "text" DEFAULT 'turno'::"text" NOT NULL,
    "rango_desde" timestamp with time zone,
    "rango_hasta" timestamp with time zone,
    "bote_total" numeric DEFAULT 0 NOT NULL,
    "metodo" "text" NOT NULL,
    "participantes" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "total_repartido" numeric DEFAULT 0 NOT NULL,
    "remanente" numeric DEFAULT 0 NOT NULL,
    "notas" "text",
    "creado_por" "text",
    "creado_en" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL
);


ALTER TABLE "public"."propinas_reparto" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."proveedor_producto" (
    "id" bigint NOT NULL,
    "restaurante_id" "uuid" NOT NULL,
    "proveedor_id" bigint NOT NULL,
    "producto_id" bigint NOT NULL,
    "nombre" "text" NOT NULL,
    "factor" numeric NOT NULL,
    "activo" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "proveedor_producto_factor_check" CHECK (("factor" > (0)::numeric))
);


ALTER TABLE "public"."proveedor_producto" OWNER TO "postgres";


COMMENT ON TABLE "public"."proveedor_producto" IS 'Empaques de compra por pareja proveedor-producto: cuantas unidades de CONSUMO trae un empaque ("1 arpilla = 30 kg"). Existe para que la linea de la orden no obligue a dividir a mano, porque esa division entra al costo promedio ponderado y nada la valida. Ver claude/DISENO_ALCANCE_INVENTARIO.md';



COMMENT ON COLUMN "public"."proveedor_producto"."factor" IS 'Unidades de consumo por empaque, en la unidad del producto. Siempre > 0.';



ALTER TABLE "public"."proveedor_producto" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."proveedor_producto_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."proveedores" (
    "id" bigint NOT NULL,
    "nombre" "text",
    "contacto" "text",
    "telefono" "text",
    "email" "text",
    "direccion" "text",
    "activo" boolean DEFAULT true,
    "restaurante_id" "uuid",
    "rfc" "text",
    "notas" "text"
);


ALTER TABLE "public"."proveedores" OWNER TO "postgres";


ALTER TABLE "public"."proveedores" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."proveedores_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."recetas" (
    "id" bigint NOT NULL,
    "nombre" "text",
    "codigo_pos" "text",
    "categoria" "text",
    "insumos" "jsonb",
    "precio_venta" numeric,
    "activo" boolean DEFAULT true,
    "costo" numeric DEFAULT 0,
    "grupos_modificadores" "jsonb" DEFAULT '[]'::"jsonb",
    "restaurante_id" "uuid",
    "componentes" "jsonb",
    "precio_vespertino" numeric,
    "franja_carta" "text",
    CONSTRAINT "recetas_franja_carta_valida" CHECK ((("franja_carta" IS NULL) OR ("franja_carta" = ANY (ARRAY['matutino'::"text", 'vespertino'::"text"])))),
    CONSTRAINT "recetas_precio_vespertino_no_negativo" CHECK ((("precio_vespertino" IS NULL) OR ("precio_vespertino" >= (0)::numeric)))
);


ALTER TABLE "public"."recetas" OWNER TO "postgres";


ALTER TABLE "public"."recetas" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."recetas_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."restaurantes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "nombre" "text" NOT NULL,
    "rfc" "text",
    "telefono" "text",
    "direccion" "text",
    "logo_url" "text",
    "activo" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "codigo" "text"
);


ALTER TABLE "public"."restaurantes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."roles_permisos" (
    "rol" "text" NOT NULL,
    "permisos" "jsonb" DEFAULT '[]'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "restaurante_id" "uuid" NOT NULL,
    "capacidades" "jsonb"
);

ALTER TABLE ONLY "public"."roles_permisos" REPLICA IDENTITY FULL;


ALTER TABLE "public"."roles_permisos" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."staff" (
    "id" bigint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "nombre" "text" NOT NULL,
    "puesto" "text" NOT NULL,
    "telefono" "text",
    "pin_acceso" "text",
    "salario_base" numeric DEFAULT 0,
    "activo" boolean DEFAULT true,
    "fecha_ingreso" "date" DEFAULT CURRENT_DATE,
    "email" "text",
    "pin" "text",
    "restaurante_id" "uuid",
    "rol" "text" DEFAULT 'Mesero'::"text" NOT NULL,
    "auth_id" "uuid",
    "tipo_sueldo" "text" DEFAULT 'dia'::"text" NOT NULL,
    CONSTRAINT "staff_tipo_sueldo_check" CHECK (("tipo_sueldo" = ANY (ARRAY['hora'::"text", 'dia'::"text", 'turno'::"text"])))
);

ALTER TABLE ONLY "public"."staff" REPLICA IDENTITY FULL;


ALTER TABLE "public"."staff" OWNER TO "postgres";


ALTER TABLE "public"."staff" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."staff_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."stock_salidas" (
    "restaurante_id" "uuid" NOT NULL,
    "origen" "text" NOT NULL,
    "aplicado_en" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."stock_salidas" OWNER TO "postgres";


COMMENT ON TABLE "public"."stock_salidas" IS 'Ledger de idempotencia de decrementar_stock: una fila por hecho que ya descontó inventario. `origen` es texto y no un id de venta porque en mesa el descuento lo dispara la COMANDA (CMD-7) al mandar a produccion, no la venta. Mismo patron que crm_visitas y crm_canjes.';



CREATE TABLE IF NOT EXISTS "public"."suscripciones" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "restaurante_id" "uuid" NOT NULL,
    "plan" "text" DEFAULT 'basico'::"text" NOT NULL,
    "estado" "text" DEFAULT 'activo'::"text" NOT NULL,
    "fecha_inicio" "date" DEFAULT CURRENT_DATE NOT NULL,
    "fecha_vencimiento" "date",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "dias_gracia" integer DEFAULT 3 NOT NULL,
    "addons" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "trial_hasta" "date",
    "stripe_customer_id" "text",
    "stripe_subscription_id" "text",
    "cancelar_al_final" boolean DEFAULT false NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "suscripciones_estado_chk" CHECK (("estado" = ANY (ARRAY['trial'::"text", 'activo'::"text", 'moroso'::"text", 'suspendido'::"text", 'cancelado'::"text"])))
);


ALTER TABLE "public"."suscripciones" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."turnos" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "usuario" "text" NOT NULL,
    "fecha_apertura" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "fondo_inicial" numeric DEFAULT 0 NOT NULL,
    "estado" "text" DEFAULT 'abierto'::"text" NOT NULL,
    "fecha_cierre" timestamp with time zone,
    "ventas_totales" numeric DEFAULT 0,
    "efectivo_esperado" numeric DEFAULT 0,
    "efectivo_declarado" numeric DEFAULT 0,
    "diferencia" numeric DEFAULT 0,
    "restaurante_id" "uuid",
    "tarjeta_total" numeric DEFAULT 0,
    "transferencia_total" numeric DEFAULT 0,
    "propinas_total" numeric DEFAULT 0,
    "fondo_desglose" "jsonb",
    "efectivo_desglose" "jsonb",
    "arqueo_autorizado_por" "text"
);

ALTER TABLE ONLY "public"."turnos" REPLICA IDENTITY FULL;


ALTER TABLE "public"."turnos" OWNER TO "postgres";


COMMENT ON COLUMN "public"."turnos"."fondo_desglose" IS 'Conteo del fondo al abrir: {"denominacion": piezas}. NULL = no se conto (turnos anteriores al desglose); {} = se conto y no habia nada.';



COMMENT ON COLUMN "public"."turnos"."efectivo_desglose" IS 'Conteo del efectivo al cerrar, misma forma. `efectivo_declarado` se deriva de aqui: la diferencia sale del conteo, nunca de un numero tecleado.';



COMMENT ON COLUMN "public"."turnos"."arqueo_autorizado_por" IS 'Quien FIRMO el cierre con su PIN (capacidad `autoriza_arqueo`). Se firma al declarar y no al empezar: lo que hay que poder ensenar cuando la caja no cuadra es una firma sobre UNA CANTIDAD, no sobre una caja abierta.';



CREATE TABLE IF NOT EXISTS "public"."usuarios" (
    "id" bigint NOT NULL,
    "username" "text",
    "password" "text",
    "nombre" "text",
    "rol" "text",
    "avatar" "text",
    "portada" "text",
    "auth_id" "uuid",
    "restaurante_id" "uuid"
);


ALTER TABLE "public"."usuarios" OWNER TO "postgres";


ALTER TABLE "public"."usuarios" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."usuarios_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."ventas" (
    "id" bigint NOT NULL,
    "folio" "text" NOT NULL,
    "items" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "subtotal" numeric(10,2) DEFAULT 0 NOT NULL,
    "descuento" numeric(5,2) DEFAULT 0 NOT NULL,
    "descuento_monto" numeric(10,2) DEFAULT 0 NOT NULL,
    "total" numeric(10,2) DEFAULT 0 NOT NULL,
    "metodo_pago" "text" DEFAULT 'efectivo'::"text" NOT NULL,
    "efectivo" numeric(10,2) DEFAULT 0,
    "tarjeta" numeric(10,2) DEFAULT 0,
    "usuario" "text",
    "fecha" timestamp with time zone DEFAULT "now"(),
    "propina" numeric(10,2) DEFAULT 0,
    "tipo_tarjeta" "text",
    "restaurante_id" "uuid",
    "iva" numeric DEFAULT 0,
    "turno_id" "uuid",
    "transferencia" numeric DEFAULT 0,
    "mesa" "uuid",
    "reparto_id" "uuid",
    "cliente_id" bigint,
    "total_divergente" boolean DEFAULT false NOT NULL,
    "divergencia" "jsonb",
    "copias_impresas" smallint DEFAULT 1 NOT NULL,
    "franja" "text",
    CONSTRAINT "ventas_franja_valida" CHECK ((("franja" IS NULL) OR ("franja" = ANY (ARRAY['matutino'::"text", 'vespertino'::"text"]))))
);


ALTER TABLE "public"."ventas" OWNER TO "postgres";


COMMENT ON COLUMN "public"."ventas"."total_divergente" IS 'La aritmética de la fila no cierra. Señal fuerte, sin falsos positivos.';



COMMENT ON COLUMN "public"."ventas"."divergencia" IS 'Detalle: {aritmetica:{...}, precios:[...]}. `precios` es informativo — un catálogo que subió después de una venta offline lo dispara sin que haya fraude.';



COMMENT ON COLUMN "public"."ventas"."copias_impresas" IS 'Veces que el ticket de esta venta ha salido en papel. Nace en 1 (se imprimió al cobrar) o en 0 (flujo ticket_final en mesa, donde el papel salió al pedir la cuenta). La siguiente impresión usa este valor + 1 como número de copia, y ese número entra en el id del documento para que hub/cola.rs no lo descarte como duplicado.';



CREATE SEQUENCE IF NOT EXISTS "public"."ventas_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."ventas_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."ventas_id_seq" OWNED BY "public"."ventas"."id";



ALTER TABLE ONLY "public"."facturas" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."facturas_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."login_intentos" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."login_intentos_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."ventas" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."ventas_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."addons"
    ADD CONSTRAINT "addons_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."asistencias"
    ADD CONSTRAINT "asistencias_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."auditoria"
    ADD CONSTRAINT "auditoria_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."categorias_gasto"
    ADD CONSTRAINT "categorias_gasto_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."clientes"
    ADD CONSTRAINT "clientes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."comandas"
    ADD CONSTRAINT "comandas_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."configuracion"
    ADD CONSTRAINT "configuracion_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."crm_canjes"
    ADD CONSTRAINT "crm_canjes_pkey" PRIMARY KEY ("restaurante_id", "canje_id");



ALTER TABLE ONLY "public"."crm_visitas"
    ADD CONSTRAINT "crm_visitas_pkey" PRIMARY KEY ("restaurante_id", "venta_id");



ALTER TABLE ONLY "public"."facturas"
    ADD CONSTRAINT "facturas_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."folios_reservados"
    ADD CONSTRAINT "folios_reservados_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."gastos"
    ADD CONSTRAINT "gastos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."gastos_recurrentes"
    ADD CONSTRAINT "gastos_recurrentes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."login_intentos"
    ADD CONSTRAINT "login_intentos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."mesas"
    ADD CONSTRAINT "mesas_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."modificadores"
    ADD CONSTRAINT "modificadores_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."movimientos"
    ADD CONSTRAINT "movimientos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."nominas"
    ADD CONSTRAINT "nominas_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ordenes_compra"
    ADD CONSTRAINT "ordenes_compra_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."planes"
    ADD CONSTRAINT "planes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."productos"
    ADD CONSTRAINT "productos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."propinas_reparto"
    ADD CONSTRAINT "propinas_reparto_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."proveedor_producto"
    ADD CONSTRAINT "proveedor_producto_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."proveedores"
    ADD CONSTRAINT "proveedores_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."recetas"
    ADD CONSTRAINT "recetas_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."restaurantes"
    ADD CONSTRAINT "restaurantes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."roles_permisos"
    ADD CONSTRAINT "roles_permisos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."roles_permisos"
    ADD CONSTRAINT "roles_permisos_restaurante_rol_uq" UNIQUE ("restaurante_id", "rol");



ALTER TABLE ONLY "public"."staff"
    ADD CONSTRAINT "staff_pin_unique" UNIQUE ("pin");



ALTER TABLE ONLY "public"."staff"
    ADD CONSTRAINT "staff_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."stock_salidas"
    ADD CONSTRAINT "stock_salidas_pkey" PRIMARY KEY ("restaurante_id", "origen");



ALTER TABLE ONLY "public"."suscripciones"
    ADD CONSTRAINT "suscripciones_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."suscripciones"
    ADD CONSTRAINT "suscripciones_restaurante_unica" UNIQUE ("restaurante_id");



ALTER TABLE ONLY "public"."turnos"
    ADD CONSTRAINT "turnos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."usuarios"
    ADD CONSTRAINT "usuarios_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ventas"
    ADD CONSTRAINT "ventas_pkey" PRIMARY KEY ("id");



CREATE INDEX "folios_reservados_mesa" ON "public"."folios_reservados" USING "btree" ("restaurante_id", "mesa_id");



CREATE INDEX "folios_reservados_restaurante_fecha" ON "public"."folios_reservados" USING "btree" ("restaurante_id", "reservado_en" DESC);



CREATE INDEX "gastos_franja_idx" ON "public"."gastos" USING "btree" ("restaurante_id", "franja", "fecha") WHERE ("franja" IS NOT NULL);



CREATE UNIQUE INDEX "gastos_origen_unico" ON "public"."gastos" USING "btree" ("restaurante_id", "origen", "origen_ref") WHERE (("origen" <> 'manual'::"text") AND ("origen_ref" IS NOT NULL));



CREATE INDEX "gastos_por_fecha" ON "public"."gastos" USING "btree" ("restaurante_id", "fecha" DESC);



CREATE INDEX "gastos_restaurante_escala" ON "public"."gastos" USING "btree" ("restaurante_id", "escala");



CREATE INDEX "idx_asistencias_tenant" ON "public"."asistencias" USING "btree" ("restaurante_id");



CREATE INDEX "idx_auditoria_tenant" ON "public"."auditoria" USING "btree" ("restaurante_id");



CREATE INDEX "idx_clientes_tenant" ON "public"."clientes" USING "btree" ("restaurante_id");



CREATE INDEX "idx_comandas_mesa_id" ON "public"."comandas" USING "btree" ("mesa_id");



CREATE INDEX "idx_comandas_tenant" ON "public"."comandas" USING "btree" ("restaurante_id");



CREATE INDEX "idx_facturas_estado" ON "public"."facturas" USING "btree" ("estado");



CREATE INDEX "idx_facturas_fecha" ON "public"."facturas" USING "btree" ("fecha_emision" DESC);



CREATE INDEX "idx_facturas_folio_venta" ON "public"."facturas" USING "btree" ("folio_venta");



CREATE INDEX "idx_facturas_rfc_receptor" ON "public"."facturas" USING "btree" ("rfc_receptor");



CREATE INDEX "idx_login_intentos_ip_time" ON "public"."login_intentos" USING "btree" ("ip", "created_at" DESC);



CREATE INDEX "idx_login_intentos_rest_time" ON "public"."login_intentos" USING "btree" ("restaurante_id", "created_at" DESC);



CREATE INDEX "idx_mesas_principal" ON "public"."mesas" USING "btree" ("mesa_principal_id");



CREATE INDEX "idx_mesas_tenant" ON "public"."mesas" USING "btree" ("restaurante_id");



CREATE INDEX "idx_movimientos_tenant" ON "public"."movimientos" USING "btree" ("restaurante_id");



CREATE INDEX "idx_ordenes_compra_tenant" ON "public"."ordenes_compra" USING "btree" ("restaurante_id");



CREATE INDEX "idx_productos_tenant" ON "public"."productos" USING "btree" ("restaurante_id");



CREATE INDEX "idx_propinas_reparto_rest_fecha" ON "public"."propinas_reparto" USING "btree" ("restaurante_id", "creado_en" DESC);



CREATE INDEX "idx_propinas_reparto_turno" ON "public"."propinas_reparto" USING "btree" ("turno_id");



CREATE INDEX "idx_proveedores_tenant" ON "public"."proveedores" USING "btree" ("restaurante_id");



CREATE INDEX "idx_recetas_tenant" ON "public"."recetas" USING "btree" ("restaurante_id");



CREATE INDEX "idx_roles_permisos_rol" ON "public"."roles_permisos" USING "btree" ("rol");



CREATE INDEX "idx_staff_auth_id" ON "public"."staff" USING "btree" ("auth_id");



CREATE INDEX "idx_staff_tenant" ON "public"."staff" USING "btree" ("restaurante_id");



CREATE INDEX "idx_turnos_tenant" ON "public"."turnos" USING "btree" ("restaurante_id");



CREATE INDEX "idx_usuarios_auth_id" ON "public"."usuarios" USING "btree" ("auth_id");



CREATE INDEX "idx_ventas_reparto" ON "public"."ventas" USING "btree" ("reparto_id");



CREATE INDEX "idx_ventas_restaurante_cliente" ON "public"."ventas" USING "btree" ("restaurante_id", "cliente_id") WHERE ("cliente_id" IS NOT NULL);



CREATE INDEX "idx_ventas_tenant" ON "public"."ventas" USING "btree" ("restaurante_id");



CREATE INDEX "idx_ventas_turno_id" ON "public"."ventas" USING "btree" ("turno_id");



CREATE INDEX "movimientos_franja_idx" ON "public"."movimientos" USING "btree" ("restaurante_id", "franja", "fecha") WHERE ("franja" IS NOT NULL);



CREATE INDEX "ordenes_compra_proveedor_id_idx" ON "public"."ordenes_compra" USING "btree" ("restaurante_id", "proveedor_id");



CREATE INDEX "proveedor_producto_busqueda" ON "public"."proveedor_producto" USING "btree" ("restaurante_id", "proveedor_id", "producto_id") WHERE "activo";



CREATE UNIQUE INDEX "proveedor_producto_unico" ON "public"."proveedor_producto" USING "btree" ("restaurante_id", "proveedor_id", "producto_id", "nombre");



CREATE UNIQUE INDEX "recetas_codigo_pos_unico_por_local" ON "public"."recetas" USING "btree" ("restaurante_id", "lower"(TRIM(BOTH FROM "codigo_pos"))) WHERE (COALESCE(TRIM(BOTH FROM "codigo_pos"), ''::"text") <> ''::"text");



CREATE UNIQUE INDEX "uq_restaurantes_codigo" ON "public"."restaurantes" USING "btree" ("upper"("codigo")) WHERE ("codigo" IS NOT NULL);



CREATE UNIQUE INDEX "uq_staff_restaurante_pin" ON "public"."staff" USING "btree" ("restaurante_id", "pin") WHERE ("pin" IS NOT NULL);



CREATE INDEX "ventas_franja_idx" ON "public"."ventas" USING "btree" ("restaurante_id", "franja", "fecha") WHERE ("franja" IS NOT NULL);



CREATE OR REPLACE TRIGGER "trg_touch_suscripciones" BEFORE UPDATE ON "public"."suscripciones" FOR EACH ROW EXECUTE FUNCTION "public"."touch_suscripciones"();



CREATE OR REPLACE TRIGGER "trg_verificar_total_venta" BEFORE INSERT OR UPDATE OF "items", "total", "subtotal", "iva", "descuento", "propina" ON "public"."ventas" FOR EACH ROW EXECUTE FUNCTION "public"."verificar_total_venta"();



ALTER TABLE ONLY "public"."asistencias"
    ADD CONSTRAINT "asistencias_restaurante_id_fkey" FOREIGN KEY ("restaurante_id") REFERENCES "public"."restaurantes"("id");



ALTER TABLE ONLY "public"."auditoria"
    ADD CONSTRAINT "auditoria_restaurante_id_fkey" FOREIGN KEY ("restaurante_id") REFERENCES "public"."restaurantes"("id");



ALTER TABLE ONLY "public"."categorias_gasto"
    ADD CONSTRAINT "categorias_gasto_restaurante_id_fkey" FOREIGN KEY ("restaurante_id") REFERENCES "public"."restaurantes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."clientes"
    ADD CONSTRAINT "clientes_restaurante_id_fkey" FOREIGN KEY ("restaurante_id") REFERENCES "public"."restaurantes"("id");



ALTER TABLE ONLY "public"."comandas"
    ADD CONSTRAINT "comandas_mesa_id_fkey" FOREIGN KEY ("mesa_id") REFERENCES "public"."mesas"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."comandas"
    ADD CONSTRAINT "comandas_restaurante_id_fkey" FOREIGN KEY ("restaurante_id") REFERENCES "public"."restaurantes"("id");



ALTER TABLE ONLY "public"."configuracion"
    ADD CONSTRAINT "configuracion_restaurante_id_fkey" FOREIGN KEY ("restaurante_id") REFERENCES "public"."restaurantes"("id");



ALTER TABLE ONLY "public"."crm_canjes"
    ADD CONSTRAINT "crm_canjes_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."crm_visitas"
    ADD CONSTRAINT "crm_visitas_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."facturas"
    ADD CONSTRAINT "facturas_restaurante_id_fkey" FOREIGN KEY ("restaurante_id") REFERENCES "public"."restaurantes"("id");



ALTER TABLE ONLY "public"."folios_reservados"
    ADD CONSTRAINT "folios_reservados_restaurante_id_fkey" FOREIGN KEY ("restaurante_id") REFERENCES "public"."restaurantes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."gastos"
    ADD CONSTRAINT "gastos_categoria_id_fkey" FOREIGN KEY ("categoria_id") REFERENCES "public"."categorias_gasto"("id");



ALTER TABLE ONLY "public"."gastos_recurrentes"
    ADD CONSTRAINT "gastos_recurrentes_categoria_id_fkey" FOREIGN KEY ("categoria_id") REFERENCES "public"."categorias_gasto"("id");



ALTER TABLE ONLY "public"."gastos_recurrentes"
    ADD CONSTRAINT "gastos_recurrentes_restaurante_id_fkey" FOREIGN KEY ("restaurante_id") REFERENCES "public"."restaurantes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."gastos"
    ADD CONSTRAINT "gastos_restaurante_id_fkey" FOREIGN KEY ("restaurante_id") REFERENCES "public"."restaurantes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."mesas"
    ADD CONSTRAINT "mesas_mesa_principal_id_fkey" FOREIGN KEY ("mesa_principal_id") REFERENCES "public"."mesas"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."mesas"
    ADD CONSTRAINT "mesas_restaurante_id_fkey" FOREIGN KEY ("restaurante_id") REFERENCES "public"."restaurantes"("id");



ALTER TABLE ONLY "public"."modificadores"
    ADD CONSTRAINT "modificadores_restaurante_id_fkey" FOREIGN KEY ("restaurante_id") REFERENCES "public"."restaurantes"("id");



ALTER TABLE ONLY "public"."movimientos"
    ADD CONSTRAINT "movimientos_producto_id_fkey" FOREIGN KEY ("producto_id") REFERENCES "public"."productos"("id");



ALTER TABLE ONLY "public"."movimientos"
    ADD CONSTRAINT "movimientos_restaurante_id_fkey" FOREIGN KEY ("restaurante_id") REFERENCES "public"."restaurantes"("id");



ALTER TABLE ONLY "public"."nominas"
    ADD CONSTRAINT "nominas_restaurante_id_fkey" FOREIGN KEY ("restaurante_id") REFERENCES "public"."restaurantes"("id");



ALTER TABLE ONLY "public"."ordenes_compra"
    ADD CONSTRAINT "ordenes_compra_proveedor_id_fkey" FOREIGN KEY ("proveedor_id") REFERENCES "public"."proveedores"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."ordenes_compra"
    ADD CONSTRAINT "ordenes_compra_restaurante_id_fkey" FOREIGN KEY ("restaurante_id") REFERENCES "public"."restaurantes"("id");



ALTER TABLE ONLY "public"."productos"
    ADD CONSTRAINT "productos_restaurante_id_fkey" FOREIGN KEY ("restaurante_id") REFERENCES "public"."restaurantes"("id");



ALTER TABLE ONLY "public"."propinas_reparto"
    ADD CONSTRAINT "propinas_reparto_turno_id_fkey" FOREIGN KEY ("turno_id") REFERENCES "public"."turnos"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."proveedor_producto"
    ADD CONSTRAINT "proveedor_producto_producto_id_fkey" FOREIGN KEY ("producto_id") REFERENCES "public"."productos"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."proveedor_producto"
    ADD CONSTRAINT "proveedor_producto_proveedor_id_fkey" FOREIGN KEY ("proveedor_id") REFERENCES "public"."proveedores"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."proveedores"
    ADD CONSTRAINT "proveedores_restaurante_id_fkey" FOREIGN KEY ("restaurante_id") REFERENCES "public"."restaurantes"("id");



ALTER TABLE ONLY "public"."recetas"
    ADD CONSTRAINT "recetas_restaurante_id_fkey" FOREIGN KEY ("restaurante_id") REFERENCES "public"."restaurantes"("id");



ALTER TABLE ONLY "public"."roles_permisos"
    ADD CONSTRAINT "roles_permisos_restaurante_id_fkey" FOREIGN KEY ("restaurante_id") REFERENCES "public"."restaurantes"("id");



ALTER TABLE ONLY "public"."staff"
    ADD CONSTRAINT "staff_restaurante_id_fkey" FOREIGN KEY ("restaurante_id") REFERENCES "public"."restaurantes"("id");



ALTER TABLE ONLY "public"."staff"
    ADD CONSTRAINT "staff_rol_fk" FOREIGN KEY ("restaurante_id", "rol") REFERENCES "public"."roles_permisos"("restaurante_id", "rol") ON UPDATE CASCADE ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."stock_salidas"
    ADD CONSTRAINT "stock_salidas_restaurante_id_fkey" FOREIGN KEY ("restaurante_id") REFERENCES "public"."restaurantes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."suscripciones"
    ADD CONSTRAINT "suscripciones_plan_fk" FOREIGN KEY ("plan") REFERENCES "public"."planes"("id");



ALTER TABLE ONLY "public"."suscripciones"
    ADD CONSTRAINT "suscripciones_restaurante_id_fkey" FOREIGN KEY ("restaurante_id") REFERENCES "public"."restaurantes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."turnos"
    ADD CONSTRAINT "turnos_restaurante_id_fkey" FOREIGN KEY ("restaurante_id") REFERENCES "public"."restaurantes"("id");



ALTER TABLE ONLY "public"."usuarios"
    ADD CONSTRAINT "usuarios_restaurante_id_fkey" FOREIGN KEY ("restaurante_id") REFERENCES "public"."restaurantes"("id");



ALTER TABLE ONLY "public"."ventas"
    ADD CONSTRAINT "ventas_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."ventas"
    ADD CONSTRAINT "ventas_reparto_id_fkey" FOREIGN KEY ("reparto_id") REFERENCES "public"."propinas_reparto"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."ventas"
    ADD CONSTRAINT "ventas_restaurante_id_fkey" FOREIGN KEY ("restaurante_id") REFERENCES "public"."restaurantes"("id");



ALTER TABLE ONLY "public"."ventas"
    ADD CONSTRAINT "ventas_turno_id_fkey" FOREIGN KEY ("turno_id") REFERENCES "public"."turnos"("id") ON DELETE SET NULL;



ALTER TABLE "public"."addons" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "addons_select" ON "public"."addons" FOR SELECT TO "authenticated" USING (true);



ALTER TABLE "public"."asistencias" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."auditoria" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."categorias_gasto" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "categorias_gasto_escribe_propias" ON "public"."categorias_gasto" TO "authenticated" USING (((NOT "es_sistema") AND ("restaurante_id" = "public"."get_restaurante_id"()))) WITH CHECK (((NOT "es_sistema") AND ("restaurante_id" = "public"."get_restaurante_id"())));



CREATE POLICY "categorias_gasto_select" ON "public"."categorias_gasto" FOR SELECT TO "authenticated" USING (("es_sistema" OR ("restaurante_id" = "public"."get_restaurante_id"())));



ALTER TABLE "public"."clientes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."comandas" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."configuracion" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."crm_canjes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "crm_canjes_select_tenant" ON "public"."crm_canjes" FOR SELECT TO "authenticated" USING (("restaurante_id" = "public"."get_restaurante_id"()));



ALTER TABLE "public"."crm_visitas" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "crm_visitas_select_tenant" ON "public"."crm_visitas" FOR SELECT TO "authenticated" USING (("restaurante_id" = "public"."get_restaurante_id"()));



ALTER TABLE "public"."facturas" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."folios_reservados" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "folios_reservados_inserta" ON "public"."folios_reservados" FOR INSERT TO "authenticated" WITH CHECK (("restaurante_id" = "public"."get_restaurante_id"()));



CREATE POLICY "folios_reservados_lee" ON "public"."folios_reservados" FOR SELECT TO "authenticated" USING (("restaurante_id" = "public"."get_restaurante_id"()));



ALTER TABLE "public"."gastos" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."gastos_recurrentes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."login_intentos" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."mesas" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."modificadores" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."movimientos" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."nominas" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ordenes_compra" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."planes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "planes_select" ON "public"."planes" FOR SELECT TO "authenticated" USING (true);



ALTER TABLE "public"."productos" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."propinas_reparto" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."proveedor_producto" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."proveedores" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."recetas" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."restaurantes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."roles_permisos" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."staff" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."stock_salidas" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."suscripciones" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "suscripciones_select_propia" ON "public"."suscripciones" FOR SELECT TO "authenticated" USING (("restaurante_id" = "public"."get_restaurante_id"()));



CREATE POLICY "tenant_asistencias" ON "public"."asistencias" USING (("restaurante_id" = "public"."get_restaurante_id"())) WITH CHECK (("restaurante_id" = "public"."get_restaurante_id"()));



CREATE POLICY "tenant_auditoria" ON "public"."auditoria" USING (("restaurante_id" = "public"."get_restaurante_id"())) WITH CHECK (("restaurante_id" = "public"."get_restaurante_id"()));



CREATE POLICY "tenant_clientes" ON "public"."clientes" USING (("restaurante_id" = "public"."get_restaurante_id"())) WITH CHECK (("restaurante_id" = "public"."get_restaurante_id"()));



CREATE POLICY "tenant_comandas" ON "public"."comandas" USING (("restaurante_id" = "public"."get_restaurante_id"())) WITH CHECK (("restaurante_id" = "public"."get_restaurante_id"()));



CREATE POLICY "tenant_configuracion" ON "public"."configuracion" USING (("restaurante_id" = "public"."get_restaurante_id"())) WITH CHECK (("restaurante_id" = "public"."get_restaurante_id"()));



CREATE POLICY "tenant_facturas" ON "public"."facturas" USING (("restaurante_id" = "public"."get_restaurante_id"())) WITH CHECK (("restaurante_id" = "public"."get_restaurante_id"()));



CREATE POLICY "tenant_gastos" ON "public"."gastos" TO "authenticated" USING (("restaurante_id" = "public"."get_restaurante_id"())) WITH CHECK (("restaurante_id" = "public"."get_restaurante_id"()));



CREATE POLICY "tenant_gastos_recurrentes" ON "public"."gastos_recurrentes" TO "authenticated" USING (("restaurante_id" = "public"."get_restaurante_id"())) WITH CHECK (("restaurante_id" = "public"."get_restaurante_id"()));



CREATE POLICY "tenant_mesas" ON "public"."mesas" USING (("restaurante_id" = "public"."get_restaurante_id"())) WITH CHECK (("restaurante_id" = "public"."get_restaurante_id"()));



CREATE POLICY "tenant_modificadores" ON "public"."modificadores" USING (("restaurante_id" = "public"."get_restaurante_id"())) WITH CHECK (("restaurante_id" = "public"."get_restaurante_id"()));



CREATE POLICY "tenant_movimientos" ON "public"."movimientos" USING (("restaurante_id" = "public"."get_restaurante_id"())) WITH CHECK (("restaurante_id" = "public"."get_restaurante_id"()));



CREATE POLICY "tenant_nominas" ON "public"."nominas" USING (("restaurante_id" = "public"."get_restaurante_id"())) WITH CHECK (("restaurante_id" = "public"."get_restaurante_id"()));



CREATE POLICY "tenant_ordenes_compra" ON "public"."ordenes_compra" USING (("restaurante_id" = "public"."get_restaurante_id"())) WITH CHECK (("restaurante_id" = "public"."get_restaurante_id"()));



CREATE POLICY "tenant_productos" ON "public"."productos" USING (("restaurante_id" = "public"."get_restaurante_id"())) WITH CHECK (("restaurante_id" = "public"."get_restaurante_id"()));



CREATE POLICY "tenant_propinas_reparto" ON "public"."propinas_reparto" USING (("restaurante_id" = "public"."get_restaurante_id"())) WITH CHECK (("restaurante_id" = "public"."get_restaurante_id"()));



CREATE POLICY "tenant_proveedor_producto" ON "public"."proveedor_producto" TO "authenticated" USING (("restaurante_id" = "public"."get_restaurante_id"())) WITH CHECK (("restaurante_id" = "public"."get_restaurante_id"()));



CREATE POLICY "tenant_proveedores" ON "public"."proveedores" USING (("restaurante_id" = "public"."get_restaurante_id"())) WITH CHECK (("restaurante_id" = "public"."get_restaurante_id"()));



CREATE POLICY "tenant_recetas" ON "public"."recetas" USING (("restaurante_id" = "public"."get_restaurante_id"())) WITH CHECK (("restaurante_id" = "public"."get_restaurante_id"()));



CREATE POLICY "tenant_restaurantes" ON "public"."restaurantes" USING (("id" = "public"."get_restaurante_id"()));



CREATE POLICY "tenant_roles_permisos" ON "public"."roles_permisos" USING (("restaurante_id" = "public"."get_restaurante_id"())) WITH CHECK (("restaurante_id" = "public"."get_restaurante_id"()));



CREATE POLICY "tenant_staff" ON "public"."staff" USING (("restaurante_id" = "public"."get_restaurante_id"())) WITH CHECK (("restaurante_id" = "public"."get_restaurante_id"()));



CREATE POLICY "tenant_stock_salidas" ON "public"."stock_salidas" USING (("restaurante_id" = "public"."get_restaurante_id"())) WITH CHECK (("restaurante_id" = "public"."get_restaurante_id"()));



CREATE POLICY "tenant_turnos" ON "public"."turnos" USING (("restaurante_id" = "public"."get_restaurante_id"())) WITH CHECK (("restaurante_id" = "public"."get_restaurante_id"()));



CREATE POLICY "tenant_usuarios" ON "public"."usuarios" USING (("restaurante_id" = "public"."get_restaurante_id"())) WITH CHECK (("restaurante_id" = "public"."get_restaurante_id"()));



CREATE POLICY "tenant_ventas" ON "public"."ventas" USING (("restaurante_id" = "public"."get_restaurante_id"())) WITH CHECK (("restaurante_id" = "public"."get_restaurante_id"()));



ALTER TABLE "public"."turnos" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."usuarios" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ventas" ENABLE ROW LEVEL SECURITY;




ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";






ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."clientes";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."comandas";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."mesas";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."turnos";



GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";






















































































































































REVOKE ALL ON FUNCTION "public"."canjear_puntos"("p_canje_id" bigint, "p_cliente_id" bigint, "p_restaurante_id" "uuid", "p_puntos" integer, "p_descripcion" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."canjear_puntos"("p_canje_id" bigint, "p_cliente_id" bigint, "p_restaurante_id" "uuid", "p_puntos" integer, "p_descripcion" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."canjear_puntos"("p_canje_id" bigint, "p_cliente_id" bigint, "p_restaurante_id" "uuid", "p_puntos" integer, "p_descripcion" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."decrementar_stock"("p_items" "jsonb", "p_restaurante_id" "uuid", "p_referencia" "text", "p_usuario" "text", "p_origen" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."decrementar_stock"("p_items" "jsonb", "p_restaurante_id" "uuid", "p_referencia" "text", "p_usuario" "text", "p_origen" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."decrementar_stock"("p_items" "jsonb", "p_restaurante_id" "uuid", "p_referencia" "text", "p_usuario" "text", "p_origen" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_restaurante_id"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_restaurante_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_restaurante_id"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."registrar_visita_cliente"("p_venta_id" bigint, "p_cliente_id" bigint, "p_restaurante_id" "uuid", "p_total" numeric) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."registrar_visita_cliente"("p_venta_id" bigint, "p_cliente_id" bigint, "p_restaurante_id" "uuid", "p_total" numeric) TO "authenticated";
GRANT ALL ON FUNCTION "public"."registrar_visita_cliente"("p_venta_id" bigint, "p_cliente_id" bigint, "p_restaurante_id" "uuid", "p_total" numeric) TO "service_role";



GRANT ALL ON FUNCTION "public"."touch_suscripciones"() TO "anon";
GRANT ALL ON FUNCTION "public"."touch_suscripciones"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."touch_suscripciones"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."verificar_total_venta"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."verificar_total_venta"() TO "service_role";


















GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,MAINTAIN,UPDATE ON TABLE "public"."addons" TO "authenticated";
GRANT ALL ON TABLE "public"."addons" TO "service_role";
GRANT SELECT ON TABLE "public"."addons" TO "anon";



GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,MAINTAIN,UPDATE ON TABLE "public"."asistencias" TO "authenticated";
GRANT ALL ON TABLE "public"."asistencias" TO "service_role";



GRANT ALL ON SEQUENCE "public"."asistencias_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."asistencias_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."asistencias_id_seq" TO "service_role";



GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,MAINTAIN,UPDATE ON TABLE "public"."auditoria" TO "authenticated";
GRANT ALL ON TABLE "public"."auditoria" TO "service_role";



GRANT ALL ON SEQUENCE "public"."auditoria_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."auditoria_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."auditoria_id_seq" TO "service_role";



GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,MAINTAIN,UPDATE ON TABLE "public"."categorias_gasto" TO "authenticated";
GRANT ALL ON TABLE "public"."categorias_gasto" TO "service_role";



GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,MAINTAIN,UPDATE ON TABLE "public"."clientes" TO "authenticated";
GRANT ALL ON TABLE "public"."clientes" TO "service_role";



GRANT ALL ON SEQUENCE "public"."clientes_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."clientes_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."clientes_id_seq" TO "service_role";



GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,MAINTAIN,UPDATE ON TABLE "public"."comandas" TO "authenticated";
GRANT ALL ON TABLE "public"."comandas" TO "service_role";



GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,MAINTAIN,UPDATE ON TABLE "public"."configuracion" TO "authenticated";
GRANT ALL ON TABLE "public"."configuracion" TO "service_role";



GRANT ALL ON SEQUENCE "public"."configuracion_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."configuracion_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."configuracion_id_seq" TO "service_role";



GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,MAINTAIN,UPDATE ON TABLE "public"."crm_canjes" TO "authenticated";
GRANT ALL ON TABLE "public"."crm_canjes" TO "service_role";



GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,MAINTAIN,UPDATE ON TABLE "public"."crm_visitas" TO "authenticated";
GRANT ALL ON TABLE "public"."crm_visitas" TO "service_role";



GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,MAINTAIN,UPDATE ON TABLE "public"."facturas" TO "authenticated";
GRANT ALL ON TABLE "public"."facturas" TO "service_role";



GRANT ALL ON SEQUENCE "public"."facturas_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."facturas_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."facturas_id_seq" TO "service_role";



GRANT SELECT,INSERT,MAINTAIN ON TABLE "public"."folios_reservados" TO "authenticated";
GRANT ALL ON TABLE "public"."folios_reservados" TO "service_role";



GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,MAINTAIN,UPDATE ON TABLE "public"."gastos" TO "authenticated";
GRANT ALL ON TABLE "public"."gastos" TO "service_role";



GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,MAINTAIN,UPDATE ON TABLE "public"."gastos_recurrentes" TO "authenticated";
GRANT ALL ON TABLE "public"."gastos_recurrentes" TO "service_role";



GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,MAINTAIN,UPDATE ON TABLE "public"."login_intentos" TO "authenticated";
GRANT ALL ON TABLE "public"."login_intentos" TO "service_role";



GRANT ALL ON SEQUENCE "public"."login_intentos_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."login_intentos_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."login_intentos_id_seq" TO "service_role";



GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,MAINTAIN,UPDATE ON TABLE "public"."mesas" TO "authenticated";
GRANT ALL ON TABLE "public"."mesas" TO "service_role";



GRANT ALL ON SEQUENCE "public"."mesas_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."mesas_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."mesas_id_seq" TO "service_role";



GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,MAINTAIN,UPDATE ON TABLE "public"."modificadores" TO "authenticated";
GRANT ALL ON TABLE "public"."modificadores" TO "service_role";



GRANT ALL ON SEQUENCE "public"."modificadores_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."modificadores_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."modificadores_id_seq" TO "service_role";



GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,MAINTAIN,UPDATE ON TABLE "public"."movimientos" TO "authenticated";
GRANT ALL ON TABLE "public"."movimientos" TO "service_role";



GRANT ALL ON SEQUENCE "public"."movimientos_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."movimientos_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."movimientos_id_seq" TO "service_role";



GRANT ALL ON SEQUENCE "public"."movimientos_srv_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."movimientos_srv_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."movimientos_srv_id_seq" TO "service_role";



GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,MAINTAIN,UPDATE ON TABLE "public"."nominas" TO "authenticated";
GRANT ALL ON TABLE "public"."nominas" TO "service_role";



GRANT ALL ON SEQUENCE "public"."nominas_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."nominas_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."nominas_id_seq" TO "service_role";



GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,MAINTAIN,UPDATE ON TABLE "public"."ordenes_compra" TO "authenticated";
GRANT ALL ON TABLE "public"."ordenes_compra" TO "service_role";



GRANT ALL ON SEQUENCE "public"."ordenes_compra_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."ordenes_compra_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."ordenes_compra_id_seq" TO "service_role";



GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,MAINTAIN,UPDATE ON TABLE "public"."planes" TO "authenticated";
GRANT ALL ON TABLE "public"."planes" TO "service_role";
GRANT SELECT ON TABLE "public"."planes" TO "anon";



GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,MAINTAIN,UPDATE ON TABLE "public"."productos" TO "authenticated";
GRANT ALL ON TABLE "public"."productos" TO "service_role";



GRANT ALL ON SEQUENCE "public"."productos_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."productos_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."productos_id_seq" TO "service_role";



GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,MAINTAIN,UPDATE ON TABLE "public"."propinas_reparto" TO "authenticated";
GRANT ALL ON TABLE "public"."propinas_reparto" TO "service_role";



GRANT SELECT,INSERT,MAINTAIN,UPDATE ON TABLE "public"."proveedor_producto" TO "authenticated";
GRANT ALL ON TABLE "public"."proveedor_producto" TO "service_role";



GRANT ALL ON SEQUENCE "public"."proveedor_producto_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."proveedor_producto_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."proveedor_producto_id_seq" TO "service_role";



GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,MAINTAIN,UPDATE ON TABLE "public"."proveedores" TO "authenticated";
GRANT ALL ON TABLE "public"."proveedores" TO "service_role";



GRANT ALL ON SEQUENCE "public"."proveedores_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."proveedores_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."proveedores_id_seq" TO "service_role";



GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,MAINTAIN,UPDATE ON TABLE "public"."recetas" TO "authenticated";
GRANT ALL ON TABLE "public"."recetas" TO "service_role";



GRANT ALL ON SEQUENCE "public"."recetas_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."recetas_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."recetas_id_seq" TO "service_role";



GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,MAINTAIN,UPDATE ON TABLE "public"."restaurantes" TO "authenticated";
GRANT ALL ON TABLE "public"."restaurantes" TO "service_role";



GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,MAINTAIN,UPDATE ON TABLE "public"."roles_permisos" TO "authenticated";
GRANT ALL ON TABLE "public"."roles_permisos" TO "service_role";



GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,MAINTAIN,UPDATE ON TABLE "public"."staff" TO "authenticated";
GRANT ALL ON TABLE "public"."staff" TO "service_role";



GRANT ALL ON SEQUENCE "public"."staff_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."staff_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."staff_id_seq" TO "service_role";



GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,MAINTAIN,UPDATE ON TABLE "public"."stock_salidas" TO "authenticated";
GRANT ALL ON TABLE "public"."stock_salidas" TO "service_role";



GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,MAINTAIN,UPDATE ON TABLE "public"."suscripciones" TO "authenticated";
GRANT ALL ON TABLE "public"."suscripciones" TO "service_role";



GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,MAINTAIN,UPDATE ON TABLE "public"."turnos" TO "authenticated";
GRANT ALL ON TABLE "public"."turnos" TO "service_role";



GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,MAINTAIN,UPDATE ON TABLE "public"."usuarios" TO "authenticated";
GRANT ALL ON TABLE "public"."usuarios" TO "service_role";



GRANT ALL ON SEQUENCE "public"."usuarios_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."usuarios_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."usuarios_id_seq" TO "service_role";



GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,MAINTAIN,UPDATE ON TABLE "public"."ventas" TO "authenticated";
GRANT ALL ON TABLE "public"."ventas" TO "service_role";



GRANT ALL ON SEQUENCE "public"."ventas_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."ventas_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."ventas_id_seq" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,MAINTAIN,UPDATE ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";































