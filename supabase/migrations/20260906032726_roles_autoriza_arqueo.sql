-- Quien FIRMA un cierre de turno con su PIN.
--
-- Misma trampa que con `abre_cajon`, y por eso la misma solucion: un flag nuevo
-- en positivo llega como `undefined` a todo rol que ya tenga fila en
-- `roles_permisos` -y la tienen todos-, asi que sin este relleno NADIE podria
-- firmar un cierre y la caja no se podria cerrar. Ver src/lib/Permisos.js.
--
-- QUIEN LO RECIBE
--
-- El diseno lo decide y no hace falta interpretarlo: "su PIN firma un cierre de
-- turno. Gerente y Admin" (docs/DISENO_ARQUEO_Y_CAJON.md §3). En los datos eso
-- es exactamente `gestion`, que es el flag que ya distingue al mando del resto.
-- Comprobado despues de aplicarla en AZUL: Admin y Gerente en true; Cajero,
-- Capitan de Meseros, Mesero, Chef y Barista en false.
--
-- POR QUE NO ES EL MISMO FLAG QUE `abre_cajon`
--
-- Porque si abrir el cajon para contar exigiera la misma autorizacion que
-- firmar el conteo, el cajero no podria ni empezar a contar sin tener al
-- gerente al lado los diez minutos enteros. Son dos cosas distintas: una es
-- poder abrir, la otra es atestiguar una cifra. El cajero cuenta SU PROPIA
-- caja -es lo normal en un restaurante-, y lo que hace que el conteo valga no
-- es quien lo teclea, es que queda firmado por alguien mas y con el detalle de
-- las piezas.
--
-- Y `autoriza_arqueo` NO abre nada por si sola.
--
-- No toca ninguna fila que ya tenga la clave: aguanta la segunda pasada.

update public.roles_permisos
   set capacidades = capacidades
       || jsonb_build_object(
            'autoriza_arqueo',
            coalesce((capacidades->>'gestion')::boolean, false)
          )
 where capacidades is not null
   and not (capacidades ? 'autoriza_arqueo');
