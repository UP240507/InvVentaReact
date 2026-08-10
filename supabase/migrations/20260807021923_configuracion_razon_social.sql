-- Nombre FISCAL del emisor (persona física o moral), distinto del comercial.
-- En el ticket de referencia son «AZUL RESTAURANTE» (comercial) y
-- «ALBERTO DE JESUS CHAVEZ FERNANDEZ» (fiscal). Hasta ahora sólo existía
-- nombre_empresa, que es el comercial, así que el dato fiscal no se podía
-- imprimir porque no había dónde guardarlo.
--
-- Nullable a propósito: un local puede operar sin haberlo capturado todavía y
-- el ticket simplemente omite la línea.
alter table public.configuracion
  add column if not exists razon_social text;

comment on column public.configuracion.razon_social is
  'Nombre fiscal del emisor (persona física o moral). Distinto de nombre_empresa, que es el comercial. Se imprime en la cabecera del ticket junto al RFC.';
