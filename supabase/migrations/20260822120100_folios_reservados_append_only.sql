-- ─────────────────────────────────────────────────────────────────────────────
-- El append-only de `folios_reservados` NO se estaba cumpliendo.
--
-- La migración anterior decía «append-only por permisos y no por costumbre», y
-- al comprobar los privilegios REALES —no el `success: true` del script— salió
-- esto:
--
--   authenticated → DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
--   anon          → lo mismo
--
-- Dos motivos, y los dos son fáciles de creer que no pasan:
--
--   1. `revoke all ... from public` **no toca los grants por ROL**. `anon` y
--      `authenticated` son roles, no PUBLIC.
--   2. Supabase concede por defecto todos los privilegios a esos dos roles en
--      cada tabla nueva del esquema `public`. El `grant select, insert` del
--      script fue **aditivo** sobre eso: no quitó nada.
--
-- RLS lo tapaba —sin política para update/delete, esas órdenes se deniegan—
-- pero eso deja una sola capa sosteniendo una garantía que el comentario de la
-- tabla afirmaba en absoluto. Una tabla que existe para que no falten números
-- no puede depender de que nadie añada nunca una política de update por
-- descuido.
-- ─────────────────────────────────────────────────────────────────────────────

revoke all on public.folios_reservados from anon;
revoke update, delete, truncate, references, trigger
  on public.folios_reservados from authenticated;

grant select, insert on public.folios_reservados to authenticated;
