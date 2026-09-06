-- El conteo del efectivo deja de ser una cifra tecleada.
--
-- `turnos.fondo_inicial` y `turnos.efectivo_declarado` son dos `numeric` que
-- ALGUIEN TECLEA. Son afirmaciones sin nada detras, de la misma familia que la
-- pantalla del hub afirmando que el nombre resuelve o la nota de version
-- anunciando funciones que el binario no traia.
--
-- Con desglose el total pasa a ser DERIVADO de un conteo que queda guardado. Y
-- eso cambia la investigacion cuando algo falta: hoy solo se sabe "faltan 500";
-- con desglose se sabe si falta UN BILLETE de 500 o si son 500 EN MONEDAS DE
-- DIEZ. Uno huele a robo y el otro a cambio mal dado durante seis horas.
--
-- Ver docs/DISENO_ARQUEO_Y_CAJON.md §4 y §5.
--
-- LAS DOS COLUMNAS VIEJAS SE QUEDAN
--
-- `fondo_inicial` y `efectivo_declarado` no se tocan ni se renombran: las leen
-- el corte Z, los reportes y el calculo de la diferencia. Pasan a ser
-- CALCULADAS desde el desglose. Cambiarlas seria reescribir media aplicacion
-- para ganar limpieza.
--
-- LA FORMA DEL JSONB
--
--   { "1000": 2, "500": 3, "100": 10, "20": 4, "0.5": 6 }
--
-- La denominacion es la clave -las claves de jsonb son texto de todas formas- y
-- el valor es CUANTAS PIEZAS hay, no el importe. Se guarda el conteo y no el
-- subtotal a proposito: el importe se deriva y el conteo no, y lo que hay que
-- poder auditar es lo que la persona conto.
--
-- Y UN VACIO NO ES UN AUSENTE
--
-- `{}` es "conte y no habia nada". NULL es "no se conto". Si no se distinguen,
-- un cierre sin contar se lee despues como una caja vacia. Por eso las columnas
-- nacen en NULL y no en `{}`: los turnos que ya existen NO se contaron con
-- desglose, y decir lo contrario seria inventar el dato.
--
-- Aguanta la segunda pasada.

alter table public.turnos
  add column if not exists fondo_desglose        jsonb,
  add column if not exists efectivo_desglose     jsonb,
  add column if not exists arqueo_autorizado_por text;

comment on column public.turnos.fondo_desglose is
  'Conteo del fondo al abrir: {"denominacion": piezas}. NULL = no se conto '
  '(turnos anteriores al desglose); {} = se conto y no habia nada.';

comment on column public.turnos.efectivo_desglose is
  'Conteo del efectivo al cerrar, misma forma. `efectivo_declarado` se deriva '
  'de aqui: la diferencia sale del conteo, nunca de un numero tecleado.';

comment on column public.turnos.arqueo_autorizado_por is
  'Quien FIRMO el cierre con su PIN (capacidad `autoriza_arqueo`). Se firma al '
  'declarar y no al empezar: lo que hay que poder ensenar cuando la caja no '
  'cuadra es una firma sobre UNA CANTIDAD, no sobre una caja abierta.';
