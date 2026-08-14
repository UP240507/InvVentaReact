// ─── PRIMITIVAS DEL SHELL EDITORIAL (Proyecto D · tanda 2) ───────────────────
// El vocabulario visual de la superficie ADMIN, en tokens adm-* puros: reaccionan
// solos a los 3 temas × claro/oscuro sin una sola clase de color hardcodeada.
//
// Por qué existen: hasta ahora cada pantalla repetía su propio
// su propio bloque de clases de color y radio a mano. Eso es lo
// que hace que un cambio de tema sea una cacería por 24 archivos. A partir de
// aquí, una pantalla admin se arma componiendo estas piezas.
//
// Reglas:
//  · NUNCA colores literales (grises ni familias de Tailwind) — solo roles adm-*.
//  · Radio `rounded-ui` (esquinas casi rectas del editorial), nunca 2.5rem.
//  · Estas piezas son de ADMIN. Operación (POS/KDS/mesas/espera/checador/
//    propinero) conserva su paleta industrial: no las importes ahí.

import { X } from 'lucide-react';
import HintsAtajos from '../HintsAtajos';

const unir = (...cls) => cls.filter(Boolean).join(' ');

// ── Contenedor de pantalla ───────────────────────────────────────────────────
export function PageShell({ children, className = '', ancho = 'max-w-7xl' }) {
  return (
    <div
      className={unir(
        'p-6 md:p-8 mx-auto flex flex-col h-full font-figtree text-adm-ink animate-in fade-in duration-media',
        ancho,
        className,
      )}
    >
      {children}
    </div>
  );
}

// ── Encabezado de pantalla ───────────────────────────────────────────────────
// `icono` es opcional a propósito: el editorial pesa más en la tipografía que
// en los medallones de color del skin viejo.
export function PageHeader({
  titulo,
  descripcion,
  icono: Icono,
  acciones,
  scopeAtajos,
  className = '',
}) {
  return (
    <header
      className={unir(
        'flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-5 mb-6 border-b border-adm-border',
        className,
      )}
    >
      <div className="flex items-center gap-4 min-w-0">
        {Icono && (
          <div className="w-11 h-11 rounded-ui bg-adm-chip text-adm-chip-fg flex items-center justify-center shrink-0">
            <Icono className="w-5 h-5" />
          </div>
        )}
        <div className="min-w-0">
          <h1 className="font-fraunces font-bold text-adm-ink text-2xl md:text-3xl leading-tight truncate">
            {titulo}
          </h1>
          {descripcion && (
            <p className="text-sm text-adm-muted mt-1">{descripcion}</p>
          )}
          {scopeAtajos && (
            <HintsAtajos
              scope={scopeAtajos}
              className="hidden lg:flex mt-2 text-adm-muted"
            />
          )}
        </div>
      </div>
      {acciones && (
        <div className="flex items-center gap-2 shrink-0">{acciones}</div>
      )}
    </header>
  );
}

// ── Botón ────────────────────────────────────────────────────────────────────
const VARIANTES_BOTON = {
  primario: 'bg-adm-accent text-adm-accent-fg hover:opacity-90',
  secundario:
    'bg-adm-panel text-adm-ink border border-adm-border hover:bg-adm-bg',
  fantasma: 'bg-transparent text-adm-muted hover:text-adm-ink hover:bg-adm-bg',
  peligro: 'bg-adm-danger text-adm-accent-fg hover:opacity-90',
  cobro: 'bg-adm-cobro text-adm-cobro-fg hover:opacity-90',
};

const TAMANOS_BOTON = {
  sm: 'h-8 px-3 text-xs gap-1.5',
  md: 'h-10 px-4 text-sm gap-2',
  lg: 'h-12 px-6 text-base gap-2',
};

export function Button({
  children,
  variante = 'primario',
  tamano = 'md',
  icono: Icono,
  className = '',
  type = 'button',
  ...props
}) {
  return (
    <button
      type={type}
      className={unir(
        'inline-flex items-center justify-center font-bold rounded-ui transition-all active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none',
        // Foco visible: la superficie admin es teclado-first (tanda 3).
        'outline-none focus-visible:ring-2 focus-visible:ring-adm-accent focus-visible:ring-offset-1 focus-visible:ring-offset-adm-bg',
        VARIANTES_BOTON[variante] ?? VARIANTES_BOTON.primario,
        TAMANOS_BOTON[tamano] ?? TAMANOS_BOTON.md,
        className,
      )}
      {...props}
    >
      {Icono && <Icono className="w-4 h-4 shrink-0" />}
      {children}
    </button>
  );
}

// ── Botón de icono ───────────────────────────────────────────────────────────
export function IconButton({ icono: Icono, titulo, className = '', ...props }) {
  return (
    <button
      type="button"
      title={titulo}
      aria-label={titulo}
      className={unir(
        'p-2 rounded-ui text-adm-muted hover:text-adm-ink hover:bg-adm-bg transition-colors outline-none focus-visible:ring-2 focus-visible:ring-adm-accent',
        className,
      )}
      {...props}
    >
      <Icono className="w-4 h-4" />
    </button>
  );
}

