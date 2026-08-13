import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '../../store/useAppStore';
import { useSyncStore } from '../../store/useSyncStore';
import { useSessionStore } from '../../store/useSessionStore';
import { useAuthStore } from '../auth/useAuthStore';
import { useAtajos } from '../../hooks/useAtajos';
import { useAvisoKds } from '../../hooks/useAvisoKds';
import { puedeRecibirAvisos } from '../../lib/AvisoKds';
import { getRolEfectivo, getCapacidades } from '../../lib/Permisos';
import { rutaDeEscape, escapeEsPerfil } from '../../lib/Escape';
import {
  OpsHeader,
  OpsTabs,
  OpsButton,
  OpsEmpty,
  OpsModal,
} from '../../components/ui';
import {
  ChefHat,
  ArrowLeft,
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
  BellRing,
  X,
  UserCircle,
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

  let colorClass = 'bg-ops-ok/10 text-ops-ok border border-ops-ok/30';
  if (minutos >= 15)
    colorClass =
      'bg-ops-danger/10 text-ops-danger border border-ops-danger/30 animate-pulse';
  else if (minutos >= 10)
    colorClass = 'bg-ops-warn/10 text-ops-warn border border-ops-warn/30';

  return (
    <div
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-ui text-xs font-black uppercase tracking-widest ${colorClass} shadow-sm`}
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

  // ── LA SALIDA ────────────────────────────────────────────────────────────
  // El 12-ago un barista quedó encerrado aquí: `/kds` es pantalla completa —sin
  // riel— y este botón llamaba a `getRutaInicial()`, que para Chef y Barista ES
  // `/kds`. Navegaba a donde ya estaban.
  //
  // El destino ya NO se decide en esta pantalla. Lo calcula `lib/Escape.js`, que
  // se prueba contra todos los roles y contra roles inventados, incluidos los
  // que cada restaurante creará después. Aquí sólo se pregunta.
  const capDeLaSesion = useMemo(() => {
    const empleado = useSessionStore.getState().empleadoActivo;
    return getCapacidades(
      getRolEfectivo(empleado || user),
      useAppStore.getState().roles_permisos,
    );
  }, [user]);

  const destinoSalida = useMemo(
    () => rutaDeEscape({ cap: capDeLaSesion, rutaActual: '/kds' }),
    [capDeLaSesion],
  );
  const salidaEsPerfil = escapeEsPerfil(destinoSalida);

  const salirDelKds = () => navigate(destinoSalida);

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

  // (Proyecto D · tanda 3) El claro/oscuro sale del store, no de una copia
  // local: esta pantalla mantenía su propio useState y alternar aquí dejaba
  // desincronizados el sidebar, PerfilScreen y el nuevo Ctrl+Shift+L.
  const isDarkMode = useAppStore((s) => s.temaGlobal) === 'dark';
  const toggleTheme = useAppStore((s) => s.toggleTemaGlobal);

  useEffect(() => {
    if (!estaciones.includes(estacionActiva))
      setEstacionActiva(estaciones[0] || 'Cocina');
  }, [estaciones, estacionActiva]);

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

  // ── Aviso de comanda nueva (sonido + notificación) ───────────────────────
  // Sólo a quien tiene el KDS de puesto: Chef y Barista. Un Gerente que entra a
  // mirar no debe llevarse un pitido por cada comanda. El detalle del criterio
  // está en lib/AvisoKds.js.
  const empleadoActivo = useSessionStore((s) => s.empleadoActivo);
  const roles_permisos = useAppStore((s) => s.roles_permisos);
  const avisosParaMi = useMemo(() => {
    if (!empleadoActivo) return false; // sesión de dueño por correo
    return puedeRecibirAvisos(
      getCapacidades(getRolEfectivo(empleadoActivo), roles_permisos),
    );
  }, [empleadoActivo, roles_permisos]);

  const {
    pop: popAviso,
    descartarPop,
    activarAvisos,
    faltaActivar,
    permiso: permisoAvisos,
  } = useAvisoKds({
    comandas: comandasDeEstacion,
    estacion: estacionActiva,
    activo: avisosParaMi,
  });

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

  // ─── ATAJOS DEL KDS (Proyecto D · tanda 3) ───────────────────────────────
  // La cocina no usa ratón: hay grasa, prisa y a veces guantes. Los números
  // marcan lista la comanda N de la columna (en el mismo orden en que se ven,
  // que es por antigüedad) y las flechas cambian de estación.
  //
  // Solo 1..9: más allá el operador ya no cuenta de un vistazo y la tecla deja
  // de ser más rápida que el dedo.
  const atajosKds = {
    arrowleft: {
      descripcion: 'Estación anterior',
      accion: () => {
        const i = estaciones.indexOf(estacionActiva);
        setEstacionActiva(
          estaciones[(i - 1 + estaciones.length) % estaciones.length],
        );
      },
    },
    arrowright: {
      descripcion: 'Estación siguiente',
      accion: () => {
        const i = estaciones.indexOf(estacionActiva);
        setEstacionActiva(estaciones[(i + 1) % estaciones.length]);
      },
    },
    escape: { descripcion: 'Salir del monitor', accion: salirDelKds },
  };
  if (comandasDeEstacion.length > 0) {
    atajosKds['1'] = {
      descripcion: 'Marcar lista la comanda 1…9',
      accion: () => marcarEstacionLista(comandasDeEstacion[0]?.id),
    };
    for (let n = 2; n <= Math.min(9, comandasDeEstacion.length); n++) {
      atajosKds[String(n)] = {
        // Sin descripción: se documenta una sola línea (la del '1') en vez de
        // nueve entradas que dicen lo mismo.
        accion: () => marcarEstacionLista(comandasDeEstacion[n - 1]?.id),
      };
    }
  }

  useAtajos('kds', atajosKds, {
    titulo: 'Monitor de cocina',
    activo: !showConfirmModal,
  });

  const EstacionIcon = iconoEstacion(estacionActiva);

  return (
    <div className="min-h-screen bg-ops-panel-2 p-6 md:p-8 text-ops-ink font-sans overflow-y-auto custom-scrollbar transition-colors duration-lenta relative z-0">
      <div
        className="fixed inset-0 opacity-[0.03] dark:opacity-[0.05] pointer-events-none -z-10"
        style={{
          backgroundImage:
            'radial-gradient(circle at 2px 2px, currentColor 1px, transparent 0)',
          backgroundSize: '24px 24px',
        }}
      ></div>

      {/* AVISO DE COMANDA NUEVA (dentro de la página) ─────────────────────
          Abajo y no arriba: en el KDS la parte alta es la que se mira, y un
          cartel encima del header taparía la pestaña de la estación justo
          cuando se necesita. `aria-live` para que un lector de pantalla lo
          anuncie sin robar el foco de las manos que están marcando items. */}
      {popAviso && (
        <div
          key={popAviso.id}
          role="status"
          aria-live="polite"
          className="fixed bottom-6 right-6 z-50 flex items-center gap-3 rounded-lg border-2 border-ops-accent bg-ops-panel px-5 py-4 shadow-2xl"
        >
          <BellRing className="w-6 h-6 text-ops-accent shrink-0" />
          <div>
            <p className="text-xs uppercase tracking-wider text-ops-ink-2">
              Comanda nueva
            </p>
            <p className="text-lg font-bold text-ops-ink">{popAviso.texto}</p>
          </div>
          <button
            type="button"
            onClick={descartarPop}
            aria-label="Cerrar aviso"
            className="ml-2 p-1 text-ops-ink-2 hover:text-ops-ink"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* HEADER */}
      <div className="border-b-2 border-ops-border pb-6 mb-6 relative z-10">
        <OpsHeader
          className="mb-0"
          icono={ChefHat}
          // El gorro lleva a la salida (Chris, 12-ago). Es un extra de
          // escritorio: el bloque del título está oculto en teléfono, así que
          // el botón de abajo sigue siendo la salida de verdad.
          onIcono={salirDelKds}
          iconoTitulo={salidaEsPerfil ? 'Mi perfil' : 'Salir del monitor'}
          titulo="Monitor de Producción"
          subtitulo={`${comandasDeEstacion.length} pendiente${comandasDeEstacion.length !== 1 ? 's' : ''} en ${estacionActiva}`}
          scopeAtajos="kds"
          acciones={
            <>
              {/* El navegador no deja sonar hasta que alguien toca la pantalla.
                  En vez de fallar callado —que es como no tener aviso— se pide
                  el toque a la vista. Desaparece en cuanto queda activado. */}
              {faltaActivar && (
                <OpsButton
                  variante="primario"
                  icono={BellRing}
                  onClick={activarAvisos}
                >
                  Activar avisos
                </OpsButton>
              )}
              {/* Suena, pero el sistema no avisará si salen de la pantalla. Se
                  dice, porque el aviso al que se le confía «voy por un café»
                  es justo el que no está funcionando. */}
              {avisosParaMi &&
                !faltaActivar &&
                ['denied', 'unsupported'].includes(permisoAvisos) && (
                  <span className="self-center text-xs text-ops-ink-2 max-w-[15rem] leading-tight">
                    {permisoAvisos === 'denied'
                      ? 'Suena, pero sin aviso fuera de la pantalla: las notificaciones están bloqueadas en el sistema.'
                      : 'Suena, pero esta versión no puede lanzar avisos del sistema. Hay que actualizar la caja.'}
                  </span>
                )}
              <OpsButton
                icono={isDarkMode ? Sun : Moon}
                onClick={toggleTheme}
                aria-label="Cambiar entre modo claro y oscuro"
                className="px-3"
              />
              {/* El texto sigue al destino. Para quien vive en el KDS —Chef,
                  Barista— este botón NO es «salir del programa»: es la puerta a
                  su perfil, que es de donde se cierra sesión. Llamarlo «Salir»
                  cuando lleva al perfil es mentir en pequeño, y este botón se
                  lee todos los días. */}
              <OpsButton
                icono={salidaEsPerfil ? UserCircle : ArrowLeft}
                onClick={salirDelKds}
                tecla="Esc"
              >
                {salidaEsPerfil ? 'Mi perfil' : 'Salir'}
              </OpsButton>
              {(comandas_activas?.length || 0) > 0 && (
                <OpsButton
                  variante="peligro"
                  icono={Trash2}
                  onClick={() => setShowConfirmModal(true)}
                >
                  Purgar todo
                </OpsButton>
              )}
            </>
          }
        />
      </div>

      {/* PESTAÑAS POR ESTACIÓN */}
      <OpsTabs
        className="mb-8 relative z-10"
        valor={estacionActiva}
        onChange={setEstacionActiva}
        opciones={estaciones.map((est) => ({
          id: est,
          label: est,
          icono: iconoEstacion(est),
          badge: conteoPorEstacion[est] || 0,
        }))}
      />

      {/* GRID DE TICKETS DE LA ESTACIÓN ACTIVA */}
      <div className="relative z-10">
        {comandasDeEstacion.length === 0 ? (
          <OpsEmpty
            icono={EstacionIcon}
            titulo={`${estacionActiva} al día`}
            descripcion="Sin pendientes en esta estación."
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 items-start">
            {comandasDeEstacion.map((orden, idx) => {
              const itemsEstacion = orden._itemsEstacion;
              // Número de tecla: solo hasta 9 (ver el comentario de atajosKds).
              const tecla = idx < 9 ? idx + 1 : null;
              return (
                <div
                  key={orden.id}
                  className="bg-ops-panel/95 backdrop-blur-md border-2 border-ops-border rounded-ui-lg overflow-hidden shadow-xl transition-all duration-media"
                >
                  <div className="p-5 flex justify-between items-start border-b-2 border-ops-border bg-ops-panel-2">
                    <div>
                      <h3 className="text-2xl font-black text-ops-ink font-syne leading-none flex items-center gap-2.5">
                        {tecla && (
                          <kbd
                            title={`Pulsa ${tecla} para marcar esta comanda lista`}
                            className="text-sm font-black w-7 h-7 flex items-center justify-center rounded-ui bg-ops-accent/10 text-ops-accent border-2 border-ops-accent/30 shrink-0"
                          >
                            {tecla}
                          </kbd>
                        )}
                        {orden.mesa || 'Mostrador'}
                      </h3>
                      <p className="text-[10px] font-black text-ops-accent mt-2 uppercase tracking-widest">
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
                          className={`flex gap-3 p-4 rounded-ui cursor-pointer transition-all border-2 ${
                            listo
                              ? 'bg-ops-panel-2 border-ops-border opacity-50 scale-[0.98]'
                              : 'bg-white dark:bg-ops-bg border-ops-border hover:border-ops-accent/30 dark:hover:border-ops-accent/50 shadow-sm'
                          }`}
                        >
                          <div className="mt-0.5">
                            {listo ? (
                              <CheckSquare className="w-6 h-6 text-ops-ok" />
                            ) : (
                              <Square className="w-6 h-6 text-ops-muted" />
                            )}
                          </div>
                          <div>
                            <p
                              className={`font-black text-lg leading-tight ${listo ? 'text-ops-ok line-through' : 'text-ops-ink'}`}
                            >
                              <span className="text-ops-accent mr-2 text-xl">
                                {item.cantidad}x
                              </span>
                              {item.nombre}
                            </p>
                            {Array.isArray(item.componentes) &&
                              item.componentes.filter(
                                (comp) => comp?.recetaId != null,
                              ).length > 0 && (
                                <p className="text-xs font-bold text-ops-muted mt-1">
                                  Incluye:{' '}
                                  {item.componentes
                                    .filter((comp) => comp?.recetaId != null)
                                    .map(
                                      (comp) =>
                                        `${Number(comp.cantidad) || 1}x ${comp.nombre || `#${comp.recetaId}`}`,
                                    )
                                    .join(' · ')}
                                </p>
                              )}
                            {nota && (
                              <p className="text-xs font-black text-ops-warn mt-2 bg-ops-warn/15 border border-ops-warn/30 px-3 py-1.5 rounded-ui inline-block">
                                📝 {nota}
                              </p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="p-4 bg-ops-panel-2 border-t-2 border-ops-border">
                    <button
                      onClick={() => marcarEstacionLista(orden.id)}
                      className="w-full py-4 rounded-ui font-black text-sm tracking-widest uppercase transition-all active:scale-95 shadow-md bg-ops-ok dark:hover:bg-[#00c98c] text-ops-ok-fg shadow-ops-ok/30 dark:shadow-[0_0_20px_rgba(0,229,160,0.3)] flex items-center justify-center gap-2"
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
        <OpsModal
          titulo="¿Purgar producción?"
          icono={AlertTriangle}
          ancho="max-w-sm"
          onClose={() => setShowConfirmModal(false)}
          pie={
            <>
              <OpsButton
                className="flex-1"
                onClick={() => setShowConfirmModal(false)}
              >
                Cancelar
              </OpsButton>
              <OpsButton
                variante="cobro"
                className="flex-1"
                onClick={ejecutarLimpiezaTotal}
              >
                Sí, purgar
              </OpsButton>
            </>
          }
        >
          <p className="text-ops-muted font-bold text-sm">
            Cancelará <strong>todas</strong> las comandas activas, de todas las
            estaciones. No se puede deshacer.
          </p>
        </OpsModal>
      )}
    </div>
  );
}
