import { useState } from 'react';
import AppLayout from '../components/AppLayout';
import {
  ChevronRight,
  Keyboard,
  Utensils,
  Users,
  Layers,
  Clock,
  AlertTriangle,
} from 'lucide-react';

export default function EscritorioTest() {
  // Orquestador de la Zona de Trabajo activa
  const [workspace, setWorkspace] = useState('PISO');
  const [mesaSeleccionada, setMesaSeleccionada] = useState(null);

  // Mock de datos alineado al esquema de tu base de datos y lógica del Sprint 5
  const mesas = [
    {
      id: '15e2e574-1111-445c-afcd-c04925001aae',
      numero: '11',
      zona: 'Terraza',
      estado: 'ocupada',
      total: 676,
      tiempo: '45 min',
      pax: 2,
      tieneRondasPendientes: true,
    },
    {
      id: '15e2e574-2222-445c-afcd-c04925001aae',
      numero: '12',
      zona: 'Terraza',
      estado: 'agrupada',
      total: 0,
      tiempo: '-',
      pax: 0,
      mesa_principal_id: '15e2e574-1111-445c-afcd-c04925001aae',
    },
    {
      id: '15e2e574-3333-445c-afcd-c04925001aae',
      numero: '5',
      zona: 'Salón',
      estado: 'libre',
      total: 0,
      tiempo: '-',
      pax: 0,
      tieneRondasPendientes: false,
    },
    {
      id: '15e2e574-4444-445c-afcd-c04925001aae',
      numero: 'A',
      zona: 'Barra',
      estado: 'ocupada',
      total: 232,
      tiempo: '18 min',
      pax: 1,
      tieneRondasPendientes: false,
    },
    {
      id: '15e2e574-5555-445c-afcd-c04925001aae',
      numero: 'B',
      zona: 'Barra',
      estado: 'libre',
      total: 0,
      tiempo: '-',
      pax: 0,
      tieneRondasPendientes: false,
    },
  ];

  // Filtrado defensivo: Ocultar satélites de la grilla principal (Regla de diseño Sprint 5)
  const mesasVisibles = mesas.filter((m) => m.estado !== 'agrupada');

  // Contar cuántas mesas están agrupadas con la mesa principal seleccionada
  const getSatellitesCount = (idPrincipal) => {
    return mesas.filter((m) => m.mesa_principal_id === idPrincipal).length;
  };

  return (
    <AppLayout activeWorkspace={workspace} onWorkspaceChange={setWorkspace}>
      {/* ─── WORKSPACE: PISO (MAPA DE MESAS) ────────────────────────────────── */}
      {workspace === 'PISO' && (
        <>
          {/* CANVAS CENTRAL: Grid Operativo Limpio */}
          <main className="flex-1 overflow-y-auto p-6 flex flex-col bg-ui-obsidiana">
            {/* Action Ribbon Contextual de Piso */}
            <div className="flex items-center gap-2 mb-6 shrink-0">
              <button className="px-4 py-2 text-xs font-bold bg-ui-humo border border-ui-border rounded-ui text-ui-text hover:border-brand-cesped hover:text-brand-cesped transition-all">
                [ + Nueva Orden ]
              </button>
              <button className="px-4 py-2 text-xs font-bold bg-ui-humo border border-ui-border rounded-ui text-ui-text hover:border-brand-cesped hover:text-brand-cesped transition-all">
                [ Juntar Mesas ]
              </button>
              <button className="px-4 py-2 text-xs font-bold bg-ui-humo border border-ui-border rounded-ui text-ui-text hover:border-brand-cesped hover:text-brand-cesped transition-all">
                [ Transferir Comanda ]
              </button>
            </div>

            <div className="flex items-center justify-between mb-6 shrink-0 border-b border-ui-border pb-3">
              <h2 className="text-sm font-bold font-syne text-ui-muted tracking-widest uppercase">
                Mapa de Ocupación <span className="text-ui-border">/</span>{' '}
                Terraza & Salón
              </h2>
              <div className="text-xs text-ui-muted font-mono">
                {mesas.filter((m) => m.estado === 'ocupada').length} Activas
              </div>
            </div>

            {/* Grid de Toque Industrial */}
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-4 content-start flex-1 overflow-y-auto pr-1">
              {mesasVisibles.map((m) => {
                const isSelected = mesaSeleccionada?.id === m.id;
                const isOcupada = m.estado === 'ocupada';
                const satelites = getSatellitesCount(m.id);

                return (
                  <button
                    key={m.id}
                    onClick={() => setMesaSeleccionada(isSelected ? null : m)}
                    className={`aspect-square relative p-4 rounded-ui flex flex-col items-center justify-center transition-all duration-150 border-2 text-center
                      ${
                        isSelected
                          ? 'border-brand-cesped bg-ui-border/30 shadow-[0_0_20px_rgba(0,229,160,0.1)] scale-[1.02] z-10'
                          : isOcupada
                            ? 'border-ui-border bg-ui-humo/60 hover:border-ui-muted'
                            : 'border-dashed border-ui-border bg-ui-obsidiana hover:bg-ui-humo/40'
                      }`}
                  >
                    {/* Indicador de Rondas Pendientes de Entrega (Badge pulsante del Sprint 5) */}
                    {m.tieneRondasPendientes && (
                      <span className="absolute top-3 left-3 flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand-arrecife opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-brand-arrecife"></span>
                      </span>
                    )}

                    {/* Badge de Mesas Combinadas (+N) */}
                    {satelites > 0 && (
                      <span className="absolute top-2.5 right-3 px-1.5 py-0.5 rounded-ui bg-brand-ambar/10 border border-brand-ambar/30 text-[9px] font-bold text-brand-ambar font-mono">
                        +{satelites}
                      </span>
                    )}

                    <span
                      className={`text-3xl font-bold font-syne mb-1 tracking-tighter ${isSelected ? 'text-brand-cesped' : isOcupada ? 'text-ui-text' : 'text-ui-muted/60'}`}
                    >
                      {m.numero}
                    </span>

                    {isOcupada ? (
                      <span
                        className={`text-xs font-mono font-bold tracking-tight ${isSelected ? 'text-brand-cesped' : 'text-ui-muted'}`}
                      >
                        ${m.total}
                      </span>
                    ) : (
                      <span className="text-[10px] text-ui-muted/40 font-bold uppercase tracking-widest mt-1">
                        Libre
                      </span>
                    )}

                    <span className="text-[9px] text-ui-muted/30 font-mono mt-1 uppercase tracking-tight block truncate w-full">
                      {m.zona}
                    </span>
                  </button>
                );
              })}
            </div>
          </main>

          {/* INSPECTOR DERECHO: Detalle Contextual de la Selección */}
          <aside className="w-80 shrink-0 bg-ui-humo border-l border-ui-border flex flex-col">
            {mesaSeleccionada ? (
              <>
                {/* Cabecera de Mesa Activa */}
                <div className="p-5 border-b border-ui-border bg-ui-border/20">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-xl font-bold font-syne text-ui-text">
                      Mesa {mesaSeleccionada.numero}
                    </h3>
                    <span className="px-2 py-0.5 bg-brand-cesped/10 text-brand-cesped text-[9px] font-bold tracking-widest uppercase rounded-ui border border-brand-cesped/20">
                      {mesaSeleccionada.estado}
                    </span>
                  </div>

                  <div className="mt-4">
                    <p className="text-[10px] text-ui-muted uppercase tracking-wider font-bold">
                      Consumo Acumulado
                    </p>
                    <p className="text-4xl font-bold text-brand-cesped tracking-tighter font-mono">
                      ${mesaSeleccionada.total}
                      <span className="text-xs text-ui-muted ml-1 font-sans font-normal">
                        MXN
                      </span>
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2 mt-4">
                    <div className="flex items-center gap-1.5 text-[11px] text-ui-text bg-ui-obsidiana px-2.5 py-1 rounded-ui border border-ui-border font-mono">
                      <Clock className="h-3 w-3 text-brand-ambar" />{' '}
                      {mesaSeleccionada.tiempo}
                    </div>
                    <div className="flex items-center gap-1.5 text-[11px] text-ui-text bg-ui-obsidiana px-2.5 py-1 rounded-ui border border-ui-border">
                      <Users className="h-3 w-3 text-brand-amatista" />{' '}
                      {mesaSeleccionada.pax} PAX
                    </div>
                  </div>

                  {/* Warning Crítico de Rondas del Sprint 5 */}
                  {mesaSeleccionada.tieneRondasPendientes && (
                    <div className="mt-4 flex items-center gap-2 p-2.5 bg-brand-arrecife/10 border border-brand-arrecife/20 rounded-ui text-brand-arrecife text-xs">
                      <AlertTriangle className="h-4 w-4 shrink-0" />
                      <span>Hay comandas listas sin entregar en cocina</span>
                    </div>
                  )}
                </div>

                {/* Bloque de Acciones Operativas de Flujo */}
                <div className="p-4 space-y-2 flex-1 overflow-y-auto">
                  <button className="w-full py-2.5 text-xs font-bold bg-ui-obsidiana border border-ui-border rounded-ui hover:border-ui-muted text-ui-text transition-colors font-syne uppercase tracking-wider">
                    [ Abrir Comanda / Carrito ]
                  </button>
                  <button className="w-full py-2.5 text-xs font-bold bg-ui-obsidiana border border-ui-border rounded-ui hover:border-ui-muted text-ui-text transition-colors font-syne uppercase tracking-wider">
                    [ Administrar Rondas ]
                  </button>

                  {mesaSeleccionada.total > 0 && (
                    <button className="w-full py-3 mt-4 text-xs font-bold bg-brand-arrecife text-ui-obsidiana rounded-ui hover:opacity-90 transition-all flex items-center justify-center gap-1 font-syne uppercase tracking-widest shadow-[0_4px_12px_rgba(255,95,40,0.15)]">
                      [ Proceder al Cobro ] <ChevronRight className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </>
            ) : (
              /* Estado Vacío (Zero State) */
              <div className="flex-1 flex flex-col items-center justify-center p-6 text-center opacity-40">
                <Layers className="h-10 w-10 text-ui-border mb-3" />
                <p className="text-xs text-ui-muted font-syne max-w-[200px] leading-relaxed">
                  Selecciona una mesa en el mapa para cargar su panel de control
                  operativo.
                </p>
              </div>
            )}

            {/* Atajos de teclado fijos de la sección */}
            <div className="p-4 bg-ui-obsidiana/40 border-t border-ui-border shrink-0">
              <div className="flex items-center gap-1.5 mb-2.5 text-[10px] font-bold text-ui-muted uppercase tracking-widest">
                <Keyboard className="h-3 w-3" /> Shortcuts Activos
              </div>
              <ul className="space-y-1.5 text-xs font-mono text-ui-muted">
                <li className="flex items-center justify-between">
                  <span>Nueva orden</span>{' '}
                  <kbd className="bg-ui-border px-1.5 py-0.5 rounded-ui text-ui-text text-[10px]">
                    F2
                  </kbd>
                </li>
                <li className="flex items-center justify-between">
                  <span>Cobrar mesa</span>{' '}
                  <kbd className="bg-ui-border px-1.5 py-0.5 rounded-ui text-ui-text text-[10px]">
                    F4
                  </kbd>
                </li>
                <li className="flex items-center justify-between">
                  <span>Cerrar inspector</span>{' '}
                  <kbd className="bg-ui-border px-1.5 py-0.5 rounded-ui text-ui-text text-[10px]">
                    ESC
                  </kbd>
                </li>
              </ul>
            </div>
          </aside>
        </>
      )}

      {/* ─── WORKSPACE: COCINA (MONITOR KDS) ────────────────────────────────── */}
      {workspace === 'COCINA' && (
        <main className="flex-1 p-6 bg-ui-obsidiana flex flex-col items-center justify-center text-center">
          <div className="p-4 rounded-full bg-ui-humo border border-ui-border mb-3">
            <Utensils className="h-6 w-6 text-brand-amatista" />
          </div>
          <h3 className="text-sm font-bold font-syne text-ui-text uppercase tracking-widest">
            Monitor KDS Cocina
          </h3>
          <p className="text-xs text-ui-muted mt-1 max-w-sm">
            Aquí se inyectará tu lógica de KDS Screen dividida por estaciones
            (Cocina/Barra).
          </p>
        </main>
      )}

      {/* ─── WORKSPACE: ALMACÉN Y ADMIN (STUBS DE LOGÍSTICA) ────────────────── */}
      {['ALMACÉN', 'ADMIN'].includes(workspace) && (
        <main className="flex-1 p-6 bg-ui-obsidiana flex flex-col items-center justify-center text-center">
          <h3 className="text-sm font-bold font-syne text-ui-text uppercase tracking-widest">
            Panel de Control {workspace}
          </h3>
          <p className="text-xs text-ui-muted mt-1">
            Sección en desarrollo para la administración global.
          </p>
        </main>
      )}
    </AppLayout>
  );
}
