import { useState, useMemo, useEffect } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { useSyncStore } from '../../store/useSyncStore';
import { useAuthStore } from '../auth/useAuthStore';
import {
  ShoppingCart,
  Search,
  FileText,
  PlusCircle,
  MinusCircle,
  Truck,
  Calculator,
  Clock,
  CheckCircle,
  XCircle,
  Printer,
  ChevronRight,
  Inbox,
  ChevronLeft,
  MessageCircle,
  Mail,
  Send,
  Trash2,
  X,
} from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';

export default function ComprasScreen() {
  const {
    ordenesCompra,
    productos,
    proveedores,
    showToast,
    configuracion,
    registrarAuditoria,
  } = useAppStore();
  const { enqueueAction } = useSyncStore();
  const { user } = useAuthStore();
  const location = useLocation();
  const navigate = useNavigate();

  // ─── ESTADOS DE NAVEGACIÓN Y FILTROS ──────────────────────────────────
  const [activeTab, setActiveTab] = useState('historial');
  const [busqueda, setBusqueda] = useState('');
  const [filtroEstado, setFiltroEstado] = useState('Todos');

  // WIZARD STATES (CREACIÓN DE ORDEN)
  const [proveedorSeleccionado, setProveedorSeleccionado] = useState(null);
  const [carrito, setCarrito] = useState([]);
  const [referencia, setReferencia] = useState('');
  const [itemSeleccionado, setItemSeleccionado] = useState('');
  const [cantidadItem, setCantidadItem] = useState('');
  const [costoItem, setCostoItem] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [ordenExitosa, setOrdenExitosa] = useState(null);

  // Inyección para venir desde Alertas de Stock del Dashboard
  useEffect(() => {
    if (location.state?.preselectedProveedor) {
      setActiveTab('crear');
      setProveedorSeleccionado(location.state.preselectedProveedor);
      navigate(location.pathname, { replace: true });
    }
  }, [location, navigate]);

  // ─── MOTORES DE CÁLCULO ───────────────────────────────────────────────
  const tasaIva = configuracion?.iva || 0.16;

  const ordenesFiltradas = useMemo(() => {
    return (ordenesCompra || [])
      .filter((o) => {
        const term = busqueda.toLowerCase();
        const matchBusqueda =
          (o.numero || '').toLowerCase().includes(term) ||
          (o.proveedor || '').toLowerCase().includes(term);
        const matchEstado =
          filtroEstado === 'Todos' || o.estado === filtroEstado;
        return matchBusqueda && matchEstado;
      })
      .sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
  }, [ordenesCompra, busqueda, filtroEstado]);

  const { subtotal, ivaMonto, total } = useMemo(() => {
    const sub = carrito.reduce(
      (acc, item) => acc + Number(item.cantidad) * Number(item.precio_unitario),
      0,
    );
    const imp = sub * tasaIva;
    return { subtotal: sub, ivaMonto: imp, total: sub + imp };
  }, [carrito, tasaIva]);

  // ─── MANEJADORES DE CARRITO ──────────────────────────────────────────
  const handleSelectProducto = (e) => {
    const idProd = e.target.value;
    setItemSeleccionado(idProd);
    const prod = (productos || []).find((p) => String(p.id) === String(idProd));
    if (prod) setCostoItem(prod.precio || '');
  };

  const agregarAlCarrito = (e) => {
    e.preventDefault();
    if (!itemSeleccionado || !cantidadItem || Number(cantidadItem) <= 0) {
      return showToast('Selecciona un producto y cantidad válida', 'error');
    }

    setCarrito((prev) => {
      const itemsClone = [...prev];
      const index = itemsClone.findIndex(
        (i) => String(i.id_producto) === String(itemSeleccionado),
      );
      if (index !== -1) {
        itemsClone[index].cantidad += Number(cantidadItem);
        itemsClone[index].precio_unitario = Number(costoItem) || 0;
      } else {
        itemsClone.push({
          id_producto: itemSeleccionado,
          cantidad: Number(cantidadItem),
          precio_unitario: Number(costoItem) || 0,
        });
      }
      return itemsClone;
    });

    setItemSeleccionado('');
    setCantidadItem('');
    setCostoItem('');
  };

  const removerDelCarrito = (id) => {
    setCarrito((prev) =>
      prev.filter((i) => String(i.id_producto) !== String(id)),
    );
  };

  // ─── ACCIONES TRANSACCIONALES ────────────────────────────────────────
  const generarOrden = async () => {
    if (carrito.length === 0)
      return showToast('El carrito está vacío', 'error');

    // CRÍTICO (RLS tenant_ordenes_compra estricto): sin restaurante_id el insert
    // se rechaza en silencio → la OC aparece en RAM y desaparece al recargar.
    const restauranteId = useAuthStore.getState().restauranteId;
    if (!restauranteId)
      return showToast(
        'No se pudo identificar el restaurante. Recarga la sesión.',
        'error',
      );

    setIsSubmitting(true);

    const date = new Date();
    const folio = `OC-${date.getFullYear().toString().slice(-2)}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}-${Math.floor(1000 + Math.random() * 9000)}`;

    const nuevaOrden = {
      id: Date.now(),
      numero: folio,
      proveedor: proveedorSeleccionado.nombre,
      fecha: date.toISOString(),
      estado: 'pendiente',
      total: total,
      subtotal: subtotal,
      iva: ivaMonto,
      items: carrito,
      referencia: referencia || 'Orden manual',
      usuario: user?.nombre || 'Administrador',
      restaurante_id: restauranteId,
    };

    try {
      // upsert (no insert): idempotente si la cola reintenta offline; un insert
      // reintentado duplicaría la OC con el mismo id.
      enqueueAction('ordenes_compra', 'upsert', nuevaOrden);
      useAppStore.setState((prev) => ({
        ordenesCompra: [nuevaOrden, ...(prev.ordenesCompra || [])],
      }));

      registrarAuditoria({
        id: Date.now(),
        fecha: new Date().toISOString(),
        usuario: user?.nombre || 'Sistema',
        accion: 'EMISIÓN_OC',
        modulo: 'COMPRAS',
        nivel: 'info',
        detalles: `Folio ${folio} generado para ${nuevaOrden.proveedor}. Total: $${total}`,
      });

      setOrdenExitosa(nuevaOrden);
    } catch (error) {
      showToast('Error al generar la orden.', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const cancelarOrden = (orden) => {
    if (!window.confirm(`¿Estás seguro de cancelar la orden ${orden.numero}?`))
      return;

    const payload = { ...orden, estado: 'cancelada' };

    // upsert hacia ordenes_compra (orden ya trae restaurante_id desde el store).
    enqueueAction('ordenes_compra', 'upsert', payload);
    useAppStore.setState((prev) => ({
      ordenesCompra: prev.ordenesCompra.map((o) =>
        o.id === orden.id ? payload : o,
      ),
    }));

    registrarAuditoria({
      id: Date.now(),
      fecha: new Date().toISOString(),
      usuario: user?.nombre || 'Sistema',
      accion: 'CANCELACIÓN_OC',
      modulo: 'COMPRAS',
      nivel: 'warning',
      detalles: `Folio ${orden.numero} cancelado.`,
    });

    showToast('Orden cancelada.', 'success');
  };

  // ─── COMUNICACIÓN CON PROVEEDORES ─────────────────────────────────────
  const crearCuerpoMensaje = (orden) => {
    let texto = `*NUEVA ORDEN DE COMPRA*\n`;
    texto += `*${configuracion?.nombre_empresa || 'AZUL Restaurante'}*\n`;
    texto += `*Folio:* ${orden.numero}\n`;
    texto += `*Fecha:* ${new Date(orden.fecha).toLocaleDateString('es-MX')}\n\n`;
    texto += `*INSUMOS SOLICITADOS:*\n`;

    (orden.items || []).forEach((item) => {
      const prod = (productos || []).find(
        (p) => String(p.id) === String(item.id_producto),
      );
      texto += `- ${item.cantidad} ${prod?.unidad || ''} de ${prod?.nombre || 'Producto'}\n`;
    });

    if (orden.referencia && !orden.referencia.includes('manual')) {
      texto += `\n*Notas:* ${orden.referencia}\n`;
    }
    texto += `\nConfirmar recepción. ¡Gracias!`;
    return texto;
  };

  const enviarPorWhatsApp = (orden, desdeModal = false) => {
    const prov = (proveedores || []).find((p) => p.nombre === orden.proveedor);
    const telefono = prov?.telefono ? prov.telefono.replace(/\D/g, '') : '';
    const mensaje = encodeURIComponent(crearCuerpoMensaje(orden));
    window.open(`https://wa.me/${telefono}?text=${mensaje}`, '_blank');
    if (desdeModal) finalizarFlujoOrden();
  };

  const enviarPorCorreo = (orden, desdeModal = false) => {
    const prov = (proveedores || []).find((p) => p.nombre === orden.proveedor);
    const asunto = encodeURIComponent(
      `OC ${orden.numero} - ${configuracion?.nombre_empresa || 'Restaurante'}`,
    );
    const cuerpo = encodeURIComponent(
      crearCuerpoMensaje(orden).replace(/\*/g, ''),
    );
    window.open(
      `https://mail.google.com/mail/?view=cm&fs=1&to=${prov?.email || ''}&su=${asunto}&body=${cuerpo}`,
      '_blank',
    );
    if (desdeModal) finalizarFlujoOrden();
  };

  const finalizarFlujoOrden = () => {
    setOrdenExitosa(null);
    setCarrito([]);
    setProveedorSeleccionado(null);
    setReferencia('');
    setActiveTab('historial');
  };

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto flex flex-col h-full animate-in fade-in transition-colors duration-500">
      {/* ─── HEADER PRINCIPAL ─── */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white dark:bg-ui-humo p-6 rounded-3xl border-2 border-slate-100 dark:border-ui-border shadow-sm mb-6 transition-colors">
        <div className="flex items-center gap-4">
          <div className="bg-indigo-50 dark:bg-brand-amatista/10 p-3 rounded-2xl border border-indigo-100 dark:border-brand-amatista/20">
            <ShoppingCart className="w-6 h-6 text-indigo-600 dark:text-brand-amatista" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-slate-900 dark:text-brand-nacar">
              Órdenes de Compra
            </h1>
            <p className="text-sm text-slate-500 dark:text-ui-muted mt-1">
              Gestión de abastecimiento a proveedores
            </p>
          </div>
        </div>
      </div>

      {/* HEADER TABS */}
      <div className="flex gap-4 border-b-2 border-slate-100 dark:border-ui-border mb-8 pb-0 transition-colors">
        <button
          onClick={() => setActiveTab('historial')}
          className={`px-6 py-4 font-black text-sm border-b-4 transition-all flex items-center gap-2 ${activeTab === 'historial' ? 'border-indigo-600 text-indigo-600 dark:border-brand-amatista dark:text-brand-amatista' : 'border-transparent text-slate-400 dark:text-ui-muted hover:text-slate-600 dark:hover:text-brand-nacar'}`}
        >
          <FileText className="w-5 h-5" /> Historial
        </button>
        <button
          onClick={() => setActiveTab('crear')}
          className={`px-6 py-4 font-black text-sm border-b-4 transition-all flex items-center gap-2 ${activeTab === 'crear' ? 'border-emerald-600 text-emerald-600 dark:border-brand-cesped dark:text-brand-cesped' : 'border-transparent text-slate-400 dark:text-ui-muted hover:text-slate-600 dark:hover:text-brand-nacar'}`}
        >
          <PlusCircle className="w-5 h-5" /> Generar Orden
        </button>
      </div>

      {/* ─── TAB HISTORIAL ─── */}
      {activeTab === 'historial' && (
        <div className="flex-1 flex flex-col min-h-0">
          <div className="flex flex-col md:flex-row gap-4 mb-6">
            <div className="relative flex-1 group">
              <Search className="w-5 h-5 text-slate-400 dark:text-ui-muted absolute left-4 top-1/2 -translate-y-1/2 group-focus-within:text-indigo-500 dark:group-focus-within:text-brand-amatista transition-colors" />
              <input
                type="text"
                placeholder="Buscar por folio o proveedor..."
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                className="w-full bg-white dark:bg-ui-humo border-2 border-slate-100 dark:border-ui-border text-slate-900 dark:text-brand-nacar font-bold pl-12 pr-4 py-3.5 rounded-2xl outline-none focus:border-indigo-500 dark:focus:border-brand-amatista transition-colors shadow-sm"
              />
            </div>
            <div className="flex bg-slate-100 dark:bg-ui-obsidiana p-1.5 rounded-2xl overflow-x-auto custom-scrollbar transition-colors">
              {['Todos', 'pendiente', 'completada', 'cancelada'].map(
                (estado) => (
                  <button
                    key={estado}
                    onClick={() => setFiltroEstado(estado)}
                    className={`px-5 py-2 rounded-xl text-xs font-black capitalize transition-all ${filtroEstado === estado ? 'bg-white dark:bg-ui-humo text-indigo-600 dark:text-brand-amatista shadow-md' : 'text-slate-500 dark:text-ui-muted hover:text-slate-700 dark:hover:text-brand-nacar'}`}
                  >
                    {estado}
                  </button>
                ),
              )}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 pb-10">
            {ordenesFiltradas.length === 0 ? (
              <div className="text-center py-20 bg-white dark:bg-ui-humo rounded-[2.5rem] border-2 border-dashed border-slate-200 dark:border-ui-border transition-colors">
                <div className="w-24 h-24 bg-slate-50 dark:bg-ui-obsidiana rounded-full flex items-center justify-center mx-auto mb-4 border border-slate-100 dark:border-ui-border">
                  <Inbox className="w-12 h-12 text-slate-300 dark:text-ui-muted" />
                </div>
                <h3 className="text-xl font-black text-slate-400 dark:text-ui-muted uppercase tracking-widest">
                  Sin órdenes registradas
                </h3>
              </div>
            ) : (
              <div className="bg-white dark:bg-ui-humo rounded-[2.5rem] border-2 border-slate-100 dark:border-ui-border shadow-sm overflow-hidden transition-colors">
                <table className="w-full text-left">
                  <thead className="bg-slate-50 dark:bg-ui-obsidiana/50 text-slate-500 dark:text-ui-muted uppercase font-black text-[10px] tracking-widest border-b border-slate-100 dark:border-ui-border">
                    <tr>
                      <th className="p-5 pl-8">Folio / Proveedor</th>
                      <th className="p-5">Fecha</th>
                      <th className="p-5">Estado</th>
                      <th className="p-5 text-right">Total</th>
                      <th className="p-5 text-center">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50 dark:divide-ui-border">
                    {ordenesFiltradas.map((orden) => (
                      <tr
                        key={orden.id}
                        className="hover:bg-slate-50 dark:hover:bg-ui-obsidiana/30 transition-colors group"
                      >
                        <td className="p-5 pl-8">
                          <p className="font-black text-indigo-600 dark:text-brand-amatista">
                            {orden.numero}
                          </p>
                          <p className="text-xs font-bold text-slate-500 dark:text-ui-muted flex items-center gap-1 mt-1">
                            <Truck className="w-3 h-3" /> {orden.proveedor}
                          </p>
                        </td>
                        <td className="p-5 text-slate-600 dark:text-brand-nacar font-bold text-sm">
                          {new Date(orden.fecha).toLocaleDateString('es-MX')}
                        </td>
                        <td className="p-5">
                          <span
                            className={`px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest border ${
                              orden.estado === 'pendiente'
                                ? 'bg-amber-100 dark:bg-brand-ambar/10 text-amber-700 dark:text-brand-ambar border-amber-200 dark:border-brand-ambar/30'
                                : orden.estado === 'completada'
                                  ? 'bg-emerald-100 dark:bg-brand-cesped/10 text-emerald-700 dark:text-brand-cesped border-emerald-200 dark:border-brand-cesped/30'
                                  : 'bg-rose-100 dark:bg-brand-arrecife/10 text-rose-700 dark:text-brand-arrecife border-rose-200 dark:border-brand-arrecife/30'
                            }`}
                          >
                            {orden.estado}
                          </span>
                        </td>
                        <td className="p-5 text-right font-black text-slate-900 dark:text-brand-nacar">
                          $
                          {Number(orden.total).toLocaleString('es-MX', {
                            minimumFractionDigits: 2,
                          })}
                        </td>
                        <td className="p-5">
                          <div className="flex justify-center gap-2">
                            <button
                              onClick={() => enviarPorWhatsApp(orden)}
                              className="p-2 text-emerald-500 dark:text-brand-cesped hover:bg-emerald-50 dark:hover:bg-brand-cesped/10 rounded-xl transition-colors"
                              title="WhatsApp"
                            >
                              <MessageCircle className="w-5 h-5" />
                            </button>
                            <button
                              onClick={() => enviarPorCorreo(orden)}
                              className="p-2 text-slate-400 dark:text-ui-muted hover:bg-slate-100 dark:hover:bg-ui-border rounded-xl transition-colors"
                              title="Correo"
                            >
                              <Mail className="w-5 h-5" />
                            </button>
                            {orden.estado === 'pendiente' && (
                              <button
                                onClick={() => cancelarOrden(orden)}
                                className="p-2 text-rose-400 dark:text-brand-arrecife/80 hover:bg-rose-50 dark:hover:bg-brand-arrecife/10 hover:text-rose-600 dark:hover:text-brand-arrecife rounded-xl transition-colors"
                                title="Cancelar"
                              >
                                <Trash2 className="w-5 h-5" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ─── TAB CREACIÓN (WIZARD) ─── */}
      {activeTab === 'crear' && (
        <div className="flex-1 flex flex-col min-h-0 animate-in fade-in slide-in-from-right-4 duration-300">
          {!proveedorSeleccionado ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 pb-10">
              {(proveedores || [])
                .filter((p) => p.activo !== false)
                .map((p) => (
                  <button
                    key={p.id}
                    onClick={() => setProveedorSeleccionado(p)}
                    className="bg-white dark:bg-ui-humo p-6 rounded-3xl border-2 border-slate-100 dark:border-ui-border hover:border-emerald-500 dark:hover:border-brand-cesped shadow-sm transition-all group text-left"
                  >
                    <Truck className="w-10 h-10 text-slate-300 dark:text-ui-muted group-hover:text-emerald-500 dark:group-hover:text-brand-cesped mb-4 transition-colors" />
                    <h3 className="font-black text-lg text-slate-900 dark:text-brand-nacar leading-tight line-clamp-1">
                      {p.nombre}
                    </h3>
                    <p className="text-slate-400 dark:text-ui-muted text-xs font-bold mt-1 uppercase tracking-widest line-clamp-1">
                      {p.contacto || 'Sin contacto'}
                    </p>
                  </button>
                ))}
            </div>
          ) : (
            <div className="flex flex-col lg:flex-row gap-8 pb-10">
              <div className="flex-1 space-y-6">
                {/* Formulario Items */}
                <div className="bg-white dark:bg-ui-humo p-6 md:p-8 rounded-[2.5rem] border-2 border-slate-100 dark:border-ui-border shadow-sm transition-colors">
                  <div className="flex justify-between items-center mb-6">
                    <h2 className="text-xl font-black text-slate-900 dark:text-brand-nacar flex items-center gap-2">
                      Proveedor:{' '}
                      <span className="text-emerald-500 dark:text-brand-cesped">
                        {proveedorSeleccionado.nombre}
                      </span>
                    </h2>
                    <button
                      onClick={() => {
                        setProveedorSeleccionado(null);
                        setCarrito([]);
                      }}
                      className="text-xs font-black text-rose-500 dark:text-brand-arrecife uppercase tracking-widest flex items-center gap-1 hover:underline"
                    >
                      <ChevronLeft className="w-3 h-3" /> Cambiar
                    </button>
                  </div>

                  <form
                    onSubmit={agregarAlCarrito}
                    className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end"
                  >
                    <div className="md:col-span-6">
                      <label className="text-[10px] font-black text-slate-400 dark:text-ui-muted uppercase tracking-widest pl-2 mb-1 block">
                        Insumo
                      </label>
                      <select
                        value={itemSeleccionado}
                        onChange={handleSelectProducto}
                        className="w-full bg-slate-50 dark:bg-ui-obsidiana border-2 border-slate-100 dark:border-ui-border rounded-2xl p-3.5 font-bold text-sm text-slate-900 dark:text-brand-nacar outline-none focus:border-emerald-500 dark:focus:border-brand-cesped transition-colors cursor-pointer"
                      >
                        <option value="">Buscar en catálogo...</option>
                        {(productos || [])
                          .filter((p) => p.activo !== false)
                          .map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.nombre} ({p.unidad})
                            </option>
                          ))}
                      </select>
                    </div>
                    <div className="md:col-span-2 text-center">
                      <label className="text-[10px] font-black text-slate-400 dark:text-ui-muted uppercase tracking-widest mb-1 block">
                        Cant.
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        min="0.01"
                        required
                        value={cantidadItem}
                        onChange={(e) => setCantidadItem(e.target.value)}
                        className="w-full bg-slate-50 dark:bg-ui-obsidiana border-2 border-slate-100 dark:border-ui-border rounded-2xl p-3.5 font-black text-slate-900 dark:text-brand-nacar outline-none focus:border-emerald-500 dark:focus:border-brand-cesped text-center transition-colors"
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label className="text-[10px] font-black text-slate-400 dark:text-ui-muted uppercase tracking-widest mb-1 block">
                        Costo U.
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        required
                        value={costoItem}
                        onChange={(e) => setCostoItem(e.target.value)}
                        className="w-full bg-slate-50 dark:bg-ui-obsidiana border-2 border-slate-100 dark:border-ui-border rounded-2xl p-3.5 font-black text-emerald-600 dark:text-brand-cesped outline-none focus:border-emerald-500 dark:focus:border-brand-cesped text-center transition-colors"
                      />
                    </div>
                    <button
                      type="submit"
                      className="md:col-span-2 w-full bg-slate-900 dark:bg-brand-arrecife text-white dark:text-ui-obsidiana p-4 rounded-2xl font-black hover:bg-slate-800 dark:hover:bg-orange-600 transition-all active:scale-95 flex items-center justify-center shadow-lg"
                    >
                      <PlusCircle className="w-6 h-6" />
                    </button>
                  </form>
                </div>

                {/* Carrito Temporal */}
                <div className="bg-white dark:bg-ui-humo rounded-[2.5rem] border-2 border-slate-100 dark:border-ui-border shadow-sm overflow-hidden transition-colors">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50 dark:bg-ui-obsidiana/50 text-slate-400 dark:text-ui-muted uppercase font-black text-[10px] tracking-widest border-b border-slate-100 dark:border-ui-border">
                      <tr>
                        <th className="p-4 pl-6">Insumo</th>
                        <th className="p-4 text-center">Cant.</th>
                        <th className="p-4 text-right">Monto</th>
                        <th className="p-4 text-center"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50 dark:divide-ui-border">
                      {carrito.length === 0 ? (
                        <tr>
                          <td
                            colSpan="4"
                            className="p-8 text-center text-slate-400 dark:text-ui-muted font-bold text-sm"
                          >
                            La orden está vacía.
                          </td>
                        </tr>
                      ) : (
                        carrito.map((item, idx) => {
                          const prodBd = productos.find(
                            (p) => String(p.id) === String(item.id_producto),
                          );
                          return (
                            <tr
                              key={idx}
                              className="hover:bg-slate-50 dark:hover:bg-ui-obsidiana/30 transition-colors"
                            >
                              <td className="p-4 pl-6 font-bold text-slate-700 dark:text-brand-nacar">
                                {prodBd?.nombre}
                              </td>
                              <td className="p-4 text-center font-black text-slate-900 dark:text-brand-nacar">
                                {item.cantidad}{' '}
                                <span className="text-[10px] text-slate-400 dark:text-ui-muted uppercase">
                                  {prodBd?.unidad}
                                </span>
                              </td>
                              <td className="p-4 text-right font-black text-slate-900 dark:text-brand-nacar">
                                $
                                {(
                                  item.cantidad * item.precio_unitario
                                ).toLocaleString('es-MX', {
                                  minimumFractionDigits: 2,
                                })}
                              </td>
                              <td className="p-4 text-center">
                                <button
                                  onClick={() =>
                                    removerDelCarrito(item.id_producto)
                                  }
                                  className="text-rose-400 hover:text-rose-600 dark:text-brand-arrecife/80 dark:hover:text-brand-arrecife transition-colors"
                                >
                                  <MinusCircle className="w-5 h-5" />
                                </button>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* COLUMNA DERECHA (RESUMEN) */}
              <div className="lg:w-96 space-y-6">
                <div className="bg-slate-900 dark:bg-ui-obsidiana border dark:border-ui-border p-8 rounded-[2.5rem] shadow-xl text-white dark:text-brand-nacar transition-colors">
                  <h3 className="font-black text-slate-400 dark:text-ui-muted uppercase tracking-widest text-xs mb-6 flex items-center gap-2">
                    <Calculator className="w-4 h-4" /> Resumen OC
                  </h3>

                  <div className="space-y-2 mb-6">
                    <label className="text-[10px] font-bold text-slate-400 dark:text-ui-muted uppercase tracking-widest block">
                      Referencia / Notas
                    </label>
                    <textarea
                      value={referencia}
                      onChange={(e) => setReferencia(e.target.value)}
                      rows="2"
                      className="w-full bg-slate-800 dark:bg-ui-humo border border-slate-700 dark:border-ui-border rounded-xl p-3 font-medium text-sm text-white dark:text-brand-nacar outline-none focus:border-emerald-500 dark:focus:border-brand-cesped resize-none transition-colors"
                      placeholder="Opcional..."
                    />
                  </div>

                  <div className="space-y-4 mb-8">
                    <div className="flex justify-between text-slate-400 dark:text-ui-muted font-bold text-sm">
                      <span>Subtotal</span>
                      <span>
                        $
                        {subtotal.toLocaleString('es-MX', {
                          minimumFractionDigits: 2,
                        })}
                      </span>
                    </div>
                    <div className="flex justify-between text-slate-400 dark:text-ui-muted font-bold text-sm border-b border-slate-800 dark:border-ui-border pb-4">
                      <span>IVA ({tasaIva * 100}%)</span>
                      <span>
                        $
                        {ivaMonto.toLocaleString('es-MX', {
                          minimumFractionDigits: 2,
                        })}
                      </span>
                    </div>
                    <div className="flex justify-between text-3xl font-black text-emerald-400 dark:text-brand-cesped pt-2">
                      <span>Total</span>
                      <span>
                        $
                        {total.toLocaleString('es-MX', {
                          minimumFractionDigits: 2,
                        })}
                      </span>
                    </div>
                  </div>

                  <button
                    onClick={generarOrden}
                    disabled={isSubmitting || carrito.length === 0}
                    className="w-full bg-emerald-500 hover:bg-emerald-600 dark:bg-brand-cesped dark:hover:bg-[#00c98c] disabled:bg-slate-800 disabled:text-slate-500 dark:disabled:bg-ui-border dark:disabled:text-ui-muted text-white dark:text-ui-obsidiana py-5 rounded-2xl font-black shadow-lg shadow-emerald-500/20 dark:shadow-brand-cesped/20 active:scale-95 transition-all text-lg flex items-center justify-center gap-2"
                  >
                    <CheckCircle className="w-5 h-5" /> Emitir Orden
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ─── MODAL ÉXITO ─── */}
      {ordenExitosa && (
        <div className="fixed inset-0 bg-slate-900/90 dark:bg-ui-obsidiana/90 backdrop-blur-md z-[150] flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white dark:bg-ui-humo rounded-[3rem] w-full max-w-md p-10 text-center shadow-2xl border-2 border-slate-100 dark:border-ui-border transition-colors animate-in zoom-in-95 duration-300">
            <CheckCircle className="w-20 h-20 text-emerald-500 dark:text-brand-cesped mx-auto mb-6" />
            <h2 className="text-3xl font-black text-slate-900 dark:text-brand-nacar mb-2 tracking-tight">
              ¡Emitida!
            </h2>
            <p className="text-slate-500 dark:text-ui-muted font-bold mb-8">
              Folio:{' '}
              <span className="text-indigo-600 dark:text-brand-amatista">
                {ordenExitosa.numero}
              </span>
            </p>

            <div className="space-y-3">
              <button
                onClick={() => enviarPorWhatsApp(ordenExitosa, true)}
                className="w-full bg-[#25D366] hover:bg-[#1ebd59] text-white py-4 rounded-2xl font-black flex items-center justify-center gap-2 shadow-lg transition-colors active:scale-95"
              >
                <MessageCircle className="w-5 h-5" /> WhatsApp
              </button>
              <button
                onClick={() => enviarPorCorreo(ordenExitosa, true)}
                className="w-full bg-slate-900 dark:bg-ui-obsidiana hover:bg-slate-800 dark:hover:bg-ui-border text-white dark:text-brand-nacar py-4 rounded-2xl font-black flex items-center justify-center gap-2 shadow-lg border border-transparent dark:border-ui-border transition-colors active:scale-95"
              >
                <Mail className="w-5 h-5" /> Enviar por Correo
              </button>
              <button
                onClick={finalizarFlujoOrden}
                className="w-full text-slate-400 dark:text-ui-muted font-bold py-3 hover:text-slate-600 dark:hover:text-brand-nacar transition-colors"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
