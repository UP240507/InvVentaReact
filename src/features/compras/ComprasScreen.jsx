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
  ConfirmModal,
} from '../../components/ui';
import { useSyncStore } from '../../store/useSyncStore';
import {
  proveedorDeLaOrden,
  telefonoParaWhatsApp,
  nombreDeProveedorDeLaOrden,
} from '../../lib/Compras';
import {
  empaquesDe,
  describirEmpaque,
  derivarLinea,
  lineaSinEmpaque,
} from '../../lib/Empaques';
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
    proveedorProducto,
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
  const [ordenACancelar, setOrdenACancelar] = useState(null);
  const [busqueda, setBusqueda] = useState('');
  const [filtroEstado, setFiltroEstado] = useState('Todos');

  // WIZARD STATES (CREACIÓN DE ORDEN)
  const [proveedorSeleccionado, setProveedorSeleccionado] = useState(null);
  const [carrito, setCarrito] = useState([]);
  const [referencia, setReferencia] = useState('');
  const [itemSeleccionado, setItemSeleccionado] = useState('');
  const [cantidadItem, setCantidadItem] = useState('');
  const [costoItem, setCostoItem] = useState('');
  // Qué empaque se está comprando. '' = la unidad de siempre, que es lo que
  // pasa cuando este proveedor no tiene empaques dados de alta para el insumo.
  const [empaqueId, setEmpaqueId] = useState('');
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
    // `total` lo calculó `lib/Empaques` al armar la línea, en centavos enteros.
    // Multiplicar aquí otra vez `cantidad x precio_unitario` volvería a abrir la
    // puerta del centavo: 30 kg a 3.333… no da 100 exacto en coma flotante.
    // Las líneas viejas —sin `total`— siguen sumándose como antes.
    const sub = carrito.reduce(
      (acc, item) =>
        acc +
        (item.total != null
          ? Number(item.total)
          : Number(item.cantidad) * Number(item.precio_unitario)),
      0,
    );
    const imp = sub * tasaIva;
    return { subtotal: sub, ivaMonto: imp, total: sub + imp };
  }, [carrito, tasaIva]);

  // ── LOS EMPAQUES DE ESTE PROVEEDOR PARA ESTE INSUMO ─────────────────────
  // Si no hay ninguno, la línea se teclea en la unidad de siempre: un insumo
  // sin empaques no es un caso especial, es el caso por defecto.
  const empaquesDisponibles = useMemo(
    () =>
      empaquesDe(proveedorProducto, {
        proveedorId: proveedorSeleccionado?.id,
        productoId: itemSeleccionado,
      }),
    [proveedorProducto, proveedorSeleccionado, itemSeleccionado],
  );
  const empaqueElegido =
    empaquesDisponibles.find((e) => String(e.id) === String(empaqueId)) || null;
  const insumoElegido = (productos || []).find(
    (p) => String(p.id) === String(itemSeleccionado),
  );

  // ─── MANEJADORES DE CARRITO ──────────────────────────────────────────
  const handleSelectProducto = (e) => {
    const idProd = e.target.value;
    setItemSeleccionado(idProd);
    const prod = (productos || []).find((p) => String(p.id) === String(idProd));
    if (prod) setCostoItem(prod.precio || '');
    // El empaque elegido era del insumo anterior. Dejarlo puesto haría que «2
    // arpillas» se aplicaran al queso, y el factor entraría al costo sin que
    // nadie lo viera.
    setEmpaqueId('');
  };

  const agregarAlCarrito = (e) => {
    e.preventDefault();
    if (!itemSeleccionado || !cantidadItem || Number(cantidadItem) <= 0) {
      return showToast('Selecciona un producto y cantidad válida', 'error');
    }

    // ── LA DIVISIÓN QUE YA NO SE HACE A MANO ────────────────────────────
    // Con empaque, lo tecleado es «cuántas arpillas» y «cuánto cuesta una»;
    // `lib/Empaques` deriva la cantidad en la unidad del insumo y el precio
    // unitario que entra al costo promedio ponderado. Sin empaque, la misma
    // librería hace la cuenta de siempre: una sola calculadora, no dos.
    const cuantos = Number(cantidadItem);
    const precioTecleado = Number(costoItem) || 0;
    const derivada = empaqueElegido
      ? derivarLinea({
          factor: empaqueElegido.factor,
          empaques: cuantos,
          precioPorEmpaque: precioTecleado,
        })
      : lineaSinEmpaque({ cantidad: cuantos, precioUnitario: precioTecleado });

    if (derivada.cantidad <= 0) {
      return showToast('Revisa la cantidad y el empaque.', 'error');
    }

    // Se guarda lo DERIVADO y también lo TECLEADO. La orden tiene que poder
    // decir lo que decía el papel —«2 arpillas a $900»—, no sólo el resultado.
    const nueva = {
      id_producto: itemSeleccionado,
      cantidad: derivada.cantidad,
      precio_unitario: derivada.precio_unitario,
      total: derivada.total,
      ...(empaqueElegido
        ? {
            empaque: empaqueElegido.nombre,
            empaques: cuantos,
            precio_empaque: precioTecleado,
            factor: Number(empaqueElegido.factor),
          }
        : {}),
    };

    setCarrito((prev) => {
      // La misma línea es el mismo insumo COMPRADO IGUAL: dos arpillas y tres
      // kilos sueltos de la misma naranja son dos renglones, porque se
      // pidieron distinto y el papel del proveedor los lista distinto.
      const idx = prev.findIndex(
        (i) =>
          String(i.id_producto) === String(nueva.id_producto) &&
          (i.empaque || '') === (nueva.empaque || ''),
      );
      if (idx === -1) return [...prev, nueva];

      const copia = [...prev];
      const vieja = copia[idx];
      if (empaqueElegido) {
        const empaques = Number(vieja.empaques || 0) + cuantos;
        copia[idx] = {
          ...vieja,
          ...nueva,
          empaques,
          ...derivarLinea({
            factor: empaqueElegido.factor,
            empaques,
            precioPorEmpaque: precioTecleado,
          }),
        };
      } else {
        const cantidad = Number(vieja.cantidad || 0) + derivada.cantidad;
        copia[idx] = {
          ...vieja,
          ...nueva,
          ...lineaSinEmpaque({ cantidad, precioUnitario: precioTecleado }),
        };
      }
      return copia;
    });

    setItemSeleccionado('');
    setCantidadItem('');
    setCostoItem('');
    setEmpaqueId('');
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
      // ── LOS DOS, Y CADA UNO PARA LO SUYO ──────────────────────────────
      // `proveedor_id` es la identidad: es por donde se busca. `proveedor` es
      // el nombre que tenía el día de la orden, y se guarda como historia para
      // que renombrar el catálogo no reescriba lo que decía el papel.
      //
      // Hasta el 01-sep sólo se guardaba el nombre, y con él se buscaba de
      // vuelta al proveedor para mandarle la orden: corregir un nombre en el
      // catálogo dejaba sin destinatario a todas sus órdenes anteriores, y sin
      // dar error. El porqué entero está en `lib/Compras.js`.
      proveedor_id: proveedorSeleccionado.id,
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

  // Pregunta con el modal del proyecto, no con `window.confirm`.
  //
  // Era el ÚNICO `confirm` nativo que quedaba en todo `src`, y el propio
  // componente de modal lo tiene vetado por escrito (`ui/Ops.jsx`: «rompe la
  // experiencia y en Tauri se ve como un cuadro del sistema»). En la caja se
  // veía como una alerta de Windows encima de la app — reportado en campo el
  // 28-ago como «la alerta de cancelación está a nivel del sistema».
  const cancelarOrden = (orden) => setOrdenACancelar(orden);

  const confirmarCancelacion = () => {
    const orden = ordenACancelar;
    setOrdenACancelar(null);
    if (!orden) return;

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
    const telefono = telefonoParaWhatsApp(orden, proveedores);
    // Sin número NO se abre nada. `wa.me/?text=…` sin destinatario abre un
    // WhatsApp vacío: en la pantalla parece que funcionó y al proveedor no le
    // llega nada. Y sobre todo NO se cierra el flujo: cerrarlo vaciaría el
    // carrito como si la orden se hubiera enviado.
    if (!telefono) {
      showToast(
        'Ese proveedor no tiene teléfono guardado. Agrégalo en Proveedores.',
        'error',
      );
      return;
    }
    const mensaje = encodeURIComponent(crearCuerpoMensaje(orden));
    window.open(`https://wa.me/${telefono}?text=${mensaje}`, '_blank');
    if (desdeModal) finalizarFlujoOrden();
  };

  const enviarPorCorreo = (orden, desdeModal = false) => {
    const prov = proveedorDeLaOrden(orden, proveedores);
    // Mismo motivo que arriba: un `mailto` sin destinatario no es un envío.
    if (!prov?.email) {
      showToast(
        'Ese proveedor no tiene correo guardado. Agrégalo en Proveedores.',
        'error',
      );
      return;
    }
    const asunto = encodeURIComponent(
      `OC ${orden.numero} - ${configuracion?.nombre_empresa || 'Restaurante'}`,
    );
    const cuerpo = encodeURIComponent(
      crearCuerpoMensaje(orden).replace(/\*/g, ''),
    );
    window.open(
      `https://mail.google.com/mail/?view=cm&fs=1&to=${prov.email}&su=${asunto}&body=${cuerpo}`,
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
            <Truck className="w-3 h-3" />{' '}
            {nombreDeProveedorDeLaOrden(o, proveedores)}
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
                    <div
                      className={
                        empaquesDisponibles.length > 0
                          ? 'md:col-span-4'
                          : 'md:col-span-6'
                      }
                    >
                      <label className="text-[10px] font-black text-adm-muted uppercase tracking-widest pl-2 mb-1 block">
                        Insumo
                      </label>
                      <select
                        aria-label="Insumo"
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
                    {/* ── EL EMPAQUE, SI ESTE PROVEEDOR TIENE ALGUNO ─────
                        Sólo aparece cuando hay empaques dados de alta para
                        esta pareja proveedor-insumo. Sin ellos la línea se
                        teclea como toda la vida: un insumo sin empaques no es
                        un caso especial, es el caso por defecto. */}
                    {empaquesDisponibles.length > 0 && (
                      <div className="md:col-span-3">
                        <label className="text-[10px] font-black text-adm-muted uppercase tracking-widest mb-1 block">
                          Se compra por
                        </label>
                        <select
                          aria-label="Empaque de compra"
                          value={empaqueId}
                          onChange={(e) => setEmpaqueId(e.target.value)}
                          className="w-full bg-adm-bg border-2 border-adm-field rounded-ui p-3.5 font-bold text-sm text-adm-ink outline-none focus:border-adm-ok dark:focus:border-adm-ok transition-colors cursor-pointer"
                        >
                          <option value="">
                            {insumoElegido?.unidad
                              ? `Por ${insumoElegido.unidad}`
                              : 'Por unidad'}
                          </option>
                          {empaquesDisponibles.map((emp) => (
                            <option key={emp.id} value={emp.id}>
                              {describirEmpaque(emp, insumoElegido?.unidad)}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                    <div className="md:col-span-1 text-center">
                      <label className="text-[10px] font-black text-adm-muted uppercase tracking-widest mb-1 block">
                        {empaqueElegido ? 'Cuántas' : 'Cant.'}
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        min="0.01"
                        required
                        aria-label="Cantidad"
                        value={cantidadItem}
                        onChange={(e) => setCantidadItem(e.target.value)}
                        className="w-full bg-adm-bg border-2 border-adm-field rounded-ui p-3.5 font-black text-adm-ink outline-none focus:border-adm-ok dark:focus:border-adm-ok text-center transition-colors"
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label className="text-[10px] font-black text-adm-muted uppercase tracking-widest mb-1 block">
                        {/* Con empaque, lo que se teclea es lo que cuesta UNO,
                            que es el número que viene en la factura. */}
                        {empaqueElegido
                          ? `Precio · ${empaqueElegido.nombre}`
                          : 'Costo U.'}
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        required
                        aria-label="Costo unitario"
                        value={costoItem}
                        onChange={(e) => setCostoItem(e.target.value)}
                        className="w-full bg-adm-bg border-2 border-adm-field rounded-ui p-3.5 font-black text-adm-ok outline-none focus:border-adm-ok dark:focus:border-adm-ok text-center transition-colors"
                      />
                    </div>
                    <button
                      type="submit"
                      aria-label="Agregar a la orden"
                      className="md:col-span-2 w-full bg-adm-ink dark:bg-adm-danger text-adm-danger-fg p-4 rounded-ui font-black hover:bg-adm-ink dark:hover:bg-adm-warn transition-all active:scale-95 flex items-center justify-center shadow-lg"
                    >
                      <PlusCircle className="w-6 h-6" />
                    </button>

                    {/* La cuenta, ENSEÑADA antes de agregar. Es la división que
                        antes se hacía con la calculadora del teléfono delante
                        del repartidor, y la que entra al costo promedio
                        ponderado del insumo. */}
                    {empaqueElegido && Number(cantidadItem) > 0 && (
                      <p className="md:col-span-12 text-xs font-bold text-adm-muted -mt-1">
                        Entran{' '}
                        <strong className="text-adm-ink">
                          {
                            derivarLinea({
                              factor: empaqueElegido.factor,
                              empaques: Number(cantidadItem),
                              precioPorEmpaque: Number(costoItem) || 0,
                            }).cantidad
                          }{' '}
                          {insumoElegido?.unidad}
                        </strong>{' '}
                        al inventario, a{' '}
                        <strong className="text-adm-ink">
                          $
                          {derivarLinea({
                            factor: empaqueElegido.factor,
                            empaques: Number(cantidadItem),
                            precioPorEmpaque: Number(costoItem) || 0,
                          }).precio_unitario.toFixed(4)}
                        </strong>{' '}
                        por {insumoElegido?.unidad}.
                      </p>
                    )}
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
                                {/* Cómo se PIDIÓ arriba, y qué entra debajo: el
                                    papel del proveedor habla de arpillas, el
                                    inventario habla de kilos. */}
                                {item.empaque ? (
                                  <>
                                    {item.empaques} × {item.empaque}
                                    <span className="block text-[10px] font-bold text-adm-muted normal-case">
                                      {item.cantidad} {prodBd?.unidad}
                                    </span>
                                  </>
                                ) : (
                                  <>
                                    {item.cantidad}{' '}
                                    <span className="text-[10px] text-adm-muted uppercase">
                                      {prodBd?.unidad}
                                    </span>
                                  </>
                                )}
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

      {/* Cancelar una orden es destructivo: se pregunta con el modal del
          proyecto. Escape cancela —lo hereda de `ConfirmModal`—, que en un
          cuadro destructivo es la salida segura. */}
      {ordenACancelar && (
        <ConfirmModal
          titulo="Cancelar la orden"
          icono={Trash2}
          mensaje={
            <>
              La orden <strong>{ordenACancelar.numero}</strong> quedara marcada
              como cancelada. El proveedor no se entera solo: si ya se la
              mandaste, avisale.
            </>
          }
          textoConfirmar="Si, cancelarla"
          onConfirmar={confirmarCancelacion}
          onCancelar={() => setOrdenACancelar(null)}
        />
      )}
    </PageShell>
  );
}
