/**
 * useAvisoKds — sonido y notificaciones cuando cae una comanda en la estación.
 *
 * La lógica de «qué es nuevo» y «por dónde sale» vive en `lib/AvisoKds.js`, el
 * pitido en `lib/Campana.js` y el aviso del sistema en `lib/Notificador.js`.
 * Aquí sólo queda el pegamento con React: los efectos, la memoria entre
 * renders y los dos permisos.
 *
 * ── LO QUE ESTE HOOK SE NIEGA A HACER EN SILENCIO ───────────────────────────
 * Los dos permisos (audio y notificaciones) pueden estar denegados, y en ambos
 * casos el sistema *parece* funcionar: no truena, simplemente nunca avisa. Este
 * proyecto ya se llevó ese golpe tres veces —el REVOKE, el cajón, y el toast
 * del 12-ago—. Por eso el hook devuelve `faltaActivar` y `permiso`, y la
 * pantalla los enseña: si no se oye, se ve por qué.
 */
import { useEffect, useRef, useState, useCallback } from 'react';
import { comandasNuevas, textoDeAviso, canalDeAviso } from '../lib/AvisoKds';
import { desbloquear, estaListo, sonar } from '../lib/Campana';
import {
  estaDesatendida,
  permisoDeAvisos,
  pedirPermiso,
  notificar,
} from '../lib/Notificador';

export function useAvisoKds({ comandas, estacion, activo = true }) {
  // `null` = todavía no se ha sembrado. Va en ref y no en estado porque
  // cambiarla NO debe repintar: sólo es memoria.
  const vistas = useRef(null);

  const [sonidoListo, setSonidoListo] = useState(() => estaListo());
  const [permiso, setPermiso] = useState('default');
  const [pop, setPop] = useState(null); // el aviso dentro de la página

  // El permiso real hay que preguntarlo (dentro de Tauri vive en Rust), así que
  // no puede ser el valor inicial de un useState.
  useEffect(() => {
    let vivo = true;
    permisoDeAvisos().then((p) => {
      if (vivo) setPermiso(p);
    });
    return () => {
      vivo = false;
    };
  }, []);

  // Al apagarse (un admin que entra a mirar) se borra la memoria, para que al
  // volver a encenderse siembre de nuevo y no descargue de golpe todo lo que
  // llegó mientras tanto.
  useEffect(() => {
    if (!activo) vistas.current = null;
  }, [activo]);

  // La estación es otra pantalla: cambiar de pestaña Cocina→Barra trae una
  // lista entera distinta, y sin resembrar sonaría una vez por comanda.
  useEffect(() => {
    vistas.current = null;
  }, [estacion]);

  const activarAvisos = useCallback(async () => {
    const ok = await desbloquear();
    setSonidoListo(ok);

    // El permiso de notificaciones se pide en el MISMO gesto: son dos diálogos
    // seguidos, pero pedirlos por separado significa que el segundo llega en un
    // momento raro y la cocina lo cierra sin leer.
    setPermiso(await pedirPermiso());
    return ok;
  }, []);

  useEffect(() => {
    if (!activo) return;

    const { nuevas, vistas: memoria } = comandasNuevas(
      vistas.current,
      comandas,
    );
    vistas.current = memoria;
    if (nuevas.length === 0) return;

    const texto = textoDeAviso(nuevas, estacion);
    // Dos pitidos cuando cae más de una: se distingue sin mirar.
    sonar(nuevas.length > 1 ? 2 : 1);

    const oculto = estaDesatendida();

    const salioPorElSistema =
      canalDeAviso({ oculto, permiso }) === 'sistema' &&
      notificar({
        titulo: 'Comanda nueva',
        cuerpo: texto,
        etiqueta: `kds-${estacion}`,
      });

    // El cartel se pone SIEMPRE, también cuando salió el toast. Mientras están
    // fuera nadie lo ve, y su temporizador no corre hasta que la ventana
    // recupera el foco: quien vuelve de la barra encuentra el aviso todavía
    // puesto en vez de una pantalla que no dice qué sonó.
    setPop({ texto, id: Date.now(), yaAvisado: salioPorElSistema });
  }, [comandas, estacion, activo, permiso]);

  // El cartel se va solo: nadie en una cocina va a cerrarlo con las manos
  // ocupadas. Pero la cuenta atrás sólo corre con la ventana atendida — si no,
  // el aviso se consumiría mientras están de espaldas, que es cuando más falta
  // hace que siga ahí.
  useEffect(() => {
    if (!pop) return undefined;

    let reloj = null;
    const arrancar = () => {
      clearTimeout(reloj);
      reloj = setTimeout(() => setPop(null), 6000);
    };

    if (!estaDesatendida()) arrancar();
    window.addEventListener('focus', arrancar);
    document.addEventListener('visibilitychange', arrancar);

    return () => {
      clearTimeout(reloj);
      window.removeEventListener('focus', arrancar);
      document.removeEventListener('visibilitychange', arrancar);
    };
  }, [pop]);

  return {
    pop,
    descartarPop: useCallback(() => setPop(null), []),
    activarAvisos,
    sonidoListo,
    permiso,
    // Lo que la pantalla necesita para decidir si enseña el botón. El audio es
    // el que manda: sin sonido no hay aviso útil, con notificaciones denegadas
    // al menos queda el cartel.
    faltaActivar: activo && !sonidoListo,
  };
}

export default useAvisoKds;
