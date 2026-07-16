import { useState, useEffect, useMemo } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useAppStore } from '../../store/useAppStore';
import { useSyncStore } from '../../store/useSyncStore';
import { useSessionStore } from '../../store/useSessionStore';
import { useAuthStore } from '../auth/useAuthStore';
import {
  ShoppingCart,
  ChefHat,
  CreditCard,
  ArrowLeft,
  Trash2,
  Plus,
  Minus,
  Utensils,
  ReceiptText,
  BellRing,
  Users,
} from 'lucide-react';
import ModalCobro from '../operacion/components/ModalCobro';
import TicketImpresion from './components/TicketImpresion';
import PanelRondas, { hayRondasSinEntregar } from '../operacion/PanelRondas';
import { calcularVenta } from '../../lib/fiscal';
import { verificarStock } from '../../lib/inventario';
import ConfirmacionStockModal from './components/ConfirmacionStockModal';

// ─── HELPERS DE SANITIZACIÓN Y MATEMÁTICA ──────────────────────────────────
const safeNumber = (val, fallback = 0) => {
  if (val === null || val === undefined || val === '') return fallback;
  const n = Number(val);
  return isNaN(n) ? fallback : n;
};

const safePriceString = (val) => {
  if (val === null || val === undefined || val === '') return 0;
  if (typeof val === 'string') {
    val = val.replace(',', '.');
  }
  const n = Number(val);
  return isNaN(n) ? 0 : n;
};

const getPrecio = (item) => {
  const v = item?.precio_venta ?? item?.precio ?? item?.precioVenta;
  return safePriceString(v);
};

const round2 = (num) => Math.round((Number(num) || 0) * 100) / 100;

