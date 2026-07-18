-- Paquetes (combos a precio fijo): una receta con 'componentes' ES un paquete.
-- componentes = [{ recetaId: bigint, cantidad: number, nombre: text }]
--  * nombre va desnormalizado SOLO para mostrar en KDS/ticket (cosmético).
--  * los INSUMOS del paquete se expanden al vuelo en el POS desde las recetas
--    componentes vivas (nunca se desnormalizan → no se vuelven obsoletos).
--  * esquema listo para "elecciones" (fase 2): un componente podrá ser
--    { grupo: text, opciones: [recetaId, ...] } sin migrar de nuevo.
alter table public.recetas
  add column if not exists componentes jsonb;
