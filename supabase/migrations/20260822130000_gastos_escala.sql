-- ─────────────────────────────────────────────────────────────────────────────
-- Gastos en dos pestañas: los del turno y los fuertes
--
-- ── POR QUÉ NO SE LLAMA `caja`, QUE ERA EL PLAN ────────────────────────────
-- Porque **«caja chica» promete un saldo, y una columna no lo tiene**. Con dos
-- pestañas y una etiqueta, la pregunta «¿cuánto queda en la caja chica?» NO se
-- puede responder: para eso hacen falta fondo, retiros y reposiciones, o sea un
-- arqueo pequeño.
--
-- Decisión de Chris (22-ago): las pestañas ahora, con el nombre honesto, y el
-- saldo cuando de verdad se necesite. Ponerle «caja chica» a un filtro y darlo
-- por terminado es cómo dentro de dos meses alguien pregunta cuánto queda y la
-- respuesta es «eso no lo hace».
--
-- ── Y NO SE REUTILIZA `gastos.origen` ──────────────────────────────────────
-- Ya existe y significa otra cosa: sus valores son `manual` | `recurrente` |
-- `nomina`, o sea la procedencia del REGISTRO, no la del dinero. Meter dos
-- significados en una columna es cómo el día que alguien filtre por `origen`
-- obtiene una mezcla.
--
-- ── POR QUÉ ES NULLABLE Y SIN DEFECTO ──────────────────────────────────────
-- Las filas que ya existen no se pueden clasificar sin inventárselo: nadie sabe
-- hoy si aquella renta fue del turno o fuerte, y un defecto las etiquetaría a
-- todas igual de mal. `NULL` significa **sin clasificar** y se enseña como tal.
--
-- La pantalla las muestra en LAS DOS pestañas a propósito: **un filtro que
-- esconde dinero es el fallo caro aquí**, y un gasto que desaparece de la vista
-- es peor que uno mal etiquetado. El total del periodo sigue siendo el de todo,
-- así que tampoco se cuenta dos veces nada.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.gastos
  add column if not exists escala text
  check (escala is null or escala in ('turno', 'fuerte'));

comment on column public.gastos.escala is
  'turno = gasto pequeno del servicio, capturado con prisa. fuerte = gasto '
  'grande y planificado. NULL = sin clasificar (filas anteriores al 22-ago); '
  'la pantalla las ensena en las dos pestanas para que no desaparezca dinero '
  'de la vista. NO es una caja con saldo: es una etiqueta.';

create index if not exists gastos_restaurante_escala
  on public.gastos (restaurante_id, escala);
