import { useEffect, useState } from 'react';
import { estado as estadoDelHub, enTauri } from '../lib/Hub';

/**
 * useConectividad — las DOS conectividades, por separado.
 *
 * ── EL PROBLEMA ─────────────────────────────────────────────────────────────
 * Un dispositivo de este sistema depende de dos redes distintas que fallan por
 * su cuenta, y hasta ahora la app sólo modelaba una:
 *
 *   · NUBE  — Supabase por internet. Es la que sincroniza.
 *   · LOCAL — el hub de la caja por la LAN. Es la que imprime.
 *
 * Las cuatro combinaciones existen de verdad, y tres de ellas pasan a diario:
 *
 *   nube ✓ local ✓  el caso normal
 *   nube ✗ local ✓  se cayó el internet del local — la premisa de la fase 3
 *   nube ✓ local ✗  **el mesero salió a la calle y tiró de datos móviles**
 *   nube ✗ local ✗  el teléfono se quedó sin nada
 *
 * ── POR QUÉ NO BASTA `navigator.onLine` ─────────────────────────────────────
 * Porque contesta a una pregunta más floja de lo que parece: «¿hay alguna
 * interfaz de red levantada?». Con datos móviles dice **true** aunque el hub
 * esté a diez kilómetros. Y con el WAN desenchufado pero el wifi arriba también
 * dice true — ése fue exactamente el fallo del 5-ago, donde la caja se quedaba
 * en «Cargando contenido…» porque nadie había puesto un timeout.
 *
 * Consecuencia hasta hoy: el mesero fuera de rango veía el punto verde y «En
 * línea», tocaba imprimir, y no salía nada. El indicador mentía sobre la única
 * red que le importaba en ese momento.
 *
 * ── POR QUÉ SE PREGUNTA AL HUB Y NO SE DEDUCE ───────────────────────────────
 * `Hub.estado()` ya existía —comprueba `/salud` y devuelve de paso el resumen de
 * la cola— y **no lo llamaba nadie**. Deducir la salud del hub de un fallo al
 * imprimir llega tarde: para entonces el mesero ya pulsó y ya se llevó el
 * chasco. Preguntando de antemano, el botón puede apagarse ANTES.
 *
 * ── EL SONDEO NO ES UN TEMPORIZADOR MÁS ─────────────────────────────────────
 * 10 s con `visibilitychange`: en un teléfono en el bolsillo, un intervalo que
 * sigue corriendo con la pantalla apagada gasta batería para responder algo que
 * nadie está mirando. Al volver a primer plano se sondea de inmediato, que es
 * cuando el dato importa — justo el instante en que el mesero saca el teléfono.
 */

/** Cada cuánto se pregunta al hub estando la app a la vista. */
export const INTERVALO_SONDEO_MS = 10_000;

/**
 * ── POR QUÉ LAS SONDAS SE INYECTAN ──────────────────────────────────────────
 * Para poder probarlas SIN `vi.mock('../lib/Hub')`. La suite corre a diario con
 * `--isolate=false` —es lo que la hace caber en el tiempo de una llamada— y ahí
 * el registro de módulos es COMPARTIDO entre archivos: si otro archivo carga el
 * `lib/Hub` de verdad antes que éste, el `vi.mock` llega tarde y no se aplica.
 * El síntoma es el peor posible: la prueba pasa aislada y falla en la tanda, o
 * al revés, según el orden de los archivos.
 *
 * Es exactamente el conflicto de mocks que ya costó tres intentos en `auth/`
 * (10-ago) y la salida es la misma que allí: no simular nada. Con las sondas
 * como parámetro, la prueba pasa las suyas y no toca el registro de módulos.
 *
 * @param {object} [sondas] sólo para pruebas; en producción se usan las de
 *   `lib/Hub`. Se leen UNA vez, al montar: el efecto tiene `deps: []` a
 *   propósito —reprogramar el sondeo en cada render sería peor que no tenerlo—
 *   así que cambiarlas después del montaje no surte efecto.
 * @returns {{nube: boolean, local: boolean, comprobandoLocal: boolean}}
 *   `local` es `true` mientras no se haya comprobado lo contrario: arrancar
 *   diciendo «no hay caja» pintaría de rojo una app que aún no ha preguntado.
 */
