// ─── COMMAND PALETTE · Ctrl+K (Proyecto D · tanda 3) ─────────────────────────
// Un solo cuadro para TODO lo que se hace con el teclado: navegar a un módulo,
// encontrar una mesa/receta/proveedor y ejecutar acciones rápidas.
//
// No reimplementa la búsqueda: reusa lib/BuscadorGlobal tal cual (el mismo motor
// del topbar de la tanda 2) y le suma el catálogo de lib/Acciones. Por eso el
// motor vive en lib/ y no dentro de un componente.
//
// SEGURIDAD: la palette es una PUERTA DE ENTRADA más, no un atajo visual. Todo
// lo que ofrece pasa por los mismos filtros que el sidebar: capacidades del rol
// (usePermisos) y módulos premium del plan (usePlan). Un mesero no puede llegar
// a Clientes tecleando, ni un tenant sin lealtad ver el CRM.

import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, CornerDownLeft, Command } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { useShellStore } from '../store/useShellStore';
import { usePermisos } from '../hooks/usePermisos';
import { usePlan } from '../hooks/usePlan';
import { itemsVisibles } from '../lib/Navegacion';
import { construirIndice, buscar, normalizar } from '../lib/BuscadorGlobal';
import { accionesDisponibles } from '../lib/Acciones';
import { formatearCombo } from '../lib/Atajos';

// El envoltorio solo decide si hay palette. El contenido va en un componente
// aparte que se MONTA al abrir: así la consulta y el resaltado se reinician
// solos por ciclo de vida, sin un efecto que resetee estado (que sería un
// render en cascada).
export default function CommandPalette(props) {
  const abierta = useShellStore((s) => s.buscadorAbierto);
  if (!abierta) return null;
  return <PaletteAbierta {...props} />;
}