// ─── COMPONENTE PRINCIPAL ──────────────────────────────────────────────────
export default function PosScreen() {
  const {
    recetas,
    mesas,
    productos,
    getIva,
    showToast,
    configuracion,
    registrarComandaKDS,
    registrarAuditoria,
    turnos,
  } = useAppStore();

  const { enqueueAction, descontarStockVenta, registrarVisitaCliente } =
    useSyncStore();
  const { user } = useAuthStore();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const mesaId = searchParams.get('mesa');
  const mesaActual = useMemo(
    () => (mesas || []).find((m) => String(m.id) === String(mesaId)),
    [mesas, mesaId],
  );
  const isMesa = Boolean(mesaActual);

  // Rol del usuario (gancho preparado; hoy admin lo ve todo). Cuando exista el
  // sistema de PIN, un mesero no verá el botón de cobrar en mesa.
  const rolActivo = (user?.rol || user?.puesto || '').toLowerCase();
  const esMesero = rolActivo.includes('mesero');

  // Salida del POS por rol (deuda #1 del traspaso): navigate(-1) era ambiguo
  // para quien aterriza DIRECTO en /pos (historial vacío) y /dashboard
  // hardcodeado expulsaba a roles cuyo guard lo rechaza. Regla:
  //  - En mesa → volver al mapa de mesas (origen natural del flujo).
  //  - Mostrador: empleado → su ruta inicial; admin → /dashboard.
  const salirDelPos = () => {
    if (isMesa) {
      navigate('/mesas');
      return;
    }
    let destino = '/dashboard';
    try {
      const { empleadoActivo, getRutaInicial } = useSessionStore.getState();
      if (empleadoActivo) destino = getRutaInicial?.() || '/mesas';
    } catch {
      /* sesión admin o store no hidratado: /dashboard */
    }
    // Nunca navegar al propio POS (se quedaría atrapado): fallback a /mesas.
    navigate(destino === '/pos' ? '/mesas' : destino);
  };

  const [carrito, setCarrito] = useState([]);
  const [categoriaActiva, setCategoriaActiva] = useState('Todas');
  const [isProcessing, setIsProcessing] = useState(false);
  const [showModalCobro, setShowModalCobro] = useState(false);
  const [mostrarGateStock, setMostrarGateStock] = useState(false);
  const [subsVenta, setSubsVenta] = useState({});
  // Gate de inventario: 'cobro' (venta directa) o 'produccion' (mesa → A Producción).
  const [gateContext, setGateContext] = useState('cobro');
  const [gateItems, setGateItems] = useState([]); // delta a producir (modo producción)

  const intentarCobrar = () => {
    // Aviso si hay rondas en producción/listas que aún no se entregan a la mesa.
    if (
      isMesa &&
      hayRondasSinEntregar(
        useAppStore.getState().comandas_activas,
        mesaActual.id,
      )
    ) {
      const seguir = window.confirm(
        'Hay comida que aún no se entrega a la mesa. ¿Cobrar de todas formas?',
      );
      if (!seguir) return;
    }
    // MESA: el inventario ya se corroboró y descontó al mandar A PRODUCCIÓN.
    // El cobro no vuelve a tocar stock → va directo al modal de cobro.
    if (isMesa) {
      setShowModalCobro(true);
      return;
    }
    // VENTA DIRECTA: se vende y se corrobora inventario aquí (antes de cobrar).
    const problemas = verificarStock(carrito, productos, subsVenta);
    setGateContext('cobro');
    if (problemas.length > 0) setMostrarGateStock(true);
    else setShowModalCobro(true);
  };
  const onConfirmarGateStock = (subs) => {
    setSubsVenta(subs);
    setMostrarGateStock(false);
    if (gateContext === 'produccion') {
      ejecutarProduccion(gateItems, subs);
    } else {
      setShowModalCobro(true);
    }
  };
  const [ticketGenerado, setTicketGenerado] = useState(null);

  useEffect(() => {
    if (isMesa && mesaActual?.orden_actual?.items) {
      const itemsSanitizados = mesaActual.orden_actual.items.map((item) => ({
        ...item,
        precio: safePriceString(item?.precio),
        cantidad: safeNumber(item?.cantidad, 1),
        cantidad_enviada: safeNumber(item?.cantidad_enviada, 0),
      }));
      setCarrito(itemsSanitizados);
    } else {
      setCarrito([]);
    }
  }, [mesaId, isMesa, mesaActual]);

  const menuList = recetas || [];
  const categoriasUnicas = [
    'Todas',
    ...new Set(menuList.map((p) => p.categoria || 'Sin Categoría')),
  ];
  const productosFiltrados = menuList.filter(
    (p) => categoriaActiva === 'Todas' || p.categoria === categoriaActiva,
  );

  const ivaRaw = safeNumber(getIva?.(), 0.16);
  const preciosIncluyenIva = configuracion?.precios_incluyen_iva ?? true;

  const lineasCarrito = carrito.map((i) => ({
    precio: getPrecio(i),
    cantidad: safeNumber(i?.cantidad, 0),
  }));
  const {
    subtotal,
    iva: totalIva,
    total: granTotal,
  } = calcularVenta({
    items: lineasCarrito,
    ivaRate: ivaRaw,
    preciosIncluyenIva,
  });

  // ─── ACCIONES DEL CARRITO ────────────────────────────────────────────────
  const handleCambiarComensales = (delta) => {
    if (!isMesa) return;
    const actuales = safeNumber(mesaActual.comensales_reales, 1);
    const nuevos = Math.max(1, actuales + delta);
    if (nuevos === actuales) return;

    const mesaActualizada = { ...mesaActual, comensales_reales: nuevos };
    enqueueAction('mesas', 'upsert', mesaActualizada);
    useAppStore.setState((prev) => ({
      mesas: prev.mesas.map((m) =>
        m.id === mesaActual.id ? mesaActualizada : m,
      ),
    }));
  };

  const agregarAlCarrito = (producto) => {
    const productoSanitizado = {
      ...producto,
      precio: getPrecio(producto),
      cantidad_enviada: 0,
    };
    setCarrito((prev) => {
      const existe = prev.find((item) => item.id === productoSanitizado.id);
      if (existe) {
        return prev.map((item) =>
          item.id === productoSanitizado.id
            ? { ...item, cantidad: safeNumber(item.cantidad, 0) + 1 }
            : item,
        );
      }
      return [...prev, { ...productoSanitizado, cantidad: 1 }];
    });
  };

  const modificarCantidad = (id, delta) => {
    setCarrito((prev) =>
      prev.map((item) => {
        if (item.id === id) {
          const nuevaCantidad = safeNumber(item.cantidad, 0) + delta;
          if (nuevaCantidad < (item.cantidad_enviada || 0)) {
            showToast(
              `Ya hay ${item.cantidad_enviada} en preparación. Cancélalo con perfil de Gerente.`,
              'error',
            );
            return item;
          }
          return nuevaCantidad > 0
            ? { ...item, cantidad: nuevaCantidad }
            : item;
        }
        return item;
      }),
    );
  };

  const removerDelCarrito = (id) => {
    const itemEnCarrito = carrito.find((i) => i.id === id);
    if (itemEnCarrito && (itemEnCarrito.cantidad_enviada || 0) > 0) {
      showToast(
        'No puedes eliminar un platillo que ya está en la cocina.',
        'error',
      );
      return;
    }
    setCarrito((prev) => prev.filter((item) => item.id !== id));
  };

  // ─── COMANDAS Y PAGOS ────────────────────────────────────────────────────
  // MESA: al mandar A PRODUCCIÓN se corrobora inventario y se descuenta el stock
  // del DELTA (solo lo nuevo de esta ronda). El insumo se consume al cocinar.
  const handleGuardarEnMesa = () => {
    if (!isMesa || carrito.length === 0) return;

    // Delta: lo aún no enviado, preservando la estructura del item para que el
    // motor de stock expanda recetas → insumos por id.
    const deltaCarrito = carrito
      .filter((item) => item.cantidad > (item.cantidad_enviada || 0))
      .map((item) => ({
        ...item,
        cantidad: item.cantidad - (item.cantidad_enviada || 0),
      }));

    if (deltaCarrito.length === 0) {
      showToast('No hay productos nuevos para enviar', 'info');
      return;
    }

    // Corroborar inventario del delta. Si falta algo → gate de sustituciones.
    const problemas = verificarStock(deltaCarrito, productos, subsVenta);
    if (problemas.length > 0) {
      setGateItems(deltaCarrito);
      setGateContext('produccion');
      setMostrarGateStock(true);
      return;
    }
    ejecutarProduccion(deltaCarrito, subsVenta);
  };

  // Envía el delta a producción: crea comanda KDS, DESCUENTA stock (al cocinar),
  // marca el carrito como enviado y deja la mesa ocupada.
  const ejecutarProduccion = (deltaCarrito, subs) => {
    const itemsParaCocina = deltaCarrito.map((item) => ({
      id: item.id ? `${item.id}` : `${item.nombre}-${Date.now()}`,
      nombre: item.nombre,
      cantidad: item.cantidad,
      destino: configuracion?.enrutamiento?.[item.categoria] || 'Cocina',
      estado: 'pendiente',
      nota: item.nota || '',
    }));

    const nuevaComanda = {
      id: `CMD-${Date.now()}`,
      restaurante_id: useAuthStore.getState().restauranteId, // RLS
      folio: `CMD-${Date.now().toString().slice(-5)}`,
      mesa: mesaActual.nombre,
      mesa_id: mesaActual.id,
      mesero: user?.nombre ?? 'Sistema',
      fecha_hora: new Date().toISOString(),
      items: itemsParaCocina,
      estado: 'preparando',
    };
    enqueueAction('comandas', 'insert', nuevaComanda);
    registrarComandaKDS(nuevaComanda);

    // Inventario: se descuenta AL PRODUCIR (no al cobrar). Solo el delta.
    descontarStockVenta(deltaCarrito, subs);

    const carritoMarcado = carrito.map((item) => ({
      ...item,
      cantidad_enviada: item.cantidad,
    }));
    const mesaActualizada = {
      ...mesaActual,
      estado: 'ocupada',
      orden_actual: { items: carritoMarcado, subtotal, total: granTotal },
    };
    enqueueAction('mesas', 'upsert', mesaActualizada);
    useAppStore.setState((prev) => ({
      mesas: prev.mesas.map((m) =>
        m.id === mesaActual.id ? mesaActualizada : m,
      ),
    }));

    setSubsVenta({});
    setGateItems([]);
    setGateContext('cobro');
    showToast('Comanda enviada a producción', 'success');
    navigate('/mesas');
  };

  const handlePedirCuenta = () => {
    if (!isMesa || carrito.length === 0) return;

    const mesaActualizada = {
      ...mesaActual,
      estado: 'por_cobrar',
      orden_actual: { items: carrito, subtotal, total: granTotal },
    };
    enqueueAction('mesas', 'upsert', mesaActualizada);
    useAppStore.setState((prev) => ({
      mesas: prev.mesas.map((m) =>
        m.id === mesaActual.id ? mesaActualizada : m,
      ),
    }));

    showToast('Cuenta solicitada. Notificando a caja...', 'info');
    setTimeout(() => {
      navigate('/mesas');
    }, 1500);
  };

  const handleProcesarVenta = async (datosPago) => {
    setIsProcessing(true);
    const isParcial = datosPago?.isCobroParcial;
    let itemsTicket = carrito;
    let carritoRestante = [];

    if (isParcial) {
      itemsTicket = [];
      carrito.forEach((item) => {
        const cantPagada = datosPago.seleccion[item.id] || 0;
        if (cantPagada > 0) itemsTicket.push({ ...item, cantidad: cantPagada });

        const cantRestante = safeNumber(item.cantidad, 0) - cantPagada;
        if (cantRestante > 0) {
          carritoRestante.push({
            ...item,
            cantidad: cantRestante,
            cantidad_enviada: Math.max(
              0,
              safeNumber(item.cantidad_enviada, 0) - cantPagada,
            ),
          });
        }
      });
    }

    const lineasTicket = itemsTicket.map((i) => ({
      precio: getPrecio(i),
      cantidad: safeNumber(i?.cantidad, 0),
    }));
    const fiscalTicket = calcularVenta({
      items: lineasTicket,
      ivaRate: ivaRaw,
      preciosIncluyenIva,
      propinaMonto: safeNumber(datosPago?.propina, 0),
      // Descuento autorizado en ModalCobro (% ya normalizado): el motor
      // reduce la base gravable y recalcula el IVA sobre la base neta.
      descuentoPct: safeNumber(datosPago?.descuentoPct, 0),
    });
    const subtotalTicket = fiscalTicket.subtotal;
    const ivaTicket = fiscalTicket.iva;
    const granTotalTicket = fiscalTicket.total;

    const pagosDetalle = datosPago?.pagosDetalle || [];
    const montoEfectivo = round2(
      pagosDetalle
        .filter((p) => p.metodo.toLowerCase() === 'efectivo')
        .reduce((acc, p) => acc + safeNumber(p.monto), 0),
    );
    const montoTarjeta = round2(
      pagosDetalle
        .filter((p) => p.metodo.toLowerCase() === 'tarjeta')
        .reduce((acc, p) => acc + safeNumber(p.monto), 0),
    );
    const montoTransferencia = round2(
      pagosDetalle
        .filter((p) => p.metodo.toLowerCase() === 'transferencia')
        .reduce((acc, p) => acc + safeNumber(p.monto), 0),
    );

    const turnoActivo =
      (turnos || []).find((t) => t.estado === 'abierto') || null;

    const nuevaVentaBD = {
      id: Date.now(),
      restaurante_id: useAuthStore.getState().restauranteId,
      turno_id: turnoActivo?.id ?? null,
      folio: `POS-${Date.now().toString().slice(-5)}`,
      items: itemsTicket,
      subtotal: subtotalTicket,
      iva: ivaTicket,
      descuento: fiscalTicket.descuento,
      total: granTotalTicket,
      metodo_pago:
        pagosDetalle.length > 1
          ? 'mixto'
          : pagosDetalle[0]?.metodo?.toLowerCase() || 'efectivo',
      efectivo: montoEfectivo,
      tarjeta: montoTarjeta,
      transferencia: montoTransferencia,
      usuario: user?.nombre ?? 'Sistema',
      fecha: new Date().toISOString(),
      propina: fiscalTicket.propina,
      mesa: isMesa ? mesaActual.id : null,
      // CRM: asociación opcional hecha en ModalCobro (null = mostrador).
      cliente_id: datosPago?.clienteId ?? null,
    };

    const ventaVisual = {
      ...nuevaVentaBD,
      iva: ivaTicket,
      cambio_entregado: safeNumber(datosPago?.cambio, 0),
      mesa_nombre: isMesa ? mesaActual.nombre : 'Directa',
      _quedaGente: isParcial && carritoRestante.length > 0,
    };

    enqueueAction('ventas', 'insert', nuevaVentaBD);
    useAppStore.setState((prev) => ({
      ventas: [...(prev.ventas || []), nuevaVentaBD],
    }));
    // CRM: acumular visita/gasto/puntos DESPUÉS de encolar la venta (la cola
    // es FIFO: la fila de ventas ya existirá cuando la RPC corra en el server).
    if (nuevaVentaBD.cliente_id) {
      registrarVisitaCliente(
        nuevaVentaBD.id,
        nuevaVentaBD.cliente_id,
        granTotalTicket,
      );
    }
    // Inventario: en MESA ya se descontó al mandar a producción. Solo la VENTA
    // DIRECTA descuenta aquí (se vende, se corrobora y luego se prepara).
    if (!isMesa) {
      descontarStockVenta(itemsTicket, subsVenta);
    }

    registrarAuditoria({
      id: Date.now(),
      fecha: new Date().toISOString(),
      usuario: user?.nombre || 'Sistema',
      accion: 'COBRO_TICKET',
      modulo: 'POS',
      nivel: fiscalTicket.descuento > 0 ? 'warning' : 'info',
      detalles: `Folio ${nuevaVentaBD.folio} cobrado. Total: $${granTotalTicket}${
        fiscalTicket.descuento > 0
          ? ` | Descuento: $${fiscalTicket.descuento} autorizado por ${datosPago?.descuentoAutorizadoPor || 'sesión de gestión'}`
          : ''
      }`,
    });

    if (isMesa) {
      if (ventaVisual._quedaGente) {
        const mesaActualizada = {
          ...mesaActual,
          estado: 'ocupada',
          orden_actual: {
            items: carritoRestante,
            total: calcularVenta({
              items: carritoRestante.map((it) => ({
                precio: getPrecio(it),
                cantidad: safeNumber(it.cantidad, 0),
              })),
              ivaRate: ivaRaw,
              preciosIncluyenIva,
            }).total,
          },
        };
        enqueueAction('mesas', 'upsert', mesaActualizada);
        useAppStore.setState((prev) => ({
          mesas: prev.mesas.map((m) =>
            m.id === mesaActual.id ? mesaActualizada : m,
          ),
        }));
        setCarrito(carritoRestante);
      } else {
        const mesaLiberada = {
          ...mesaActual,
          estado: 'libre',
          comensales_reales: 0,
          orden_actual: null,
        };
        enqueueAction('mesas', 'upsert', mesaLiberada);

        // Cerrar las comandas activas de esta mesa al cobrar: salen de la fila
        // del KDS y del panel de rondas (estado 'completada').
        const comandasMesa = (
          useAppStore.getState().comandas_activas || []
        ).filter(
          (c) =>
            String(c.mesa_id) === String(mesaActual.id) &&
            !['completada', 'cancelada'].includes(c.estado),
        );
        comandasMesa.forEach((c) => {
          enqueueAction('comandas', 'upsert', { ...c, estado: 'completada' });
        });

        // Si era una mesa principal de un grupo, liberar también las satélites.
        const satelites = (useAppStore.getState().mesas || []).filter(
          (m) => String(m.mesa_principal_id) === String(mesaActual.id),
        );
        satelites.forEach((s) => {
          const liberada = {
            ...s,
            estado: 'libre',
            mesa_principal_id: null,
            orden_actual: null,
            comensales_reales: 0,
          };
          enqueueAction('mesas', 'upsert', liberada);
        });

        useAppStore.setState((prev) => ({
          mesas: prev.mesas.map((m) => {
            if (String(m.id) === String(mesaActual.id)) return mesaLiberada;
            if (String(m.mesa_principal_id) === String(mesaActual.id))
              return {
                ...m,
                estado: 'libre',
                mesa_principal_id: null,
                orden_actual: null,
                comensales_reales: 0,
              };
            return m;
          }),
          comandas_activas: prev.comandas_activas.filter(
            (c) => String(c.mesa_id) !== String(mesaActual.id),
          ),
        }));
        setCarrito([]);
      }
    } else {
      setCarrito([]);
    }

    setShowModalCobro(false);
    setSubsVenta({});
    setIsProcessing(false);
    setTicketGenerado(ventaVisual);
  };

  const handleCerrarTicket = () => {
    const quedaGente = ticketGenerado?._quedaGente;
    setTicketGenerado(null);
    if (quedaGente)
      showToast(
        'Ticket individual cobrado. La mesa sigue abierta para el resto.',
        'success',
      );
    else if (isMesa) navigate('/mesas');
    else showToast('¡Venta de mostrador cerrada!', 'success');
  };

  return (
    <div className="h-screen flex flex-col lg:flex-row bg-slate-50 dark:bg-ui-obsidiana font-sans overflow-hidden text-slate-800 dark:text-ui-text transition-colors duration-500">
      {/* ─── PANEL IZQUIERDO: MENÚ DE PRODUCTOS ─── */}
      <div className="flex-1 flex flex-col h-[50vh] lg:h-screen border-r border-slate-200 dark:border-ui-border bg-slate-50 dark:bg-ui-obsidiana transition-colors duration-500">
        <div className="bg-white dark:bg-ui-humo p-5 border-b border-slate-200 dark:border-ui-border flex items-center justify-between shadow-sm z-10 transition-colors duration-500">
          <div className="flex items-center gap-4">
            <button
              onClick={salirDelPos}
              className="p-2 hover:bg-slate-100 dark:hover:bg-ui-border rounded-xl text-slate-500 dark:text-ui-muted hover:text-slate-800 dark:hover:text-brand-nacar transition-colors"
            >
              <ArrowLeft className="w-6 h-6" />
            </button>
            <div>
              <h1 className="text-xl font-black font-syne text-slate-900 dark:text-brand-nacar">
                Catálogo de Venta
              </h1>
              <p className="text-xs font-bold text-slate-500 dark:text-ui-muted uppercase tracking-widest">
                {productosFiltrados.length} listos
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-ui-humo px-4 py-3 border-b border-slate-200 dark:border-ui-border flex gap-3 overflow-x-auto custom-scrollbar shrink-0 transition-colors duration-500">
          {categoriasUnicas.map((cat) => (
            <button
              key={cat}
              onClick={() => setCategoriaActiva(cat)}
              className={`px-5 py-2.5 rounded-xl font-black text-sm whitespace-nowrap transition-all border ${
                categoriaActiva === cat
                  ? 'bg-brand-arrecife text-white dark:text-brand-nacar shadow-lg shadow-brand-arrecife/30 border-brand-arrecife'
                  : 'bg-slate-50 dark:bg-ui-obsidiana text-slate-500 dark:text-ui-muted border-transparent hover:border-slate-200 dark:hover:border-ui-border hover:text-slate-800 dark:hover:text-brand-nacar'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-5 custom-scrollbar bg-slate-50 dark:bg-ui-obsidiana transition-colors duration-500">
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-4">
            {productosFiltrados.map((prod) => (
              <button
                key={prod.id}
                onClick={() => agregarAlCarrito(prod)}
                className="bg-white dark:bg-ui-humo border-2 border-slate-100 dark:border-ui-border p-5 rounded-brand flex flex-col items-center justify-center text-center gap-3 hover:border-brand-amatista dark:hover:border-brand-amatista hover:shadow-lg hover:-translate-y-1 transition-all group"
              >
                <div className="w-16 h-16 bg-slate-50 dark:bg-ui-obsidiana rounded-full flex items-center justify-center group-hover:bg-brand-amatista/10 dark:group-hover:bg-brand-amatista/20 transition-colors">
                  <Utensils className="w-6 h-6 text-slate-400 dark:text-ui-muted group-hover:text-brand-amatista transition-colors" />
                </div>
                <div>
                  <p className="font-black text-slate-800 dark:text-brand-nacar text-sm leading-tight line-clamp-2">
                    {prod.nombre}
                  </p>
                  <p className="text-emerald-600 dark:text-brand-cesped font-black mt-2 text-lg">
                    $
                    {getPrecio(prod).toLocaleString('es-MX', {
                      minimumFractionDigits: 2,
                    })}
                  </p>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ─── PANEL DERECHO: TICKET / CARRITO ─── */}
      <div className="w-full lg:w-[400px] xl:w-[450px] flex flex-col h-[50vh] lg:h-screen bg-white dark:bg-ui-humo shadow-2xl z-20 border-l border-slate-200 dark:border-ui-border transition-colors duration-500">
        <div
          className={`p-6 flex items-center justify-between border-b border-slate-200 dark:border-ui-border transition-colors duration-500 ${isMesa ? 'bg-brand-arrecife/5 dark:bg-brand-arrecife/10' : 'bg-slate-50 dark:bg-ui-obsidiana'}`}
        >
          <div className="flex items-center gap-3 text-slate-800 dark:text-brand-nacar">
            {isMesa ? (
              <ChefHat
                className={`w-7 h-7 ${isMesa ? 'text-brand-arrecife' : 'text-indigo-500 dark:text-brand-amatista'}`}
              />
            ) : (
              <ShoppingCart className="w-7 h-7 text-indigo-500 dark:text-brand-amatista" />
            )}
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-ui-muted mb-0.5">
                {isMesa ? 'Comanda para' : 'Venta Rápida'}
              </p>
              <h2 className="text-xl font-black font-syne tracking-tight leading-none">
                {isMesa ? mesaActual.nombre : 'Mostrador'}
              </h2>
            </div>
          </div>

          {isMesa && (
            <div className="flex items-center gap-2 bg-white dark:bg-ui-obsidiana px-3 py-1.5 rounded-xl border border-slate-200 dark:border-ui-border">
              <Users className="w-4 h-4 text-slate-400 dark:text-ui-muted" />
              <button
                onClick={() => handleCambiarComensales(-1)}
                className="w-6 h-6 flex items-center justify-center hover:bg-slate-100 dark:hover:bg-ui-border rounded-lg text-lg font-black leading-none active:scale-95 text-slate-700 dark:text-brand-nacar"
              >
                -
              </button>
              <span className="font-black text-sm w-4 text-center text-brand-arrecife">
                {safeNumber(mesaActual?.comensales_reales, 1)}
              </span>
              <button
                onClick={() => handleCambiarComensales(1)}
                className="w-6 h-6 flex items-center justify-center hover:bg-slate-100 dark:hover:bg-ui-border rounded-lg text-lg font-black leading-none active:scale-95 text-slate-700 dark:text-brand-nacar"
              >
                +
              </button>
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-3 custom-scrollbar bg-slate-50/50 dark:bg-ui-obsidiana/50 transition-colors duration-500">
          {carrito.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-slate-400 dark:text-ui-muted">
              <ReceiptText className="w-20 h-20 mb-6 opacity-30" />
              <p className="font-black text-center text-lg font-syne uppercase tracking-widest opacity-50">
                Comanda Vacía
              </p>
              <p className="font-bold text-center mt-2 text-sm">
                Selecciona productos del menú
              </p>
            </div>
          ) : (
            carrito.map((item) => (
              <div
                key={item.id}
                className="bg-white dark:bg-ui-humo border border-slate-200 dark:border-ui-border p-4 rounded-2xl flex gap-3 hover:border-brand-amatista/30 transition-colors"
              >
                <div className="flex-1">
                  <h4 className="font-black text-slate-800 dark:text-brand-nacar text-sm leading-tight">
                    {item.nombre}
                  </h4>
                  <p className="text-emerald-600 dark:text-brand-cesped font-black text-sm mt-1">
                    $
                    {round2(
                      getPrecio(item) * safeNumber(item.cantidad, 0),
                    ).toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                  </p>
                  {(item.cantidad_enviada || 0) > 0 && (
                    <span className="text-[10px] font-black text-amber-600 dark:text-brand-ambar bg-amber-50 dark:bg-brand-ambar/10 border border-amber-200 dark:border-brand-ambar/20 px-2 py-1 rounded-md mt-2 inline-block uppercase tracking-widest">
                      Enviado: {item.cantidad_enviada}
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-1 bg-slate-50 dark:bg-ui-obsidiana border border-slate-200 dark:border-ui-border p-1 rounded-xl shrink-0 h-fit">
                  <button
                    onClick={() => modificarCantidad(item.id, -1)}
                    className="w-8 h-8 bg-white dark:bg-ui-humo text-slate-700 dark:text-brand-nacar rounded-lg flex items-center justify-center active:scale-95 hover:bg-slate-100 dark:hover:bg-ui-border transition-colors shadow-sm dark:shadow-none"
                  >
                    <Minus className="w-4 h-4" />
                  </button>
                  <span className="w-8 text-center font-black text-slate-800 dark:text-brand-nacar">
                    {safeNumber(item.cantidad, 0)}
                  </span>
                  <button
                    onClick={() => modificarCantidad(item.id, 1)}
                    className="w-8 h-8 bg-white dark:bg-ui-humo text-slate-700 dark:text-brand-nacar rounded-lg flex items-center justify-center active:scale-95 hover:bg-slate-100 dark:hover:bg-ui-border transition-colors shadow-sm dark:shadow-none"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>

                <button
                  onClick={() => removerDelCarrito(item.id)}
                  className="w-10 h-10 flex items-center justify-center text-rose-500 dark:text-brand-arrecife/80 hover:bg-rose-50 dark:hover:bg-brand-arrecife/20 hover:text-rose-600 dark:hover:text-brand-arrecife rounded-xl transition-colors shrink-0"
                >
                  <Trash2 className="w-5 h-5" />
                </button>
              </div>
            ))
          )}
        </div>

        {/* Panel de Rondas: estado dinámico de las comandas enviadas a producción */}
        {isMesa && (
          <div className="border-t border-slate-200 dark:border-ui-border bg-white dark:bg-ui-humo max-h-[40vh] overflow-y-auto custom-scrollbar shrink-0">
            <PanelRondas mesaId={mesaActual.id} />
          </div>
        )}

        <div className="p-6 bg-white dark:bg-ui-humo border-t border-slate-200 dark:border-ui-border transition-colors duration-500">
          <div className="space-y-3 mb-6">
            <div className="flex justify-between text-slate-500 dark:text-ui-muted font-bold text-sm">
              <span>Subtotal</span>
              <span>
                $
                {subtotal.toLocaleString('es-MX', {
                  minimumFractionDigits: 2,
                })}
              </span>
            </div>
            <div className="flex justify-between text-slate-500 dark:text-ui-muted font-bold text-sm">
              <span>IVA ({ivaRaw * 100}%)</span>
              <span>
                $
                {totalIva.toLocaleString('es-MX', {
                  minimumFractionDigits: 2,
                })}
              </span>
            </div>
            <div className="flex justify-between text-slate-900 dark:text-brand-nacar font-black text-3xl pt-4 border-t border-slate-200 dark:border-ui-border border-dashed">
              <span>Total</span>
              <span className="text-emerald-500 dark:text-brand-cesped">
                $
                {granTotal.toLocaleString('es-MX', {
                  minimumFractionDigits: 2,
                })}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3">
            {isMesa && (
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={handleGuardarEnMesa}
                  disabled={carrito.length === 0}
                  className="w-full bg-slate-100 dark:bg-ui-obsidiana hover:bg-slate-200 dark:hover:bg-ui-border border border-slate-200 dark:border-ui-border disabled:opacity-50 text-slate-800 dark:text-brand-nacar font-black py-4 rounded-xl flex items-center justify-center gap-2 transition-all active:scale-95 text-sm"
                >
                  <ChefHat className="w-5 h-5 text-indigo-500 dark:text-brand-amatista" />{' '}
                  A Producción
                </button>

                <button
                  onClick={handlePedirCuenta}
                  disabled={carrito.length === 0}
                  className="w-full bg-indigo-50 dark:bg-brand-amatista/10 hover:bg-indigo-100 dark:hover:bg-brand-amatista/20 border border-indigo-200 dark:border-brand-amatista/30 disabled:opacity-50 text-indigo-600 dark:text-brand-amatista font-black py-4 rounded-xl flex items-center justify-center gap-2 transition-all active:scale-95 text-sm"
                >
                  <BellRing className="w-5 h-5" /> Pedir Cuenta
                </button>
              </div>
            )}

            {!(isMesa && esMesero) && (
              <button
                onClick={intentarCobrar}
                disabled={carrito.length === 0 || isProcessing}
                className={`w-full font-black py-5 rounded-xl shadow-lg flex items-center justify-center gap-2 transition-all active:scale-95 text-lg ${
                  isMesa
                    ? 'bg-brand-arrecife text-white dark:text-brand-nacar shadow-brand-arrecife/20 hover:bg-orange-600'
                    : 'bg-emerald-500 dark:bg-brand-cesped text-white dark:text-ui-obsidiana shadow-emerald-500/20 dark:shadow-brand-cesped/20 hover:bg-emerald-600 dark:hover:bg-[#00c98c]'
                } disabled:opacity-50 disabled:shadow-none`}
              >
                <CreditCard className="w-6 h-6" />
                {isProcessing
                  ? 'Procesando...'
                  : isMesa
                    ? 'Cerrar Mesa y Cobrar'
                    : 'Cobrar Ticket'}
              </button>
            )}
          </div>
        </div>
      </div>

      {mostrarGateStock && (
        <ConfirmacionStockModal
          carrito={gateContext === 'produccion' ? gateItems : carrito}
          productos={productos}
          onConfirmar={onConfirmarGateStock}
          onCancel={() => setMostrarGateStock(false)}
        />
      )}
      {showModalCobro && (
        <ModalCobro
          total={granTotal}
          comensales={isMesa ? safeNumber(mesaActual?.comensales_reales, 1) : 1}
          carrito={carrito}
          onClose={() => setShowModalCobro(false)}
          onProcesarPago={handleProcesarVenta}
        />
      )}

      {ticketGenerado && (
        <TicketImpresion venta={ticketGenerado} onClose={handleCerrarTicket} />
      )}
    </div>
  );
}
