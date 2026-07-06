import { useState } from 'react';
import {
  X,
  Square,
  Minus,
  Bell,
  User,
  Search,
  Circle,
  ChevronRight,
  Keyboard,
} from 'lucide-react';

export default function AppLayout({ children }) {
  // Estado para la Zona de Trabajo actual
  const [activeWorkspace, setActiveWorkspace] = useState('PISO');

  // Workspaces disponibles
  const workspaces = ['PISO', 'COCINA', 'ALMACÉN', 'ADMIN'];

  // Simulación de estado
  const isOnline = true;

  return (
    <div className="flex flex-col h-screen w-screen bg-ui-obsidiana text-ui-text font-sans overflow-hidden select-none cursor-default">
      {/* 1. TITLE BAR NATIVA (Tauri Drag Region) - 32px */}
      <header
        data-tauri-drag-region
        className="flex h-8 shrink-0 items-center justify-between bg-ui-humo px-2 border-b border-ui-border"
      >
        {/* Controles de Ventana (Estilo Windows/Linux a la izquierda según tu mockup, ajustable) */}
        <div className="flex items-center gap-1 window-controls pointer-events-auto">
          <button className="flex h-6 w-8 items-center justify-center rounded text-ui-muted hover:bg-ui-border hover:text-ui-text transition-colors">
            <Minus className="h-3.5 w-3.5" />
          </button>
          <button className="flex h-6 w-8 items-center justify-center rounded text-ui-muted hover:bg-ui-border hover:text-ui-text transition-colors">
            <Square className="h-3 w-3" />
          </button>
          <button className="flex h-6 w-8 items-center justify-center rounded text-ui-muted hover:bg-brand-arrecife hover:text-ui-text transition-colors">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Título y Contexto */}
        <div className="flex items-center gap-4 text-xs font-bold font-syne pointer-events-none">
          <span className="text-ui-muted uppercase">AZUL Restaurante</span>
          <span className="text-ui-border">|</span>
          <span className="text-ui-text tracking-wider uppercase">
            Inv<span className="text-brand-cesped">Venta</span>
          </span>
        </div>

        {/* Notificaciones y Usuario */}
        <div className="flex items-center gap-3 pr-2 pointer-events-auto">
          <button className="text-brand-ambar hover:text-amber-300 transition-colors relative">
            <Bell className="h-4 w-4" />
            <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-brand-arrecife"></span>
          </button>
          <button className="text-brand-amatista hover:text-purple-400 transition-colors">
            <User className="h-4 w-4" />
          </button>
        </div>
      </header>

      {/* 2. SELECTOR DE WORKSPACE & BÚSQUEDA - 48px */}
      <nav className="flex h-12 shrink-0 items-center justify-between bg-ui-humo px-4 border-b border-ui-border">
        <div className="flex h-full items-center gap-1">
          {workspaces.map((ws) => (
            <button
              key={ws}
              onClick={() => setActiveWorkspace(ws)}
              className={`h-full px-5 text-xs font-bold tracking-widest font-syne uppercase transition-all border-b-2 ${
                activeWorkspace === ws
                  ? 'border-brand-cesped text-brand-cesped bg-ui-border/30'
                  : 'border-transparent text-ui-muted hover:text-ui-text hover:bg-ui-border/20'
              }`}
            >
              [{ws}]
            </button>
          ))}
        </div>

        {/* Buscador Global Rápido */}
        <div className="flex items-center bg-ui-obsidiana border border-ui-border rounded-full px-3 py-1.5 w-64 focus-within:border-brand-cesped transition-colors">
          <Search className="h-3.5 w-3.5 text-brand-amatista mr-2" />
          <input
            type="text"
            placeholder="Buscar mesa, folio, item..."
            className="bg-transparent border-none outline-none text-xs text-ui-text w-full placeholder:text-ui-muted select-text cursor-text"
          />
        </div>
      </nav>

      {/* 3. ACTION RIBBON (Contextual al Workspace) - 48px */}
      <div className="flex h-12 shrink-0 items-center gap-2 bg-ui-obsidiana px-4 border-b border-ui-border overflow-x-auto">
        {/* Estos botones cambian dependiendo si estás en PISO o COCINA. Hardcodeados para PISO en el mockup */}
        {[
          'Nueva Orden',
          'Dividir Cuenta',
          'Transferir',
          'Cobrar',
          'Imprimir',
        ].map((action) => (
          <button
            key={action}
            className="px-4 py-1.5 text-xs font-medium bg-ui-humo border border-ui-border rounded-[var(--radius-brand)] text-ui-text hover:bg-ui-border hover:text-brand-cesped transition-colors whitespace-nowrap"
          >
            {action}
          </button>
        ))}
      </div>

      {/* 4. ÁREA PRINCIPAL (Canvas + Panel Derecho) */}
      <div className="flex flex-1 overflow-hidden">
        {/* CANVAS IZQUIERDO (Mapa Operativo / Grilla) */}
        <main className="flex-1 overflow-y-auto p-6 bg-ui-obsidiana relative">
          {children ? (
            children
          ) : (
            // Contenido simulado del wireframe si no hay children
            <div className="w-full h-full border-2 border-dashed border-ui-border rounded-[var(--radius-brand)] flex flex-col items-center justify-center">
              <h2 className="text-xl font-bold font-syne text-ui-muted mb-8 tracking-widest">
                MAPA OPERATIVO
              </h2>
              <div className="flex gap-6">
                {/* Mesas Dummy */}
                {[
                  { id: '11', total: '$676' },
                  { id: 'A', total: '$238' },
                  { id: '5', total: '$89' },
                ].map((mesa) => (
                  <button
                    key={mesa.id}
                    className="w-24 h-24 border border-ui-border bg-ui-humo rounded-[var(--radius-brand)] flex flex-col items-center justify-center hover:border-brand-cesped transition-colors group"
                  >
                    <span className="text-xl font-bold font-syne text-ui-text group-hover:text-brand-cesped">
                      {mesa.id}
                    </span>
                    <span className="text-xs text-ui-muted mt-2">
                      {mesa.total}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </main>

        {/* PANEL DERECHO (Detalle de Mesa / Selección) - Ancho Fijo 320px */}
        <aside className="w-80 shrink-0 bg-ui-humo border-l border-ui-border flex flex-col">
          {/* Header del Panel */}
          <div className="p-5 border-b border-ui-border">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold font-syne text-ui-text">
                MESA 11
              </h3>
              <div className="flex gap-1">
                <Circle className="h-2.5 w-2.5 fill-ui-muted text-ui-muted" />
                <Circle className="h-2.5 w-2.5 fill-ui-muted text-ui-muted" />
                <Circle className="h-2.5 w-2.5 fill-ui-muted text-ui-muted" />
                <Circle className="h-2.5 w-2.5 fill-ui-muted text-ui-muted" />
              </div>
            </div>

            <div className="space-y-1">
              <p className="text-3xl font-bold text-brand-cesped tracking-tight">
                $676<span className="text-sm text-ui-muted ml-1">MXN</span>
              </p>
              <div className="flex justify-between text-xs text-ui-muted pt-2">
                <span>45 min activa</span>
                <span>2 personas</span>
              </div>
            </div>
          </div>

          {/* Acciones Rápidas del Panel */}
          <div className="p-4 space-y-2 border-b border-ui-border">
            <button className="w-full py-2.5 text-sm font-medium bg-ui-obsidiana border border-ui-border rounded-[var(--radius-brand)] hover:bg-ui-border transition-colors">
              [Ver orden]
            </button>
            <button className="w-full py-2.5 text-sm font-medium bg-ui-obsidiana border border-ui-border rounded-[var(--radius-brand)] hover:bg-ui-border transition-colors">
              [Agregar item]
            </button>
            <button className="w-full py-2.5 text-sm font-bold bg-brand-arrecife text-ui-obsidiana rounded-[var(--radius-brand)] hover:opacity-90 transition-opacity flex items-center justify-center gap-2">
              [Cobrar <ChevronRight className="h-4 w-4" />]
            </button>
          </div>

          {/* Hotkeys (Shortcuts) */}
          <div className="mt-auto p-5 bg-ui-obsidiana/50">
            <div className="flex items-center gap-2 mb-3 text-xs font-bold text-ui-muted uppercase tracking-wider">
              <Keyboard className="h-4 w-4" /> Atajos
            </div>
            <ul className="space-y-2 text-xs font-mono text-ui-muted">
              <li className="flex items-center gap-3">
                <kbd className="bg-ui-border px-2 py-0.5 rounded text-ui-text">
                  F2
                </kbd>{' '}
                Nueva orden
              </li>
              <li className="flex items-center gap-3">
                <kbd className="bg-ui-border px-2 py-0.5 rounded text-ui-text">
                  F4
                </kbd>{' '}
                Cobrar mesa
              </li>
              <li className="flex items-center gap-3">
                <kbd className="bg-ui-border px-2 py-0.5 rounded text-ui-text">
                  Esc
                </kbd>{' '}
                Cancelar / Cerrar
              </li>
            </ul>
          </div>
        </aside>
      </div>

      {/* 5. STATUS BAR - 32px */}
      <footer className="flex h-8 shrink-0 items-center px-4 bg-ui-obsidiana border-t border-ui-border text-[11px] font-mono text-ui-muted tracking-wide">
        <div className="flex items-center gap-2 min-w-[120px]">
          <span
            className={`h-2 w-2 rounded-full ${isOnline ? 'bg-brand-cesped shadow-[0_0_8px_var(--color-brand-cesped)]' : 'bg-brand-arrecife'}`}
          />
          {isOnline ? 'Online' : 'Offline'}
        </div>

        <div className="h-4 w-px bg-ui-border mx-4" />

        <div className="flex-1">
          Turno: <span className="text-ui-text">Chris</span>
        </div>

        <div className="h-4 w-px bg-ui-border mx-4" />

        <div className="text-brand-cesped font-bold">$4,230</div>

        <div className="h-4 w-px bg-ui-border mx-4" />

        <div>23 órdenes</div>
      </footer>
    </div>
  );
}
