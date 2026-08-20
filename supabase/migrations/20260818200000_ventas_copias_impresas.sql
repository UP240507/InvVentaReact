-- Cuántas veces ha SALIDO EN PAPEL el ticket de esta venta.
--
-- El contador que ya existe vive en `mesa.orden_actual.impresiones` y sirve
-- para la cuenta ANTES de cobrar; al cobrar, la mesa se limpia y ese número no
-- llega a ninguna parte. Sin esta columna no se puede reimprimir desde
-- Reportes.
--
-- ── POR QUÉ EL DEFAULT ES 1 Y NO 0, QUE ES LO IMPORTANTE ────────────────────
-- El id del documento lleva sufijo de copia sólo a partir de la 2:
-- `sufijoCopia(1)` devuelve cadena vacía. Y `hub/cola.rs` DESCARTA por id ya
-- impreso, sin error: la promesa vuelve con `ok` y no sale papel. Si una venta
-- ya impresa arrancara en 0, su primera reimpresión pediría el id pelado
-- —el mismo del ticket original— y el hub la tiraría en silencio.
--
-- Por eso el default es 1: toda venta que existía antes de esta migración
-- imprimió su ticket al cobrar. Equivocarse hacia arriba sólo cuesta un `::c2`
-- de más en un id que nadie lee; equivocarse hacia abajo cuesta un cajero
-- diciéndole al cliente «ya salió» mientras la impresora no hace nada.
--
-- El flujo `ticket_final` en mesa es la excepción y la escribe la app: ahí no
-- se imprime nada al cobrar, así que esa venta nace en 0.
alter table public.ventas
  add column if not exists copias_impresas smallint not null default 1;

comment on column public.ventas.copias_impresas is
  'Veces que el ticket de esta venta ha salido en papel. Nace en 1 (se imprimió al cobrar) o en 0 (flujo ticket_final en mesa, donde el papel salió al pedir la cuenta). La siguiente impresión usa este valor + 1 como número de copia, y ese número entra en el id del documento para que hub/cola.rs no lo descarte como duplicado.';
