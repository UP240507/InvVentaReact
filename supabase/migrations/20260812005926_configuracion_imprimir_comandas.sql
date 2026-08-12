-- Cuándo se imprimen las comandas de cocina y barra.
--
-- ── EL PROBLEMA (11-ago, primera prueba con impresora real) ─────────────────
-- `PosScreen` llamaba a `enviarComanda` SIN NINGUNA CONDICIÓN en sus dos sitios,
-- así que en un local con pantallas de KDS salían dos veces: en la pantalla y en
-- papel. El papel era el modo isla v1 —el respaldo para que cocina se entere
-- cuando el KDS no puede— pero nunca se ató a que hiciera falta.
--
-- ── POR QUÉ COLUMNA Y NO UN CAMPO INVENTADO ────────────────────────────────
-- Porque `precios_incluyen_iva` enseñó lo contrario el mismo día: dos pantallas
-- lo leen con `?? true` y esa columna NO EXISTE, así que el ajuste es
-- inconfigurable y nadie lo nota porque el valor por defecto es el correcto. Un
-- campo que se lee y no existe no falla: sólo deja de encontrar.
--
-- ── POR QUÉ EL DEFECTO ES 'siempre' ─────────────────────────────────────────
-- Es lo que hacía hasta hoy, y es el lado ruidoso del fallo. Una cocina SIN
-- pantalla que deja de recibir papel no prepara el pedido, y eso se descubre con
-- el cliente esperando. Gastar rollo de más se descubre mirando el rollo. Entre
-- fallar caro y fallar barato, de fábrica se falla barato.
--
-- AZUL, que sí tiene pantallas, lo pondrá en 'sin_nube'.
ALTER TABLE public.configuracion
  ADD COLUMN IF NOT EXISTS imprimir_comandas text NOT NULL DEFAULT 'siempre';

ALTER TABLE public.configuracion
  DROP CONSTRAINT IF EXISTS configuracion_imprimir_comandas_valido;

ALTER TABLE public.configuracion
  ADD CONSTRAINT configuracion_imprimir_comandas_valido
  CHECK (imprimir_comandas IN ('siempre', 'sin_nube', 'nunca'));

COMMENT ON COLUMN public.configuracion.imprimir_comandas IS
  'siempre = cocina sin pantalla, el papel es el único canal. sin_nube = el papel sólo cuando la comanda NO llegó a Supabase y el KDS no pudo verla. nunca = se confía en las pantallas.';
