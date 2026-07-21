-- Proyecto D: tema de color por tenant (Terracota default; Vino × Cesped y
-- Fénix como opciones). El modo claro/oscuro sigue siendo por dispositivo.
alter table configuracion add column if not exists tema_color text not null default 'terracota';
alter table configuracion add constraint configuracion_tema_color_check
  check (tema_color in ('terracota', 'vino-cesped', 'fenix'));
