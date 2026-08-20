import { useState, useMemo, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '../../store/useAppStore';
import { useSyncStore } from '../../store/useSyncStore';
import { useAuthStore } from '../auth/useAuthStore';
import { calcularVenta } from '../../lib/Fiscal';
import { useAtajos } from '../../hooks/useAtajos';
import { useAcoplado } from '../../hooks/useAcoplado';
import PanelAcoplable from '../../components/PanelAcoplable';
import InspectorMesa from './components/InspectorMesa';
import { OpsHeader, OpsTabs, OpsButton, OpsEmpty } from '../../components/ui';
import {
  Users,
  CreditCard,
  Utensils,
  Plus,
  Edit2,
  LayoutGrid,
  X,
  MapPin,
  ArrowRightLeft,
  UserCheck,
  CheckSquare,
  Square,
  ArrowDownAZ,
  TrendingUp,
  Link2,
  Link2Off,
  BellRing,
  BookMarked,
  Clock,
  Search,
} from 'lucide-react';

// id de cliente: estable online/offline, sin colisión de secuencia (mesas.id es uuid).
const nuevoId = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

// ¿La mesa tiene una comanda TOTALMENTE lista esperando ser entregada?
// (todos los items listos en KDS, y la comanda aún no entregada/cerrada).
const itemListo = (it) => it?.estado === 'listo' || it?.completado === true;
const mesaConRondaLista = (comandasActivas, mesaId) =>
  (comandasActivas || []).some(
    (c) =>
      String(c.mesa_id) === String(mesaId) &&
      !['entregada', 'completada', 'cancelada'].includes(c.estado) &&
      (c.items || []).length > 0 &&
      (c.items || []).every(itemListo),
  );

export default function MesasScreen() {
  const {
    mesas,
    staff,
    clientes,
    configuracion,
    comandas_activas,
    showToast,
    updateConfiguracion,
  } = useAppStore();
  const { enqueueAction } = useSyncStore();
  const navigate = useNavigate();

  const [filtroZona, setFiltroZona] = useState('Todas');
  const [ordenamiento, setOrdenamiento] = useState('alfabetico'); // 'alfabetico' | 'consumo'

  const [modalMesa, setModalMesa] = useState({ show: false, mesa: null });
  const [modalTraspaso, setModalTraspaso] = useState({
    show: false,
    mesaOrigen: null,
  });
  const [modalMeseros, setModalMeseros] = useState(false);
  const [modalJuntar, setModalJuntar] = useState(false);
  const [seleccionJuntar, setSeleccionJuntar] = useState([]); // ids de mesas a juntar

  const [formDataMesa, setFormDataMesa] = useState({
    nombre: '',
    capacidad: 4,
    zona: 'Salón Principal',
  });
  const [formTraspaso, setFormTraspaso] = useState({
    mesaDestinoId: '',
    itemsSeleccionados: [],
  });

  // Tasa de IVA y modo precio desde config (consistente con el motor fiscal de Sprint 2).
  const ivaRate = Number(configuracion?.iva ?? 0.16);
  const preciosIncluyenIva = configuracion?.precios_incluyen_iva ?? true;

  // Recalcula el total de un conjunto de items SIN el bug de doble-IVA:
  // usa el mismo motor fiscal que el POS (calcularVenta), respetando si los
  // precios ya incluyen IVA. Antes multiplicaba precio*cantidad*1.16 a ciegas.
  const totalDeItems = (items = []) =>
    calcularVenta({
      items: items.map((it) => ({
        precio: Number(it.precio ?? it.precio_venta ?? 0),
        cantidad: Number(it.cantidad ?? 1),
      })),
      ivaRate,
      preciosIncluyenIva,
    });

  // Mapa zona → mesero asignado (config.asignaciones_zona).
  const asignacionesZona = configuracion?.asignaciones_zona || {};
  const meseroDeZona = (zona) => {
    const id = asignacionesZona[zona];
    if (!id) return null;
    return (staff || []).find((s) => String(s.id) === String(id)) || null;
  };

  // ── AGRUPACIÓN DE MESAS ───────────────────────────────────────────────────
  // Satélites de una principal (mesas con mesa_principal_id === principal.id).
  const satelitesDe = (principalId) =>
    (mesas || []).filter(
      (m) => String(m.mesa_principal_id) === String(principalId),
    );

  // ¿Esta mesa es satélite (está unida a otra)?
  const esSatelite = (mesa) => mesa.mesa_principal_id != null;

  // Capacidad combinada: la propia + la de todas sus satélites.
  const capacidadCombinada = (mesa) =>
    Number(mesa.capacidad || 0) +
    satelitesDe(mesa.id).reduce((acc, s) => acc + Number(s.capacidad || 0), 0);

  // Mesas libres y NO agrupadas, candidatas a juntarse.
  const mesasLibres = useMemo(
    () =>
      (mesas || []).filter(
        (m) => m.estado === 'libre' && m.mesa_principal_id == null,
      ),
    [mesas],
  );

  const toggleSeleccionJuntar = (id) =>
    setSeleccionJuntar((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );

  // La principal = primera por orden natural entre las seleccionadas.
  const principalDeSeleccion = useMemo(() => {
    const elegidas = (mesas || []).filter((m) =>
      seleccionJuntar.includes(m.id),
    );
    if (elegidas.length === 0) return null;
    return [...elegidas].sort((a, b) =>
      a.nombre.localeCompare(b.nombre, undefined, { numeric: true }),
    )[0];
  }, [mesas, seleccionJuntar]);

  const ejecutarJuntar = () => {
    if (seleccionJuntar.length < 2)
      return showToast('Selecciona al menos 2 mesas para juntar', 'error');

    const principal = principalDeSeleccion;
    const satelites = (mesas || []).filter(
      (m) =>
        seleccionJuntar.includes(m.id) && String(m.id) !== String(principal.id),
    );

    // La principal pasa a ocupada (lista para recibir la cuenta del grupo).
    const payloadPrincipal = { ...principal, estado: 'ocupada' };
    enqueueAction('mesas', 'upsert', payloadPrincipal);

    // Satélites → estado 'agrupada', apuntando a la principal.
    const payloadsSatelites = satelites.map((s) => ({
      ...s,
      estado: 'agrupada',
      mesa_principal_id: principal.id,
    }));
    payloadsSatelites.forEach((p) => enqueueAction('mesas', 'upsert', p));

    useAppStore.setState((prev) => ({
      mesas: prev.mesas.map((m) => {
        if (String(m.id) === String(principal.id)) return payloadPrincipal;
        const sat = payloadsSatelites.find(
          (p) => String(p.id) === String(m.id),
        );
        return sat || m;
      }),
    }));

    showToast(
      `${satelites.length + 1} mesas unidas a ${principal.nombre} (cap. ${
        Number(principal.capacidad || 0) +
        satelites.reduce((a, s) => a + Number(s.capacidad || 0), 0)
      })`,
      'success',
    );
    setModalJuntar(false);
    setSeleccionJuntar([]);
  };

  const zonasUnicas = useMemo(() => {
    const zonas = (mesas || [])
      .map((m) => m.zona || 'Sin Área')
      .filter(Boolean);
    return ['Todas', ...new Set(zonas)];
  }, [mesas]);

  const zonasReales = useMemo(
    () => [
      ...new Set(
        (mesas || []).map((m) => m.zona || 'Sin Área').filter(Boolean),
      ),
    ],
    [mesas],
  );

  const mesasFiltradasYOrdenadas = useMemo(() => {
    const filtradas = (mesas || [])
      // Las satélites NO se muestran sueltas: viven bajo su principal.
      .filter((m) => m.mesa_principal_id == null)
      .filter(
        (m) => filtroZona === 'Todas' || (m.zona || 'Sin Área') === filtroZona,
      );
    if (ordenamiento === 'consumo') {
      // Mayor consumo actual primero (total de la cuenta abierta).
      return [...filtradas].sort(
        (a, b) => (b.orden_actual?.total || 0) - (a.orden_actual?.total || 0),
      );
    }
    // Alfabético natural (Mesa 2 antes que Mesa 10).
    return [...filtradas].sort((a, b) =>
      a.nombre.localeCompare(b.nombre, undefined, { numeric: true }),
    );
  }, [mesas, filtroZona, ordenamiento]);

  const metricas = useMemo(
    () => ({
      total: mesas?.length || 0,
      libres: (mesas || []).filter((m) => m.estado === 'libre').length,
      ocupadas: (mesas || []).filter((m) => m.estado === 'ocupada').length,
      porCobrar: (mesas || []).filter((m) => m.estado === 'por_cobrar').length,
      reservadas: (mesas || []).filter((m) => m.estado === 'reservada').length,
    }),
    [mesas],
  );

  // Solo meseros (no todo el staff) para asignación de zonas.
  const meserosDisponibles = useMemo(
    () =>
      (staff || []).filter((s) => {
        if (s.activo === false) return false;
        const rol = (s.rol || s.puesto || '').toLowerCase();
        return rol.includes('mesero') || rol === '' || rol.includes('capit');
      }),
    [staff],
  );

  const abrirModalMesa = (mesa = null) => {
    setModalMesa({ show: true, mesa });
    setFormDataMesa({
      nombre: mesa?.nombre || `Mesa ${(mesas?.length || 0) + 1}`,
      capacidad: mesa?.capacidad || 4,
      zona:
        mesa?.zona || (filtroZona !== 'Todas' ? filtroZona : 'Salón Principal'),
    });
  };

  const guardarMesa = (e) => {
    e.preventDefault();
    if (!formDataMesa.nombre.trim() || !formDataMesa.zona.trim())
      return showToast('Nombre y Zona obligatorios', 'error');

    const payload = {
      id: modalMesa.mesa ? modalMesa.mesa.id : nuevoId(),
      nombre: formDataMesa.nombre.trim(),
      capacidad: Number(formDataMesa.capacidad),
      zona: formDataMesa.zona.trim(),
      estado: modalMesa.mesa ? modalMesa.mesa.estado : 'libre',
      comensales_reales: modalMesa.mesa ? modalMesa.mesa.comensales_reales : 0,
      orden_actual: modalMesa.mesa ? modalMesa.mesa.orden_actual : null,
    };

    enqueueAction('mesas', 'upsert', payload);
    useAppStore.setState((prev) => {
      const existe = prev.mesas.find(
        (m) => String(m.id) === String(payload.id),
      );
      return {
        mesas: existe
          ? prev.mesas.map((m) =>
              String(m.id) === String(payload.id) ? payload : m,
            )
          : [...prev.mesas, payload],
      };
    });

    showToast(
      `Mesa ${modalMesa.mesa ? 'actualizada' : 'creada'} exitosamente`,
      'success',
    );
    setModalMesa({ show: false, mesa: null });
  };

  // ── ASIGNACIÓN DE MESEROS POR ZONA ──────────────────────────────────────
  const asignarMeseroAZona = (zona, meseroId) => {
    const nuevasAsignaciones = { ...asignacionesZona };
    if (!meseroId) delete nuevasAsignaciones[zona];
    else nuevasAsignaciones[zona] = meseroId;
    // updateConfiguracion ya persiste (optimista + Supabase/cola).
    updateConfiguracion({
      ...configuracion,
      asignaciones_zona: nuevasAsignaciones,
    });
  };

  // ── TRASPASO DE CUENTAS ─────────────────────────────────────────────────
  const abrirModalTraspaso = (mesa) => {
    setModalTraspaso({ show: true, mesaOrigen: mesa });
    setFormTraspaso({ mesaDestinoId: '', itemsSeleccionados: [] });
  };

  const toggleItemTraspaso = (itemIdx) => {
    setFormTraspaso((prev) => {
      const seleccionados = prev.itemsSeleccionados.includes(itemIdx)
        ? prev.itemsSeleccionados.filter((idx) => idx !== itemIdx)
        : [...prev.itemsSeleccionados, itemIdx];
      return { ...prev, itemsSeleccionados: seleccionados };
    });
  };

  const seleccionarTodoTraspaso = () => {
    const todos =
      modalTraspaso.mesaOrigen?.orden_actual?.items?.map((_, idx) => idx) || [];
    setFormTraspaso((prev) => ({
      ...prev,
      itemsSeleccionados:
        prev.itemsSeleccionados.length === todos.length ? [] : todos,
    }));
  };

  const ejecutarTraspaso = () => {
    const { mesaOrigen } = modalTraspaso;
    const { mesaDestinoId, itemsSeleccionados } = formTraspaso;

    if (!mesaDestinoId)
      return showToast('Selecciona una mesa destino', 'error');
    if (itemsSeleccionados.length === 0)
      return showToast('Selecciona al menos un producto', 'error');

    const destino = mesas.find((m) => String(m.id) === String(mesaDestinoId));
    if (!destino) return showToast('Mesa destino no encontrada', 'error');

    const itemsOriginales = mesaOrigen.orden_actual?.items || [];
    const itemsParaMover = itemsOriginales.filter((_, idx) =>
      itemsSeleccionados.includes(idx),
    );
    const itemsRestantes = itemsOriginales.filter(
      (_, idx) => !itemsSeleccionados.includes(idx),
    );

    // Totales vía motor fiscal (sin doble IVA). orden_actual unificado: {items, subtotal, total}.
    const fOrigen = totalDeItems(itemsRestantes);
    const payloadOrigen = {
      ...mesaOrigen,
      estado: itemsRestantes.length === 0 ? 'libre' : mesaOrigen.estado,
      comensales_reales:
        itemsRestantes.length === 0 ? 0 : mesaOrigen.comensales_reales,
      orden_actual:
        itemsRestantes.length === 0
          ? null
          : {
              items: itemsRestantes,
              subtotal: fOrigen.subtotal,
              total: fOrigen.total,
            },
    };

    const nuevosItemsDestino = [
      ...(destino.orden_actual?.items || []),
      ...itemsParaMover,
    ];
    const fDestino = totalDeItems(nuevosItemsDestino);
    const payloadDestino = {
      ...destino,
      estado: 'ocupada',
      comensales_reales: Math.max(destino.comensales_reales || 1, 1),
      orden_actual: {
        items: nuevosItemsDestino,
        subtotal: fDestino.subtotal,
        total: fDestino.total,
      },
    };

    enqueueAction('mesas', 'upsert', payloadOrigen);
    enqueueAction('mesas', 'upsert', payloadDestino);

    // ── Reasignar comandas en cocina a la mesa destino (SIN duplicar/recocinar) ──
    // Transferir comida ya enviada NO debe re-emitirse como nueva comanda
    // 'pendiente' (eso la recocina y la duplica en el KDS). En su lugar, movemos
    // las comandas activas de la mesa origen a la mesa destino, preservando el
    // estado de cocción de cada item. La cocina solo ve el cambio de mesa.
    const itemsEnCocina = itemsParaMover.filter(
      (it) => (it.cantidad_enviada || 0) > 0,
    );
    if (itemsEnCocina.length > 0) {
      const comandasActivas = useAppStore.getState().comandas_activas || [];
      const comandasOrigen = comandasActivas.filter(
        (c) =>
          String(c.mesa_id) === String(mesaOrigen.id) &&
          !['completada', 'cancelada', 'entregada'].includes(c.estado),
      );

      comandasOrigen.forEach((c) => {
        const movida = { ...c, mesa: destino.nombre, mesa_id: destino.id };
        enqueueAction('comandas', 'upsert', movida);
      });

      useAppStore.setState((prev) => ({
        comandas_activas: prev.comandas_activas.map((c) =>
          comandasOrigen.find((co) => String(co.id) === String(c.id))
            ? { ...c, mesa: destino.nombre, mesa_id: destino.id }
            : c,
        ),
      }));
    }

    useAppStore.setState((prev) => ({
      mesas: prev.mesas.map((m) =>
        String(m.id) === String(payloadOrigen.id)
          ? payloadOrigen
          : String(m.id) === String(payloadDestino.id)
            ? payloadDestino
            : m,
      ),
    }));

    showToast('Traspaso completado con éxito', 'success');
    setModalTraspaso({ show: false, mesaOrigen: null });
  };

  // ── RESERVA DE MESA ────────────────────────────────────────────────────────
  // Solo tiene sentido reservar mesas LIBRES; liberar regresa a 'libre'.
  // Reservar abre un modal con el nombre (cliente del CRM o texto libre) y
  // hora estimada opcional — informativo, sin bloqueos de agenda. La reserva
  // viaja en mesas.reserva (jsonb) y se propaga por realtime.
  const [modalReservar, setModalReservar] = useState(null); // mesa | null
  const [reservaForm, setReservaForm] = useState({
    nombre: '',
    clienteId: null,
    hora: '',
  });
  const [reservaBusqueda, setReservaBusqueda] = useState('');

  const clientesReservaMatch = useMemo(() => {
    const term = reservaBusqueda.trim().toLowerCase();
    if (term.length < 2) return [];
    return (clientes || [])
      .filter((c) => c.activo !== false)
      .filter(
        (c) =>
          (c.nombre || '').toLowerCase().includes(term) ||
          (c.telefono || '').toLowerCase().includes(term),
      )
      .slice(0, 5);
  }, [clientes, reservaBusqueda]);

  const toggleReserva = (mesa) => {
    const esReservada = mesa.estado === 'reservada';
    if (esReservada) {
      // Liberar: directo, sin modal, limpiando la reserva.
      const mesaActualizada = { ...mesa, estado: 'libre', reserva: null };
      enqueueAction('mesas', 'upsert', mesaActualizada);
      useAppStore.setState((prev) => ({
        mesas: prev.mesas.map((m) =>
          String(m.id) === String(mesa.id) ? mesaActualizada : m,
        ),
      }));
      showToast(`${mesa.nombre} liberada`, 'info');
      return;
    }
    if (mesa.estado !== 'libre') {
      showToast('Solo se pueden reservar mesas libres.', 'error');
      return;
    }
    setReservaForm({ nombre: '', clienteId: null, hora: '' });
    setReservaBusqueda('');
    setModalReservar(mesa);
  };

  const confirmarReserva = () => {
    const mesa = modalReservar;
    if (!mesa) return;
    const nombre = reservaForm.nombre.trim();
    const mesaActualizada = {
      ...mesa,
      estado: 'reservada',
      reserva: {
        nombre: nombre || null,
        cliente_id: reservaForm.clienteId ?? null,
        hora: reservaForm.hora || null,
      },
    };
    enqueueAction('mesas', 'upsert', mesaActualizada);
    useAppStore.setState((prev) => ({
      mesas: prev.mesas.map((m) =>
        String(m.id) === String(mesa.id) ? mesaActualizada : m,
      ),
    }));
    setModalReservar(null);
    showToast(
      `${mesa.nombre} reservada${nombre ? ` para ${nombre}` : ''}`,
      'info',
    );
  };

  // Click en una mesa reservada: no se comanda sin ocuparla antes. Modal
  // propio de la app (window.confirm es del navegador y rompe la experiencia).
  const [modalReserva, setModalReserva] = useState(null); // mesa | null

  const handleClickMesa = (mesa) => {
    if (mesa.estado === 'reservada') {
      setModalReserva(mesa);
      return;
    }
    navigate(`/pos?mesa=${mesa.id}`);
  };

  const confirmarOcuparReservada = () => {
    const mesa = modalReserva;
    if (!mesa) return;
    const mesaLiberada = { ...mesa, estado: 'libre', reserva: null };
    enqueueAction('mesas', 'upsert', mesaLiberada);
    useAppStore.setState((prev) => ({
      mesas: prev.mesas.map((m) =>
        String(m.id) === String(mesa.id) ? mesaLiberada : m,
      ),
    }));
    setModalReserva(null);
    navigate(`/pos?mesa=${mesa.id}`);
  };

  // ─── SELECCIÓN POR TECLADO (Proyecto D · tanda 3) ────────────────────────
  // El mapa no tenía "mesa seleccionada": el clic mandaba directo al POS. Sin
  // un cursor, teclas como R (reservar) o T (traspasar) no tendrían sobre qué
  // actuar. Esto es además la base del inspector contextual de la tanda 4.
  //
  // La selección es DERIVADA, no un espejo en estado: si la mesa se filtra o
  // desaparece, el cursor cae solo en la primera. Un useEffect que "corrigiera"
  // el id sería un render en cascada y un bug en cuanto llegue un realtime.
  const gridRef = useRef(null);
  const [mesaSelId, setMesaSelId] = useState(null);

  // La distinción importa: `mesaElegida` es lo que el usuario señaló de verdad;
  // `mesaSeleccionada` añade el respaldo a la primera de la lista. El respaldo
  // es bueno para la columna acoplada —así no arranca vacía— y para las flechas
  // —así hay desde dónde moverse—, pero no puede decidir nada que el usuario
  // no haya pedido. La hoja se abre sólo con `mesaElegida`.
  const mesaElegida =
    mesasFiltradasYOrdenadas.find((m) => String(m.id) === String(mesaSelId)) ||
    null;
  const mesaSeleccionada = mesaElegida || mesasFiltradasYOrdenadas[0] || null;

  // Figura: ¿cabe el inspector como columna al lado del mapa? Ver `useAcoplado`.
  const acoplado = useAcoplado();

  // Sólo se mira en estrecho. En acoplado la columna está siempre puesta y este
  // estado no existe para nadie.
  const [hojaMesa, setHojaMesa] = useState(false);

  // La hoja enseña LA MESA QUE SE TOCÓ, nunca el respaldo. Si un realtime, un
  // cambio de zona o un traspaso saca esa mesa de la lista con la hoja arriba,
  // el respaldo la cambiaría por otra sin avisar y el dedo, que ya iba camino
  // de «Cobrar», cobraría la mesa equivocada. Al derivar la visibilidad de que
  // la mesa siga existiendo, la hoja se cae sola — y sin un `useEffect` que
  // corrija estado, que es lo que prohíbe `set-state-in-effect`.
  const hojaVisible = hojaMesa && !!mesaElegida;
  const mesaDelPanel = acoplado ? mesaSeleccionada : mesaElegida;

  // Toda acción lanzada DESDE la hoja la cierra primero. Los modales viven en
  // z-[100] y la hoja en z-40, así que sin esto el modal de traspaso salía
  // encima de la hoja y al cerrarlo aparecía la hoja debajo, que nadie pidió.
  const desdeInspector = (accion) => () => {
    setHojaMesa(false);
    if (mesaDelPanel) accion(mesaDelPanel);
  };

  // Columnas REALES del grid: es responsive (1→5 según breakpoint) y las
  // flechas verticales tienen que saltar una fila de verdad, no un número fijo.
  const columnasDelGrid = () => {
    const cols = gridRef.current
      ? getComputedStyle(gridRef.current).gridTemplateColumns.split(' ').length
      : 1;
    return Math.max(1, cols);
  };

  const moverSeleccion = (delta) => {
    const lista = mesasFiltradasYOrdenadas;
    if (!lista.length) return;
    const actual = lista.findIndex(
      (m) => String(m.id) === String(mesaSeleccionada?.id),
    );
    const siguiente = Math.min(
      lista.length - 1,
      Math.max(0, (actual < 0 ? 0 : actual) + delta),
    );
    const mesa = lista[siguiente];
    setMesaSelId(mesa.id);
    gridRef.current
      ?.querySelector(`[data-mesa-id="${mesa.id}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  };

  // Reloj de minuto: sin él, "45 min abierta" se quedaría congelado en lo que
  // valiera al montar la pantalla. Un mapa de piso que miente con el tiempo es
  // peor que uno que no lo muestra.
  const [ahora, setAhora] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setAhora(Date.now()), 60000);
    return () => clearInterval(id);
  }, []);

  // ── DATOS DERIVADOS PARA EL INSPECTOR (tanda 4) ───────────────────────────
  // La mesa NO guarda "hora de apertura": el estado pasa a 'ocupada' sin sello
  // de tiempo. El dato honesto que sí existe es la primera comanda activa de la
  // mesa, así que el reloj se cuenta desde ahí (y si no hay comandas, no se
  // inventa un tiempo).
  const infoMesaSel = useMemo(() => {
    const m = mesaSeleccionada;
    if (!m) return { minutosAbierta: null, rondas: 0 };
    const suyas = (comandas_activas || []).filter(
      (c) =>
        String(c.mesa_id) === String(m.id) &&
        !['entregada', 'completada', 'cancelada'].includes(c.estado),
    );
    const primera = suyas
      .map((c) => new Date(c.fecha_hora || 0).getTime())
      .filter((t) => Number.isFinite(t) && t > 0)
      .sort((a, b) => a - b)[0];
    return {
      minutosAbierta: primera
        ? Math.max(0, Math.floor((ahora - primera) / 60000))
        : null,
      rondas: suyas.length,
    };
  }, [mesaSeleccionada, comandas_activas, ahora]);

  // ── ATAJOS DEL MAPA DE MESAS ──────────────────────────────────────────────
  // Todo lo que un capitán de piso hace cien veces por turno. Llaman a los
  // mismos handlers que los botones, así que arrastran sus reglas: una mesa
  // reservada sigue pidiendo confirmación antes de ocuparse, etc.
  const hayModalEnMesas =
    modalMesa.show ||
    modalTraspaso.show ||
    modalMeseros ||
    modalJuntar ||
    !!modalReservar ||
    !!modalReserva;

  const sel = mesaSeleccionada;
  useAtajos(
    'mesas',
    {
      arrowright: {
        descripcion: 'Mover la selección',
        accion: () => moverSeleccion(1),
      },
      arrowleft: { accion: () => moverSeleccion(-1) },
      arrowdown: { accion: () => moverSeleccion(columnasDelGrid()) },
      arrowup: { accion: () => moverSeleccion(-columnasDelGrid()) },
      enter: {
        // La etiqueta cambia con el estado: sobre una mesa que pidió la cuenta,
        // Enter ES cobrar. Prometer "abrir" ahí sería mentir en el hint.
        descripcion:
          sel?.estado === 'por_cobrar' ? 'Cobrar la mesa' : 'Abrir la mesa',
        accion: () => sel && handleClickMesa(sel),
      },
      r: {
        descripcion:
          sel?.estado === 'reservada' ? 'Liberar la reserva' : 'Reservar',
        accion: () => sel && toggleReserva(sel),
      },
      t: {
        descripcion: 'Traspasar la cuenta',
        accion: () => sel && abrirModalTraspaso(sel),
      },
      j: {
        descripcion: 'Juntar mesas',
        accion: () => {
          setModalJuntar(true);
          setSeleccionJuntar([]);
        },
      },
      e: {
        descripcion: 'Editar la mesa',
        accion: () => sel && abrirModalMesa(sel),
      },
    },
    { titulo: 'Mapa de mesas', activo: !hayModalEnMesas },
  );

  const getEstadoUI = (estado) => {
    if (estado === 'ocupada')
      return {
        color:
          'bg-ops-danger/10 border-ops-danger/30 text-ops-danger shadow-[0_0_15px_rgba(255,95,64,0.15)]',
        icon: <Users className="w-5 h-5" />,
      };
    if (estado === 'reservada')
      return {
        color:
          'bg-ops-accent/10 border-ops-accent/30 text-ops-accent shadow-[0_0_15px_rgba(139,92,246,0.15)]',
        icon: <BookMarked className="w-5 h-5" />,
      };
    if (estado === 'por_cobrar')
      return {
        color:
          'bg-ops-warn/10 border-ops-warn/30 text-ops-warn shadow-[0_0_15px_rgba(255,178,36,0.15)] animate-pulse',
        icon: <CreditCard className="w-5 h-5" />,
      };
    return {
      color: 'bg-ops-ok/10 border-ops-ok/30 text-ops-ok',
      icon: <Utensils className="w-5 h-5" />,
    };
  };

  return (
    // (Proyecto D · tanda 4 · roadmap 3.10) Mapa + INSPECTOR contextual.
    //
    // Antes el inspector se caía por debajo de 1280 px y ya está: en tablet y
    // teléfono el mapa era todo lo que había. El razonamiento era «ahí el mapa
    // necesita todo el ancho», que es cierto para la COLUMNA y falso para el
    // inspector — no desaparece la necesidad de ver qué lleva la mesa, sólo el
    // sitio donde ponerla al lado. Y quien más la necesita es justamente el
    // mesero con la tablet en la mano, que no puede ir a mirarlo a la caja.
    //
    // Ahora no se cae: cambia de figura. Columna con sitio, hoja sin él.
    <div className="h-full flex min-h-0 text-ops-ink transition-colors">
      {/* `p-3` sin ancho. Los 24 px por lado de `p-6` son 48 de 390, y en esta
          pantalla el ancho no es decoración: decide cuántas mesas caben por
          fila. Con el riel fuera y este padding, el mapa pasa de 286 px útiles
          a ~366. */}
      <div className="flex-1 min-w-0 p-3 lg:p-8 h-full animate-in fade-in duration-media flex flex-col min-h-0">
        {/* ─── HEADER & KPI'S ─── */}
        <OpsHeader
          icono={LayoutGrid}
          titulo="Mapa Operativo"
          subtitulo="Control de piso y cuentas"
          scopeAtajos="mesas"
          acciones={
            <>
              {/* Contadores: cifra grande, etiqueta pequeña — se leen de un
                vistazo desde la barra, que es cuando se consultan.

                `leading-tight` en la cifra y no `leading-none` heredado del
                contenedor. Syne 800 tiene glifos más altos que su caja em, así
                que con `line-height: 1` el «0» y el «1» salían recortados por
                arriba y por abajo. Se veía en pantalla y es de esos fallos que
                uno lee como «la fuente se ve rara» sin llegar a la causa.

                El `leading-none` se queda en la ETIQUETA, que es de 10 px en la
                fuente de UI y ahí no recorta nada: lo que se buscaba con él era
                pegar la etiqueta a la cifra, y eso se conserva. */}
              <div className="flex items-center gap-2 bg-ops-panel px-2 py-1.5 rounded-ui border-2 border-ops-border shadow-sm">
                <div className="px-3 flex flex-col">
                  <span className="text-[10px] font-black uppercase text-ops-muted leading-none">
                    Libres
                  </span>
                  <span className="text-xl font-black font-syne text-ops-ok tabular-nums leading-tight">
                    {metricas.libres}
                  </span>
                </div>
                <div className="w-px h-8 bg-ops-panel-2 dark:bg-ops-border" />
                <div className="px-3 flex flex-col">
                  <span className="text-[10px] font-black uppercase text-ops-muted leading-none">
                    Ocupadas
                  </span>
                  <span className="text-xl font-black font-syne text-ops-danger tabular-nums leading-tight">
                    {metricas.ocupadas}
                  </span>
                </div>
              </div>

              <OpsButton
                icono={Link2}
                tecla="J"
                onClick={() => {
                  setModalJuntar(true);
                  setSeleccionJuntar([]);
                }}
                title="Juntar mesas"
                className="px-3"
              />
              <OpsButton
                icono={UserCheck}
                onClick={() => setModalMeseros(true)}
                title="Asignar meseros por zona"
                className="px-3"
              />
              <OpsButton
                variante="primario"
                icono={Plus}
                onClick={() => abrirModalMesa()}
              >
                Mesa
              </OpsButton>
            </>
          }
        />

        {/* ─── CONTROLES: ZONAS + ORDEN ─── */}
        <div className="flex flex-col sm:flex-row gap-3 mb-6 shrink-0">
          <OpsTabs
            className="flex-1"
            valor={filtroZona}
            onChange={setFiltroZona}
            opciones={zonasUnicas.map((zona) => ({
              id: zona,
              label: zona,
              icono: zona !== 'Todas' ? MapPin : undefined,
              // Quién atiende la zona, en la propia pestaña: el mesero no tiene
              // que abrir el modal de asignaciones para saber si le toca.
              nota:
                zona !== 'Todas'
                  ? meseroDeZona(zona)?.nombre.split(' ')[0]
                  : undefined,
            }))}
          />

          {/* Toggle de ordenamiento */}
          <div className="flex bg-ops-panel p-1.5 rounded-ui border-2 border-ops-border shrink-0 h-fit">
            <button
              onClick={() => setOrdenamiento('alfabetico')}
              className={`px-3 py-1.5 rounded-ui font-bold text-xs flex items-center gap-1.5 transition-all ${ordenamiento === 'alfabetico' ? 'bg-ops-accent text-ops-accent-fg shadow-sm' : 'text-ops-muted hover:text-ops-ink dark:hover:text-ops-ink'}`}
              title="Orden alfabético"
            >
              <ArrowDownAZ className="w-4 h-4" /> A-Z
            </button>
            <button
              onClick={() => setOrdenamiento('consumo')}
              className={`px-3 py-1.5 rounded-ui font-bold text-xs flex items-center gap-1.5 transition-all ${ordenamiento === 'consumo' ? 'bg-ops-accent text-ops-accent-fg shadow-sm' : 'text-ops-muted hover:text-ops-ink dark:hover:text-ops-ink'}`}
              title="Mayor consumo primero"
            >
              <TrendingUp className="w-4 h-4" /> Consumo
            </button>
          </div>
        </div>

        {/* ─── GRID DE MESAS ─── */}
        {/* El `pt-3 pl-2` es lo que impide que se corte la tarjeta
            seleccionada, y no el `gap` del grid —que ya es de 12 a 20 px y
            separa tarjetas ENTRE SÍ, no la tarjeta del borde del contenedor,
            que es donde ocurre el recorte—. La seleccionada lleva `ring-4
            ring-offset-2`: 2 px de hueco + 4 de anillo = 6 px pintados POR
            FUERA de su caja en los cuatro lados. Este contenedor tenía margen a
            la derecha y abajo y NADA arriba ni a la izquierda, así que
            `overflow-y-auto` recortaba el anillo de la primera fila y de la
            primera columna.
            Arriba hace falta más que a los lados y por eso no es un `p-2`
            parejo: la tarjeta además lleva `-translate-y-1`, que la sube 4 px,
            así que su borde superior llega a 6 + 4 = 10 px — `pt-2` (8 px) se
            quedaría dos cortos, que es justo el tipo de casi-arreglo que hace
            creer que el diagnóstico estaba mal. */}
        <div className="flex-1 overflow-y-auto custom-scrollbar pt-3 pl-2 pr-2 pb-10">
          {/* Dos vacíos DISTINTOS, no uno genérico: "no hay nada" y "tu filtro no
            encontró nada" son problemas diferentes y tienen salidas diferentes.
            El primero necesita crear una mesa; el segundo, quitar el filtro.
            Un solo mensaje para ambos obliga al usuario a adivinar cuál es. */}
          {mesasFiltradasYOrdenadas.length === 0 ? (
            (mesas || []).length === 0 ? (
              <OpsEmpty
                icono={LayoutGrid}
                titulo="Aún no hay mesas"
                descripcion="El mapa es el punto de partida del servicio: crea las mesas de tu salón para empezar a tomar órdenes."
                accion={
                  <OpsButton
                    variante="primario"
                    icono={Plus}
                    onClick={() => abrirModalMesa()}
                  >
                    Crear la primera mesa
                  </OpsButton>
                }
              />
            ) : (
              <OpsEmpty
                icono={LayoutGrid}
                titulo={`Sin mesas en ${filtroZona}`}
                descripcion="Hay mesas en el restaurante, pero ninguna en esta área."
                accion={
                  <OpsButton onClick={() => setFiltroZona('Todas')}>
                    Ver todas las áreas
                  </OpsButton>
                }
              />
            )
          ) : (
            <div
              ref={gridRef}
              // `auto-fill` + `minmax`, no una lista de puntos de corte.
              //
              // Aquí llegaron a convivir CINCO (`sm`/`md`/`lg`/`xl`/`2xl`), y
              // aun así el caso que importaba salía mal: a 390 px daban UNA
              // columna con tarjetas de ~200 px de alto, o sea dos mesas por
              // pantalla. Un mapa de piso que no enseña el piso no es un mapa,
              // es una lista — y con veinte mesas son diez pantallazos para ver
              // quién pidió la cuenta.
              //
              // Con `auto-fill` no hay tramos que mantener: se declara el ancho
              // MÍNIMO que una tarjeta necesita para ser legible y el navegador
              // mete las que quepan. Sale solo en el teléfono, en la tablet, con
              // el inspector acoplado quitando 300 px y en el monitor del dueño,
              // sin que ninguno de esos casos esté escrito en ningún sitio.
              //
              // 150 px es el mínimo real, no un número redondo: por debajo, la
              // píldora de zona («SALON 1») deja de caber en una línea.
              //
              // El primer intento puso 160 y NO llegó a dar dos columnas: lo
              // calculé contra ~342 px útiles y los reales eran 286, porque no
              // conté el riel del chasis (56) ni el `p-6` (48). 160×2 + 12 de
              // hueco pide 332 y no cabía por 46 px. Con el riel fuera y el
              // padding a `p-3` quedan ~366, y 150 entra con holgura para que
              // no vuelva a decidirse en el filo.
              //
              // La lección, que es la que importa: la densidad de una rejilla no
              // se calcula contra el ancho de la pantalla sino contra el que
              // deja el chasis.
              //
              // La navegación por flechas sigue funcionando: `columnasDelGrid`
              // lee `gridTemplateColumns` ya resuelto por el navegador, que con
              // `auto-fill` devuelve la lista de pistas REALES en píxeles.
              style={{
                gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
              }}
              className="grid gap-3 lg:gap-5"
            >
              {mesasFiltradasYOrdenadas.map((mesa) => {
                const ui = getEstadoUI(mesa.estado);
                const mesero = meseroDeZona(mesa.zona);
                const sats = satelitesDe(mesa.id);
                const estaAgrupada = sats.length > 0;
                const capMostrar = estaAgrupada
                  ? capacidadCombinada(mesa)
                  : mesa.capacidad;
                const rondaLista = mesaConRondaLista(comandas_activas, mesa.id);
                const seleccionada =
                  String(mesa.id) === String(mesaSeleccionada?.id);
                return (
                  <div
                    key={mesa.id}
                    data-mesa-id={mesa.id}
                    className="relative group flex flex-col"
                  >
                    <button
                      // El clic también mueve el cursor: ratón y teclado comparten
                      // la misma selección en vez de pelearse por ella.
                      //
                      // Y a partir de ahí la figura decide (roadmap 3.10). Con
                      // el inspector acoplado el clic ya enseña la mesa en la
                      // columna de al lado, así que puede permitirse llevar al
                      // POS de un paso. Sin columna no enseña nada: el toque
                      // abre la hoja, y de la hoja se entra al POS.
                      //
                      // Cuesta un toque más en la acción más frecuente y aun
                      // así compensa: un toque errado en un teléfono cambia de
                      // pantalla entera y hay que volver, mientras que una hoja
                      // se descarta tirando hacia abajo. En una tarjeta de 190
                      // px que el pulgar tapa a medias, los toques errados no
                      // son el caso raro.
                      onClick={() => {
                        setMesaSelId(mesa.id);
                        if (acoplado) handleClickMesa(mesa);
                        else setHojaMesa(true);
                      }}
                      className={`flex-1 flex flex-col bg-ops-panel border-2 rounded-ui-lg p-3 lg:p-4 text-left transition-all hover:-translate-y-1 shadow-sm ${ui.color} ${estaAgrupada ? 'ring-2 ring-ops-ok/40' : ''} ${rondaLista ? 'ring-2 ring-ops-ok shadow-[0_0_20px_rgba(16,185,129,0.25)]' : ''} ${seleccionada ? 'ring-4 ring-ops-accent ring-offset-2 ring-offset-slate-50 dark:ring-offset-ui-obsidiana -translate-y-1' : ''}`}
                    >
                      {rondaLista && (
                        <div className="absolute -top-2.5 left-1/2 -translate-x-1/2 z-10">
                          <span className="flex items-center gap-1 text-[9px] font-black uppercase tracking-widest text-ops-ok-fg bg-ops-ok dark:text-ops-bg px-2.5 py-1 rounded-full shadow-lg animate-pulse whitespace-nowrap">
                            <BellRing className="w-3 h-3" /> Lista para entregar
                          </span>
                        </div>
                      )}
                      {/* ── JERARQUÍA INVERTIDA RESPECTO A LO ANTERIOR ────────
                          Antes el importe iba arriba, grande y en el color del
                          estado, y el nombre de la mesa quedaba debajo al mismo
                          cuerpo pero en tinta normal. A igualdad de tamaño gana
                          el que tiene color, así que lo primero que se leía de
                          cada tarjeta era «$488».

                          En un mapa de piso la primera pregunta es QUÉ MESA ES
                          —el mesero busca la 11, no busca los $488— y el importe
                          es el dato de apoyo. Así que el identificador manda y
                          el importe pasa a subtítulo. Es además lo que pedía la
                          spec: «número gigante en Syne, debajo el importe».

                          Y de paso resuelve el ancho: con las dos cifras en
                          filas separadas, ninguna tiene que competir por sitio
                          en una tarjeta de 160 px. */}
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="p-1.5 rounded-ui bg-white/50 dark:bg-ops-bg/30 backdrop-blur-sm shadow-inner shrink-0">
                          {ui.icon}
                        </div>
                        <span className="text-[10px] font-black uppercase tracking-widest flex items-center gap-1 opacity-80 shrink-0">
                          <Users className="w-3 h-3" />
                          {mesa.estado === 'libre'
                            ? capMostrar
                            : `${mesa.comensales_reales}/${capMostrar}`}
                        </span>
                      </div>
                      <div className="mt-auto min-w-0">
                        <h3 className="text-3xl font-black font-syne text-ops-ink leading-tight truncate">
                          {mesa.nombre}
                        </h3>
                        {mesa.estado !== 'libre' && (
                          <p className="text-base font-black font-syne tabular-nums leading-tight">
                            $
                            {(mesa.orden_actual?.total || 0).toLocaleString(
                              'es-MX',
                              { minimumFractionDigits: 0 },
                            )}
                          </p>
                        )}
                        <div className="flex flex-col gap-1 mt-2">
                          <div className="flex items-center gap-1 flex-wrap">
                            <span className="text-[9px] font-black uppercase tracking-widest text-ops-accent bg-ops-accent/10 border border-ops-accent/30 px-2 py-0.5 rounded-ui">
                              {mesa.zona || 'Sin Área'}
                            </span>
                            {estaAgrupada && (
                              <span className="text-[9px] font-black uppercase tracking-widest text-ops-ok bg-ops-ok/10 border border-ops-ok/30 px-2 py-0.5 rounded-ui flex items-center gap-1">
                                <Link2 className="w-3 h-3" /> +{sats.length}
                              </span>
                            )}
                          </div>
                          {estaAgrupada && (
                            <span className="text-[9px] font-bold text-ops-ok">
                              Unida con: {sats.map((s) => s.nombre).join(', ')}
                            </span>
                          )}
                          {mesero && (
                            <span className="text-[9px] font-bold text-ops-muted flex items-center gap-1 mt-0.5">
                              <UserCheck className="w-3 h-3" /> {mesero.nombre}
                            </span>
                          )}
                          {mesa.estado === 'reservada' &&
                            mesa.reserva?.nombre && (
                              <span className="text-[9px] font-black text-ops-accent flex items-center gap-1 mt-0.5">
                                <BookMarked className="w-3 h-3" />{' '}
                                {mesa.reserva.nombre}
                                {mesa.reserva.hora
                                  ? ` · ${mesa.reserva.hora}`
                                  : ''}
                              </span>
                            )}
                        </div>
                      </div>
                    </button>

                    {/* ── ATAJOS DE RATÓN, Y SÓLO DE RATÓN ──────────────────
                        `opacity-0 group-hover` es un atajo para quien tiene
                        cursor: aparecen al pasar por encima y no roban sitio
                        el resto del tiempo. Con el dedo NO EXISTE «pasar por
                        encima», así que en un teléfono estos tres botones eran
                        superficie invisible e inalcanzable — editar, reservar y
                        traspasar sencillamente no estaban.
                        (El `focus-within` los rescataba con el tabulador, pero
                        eso no le sirve a nadie que use el dedo.)

                        La salida no es hacerlos visibles en táctil: son tres
                        botones de 40 px encima de una tarjeta de 160, y
                        competirían con el toque principal en el sitio exacto
                        donde cae el pulgar. Las tres acciones YA existen en el
                        inspector —con sus atajos y sus mismas reglas— y en
                        estrecho el inspector se abre tocando la tarjeta. Una
                        implementación por acción, dos formas de llegar según lo
                        que tengas en la mano.

                        Por eso se ocultan del todo en puntero grueso: dejar
                        montada una superficie que no se puede tocar sólo sirve
                        para que un día alguien la arregle a medias.

                        `.solo-raton` está en `index.css`, al lado de la regla
                        de las barras de desplazamiento: la pregunta «¿hay
                        ratón?» se contesta en un sitio, como el ancho se
                        contesta en `useAcoplado`. */}
                    <div className="solo-raton flex absolute top-2 right-2 flex-col gap-2 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          abrirModalMesa(mesa);
                        }}
                        className="p-2.5 bg-white dark:bg-ops-bg text-ops-muted hover:text-ops-accent border border-ops-border rounded-full shadow-xl"
                        title="Editar Mesa"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      {(mesa.estado === 'libre' ||
                        mesa.estado === 'reservada') && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleReserva(mesa);
                          }}
                          className={`p-2.5 rounded-full shadow-xl border transition-colors ${
                            mesa.estado === 'reservada'
                              ? 'bg-ops-accent text-ops-accent-fg border-ops-accent/50'
                              : 'bg-white dark:bg-ops-bg text-ops-muted hover:text-ops-accent dark:hover:text-ops-accent border-ops-border'
                          }`}
                          title={
                            mesa.estado === 'reservada'
                              ? 'Liberar reserva'
                              : 'Reservar mesa'
                          }
                        >
                          <BookMarked className="w-4 h-4" />
                        </button>
                      )}
                      {mesa.estado !== 'libre' && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            abrirModalTraspaso(mesa);
                          }}
                          className="p-2.5 bg-ops-danger text-ops-danger-fg border border-ops-danger/50 rounded-full shadow-xl"
                          title="Traspasar Artículos"
                        >
                          <ArrowRightLeft className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ─── INSPECTOR CONTEXTUAL ───
          Columna acoplada a la derecha con sitio; hoja desde abajo sin él. El
          mismo primitivo que el carrito del POS y el mismo árbol de contenido
          en las dos figuras.

          Sin barra flotante, y ahí se separa del carrito. El carrito no tiene
          representación ninguna en el catálogo, así que la barra es su única
          forma de decir «llevas 4 líneas, $380». Aquí cada mesa ya enseña su
          total en su propia tarjeta, y la tarjeta ES el disparador: una barra
          repetiría un dato que está a la vista y taparía la última fila del
          mapa a cambio de nada. */}
      <PanelAcoplable
        abierto={hojaVisible}
        onAbrir={() => setHojaMesa(true)}
        onCerrar={() => setHojaMesa(false)}
        disparador={false}
        // Sin `titulo`: el inspector abre con el nombre de la mesa a cuerpo 24
        // y su estado al lado. Repetirlo aquí arriba daría el mismo nombre dos
        // veces en cinco centímetros.
        etiquetaAbrir="Ver mesa"
        // 300 px es lo que pide la maqueta de tablet. A 1024 deja al mapa 700 y
        // pico, que es donde el grid baja a 3 columnas.
        anchoAcoplado="lg:w-[300px] xl:w-[340px]"
      >
        <InspectorMesa
          mesa={mesaDelPanel}
          mesero={mesaDelPanel ? meseroDeZona(mesaDelPanel.zona) : null}
          capacidad={mesaDelPanel ? capacidadCombinada(mesaDelPanel) : 0}
          minutosAbierta={infoMesaSel.minutosAbierta}
          rondasEnProduccion={infoMesaSel.rondas}
          rondaLista={
            mesaDelPanel
              ? mesaConRondaLista(comandas_activas, mesaDelPanel.id)
              : false
          }
          // Los callbacks son los MISMOS que usan las tarjetas y los atajos: una
          // sola implementación por acción, tres formas de invocarla.
          onAbrir={desdeInspector(handleClickMesa)}
          onReservar={desdeInspector(toggleReserva)}
          onTraspasar={desdeInspector(abrirModalTraspaso)}
          onJuntar={() => {
            setHojaMesa(false);
            setModalJuntar(true);
            setSeleccionJuntar([]);
          }}
          onEditar={desdeInspector(abrirModalMesa)}
        />
      </PanelAcoplable>

      {/* ─── MODAL: JUNTAR MESAS ─── */}
      {modalJuntar && (
        <div className="fixed inset-0 bg-ops-ink/60 dark:bg-ops-bg/80 backdrop-blur-md z-[100] flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-ops-panel rounded-ui-lg border-2 border-ops-border p-6 max-w-2xl w-full shadow-2xl animate-in zoom-in-95 flex flex-col max-h-[90dvh]">
            <div className="flex justify-between items-center mb-2 border-b-2 border-ops-border pb-4 shrink-0">
              <h2 className="text-xl font-black font-syne text-ops-ink flex items-center gap-2">
                <Link2 className="w-5 h-5 text-ops-ok" /> Juntar Mesas
              </h2>
              <button
                onClick={() => {
                  setModalJuntar(false);
                  setSeleccionJuntar([]);
                }}
                className="text-ops-muted hover:text-ops-danger p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-xs font-bold text-ops-muted mb-4 shrink-0">
              Selecciona 2 o más mesas{' '}
              <span className="text-ops-ok">libres</span> para una reservación
              de grupo. Comparten una sola cuenta.
            </p>

            {/* Aviso de cuál será la principal */}
            {seleccionJuntar.length >= 2 && principalDeSeleccion && (
              <div className="mb-4 p-3 bg-ops-ok/10 border-2 border-ops-ok/30 rounded-ui flex items-center gap-3 shrink-0">
                <Link2 className="w-5 h-5 text-ops-ok shrink-0" />
                <p className="text-sm font-bold text-ops-ok">
                  Mesa principal:{' '}
                  <span className="font-black">
                    {principalDeSeleccion.nombre}
                  </span>{' '}
                  · Capacidad total:{' '}
                  {(mesas || [])
                    .filter((m) => seleccionJuntar.includes(m.id))
                    .reduce((acc, m) => acc + Number(m.capacidad || 0), 0)}{' '}
                  personas
                </p>
              </div>
            )}

            <div className="flex-1 overflow-y-auto custom-scrollbar pr-2">
              {mesasLibres.length < 2 ? (
                <p className="text-center text-ops-muted font-bold py-8">
                  Necesitas al menos 2 mesas libres para juntar.
                </p>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {mesasLibres.map((m) => {
                    const sel = seleccionJuntar.includes(m.id);
                    return (
                      <button
                        key={m.id}
                        onClick={() => toggleSeleccionJuntar(m.id)}
                        className={`p-4 rounded-ui border-2 text-left transition-all ${
                          sel
                            ? 'bg-ops-ok/10 border-ops-ok'
                            : 'bg-white dark:bg-ops-bg border-ops-border hover:border-ops-border dark:hover:border-ops-muted'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-black text-ops-ink">
                            {m.nombre}
                          </span>
                          {sel ? (
                            <CheckSquare className="w-4 h-4 text-ops-ok" />
                          ) : (
                            <Square className="w-4 h-4 text-ops-muted dark:text-ops-border" />
                          )}
                        </div>
                        <span className="text-[10px] font-black uppercase tracking-widest text-ops-muted">
                          {m.zona || 'Sin Área'} · Cap {m.capacidad}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="pt-6 border-t-2 border-ops-border flex gap-3 shrink-0">
              <button
                onClick={() => {
                  setModalJuntar(false);
                  setSeleccionJuntar([]);
                }}
                className="flex-1 py-4 bg-ops-panel-2 text-ops-muted font-bold rounded-ui border-2 border-transparent hover:border-ops-border dark:hover:border-ops-border transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={ejecutarJuntar}
                disabled={seleccionJuntar.length < 2}
                className="flex-1 py-4 bg-ops-ok hover:bg-[#00c98c] text-ops-bg font-black rounded-ui shadow-lg shadow-ops-ok/20 active:scale-95 transition-all disabled:opacity-50"
              >
                Juntar{' '}
                {seleccionJuntar.length >= 2
                  ? `(${seleccionJuntar.length})`
                  : ''}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── MODAL: ASIGNAR MESEROS POR ZONA ─── */}
      {modalMeseros && (
        <div className="fixed inset-0 bg-ops-ink/60 dark:bg-ops-bg/80 backdrop-blur-md z-[100] flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-ops-panel rounded-ui-lg border-2 border-ops-border p-6 max-w-lg w-full shadow-2xl animate-in zoom-in-95 flex flex-col max-h-[90dvh]">
            <div className="flex justify-between items-center mb-6 border-b-2 border-ops-border pb-4 shrink-0">
              <h2 className="text-xl font-black font-syne text-ops-ink flex items-center gap-2">
                <UserCheck className="w-5 h-5 text-ops-accent" /> Meseros por
                Zona
              </h2>
              <button
                onClick={() => setModalMeseros(false)}
                className="text-ops-muted hover:text-ops-danger p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 space-y-3">
              {zonasReales.length === 0 ? (
                <p className="text-center text-ops-muted font-bold py-8">
                  Crea mesas con zonas primero.
                </p>
              ) : (
                zonasReales.map((zona) => (
                  <div
                    key={zona}
                    className="flex items-center gap-4 bg-ops-panel-2 border-2 border-ops-border p-4 rounded-ui"
                  >
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <MapPin className="w-4 h-4 text-ops-accent shrink-0" />
                      <span className="font-black text-ops-ink truncate">
                        {zona}
                      </span>
                    </div>
                    <select
                      value={asignacionesZona[zona] || ''}
                      onChange={(e) => asignarMeseroAZona(zona, e.target.value)}
                      className="bg-ops-panel border-2 border-ops-field text-ops-ink font-bold px-3 py-2.5 rounded-ui outline-none focus:border-ops-accent text-sm shrink-0"
                    >
                      <option value="">Sin asignar</option>
                      {meserosDisponibles.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.nombre}
                        </option>
                      ))}
                    </select>
                  </div>
                ))
              )}
            </div>

            <div className="pt-6 border-t-2 border-ops-border shrink-0">
              <button
                onClick={() => setModalMeseros(false)}
                className="w-full py-4 bg-ops-accent text-ops-accent-fg font-black rounded-ui shadow-lg shadow-ops-accent/20 active:scale-95 transition-all"
              >
                Listo
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── MODAL: TRASPASO DE CUENTAS ─── */}
      {modalTraspaso.show && (
        <div className="fixed inset-0 bg-ops-ink/60 dark:bg-ops-bg/80 backdrop-blur-md z-[100] flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-ops-panel rounded-ui-lg border-2 border-ops-border p-6 max-w-2xl w-full shadow-2xl animate-in zoom-in-95 flex flex-col max-h-[90dvh]">
            <div className="flex justify-between items-center mb-6 border-b-2 border-ops-border pb-4 shrink-0">
              <h2 className="text-xl font-black font-syne text-ops-ink flex items-center gap-2">
                <ArrowRightLeft className="w-5 h-5 text-ops-danger" /> Traspaso
                de Cuentas
              </h2>
              <button
                onClick={() =>
                  setModalTraspaso({ show: false, mesaOrigen: null })
                }
                className="text-ops-muted hover:text-ops-danger dark:hover:text-ops-ink p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 space-y-6">
              <div className="bg-ops-panel-2 border-2 border-ops-border p-5 rounded-ui">
                <label className="block text-[10px] font-black text-ops-muted uppercase tracking-widest mb-3">
                  Mover de{' '}
                  <span className="text-ops-danger">
                    {modalTraspaso.mesaOrigen?.nombre}
                  </span>{' '}
                  hacia:
                </label>
                <select
                  value={formTraspaso.mesaDestinoId}
                  onChange={(e) =>
                    setFormTraspaso({
                      ...formTraspaso,
                      mesaDestinoId: e.target.value,
                    })
                  }
                  className="w-full bg-ops-panel border-2 border-ops-field text-ops-ink font-bold px-4 py-3.5 rounded-ui outline-none focus:border-ops-danger dark:focus:border-ops-danger"
                >
                  <option value="">-- Selecciona Mesa Destino --</option>
                  {mesas
                    .filter(
                      (m) =>
                        String(m.id) !== String(modalTraspaso.mesaOrigen?.id),
                    )
                    .map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.nombre} ({m.zona || 'Sin Área'}){' '}
                        {m.estado !== 'libre' ? '- Ocupada' : ''}
                      </option>
                    ))}
                </select>
              </div>

              <div>
                <div className="flex justify-between items-end mb-3">
                  <label className="block text-[10px] font-black text-ops-muted uppercase tracking-widest">
                    Selecciona los productos a mover
                  </label>
                  <button
                    onClick={seleccionarTodoTraspaso}
                    className="text-[10px] font-black text-ops-accent uppercase hover:underline"
                  >
                    Seleccionar Todo
                  </button>
                </div>
                <div className="space-y-2">
                  {(modalTraspaso.mesaOrigen?.orden_actual?.items || []).map(
                    (item, idx) => (
                      <div
                        key={idx}
                        onClick={() => toggleItemTraspaso(idx)}
                        className={`flex items-center gap-3 p-4 rounded-ui border-2 cursor-pointer transition-colors ${
                          formTraspaso.itemsSeleccionados.includes(idx)
                            ? 'bg-ops-danger/10 border-ops-danger text-ops-ink'
                            : 'bg-white dark:bg-ops-bg border-ops-border text-ops-muted hover:border-ops-border dark:hover:border-ops-muted'
                        }`}
                      >
                        {formTraspaso.itemsSeleccionados.includes(idx) ? (
                          <CheckSquare className="w-5 h-5 text-ops-danger" />
                        ) : (
                          <Square className="w-5 h-5" />
                        )}
                        <div className="flex-1 font-bold text-sm">
                          {item.cantidad}x {item.nombre}
                          {(item.cantidad_enviada || 0) > 0 && (
                            <span className="ml-2 text-[9px] font-black text-ops-warn uppercase">
                              en cocina
                            </span>
                          )}
                        </div>
                      </div>
                    ),
                  )}
                </div>
              </div>
            </div>

            <div className="pt-6 border-t-2 border-ops-border flex gap-3 shrink-0">
              <button
                onClick={() =>
                  setModalTraspaso({ show: false, mesaOrigen: null })
                }
                className="flex-1 py-4 bg-ops-panel-2 text-ops-muted font-bold rounded-ui border-2 border-transparent hover:border-ops-border dark:hover:border-ops-border transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={ejecutarTraspaso}
                className="flex-1 py-4 bg-ops-danger text-ops-danger-fg font-black rounded-ui shadow-lg shadow-ops-danger/20 transition-transform active:scale-95"
              >
                Ejecutar Traspaso
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── MODAL: CREAR / EDITAR MESA ─── */}
      {modalMesa.show && (
        <div className="fixed inset-0 bg-ops-ink/60 dark:bg-ops-bg/80 backdrop-blur-md z-[100] flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-ops-panel rounded-ui-lg border-2 border-ops-border p-6 max-w-md w-full shadow-2xl animate-in zoom-in-95">
            <div className="flex justify-between items-center mb-6 border-b-2 border-ops-border pb-4">
              <h2 className="text-xl font-black font-syne text-ops-ink flex items-center gap-2">
                <LayoutGrid className="w-5 h-5 text-ops-accent" />
                {modalMesa.mesa ? 'Editar Mesa y Área' : 'Añadir Nueva Mesa'}
              </h2>
              <button
                onClick={() => setModalMesa({ show: false, mesa: null })}
                className="text-ops-muted hover:text-ops-danger p-1 rounded-ui"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={guardarMesa} className="space-y-5">
              <div>
                <label className="block text-[10px] font-black text-ops-muted uppercase tracking-widest mb-2 pl-2">
                  Identificador
                </label>
                <input
                  type="text"
                  required
                  value={formDataMesa.nombre}
                  onChange={(e) =>
                    setFormDataMesa({ ...formDataMesa, nombre: e.target.value })
                  }
                  className="w-full bg-ops-panel-2 border-2 border-ops-field text-ops-ink font-bold px-4 py-3.5 rounded-ui outline-none focus:border-ops-accent"
                  placeholder="Ej: Mesa 1, VIP A..."
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-black text-ops-muted uppercase tracking-widest mb-2 pl-2">
                    Capacidad
                  </label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={formDataMesa.capacidad}
                    onChange={(e) =>
                      setFormDataMesa({
                        ...formDataMesa,
                        capacidad: e.target.value,
                      })
                    }
                    className="w-full bg-ops-panel-2 border-2 border-ops-field text-ops-ink font-bold px-4 py-3.5 rounded-ui outline-none focus:border-ops-accent text-center"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-ops-muted uppercase tracking-widest mb-2 pl-2">
                    Zona / Área
                  </label>
                  <input
                    type="text"
                    list="zonas-list"
                    required
                    value={formDataMesa.zona}
                    onChange={(e) =>
                      setFormDataMesa({ ...formDataMesa, zona: e.target.value })
                    }
                    className="w-full bg-ops-panel-2 border-2 border-ops-field text-ops-ink font-bold px-4 py-3.5 rounded-ui outline-none focus:border-ops-accent"
                    placeholder="Ej: Terraza"
                  />
                  <datalist id="zonas-list">
                    {zonasUnicas
                      .filter((z) => z !== 'Todas')
                      .map((z) => (
                        <option key={z} value={z} />
                      ))}
                  </datalist>
                </div>
              </div>
              <div className="pt-4 flex gap-3">
                <button
                  type="button"
                  onClick={() => setModalMesa({ show: false, mesa: null })}
                  className="flex-1 py-4 bg-ops-panel-2 text-ops-muted font-bold rounded-ui border-2 border-transparent hover:border-ops-border dark:hover:border-ops-border transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 py-4 bg-ops-accent text-ops-accent-fg font-black rounded-ui shadow-lg shadow-ops-accent/20 active:scale-95 transition-all"
                >
                  Guardar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: reservar mesa (nombre CRM/texto libre + hora opcional) */}
      {modalReservar && (
        <div className="fixed inset-0 bg-ops-ink/60 dark:bg-ops-bg/80 backdrop-blur-md z-[110] flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-ops-panel rounded-ui-lg p-8 max-w-sm w-full shadow-2xl border-2 border-ops-border animate-in zoom-in-95">
            <div className="w-16 h-16 bg-ops-accent/15 rounded-full flex items-center justify-center mx-auto mb-4">
              <BookMarked className="w-8 h-8 text-ops-accent" />
            </div>
            <h2 className="text-2xl font-black font-syne text-ops-ink mb-1 text-center">
              Reservar {modalReservar.nombre}
            </h2>
            <p className="text-ops-muted font-bold text-xs mb-5 text-center">
              ¿A nombre de quién? Busca en el CRM o escribe libre. Todo es
              opcional.
            </p>

            <div className="space-y-3">
              <div className="flex items-center bg-ops-panel-2 p-3 rounded-ui border border-ops-border">
                <Search className="w-4 h-4 text-ops-muted mx-2 shrink-0" />
                <input
                  type="text"
                  autoFocus
                  placeholder="Nombre o teléfono..."
                  value={
                    reservaForm.clienteId ? reservaForm.nombre : reservaBusqueda
                  }
                  onChange={(e) => {
                    setReservaBusqueda(e.target.value);
                    setReservaForm((p) => ({
                      ...p,
                      nombre: e.target.value,
                      clienteId: null,
                    }));
                  }}
                  className="w-full bg-transparent font-black text-ops-ink outline-none"
                />
                {reservaForm.clienteId && (
                  <button
                    onClick={() =>
                      setReservaForm((p) => ({
                        ...p,
                        nombre: '',
                        clienteId: null,
                      }))
                    }
                    className="p-1 text-ops-muted hover:text-ops-danger"
                    title="Quitar cliente"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
              {!reservaForm.clienteId && clientesReservaMatch.length > 0 && (
                <div className="space-y-1.5">
                  {clientesReservaMatch.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => {
                        setReservaForm((p) => ({
                          ...p,
                          nombre: c.nombre,
                          clienteId: c.id,
                        }));
                        setReservaBusqueda('');
                      }}
                      className="w-full flex justify-between items-center bg-ops-panel-2 hover:bg-ops-accent/10 dark:hover:bg-ops-accent/10 border border-ops-border rounded-ui px-4 py-2.5 transition-colors text-left"
                    >
                      <span className="font-black text-ops-ink truncate">
                        {c.nombre}
                      </span>
                      <span className="text-[10px] font-bold text-ops-muted shrink-0 ml-2">
                        {c.telefono || 'CRM'}
                      </span>
                    </button>
                  ))}
                </div>
              )}
              <div className="flex items-center bg-ops-panel-2 p-3 rounded-ui border border-ops-border">
                <Clock className="w-4 h-4 text-ops-muted mx-2 shrink-0" />
                <input
                  type="time"
                  value={reservaForm.hora}
                  onChange={(e) =>
                    setReservaForm((p) => ({ ...p, hora: e.target.value }))
                  }
                  className="w-full bg-transparent font-black text-ops-ink outline-none"
                />
              </div>
            </div>

            <div className="flex flex-col gap-3 mt-6">
              <button
                onClick={confirmarReserva}
                className="w-full bg-ops-accent text-ops-accent-fg py-4 rounded-ui font-black uppercase tracking-widest shadow-lg shadow-ops-accent/30 transition-transform active:scale-95"
              >
                Reservar
              </button>
              <button
                onClick={() => setModalReservar(null)}
                className="w-full bg-ops-panel-2 hover:bg-ops-panel-2 dark:hover:bg-ops-border text-ops-ink py-4 rounded-ui font-bold transition-colors"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: ¿ocupar mesa reservada? */}
      {modalReserva && (
        <div className="fixed inset-0 bg-ops-ink/60 dark:bg-ops-bg/80 backdrop-blur-md z-[110] flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-ops-panel rounded-ui-lg p-8 max-w-sm w-full shadow-2xl text-center border-2 border-ops-border animate-in zoom-in-95">
            <div className="w-20 h-20 bg-ops-accent/15 rounded-full flex items-center justify-center mx-auto mb-6">
              <BookMarked className="w-10 h-10 text-ops-accent" />
            </div>
            <h2 className="text-2xl font-black font-syne text-ops-ink mb-2">
              {modalReserva.nombre} está reservada
            </h2>
            {modalReserva.reserva?.nombre && (
              <p className="text-ops-accent font-black text-sm mb-2 flex items-center justify-center gap-2">
                <BookMarked className="w-4 h-4" />
                {modalReserva.reserva.nombre}
                {modalReserva.reserva.hora
                  ? ` · ${modalReserva.reserva.hora}`
                  : ''}
              </p>
            )}
            <p className="text-ops-muted font-bold text-sm mb-8">
              ¿Llegó el cliente? Al confirmar, la mesa se ocupa y podrás
              comandar.
            </p>
            <div className="flex flex-col gap-3">
              <button
                onClick={confirmarOcuparReservada}
                className="w-full bg-ops-accent text-ops-accent-fg py-4 rounded-ui font-black uppercase tracking-widest shadow-lg shadow-ops-accent/30 transition-transform active:scale-95"
              >
                Sí, ocupar y comandar
              </button>
              <button
                onClick={() => setModalReserva(null)}
                className="w-full bg-ops-panel-2 hover:bg-ops-panel-2 dark:hover:bg-ops-border text-ops-ink py-4 rounded-ui font-bold transition-colors"
              >
                Mantener reserva
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