// ── Tarjeta ──────────────────────────────────────────────────────────────────
export function Card({ children, className = '', hover = false, ...props }) {
  return (
    <div
      className={unir(
        'bg-adm-panel border border-adm-border rounded-ui',
        hover && 'transition-colors hover:border-adm-accent/50',
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function CardBody({ children, className = '' }) {
  return <div className={unir('p-5', className)}>{children}</div>;
}

// ── Chip / badge ─────────────────────────────────────────────────────────────
const TONOS_CHIP = {
  neutro: 'bg-adm-chip text-adm-chip-fg',
  ok: 'bg-adm-ok/10 text-adm-ok',
  alerta: 'bg-adm-accent/10 text-adm-accent',
  peligro: 'bg-adm-danger/10 text-adm-danger',
};

export function Chip({ children, tono = 'neutro', className = '' }) {
  return (
    <span
      className={unir(
        'inline-flex items-center px-2 py-0.5 rounded-ui text-[10px] font-bold uppercase tracking-[0.14em] whitespace-nowrap',
        TONOS_CHIP[tono] ?? TONOS_CHIP.neutro,
        className,
      )}
    >
      {children}
    </span>
  );
}

// ── Estado vacío ─────────────────────────────────────────────────────────────
export function EmptyState({ icono: Icono, titulo, descripcion, accion }) {
  return (
    <div className="py-16 px-6 text-center border border-dashed border-adm-border rounded-ui">
      {Icono && (
        <Icono className="w-12 h-12 mx-auto mb-4 text-adm-muted opacity-40" />
      )}
      <p className="font-fraunces font-bold text-lg text-adm-ink">{titulo}</p>
      {descripcion && (
        <p className="text-sm text-adm-muted mt-1 max-w-sm mx-auto">
          {descripcion}
        </p>
      )}
      {accion && <div className="mt-5 flex justify-center">{accion}</div>}
    </div>
  );
}

// ── Campo de búsqueda de pantalla ────────────────────────────────────────────
// (Distinto del buscador global del topbar: este filtra la lista de la pantalla.)
export function SearchField({
  value,
  onChange,
  placeholder = 'Buscar…',
  icono: Icono,
  className = '',
}) {
  return (
    <div
      className={unir(
        // Contorno de CONTROL, no de tarjeta: el buscador es un campo aunque el
        // <input> viva dentro de este contenedor (ver --adm-field en index.css).
        'flex items-center gap-2 h-10 px-3 bg-adm-panel border border-adm-field rounded-ui focus-within:border-adm-accent transition-colors',
        className,
      )}
    >
      {Icono && <Icono className="w-4 h-4 text-adm-muted shrink-0" />}
      <input
        type="text"
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        className="flex-1 bg-transparent outline-none text-sm text-adm-ink placeholder:text-adm-muted min-w-0"
      />
    </div>
  );
}

// ── Segmentos / tabs de filtro ───────────────────────────────────────────────
export function SegmentedControl({
  opciones,
  valor,
  onChange,
  className = '',
}) {
  return (
    <div
      className={unir(
        'inline-flex bg-adm-bg border border-adm-border rounded-ui p-0.5 shrink-0',
        className,
      )}
      role="tablist"
    >
      {opciones.map((op) => {
        const id = op.id ?? op;
        const label = op.label ?? op;
        const activo = valor === id;
        return (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={activo}
            onClick={() => onChange(id)}
            className={unir(
              'px-4 h-8 rounded-ui text-xs font-bold transition-colors whitespace-nowrap',
              activo
                ? 'bg-adm-panel text-adm-ink shadow-sm'
                : 'text-adm-muted hover:text-adm-ink',
            )}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

// ── Campos de formulario ─────────────────────────────────────────────────────
// OJO: definidos a nivel de módulo. Declarar un componente de campo DENTRO del
// render remonta el input en cada tecla y le roba el foco (bug ya vivido en
// ProveedoresScreen; ver el comentario de LabelInput que esto reemplaza).
const CLASE_CONTROL =
  'w-full px-3 py-2.5 bg-adm-bg border border-adm-field rounded-ui text-sm text-adm-ink placeholder:text-adm-muted outline-none focus:border-adm-accent transition-colors';

export function Field({ label, requerido = false, children, className = '' }) {
  return (
    <div className={className}>
      {label && (
        <label className="block text-[10px] font-bold text-adm-muted uppercase tracking-[0.16em] mb-1.5">
          {label}
          {requerido && <span className="text-adm-danger"> *</span>}
        </label>
      )}
      {children}
    </div>
  );
}

export function Input({ className = '', ...props }) {
  return <input className={unir(CLASE_CONTROL, className)} {...props} />;
}

export function Textarea({ className = '', ...props }) {
  return (
    <textarea
      className={unir(CLASE_CONTROL, 'resize-none', className)}
      {...props}
    />
  );
}

export function Select({ className = '', children, ...props }) {
  return (
    <select className={unir(CLASE_CONTROL, className)} {...props}>
      {children}
    </select>
  );
}

// ── Tabla densa ──────────────────────────────────────────────────────────────
// Composicional a propósito (no una DataTable con `columns`): las pantallas
// admin tienen celdas muy distintas entre sí y una API declarativa terminaría
// llena de escapes. Lo que se comparte es la piel: densidad, zebra, header
// pegajoso, divisores.
export function TableWrap({ children, className = '' }) {
  return (
    <Card
      className={unir(
        'flex-1 min-h-0 flex flex-col overflow-hidden',
        className,
      )}
    >
      <div className="overflow-auto custom-scrollbar flex-1">{children}</div>
    </Card>
  );
}

export function Table({ children, className = '' }) {
  return (
    <table
      className={unir('w-full text-left text-sm border-collapse', className)}
    >
      {children}
    </table>
  );
}

export function THead({ children }) {
  return (
    <thead className="sticky top-0 z-10 bg-adm-bg border-b border-adm-border">
      {children}
    </thead>
  );
}

export function Th({ children, className = '', ...props }) {
  return (
    <th
      className={unir(
        'px-4 py-2.5 text-[10px] font-bold uppercase tracking-[0.16em] text-adm-muted whitespace-nowrap',
        className,
      )}
      {...props}
    >
      {children}
    </th>
  );
}

// Zebra por CSS (even:) en vez de índice: sobrevive a filtros y reordenamientos.
export function TBody({ children, className = '' }) {
  return (
    <tbody
      className={unir(
        'divide-y divide-adm-border [&>tr:nth-child(even)]:bg-adm-bg/50',
        className,
      )}
    >
      {children}
    </tbody>
  );
}

export function Tr({ children, className = '', ...props }) {
  return (
    <tr
      className={unir('hover:bg-adm-chip/40 transition-colors', className)}
      {...props}
    >
      {children}
    </tr>
  );
}

export function Td({ children, className = '', ...props }) {
  return (
    <td className={unir('px-4 py-3 align-middle', className)} {...props}>
      {children}
    </td>
  );
}

// Números: tabulares y a la derecha, para que las columnas de dinero cuadren.
export function TdNum({ children, className = '', ...props }) {
  return (
    <Td className={unir('text-right tabular-nums', className)} {...props}>
      {children}
    </Td>
  );
}

// ── Modal ────────────────────────────────────────────────────────────────────
export function Modal({
  titulo,
  onClose,
  children,
  pie,
  as: Elemento = 'div',
  ancho = 'max-w-lg',
  ...props
}) {
  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-adm-sidebar/70 backdrop-blur-sm animate-in fade-in duration-media">
      <Elemento
        className={unir(
          // `dvh` y no `vh`: con el teclado abierto en un teléfono, `vh` sigue
          // midiendo la pantalla completa y el pie del modal —donde vive
          // «Guardar»— se queda debajo del teclado, inalcanzable. Junto con
          // `interactive-widget=resizes-content` en index.html, esto lo tapa
          // para TODOS los modales del ERP de una vez.
          'bg-adm-panel border border-adm-border rounded-ui shadow-2xl w-full flex flex-col max-h-[90dvh] overflow-hidden animate-in zoom-in-95 duration-media font-figtree text-adm-ink',
          ancho,
        )}
        {...props}
      >
        <div className="px-5 py-4 border-b border-adm-border flex justify-between items-center shrink-0 bg-adm-bg">
          <h3 className="font-fraunces font-bold text-lg text-adm-ink">
            {titulo}
          </h3>
          {onClose && (
            <IconButton icono={X} titulo="Cerrar" onClick={onClose} />
          )}
        </div>
        <div className="p-5 overflow-y-auto custom-scrollbar space-y-4">
          {children}
        </div>
        {pie && (
          <div className="px-5 py-4 border-t border-adm-border shrink-0 flex gap-3">
            {pie}
          </div>
        )}
      </Elemento>
    </div>
  );
}

/** Modal de confirmación destructiva (ocultar/eliminar). */
export function ConfirmModal({
  titulo,
  mensaje,
  icono: Icono,
  textoConfirmar = 'Confirmar',
  onConfirmar,
  onCancelar,
}) {
  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-adm-sidebar/70 backdrop-blur-sm animate-in fade-in duration-media">
      <div className="bg-adm-panel border border-adm-border rounded-ui shadow-2xl w-full max-w-sm p-6 text-center animate-in zoom-in-95 duration-media font-figtree">
        {Icono && (
          <div className="w-14 h-14 rounded-ui bg-adm-danger/10 text-adm-danger flex items-center justify-center mx-auto mb-4">
            <Icono className="w-7 h-7" />
          </div>
        )}
        <h2 className="font-fraunces font-bold text-xl text-adm-ink mb-2">
          {titulo}
        </h2>
        <div className="text-sm text-adm-muted mb-6">{mensaje}</div>
        <div className="flex gap-3">
          <Button variante="secundario" className="flex-1" onClick={onCancelar}>
            Cancelar
          </Button>
          <Button variante="peligro" className="flex-1" onClick={onConfirmar}>
            {textoConfirmar}
          </Button>
        </div>
      </div>
    </div>
  );
}
