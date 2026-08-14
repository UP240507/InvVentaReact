import { useEffect } from 'react';
import { X } from 'lucide-react';
import { useAcoplado } from '../hooks/useAcoplado';

/**
 * Panel secundario que cambia de FIGURA, no de contenido.
 *
 * Ancho suficiente → columna acoplada a la derecha, siempre visible.
 * Ancho corto      → hoja que sube desde abajo, con una barra flotante que la
 *                    llama y que enseña lo mínimo para no tener que abrirla.
 *
 * Sale de los mockups de teléfono y tablet: los tres sitios donde las dos
 * maquetas difieren —carrito del POS, detalle de mesa, inspector del KDS— son
 * el mismo problema. Resolverlo tres veces daría tres comportamientos que se
 * parecen, y a los seis meses uno de ellos cerraría con Escape y los otros no.
 *
 * `children` se pasa UNA vez y se pinta UNA vez. Nada de duplicar el árbol para
 * «la versión móvil»: dos árboles se desincronizan, y el que se queda atrás es
 * siempre el que no usas a diario.
 *
 * ── Por qué la hoja no está montada cuando está cerrada ─────────────────────
 * Se desmonta en vez de esconderse con CSS. El contenido de estos paneles no es
 * decorativo —el carrito, la comanda de una mesa— y dejarlo montado detrás de
 * una hoja cerrada significa que sigue suscrito, sigue recalculando y sigue
 * siendo alcanzable con el tabulador desde el catálogo. En una caja que lleva
 * ocho horas abierta eso se nota.
 *
 * @param {boolean}  abierto        sólo se mira en modo hoja
 * @param {Function} onAbrir
 * @param {Function} onCerrar
 * @param {string}   titulo         cabecera de la hoja
 * @param {string}   etiquetaAbrir  texto de la barra flotante
 * @param {string}   resumen        lo que la barra enseña sin abrir (un total)
 * @param {number}   insignia       contador en la barra flotante
 * @param {boolean}  disparador     si false, la barra no aparece
 * @param {string}   anchoAcoplado  clases del ancho en modo columna
 */
export default function PanelAcoplable({
  abierto = false,
  onAbrir,
  onCerrar,
  titulo = '',
  etiquetaAbrir = 'Ver detalle',
  resumen = '',
  insignia = 0,
  disparador = true,
  anchoAcoplado = 'lg:w-[400px] xl:w-[450px]',
  children,
}) {
  const acoplado = useAcoplado();
  const hojaAbierta = !acoplado && abierto;

  // Con la hoja arriba, el fondo no debe correrse bajo el dedo: en un teléfono
  // el gesto de desplazar la hoja se le escapa al contenedor de atrás y acabas
  // moviendo el catálogo mientras crees estar moviendo el carrito.
  useEffect(() => {
    if (!hojaAbierta) return;
    const previo = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previo;
    };
  }, [hojaAbierta]);

  useEffect(() => {
    if (!hojaAbierta) return;
    const alPulsar = (e) => {
      if (e.key === 'Escape') onCerrar?.();
    };
    window.addEventListener('keydown', alPulsar);
    return () => window.removeEventListener('keydown', alPulsar);
  }, [hojaAbierta, onCerrar]);

  // ── Figura ancha: una columna más, y ya ──────────────────────────────────
  // `h-full` y no `h-screen`: el POS se traga el viewport entero, pero el mapa
  // de mesas vive dentro del layout, debajo de la barra de navegación. Con
  // `h-screen` la columna del inspector sobresalía por abajo justo lo que mide
  // esa barra, y las acciones del pie quedaban fuera de la pantalla. Pidiendo
  // la altura al padre sale bien en los dos: en el POS el padre YA es h-screen.
  //
  // `shrink-0` porque el hermano es `flex-1`: sin él, una lista ancha —un
  // nombre de producto largo, una tabla— empuja y el panel se estrecha por
  // debajo del ancho que se le pidió.
  if (acoplado) {
    return (
      <aside
        data-figura="acoplado"
        className={`${anchoAcoplado} shrink-0 flex flex-col h-full bg-ops-panel shadow-2xl z-20 border-l border-ops-border transition-colors duration-lenta`}
      >
        {children}
      </aside>
    );
  }

  // ── Figura estrecha: barra flotante + hoja ───────────────────────────────
  return (
    <>
      {/* La barra vive por encima del contenido y no le roba altura: en un
          teléfono de 844 px, las dos mitades al 50 % dejaban al catálogo una
          fila y media de productos. */}
      {disparador && !abierto && (
        <button
          type="button"
          onClick={onAbrir}
          data-figura="disparador"
          className="fixed left-4 right-4 bottom-4 h-14 z-30 rounded-ui-lg bg-ops-accent text-ops-accent-fg shadow-2xl shadow-ops-accent/30 flex items-center justify-between px-5 font-black active:scale-[0.98] transition-transform"
        >
          <span className="flex items-center gap-2.5">
            {insignia > 0 && (
              <span className="min-w-6 h-6 px-1.5 rounded-full bg-ops-accent-fg/20 flex items-center justify-center text-xs tabular-nums">
                {insignia}
              </span>
            )}
            {etiquetaAbrir}
          </span>
          {resumen && <span className="tabular-nums">{resumen}</span>}
        </button>
      )}

      {abierto && (
        <>
          {/* El velo es un atajo del dedo, no un control: fuera del árbol de
              accesibilidad y fuera del tabulador. Antes era un botón con
              `aria-label="Cerrar"` y entonces había DOS «Cerrar» dentro del
              mismo diálogo —el velo y el aspa—, que a un lector de pantalla le
              suena a dos salidas distintas y a una prueba la obliga a elegir
              con un `[0]`. Quien no usa el dedo tiene el aspa y tiene Escape. */}
          <button
            type="button"
            aria-hidden="true"
            tabIndex={-1}
            data-figura="velo"
            onClick={onCerrar}
            className="fixed inset-0 z-40 bg-ops-ink/60 backdrop-blur-sm animate-in fade-in"
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label={titulo || etiquetaAbrir}
            data-figura="hoja"
            className="fixed left-0 right-0 bottom-0 z-40 max-h-[88dvh] flex flex-col rounded-t-[28px] bg-ops-panel border-t border-ops-border shadow-2xl animate-in slide-in-from-bottom"
          >
            {/* Asa. No arrastra —eso pide gestos y un estado más— pero dice
                «esto se cierra tirando hacia abajo», que es lo que la mano
                intenta antes de buscar un botón. */}
            <div className="pt-3 pb-1 flex justify-center shrink-0">
              <div className="w-10 h-1 rounded-full bg-ops-muted/40" />
            </div>

            {/* El título es opcional: varios paneles ya traen su propia
                cabecera dentro —con iconos, contadores, lo que sea— y
                repetirlo aquí arriba daría dos veces el mismo nombre en cinco
                centímetros de pantalla. Cuando no se pasa, esta fila queda
                sólo con el botón de cerrar. */}
            <div className="px-5 pb-2 flex items-center justify-between shrink-0">
              {titulo ? (
                <h2 className="font-black font-syne text-ops-ink truncate">
                  {titulo}
                </h2>
              ) : (
                <span />
              )}
              <button
                type="button"
                onClick={onCerrar}
                aria-label="Cerrar"
                className="p-2 -mr-2 rounded-ui text-ops-muted hover:text-ops-ink hover:bg-ops-panel-2 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
              {children}
            </div>
          </div>
        </>
      )}
    </>
  );
}
