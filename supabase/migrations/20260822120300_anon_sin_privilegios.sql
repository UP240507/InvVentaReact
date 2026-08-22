-- ─────────────────────────────────────────────────────────────────────────────
-- `anon` se queda sin nada, salvo el catálogo que de verdad es público
--
-- Continuación de `20260822120200_revocar_truncate_anon.sql`. Aquélla era
-- urgente —RLS no filtra TRUNCATE, así que el agujero estaba abierto de verdad—.
-- Ésta es **defensa en profundidad**: hoy RLS ya niega toda escritura anónima,
-- así que lo que se quita es una redundancia, no una capacidad.
--
-- Y aun así vale la pena, porque la redundancia es justo la que falta el día
-- que alguien escriba `using (true)` para depurar algo y se le olvide quitarlo.
-- Con el privilegio revocado, ese descuido no llega a nada.
--
-- ── COMPROBADO ANTES DE REVOCAR, EN VEZ DE SUPONERLO ───────────────────────
--
--   · Todas las tablas menos una tienen RLS encendida con políticas
--     `restaurante_id = get_restaurante_id()`. En sesión anónima esa función
--     devuelve NULL, la comparación da NULL y no pasa ninguna fila. **Ninguna
--     escritura anónima funciona hoy**, así que revocar no puede romper un
--     flujo vivo — si algo dependiera de ello, ya estaría roto.
--
--   · La excepción es `login_intentos`: RLS encendida y **cero políticas**, o
--     sea que por PostgREST no la toca nadie. La escribe una función, no el
--     cliente anónimo.
--
--   · Las únicas políticas de lectura que NO dependen del tenant son
--     `planes_select` y `addons_select`, las dos `using (true)`: es el catálogo
--     de planes, que se lee antes de entrar. Esas dos conservan SELECT a
--     propósito, y son las únicas.
--
-- El registro no necesita nada de esto: va por Edge Function, que corre con
-- `service_role`. Y el login usa el esquema `auth`, no tablas de `public`.
--
-- ── CÓMO VERIFICAR QUE SIGUE BIEN ──────────────────────────────────────────
-- Debe devolver exactamente dos filas, `planes` y `addons`, las dos con SELECT:
--
--   select table_name, string_agg(privilege_type, ', ') as privilegios
--     from information_schema.role_table_grants
--    where table_schema='public' and grantee='anon'
--    group by table_name;
-- ─────────────────────────────────────────────────────────────────────────────

do $$
declare t record;
begin
  for t in
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r'
  loop
    execute format('revoke all on public.%I from anon', t.relname);
  end loop;
end $$;

-- El catálogo público, devuelto a mano y sólo para leer.
grant select on public.planes to anon;
grant select on public.addons to anon;

-- Y que las tablas FUTURAS no le concedan nada por defecto.
alter default privileges in schema public revoke all on tables from anon;
