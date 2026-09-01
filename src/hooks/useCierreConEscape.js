import { useEffect, useRef } from 'react';

/**
 * Escape cierra el cuadro que está encima.
 *
 * ── POR QUÉ ESTO ES UN HOOK Y NO CUATRO LÍNEAS EN CADA MODAL ────────────────
 * En campo (28-ago) salió que **ningún** modal del proyecto cerraba con Escape:
 * los tres componentes base —`OpsModal`, `Modal` y `ConfirmModal`— no
 * escuchaban el teclado, y de ellos cuelgan unos cuarenta cuadros. Copiar un
 * `useEffect` en cada uno habría dejado cuarenta sitios donde equivocarse; con
 * esto se arregla una vez y los nuevos lo heredan.
 *
 * (`lib/Escape.js` NO tiene nada que ver con esta tecla: calcula la ruta de
 * salida de una pantalla sin riel. Nombres parecidos, cosas distintas.)
 *
 * ── LA PILA, QUE ES LO ÚNICO DELICADO ───────────────────────────────────────
 * Con dos cuadros abiertos —el cobro y su sub-modal de autorización— un
 * listener por modal cerraría LOS DOS de una tecla: el de abajo también oye el
 * evento. Por eso hay una pila y **sólo responde el último que se montó**.
 *
 * Y por eso el handler se registra UNA VEZ por montaje y el `onClose` viaja en
 * una ref: si dependiera de `onClose`, cada render del padre lo sacaría y lo
 * volvería a meter AL FINAL de la pila. Un cuadro de abajo que se re-renderiza
 * —porque su lista se actualizó por realtime, por ejemplo— pasaría a ser «el de
 * encima», y Escape cerraría el equivocado. No daría error: cerraría otra cosa.
 *
 * ── POR QUÉ EN FASE DE CAPTURA ──────────────────────────────────────────────
 * Los atajos globales escuchan en `window` sin captura (`lib/Atajos.js:155`), y
 * varias pantallas usan Escape para SALIR de la pantalla. Con el cuadro del PIN
 * abierto, el KDS te sacaba del KDS; con la cuenta parcial abierta, el POS te
 * sacaba del POS. Capturando antes y cortando la propagación, la tecla cierra
 * el cuadro y no llega a los atajos, que es lo que uno espera.
 */

// Pila de cuadros abiertos, en orden de montaje. El último es el de encima.
const pila = [];
let escuchando = false;

function alPulsar(evento) {
  if (evento.key !== 'Escape') return;
  const cima = pila[pila.length - 1];
  if (!cima) return;
  // Cortar ANTES de cerrar: si el cierre provocara otro evento, el orden
  // importa menos que garantizar que los atajos globales no lo vean.
  evento.stopPropagation();
  cima();
}

/**
 * @param {Function} onClose  Qué hacer al pulsar Escape. Si no es función, no
 *   se registra nada: un modal sin forma de cerrarse es deliberado a veces.
 * @param {boolean}  activo   Para los cuadros que se pintan condicionalmente
 *   desde un componente que no se desmonta (el caso del POS).
 */
export function useCierreConEscape(onClose, activo = true) {
  const alCerrar = useRef(onClose);

  // La ref se actualiza en un efecto y no en el cuerpo del render: tocar una
  // ref durante el render es justo lo que React desaconseja, y aquí no hace
  // falta —la tecla sólo puede llegar después de pintar, así que el efecto
  // siempre corrió antes—.
  useEffect(() => {
    alCerrar.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!activo || typeof onClose !== 'function') return undefined;

    const cerrar = () => alCerrar.current?.();
    pila.push(cerrar);

    if (!escuchando) {
      window.addEventListener('keydown', alPulsar, true);
      escuchando = true;
    }

    return () => {
      const i = pila.lastIndexOf(cerrar);
      if (i !== -1) pila.splice(i, 1);
      if (pila.length === 0) {
        window.removeEventListener('keydown', alPulsar, true);
        escuchando = false;
      }
    };
    // `onClose` está fuera a propósito —ver arriba, lo de la ref—. Sólo se
    // vuelve a registrar si el cuadro se abre o se cierra.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activo]);
}

/** Sólo para pruebas: cuántos cuadros hay escuchando. */
export function _cuadrosAbiertos() {
  return pila.length;
}
