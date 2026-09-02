-- La orden de compra deja de identificar al proveedor por su nombre.
--
-- `ordenes_compra.proveedor` es texto y no habia clave foranea. La pantalla
-- elegia el proveedor del catalogo y TIRABA EL ID -ComprasScreen.jsx:162
-- guardaba `.nombre`-, y despues lo buscaba de vuelta por ese nombre para
-- mandarle la orden por WhatsApp o correo -`:258` y `:266`-.
--
-- Corregir el nombre de un proveedor en el catalogo dejaba a sus ordenes
-- viejas apuntando a un nombre que ya no existe: el `find` devuelve undefined
-- y el boton se queda sin destinatario. Ni excepcion ni log.
--
-- Es la tercera de la misma familia en dos semanas -el hub anunciandose por
-- nombre, el telefono como identidad del dueno, y ahora el proveedor-. La
-- regla: un nombre es para ensenar, para buscar un id.
--
-- Ver claude/HALLAZGO_01-SEP_EL_PROVEEDOR_POR_NOMBRE.md
--
-- LA COLUMNA DE TEXTO SE QUEDA, Y NO ES PEREZA
--
-- `proveedor` es el nombre que tenia el proveedor EL DIA DE LA ORDEN.
-- Renombrar el catalogo no debe reescribir la historia. Uno es la identidad,
-- el otro es lo que decia el papel.
--
-- `on delete set null` y no `cascade`: borrar un proveedor jamas puede
-- llevarse por delante ordenes de compra. La orden se queda con su nombre.
--
-- Aguanta la segunda pasada: las tres piezas van con `if not exists` y el
-- relleno solo toca filas que siguen en NULL.

alter table public.ordenes_compra
  add column if not exists proveedor_id bigint;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'ordenes_compra_proveedor_id_fkey'
       and conrelid = 'public.ordenes_compra'::regclass
  ) then
    alter table public.ordenes_compra
      add constraint ordenes_compra_proveedor_id_fkey
      foreign key (proveedor_id) references public.proveedores(id)
      on delete set null;
  end if;
end $$;

-- Relleno hacia atras, una vez, por nombre EXACTO y dentro del mismo local.
-- Medido ANTES de correrlo, en AZUL: 46 ordenes y cuatro nombres -Quesos 27,
-- Emma 17, saad 1, "Sin asignar" 1-, cada uno con UN solo candidato en el
-- catalogo. Prediccion escrita antes de tocar: 45 con id y 1 en NULL.
-- Resultado: 45 y 1, y cero filas donde el id no case con el texto.
--
-- "Sin asignar" no corresponde a ningun proveedor y se queda en NULL a
-- proposito: inventarle uno seria peor que dejarla marcada como lo que es.
update public.ordenes_compra o
   set proveedor_id = p.id
  from public.proveedores p
 where o.proveedor_id is null
   and p.restaurante_id = o.restaurante_id
   and p.nombre = o.proveedor;

create index if not exists ordenes_compra_proveedor_id_idx
  on public.ordenes_compra (restaurante_id, proveedor_id);

comment on column public.ordenes_compra.proveedor_id is
  'Identidad del proveedor. Para BUSCAR se usa esta columna, nunca `proveedor`, '
  'que es el nombre que tenia el dia de la orden y se conserva como historia. '
  'NULL = orden sin proveedor reconciliable (en AZUL, la de "Sin asignar").';
