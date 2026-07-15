-- Registro retroactivo (aplicado en vivo el 14-jul vía execute_sql, ahora
-- formalizado en el historial). Idempotente: no-op si ya está configurado.
-- mesas entra a la publicación realtime para propagar reserva/ocupación
-- entre terminales; REPLICA IDENTITY FULL para payloads completos en UPDATE.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'mesas'
  ) then
    alter publication supabase_realtime add table public.mesas;
  end if;
end $$;

alter table public.mesas replica identity full;
