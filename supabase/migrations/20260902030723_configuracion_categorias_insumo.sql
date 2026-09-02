-- Las categorias del almacen dejan de compartir columna con las del menu.
--
-- EL FALLO QUE ESTA MIGRACION EVITA
--
-- `configuracion.categorias` tenia dos duenos a la vez:
--
--   * La pestana de Ajustes la titula, literal, «Categorias del menu POS».
--   * `ZonasImpresionScreen` la une con las categorias de las recetas para
--     decidir QUE SE IMPRIME EN QUE ZONA de produccion.
--   * Y `supabase/seed/plantilla_local.sql` la sembraba con categorias de
--     INSUMO -Abarrotes, Limpieza-, que ni son del menu ni se enrutan.
--
-- Apuntar ahi la pantalla de insumos -que es lo que pedia la lista de arreglos
-- del traspaso- habria metido «Abarrotes» y «Limpieza» como categorias
-- enrutables en la pantalla de zonas de impresion. Ni excepcion ni log: la
-- pantalla ensenaria filas que no son platillos y nadie sabria de donde salen.
--
-- Y no es teorico. Medido el 01-sep contra la base de AZUL: los insumos usan
-- `Fruteria` y `Verduras`, el menu usa `Platos Fuertes` y `Platillos`. Son dos
-- listas, ya divergian cada una por su lado, y ninguna de las dos estaba en
-- `configuracion.categorias`, que esta en `[]`.
--
-- Decision de Chris, 01-sep: dos listas.
--
-- LO QUE ESTA MIGRACION NO HACE
--
-- No mueve ni un dato. `categorias` se queda como esta -es la del menu, que es
-- lo que su etiqueta y `ZonasImpresionScreen` ya dan por hecho- y la columna
-- nueva nace vacia. No hay nada que migrar hacia atras: en AZUL las dos listas
-- estan en `[]` y en los otros cuatro locales en NULL. El dia que un local
-- traiga categorias de insumo mezcladas en `categorias`, se separan a mano y
-- se deja escrito, que es mas barato que un UPDATE que adivine cual es cual.
--
-- Aguanta la segunda pasada: `add column if not exists` y un comentario.

alter table public.configuracion
  add column if not exists categorias_insumo jsonb;

comment on column public.configuracion.categorias_insumo is
  'Categorias del ALMACEN (Abarrotes, Carnes, Lacteos...): la lista que ofrece '
  'la pantalla de insumos. Distinta de `categorias`, que son las del MENU y las '
  'que enruta ZonasImpresionScreen a las zonas de produccion. NULL o [] hace '
  'que la app use la lista canonica de src/lib/Catalogo.js, para que un local '
  'recien instalado pueda capturar desde el primer minuto. Se edita en '
  'Ajustes -> Categorias. Ver supabase/seed/plantilla_local.sql.';
