// ─── useAtajos (Proyecto D · tanda 3) ────────────────────────────────────────
// Cara React del registro central (lib/Atajos.js). Una pantalla declara sus
// atajos y se olvida: el alta/baja va con el ciclo de vida del componente.
//
//   useAtajos('mesas', {
//     enter: { descripcion: 'Abrir la mesa', accion: abrirMesa },
//     r:     { descripcion: 'Reservar',      accion: reservar },
//   }, { titulo: 'Mapa de mesas', activo: !hayModal });
//
// La ACCIÓN se resuelve contra un ref en el momento de pulsar, así el handler
// siempre ve el estado fresco sin re-registrar el scope en cada tecleo.

import { useEffect, useRef, useSyncExternalStore } from 'react';
import {
  registrarAtajos,
  listarAtajos,
  suscribirAtajos,
  siguienteOrden,
} from '../lib/Atajos';

// Identidad del scope de cara al REGISTRO: combos + descripciones.
//
// Las descripciones entran a propósito. Varias son dinámicas —"Cobrar la mesa"
// vs "Abrir la mesa" según el estado de la seleccionada, "Colapsar" vs
// "Expandir" el menú— y viven en el registro, que es de donde se pintan F1 y la
// tira de hints. Si la firma solo mirara las claves, el atajo funcionaría bien
// pero el texto en pantalla se quedaría congelado en el primer valor: la ayuda
// mentiría, que es justo lo que este diseño quiere evitar.
function firmaDelMapa(mapa) {
  return Object.entries(mapa || {})
    .map(([combo, v]) => `${combo}:${(v && v.descripcion) || ''}`)
    .sort()
    .join('|');
}

export function useAtajos(scope, mapa, { titulo, activo = true } = {}) {
  // Precedencia por MONTAJE, no por último registro: se reserva una vez y se
  // reusa en cada re-registro (ver siguienteOrden en lib/Atajos).
  const ordenRef = useRef(null);
  if (ordenRef.current === null) ordenRef.current = siguienteOrden();

  const mapaRef = useRef(mapa);
  // El ref se refresca DESPUÉS del render (tocarlo durante el render es lo que
  // React desaconseja). Basta: las teclas se pulsan entre renders, nunca dentro.
  useEffect(() => {
    mapaRef.current = mapa;
  });

  const firma = firmaDelMapa(mapa);

  useEffect(() => {
    if (!activo) return undefined;

    // Se registran PROXIES: la metadata se congela en el alta (por eso la firma
    // la incluye) pero la acción se busca en el mapa vigente al pulsar.
    const proxy = {};
    for (const [combo, valor] of Object.entries(mapaRef.current || {})) {
      if (!valor) continue;
      const meta = typeof valor === 'function' ? {} : valor;
      proxy[combo] = {
        descripcion: meta.descripcion,
        permitirEnInput: meta.permitirEnInput,
        prevenir: meta.prevenir,
        accion: (e) => {
          const actual = mapaRef.current?.[combo];
          if (!actual) return;
          const fn = typeof actual === 'function' ? actual : actual.accion;
          fn?.(e);
        },
      };
    }

    return registrarAtajos({
      scope,
      titulo,
      mapa: proxy,
      orden: ordenRef.current,
    });
  }, [scope, titulo, activo, firma]);
}

/** Registro vivo para la ayuda de F1 y la tira de hints. */
export function useRegistroAtajos() {
  return useSyncExternalStore(suscribirAtajos, listarAtajos, listarAtajos);
}
