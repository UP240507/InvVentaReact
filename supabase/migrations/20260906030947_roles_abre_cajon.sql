-- La capacidad de abrir el cajon desde el boton.
--
-- POR QUE HACE FALTA UNA MIGRACION DE DATOS Y NO BASTA CON EL CODIGO
--
-- `getCapacidades` REEMPLAZA, no mezcla: si el rol tiene fila en
-- `roles_permisos`, la lista base del codigo NO se consulta. Y todos los roles
-- de todos los locales tienen fila. Asi que un flag nuevo en positivo llega
-- como `undefined`, `tieneFlag` lo lee como `false`, y el boton nuevo nace
-- MUERTO PARA TODO EL MUNDO, sin dar error.
--
-- Esta trampa esta escrita en `src/lib/Permisos.js` desde el 17-ago -es la
-- razon por la que `kds_solo_lectura` y `kds_estacion_fija` son restricciones y
-- no permisos-. Aqui no se puede invertir el flag: "cualquiera abre el cajon
-- salvo que se le prohiba" no es lo que se quiere. Asi que se rellena.
--
-- QUIEN LO RECIBE, Y CON QUE CRITERIO
--
-- Decision de Chris, 06-sep: los que hoy pueden abrir turno. En AZUL eso es
-- Admin, Gerente, Cajero y Capitan de Meseros; Barista, Chef y Mesero no.
-- Medido antes de escribir esto: siete roles, ninguno tenia ya el flag.
-- Comprobado despues: los cuatro en true, los tres en false.
--
-- `abre_caja` se usa UNA VEZ, aqui, como criterio de arranque. NO se lee en
-- tiempo real: el diseno lo veta expresamente -"colgarle la autorizacion del
-- dinero le daria acceso al cajon a cualquiera que pueda iniciar un turno"- y
-- por eso son dos flags distintos a partir de ahora. Desde hoy se editan por
-- separado en Roles y Permisos.
--
-- LO QUE NO HACE
--
-- No toca ninguna fila que YA tenga la clave, ni siquiera si esta en false:
-- si alguien ya decidio, su decision manda. Eso ademas es lo que la hace
-- aguantar la segunda pasada.

update public.roles_permisos
   set capacidades = capacidades
       || jsonb_build_object(
            'abre_cajon',
            coalesce((capacidades->>'abre_caja')::boolean, false)
          )
 where capacidades is not null
   and not (capacidades ? 'abre_cajon');
