// ─── DATATABLE ADMIN (Proyecto D · tanda 5) ──────────────────────────────────
// La tabla densa del mock, con SELECCIÓN por teclado. Cierra el pendiente que
// quedó de la tanda 3: "tablas admin `flechas`/`Enter`/`N`".
//
// Se construye sobre las primitivas de tabla de Adm.jsx (que siguen sirviendo
// para tablas simples de solo lectura, como Auditoría); esto añade lo que no
// tenía sentido resolver dos veces:
//   · cursor de fila navegable con el teclado y visible sin ratón
//   · scroll automático a la fila enfocada
//   · Enter para abrir, N para crear, Supr para eliminar
//   · registro en el sistema central de atajos → sale solo en F1 y en la tira
//
// SEGURIDAD Y GATES: este componente NO decide nada. Si `onEditar` u `onNuevo`
// no llegan, el atajo no se registra. La pantalla es quien aplica permisos,
// igual que en operación: el atajo llama al MISMO handler que el botón.
//
// Contrato de columna:
//   { id, titulo, ancho?, alinear?: 'izq'|'der'|'centro', celda: (fila) => ReactNode }

import { useMemo, useRef, useState } from 'react';
import { useAtajos } from '../../hooks/useAtajos';

const unir = (...c) => c.filter(Boolean).join(' ');

const ALINEACION = {
  izq: 'text-left',
  der: 'text-right tabular-nums',
  centro: 'text-center',
};

export default function DataTable({
  columnas,
  filas,
  claveFila = (f) => f.id,
  onEditar,
  onNuevo,
  onEliminar,
  scope = 'tabla',
  titulo = 'Tabla',
  activo = true,
  vacio,
  className = '',
}) {
  const cuerpoRef = useRef(null);
  const [selId, setSelId] = useState(null);

  // La selección es DERIVADA (mismo criterio que el mapa de Mesas): si la fila
  // se filtra o desaparece, el cursor cae en la primera en vez de quedarse
  // apuntando a un id fantasma. Un efecto que "corrigiera" el id sería un
  // render en cascada y un bug en cuanto llegue un realtime.
  const seleccionada = useMemo(() => {
    if (!filas?.length) return null;
    return (
      filas.find((f) => String(claveFila(f)) === String(selId)) ?? filas[0]
    );
  }, [filas, selId, claveFila]);

  const mover = (delta) => {
    if (!filas?.length) return;
    const i = filas.findIndex(
      (f) => String(claveFila(f)) === String(claveFila(seleccionada)),
    );
    const siguiente = Math.min(
      filas.length - 1,
      Math.max(0, (i < 0 ? 0 : i) + delta),
    );
    const fila = filas[siguiente];
    setSelId(claveFila(fila));
    cuerpoRef.current
      ?.querySelector(`[data-fila="${claveFila(fila)}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  };

  const mapa = {
    arrowdown: { descripcion: 'Moverse por la lista', accion: () => mover(1) },
    arrowup: { accion: () => mover(-1) },
    // Página entera: en un catálogo de 300 insumos, bajar de uno en uno no es
    // navegación, es paciencia.
    pagedown: { accion: () => mover(10) },
    pageup: { accion: () => mover(-10) },
  };
  if (onEditar) {
    mapa.enter = {
      descripcion: 'Abrir el seleccionado',
      accion: () => seleccionada && onEditar(seleccionada),
    };
  }
  if (onNuevo) {
    mapa.n = { descripcion: 'Nuevo', accion: () => onNuevo() };
  }
  if (onEliminar) {
    mapa.delete = {
      descripcion: 'Eliminar el seleccionado',
      accion: () => seleccionada && onEliminar(seleccionada),
    };
  }

  useAtajos(scope, mapa, { titulo, activo });

  if (!filas?.length) return vacio ?? null;

  return (
    <div
      className={unir(
        'flex-1 min-h-0 flex flex-col overflow-hidden bg-adm-panel border border-adm-border rounded-ui',
        className,
      )}
    >
      <div ref={cuerpoRef} className="overflow-auto custom-scrollbar flex-1">
        <table className="w-full text-left text-sm border-collapse">
          <thead className="sticky top-0 z-10 bg-adm-bg border-b border-adm-border">
            <tr>
              {columnas.map((c) => (
                <th
                  key={c.id}
                  style={c.ancho ? { width: c.ancho } : undefined}
                  className={unir(
                    'px-4 py-2.5 text-[10px] font-bold uppercase tracking-[0.16em] text-adm-muted whitespace-nowrap',
                    ALINEACION[c.alinear] ?? ALINEACION.izq,
                  )}
                >
                  {c.titulo}
                </th>
              ))}
            </tr>
          </thead>
          {/* Zebra por CSS (even:) y no por índice: sobrevive a filtros y
              reordenamientos sin recalcular nada. */}
          <tbody className="divide-y divide-adm-border [&>tr:nth-child(even)]:bg-adm-bg/50">
            {filas.map((fila) => {
              const k = claveFila(fila);
              const esSel =
                seleccionada && String(k) === String(claveFila(seleccionada));
              return (
                <tr
                  key={k}
                  data-fila={k}
                  aria-selected={!!esSel}
                  onClick={() => setSelId(k)}
                  onDoubleClick={() => onEditar?.(fila)}
                  className={unir(
                    'transition-colors',
                    onEditar && 'cursor-pointer',
                    esSel
                      ? // El cursor se marca con un filete a la izquierda, no
                        // con un fondo: sobre la zebra un relleno se confunde
                        // con "fila par" y deja de leerse como selección.
                        'bg-adm-chip/60 shadow-[inset_3px_0_0_0_var(--adm-accent)]'
                      : 'hover:bg-adm-chip/40',
                  )}
                >
                  {columnas.map((c) => (
                    <td
                      key={c.id}
                      className={unir(
                        'px-4 py-3 align-middle',
                        ALINEACION[c.alinear] ?? ALINEACION.izq,
                      )}
                    >
                      {c.celda(fila)}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
