/**
 * useAvisoKds — sonido y notificaciones cuando cae una comanda en la estación.
 *
 * La lógica de «qué es nuevo» y «por dónde sale» vive en `lib/AvisoKds.js`, y
 * el pitido en `lib/Campana.js`. Aquí sólo queda el pegamento con React: los
 * efectos, la memoria entre renders y los dos permisos del navegador.
 *
 * ── LO QUE ESTE HOOK SE NIEGA A HACER EN SILENCIO ───────────────────────────
 * Los dos permisos (audio y notificaciones) pueden estar denegados, y en ambos
 * casos el sistema *parece* funcionar: no truena, simplemente nunca avisa. Este
 * proyecto ya se llevó ese golpe con el cajón y con el REVOKE. Por eso el hook
 * devuelve `faltaActivar` y la pantalla enseña un botón: si no se oye, se ve
 * por qué.
 */
import { useEffect, useRef, useState, useCallback } from 'react';
import { comandasNuevas, textoDeAviso, canalDeAviso } from '../lib/AvisoKds';
import { desbloquear, estaListo, sonar } from '../lib/Campana';

const soportaNotificaciones = () => typeof Notification !== 'undefined';
const permisoActual = () =>
  soportaNotificaciones() ? Notification.permission : 'unsupported';

export function useAvisoKds({ comandas, estacion, activo = true }) {
  // `null` = todavía no se ha sembrado. Va en ref y no en estado porque
  // cambiarla NO debe repintar: sólo es memoria.
  const vistas = useRef(null);

  const [sonidoListo, setSonidoListo] = useState(() => estaListo());
  const [permiso, setPermiso] = useState(permisoActual);
  const [pop, setPop] = useState(null); // el aviso dentro de la página

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
    if (soportaNotificaciones() && Notification.permission === 'default') {
      try {
        setPermiso(await Notification.requestPermission());
      } catch {
        setPermiso(permisoActual());
      }
    } else {
      setPermiso(permisoActual());
    }
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

    const oculto =
      typeof document !== 'undefined' && document.visibilityState === 'hidden';

    if (canalDeAviso({ oculto, permiso }) === 'sistema') {
      try {
        // `tag` fijo: si llegan tres comandas seguidas mientras están fuera, se
        // reemplaza la misma notificación en vez de apilar tres. Al volver, lo
        // que importa es la pantalla, no el historial del centro de avisos.
        new Notification('Comanda nueva', {
          body: texto,
          tag: `kds-${estacion}`,
          renotify: true,
        });
      } catch {
        // Si el sistema la rechaza queda el pop, que sí se verá al volver.
        setPop({ texto, id: Date.now() });
      }
    } else {
      setPop({ texto, id: Date.now() });
    }
  }, [comandas, estacion, activo, permiso]);

  // El pop se va solo: nadie en una cocina va a cerrar un aviso con las manos
  // ocupadas. Se reinicia con cada aviso nuevo por la clave `pop.id`.
  useEffect(() => {
    if (!pop) return undefined;
    const t = setTimeout(() => setPop(null), 6000);
    return () => clearTimeout(t);
  }, [pop]);

  return {
    pop,
    descartarPop: useCallback(() => setPop(null), []),
    activarAvisos,
    sonidoListo,
    permiso,
    // Lo que la pantalla necesita para decidir si enseña el botón. El audio es
    // el que manda: sin sonido no hay aviso útil, con notificaciones denegadas
    // al menos queda el pop.
    faltaActivar: activo && !sonidoListo,
  };
}

export default useAvisoKds;
