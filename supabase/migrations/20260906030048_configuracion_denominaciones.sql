-- Las denominaciones con las que se cuenta el efectivo.
--
-- POR QUE EN LA CONFIGURACION Y NO EN EL COMPONENTE
--
-- Es exactamente el error de las unidades, que costo dos semanas descubrir:
-- `configuracion.unidades` no lo leia nadie y `IngredientesScreen.jsx:50`
-- llevaba su propia lista dura que ADEMAS no coincidia con la de la semilla
-- -`lt` contra `L`, `pza` contra `pz`-. Dos listas para lo mismo y nada que las
-- comparara.
--
-- Aqui seria peor: un local que redondea a pesos y otro que maneja monedas de
-- cincuenta centavos no cuentan igual, y una lista dura obligaria a los dos a
-- la misma. Ver docs/DISENO_ARQUEO_Y_CAJON.md §4.
--
-- LA FORMA
--
--   { "billetes": [1000, 500, 200, 100, 50, 20],
--     "monedas":  [20, 10, 5, 2, 1, 0.5] }
--
-- Dos grupos porque la pantalla los agrupa asi y porque quien cuenta los cuenta
-- asi. Que 20 este en los dos NO es un error: existen las dos cosas.
--
-- NULL hace que la aplicacion use la lista de fabrica de src/lib/Arqueo.js, que
-- es la misma que siembra la plantilla. Hay una prueba que las compara: el
-- fallo de las unidades no era que la lista estuviera dura, era que la dura y
-- la sembrada no eran la misma y nadie las comparaba nunca.
--
-- Aguanta la segunda pasada.

alter table public.configuracion
  add column if not exists denominaciones jsonb;

comment on column public.configuracion.denominaciones is
  'Denominaciones para contar efectivo en apertura y cierre de turno: '
  '{"billetes":[...],"monedas":[...]}. NULL o vacio = la app usa la lista '
  'canonica de src/lib/Arqueo.js. Se edita en Ajustes. El desglose contado se '
  'guarda en turnos.fondo_desglose y turnos.efectivo_desglose.';
