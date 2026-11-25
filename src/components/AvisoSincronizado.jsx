// src/components/AvisoSincronizado.jsx
//
// ── POR QUÉ NO ES UN TOAST ──────────────────────────────────────────────────
// Con conexión, la cola sube algo en casi cada toque. Hasta la 0.3.3 cada
// subida saltaba como notificación en medio de la pantalla («1 cambio
// sincronizado»), y en la barrida del 25-nov salía para todo. Chris: que sea
// una frase en la barra de arriba que se ilumine. Dice lo mismo, no tapa nada,
// y quien la busca la encuentra.
//
// ── CÓMO SE ILUMINA SIN ESTADO ──────────────────────────────────────────────
// La cola deja `ultimaSubida = { cantidad, en }`. El `key` cambia con `en`, así
// que React vuelve a montar la frase y la animación de `index.css`
// (`aviso-sync-brillo`) arranca de nuevo: brilla en el verde de «bien» de su
// familia y se apaga sola. Sin temporizador ni `setState` en un efecto.
//
// ── LO QUE NO ENSEÑA, A PROPÓSITO ───────────────────────────────────────────
// «Por subir». Cada cambio pasa por la cola un instante antes de subir, así que
// enseñarlo haría parpadear la barra en cada toque, que es justo lo que se
// quitó. Lo pendiente de verdad (sin internet, fallos) ya lo dicen la barra de
// estado y el aviso rojo de «cambios sin sincronizar».
import { CloudCheck } from 'lucide-react';
import { useSyncStore } from '../store/useSyncStore';

function textoDeSubida(ultima) {
  if (!ultima) return 'Sincronizado';
  const n = Number(ultima.cantidad) || 0;
  return `${n} cambio${n === 1 ? '' : 's'} sincronizado${n === 1 ? '' : 's'}`;
}

/**
 * @param {'adm'|'ops'} familia  colores de administración u operación
 * @param {boolean}      compacto sólo el icono (teléfono); el texto queda para
 *                                el lector de pantalla y el `title`
 */
export default function AvisoSincronizado({
  familia = 'adm',
  compacto = false,
  className = '',
}) {
  const leida = useSyncStore((s) => s?.ultimaSubida ?? null);
  // Sólo cuenta una subida bien formada: si alguien entrega otra cosa (un
  // simulacro del almacén que ignora el selector, por ejemplo), se queda en
  // «Sincronizado» en vez de pintar «undefined cambios».
  const ultima =
    leida && typeof leida.en === 'number' && Number(leida.cantidad) > 0
      ? leida
      : null;
  const texto = textoDeSubida(ultima);
  const apagado = familia === 'ops' ? 'text-ops-muted' : 'text-adm-muted';

  return (
    <span
      key={ultima?.en ?? 'inicio'}
      data-aviso-sync={ultima ? 'subio' : 'inicio'}
      title={texto}
      style={{
        '--brillo': familia === 'ops' ? 'var(--ops-ok)' : 'var(--adm-ok)',
      }}
      className={`inline-flex items-center gap-1.5 h-8 px-2 rounded-ui text-xs font-semibold whitespace-nowrap shrink-0 ${apagado} ${
        ultima ? 'aviso-sync-brillo' : ''
      } ${className}`}
    >
      <CloudCheck className="w-4 h-4 shrink-0" aria-hidden="true" />
      <span className={compacto ? 'sr-only' : ''}>{texto}</span>
    </span>
  );
}
