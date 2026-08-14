// ─── AYUDA DE ATAJOS · F1 (Proyecto D · tanda 3) ─────────────────────────────
// Se pinta desde el REGISTRO VIVO (lib/Atajos), no desde una lista escrita a
// mano. Consecuencia buscada: la ayuda no puede mentir. Si un módulo registra
// un atajo, aparece aquí solo; si lo quita, desaparece. Y si alguien registra
// un atajo sin `descripcion`, no sale — pequeño incentivo a documentarlos.

import { Keyboard, X } from 'lucide-react';
import { useRegistroAtajos } from '../hooks/useAtajos';
import { IconButton } from './ui';

export default function AyudaAtajos({ abierta, onCerrar }) {
  const registro = useRegistroAtajos();
  if (!abierta) return null;

  return (
    <div
      className="fixed inset-0 z-[310] bg-adm-sidebar/70 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-media"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCerrar();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Atajos de teclado"
        className="w-full max-w-2xl bg-adm-panel border border-adm-border rounded-ui shadow-2xl overflow-hidden font-figtree text-adm-ink animate-in zoom-in-95 duration-media flex flex-col max-h-[80dvh]"
      >
        <div className="px-5 py-4 border-b border-adm-border flex items-center justify-between bg-adm-bg shrink-0">
          <div className="flex items-center gap-3">
            <Keyboard className="w-5 h-5 text-adm-muted" />
            <div>
              <h3 className="font-fraunces font-bold text-lg leading-none">
                Atajos de teclado
              </h3>
              <p className="text-xs text-adm-muted mt-1">
                Lo que está activo ahora mismo, en esta pantalla
              </p>
            </div>
          </div>
          <IconButton icono={X} titulo="Cerrar" onClick={onCerrar} />
        </div>

        <div className="overflow-y-auto custom-scrollbar p-5 space-y-6 flex-1">
          {registro.length === 0 ? (
            <p className="text-sm text-adm-muted text-center py-8">
              No hay atajos registrados en esta pantalla.
            </p>
          ) : (
            registro.map((grupo) => (
              <section key={grupo.scope}>
                <h4 className="text-[10px] font-bold uppercase tracking-[0.2em] text-adm-muted mb-2">
                  {grupo.titulo}
                </h4>
                <ul className="divide-y divide-adm-border border border-adm-border rounded-ui overflow-hidden">
                  {grupo.atajos.map((a) => (
                    <li
                      key={a.combo}
                      className="flex items-center justify-between gap-4 px-4 py-2.5 even:bg-adm-bg/50"
                    >
                      <span className="text-sm">{a.descripcion}</span>
                      <kbd className="text-[11px] font-bold text-adm-ink bg-adm-chip border border-adm-border rounded-ui px-2 py-1 whitespace-nowrap shrink-0">
                        {a.etiqueta}
                      </kbd>
                    </li>
                  ))}
                </ul>
              </section>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
