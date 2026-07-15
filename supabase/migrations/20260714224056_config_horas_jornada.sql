-- Jornada mínima antes de poder checar SALIDA (y por tanto desloguearse).
-- 0 = restricción desactivada (default: opt-in por tenant, el dueño la fija).
-- Solo la cuenta del dueño (Admin) la edita desde Configuración.
alter table public.configuracion
  add column if not exists horas_jornada numeric not null default 0;
