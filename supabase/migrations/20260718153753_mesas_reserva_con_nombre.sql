-- Reserva informativa de mesa: quién y a qué hora (sin bloqueos de agenda).
-- { nombre: text, cliente_id: bigint|null (CRM), hora: 'HH:mm'|null }
-- Se limpia al ocupar la mesa o liberar la reserva. Viaja por realtime (mesas
-- ya está en la publicación con REPLICA IDENTITY FULL).
alter table public.mesas
  add column if not exists reserva jsonb;
