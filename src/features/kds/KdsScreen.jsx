import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '../../store/useAppStore';
import { useSyncStore } from '../../store/useSyncStore';
import { useSessionStore } from '../../store/useSessionStore';
import { useAuthStore } from '../auth/useAuthStore';
import { useAtajos } from '../../hooks/useAtajos';
import { useAvisoKds } from '../../hooks/useAvisoKds';
import { puedeRecibirAvisos } from '../../lib/AvisoKds';
import {
  getRolEfectivo,
  getCapacidades,
  permisoDeMarcadoKds,
} from '../../lib/Permisos';
import { buscarAutorizador } from '../../lib/Autorizacion';
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
  ShieldAlert,
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

  // ── EL SEGURO POR ESTACIÓN (§7, decidido el 17-ago) ──────────────────────
  // Lo pidió Chris: que un barista no marque listo un platillo de cocina por
  // error, ni al revés; y que quien entra a supervisar entre a mirar. No es una
  // muralla de permisos —el que sabe el PIN entra en dos toques— es un seguro
  // contra el toque involuntario en una pantalla que se usa con las manos
  // ocupadas y veinte comandas encima.
  //
  // La regla vive en `lib/Permisos.js` y se prueba ahí. Aquí sólo se pregunta.
  // Y la respuesta trae MOTIVO, no un booleano: un botón que está y no responde
  // es el fallo del «Salir» del barista del 12-ago otra vez.
  //
  // `desbloqueado` es de sesión y a propósito: la escotilla existe para la noche
  // en que el KDS se atasca y el único en el local es el dueño. «Sólo lectura»
  // sin salida no es una regla, es una trampa. Y queda auditado quién la abrió,
  // que es más de lo que hay hoy.
  const [desbloqueado, setDesbloqueado] = useState(false);
  const [pinAbierto, setPinAbierto] = useState(false);
  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState('');

  const estacionDelUsuario =
    useSessionStore.getState().empleadoActivo?.estacion ||
    user?.estacion ||
    null;

  const permisoDeMarcado = (estacionItem) =>
    desbloqueado
      ? { puede: true, motivo: 'ok' }
      : permisoDeMarcadoKds(capDeLaSesion, {
          estacionUsuario: estacionDelUsuario,
          estacionItem,
        });

  // Lo que se enseña arriba. Se calcula contra la estación que se está mirando:
  // es la que el usuario tiene delante y sobre la que va a tocar.
  const permisoAqui = permisoDeMarcado(estacionActiva);

  /**
   * Guarda única para las dos direcciones.
   *
   * Marcar listo y deshacer son el mismo botón (`estado: listo ? 'pendiente' :
   * 'listo'`), así que bloquear la acción bloquea las dos — y eso es lo que se
   * quiere: «no tocas esta estación» se le explica a un cocinero; «puedes
   * desmarcar pero no marcar», no.
   *
   * Devuelve `true` si hay que DETENERSE. Al detenerse abre el PIN en vez de no
   * hacer nada: el toque tiene que llevar a algún sitio.
   */
  const detenerSiNoPuede = (estacionItem) => {
    const { puede, motivo } = permisoDeMarcado(estacionItem);
    if (puede) return false;
    setPinError('');
    setPin('');
    setPinAbierto(true);
    if (motivo === 'otra_estacion') {
      showToast(`Ese platillo es de otra estación`, 'info');
    }
    return true;
  };

  const confirmarPin = () => {
    const p = String(pin).trim();
    if (p.length < 4) return setPinError('PIN incompleto.');

    // Mismo patrón que reabrir una cuenta: el PIN de alguien con mando, no una
    // contraseña nueva que nadie va a recordar. `gestion` y no un flag propio
    // porque un flag nuevo llegaría en `false` a todo local que ya tenga sus
    // filas de permisos —`getCapacidades` reemplaza, no mezcla— y la escotilla
    // no se abriría para nadie. Ver `lib/Permisos.js`.
    const quien = buscarAutorizador({
      staff: useAppStore.getState().staff,
      roles_permisos,
      pin: p,
      flag: 'gestion',
    });
    if (!quien) {
      setPin('');
      return setPinError('PIN inválido o sin permiso.');
    }

    setDesbloqueado(true);
    setPinAbierto(false);
    useAppStore.getState().registrarAuditoria?.({
      fecha: new Date().toISOString(),
      usuario: quien.nombre,
      accion: 'KDS_DESBLOQUEADO',
      modulo: 'KDS',
      nivel: 'info',
      detalles: `${quien.nombre} habilitó el marcado en el KDS (${estacionActiva}).`,
    });
    showToast(`Marcado habilitado por ${quien.nombre}`, 'success');
  };

  // Marcar un item listo / pendiente. NO finaliza la comanda.
  const toggleItem = (comandaId, itemId) => {
    const comanda = (comandas_activas || []).find(
      (c) => String(c.id) === String(comandaId),
    );
    if (!comanda) return;

    const elItem = comanda.items.find(
      (i) => String(i.id ?? i.nombre) === String(itemId),
    );
    if (detenerSiNoPuede(itemDestino(elItem))) return;

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
    // Marca todo lo de la estación que se está mirando, así que la guarda se
    // pregunta por esa misma estación.
    if (detenerSiNoPuede(estacionActiva)) return;
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

      {/* ── SE DICE QUE ESTÁS MIRANDO, NO SE DEJA ADIVINAR ────────────────
          Sin esto, la pantalla se ve igual que siempre y no responde, que es
          exactamente lo que no vale. Y lleva su salida al lado: «sólo lectura»
          sin escotilla deja el KDS bloqueado la noche que se atasca y el único
          en el local es el dueño. */}
      {!permisoAqui.puede && (
        <div className="relative z-10 mb-4 flex flex-wrap items-center justify-between gap-3 p-4 rounded-ui border-2 border-ops-warn bg-ops-warn/10">
          <div className="min-w-0">
            <p className="font-black text-sm text-ops-ink uppercase tracking-widest">
              {permisoAqui.motivo === 'otra_estacion'
                ? `Estás viendo ${estacionActiva}, que no es tu estación`
                : 'Estás mirando, no marcando'}
            </p>
            <p className="text-xs font-bold text-ops-muted mt-1">
              {permisoAqui.motivo === 'otra_estacion'
                ? 'Puedes verlo todo. Para marcar aquí hace falta el PIN de un encargado.'
                : 'Tu rol entra al KDS a supervisar. Con el PIN de un encargado se habilita el marcado.'}
            </p>
          </div>
          <OpsButton
            variante="cobro"
            onClick={() => {
              setPin('');
              setPinError('');
              setPinAbierto(true);
            }}
            className="shrink-0"
          >
            Desbloquear con PIN
          </OpsButton>
        </div>
      )}

      {/* El ajuste que no puede cumplir lo que promete: el rol tiene la
          restricción por estación activada y el empleado no tiene ninguna
          asignada, así que no hay con qué comparar y no está restringiendo
          nada. Se dice en vez de dejar creer que sí. */}
      {permisoAqui.motivo === 'sin_estacion' && (
        <div className="relative z-10 mb-4 p-3 rounded-ui border border-ops-border bg-ops-panel-2">
          <p className="text-xs font-bold text-ops-muted">
            Este rol está configurado para marcar sólo su estación, pero al
            empleado no se le ha asignado ninguna — así que ahora mismo puede
            marcar todas. Asígnasela en Empleados.
          </p>
        </div>
      )}

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
                          /* Apagado, no invisible, y clicable: el toque abre la
                             escotilla en vez de no hacer nada. Un elemento con
                             su aspecto de siempre que no responde se lee como
                             una app rota. */
                          className={`flex gap-3 p-4 rounded-ui transition-all border-2 ${
                            permisoAqui.puede
                              ? 'cursor-pointer'
                              : 'cursor-not-allowed opacity-60'
                          } ${
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
                            {/* Lo elegido en «¿cómo lo quiere?». Va MÁS
                                GRANDE que el desglose de un paquete y con
                                color: el término de la carne no es
                                información de contexto, es la instrucción.
                                Un cocinero mira esta tarjeta dos segundos
                                desde medio metro. */}
                            {Array.isArray(item.modificadores) &&
                              item.modificadores.length > 0 && (
                                <p className="text-sm font-black text-ops-accent mt-1.5 leading-tight">
                                  {item.modificadores
                                    .map((m) => m?.nombre)
                                    .filter(Boolean)
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
                      className={`w-full py-4 rounded-ui font-black text-sm tracking-widest uppercase transition-all active:scale-95 shadow-md flex items-center justify-center gap-2 ${
                        permisoAqui.puede
                          ? 'bg-ops-ok dark:hover:bg-[#00c98c] text-ops-ok-fg shadow-ops-ok/30 dark:shadow-[0_0_20px_rgba(0,229,160,0.3)]'
                          : 'bg-ops-panel-2 text-ops-muted border-2 border-ops-border cursor-not-allowed'
                      }`}
                    >
                      <CheckCheck className="w-5 h-5" />{' '}
                      {permisoAqui.puede
                        ? `Marcar ${estacionActiva} lista`
                        : 'Desbloquear para marcar'}
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

      {pinAbierto && (
        <OpsModal
          titulo="Habilitar el marcado"
          icono={ShieldAlert}
          ancho="max-w-sm"
          onClose={() => setPinAbierto(false)}
          pie={
            <>
              <OpsButton
                className="flex-1"
                onClick={() => setPinAbierto(false)}
              >
                Cancelar
              </OpsButton>
              <OpsButton
                variante="cobro"
                className="flex-1"
                onClick={confirmarPin}
              >
                Habilitar
              </OpsButton>
            </>
          }
        >
          <p className="text-ops-muted font-bold text-sm mb-3">
            El PIN de un encargado habilita el marcado en esta pantalla hasta
            que se cierre. Queda registrado quién lo hizo.
          </p>
          <input
            type="password"
            inputMode="numeric"
            autoFocus
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
            onKeyDown={(e) => e.key === 'Enter' && confirmarPin()}
            maxLength={6}
            placeholder="••••"
            className="w-full text-center text-2xl tracking-[0.5em] font-black p-3 rounded-ui border-2 border-ops-border bg-ops-bg text-ops-ink"
          />
          {pinError && (
            <p className="text-xs font-black text-ops-danger mt-2 text-center">
              {pinError}
            </p>
          )}
        </OpsModal>
      )}
    </div>
  );
}
