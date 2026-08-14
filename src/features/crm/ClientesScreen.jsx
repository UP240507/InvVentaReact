import { useState, useMemo } from 'react';
import { useAppStore } from '../../store/useAppStore';
import {
  PageShell,
  PageHeader,
  Button,
  Chip,
  EmptyState,
  SearchField,
  SegmentedControl,
  IconButton,
  DataTable,
} from '../../components/ui';
import { useSyncStore } from '../../store/useSyncStore';
import { localDB } from '../../store/localDB';
import {
  Users,
  Plus,
  Search,
  Edit3,
  Trash2,
  X,
  Phone,
  Mail,
  Cake,
  Star,
  Heart,
  MessageSquare,
  ArchiveRestore,
  Ban,
  Save,
  Receipt,
  History,
} from 'lucide-react';

// ¿El cliente cumple años este mes? (cumpleanos = 'YYYY-MM-DD' del input date)
const cumpleEsteMes = (cumpleanos) => {
  if (!cumpleanos || typeof cumpleanos !== 'string') return false;
  const mes = cumpleanos.slice(5, 7);
  const mesActual = String(new Date().getMonth() + 1).padStart(2, '0');
  return mes === mesActual;
};

export default function CrmScreen() {
  const { clientes, ventas, showToast } = useAppStore();
  const { enqueueAction } = useSyncStore();

  const [busqueda, setBusqueda] = useState('');
  const [filtroEstado, setFiltroEstado] = useState('Activos');
  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState(null);
  const [itemAEliminar, setItemAEliminar] = useState(null);
  // Panel de detalle: historial de consumo + stats del cliente.
  const [detalleCliente, setDetalleCliente] = useState(null);

  const [form, setForm] = useState({
    nombre: '',
    telefono: '',
    email: '',
    cumpleanos: '',
    preferencias: '',
    rfc: '',
    razon_social: '',
  });

  // Historial del cliente en detalle: ventas de RAM/Dexie con su cliente_id
  // (la asociación nace en ModalCobro y viaja en nuevaVentaBD).
  const historialDetalle = useMemo(() => {
    if (!detalleCliente) return [];
    return (ventas || [])
      .filter((v) => String(v.cliente_id) === String(detalleCliente.id))
      .sort((a, b) => new Date(b.fecha) - new Date(a.fecha))
      .slice(0, 30);
  }, [ventas, detalleCliente]);

  // El detalle debe reflejar la acumulación EN VIVO (eco realtime de clientes):
  // leemos la versión fresca del store, no el snapshot del click.
  const clienteVivo = useMemo(() => {
    if (!detalleCliente) return null;
    return (
      (clientes || []).find(
        (c) => String(c.id) === String(detalleCliente.id),
      ) || detalleCliente
    );
  }, [clientes, detalleCliente]);

  // 🌟 FIX: FUNCIÓN DESTRUCTORA DE DUPLICADOS (Asegura unicidad por ID)
  const upsertClienteLocal = (payload) => {
    useAppStore.setState((prev) => {
      // Barremos el arreglo para destruir cualquier clon fantasma que tenga este mismo ID
      const clientesLimpios = (prev.clientes || []).filter(
        (c) => String(c.id) !== String(payload.id),
      );
      // Insertamos la versión actualizada
      return { clientes: [payload, ...clientesLimpios] };
    });
  };

  const listaFiltrada = useMemo(() => {
    return (clientes || [])
      .filter((c) => {
        const matchEstado =
          filtroEstado === 'Activos' ? c.activo !== false : c.activo === false;
        const term = busqueda.toLowerCase();
        const matchBusqueda =
          (c.nombre || '').toLowerCase().includes(term) ||
          (c.telefono || '').toLowerCase().includes(term);
        return matchEstado && matchBusqueda;
      })
      .sort((a, b) => (b.total_gastado || 0) - (a.total_gastado || 0));
  }, [clientes, busqueda, filtroEstado]);

  const abrirNuevo = () => {
    setForm({
      nombre: '',
      telefono: '',
      email: '',
      cumpleanos: '',
      preferencias: '',
      rfc: '',
      razon_social: '',
    });
    setEditId(null);
    setShowModal(true);
  };

  const abrirEditar = (c) => {
    setForm({
      ...c,
      email: c.email || '',
      cumpleanos: c.cumpleanos || '',
      preferencias: c.preferencias || '',
      rfc: c.rfc || '',
      razon_social: c.razon_social || '',
    });
    setEditId(c.id);
    setShowModal(true);
  };

  const guardar = (e) => {
    e.preventDefault();
    if (!form.nombre.trim())
      return showToast('El nombre es obligatorio', 'error');

    // ANTI-CLOBBER de contadores: el form trae visitas/total_gastado/puntos
    // congelados de cuando se abrió el modal — si otra terminal (o la RPC)
    // acumuló mientras tanto, mandarlos PISARÍA los valores frescos. En
    // EDICIÓN el payload remoto NO lleva contadores (el upsert de PostgREST
    // solo escribe las columnas presentes → los contadores del server quedan
    // intactos); en ALTA arrancan en 0.
    const formLimpio = { ...form };
    delete formLimpio.estado; // propiedad basura legada
    delete formLimpio.visitas;
    delete formLimpio.total_gastado;
    delete formLimpio.puntos_lealtad;

    const payload = {
      ...formLimpio,
      id: editId || Date.now(),
      activo: true,
      ...(editId ? {} : { visitas: 0, total_gastado: 0, puntos_lealtad: 0 }),
    };

    enqueueAction('clientes', 'upsert', payload);
    // Local (RAM + Dexie): fusionar con el registro VIVO para conservar los
    // contadores actuales (el eco realtime después trae la verdad del server).
    const vivo = (clientes || []).find(
      (c) => String(c.id) === String(payload.id),
    );
    const fusionado = { ...(vivo || {}), ...payload };
    upsertClienteLocal(fusionado);
    localDB.clientes.put(fusionado).catch(() => {});

    setShowModal(false);
    showToast(editId ? 'Perfil actualizado' : 'Cliente registrado', 'success');
  };

  const toggleEstado = (c) => {
    const { estado, ...clienteLimpio } = c;

    const nuevoEstado = clienteLimpio.activo === false ? true : false;
    const payload = { ...clienteLimpio, activo: nuevoEstado };

    enqueueAction('clientes', 'upsert', payload);
    upsertClienteLocal(payload); // 🌟 Usamos nuestra función local blindada

    showToast(
      `${payload.nombre} ${nuevoEstado ? 'activado' : 'bloqueado'}`,
      'info',
    );
  };

  const eliminarDefinitivo = () => {
    if (!itemAEliminar) return;
    enqueueAction('clientes', 'delete', itemAEliminar);

    useAppStore.setState((prev) => ({
      clientes: (prev.clientes || []).filter(
        (c) => String(c.id) !== String(itemAEliminar.id),
      ),
    }));

    showToast('Cliente borrado de la base de datos', 'success');
    setItemAEliminar(null);
  };

  // ── Cartera en tabla ────────────────────────────────────────────────────
  // El CRM se usa para PREGUNTAR: quién gasta más, quién no vuelve, quién está
  // cerca de canjear. Eso es ordenar y comparar, y en tarjetas no se puede.
  // El detalle rico (historial de consumo, stats en vivo) sigue existiendo:
  // se abre con Enter o con clic, en su panel.
  const columnas = [
    {
      id: 'cliente',
      titulo: 'Cliente',
      celda: (c) => {
        const esVIP = Number(c.total_gastado) > 5000 || Number(c.visitas) > 10;
        return (
          <div className="flex items-center gap-3 min-w-0">
            <div
              className={`w-9 h-9 rounded-ui flex items-center justify-center font-bold shrink-0 ${
                c.activo === false
                  ? 'bg-adm-danger/10 text-adm-danger'
                  : esVIP
                    ? 'bg-adm-warn text-adm-warn-fg'
                    : 'bg-adm-chip text-adm-chip-fg'
              }`}
            >
              {(c.nombre && c.nombre[0].toUpperCase()) || '?'}
            </div>
            <div className="min-w-0">
              <p className="font-bold text-adm-ink truncate">
                {c.nombre || 'Sin nombre'}
              </p>
              <p className="text-xs text-adm-muted truncate">
                {c.telefono || c.email || '—'}
              </p>
            </div>
          </div>
        );
      },
    },
    {
      id: 'estado',
      titulo: '',
      ancho: '1%',
      celda: (c) => {
        const esVIP = Number(c.total_gastado) > 5000 || Number(c.visitas) > 10;
        if (c.activo === false) return <Chip tono="peligro">Bloqueado</Chip>;
        return esVIP ? <Chip tono="alerta">VIP</Chip> : null;
      },
    },
    {
      id: 'visitas',
      titulo: 'Visitas',
      alinear: 'der',
      ancho: '1%',
      celda: (c) => (
        <span className="text-adm-muted">{Number(c.visitas) || 0}</span>
      ),
    },
    {
      id: 'gastado',
      titulo: 'Total gastado',
      alinear: 'der',
      ancho: '1%',
      celda: (c) => (
        <span className="font-bold text-adm-ink">
          $
          {Number(c.total_gastado || 0).toLocaleString('es-MX', {
            minimumFractionDigits: 2,
          })}
        </span>
      ),
    },
    {
      id: 'puntos',
      titulo: 'Puntos',
      alinear: 'der',
      ancho: '1%',
      celda: (c) => (
        <span className="text-adm-muted">{Number(c.puntos) || 0}</span>
      ),
    },
    {
      id: 'acciones',
      titulo: '',
      alinear: 'der',
      ancho: '1%',
      celda: (c) => (
        <div className="flex justify-end gap-1">
          <IconButton
            icono={Edit3}
            titulo="Editar"
            onClick={(e) => {
              e.stopPropagation();
              abrirEditar(c);
            }}
          />
          <IconButton
            icono={c.activo === false ? ArchiveRestore : Ban}
            titulo={c.activo === false ? 'Reactivar' : 'Bloquear'}
            onClick={(e) => {
              e.stopPropagation();
              toggleEstado(c);
            }}
          />
          <IconButton
            icono={Trash2}
            titulo="Eliminar definitivamente"
            className="hover:text-adm-danger"
            onClick={(e) => {
              e.stopPropagation();
              setItemAEliminar(c);
            }}
          />
        </div>
      ),
    },
  ];

  return (
    <PageShell>
      <PageHeader
        icono={Heart}
        titulo="CRM y Lealtad"
        descripcion="Base de datos y retención de clientes"
        scopeAtajos="tabla-clientes"
        acciones={
          <Button icono={Plus} onClick={abrirNuevo}>
            Nuevo cliente
          </Button>
        }
      />

      <div className="flex flex-col md:flex-row gap-3 mb-4">
        <SearchField
          icono={Search}
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar por nombre o teléfono…"
          className="flex-1 max-w-md"
        />
        <SegmentedControl
          valor={filtroEstado}
          onChange={setFiltroEstado}
          opciones={[
            { id: 'Activos', label: 'Cartera activa' },
            { id: 'Inactivos', label: 'Bloqueados' },
          ]}
        />
      </div>

      <DataTable
        scope="tabla-clientes"
        titulo="Cartera de clientes"
        columnas={columnas}
        filas={listaFiltrada}
        // Enter abre el PANEL de detalle, no el formulario: en CRM lo que se
        // quiere ver primero es el historial, no editar el teléfono.
        onEditar={setDetalleCliente}
        onNuevo={abrirNuevo}
        activo={!showModal && !detalleCliente && !itemAEliminar}
        vacio={
          <EmptyState
            icono={Users}
            titulo="Sin resultados"
            descripcion="No hay clientes que coincidan con la búsqueda."
            accion={
              filtroEstado === 'Activos' ? (
                <Button icono={Plus} onClick={abrirNuevo}>
                  Registrar el primero
                </Button>
              ) : null
            }
          />
        }
      />

      {/* MODAL FORMULARIO */}
      {showModal && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-adm-ink/60 dark:bg-adm-bg/80 backdrop-blur-md animate-in fade-in">
          <div className="bg-white dark:bg-adm-panel rounded-ui-lg w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90dvh] border-2 border-adm-border animate-in zoom-in-95 duration-media transition-colors">
            <div className="p-8 border-b border-adm-border flex justify-between items-center bg-adm-bg transition-colors">
              <div className="flex items-center gap-4">
                <div className="bg-adm-danger p-3 rounded-ui shadow-lg shadow-adm-danger/30">
                  <Heart className="w-6 h-6 text-adm-bg" />
                </div>
                <div>
                  <h3 className="text-2xl font-black font-syne text-adm-ink leading-tight">
                    {editId ? 'Perfil de Cliente' : 'Nuevo Cliente'}
                  </h3>
                  <p className="text-sm font-bold text-adm-muted">
                    Datos y preferencias de servicio
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowModal(false)}
                className="text-adm-muted hover:text-adm-danger p-2 transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
              <form id="formCrm" onSubmit={guardar} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2 md:col-span-2">
                    <label className="text-xs font-black text-adm-muted uppercase tracking-widest px-2">
                      Nombre Completo *
                    </label>
                    <input
                      type="text"
                      required
                      value={form.nombre}
                      onChange={(e) =>
                        setForm({ ...form, nombre: e.target.value })
                      }
                      placeholder="Ej. Mariana Ríos"
                      className="w-full px-6 py-4 bg-adm-bg border-2 border-adm-field rounded-ui-lg font-black text-adm-ink focus:border-adm-danger dark:focus:border-adm-info outline-none transition-all"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-black text-adm-muted uppercase tracking-widest px-2">
                      Teléfono (WhatsApp)
                    </label>
                    <input
                      type="tel"
                      value={form.telefono}
                      onChange={(e) =>
                        setForm({ ...form, telefono: e.target.value })
                      }
                      placeholder="000 000 0000"
                      className="w-full px-6 py-4 bg-adm-bg border-2 border-adm-field rounded-ui-lg font-bold text-adm-ink outline-none focus:border-adm-danger dark:focus:border-adm-info transition-all"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-black text-adm-muted uppercase tracking-widest px-2">
                      Cumpleaños
                    </label>
                    <input
                      type="date"
                      value={form.cumpleanos}
                      onChange={(e) =>
                        setForm({ ...form, cumpleanos: e.target.value })
                      }
                      className="w-full px-6 py-4 bg-adm-bg border-2 border-adm-field rounded-ui-lg font-bold text-adm-muted outline-none focus:border-adm-danger dark:focus:border-adm-info transition-all"
                    />
                  </div>

                  <div className="space-y-2 md:col-span-2">
                    <label className="text-xs font-black text-adm-muted uppercase tracking-widest px-2">
                      Correo Electrónico
                    </label>
                    <input
                      type="email"
                      value={form.email}
                      onChange={(e) =>
                        setForm({ ...form, email: e.target.value })
                      }
                      placeholder="cliente@correo.com"
                      className="w-full px-6 py-4 bg-adm-bg border-2 border-adm-field rounded-ui-lg font-bold text-adm-ink outline-none focus:border-adm-danger dark:focus:border-adm-info transition-all"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-black text-adm-muted uppercase tracking-widest px-2">
                      RFC (facturación)
                    </label>
                    <input
                      type="text"
                      value={form.rfc}
                      onChange={(e) =>
                        setForm({ ...form, rfc: e.target.value.toUpperCase() })
                      }
                      placeholder="XAXX010101000"
                      maxLength={13}
                      className="w-full px-6 py-4 bg-adm-bg border-2 border-adm-field rounded-ui-lg font-bold text-adm-ink outline-none focus:border-adm-danger dark:focus:border-adm-info transition-all uppercase"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-black text-adm-muted uppercase tracking-widest px-2">
                      Razón Social
                    </label>
                    <input
                      type="text"
                      value={form.razon_social}
                      onChange={(e) =>
                        setForm({ ...form, razon_social: e.target.value })
                      }
                      placeholder="Como aparece en su CSF"
                      className="w-full px-6 py-4 bg-adm-bg border-2 border-adm-field rounded-ui-lg font-bold text-adm-ink outline-none focus:border-adm-danger dark:focus:border-adm-info transition-all"
                    />
                  </div>

                  <div className="space-y-2 md:col-span-2">
                    <label
                      className="text-xs font-black text-adm-muted dark:text-adm-muted uppercase t
acking-widest px-2 flex justify-between"
                    >
                      <span>Preferencias y Notas</span>
                      <span className="text-adm-danger">
                        Alergias, mesa favorita, etc.
                      </span>
                    </label>
                    <textarea
                      rows="3"
                      value={form.preferencias}
                      onChange={(e) =>
                        setForm({ ...form, preferencias: e.target.value })
                      }
                      placeholder="Ej. Alérgico a los mariscos. Siempre pide hielo extra."
                      className="w-full px-6 py-4 bg-adm-bg border-2 border-adm-field rounded-ui-lg font-bold text-adm-ink outline-none focus:border-adm-danger dark:focus:border-adm-info transition-all resize-none"
                    />
                  </div>
                </div>
              </form>
            </div>

            <div className="p-6 border-t border-adm-border bg-adm-bg flex gap-4 transition-colors">
              <button
                onClick={() => setShowModal(false)}
                className="flex-1 py-4 bg-white dark:bg-adm-panel border-2 border-adm-border text-adm-muted dark:text-adm-ink font-black rounded-ui transition-all active:scale-95"
              >
                Cancelar
              </button>
              <button
                type="submit"
                form="formCrm"
                className="flex-1 py-4 bg-adm-ink dark:bg-adm-danger text-adm-danger-fg font-black rounded-ui shadow-xl shadow-adm-border/20 dark:shadow-adm-danger/30 hover:scale-105 active:scale-95 transition-all"
              >
                <Save className="w-5 h-5 inline mr-2" />{' '}
                {editId ? 'Guardar Cambios' : 'Registrar Cliente'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PANEL DE DETALLE: stats en vivo + historial de consumo */}
      {clienteVivo && (
        <div
          className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-adm-ink/60 dark:bg-adm-bg/80 backdrop-blur-md animate-in fade-in"
          onClick={() => setDetalleCliente(null)}
        >
          <div
            className="bg-white dark:bg-adm-panel rounded-ui-lg w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90dvh] border-2 border-adm-border animate-in zoom-in-95 duration-media transition-colors"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-8 border-b border-adm-border flex justify-between items-center bg-adm-bg transition-colors">
              <div className="flex items-center gap-4 min-w-0">
                <div className="w-14 h-14 rounded-ui flex items-center justify-center font-black text-xl shrink-0 bg-adm-danger/10 text-adm-danger shadow-inner">
                  {(clienteVivo.nombre || '?')[0].toUpperCase()}
                </div>
                <div className="min-w-0">
                  <h3 className="text-2xl font-black font-syne text-adm-ink leading-tight truncate">
                    {clienteVivo.nombre}
                  </h3>
                  <p className="text-sm font-bold text-adm-muted flex items-center gap-2 flex-wrap">
                    {clienteVivo.telefono && (
                      <span className="flex items-center gap-1">
                        <Phone className="w-3.5 h-3.5" /> {clienteVivo.telefono}
                      </span>
                    )}
                    {clienteVivo.email && (
                      <span className="flex items-center gap-1">
                        <Mail className="w-3.5 h-3.5" /> {clienteVivo.email}
                      </span>
                    )}
                    {cumpleEsteMes(clienteVivo.cumpleanos) && (
                      <span className="flex items-center gap-1 text-adm-danger">
                        <Cake className="w-3.5 h-3.5" /> ¡Cumple este mes!
                      </span>
                    )}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setDetalleCliente(null)}
                className="text-adm-muted hover:text-adm-danger p-2 transition-colors shrink-0"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-8 custom-scrollbar space-y-6">
              {/* Stats reales (alimentadas por la RPC, eco realtime en vivo) */}
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-adm-bg p-4 rounded-ui border border-adm-border text-center">
                  <p className="text-[9px] font-black text-adm-muted uppercase tracking-wider mb-1">
                    Visitas
                  </p>
                  <p className="text-2xl font-black text-adm-ink">
                    {Number(clienteVivo.visitas) || 0}
                  </p>
                </div>
                <div className="bg-adm-bg p-4 rounded-ui border border-adm-border text-center">
                  <p className="text-[9px] font-black text-adm-muted uppercase tracking-wider mb-1">
                    Total Gastado
                  </p>
                  <p className="text-2xl font-black text-adm-ink">
                    $
                    {Number(clienteVivo.total_gastado || 0).toLocaleString(
                      'es-MX',
                      { minimumFractionDigits: 2 },
                    )}
                  </p>
                </div>
                <div className="bg-adm-warn/10 p-4 rounded-ui border border-adm-warn/30 text-center">
                  <p className="text-[9px] font-black text-adm-warn uppercase tracking-wider mb-1 flex items-center justify-center gap-1">
                    <Star className="w-3 h-3" /> Puntos
                  </p>
                  <p className="text-2xl font-black text-adm-warn">
                    {Number(clienteVivo.puntos_lealtad) || 0}
                  </p>
                </div>
              </div>

              {(clienteVivo.rfc || clienteVivo.razon_social) && (
                <div className="bg-adm-bg p-4 rounded-ui border border-adm-border">
                  <p className="text-[9px] font-black text-adm-muted uppercase tracking-wider mb-1 flex items-center gap-1.5">
                    <Receipt className="w-3.5 h-3.5" /> Datos de facturación
                  </p>
                  <p className="font-black text-adm-ink text-sm">
                    {clienteVivo.razon_social || '—'}
                  </p>
                  <p className="font-bold text-adm-muted text-xs uppercase">
                    {clienteVivo.rfc || 'Sin RFC'}
                  </p>
                </div>
              )}

              {clienteVivo.preferencias && (
                <div className="flex items-start gap-3 text-xs font-bold text-adm-danger bg-adm-danger/50 border border-adm-danger/30 px-4 py-3 rounded-ui">
                  <MessageSquare className="w-4 h-4 text-adm-danger shrink-0 mt-0.5" />
                  <span>{clienteVivo.preferencias}</span>
                </div>
              )}

              {/* Historial de consumo (ventas locales con cliente_id) */}
              <div>
                <p className="text-xs font-black text-adm-muted uppercase tracking-widest mb-3 flex items-center gap-2">
                  <History className="w-4 h-4" /> Historial de consumo
                </p>
                {historialDetalle.length === 0 ? (
                  <p className="text-sm font-bold text-adm-muted bg-adm-bg rounded-ui border border-dashed border-adm-border p-6 text-center">
                    Sin ventas asociadas en este dispositivo todavía. Asocia al
                    cliente desde el cobro en el POS.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {historialDetalle.map((v) => (
                      <div
                        key={v.id}
                        className="flex justify-between items-center bg-adm-bg rounded-ui border border-adm-border px-4 py-3"
                      >
                        <div>
                          <p className="font-black text-adm-ink text-sm">
                            {v.folio}
                          </p>
                          <p className="text-[10px] font-bold text-adm-muted">
                            {v.fecha
                              ? new Date(v.fecha).toLocaleString('es-MX', {
                                  dateStyle: 'medium',
                                  timeStyle: 'short',
                                })
                              : ''}
                            {v.metodo_pago ? ` · ${v.metodo_pago}` : ''}
                          </p>
                        </div>
                        <p className="font-black text-adm-ink">
                          $
                          {Number(v.total || 0).toLocaleString('es-MX', {
                            minimumFractionDigits: 2,
                          })}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="p-6 border-t border-adm-border bg-adm-bg flex gap-4 transition-colors">
              <button
                onClick={() => setDetalleCliente(null)}
                className="flex-1 py-4 bg-white dark:bg-adm-panel border-2 border-adm-border text-adm-muted dark:text-adm-ink font-black rounded-ui transition-all active:scale-95"
              >
                Cerrar
              </button>
              <button
                onClick={() => {
                  const c = clienteVivo;
                  setDetalleCliente(null);
                  abrirEditar(c);
                }}
                className="flex-1 py-4 bg-adm-ink dark:bg-adm-danger text-adm-danger-fg font-black rounded-ui shadow-xl transition-all active:scale-95 flex items-center justify-center gap-2"
              >
                <Edit3 className="w-5 h-5" /> Editar perfil
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL ELIMINAR */}
      {itemAEliminar && (
        <div className="fixed inset-0 bg-adm-ink/80 dark:bg-adm-bg/90 backdrop-blur-md z-[160] flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white dark:bg-adm-panel rounded-ui-lg w-full max-w-sm p-10 text-center shadow-2xl border-2 border-adm-border animate-in zoom-in-95 transition-colors">
            <div className="w-20 h-20 bg-adm-danger/10 text-adm-danger rounded-ui-lg flex items-center justify-center mx-auto mb-8 shadow-inner border border-adm-danger/30">
              <Trash2 className="w-10 h-10" />
            </div>
            <h2 className="text-2xl font-black font-syne text-adm-ink mb-3 tracking-tight">
              ¿Eliminar Cliente?
            </h2>
            <p className="text-adm-muted font-bold mb-10 leading-relaxed text-sm">
              Se perderán sus puntos y su historial de vida. Se recomienda solo
              Bloquearlo.
            </p>
            <div className="flex gap-4">
              <button
                onClick={() => setItemAEliminar(null)}
                className="flex-1 py-4 bg-adm-chip dark:bg-adm-bg text-adm-muted dark:text-adm-ink border border-transparent dark:border-adm-border font-black rounded-ui transition-all"
              >
                Cancelar
              </button>
              <button
                onClick={eliminarDefinitivo}
                className="flex-1 py-4 bg-adm-danger dark:hover:bg-adm-warn text-adm-danger-fg font-black rounded-ui shadow-xl transition-all"
              >
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}
    </PageShell>
  );
}
