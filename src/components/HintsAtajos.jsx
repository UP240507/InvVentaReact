// ─── HINTS DE ATAJOS (Proyecto D · tanda 3) ──────────────────────────────────
// Tira de teclas del scope ACTIVO. Existe por una razón concreta: un atajo que
// solo vive en F1 no se aprende. En un turno real nadie abre la ayuda — la ve
// de reojo mientras cobra, y a la tercera vez ya no mira.
//
// Se alimenta del registro vivo (lib/Atajos), igual que la ayuda: si un módulo
// deja de ofrecer una acción, el hint desaparece solo.
//
// Uso: <HintsAtajos scope="pos" /> — con `scope` pinta ese; sin él, el último
// registrado (el módulo abierto).

import { useRegistroAtajos } from '../hooks/useAtajos';

export default function HintsAtajos({ scope, className = '' }) {
  const registro = useRegistroAtajos();

  const grupo = scope
    ? registro.find((g) => g.scope === scope)
    : registro[registro.length - 1];

  if (!grupo || grupo.atajos.length === 0) return null;

  return (
    <div
      className={`flex items-center gap-x-4 gap-y-1 flex-wrap text-[11px] select-none ${className}`}
    >
      {grupo.atajos.map((a) => (
        <span key={a.combo} className="flex items-center gap-1.5 opacity-80">
          <kbd className="font-bold border border-current/30 rounded-ui px-1.5 py-0.5 leading-none opacity-90">
            {a.etiqueta}
          </kbd>
          <span>{a.descripcion}</span>
        </span>
      ))}
      <span className="flex items-center gap-1.5 opacity-60">
        <kbd className="font-bold border border-current/30 rounded-ui px-1.5 py-0.5 leading-none">
          F1
        </kbd>
        <span>todos</span>
      </span>
    </div>
  );
}
