import { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { MoreHorizontal, X } from 'lucide-react';

/**
 * Navegación en teléfono: pestañas abajo, donde llega el pulgar.
 *
 * ── POR QUÉ NO ES EL RIEL ENCOGIDO ──────────────────────────────────────────
 * El riel colapsado mide 56 px. En un teléfono de 390 eso es el 14 % del ancho
 * gastado de forma permanente en algo que se toca dos o tres veces por turno, y
 * está arriba a la izquierda, que es la esquina más lejana del pulgar derecho.
 * Abajo no roba ancho a nada y cae donde ya está la mano.
 *
 * Y es lo que delata más que ninguna otra cosa que estás usando la app de
 * escritorio encogida en vez de una pensada para el teléfono.
 *
 * ── UNA LISTA, DOS RENDERIZADORES ───────────────────────────────────────────
 * Los destinos NO se declaran aquí. Salen de `itemsVisibles`, que es la misma
 * función que alimenta el riel y el buscador, ya filtrada por capacidades y por
 * plan. Una segunda lista «la de móvil» se desincronizaría al primer permiso
 * nuevo, y el que se queda atrás es siempre el que no usas a diario.
 *
 * ── POR QUÉ «LOS 4 PRIMEROS» Y NO UNA SELECCIÓN POR ROL ─────────────────────
 * En una barra caben 4 cómodos y hay 24 destinos, así que hay que elegir. La
 * elección es una REGLA, no una lista: los cuatro primeros que el usuario puede
 * ver, en el orden en que ya están escritos en `MENU_GRUPOS`.
 *
 * Funciona porque ese orden ya pone Principal y Operación delante, que es justo
 * lo que se usa de pie. A un mesero, cuyos permisos dejan poco más que
 * operación, le quedan exactamente sus cuatro sin configurar nada. Y a quien
 * tenga los 24, los cuatro primeros siguen siendo los de operación.
 *
 * Lo que se gana es que no hay nada que mantener: cuando se añada un destino o
 * cambie un permiso, la barra se entera sola.
 *
 * ── POR QUÉ NO APRENDE DEL USO ──────────────────────────────────────────────
 * Una barra que se reordena sola suena mejor de lo que es. Esta pantalla se usa
 * de memoria y con prisa —con platos en la otra mano— y ahí lo que importa no
 * es que el destino correcto esté cerca, sino que esté SIEMPRE EN EL MISMO
 * SITIO. Una barra que aprende garantiza justo lo contrario el día que cambia.
 */

/** Cuántas pestañas antes de «Más». Cuatro de 44 px + Más caben en 320. */
const PESTANAS_VISIBLES = 4;

export default function BarraPestanas({ items = [] }) {
  const location = useLocation();
  const [verMas, setVerMas] = useState(false);

  const principales = items.slice(0, PESTANAS_VISIBLES);
  const resto = items.slice(PESTANAS_VISIBLES);

  // Si el destino actual está en «Más», la píldora se enciende. Sin esto, un
  // mesero en Propinero vería las cuatro pestañas apagadas y ninguna pista de
  // dónde está.
  const estoyEnElResto = resto.some((it) =>
    location.pathname.startsWith(it.path),
  );

  const claseTab = (activa) =>
    `flex-1 min-w-0 flex flex-col items-center justify-center gap-1 py-2 min-h-[56px] transition-colors ${
      activa ? 'text-ops-accent' : 'text-ops-muted'
    }`;

  return (
    <>
      {verMas && (
        <>
          <button
            type="button"
            aria-hidden="true"
            tabIndex={-1}
            onClick={() => setVerMas(false)}
            className="fixed inset-0 z-40 bg-ops-ink/60 backdrop-blur-sm animate-in fade-in"
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Más destinos"
            data-figura="hoja-mas"
            className="fixed left-0 right-0 bottom-0 z-40 max-h-[75vh] flex flex-col rounded-t-[28px] bg-ops-panel border-t border-ops-border shadow-2xl animate-in slide-in-from-bottom"
          >
            <div className="pt-3 pb-1 flex justify-center shrink-0">
              <div className="w-10 h-1 rounded-full bg-ops-muted/40" />
            </div>
            <div className="px-5 pb-2 flex items-center justify-between shrink-0">
              <h2 className="font-black font-syne text-ops-ink">Más</h2>
              <button
                type="button"
                onClick={() => setVerMas(false)}
                aria-label="Cerrar"
                className="p-2 -mr-2 rounded-ui text-ops-muted hover:text-ops-ink"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto px-3 pb-6">
              {resto.map((it) => (
                <NavLink
                  key={it.path}
                  to={it.path}
                  onClick={() => setVerMas(false)}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-3 min-h-[52px] rounded-ui font-bold transition-colors ${
                      isActive
                        ? 'bg-ops-accent/10 text-ops-accent'
                        : 'text-ops-ink hover:bg-ops-panel-2'
                    }`
                  }
                >
                  <it.icon className="w-5 h-5 shrink-0" />
                  <span className="truncate">{it.label}</span>
                </NavLink>
              ))}
            </div>
          </div>
        </>
      )}

      {/* `pb-[env(safe-area-inset-bottom)]`: en un iPhone la franja del gesto de
          inicio se come el borde inferior. Sin esto la última fila de iconos
          queda debajo de la barra del sistema y se toca la del sistema. */}
      <nav
        data-figura="pestanas"
        aria-label="Navegación principal"
        className="shrink-0 flex items-stretch border-t border-ops-border bg-ops-panel pb-[env(safe-area-inset-bottom)] z-30"
      >
        {principales.map((it) => (
          <NavLink
            key={it.path}
            to={it.path}
            className={({ isActive }) => claseTab(isActive)}
          >
            <it.icon className="w-5 h-5 shrink-0" />
            {/* El rótulo va debajo del icono y no se esconde: un icono solo se
                adivina, y aquí adivinar mal cuesta salir de la pantalla en la
                que estabas trabajando. */}
            <span className="text-[10px] font-black uppercase tracking-wide truncate max-w-full px-1">
              {it.label}
            </span>
          </NavLink>
        ))}

        {resto.length > 0 && (
          <button
            type="button"
            onClick={() => setVerMas(true)}
            aria-haspopup="dialog"
            aria-expanded={verMas}
            className={claseTab(estoyEnElResto || verMas)}
          >
            <MoreHorizontal className="w-5 h-5 shrink-0" />
            <span className="text-[10px] font-black uppercase tracking-wide">
              Más
            </span>
          </button>
        )}
      </nav>
    </>
  );
}
