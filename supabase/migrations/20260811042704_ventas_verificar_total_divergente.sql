-- Verificación del total de la venta, sin romper el offline.
--
-- ── EL PROBLEMA (auditoría del 10-ago) ──────────────────────────────────────
-- El total lo calcula el cliente. `PosScreen` lee el precio del ítem del
-- carrito, corre `lib/Fiscal.calcularVenta()` en el navegador, y manda
-- `subtotal`, `iva`, `descuento` y `total` ya hechos. La base acepta el número
-- que llegue; la política sólo comprueba `restaurante_id`. Un cajero con un
-- proxy inserta una venta de $0 y el arqueo cuadra con ella.
--
-- ── POR QUÉ NO SE MUEVE EL CÁLCULO AL SERVIDOR ──────────────────────────────
-- Porque el cobro tiene que funcionar sin red, y eso es lo que sostiene el
-- producto. Pedirle el total al servidor sería no poder cobrar cuando se cae
-- internet, que es justo la premisa de la fase 3.
--
-- La salida no es mover el cálculo: es VERIFICARLO. La fila entra siempre —el
-- dinero ya se cobró y negarse a guardarla no lo devuelve— y se marca cuando no
-- cuadra. Detecta sin romper.
--
-- ── DOS SEÑALES, Y NO SE MEZCLAN ────────────────────────────────────────────
-- `total_divergente` (boolean) es sólo la señal FUERTE: la aritmética de la
-- propia fila no cierra. Esa no puede dar falsos positivos: son números que
-- vienen todos en el mismo payload y o cuadran o no. Medido contra las 95
-- ventas reales de AZUL: 0 marcadas.
--
-- `divergencia.precios` es la señal DÉBIL, y va en el jsonb SIN encender el
-- boolean: el precio del ítem no coincide con `recetas.precio_venta` de HOY.
-- Detecta el precio manipulado, pero también se dispara sola cuando el catálogo
-- sube de precio DESPUÉS de una venta cobrada offline que llega días más tarde.
-- Medido: 21 de 95 ventas reales lo levantan, todas por cambios de catálogo.
--
-- Mezclarlas habría sido el error: un boolean que se enciende en el 22 % de las
-- ventas legítimas deja de mirarse en una semana, y con él se pierde también la
-- señal que nunca miente.

ALTER TABLE public.ventas
  ADD COLUMN IF NOT EXISTS total_divergente boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS divergencia jsonb;

COMMENT ON COLUMN public.ventas.total_divergente IS
  'La aritmética de la fila no cierra. Señal fuerte, sin falsos positivos.';
COMMENT ON COLUMN public.ventas.divergencia IS
  'Detalle: {aritmetica:{...}, precios:[...]}. `precios` es informativo — un catálogo que subió después de una venta offline lo dispara sin que haya fraude.';

-- El cuerpo de la función vive en 20260811042805, que lo corrige: esta versión
-- leía `configuracion.precios_incluyen_iva`, una columna que NO EXISTE.
CREATE OR REPLACE FUNCTION public.verificar_total_venta()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
begin
  return new;
end;
$function$;

-- BEFORE, no AFTER: se marca la fila que entra en vez de escribirla dos veces.
DROP TRIGGER IF EXISTS trg_verificar_total_venta ON public.ventas;
CREATE TRIGGER trg_verificar_total_venta
  BEFORE INSERT OR UPDATE OF items, total, subtotal, iva, descuento, propina
  ON public.ventas
  FOR EACH ROW EXECUTE FUNCTION public.verificar_total_venta();