export function useConectividad({
  sondaHub = estadoDelHub,
  dentroDeTauri = enTauri,
} = {}) {
  const [nube, setNube] = useState(() =>
    typeof navigator === 'undefined' ? true : navigator.onLine,
  );
  const [local, setLocal] = useState(true);
  const [comprobandoLocal, setComprobandoLocal] = useState(true);

  // ── Nube: el evento del navegador basta, con la salvedad de arriba ────────
  useEffect(() => {
    const arriba = () => setNube(true);
    const abajo = () => setNube(false);
    window.addEventListener('online', arriba);
    window.addEventListener('offline', abajo);
    return () => {
      window.removeEventListener('online', arriba);
      window.removeEventListener('offline', abajo);
    };
  }, []);

  // ── Local: hay que preguntarle al hub ────────────────────────────────────
  useEffect(() => {
    let vivo = true;
    let reloj = null;

    const sondear = async () => {
      // Dentro de Tauri el hub es el propio proceso: no hay red que fallar, y
      // preguntar por IPC cada 10 s sería gastar por gastar.
      if (dentroDeTauri()) {
        if (vivo) {
          setLocal(true);
          setComprobandoLocal(false);
        }
        return;
      }
      const r = await sondaHub();
      // La guarda evita escribir estado sobre un componente ya desmontado
      // cuando la petición vuelve después de salir de la pantalla.
      if (!vivo) return;
      setLocal(!!r?.activo);
      setComprobandoLocal(false);
    };

    const programar = () => {
      clearTimeout(reloj);
      // `setTimeout` encadenado y no `setInterval`: con `setInterval`, una
      // petición lenta se solapa con la siguiente y se acumulan sondeos.
      reloj = setTimeout(async () => {
        await sondear();
        if (vivo && document.visibilityState === 'visible') programar();
      }, INTERVALO_SONDEO_MS);
    };

    const alCambiarVisibilidad = () => {
      if (document.visibilityState === 'visible') {
        sondear();
        programar();
      } else {
        clearTimeout(reloj);
      }
    };

    sondear();
    programar();
    document.addEventListener('visibilitychange', alCambiarVisibilidad);

    return () => {
      vivo = false;
      clearTimeout(reloj);
      document.removeEventListener('visibilitychange', alCambiarVisibilidad);
    };
    // Las sondas se leen al montar y no vuelven a mirarse: meterlas en las
    // dependencias reengancharía el `visibilitychange` y reprogramaría el
    // sondeo en cada render que pase un objeto literal nuevo — que es lo que
    // hace cualquier llamada `useConectividad({...})`. El sondeo periódico se
    // reiniciaría solo, y el ahorro de batería que motiva todo esto se perdería
    // sin que nada lo delatara.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { nube, local, comprobandoLocal };
}

/**
 * El texto de por qué no se puede imprimir, o `null` si sí se puede.
 *
 * Vive aquí y no en cada botón para que los tres sitios que imprimen —Pedir
 * Cuenta, A Producción y el ticket de cobro— digan lo MISMO. Tres redacciones
 * distintas del mismo problema se leen como tres problemas distintos.
 *
 * El motivo es concreto a propósito: «Sin conexión con la caja» le dice al
 * mesero que se acerque, que es la acción que resuelve. «Error de impresión» le
 * haría buscar papel o llamar a alguien.
 */
export function motivoSinImpresion({ local, comprobandoLocal }) {
  if (comprobandoLocal) return null;
  if (!local) return 'Sin conexión con la caja';
  return null;
}
