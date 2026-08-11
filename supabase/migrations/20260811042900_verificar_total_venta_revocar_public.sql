-- `verificar_total_venta()` es una función de TRIGGER: no tiene por qué estar
-- expuesta en `/rest/v1/rpc/`. Postgres la creó con el grant implícito a PUBLIC,
-- igual que a `get_restaurante_id()` unas horas antes, y el advisor la señaló.
--
-- El REVOKE va a PUBLIC y no sólo a `anon`. Es la corrección que costó una
-- migración extra el mismo día: `REVOKE ... FROM anon` se ejecuta sin error y no
-- quita nada, porque el permiso no viene del rol sino del grantee vacío
-- (`=X/postgres` en `pg_proc.proacl`).
--
-- Los triggers no necesitan EXECUTE: el motor los invoca por su cuenta.
-- Comprobado tras aplicar — el ACL queda en {postgres, service_role} y una
-- venta con total 0 sigue marcándose.
REVOKE EXECUTE ON FUNCTION public.verificar_total_venta() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.verificar_total_venta() FROM anon;
REVOKE EXECUTE ON FUNCTION public.verificar_total_venta() FROM authenticated;
