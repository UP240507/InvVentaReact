-- Fase 1.6 fix: el TRIAL no tiene vencimiento de anualidad (usa trial_hasta).
-- La NOT NULL venía de la tabla legada y rompía el alta self-service
-- (registrar-restaurante → 500). Aplicada en vivo el 25-jul-2026.
alter table public.suscripciones alter column fecha_vencimiento drop not null;
