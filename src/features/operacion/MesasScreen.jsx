import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '../../store/useAppStore';
import { useSyncStore } from '../../store/useSyncStore';
import { useAuthStore } from '../auth/useAuthStore';
import { calcularVenta } from '../../lib/Fiscal';
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

  const getEstadoUI = (estado) => {
    if (estado === 'ocupada')
      return {
        color:
          'bg-rose-50 border-rose-200 text-rose-600 dark:bg-brand-arrecife/10 dark:text-brand-arrecife dark:border-brand-arrecife/40 shadow-[0_0_15px_rgba(255,95,64,0.15)]',
        icon: <Users className="w-5 h-5" />,
      };
    if (estado === 'reservada')
      return {
        color:
          'bg-indigo-50 border-indigo-200 text-indigo-600 dark:bg-brand-amatista/10 dark:text-brand-amatista dark:border-brand-amatista/40 shadow-[0_0_15px_rgba(139,92,246,0.15)]',
        icon: <BookMarked className="w-5 h-5" />,
      };
    if (estado === 'por_cobrar')
      return {
        color:
          'bg-amber-50 border-amber-200 text-amber-600 dark:bg-brand-ambar/10 dark:text-brand-ambar dark:border-brand-ambar/40 shadow-[0_0_15px_rgba(255,178,36,0.15)] animate-pulse',
        icon: <CreditCard className="w-5 h-5" />,
      };
    return {
      color:
        'bg-emerald-50 border-emerald-200 text-emerald-600 dark:bg-brand-cesped/10 dark:text-brand-cesped dark:border-brand-cesped/30',
      icon: <Utensils className="w-5 h-5" />,
    };
  };

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto h-full animate-in fade-in duration-300 flex flex-col min-h-0 text-slate-800 dark:text-ui-text transition-colors">
      {/* ─── HEADER & KPI'S ─── */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6 mb-6 shrink-0">
        <div>
          <h1 className="text-3xl font-black font-syne text-slate-900 dark:text-brand-nacar flex items-center gap-3 tracking-tight">
            <div className="bg-brand-amatista/10 p-2 rounded-xl">
              <LayoutGrid className="w-8 h-8 text-brand-amatista" />
            </div>
            Mapa Operativo
          </h1>
          <p className="text-xs font-bold text-slate-500 dark:text-ui-muted uppercase tracking-widest mt-2">
            Control de Piso y Cuentas
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 bg-white dark:bg-ui-humo p-2 rounded-2xl border-2 border-slate-100 dark:border-ui-border shadow-sm">
          <div className="px-3 flex flex-col">
            <span className="text-[10px] font-black uppercase text-slate-400 dark:text-ui-muted">
              Libres
            </span>
            <span className="text-xl font-black font-syne text-emerald-500 dark:text-brand-cesped">
              {metricas.libres}
            </span>
          </div>
          <div className="w-px h-8 bg-slate-200 dark:bg-ui-border"></div>
          <div className="px-3 flex flex-col">
            <span className="text-[10px] font-black uppercase text-slate-400 dark:text-ui-muted">
              Ocupadas
            </span>
            <span className="text-xl font-black font-syne text-rose-500 dark:text-brand-arrecife">
              {metricas.ocupadas}
            </span>
          </div>
          <div className="w-px h-8 bg-slate-200 dark:bg-ui-border"></div>

          <div className="flex gap-2 pl-2">
            <button
              onClick={() => {
                setModalJuntar(true);
                setSeleccionJuntar([]);
              }}
              className="bg-slate-50 dark:bg-ui-obsidiana border border-slate-200 dark:border-ui-border hover:border-brand-cesped hover:text-brand-cesped text-slate-400 dark:text-ui-muted p-3 rounded-xl transition-all"
              title="Juntar Mesas"
            >
              <Link2 className="w-5 h-5" />
            </button>
            <button
              onClick={() => setModalMeseros(true)}
              className="bg-slate-50 dark:bg-ui-obsidiana border border-slate-200 dark:border-ui-border hover:border-brand-amatista hover:text-brand-amatista text-slate-400 dark:text-ui-muted p-3 rounded-xl transition-all"
              title="Asignar Meseros por Zona"
            >
              <UserCheck className="w-5 h-5" />
            </button>
            <button
              onClick={() => abrirModalMesa()}
              className="bg-brand-amatista hover:bg-indigo-600 text-white dark:text-brand-nacar p-3 rounded-xl shadow-lg transition-transform active:scale-95"
              title="Añadir Mesa"
            >
              <Plus className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>

      {/* ─── CONTROLES: ZONAS + ORDEN ─── */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6 shrink-0">
        <div className="flex gap-3 overflow-x-auto custom-scrollbar pb-2 flex-1">
          {zonasUnicas.map((zona) => {
            const mesero = zona !== 'Todas' ? meseroDeZona(zona) : null;
            return (
              <button
                key={zona}
                onClick={() => setFiltroZona(zona)}
                className={`px-5 py-2.5 rounded-xl font-black text-sm whitespace-nowrap transition-all border-2 flex items-center gap-2 ${
                  filtroZona === zona
                    ? 'bg-brand-amatista text-white dark:text-brand-nacar border-brand-amatista shadow-lg shadow-brand-amatista/30'
                    : 'bg-white dark:bg-ui-humo text-slate-500 dark:text-ui-muted border-slate-100 dark:border-transparent hover:border-slate-300 dark:hover:border-ui-border'
                }`}
              >
                {zona !== 'Todas' && <MapPin className="w-4 h-4" />}
                {zona}
                {mesero && (
                  <span className="text-[9px] opacity-80 font-bold normal-case">
                    · {mesero.nombre.split(' ')[0]}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Toggle de ordenamiento */}
        <div className="flex bg-white dark:bg-ui-humo p-1.5 rounded-xl border-2 border-slate-100 dark:border-ui-border shrink-0 h-fit">
          <button
            onClick={() => setOrdenamiento('alfabetico')}
            className={`px-3 py-1.5 rounded-lg font-bold text-xs flex items-center gap-1.5 transition-all ${ordenamiento === 'alfabetico' ? 'bg-brand-amatista text-white dark:text-brand-nacar shadow-sm' : 'text-slate-500 dark:text-ui-muted hover:text-slate-800 dark:hover:text-brand-nacar'}`}
            title="Orden alfabético"
          >
            <ArrowDownAZ className="w-4 h-4" /> A-Z
          </button>
          <button
            onClick={() => setOrdenamiento('consumo')}
            className={`px-3 py-1.5 rounded-lg font-bold text-xs flex items-center gap-1.5 transition-all ${ordenamiento === 'consumo' ? 'bg-brand-amatista text-white dark:text-brand-nacar shadow-sm' : 'text-slate-500 dark:text-ui-muted hover:text-slate-800 dark:hover:text-brand-nacar'}`}
            title="Mayor consumo primero"
          >
            <TrendingUp className="w-4 h-4" /> Consumo
          </button>
        </div>
      </div>

      {/* ─── GRID DE MESAS ─── */}
      <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 pb-10">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-5">
          {mesasFiltradasYOrdenadas.map((mesa) => {
            const ui = getEstadoUI(mesa.estado);
            const mesero = meseroDeZona(mesa.zona);
            const sats = satelitesDe(mesa.id);
            const estaAgrupada = sats.length > 0;
            const capMostrar = estaAgrupada
              ? capacidadCombinada(mesa)
              : mesa.capacidad;
            const rondaLista = mesaConRondaLista(comandas_activas, mesa.id);
            return (
              <div key={mesa.id} className="relative group flex flex-col">
                <button
                  onClick={() => handleClickMesa(mesa)}
                  className={`flex-1 flex flex-col bg-white dark:bg-ui-humo border-2 rounded-[2rem] p-5 text-left transition-all hover:-translate-y-1 shadow-sm ${ui.color} ${estaAgrupada ? 'ring-2 ring-brand-cesped/40' : ''} ${rondaLista ? 'ring-2 ring-emerald-400 dark:ring-brand-cesped shadow-[0_0_20px_rgba(16,185,129,0.25)]' : ''}`}
                >
                  {rondaLista && (
                    <div className="absolute -top-2.5 left-1/2 -translate-x-1/2 z-10">
                      <span className="flex items-center gap-1 text-[9px] font-black uppercase tracking-widest text-white bg-emerald-500 dark:bg-brand-cesped dark:text-ui-obsidiana px-2.5 py-1 rounded-full shadow-lg animate-pulse whitespace-nowrap">
                        <BellRing className="w-3 h-3" /> Lista para entregar
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between items-start w-full mb-4">
                    <div className="p-2.5 rounded-xl bg-white/50 dark:bg-ui-obsidiana/30 backdrop-blur-sm shadow-inner">
                      {ui.icon}
                    </div>
                    {mesa.estado !== 'libre' && (
                      <span className="text-xl font-black font-syne tabular-nums">
                        $
                        {(mesa.orden_actual?.total || 0).toLocaleString(
                          'es-MX',
                          { minimumFractionDigits: 0 },
                        )}
                      </span>
                    )}
                  </div>
                  <div className="mt-auto">
                    <h3 className="text-xl font-black font-syne text-slate-900 dark:text-brand-nacar mb-1 flex items-center gap-2">
                      {mesa.nombre}
                      {estaAgrupada && (
                        <span className="text-[9px] font-black uppercase tracking-widest text-emerald-600 dark:text-brand-cesped bg-emerald-50 dark:bg-brand-cesped/10 border border-emerald-200 dark:border-brand-cesped/30 px-2 py-0.5 rounded-md flex items-center gap-1">
                          <Link2 className="w-3 h-3" /> +{sats.length}
                        </span>
                      )}
                    </h3>
                    <div className="flex flex-col gap-1.5 mt-2">
                      <span className="text-[9px] font-black uppercase tracking-widest text-indigo-600 dark:text-brand-amatista bg-indigo-50 dark:bg-brand-amatista/10 border border-indigo-200 dark:border-brand-amatista/20 px-2 py-0.5 rounded-md w-fit">
                        {mesa.zona || 'Sin Área'}
                      </span>
                      <span className="text-[10px] font-black uppercase tracking-widest flex items-center gap-1 opacity-80 mt-1">
                        <Users className="w-3 h-3" />{' '}
                        {mesa.estado === 'libre'
                          ? `Cap: ${capMostrar}`
                          : `${mesa.comensales_reales}/${capMostrar}`}
                      </span>
                      {estaAgrupada && (
                        <span className="text-[9px] font-bold text-emerald-600 dark:text-brand-cesped">
                          Unida con: {sats.map((s) => s.nombre).join(', ')}
                        </span>
                      )}
                      {mesero && (
                        <span className="text-[9px] font-bold text-slate-400 dark:text-ui-muted flex items-center gap-1 mt-0.5">
                          <UserCheck className="w-3 h-3" /> {mesero.nombre}
                        </span>
                      )}
                      {mesa.estado === 'reservada' && mesa.reserva?.nombre && (
                        <span className="text-[9px] font-black text-indigo-600 dark:text-brand-amatista flex items-center gap-1 mt-0.5">
                          <BookMarked className="w-3 h-3" />{' '}
                          {mesa.reserva.nombre}
                          {mesa.reserva.hora ? ` · ${mesa.reserva.hora}` : ''}
                        </span>
                      )}
                    </div>
                  </div>
                </button>

                <div className="absolute top-3 right-3 flex flex-col gap-2 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      abrirModalMesa(mesa);
                    }}
                    className="p-2.5 bg-white dark:bg-ui-obsidiana text-slate-500 dark:text-ui-muted hover:text-brand-amatista border border-slate-200 dark:border-ui-border rounded-full shadow-xl"
                    title="Editar Mesa"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  {(mesa.estado === 'libre' || mesa.estado === 'reservada') && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleReserva(mesa);
                      }}
                      className={`p-2.5 rounded-full shadow-xl border transition-colors ${
                        mesa.estado === 'reservada'
                          ? 'bg-indigo-500 dark:bg-brand-amatista text-white dark:text-ui-obsidiana border-indigo-600 dark:border-brand-amatista/50'
                          : 'bg-white dark:bg-ui-obsidiana text-slate-500 dark:text-ui-muted hover:text-indigo-500 dark:hover:text-brand-amatista border-slate-200 dark:border-ui-border'
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
                      className="p-2.5 bg-rose-500 dark:bg-brand-arrecife text-white dark:text-ui-obsidiana hover:bg-rose-600 dark:hover:bg-orange-500 border border-rose-600 dark:border-brand-arrecife/50 rounded-full shadow-xl"
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
      </div>

      {/* ─── MODAL: JUNTAR MESAS ─── */}
      {modalJuntar && (
        <div className="fixed inset-0 bg-slate-900/60 dark:bg-ui-obsidiana/80 backdrop-blur-md z-[100] flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white dark:bg-ui-humo rounded-[2.5rem] border-2 border-slate-100 dark:border-ui-border p-6 max-w-2xl w-full shadow-2xl animate-in zoom-in-95 flex flex-col max-h-[90vh]">
            <div className="flex justify-between items-center mb-2 border-b-2 border-slate-50 dark:border-ui-border pb-4 shrink-0">
              <h2 className="text-xl font-black font-syne text-slate-900 dark:text-brand-nacar flex items-center gap-2">
                <Link2 className="w-5 h-5 text-brand-cesped" /> Juntar Mesas
              </h2>
              <button
                onClick={() => {
                  setModalJuntar(false);
                  setSeleccionJuntar([]);
                }}
                className="text-slate-400 dark:text-ui-muted hover:text-brand-arrecife p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-xs font-bold text-slate-500 dark:text-ui-muted mb-4 shrink-0">
              Selecciona 2 o más mesas{' '}
              <span className="text-emerald-600 dark:text-brand-cesped">
                libres
              </span>{' '}
              para una reservación de grupo. Comparten una sola cuenta.
            </p>

            {/* Aviso de cuál será la principal */}
            {seleccionJuntar.length >= 2 && principalDeSeleccion && (
              <div className="mb-4 p-3 bg-emerald-50 dark:bg-brand-cesped/10 border-2 border-emerald-200 dark:border-brand-cesped/30 rounded-2xl flex items-center gap-3 shrink-0">
                <Link2 className="w-5 h-5 text-emerald-600 dark:text-brand-cesped shrink-0" />
                <p className="text-sm font-bold text-emerald-800 dark:text-brand-cesped">
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
                <p className="text-center text-slate-400 dark:text-ui-muted font-bold py-8">
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
                        className={`p-4 rounded-2xl border-2 text-left transition-all ${
                          sel
                            ? 'bg-emerald-50 dark:bg-brand-cesped/10 border-emerald-500 dark:border-brand-cesped'
                            : 'bg-white dark:bg-ui-obsidiana border-slate-200 dark:border-ui-border hover:border-slate-300 dark:hover:border-ui-muted'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-black text-slate-900 dark:text-brand-nacar">
                            {m.nombre}
                          </span>
                          {sel ? (
                            <CheckSquare className="w-4 h-4 text-emerald-500 dark:text-brand-cesped" />
                          ) : (
                            <Square className="w-4 h-4 text-slate-300 dark:text-ui-border" />
                          )}
                        </div>
                        <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-ui-muted">
                          {m.zona || 'Sin Área'} · Cap {m.capacidad}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="pt-6 border-t-2 border-slate-50 dark:border-ui-border flex gap-3 shrink-0">
              <button
                onClick={() => {
                  setModalJuntar(false);
                  setSeleccionJuntar([]);
                }}
                className="flex-1 py-4 bg-slate-100 dark:bg-ui-obsidiana text-slate-500 dark:text-ui-muted font-bold rounded-2xl border-2 border-transparent hover:border-slate-200 dark:hover:border-ui-border transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={ejecutarJuntar}
                disabled={seleccionJuntar.length < 2}
                className="flex-1 py-4 bg-brand-cesped hover:bg-[#00c98c] text-ui-obsidiana font-black rounded-2xl shadow-lg shadow-brand-cesped/20 active:scale-95 transition-all disabled:opacity-50"
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
        <div className="fixed inset-0 bg-slate-900/60 dark:bg-ui-obsidiana/80 backdrop-blur-md z-[100] flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white dark:bg-ui-humo rounded-[2.5rem] border-2 border-slate-100 dark:border-ui-border p-6 max-w-lg w-full shadow-2xl animate-in zoom-in-95 flex flex-col max-h-[90vh]">
            <div className="flex justify-between items-center mb-6 border-b-2 border-slate-50 dark:border-ui-border pb-4 shrink-0">
              <h2 className="text-xl font-black font-syne text-slate-900 dark:text-brand-nacar flex items-center gap-2">
                <UserCheck className="w-5 h-5 text-brand-amatista" /> Meseros
                por Zona
              </h2>
              <button
                onClick={() => setModalMeseros(false)}
                className="text-slate-400 dark:text-ui-muted hover:text-brand-arrecife p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 space-y-3">
              {zonasReales.length === 0 ? (
                <p className="text-center text-slate-400 dark:text-ui-muted font-bold py-8">
                  Crea mesas con zonas primero.
                </p>
              ) : (
                zonasReales.map((zona) => (
                  <div
                    key={zona}
                    className="flex items-center gap-4 bg-slate-50 dark:bg-ui-obsidiana border-2 border-slate-100 dark:border-ui-border p-4 rounded-2xl"
                  >
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <MapPin className="w-4 h-4 text-brand-amatista shrink-0" />
                      <span className="font-black text-slate-800 dark:text-brand-nacar truncate">
                        {zona}
                      </span>
                    </div>
                    <select
                      value={asignacionesZona[zona] || ''}
                      onChange={(e) => asignarMeseroAZona(zona, e.target.value)}
                      className="bg-white dark:bg-ui-humo border-2 border-slate-200 dark:border-ui-border text-slate-800 dark:text-brand-nacar font-bold px-3 py-2.5 rounded-xl outline-none focus:border-brand-amatista text-sm shrink-0"
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

            <div className="pt-6 border-t-2 border-slate-50 dark:border-ui-border shrink-0">
              <button
                onClick={() => setModalMeseros(false)}
                className="w-full py-4 bg-brand-amatista hover:bg-indigo-600 text-white dark:text-brand-nacar font-black rounded-2xl shadow-lg shadow-brand-amatista/20 active:scale-95 transition-all"
              >
                Listo
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── MODAL: TRASPASO DE CUENTAS ─── */}
      {modalTraspaso.show && (
        <div className="fixed inset-0 bg-slate-900/60 dark:bg-ui-obsidiana/80 backdrop-blur-md z-[100] flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white dark:bg-ui-humo rounded-[2.5rem] border-2 border-slate-100 dark:border-ui-border p-6 max-w-2xl w-full shadow-2xl animate-in zoom-in-95 flex flex-col max-h-[90vh]">
            <div className="flex justify-between items-center mb-6 border-b-2 border-slate-50 dark:border-ui-border pb-4 shrink-0">
              <h2 className="text-xl font-black font-syne text-slate-900 dark:text-brand-nacar flex items-center gap-2">
                <ArrowRightLeft className="w-5 h-5 text-rose-500 dark:text-brand-arrecife" />{' '}
                Traspaso de Cuentas
              </h2>
              <button
                onClick={() =>
                  setModalTraspaso({ show: false, mesaOrigen: null })
                }
                className="text-slate-400 dark:text-ui-muted hover:text-rose-500 dark:hover:text-brand-nacar p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 space-y-6">
              <div className="bg-slate-50 dark:bg-ui-obsidiana border-2 border-slate-100 dark:border-ui-border p-5 rounded-2xl">
                <label className="block text-[10px] font-black text-slate-500 dark:text-ui-muted uppercase tracking-widest mb-3">
                  Mover de{' '}
                  <span className="text-rose-500 dark:text-brand-arrecife">
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
                  className="w-full bg-white dark:bg-ui-humo border-2 border-slate-200 dark:border-ui-border text-slate-800 dark:text-brand-nacar font-bold px-4 py-3.5 rounded-xl outline-none focus:border-rose-500 dark:focus:border-brand-arrecife"
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
                  <label className="block text-[10px] font-black text-slate-500 dark:text-ui-muted uppercase tracking-widest">
                    Selecciona los productos a mover
                  </label>
                  <button
                    onClick={seleccionarTodoTraspaso}
                    className="text-[10px] font-black text-brand-amatista uppercase hover:underline"
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
                        className={`flex items-center gap-3 p-4 rounded-xl border-2 cursor-pointer transition-colors ${
                          formTraspaso.itemsSeleccionados.includes(idx)
                            ? 'bg-rose-50 dark:bg-brand-arrecife/10 border-rose-500 dark:border-brand-arrecife text-slate-900 dark:text-brand-nacar'
                            : 'bg-white dark:bg-ui-obsidiana border-slate-200 dark:border-ui-border text-slate-500 dark:text-ui-muted hover:border-slate-300 dark:hover:border-ui-muted'
                        }`}
                      >
                        {formTraspaso.itemsSeleccionados.includes(idx) ? (
                          <CheckSquare className="w-5 h-5 text-rose-500 dark:text-brand-arrecife" />
                        ) : (
                          <Square className="w-5 h-5" />
                        )}
                        <div className="flex-1 font-bold text-sm">
                          {item.cantidad}x {item.nombre}
                          {(item.cantidad_enviada || 0) > 0 && (
                            <span className="ml-2 text-[9px] font-black text-amber-600 dark:text-brand-ambar uppercase">
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

            <div className="pt-6 border-t-2 border-slate-50 dark:border-ui-border flex gap-3 shrink-0">
              <button
                onClick={() =>
                  setModalTraspaso({ show: false, mesaOrigen: null })
                }
                className="flex-1 py-4 bg-slate-100 dark:bg-ui-obsidiana text-slate-500 dark:text-ui-muted font-bold rounded-2xl border-2 border-transparent hover:border-slate-200 dark:hover:border-ui-border transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={ejecutarTraspaso}
                className="flex-1 py-4 bg-rose-500 hover:bg-rose-600 dark:bg-brand-arrecife dark:hover:bg-orange-600 text-white dark:text-ui-obsidiana font-black rounded-2xl shadow-lg shadow-rose-500/20 dark:shadow-brand-arrecife/20 transition-transform active:scale-95"
              >
                Ejecutar Traspaso
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── MODAL: CREAR / EDITAR MESA ─── */}
      {modalMesa.show && (
        <div className="fixed inset-0 bg-slate-900/60 dark:bg-ui-obsidiana/80 backdrop-blur-md z-[100] flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white dark:bg-ui-humo rounded-[2.5rem] border-2 border-slate-100 dark:border-ui-border p-6 max-w-md w-full shadow-2xl animate-in zoom-in-95">
            <div className="flex justify-between items-center mb-6 border-b-2 border-slate-50 dark:border-ui-border pb-4">
              <h2 className="text-xl font-black font-syne text-slate-900 dark:text-brand-nacar flex items-center gap-2">
                <LayoutGrid className="w-5 h-5 text-brand-amatista" />
                {modalMesa.mesa ? 'Editar Mesa y Área' : 'Añadir Nueva Mesa'}
              </h2>
              <button
                onClick={() => setModalMesa({ show: false, mesa: null })}
                className="text-slate-400 dark:text-ui-muted hover:text-brand-arrecife p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={guardarMesa} className="space-y-5">
              <div>
                <label className="block text-[10px] font-black text-slate-500 dark:text-ui-muted uppercase tracking-widest mb-2 pl-2">
                  Identificador
                </label>
                <input
                  type="text"
                  required
                  value={formDataMesa.nombre}
                  onChange={(e) =>
                    setFormDataMesa({ ...formDataMesa, nombre: e.target.value })
                  }
                  className="w-full bg-slate-50 dark:bg-ui-obsidiana border-2 border-slate-200 dark:border-ui-border text-slate-800 dark:text-brand-nacar font-bold px-4 py-3.5 rounded-2xl outline-none focus:border-brand-amatista"
                  placeholder="Ej: Mesa 1, VIP A..."
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-black text-slate-500 dark:text-ui-muted uppercase tracking-widest mb-2 pl-2">
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
                    className="w-full bg-slate-50 dark:bg-ui-obsidiana border-2 border-slate-200 dark:border-ui-border text-slate-800 dark:text-brand-nacar font-bold px-4 py-3.5 rounded-2xl outline-none focus:border-brand-amatista text-center"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-slate-500 dark:text-ui-muted uppercase tracking-widest mb-2 pl-2">
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
                    className="w-full bg-slate-50 dark:bg-ui-obsidiana border-2 border-slate-200 dark:border-ui-border text-slate-800 dark:text-brand-nacar font-bold px-4 py-3.5 rounded-2xl outline-none focus:border-brand-amatista"
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
                  className="flex-1 py-4 bg-slate-100 dark:bg-ui-obsidiana text-slate-500 dark:text-ui-muted font-bold rounded-2xl border-2 border-transparent hover:border-slate-200 dark:hover:border-ui-border transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 py-4 bg-brand-amatista hover:bg-indigo-600 text-white dark:text-brand-nacar font-black rounded-2xl shadow-lg shadow-brand-amatista/20 active:scale-95 transition-all"
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
        <div className="fixed inset-0 bg-slate-900/60 dark:bg-ui-obsidiana/80 backdrop-blur-md z-[110] flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white dark:bg-ui-humo rounded-[2.5rem] p-8 max-w-sm w-full shadow-2xl border-2 border-slate-100 dark:border-ui-border animate-in zoom-in-95">
            <div className="w-16 h-16 bg-indigo-100 dark:bg-brand-amatista/20 rounded-full flex items-center justify-center mx-auto mb-4">
              <BookMarked className="w-8 h-8 text-indigo-500 dark:text-brand-amatista" />
            </div>
            <h2 className="text-2xl font-black font-syne text-slate-900 dark:text-brand-nacar mb-1 text-center">
              Reservar {modalReservar.nombre}
            </h2>
            <p className="text-slate-500 dark:text-ui-muted font-bold text-xs mb-5 text-center">
              ¿A nombre de quién? Busca en el CRM o escribe libre. Todo es
              opcional.
            </p>

            <div className="space-y-3">
              <div className="flex items-center bg-slate-50 dark:bg-ui-obsidiana p-3 rounded-xl border border-slate-200 dark:border-ui-border">
                <Search className="w-4 h-4 text-slate-400 dark:text-ui-muted mx-2 shrink-0" />
                <input
                  type="text"
                  autoFocus
                  placeholder="Nombre o teléfono..."
                  value={reservaForm.clienteId ? reservaForm.nombre : reservaBusqueda}
                  onChange={(e) => {
                    setReservaBusqueda(e.target.value);
                    setReservaForm((p) => ({
                      ...p,
                      nombre: e.target.value,
                      clienteId: null,
                    }));
                  }}
                  className="w-full bg-transparent font-black text-slate-900 dark:text-brand-nacar outline-none"
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
                    className="p-1 text-slate-400 hover:text-rose-500"
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
                      className="w-full flex justify-between items-center bg-slate-50 dark:bg-ui-obsidiana hover:bg-indigo-50 dark:hover:bg-brand-amatista/10 border border-slate-100 dark:border-ui-border rounded-xl px-4 py-2.5 transition-colors text-left"
                    >
                      <span className="font-black text-slate-800 dark:text-brand-nacar truncate">
                        {c.nombre}
                      </span>
                      <span className="text-[10px] font-bold text-slate-400 dark:text-ui-muted shrink-0 ml-2">
                        {c.telefono || 'CRM'}
                      </span>
                    </button>
                  ))}
                </div>
              )}
              <div className="flex items-center bg-slate-50 dark:bg-ui-obsidiana p-3 rounded-xl border border-slate-200 dark:border-ui-border">
                <Clock className="w-4 h-4 text-slate-400 dark:text-ui-muted mx-2 shrink-0" />
                <input
                  type="time"
                  value={reservaForm.hora}
                  onChange={(e) =>
                    setReservaForm((p) => ({ ...p, hora: e.target.value }))
                  }
                  className="w-full bg-transparent font-black text-slate-900 dark:text-brand-nacar outline-none"
                />
              </div>
            </div>

            <div className="flex flex-col gap-3 mt-6">
              <button
                onClick={confirmarReserva}
                className="w-full bg-indigo-500 dark:bg-brand-amatista hover:bg-indigo-600 text-white dark:text-ui-obsidiana py-4 rounded-xl font-black uppercase tracking-widest shadow-lg shadow-indigo-500/30 dark:shadow-brand-amatista/20 transition-transform active:scale-95"
              >
                Reservar
              </button>
              <button
                onClick={() => setModalReservar(null)}
                className="w-full bg-slate-100 dark:bg-ui-obsidiana hover:bg-slate-200 dark:hover:bg-ui-border text-slate-600 dark:text-brand-nacar py-4 rounded-xl font-bold transition-colors"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: ¿ocupar mesa reservada? */}
      {modalReserva && (
        <div className="fixed inset-0 bg-slate-900/60 dark:bg-ui-obsidiana/80 backdrop-blur-md z-[110] flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white dark:bg-ui-humo rounded-[2.5rem] p-8 max-w-sm w-full shadow-2xl text-center border-2 border-slate-100 dark:border-ui-border animate-in zoom-in-95">
            <div className="w-20 h-20 bg-indigo-100 dark:bg-brand-amatista/20 rounded-full flex items-center justify-center mx-auto mb-6">
              <BookMarked className="w-10 h-10 text-indigo-500 dark:text-brand-amatista" />
            </div>
            <h2 className="text-2xl font-black font-syne text-slate-900 dark:text-brand-nacar mb-2">
              {modalReserva.nombre} está reservada
            </h2>
            {modalReserva.reserva?.nombre && (
              <p className="text-indigo-600 dark:text-brand-amatista font-black text-sm mb-2 flex items-center justify-center gap-2">
                <BookMarked className="w-4 h-4" />
                {modalReserva.reserva.nombre}
                {modalReserva.reserva.hora
                  ? ` · ${modalReserva.reserva.hora}`
                  : ''}
              </p>
            )}
            <p className="text-slate-500 dark:text-ui-muted font-bold text-sm mb-8">
              ¿Llegó el cliente? Al confirmar, la mesa se ocupa y podrás
              comandar.
            </p>
            <div className="flex flex-col gap-3">
              <button
                onClick={confirmarOcuparReservada}
                className="w-full bg-indigo-500 dark:bg-brand-amatista hover:bg-indigo-600 text-white dark:text-ui-obsidiana py-4 rounded-xl font-black uppercase tracking-widest shadow-lg shadow-indigo-500/30 dark:shadow-brand-amatista/20 transition-transform active:scale-95"
              >
                Sí, ocupar y comandar
              </button>
              <button
                onClick={() => setModalReserva(null)}
                className="w-full bg-slate-100 dark:bg-ui-obsidiana hover:bg-slate-200 dark:hover:bg-ui-border text-slate-600 dark:text-brand-nacar py-4 rounded-xl font-bold transition-colors"
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
