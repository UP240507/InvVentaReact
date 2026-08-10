-- Fase 1.6 fix: el TRIAL no tiene vencimiento de anualidad (usa trial_hasta).
-- La NOT NULL venía de la tabla legada y rompía el alta self-service.
alter table public.suscripciones alter column fecha_vencimiento drop not null;
