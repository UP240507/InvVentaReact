-- El logo del ticket, guardado como mapa de bits y no como URL.
--
-- POR QUE NO SE USA logo_url, QUE YA EXISTE
--
-- Porque una URL es la respuesta equivocada para esta caja:
--
--   * La caja trabaja SIN INTERNET. Una URL obliga a descargar, y una caja
--     recien instalada en un local con la red caida imprimiria sin logo sin
--     decir por que. El fallo de siempre: no da error, da ausencia.
--
--   * La imagen se va a mover. El dia que ese dominio muera, los tickets
--     dejan de llevar logo y nadie relaciona una cosa con la otra.
--
--   * Y lo que se ve no seria lo que sale. Convirtiendo al imprimir, la
--     pantalla ensena la imagen bonita y el papel saca otra cosa. Guardando el
--     bitmap, pantalla y papel son literalmente los mismos bytes -la misma
--     regla que hace que lib/Fiscal.js sea la unica calculadora-.
--
-- Decision de Chris, 22-ago.
--
-- EL FORMATO
--
-- Un bit por pixel, 1 = negro, empaquetados de ocho en ocho con el bit mas
-- significativo a la izquierda: es lo que pide `GS v 0`. El ancho SIEMPRE es
-- multiplo de 8, porque una fila incompleta desplazaria todas las siguientes.
--
-- logo_url se queda donde esta y sin tocar: hoy no lo lee nadie, y borrarlo en
-- la misma migracion que anade lo nuevo mezclaria dos cambios. Se limpia
-- aparte, cuando se confirme que el bitmap funciona en papel.

alter table public.configuracion
  add column if not exists logo_bitmap text,
  add column if not exists logo_ancho   integer,
  add column if not exists logo_alto    integer;

comment on column public.configuracion.logo_bitmap is
  'Mapa de bits 1-bit del logo, en base64, listo para GS v 0. Lo genera '
  'src/lib/LogoTermico.js. NULL = sin logo. Ver logo_ancho y logo_alto: los '
  'tres tienen que cuadrar o el hub no lo imprime (una cabecera que anuncia '
  'mas bytes de los que llegan deja la impresora esperando).';
