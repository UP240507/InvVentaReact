-- La tarde empieza con el primer corte de caja del dia (AZUL, 10-oct).
--
-- Con `franja_por_corte` encendido, la franja vespertina (reportes, carta y
-- precio de la tarde) empieza con el primer corte de caja del dia, no a la
-- hora fija. `franja_corte` pasa a ser la hora de respaldo: si ese dia no hubo
-- corte, a esa hora empieza la tarde igual. La regla vive en lib/Franjas.js
-- (`franjaPorCorte`); la base solo guarda el ajuste.
--
-- Nace apagado: ningun local cambia de comportamiento al aplicar esto, y una
-- app vieja que no conoce la columna la deja como esta. Aguanta la segunda
-- pasada.

alter table public.configuracion
  add column if not exists franja_por_corte boolean not null default false;