function PaletteAbierta({
  onCerrarTurno,
  onAbrirTurno,
  onCerrarSesion,
  onVerAtajos,
}) {
  const navigate = useNavigate();

  const cerrar = useShellStore((s) => s.cerrarBuscador);
  const sidebarColapsado = useShellStore((s) => s.sidebarColapsado);
  const toggleSidebar = useShellStore((s) => s.toggleSidebar);

  const { cap, puedeVerRuta, flag } = usePermisos();
  const { tieneModulo } = usePlan();

  const temaGlobal = useAppStore((s) => s.temaGlobal);
  const toggleTemaGlobal = useAppStore((s) => s.toggleTemaGlobal);
  const turnos = useAppStore((s) => s.turnos);
  const mesas = useAppStore((s) => s.mesas);
  const productos = useAppStore((s) => s.productos);
  const recetas = useAppStore((s) => s.recetas);
  const modificadores = useAppStore((s) => s.modificadores);
  const proveedores = useAppStore((s) => s.proveedores);
  const clientes = useAppStore((s) => s.clientes);
  const staff = useAppStore((s) => s.staff);
  const ordenesCompra = useAppStore((s) => s.ordenesCompra);

  const [consulta, setConsulta] = useState('');
  const [resaltado, setResaltado] = useState(0);

  const turnoActivo = !!(turnos || []).find((t) => t.estado === 'abierto');

  // ── Acciones rápidas (filtradas por rol y por estado de caja) ─────────────
  const acciones = useMemo(
    () =>
      accionesDisponibles({
        flag,
        puedeVerRuta,
        turnoActivo,
        esOscuro: temaGlobal === 'dark',
        sidebarColapsado,
        on: {
          alternarTema: toggleTemaGlobal,
          alternarSidebar: toggleSidebar,
          verAtajos: onVerAtajos,
          abrirTurno: onAbrirTurno,
          cerrarTurno: onCerrarTurno,
          cerrarSesion: onCerrarSesion,
          irAPerfil: () => navigate('/perfil'),
          irAMiPlan: () => navigate('/mi-plan'),
        },
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      cap,
      turnoActivo,
      temaGlobal,
      sidebarColapsado,
      onVerAtajos,
      onAbrirTurno,
      onCerrarTurno,
      onCerrarSesion,
    ],
  );

  const navItems = useMemo(
    () => itemsVisibles(puedeVerRuta, tieneModulo),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cap, tieneModulo],
  );

  // El índice de datos solo se arma al teclear: abrir la palette no debe
  // recorrer miles de filas para enseñar ocho acciones.
  const hayConsulta = consulta.trim().length >= 2;
  const indice = useMemo(() => {
    if (!hayConsulta) return [];
    return construirIndice(
      {
        mesas,
        productos,
        recetas,
        modificadores,
        proveedores,
        clientes,
        staff,
        ordenesCompra,
      },
      { puedeVerRuta, navItems },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    hayConsulta,
    mesas,
    productos,
    recetas,
    modificadores,
    proveedores,
    clientes,
    staff,
    ordenesCompra,
    navItems,
  ]);

  // ── Lista final: acciones primero, luego navegación y datos ───────────────
  const grupos = useMemo(() => {
    const q = normalizar(consulta);

    const accionesFiltradas = q
      ? acciones.filter((a) =>
          normalizar(`${a.titulo} ${a.subtitulo || ''}`).includes(q),
        )
      : acciones;

    const filas = [];
    if (accionesFiltradas.length) {
      filas.push({
        etiqueta: 'Acciones',
        items: accionesFiltradas.map((a) => ({ ...a, clase: 'accion' })),
      });
    }

    if (!hayConsulta) {
      // Sin consulta mostramos los módulos como destino directo: la palette
      // vacía tiene que ser útil, no un cuadro en blanco.
      if (navItems.length) {
        filas.push({
          etiqueta: 'Ir a',
          items: navItems.map((n) => ({
            id: `nav:${n.path}`,
            titulo: n.label,
            subtitulo: n.grupo,
            icono: n.icon,
            ruta: n.path,
            clase: 'destino',
          })),
        });
      }
      return filas;
    }

    for (const r of buscar(indice, consulta, { limite: 30 })) {
      let g = filas.find((x) => x.etiqueta === r.etiqueta);
      if (!g) {
        g = { etiqueta: r.etiqueta, items: [] };
        filas.push(g);
      }
      g.items.push({ ...r, clase: 'destino' });
    }
    return filas;
  }, [acciones, consulta, hayConsulta, indice, navItems]);

  const planas = useMemo(() => grupos.flatMap((g) => g.items), [grupos]);
  const indiceResaltado = planas.length
    ? Math.min(resaltado, planas.length - 1)
    : 0;

  const ejecutar = (item) => {
    if (!item) return;
    cerrar();
    if (item.clase === 'accion') {
      item.ejecutar?.();
      return;
    }
    // Igual que el topbar: el término viaja para que la pantalla destino
    // precargue su filtro y el usuario no busque dos veces.
    navigate(item.ruta, {
      state: { busquedaGlobal: item.titulo, tipo: item.tipo },
    });
  };

  const alTeclear = (e) => {
    setConsulta(e.target.value);
    setResaltado(0);
  };

  const onKeyDown = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      cerrar();
      return;
    }
    if (!planas.length) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setResaltado((i) => (i + 1) % planas.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setResaltado((i) => (i - 1 + planas.length) % planas.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      ejecutar(planas[indiceResaltado]);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[300] bg-adm-sidebar/70 backdrop-blur-sm flex items-start justify-center p-4 pt-[12vh] animate-in fade-in duration-media"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) cerrar();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Paleta de comandos"
        className="w-full max-w-2xl bg-adm-panel border border-adm-border rounded-ui shadow-2xl overflow-hidden font-figtree text-adm-ink animate-in zoom-in-95 duration-media flex flex-col max-h-[70vh]"
      >
        <div className="flex items-center gap-3 px-4 h-14 border-b border-adm-border shrink-0">
          <Search className="w-5 h-5 text-adm-muted shrink-0" />
          <input
            autoFocus
            value={consulta}
            onChange={alTeclear}
            onKeyDown={onKeyDown}
            placeholder="Buscar o ejecutar una acción…"
            aria-label="Buscar o ejecutar una acción"
            className="flex-1 bg-transparent outline-none text-base text-adm-ink placeholder:text-adm-muted min-w-0"
          />
          <kbd className="text-[10px] font-bold text-adm-muted border border-adm-border rounded-ui px-1.5 py-0.5 shrink-0">
            Esc
          </kbd>
        </div>

        <div className="overflow-y-auto custom-scrollbar flex-1">
          {planas.length === 0 ? (
            <div className="p-10 text-center">
              <Command className="w-10 h-10 mx-auto mb-3 text-adm-muted opacity-30" />
              <p className="text-sm text-adm-muted">
                Sin coincidencias para{' '}
                <strong className="text-adm-ink">"{consulta}"</strong>
              </p>
            </div>
          ) : (
            grupos.map((g) => (
              <div key={g.etiqueta}>
                <p className="px-4 pt-3 pb-1 text-[10px] font-bold uppercase tracking-[0.2em] text-adm-muted">
                  {g.etiqueta}
                </p>
                {g.items.map((item) => {
                  const idx = planas.indexOf(item);
                  const activo = idx === indiceResaltado;
                  const Icono = item.icono;
                  return (
                    <button
                      key={item.id}
                      onMouseEnter={() => setResaltado(idx)}
                      onClick={() => ejecutar(item)}
                      className={`w-full text-left px-4 py-2.5 flex items-center gap-3 transition-colors ${
                        activo ? 'bg-adm-bg' : 'hover:bg-adm-bg'
                      }`}
                    >
                      {Icono && (
                        <Icono className="w-4 h-4 text-adm-muted shrink-0" />
                      )}
                      <span className="flex-1 min-w-0">
                        <span className="block text-sm font-bold text-adm-ink truncate">
                          {item.titulo}
                        </span>
                        {item.subtitulo && (
                          <span className="block text-xs text-adm-muted truncate">
                            {item.subtitulo}
                          </span>
                        )}
                      </span>
                      {item.combo && (
                        <kbd className="text-[10px] font-bold text-adm-muted border border-adm-border rounded-ui px-1.5 py-0.5 shrink-0">
                          {formatearCombo(item.combo)}
                        </kbd>
                      )}
                      {activo && !item.combo && (
                        <CornerDownLeft className="w-3.5 h-3.5 text-adm-muted shrink-0" />
                      )}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>

        <div className="border-t border-adm-border px-4 py-2 flex items-center gap-4 text-[10px] text-adm-muted shrink-0">
          <span>↑↓ navegar</span>
          <span>Enter ejecutar</span>
          <span>Esc cerrar</span>
          <span className="flex-1" />
          <span>F1 ver todos los atajos</span>
        </div>
      </div>
    </div>
  );
}
