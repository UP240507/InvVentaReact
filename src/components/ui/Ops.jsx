// ─── PRIMITIVAS DE OPERACIÓN (Proyecto D · tanda 5) ──────────────────────────
// El gemelo industrial de Adm.jsx. Mismo propósito —un vocabulario visual en
// vez de clases repetidas en cada pantalla— pero para la OTRA superficie del
// híbrido: POS, KDS, Mesas, Propinero, Espera, Checador.
//
// Por qué dos juegos de primitivas y no uno con variantes: las reglas son
// opuestas y mezclarlas produce lo peor de ambas.
//
//   ADMIN (adm-*)            OPERACIÓN (ops-*)
//   filas de 12px, densas    targets ≥44px, se toca con el dedo
//   se lee sentado, a 50cm   se lee de pie, a un metro, con prisa
//
// Lo que YA NO las distingue (Chris, 25-jul): ni el color —las dos usan tokens
// del tenant— ni el radio. La app entera comparte la escala `rounded-ui` /
// `rounded-ui-lg`: un Dashboard cuadrado junto a un POS de esquinas de 2.5rem
// se leía como dos productos distintos.
//
// COLOR: desde el 25-jul operación también usa los tokens del TENANT
// (--ops-*, un bloque por tema × claro/oscuro). Antes la paleta industrial
// estaba quemada y cambiar de tema no se notaba justo en las pantallas que más
// se usan. Aquí NO se escriben colores literales: solo roles.

import { WifiOff, X } from 'lucide-react';
import HintsAtajos from '../HintsAtajos';

const unir = (...cls) => cls.filter(Boolean).join(' ');

// ── Contenedor de pantalla ───────────────────────────────────────────────────
export function OpsShell({ children, className = '', ancho = 'max-w-7xl' }) {
  return (
    <div
      className={unir(
        'p-6 md:p-8 mx-auto h-full flex flex-col min-h-0 animate-in fade-in duration-media text-ops-ink transition-colors',
        ancho,
        className,
      )}
    >
      {children}
    </div>
  );
}

// ── Cabecera ─────────────────────────────────────────────────────────────────
// `scopeAtajos` engancha la tira de teclas del módulo: en operación los atajos
// son parte de la cabecera, no un extra escondido en F1.
export function OpsHeader({
  titulo,
  subtitulo,
  icono: Icono,
  acciones,
  scopeAtajos,
  className = '',
}) {
  return (
    // `items-stretch` y no `items-start` cuando esto es una columna.
    //
    // Con `items-start`, `align-items: flex-start` hace que cada hijo mida SU
    // CONTENIDO en el eje horizontal, no el contenedor. Y entonces el `truncate`
    // del título de abajo no recorta nada: no hay ancho contra el que recortar,
    // el bloque crece lo que le pide el texto y arrastra la página entera a un
    // desplazamiento horizontal.
    //
    // El síntoma es reconocible y vale la pena saber leerlo: el título salía
    // cortado **sin puntos suspensivos**. Con `truncate` funcionando se ve
    // «Mapa Operat…»; sin ancho que recortar, se ve «Mapa Oper» y ya. Si algún
    // día vuelve a aparecer un corte sin puntos, el sitio donde mirar es éste y
    // no el `truncate`.
    //
    // Esto lo usan todas las pantallas de operación, así que el arreglo va aquí
    // una vez y no pantalla por pantalla.
    <header
      className={unir(
        'flex flex-col lg:flex-row justify-between items-stretch lg:items-center gap-4 mb-3 lg:mb-6 shrink-0',
        className,
      )}
    >
      {/* El bloque de identidad —icono, título, subtítulo— sólo con ancho.
          Mide unos 90 px de alto y dice lo mismo que el Topbar, que ya lleva el
          grupo y el nombre de la ruta. En escritorio la redundancia se paga sin
          notarla; en un teléfono de 844 px, con el chasis llevándose ya la
          mitad del alto, 90 px son media fila de mesas.

          Se calla la PANTALLA y no el chasis a propósito: el Topbar sale de
          `tituloDeRuta`, o sea que existe para las 24 rutas por igual. Callar el
          chasis obligaría a que las otras 23 pantallas se acordaran de decir
          quiénes son, y alguna no se acordaría. */}
      <div className="hidden lg:flex items-center gap-4 min-w-0">
        {Icono && (
          <div className="bg-ops-accent/10 p-2.5 rounded-ui shrink-0">
            <Icono className="w-7 h-7 text-ops-accent" />
          </div>
        )}
        <div className="min-w-0">
          <h1 className="text-3xl font-black font-syne text-ops-ink tracking-tight leading-none truncate">
            {titulo}
          </h1>
          {subtitulo && (
            <p className="text-xs font-bold text-ops-muted uppercase tracking-widest mt-2">
              {subtitulo}
            </p>
          )}
          {scopeAtajos && (
            <HintsAtajos
              scope={scopeAtajos}
              className="hidden lg:flex mt-3 text-ops-muted"
            />
          )}
        </div>
      </div>
      {/* Las acciones se quedan: son lo único de esta cabecera que se USA. Con
          el bloque de identidad oculto, en teléfono `OpsHeader` es exactamente
          eso — la fila de acciones de la pantalla — y ni siquiera gasta el
          `mb-6` en separarse de un título que ya no está. */}
      {acciones && (
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {acciones}
        </div>
      )}
    </header>
  );
}

