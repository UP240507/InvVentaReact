import { useState, useMemo, useEffect } from 'react';
import { useAppStore } from '../../store/useAppStore';
import {
  PageShell,
  PageHeader,
  Chip,
  EmptyState,
  SearchField,
  SegmentedControl,
  IconButton,
  DataTable,
} from '../../components/ui';
import { useSyncStore } from '../../store/useSyncStore';
import { useAuthStore } from '../auth/useAuthStore';
import {
  ShoppingCart,
  Search,
  PlusCircle,
  MinusCircle,
  Truck,
  Calculator,
  CheckCircle,
  Inbox,
  ChevronLeft,
  MessageCircle,
  Mail,
  Trash2,
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

  // ── Columnas del historial de órdenes ───────────────────────────────────
  // Sin onEditar: una orden emitida no se corrige, se cancela y se emite otra
  // (el proveedor ya tiene la primera). `onEliminar` tampoco: cancelar NO es
  // borrar, y sale por su propio icono con la regla de "solo si está
  // pendiente" — un atajo Supr que cancelara órdenes sería peligroso.
  const columnasOrdenes = [
    {
      id: 'folio',
      titulo: 'Folio / Proveedor',
      celda: (o) => (
        <>
          <p className="font-bold text-adm-accent">{o.numero}</p>
          <p className="text-xs text-adm-muted flex items-center gap-1 mt-0.5">
            <Truck className="w-3 h-3" /> {o.proveedor}
          </p>
        </>
      ),
    },
    {
      id: 'fecha',
      titulo: 'Fecha',
      ancho: '1%',
      celda: (o) => (
        <span className="text-adm-muted whitespace-nowrap">
          {new Date(o.fecha).toLocaleDateString('es-MX')}
        </span>
      ),
    },
    {
      id: 'estado',
      titulo: 'Estado',
      ancho: '1%',
      celda: (o) => (
        <Chip
          tono={
            o.estado === 'pendiente'
              ? 'alerta'
              : o.estado === 'completada'
                ? 'ok'
                : 'peligro'
          }
        >
          {o.estado}
        </Chip>
      ),
    },
    {
      id: 'total',
      titulo: 'Total',
      alinear: 'der',
      ancho: '1%',
      celda: (o) => (
        <span className="font-bold text-adm-ink">
          $
          {Number(o.total).toLocaleString('es-MX', {
            minimumFractionDigits: 2,
          })}
        </span>
      ),
    },
    {
      id: 'acciones',
      titulo: '',
      alinear: 'der',
      ancho: '1%',
      celda: (o) => (
        <div className="flex justify-end gap-1">
          <IconButton
            icono={MessageCircle}
            titulo="Enviar por WhatsApp"
            onClick={(e) => {
              e.stopPropagation();
              enviarPorWhatsApp(o);
            }}
          />
          <IconButton
            icono={Mail}
            titulo="Enviar por correo"
            onClick={(e) => {
              e.stopPropagation();
              enviarPorCorreo(o);
            }}
          />
          {o.estado === 'pendiente' && (
            <IconButton
              icono={Trash2}
              titulo="Cancelar orden"
              className="hover:text-adm-danger"
              onClick={(e) => {
                e.stopPropagation();
                cancelarOrden(o);
              }}
            />
          )}
        </div>
      ),
    },
  ];

  return (
    <PageShell>
      <PageHeader
        icono={ShoppingCart}
        titulo="Órdenes de Compra"
        descripcion="Gestión de abastecimiento a proveedores"
        acciones={
          <SegmentedControl
            valor={activeTab}
            onChange={setActiveTab}
            opciones={[
              { id: 'historial', label: 'Historial' },
              { id: 'crear', label: 'Generar orden' },
            ]}
          />
        }
      />

      {/* ─── TAB HISTORIAL ─── */}
      {activeTab === 'historial' && (
        <div className="flex-1 flex flex-col min-h-0">
          <div className="flex flex-col md:flex-row gap-3 mb-4">
            <SearchField
              icono={Search}
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar por folio o proveedor…"
              className="flex-1"
            />
            <SegmentedControl
              valor={filtroEstado}
              onChange={setFiltroEstado}
              opciones={['Todos', 'pendiente', 'completada', 'cancelada'].map(
                (e) => ({
                  id: e,
                  label: e.charAt(0).toUpperCase() + e.slice(1),
                }),
              )}
            />
          </div>

          <DataTable
            scope="tabla-compras"
            titulo="Órdenes de compra"
            columnas={columnasOrdenes}
            filas={ordenesFiltradas}
            onNuevo={() => setActiveTab('crear')}
            activo={!ordenExitosa}
            vacio={
              <EmptyState
                icono={Inbox}
                titulo="Sin órdenes registradas"
                descripcion="Genera la primera desde la pestaña de al lado."
              />
            }
          />
        </div>
      )}

      {/* ─── TAB CREACIÓN (WIZARD) ─── */}
      {activeTab === 'crear' && (
        <div className="flex-1 flex flex-col min-h-0 animate-in fade-in slide-in-from-right-4 duration-media">
          {!proveedorSeleccionado ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 pb-10">
              {(proveedores || [])
                .filter((p) => p.activo !== false)
                .map((p) => (
                  <button
                    key={p.id}
                    onClick={() => setProveedorSeleccionado(p)}
                    className="bg-white dark:bg-adm-panel p-6 rounded-ui-lg border-2 border-adm-border hover:border-adm-ok dark:hover:border-adm-ok shadow-sm transition-all group text-left"
                  >
                    <Truck className="w-10 h-10 text-adm-muted group-hover:text-adm-ok dark:group-hover:text-adm-ok mb-4 transition-colors" />
                    <h3 className="font-black text-lg text-adm-ink leading-tight line-clamp-1">
                      {p.nombre}
                    </h3>
                    <p className="text-adm-muted text-xs font-bold mt-1 uppercase tracking-widest line-clamp-1">
                      {p.contacto || 'Sin contacto'}
                    </p>
                  </button>
                ))}
            </div>
          ) : (
            <div className="flex flex-col lg:flex-row gap-8 pb-10">
              <div className="flex-1 space-y-6">
                {/* Formulario Items */}
                <div className="bg-white dark:bg-adm-panel p-6 md:p-8 rounded-ui-lg border-2 border-adm-border shadow-sm transition-colors">
                  <div className="flex justify-between items-center mb-6">
                    <h2 className="text-xl font-black text-adm-ink flex items-center gap-2">
                      Proveedor:{' '}
                      <span className="text-adm-ok">
                        {proveedorSeleccionado.nombre}
                      </span>
                    </h2>
                    <button
                      onClick={() => {
                        setProveedorSeleccionado(null);
                        setCarrito([]);
                      }}
                      className="text-xs font-black text-adm-danger uppercase tracking-widest flex items-center gap-1 hover:underline"
                    >
                      <ChevronLeft className="w-3 h-3" /> Cambiar
                    </button>
                  </div>

                  <form
                    onSubmit={agregarAlCarrito}
                    className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end"
                  >
                    <div className="md:col-span-6">
                      <label className="text-[10px] font-black text-adm-muted uppercase tracking-widest pl-2 mb-1 block">
                        Insumo
                      </label>
                      <select
                        value={itemSeleccionado}
                        onChange={handleSelectProducto}
                        className="w-full bg-adm-bg border-2 border-adm-field rounded-ui p-3.5 font-bold text-sm text-adm-ink outline-none focus:border-adm-ok dark:focus:border-adm-ok transition-colors cursor-pointer"
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
                      <label className="text-[10px] font-black text-adm-muted uppercase tracking-widest mb-1 block">
                        Cant.
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        min="0.01"
                        required
                        value={cantidadItem}
                        onChange={(e) => setCantidadItem(e.target.value)}
                        className="w-full bg-adm-bg border-2 border-adm-field rounded-ui p-3.5 font-black text-adm-ink outline-none focus:border-adm-ok dark:focus:border-adm-ok text-center transition-colors"
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label className="text-[10px] font-black text-adm-muted uppercase tracking-widest mb-1 block">
                        Costo U.
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        required
                        value={costoItem}
                        onChange={(e) => setCostoItem(e.target.value)}
                        className="w-full bg-adm-bg border-2 border-adm-field rounded-ui p-3.5 font-black text-adm-ok outline-none focus:border-adm-ok dark:focus:border-adm-ok text-center transition-colors"
                      />
                    </div>
                    <button
                      type="submit"
                      className="md:col-span-2 w-full bg-adm-ink dark:bg-adm-danger text-adm-danger-fg p-4 rounded-ui font-black hover:bg-adm-ink dark:hover:bg-adm-warn transition-all active:scale-95 flex items-center justify-center shadow-lg"
                    >
                      <PlusCircle className="w-6 h-6" />
                    </button>
                  </form>
                </div>

                {/* Carrito Temporal */}
                <div className="bg-white dark:bg-adm-panel rounded-ui-lg border-2 border-adm-border shadow-sm overflow-hidden transition-colors">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-adm-bg text-adm-muted uppercase font-black text-[10px] tracking-widest border-b border-adm-border">
                      <tr>
                        <th className="p-4 pl-6">Insumo</th>
                        <th className="p-4 text-center">Cant.</th>
                        <th className="p-4 text-right">Monto</th>
                        <th className="p-4 text-center"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-adm-border">
                      {carrito.length === 0 ? (
                        <tr>
                          <td
                            colSpan="4"
                            className="p-8 text-center text-adm-muted font-bold text-sm"
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
                              className="hover:bg-adm-bg dark:hover:bg-adm-bg/30 transition-colors"
                            >
                              <td className="p-4 pl-6 font-bold text-adm-ink">
                                {prodBd?.nombre}
                              </td>
                              <td className="p-4 text-center font-black text-adm-ink">
                                {item.cantidad}{' '}
                                <span className="text-[10px] text-adm-muted uppercase">
                                  {prodBd?.unidad}
                                </span>
                              </td>
                              <td className="p-4 text-right font-black text-adm-ink">
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
                                  className="text-adm-danger hover:text-adm-danger dark:hover:text-adm-danger transition-colors"
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
                <div className="bg-adm-ink dark:bg-adm-bg border dark:border-adm-border p-8 rounded-ui-lg shadow-xl text-adm-bg transition-colors">
                  <h3 className="font-black text-adm-muted uppercase tracking-widest text-xs mb-6 flex items-center gap-2">
                    <Calculator className="w-4 h-4" /> Resumen OC
                  </h3>

                  <div className="space-y-2 mb-6">
                    <label className="text-[10px] font-bold text-adm-muted uppercase tracking-widest block">
                      Referencia / Notas
                    </label>
                    <textarea
                      value={referencia}
                      onChange={(e) => setReferencia(e.target.value)}
                      rows="2"
                      className="w-full bg-adm-ink dark:bg-adm-panel border border-adm-field rounded-ui p-3 font-medium text-sm text-adm-bg outline-none focus:border-adm-ok dark:focus:border-adm-ok resize-none transition-colors"
                      placeholder="Opcional..."
                    />
                  </div>

                  <div className="space-y-4 mb-8">
                    <div className="flex justify-between text-adm-muted font-bold text-sm">
                      <span>Subtotal</span>
                      <span>
                        $
                        {subtotal.toLocaleString('es-MX', {
                          minimumFractionDigits: 2,
                        })}
                      </span>
                    </div>
                    <div className="flex justify-between text-adm-muted font-bold text-sm border-b border-adm-border pb-4">
                      <span>IVA ({tasaIva * 100}%)</span>
                      <span>
                        $
                        {ivaMonto.toLocaleString('es-MX', {
                          minimumFractionDigits: 2,
                        })}
                      </span>
                    </div>
                    <div className="flex justify-between text-3xl font-black text-adm-ok pt-2">
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
                    className="w-full bg-adm-ok dark:hover:bg-[#00c98c] disabled:bg-adm-ink disabled:text-adm-muted dark:disabled:bg-adm-border dark:disabled:text-adm-muted text-adm-ok-fg py-5 rounded-ui font-black shadow-lg shadow-adm-ok/20 active:scale-95 transition-all text-lg flex items-center justify-center gap-2"
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
        <div className="fixed inset-0 bg-adm-ink/90 dark:bg-adm-bg/90 backdrop-blur-md z-[150] flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white dark:bg-adm-panel rounded-ui-lg w-full max-w-md p-10 text-center shadow-2xl border-2 border-adm-border transition-colors animate-in zoom-in-95 duration-media">
            <CheckCircle className="w-20 h-20 text-adm-ok mx-auto mb-6" />
            <h2 className="text-3xl font-black text-adm-ink mb-2 tracking-tight">
              ¡Emitida!
            </h2>
            <p className="text-adm-muted font-bold mb-8">
              Folio:{' '}
              <span className="text-adm-info">{ordenExitosa.numero}</span>
            </p>

            <div className="space-y-3">
              <button
                onClick={() => enviarPorWhatsApp(ordenExitosa, true)}
                // #25D366 es el verde de MARCA de WhatsApp, no del tenant:
                // este botón debe reconocerse como "WhatsApp" en cualquier tema.
                className="w-full bg-[#25D366] hover:bg-[#1ebd59] text-white py-4 rounded-ui font-black flex items-center justify-center gap-2 shadow-lg transition-colors active:scale-95"
              >
                <MessageCircle className="w-5 h-5" /> WhatsApp
              </button>
              <button
                onClick={() => enviarPorCorreo(ordenExitosa, true)}
                className="w-full bg-adm-ink dark:bg-adm-bg hover:bg-adm-ink dark:hover:bg-adm-border text-adm-bg py-4 rounded-ui font-black flex items-center justify-center gap-2 shadow-lg border border-transparent dark:border-adm-border transition-colors active:scale-95"
              >
                <Mail className="w-5 h-5" /> Enviar por Correo
              </button>
              <button
                onClick={finalizarFlujoOrden}
                className="w-full text-adm-muted font-bold py-3 hover:text-adm-muted dark:hover:text-adm-ink transition-colors"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </PageShell>
  );
}
