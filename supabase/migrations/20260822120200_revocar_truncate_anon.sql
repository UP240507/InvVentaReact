-- ─────────────────────────────────────────────────────────────────────────────
-- TRUNCATE no lo filtra RLS — encontrado y COMPROBADO el 22-ago
--
-- Salió al verificar los permisos de `folios_reservados` y resultó ser general:
-- las 31 tablas de la base le daban a `anon` INSERT, UPDATE, DELETE y TRUNCATE,
-- que es el reparto por defecto de Supabase para toda tabla nueva del esquema
-- `public`.
--
-- Para los cuatro primeros hay red debajo. Las políticas son
-- `restaurante_id = get_restaurante_id()`, y en una sesión anónima esa función
-- devuelve NULL: la comparación da NULL, no pasa ninguna fila.
--
-- **Con TRUNCATE no hay red.** Las políticas de RLS se aplican a SELECT,
-- INSERT, UPDATE y DELETE; TRUNCATE se controla ÚNICAMENTE con el privilegio.
--
-- No se afirma de memoria. Banco desechable sobre esta misma base: tabla con
-- RLS activada, sin ninguna política, `grant all to anon`, `set role anon` y
-- `truncate`:
--
--     antes = 3 · después = 0 · resultado = TRUNCATE PASÓ
--
-- Y la llave `anon` es pública **por diseño**: viaja dentro del bundle que la
-- caja sirve por LAN a cada teléfono de la sala. Cualquiera que abriera ese
-- bundle podía vaciar todas las tablas de todos los locales, sin autenticarse,
-- con una línea.
--
-- Es el patrón de este proyecto llevado a su peor caso: dos capas correctas
-- —grants razonables por un lado, RLS por el otro— y el hueco justo en medio,
-- porque una de las dos no cubre lo que se daba por hecho que cubría.
--
-- Revocar es gratis: ninguna parte de la app emite TRUNCATE y PostgREST no lo
-- expone.
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
    execute format(
      'revoke truncate on public.%I from anon, authenticated', t.relname);
  end loop;
end $$;

-- Y que las tablas FUTURAS no lo hereden otra vez.
alter default privileges in schema public
  revoke truncate on tables from anon, authenticated;

-- ── Cómo verificar que sigue bien (debe devolver cero filas) ────────────────
--   select grantee, table_name
--     from information_schema.role_table_grants
--    where table_schema='public' and privilege_type='TRUNCATE'
--      and grantee in ('anon','authenticated');
