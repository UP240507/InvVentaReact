import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '../../store/useAppStore';
import { useSyncStore } from '../../store/useSyncStore';
import { useSessionStore } from '../../store/useSessionStore';
import { useAuthStore } from '../auth/useAuthStore';
import {
  ChefHat,
  CheckCircle2,
  Clock,
  Trash2,
  CheckSquare,
  Square,
  AlertTriangle,
  Moon,
  Sun,
  Coffee,
  UtensilsCrossed,
  CheckCheck,
} from 'lucide-react';

// ── Helpers de modelo de item (compat hacia atrás) ──────────────────────────
const itemEstaListo = (item) =>
  item?.estado === 'listo' || item?.completado === true;
const itemDestino = (item) => item?.destino || 'Cocina';
const itemNota = (item) => item?.nota || item?.notas || '';

// Una comanda está totalmente lista cuando TODOS sus items están listos
// (cocina + barra). Ese es el momento de avisar al mesero.
const comandaTotalmenteLista = (c) =>
  (c.items || []).length > 0 && (c.items || []).every(itemEstaListo);

const TicketTimer = ({ horaEntrada }) => {
  const [minutos, setMinutos] = useState(0);
  useEffect(() => {
    const calcular = () => {
      const diffMs = Date.now() - new Date(horaEntrada || Date.now()).getTime();
      setMinutos(Math.floor(diffMs / 60000));
    };
    calcular();
    const interval = setInterval(calcular, 10000);
    return () => clearInterval(interval);
  }, [horaEntrada]);

  let colorClass =
    'bg-emerald-50 text-emerald-600 border border-emerald-200 dark:bg-brand-cesped/10 dark:text-brand-cesped dark:border-brand-cesped/20';
  if (minutos >= 15)
    colorClass =
      'bg-rose-50 text-rose-600 border border-rose-200 dark:bg-brand-arrecife/10 dark:text-brand-arrecife dark:border-brand-arrecife/20 animate-pulse';
  else if (minutos >= 10)
    colorClass =
      'bg-amber-50 text-amber-600 border border-amber-200 dark:bg-brand-ambar/10 dark:text-brand-ambar dark:border-brand-ambar/20';

  return (
    <div
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-black uppercase tracking-widest ${colorClass} shadow-sm`}
    >
      <Clock className="w-3.5 h-3.5" />
      {minutos} min
    </div>
  );
};

const iconoEstacion = (nombre) => {
  const n = (nombre || '').toLowerCase();
  if (n.includes('barra') || n.includes('bar')) return Coffee;
  return UtensilsCrossed;
};

export default function KdsScreen() {
  const { comandas_activas, configuracion, showToast } = useAppStore();
  const { enqueueAction } = useSyncStore();
  const { user } = useAuthStore();
  const navigate = useNavigate();

  // Salida por rol (deuda del roadmap: /dashboard hardcodeado expulsaba a
  // Chef/Barista/Mesero a una ruta que su guard rechaza → rebote al login).
  // Admin (sin empleadoActivo) → /dashboard. Empleado → su ruta inicial.
  // Nota: para Chef/Barista getRutaInicial() ES /kds → el botón es no-op
  // consciente (deuda #2: decidir su navegación fuera del KDS).
  const salirDelKds = () => {
    let destino = '/dashboard';
    try {
      const { empleadoActivo, getRutaInicial } = useSessionStore.getState();
      if (empleadoActivo) destino = getRutaInicial?.() || '/mesas';
    } catch {
      /* sesión admin o store no hidratado: /dashboard */
    }
    navigate(destino);
  };

  // Gancho de rol (preparado, inactivo hoy): cuando exista el sistema de PIN,
  // user.estacion restringirá a una sola estación. Hoy (admin) es null → ve todo.
  const estacionPermitida = user?.estacion || null;

  const estaciones = useMemo(() => {
    const todas = configuracion?.zonas_produccion?.length
      ? configuracion.zonas_produccion
      : ['Cocina', 'Barra'];
    return estacionPermitida
      ? todas.filter((e) => e === estacionPermitida)
      : todas;
  }, [configuracion, estacionPermitida]);

  const [estacionActiva, setEstacionActiva] = useState(
    estaciones[0] || 'Cocina',
  );
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(
    document.documentElement.classList.contains('dark'),
  );

  useEffect(() => {
    if (!estaciones.includes(estacionActiva))
      setEstacionActiva(estaciones[0] || 'Cocina');
  }, [estaciones, estacionActiva]);

  const toggleTheme = () => {
    const nuevo = !isDarkMode;
    document.documentElement.classList.toggle('dark', nuevo);
    localStorage.setItem('theme', nuevo ? 'dark' : 'light');
    setIsDarkMode(nuevo);
  };

  // ── Comandas visibles en esta estación ───────────────────────────────────
  // Reglas:
  //  - La comanda NO debe estar entregada/completada/cancelada (el mesero o el
  //    cobro la sacan; el KDS no la finaliza).
  //  - La estación solo ve comandas que aún tienen TRABAJO PENDIENTE para ella
  //    (al menos un item de su destino sin marcar listo). Cuando la estación
  //    termina sus items, la comanda se limpia de SU pestaña (pero sigue viva
  //    para el mesero hasta que la entregue).
  const comandasDeEstacion = useMemo(() => {
    return (comandas_activas || [])
      .filter(
        (c) => !['entregada', 'completada', 'cancelada'].includes(c.estado),
      )
      .map((c) => {
        const itemsEstacion = (c.items || []).filter(
          (it) => itemDestino(it) === estacionActiva,
        );
        const pendientes = itemsEstacion.filter((it) => !itemEstaListo(it));
        return pendientes.length > 0
          ? { ...c, _itemsEstacion: itemsEstacion }
          : null;
      })
      .filter(Boolean)
      .sort(
        (a, b) => new Date(a.fecha_hora || 0) - new Date(b.fecha_hora || 0),
      );
  }, [comandas_activas, estacionActiva]);

  // Conteo de items pendientes por estación (badges de las pestañas).
  const conteoPorEstacion = useMemo(() => {
    const m = {};
    estaciones.forEach((e) => (m[e] = 0));
    (comandas_activas || [])
      .filter(
        (c) => !['entregada', 'completada', 'cancelada'].includes(c.estado),
      )
      .forEach((c) => {
        (c.items || []).forEach((it) => {
          const d = itemDestino(it);
          if (m[d] != null && !itemEstaListo(it)) m[d] += 1;
        });
      });
    return m;
  }, [comandas_activas, estaciones]);

  // ── Persistir cambios de items en la comanda (offline-first) ─────────────
  // Detecta la transición a "totalmente lista" para avisar (toast local en KDS;
  // el aviso durable al mesero es el badge en el mapa de Mesas).
  const persistirComanda = (comandaActualizada, eraTotalmenteLista) => {
    enqueueAction('comandas', 'upsert', comandaActualizada);
    useAppStore.setState((prev) => ({
      comandas_activas: prev.comandas_activas.map((c) =>
        String(c.id) === String(comandaActualizada.id) ? comandaActualizada : c,
      ),
    }));
    if (!eraTotalmenteLista && comandaTotalmenteLista(comandaActualizada)) {
      showToast(
        `${comandaActualizada.mesa || 'Mostrador'}: lista para entregar`,
        'success',
      );
    }
  };

  // Marcar un item listo / pendiente. NO finaliza la comanda.
  const toggleItem = (comandaId, itemId) => {
    const comanda = (comandas_activas || []).find(
      (c) => String(c.id) === String(comandaId),
    );
    if (!comanda) return;
    const eraLista = comandaTotalmenteLista(comanda);

    const nuevosItems = comanda.items.map((item) => {
      const id = item.id ?? item.nombre;
      if (String(id) === String(itemId)) {
        const listo = itemEstaListo(item);
        const { completado, ...resto } = item;
        return { ...resto, estado: listo ? 'pendiente' : 'listo' };
      }
      return item;
    });
    persistirComanda({ ...comanda, items: nuevosItems }, eraLista);
  };

  // Marcar TODOS los items de esta estación como listos (conveniencia).
  // NO finaliza la comanda: el mesero es quien la entrega.
  const marcarEstacionLista = (comandaId) => {
    const comanda = (comandas_activas || []).find(
      (c) => String(c.id) === String(comandaId),
    );
    if (!comanda) return;
    const eraLista = comandaTotalmenteLista(comanda);

    const nuevosItems = comanda.items.map((item) => {
      const { completado, ...resto } = item;
      return itemDestino(item) === estacionActiva
        ? { ...resto, estado: 'listo' }
        : resto;
    });
    persistirComanda({ ...comanda, items: nuevosItems }, eraLista);
    showToast(`${estacionActiva}: items marcados listos`, 'info');
  };

  const ejecutarLimpiezaTotal = () => {
    const activas = (comandas_activas || []).filter(
      (c) => !['entregada', 'completada', 'cancelada'].includes(c.estado),
    );
    if (activas.length === 0) {
      setShowConfirmModal(false);
      return;
    }
    activas.forEach((c) => {
      enqueueAction('comandas', 'upsert', { ...c, estado: 'cancelada' });
    });
    useAppStore.setState((prev) => ({
      comandas_activas: prev.comandas_activas.filter(
        (c) => !activas.find((a) => String(a.id) === String(c.id)),
      ),
    }));
    showToast('Producción purgada', 'success');
    setShowConfirmModal(false);
  };

  const EstacionIcon = iconoEstacion(estacionActiva);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-ui-obsidiana p-6 md:p-8 text-slate-800 dark:text-ui-text font-sans overflow-y-auto custom-scrollbar transition-colors duration-500 relative z-0">
      <div
        className="fixed inset-0 opacity-[0.03] dark:opacity-[0.05] pointer-events-none -z-10"
        style={{
          backgroundImage:
            'radial-gradient(circle at 2px 2px, currentColor 1px, transparent 0)',
          backgroundSize: '24px 24px',
        }}
      ></div>

      {/* HEADER */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 border-b-2 border-slate-200 dark:border-ui-border pb-6 relative z-10 gap-4">
        <div className="flex items-center gap-5">
          <button
            onClick={salirDelKds}
            className="p-3 bg-white dark:bg-ui-humo hover:bg-slate-100 dark:hover:bg-ui-border border-2 border-slate-200 dark:border-ui-border rounded-2xl transition-all active:scale-95 shadow-sm group"
            title="Salir del monitor"
          >
            <ChefHat className="w-8 h-8 text-indigo-500 dark:text-brand-amatista group-hover:scale-110 transition-transform" />
          </button>
          <div>
            <h1 className="text-3xl font-black font-syne text-slate-900 dark:text-brand-nacar tracking-tight">
              Monitor de Producción
            </h1>
            <p className="text-slate-500 dark:text-ui-muted font-bold tracking-widest uppercase text-xs mt-1">
              {comandasDeEstacion.length} pendiente
              {comandasDeEstacion.length !== 1 ? 's' : ''} en {estacionActiva}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 w-full md:w-auto justify-end">
          <button
            onClick={toggleTheme}
            className="p-3 bg-white dark:bg-ui-humo border-2 border-slate-200 dark:border-ui-border rounded-xl text-slate-500 dark:text-brand-ambar hover:bg-slate-100 dark:hover:bg-ui-border transition-all active:scale-95 shadow-sm"
          >
            {isDarkMode ? (
              <Sun className="w-5 h-5" />
            ) : (
              <Moon className="w-5 h-5" />
            )}
          </button>
          {(comandas_activas?.length || 0) > 0 && (
            <button
              onClick={() => setShowConfirmModal(true)}
              className="flex items-center gap-2 px-5 py-3 bg-rose-50 dark:bg-brand-arrecife/10 hover:bg-rose-100 dark:hover:bg-brand-arrecife border-2 border-rose-200 dark:border-brand-arrecife/20 text-rose-600 dark:text-brand-arrecife dark:hover:text-ui-obsidiana rounded-xl font-black text-sm uppercase tracking-widest transition-all shadow-sm"
            >
              <Trash2 className="w-4 h-4" /> Purgar Todo
            </button>
          )}
        </div>
      </div>

      {/* PESTAÑAS POR ESTACIÓN */}
      <div className="flex gap-3 mb-8 relative z-10 overflow-x-auto custom-scrollbar pb-2">
        {estaciones.map((est) => {
          const Icon = iconoEstacion(est);
          const activa = est === estacionActiva;
          const pend = conteoPorEstacion[est] || 0;
          return (
            <button
              key={est}
              onClick={() => setEstacionActiva(est)}
              className={`px-6 py-3 rounded-2xl font-black text-sm whitespace-nowrap transition-all border-2 flex items-center gap-2.5 ${
                activa
                  ? 'bg-indigo-500 dark:bg-brand-amatista text-white dark:text-ui-obsidiana border-indigo-500 dark:border-brand-amatista shadow-lg shadow-indigo-500/30 dark:shadow-brand-amatista/30'
                  : 'bg-white dark:bg-ui-humo text-slate-500 dark:text-ui-muted border-slate-200 dark:border-ui-border hover:border-slate-300 dark:hover:border-ui-muted'
              }`}
            >
              <Icon className="w-5 h-5" />
              {est}
              {pend > 0 && (
                <span
                  className={`text-[10px] font-black px-2 py-0.5 rounded-full ${activa ? 'bg-white/25 text-white dark:bg-ui-obsidiana/30 dark:text-ui-obsidiana' : 'bg-brand-arrecife text-white'}`}
                >
                  {pend}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* GRID DE TICKETS DE LA ESTACIÓN ACTIVA */}
      <div className="relative z-10">
        {comandasDeEstacion.length === 0 ? (
          <div className="h-[55vh] flex flex-col items-center justify-center text-slate-400 dark:text-ui-muted">
            <EstacionIcon className="w-24 h-24 mb-6 opacity-20" />
            <h2 className="text-3xl font-black font-syne opacity-50">
              {estacionActiva} al día
            </h2>
            <p className="font-bold mt-2 uppercase tracking-widest text-xs">
              Sin pendientes en esta estación
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 items-start">
            {comandasDeEstacion.map((orden) => {
              const itemsEstacion = orden._itemsEstacion;
              return (
                <div
                  key={orden.id}
                  className="bg-white/90 dark:bg-ui-humo/90 backdrop-blur-md border-2 border-slate-200 dark:border-ui-border rounded-[2rem] overflow-hidden shadow-xl transition-all duration-300"
                >
                  <div className="p-5 flex justify-between items-start border-b-2 border-slate-100 dark:border-ui-border bg-slate-50/50 dark:bg-ui-obsidiana/30">
                    <div>
                      <h3 className="text-2xl font-black text-slate-900 dark:text-brand-nacar font-syne leading-none">
                        {orden.mesa || 'Mostrador'}
                      </h3>
                      <p className="text-[10px] font-black text-indigo-500 dark:text-brand-amatista mt-2 uppercase tracking-widest">
                        {orden.mesero} •{' '}
                        {orden.folio || String(orden.id).slice(-5)}
                      </p>
                    </div>
                    <TicketTimer horaEntrada={orden.fecha_hora} />
                  </div>

                  <div className="p-3 space-y-2">
                    {itemsEstacion.map((item, idx) => {
                      const listo = itemEstaListo(item);
                      const itemId = item.id ?? item.nombre;
                      const nota = itemNota(item);
                      return (
                        <div
                          key={itemId || idx}
                          onClick={() => toggleItem(orden.id, itemId)}
                          className={`flex gap-3 p-4 rounded-2xl cursor-pointer transition-all border-2 ${
                            listo
                              ? 'bg-slate-50 dark:bg-ui-obsidiana/50 border-slate-100 dark:border-ui-border opacity-50 scale-[0.98]'
                              : 'bg-white dark:bg-ui-obsidiana border-slate-100 dark:border-ui-border hover:border-indigo-300 dark:hover:border-brand-amatista/50 shadow-sm'
                          }`}
                        >
                          <div className="mt-0.5">
                            {listo ? (
                              <CheckSquare className="w-6 h-6 text-emerald-500 dark:text-brand-cesped" />
                            ) : (
                              <Square className="w-6 h-6 text-slate-300 dark:text-ui-muted" />
                            )}
                          </div>
                          <div>
                            <p
                              className={`font-black text-lg leading-tight ${listo ? 'text-emerald-600 dark:text-brand-cesped line-through' : 'text-slate-800 dark:text-brand-nacar'}`}
                            >
                              <span className="text-indigo-500 dark:text-brand-amatista mr-2 text-xl">
                                {item.cantidad}x
                              </span>
                              {item.nombre}
                            </p>
                            {nota && (
                              <p className="text-xs font-black text-amber-700 dark:text-brand-ambar mt-2 bg-amber-100 dark:bg-brand-ambar/10 border border-amber-200 dark:border-brand-ambar/20 px-3 py-1.5 rounded-xl inline-block">
                                📝 {nota}
                              </p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="p-4 bg-slate-50/50 dark:bg-ui-obsidiana/30 border-t-2 border-slate-100 dark:border-ui-border">
                    <button
                      onClick={() => marcarEstacionLista(orden.id)}
                      className="w-full py-4 rounded-2xl font-black text-sm tracking-widest uppercase transition-all active:scale-95 shadow-md bg-emerald-500 hover:bg-emerald-600 dark:bg-brand-cesped dark:hover:bg-[#00c98c] text-white dark:text-ui-obsidiana shadow-emerald-500/30 dark:shadow-[0_0_20px_rgba(0,229,160,0.3)] flex items-center justify-center gap-2"
                    >
                      <CheckCheck className="w-5 h-5" /> Marcar {estacionActiva}{' '}
                      lista
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* MODAL DE PURGA */}
      {showConfirmModal && (
        <div className="fixed inset-0 bg-slate-900/60 dark:bg-ui-obsidiana/80 backdrop-blur-md z-[100] flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white dark:bg-ui-humo rounded-[2.5rem] p-8 max-w-sm w-full shadow-2xl text-center border-2 border-slate-100 dark:border-ui-border animate-in zoom-in-95">
            <div className="w-20 h-20 bg-rose-100 dark:bg-brand-arrecife/20 rounded-full flex items-center justify-center mx-auto mb-6">
              <AlertTriangle className="w-10 h-10 text-rose-500 dark:text-brand-arrecife" />
            </div>
            <h2 className="text-2xl font-black font-syne text-slate-900 dark:text-brand-nacar mb-2">
              ¿Purgar Producción?
            </h2>
            <p className="text-slate-500 dark:text-ui-muted font-bold text-sm mb-8">
              Cancelará <strong>todas</strong> las comandas activas. No se puede
              deshacer.
            </p>
            <div className="flex flex-col gap-3">
              <button
                onClick={ejecutarLimpiezaTotal}
                className="w-full bg-rose-500 hover:bg-rose-600 dark:bg-brand-arrecife dark:hover:bg-orange-600 text-white dark:text-ui-obsidiana py-4 rounded-xl font-black uppercase tracking-widest shadow-lg shadow-rose-500/30 dark:shadow-brand-arrecife/20 transition-transform active:scale-95"
              >
                Sí, Purgar Todo
              </button>
              <button
                onClick={() => setShowConfirmModal(false)}
                className="w-full bg-slate-100 dark:bg-ui-obsidiana hover:bg-slate-200 dark:hover:bg-ui-border text-slate-600 dark:text-brand-nacar py-4 rounded-xl font-bold transition-colors"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}