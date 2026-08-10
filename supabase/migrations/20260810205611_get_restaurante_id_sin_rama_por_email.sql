-- Cierra una adopción de tenant ajeno.
--
-- La tercera rama de get_restaurante_id() resolvía el tenant por la parte
-- local del correo (`username = split_part(email,'@',1)`), sin verificar
-- auth_id. Una cuenta recién registrada con correo `admin@cualquier.cosa`
-- caía en esa rama y heredaba el tenant de `usuarios.username = 'admin'`:
-- lectura Y escritura, porque todas las políticas de tenant son ALL.
--
-- Comprobado en caliente (10-ago-2026) con un sub inexistente en usuarios y
-- staff: devolvía el tenant de AZUL y dejaba ver 3 mesas, 95 ventas, 4 staff.
--
-- La rama era residuo del puente de auth_id, ya terminado: los 5 registros de
-- `usuarios` y los 4 de `staff` tienen auth_id poblado, así que las ramas 1 y
-- 2 cubren el 100 % de las identidades reales. Quitarla no deja a nadie fuera.
--
-- Efecto lateral que también se corrige: `username = 'up240507'` existe en tres
-- tenants distintos, así que con empate en prio 3 el tenant asignado era
-- arbitrario entre los tres.
CREATE OR REPLACE FUNCTION public.get_restaurante_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT restaurante_id FROM (
    SELECT restaurante_id, 1 AS prio FROM public.usuarios WHERE auth_id = auth.uid()
    UNION ALL
    SELECT restaurante_id, 2 AS prio FROM public.staff    WHERE auth_id = auth.uid()
  ) t
  WHERE restaurante_id IS NOT NULL
  ORDER BY prio
  LIMIT 1;
$function$;

-- Defensa en profundidad: sin JWT la función ya devolvía null, pero no hay
-- ninguna razón para que `anon` pueda llamarla por /rest/v1/rpc.
REVOKE EXECUTE ON FUNCTION public.get_restaurante_id() FROM anon;