// ── Pestañas de sección ──────────────────────────────────────────────────────
// Zonas en Mesas, estaciones en KDS, periodos en Propinero: el mismo patrón
// repetido con tres estilos distintos hasta ahora.
export function OpsTabs({ opciones, valor, onChange, className = '' }) {
  return (
    <div
      className={unir(
        'flex gap-3 overflow-x-auto custom-scrollbar pb-2 shrink-0',
        className,
      )}
      role="tablist"
    >
      {opciones.map((op) => {
        const id = op.id ?? op;
        const label = op.label ?? op;
        const Icono = op.icono;
        const activa = valor === id;
        return (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={activa}
            onClick={() => onChange(id)}
            className={unir(
              // min-h-[44px]: el mínimo táctil. En admin 32px está bien; aquí
              // lo pulsa un mesero de pie con el teléfono en la otra mano.
              'px-5 min-h-[44px] rounded-ui font-black text-sm whitespace-nowrap transition-all border-2 flex items-center gap-2.5',
              activa
                ? 'bg-ops-accent text-ops-accent-fg border-ops-accent shadow-lg'
                : 'bg-ops-panel text-ops-muted border-ops-border hover:border-ops-accent/50',
            )}
          >
            {Icono && <Icono className="w-5 h-5 shrink-0" />}
            {label}
            {op.badge > 0 && (
              <span
                className={unir(
                  'text-[10px] font-black px-2 py-0.5 rounded-full',
                  activa
                    ? 'bg-ops-accent-fg/25 text-ops-accent-fg'
                    : 'bg-ops-danger text-ops-panel',
                )}
              >
                {op.badge}
              </span>
            )}
            {op.nota && (
              <span className="text-[9px] opacity-80 font-bold normal-case">
                · {op.nota}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ── Tarjeta ──────────────────────────────────────────────────────────────────
export function OpsCard({ children, className = '', ...props }) {
  return (
    <div
      className={unir(
        'bg-ops-panel border-2 border-ops-border rounded-ui-lg transition-colors',
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

// ── Botón ────────────────────────────────────────────────────────────────────
const VARIANTES = {
  primario:
    'bg-ops-accent text-ops-accent-fg border-ops-accent hover:opacity-90 shadow-lg',
  cobro:
    'bg-ops-cobro text-ops-cobro-fg border-ops-cobro hover:opacity-90 shadow-lg',
  exito: 'bg-ops-ok text-ops-ok-fg border-ops-ok hover:opacity-90',
  neutro:
    'bg-ops-panel-2 text-ops-ink border-ops-border hover:border-ops-accent',
  peligro:
    'bg-ops-danger/10 text-ops-danger border-ops-danger/30 hover:bg-ops-danger/20',
};

// Todos los tamaños respetan el mínimo táctil de 44px: en operación no hay
// ratón, y un botón de 32px con las manos ocupadas es un error de cobro.
const TAMANOS = {
  sm: 'min-h-[44px] px-4 text-sm gap-2',
  md: 'min-h-[48px] px-5 text-sm gap-2',
  lg: 'min-h-[56px] px-6 text-base gap-2.5',
};

export function OpsButton({
  children,
  variante = 'neutro',
  tamano = 'md',
  icono: Icono,
  tecla,
  className = '',
  type = 'button',
  ...props
}) {
  return (
    <button
      type={type}
      className={unir(
        'inline-flex items-center justify-center font-black rounded-ui border-2 transition-all active:scale-95 disabled:opacity-40 disabled:pointer-events-none',
        'outline-none focus-visible:ring-2 focus-visible:ring-ops-accent focus-visible:ring-offset-2 focus-visible:ring-offset-transparent',
        VARIANTES[variante] ?? VARIANTES.neutro,
        TAMANOS[tamano] ?? TAMANOS.md,
        className,
      )}
      {...props}
    >
      {Icono && <Icono className="w-5 h-5 shrink-0" />}
      {children}
      {/* La tecla viaja con el botón: así el atajo se aprende usando el ratón. */}
      {tecla && (
        <kbd className="text-[10px] font-black px-1.5 py-0.5 rounded-ui border border-current/40 opacity-70">
          {tecla}
        </kbd>
      )}
    </button>
  );
}

// ── Chip de estado ───────────────────────────────────────────────────────────
// Los estados de mesa mapean a ROLES, no a colores: por eso el mapa se lee
// igual en los tres temas.
const TONOS = {
  libre: 'bg-ops-ok/10 text-ops-ok border-ops-ok/30',
  ocupada: 'bg-ops-danger/10 text-ops-danger border-ops-danger/30',
  espera: 'bg-ops-warn/10 text-ops-warn border-ops-warn/30',
  info: 'bg-ops-info/10 text-ops-info border-ops-info/30',
  neutro: 'bg-ops-panel-2 text-ops-muted border-ops-border',
};

export function EstadoChip({ children, tono = 'neutro', className = '' }) {
  return (
    <span
      className={unir(
        'inline-flex items-center gap-1 px-2.5 py-1 rounded-ui text-[10px] font-black uppercase tracking-widest border whitespace-nowrap',
        TONOS[tono] ?? TONOS.neutro,
        className,
      )}
    >
      {children}
    </span>
  );
}

// ── Estado vacío ─────────────────────────────────────────────────────────────
export function OpsEmpty({
  icono: Icono,
  titulo,
  descripcion,
  accion,
  alto = 'h-[55vh]',
}) {
  return (
    <div
      className={unir(
        'flex flex-col items-center justify-center text-center text-ops-muted',
        alto,
      )}
    >
      {Icono && <Icono className="w-20 h-20 mb-5 opacity-20" />}
      <h3 className="text-2xl font-black font-syne opacity-70">{titulo}</h3>
      {descripcion && (
        <p className="text-sm font-bold mt-2 max-w-sm opacity-80">
          {descripcion}
        </p>
      )}
      {accion && <div className="mt-6">{accion}</div>}
    </div>
  );
}

// ── Aviso de trabajo sin conexión ────────────────────────────────────────────
// Se repetía a mano en Propinero y Espera con textos distintos.
export function AvisoOffline({ children, className = '' }) {
  return (
    <div
      className={unir(
        'flex items-center gap-3 px-4 py-3 bg-ops-warn/10 border-2 border-ops-warn/30 rounded-ui shrink-0',
        className,
      )}
    >
      <WifiOff className="w-4 h-4 text-ops-warn shrink-0" />
      <p className="text-sm font-bold text-ops-warn leading-snug">{children}</p>
    </div>
  );
}

// ── Modal ────────────────────────────────────────────────────────────────────
// OJO: el proyecto tiene vetado window.confirm (rompe la experiencia y en Tauri
// se ve como un cuadro del sistema). Todo lo que pregunte usa esto.
export function OpsModal({
  titulo,
  icono: Icono,
  onClose,
  children,
  pie,
  ancho = 'max-w-lg',
  as: Elemento = 'div',
  ...props
}) {
  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-ops-ink/50 backdrop-blur-md animate-in fade-in">
      <Elemento
        className={unir(
          'bg-ops-panel rounded-ui-lg border-2 border-ops-border shadow-2xl w-full flex flex-col max-h-[90vh] overflow-hidden animate-in zoom-in-95 text-ops-ink',
          ancho,
        )}
        {...props}
      >
        <div className="p-6 border-b-2 border-ops-border flex justify-between items-center shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            {Icono && (
              <div className="bg-ops-accent/10 p-2 rounded-ui shrink-0">
                <Icono className="w-5 h-5 text-ops-accent" />
              </div>
            )}
            <h3 className="text-xl font-black font-syne truncate">{titulo}</h3>
          </div>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar"
              className="p-2 hover:bg-ops-panel-2 rounded-full transition-colors shrink-0"
            >
              <X className="w-5 h-5 text-ops-muted" />
            </button>
          )}
        </div>
        <div className="p-6 overflow-y-auto custom-scrollbar flex-1">
          {children}
        </div>
        {pie && (
          <div className="p-4 border-t-2 border-ops-border shrink-0 flex gap-3">
            {pie}
          </div>
        )}
      </Elemento>
    </div>
  );
}
