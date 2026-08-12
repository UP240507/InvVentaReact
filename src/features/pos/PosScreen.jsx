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
  X,
  Package,
  Percent,
} from 'lucide-react';
import ModalCobro from '../operacion/components/ModalCobro';
import TicketImpresion from './components/TicketImpresion';
import PanelRondas, { hayRondasSinEntregar } from '../operacion/PanelRondas';
import { calcularVenta, importeDeLinea } from '../../lib/Fiscal';
import {
  verificarStock,
  esPaquete,
  expandirInsumosPaquete,
  tieneElecciones,
  gruposDeEleccion,
  resolverComponentesPaquete,
  construirItemsComanda,
} from '../../lib/Inventario';
import ConfirmacionStockModal from './components/ConfirmacionStockModal';
import DescuentoLineaModal from './components/DescuentoLineaModal';
import { etiquetaDescuento } from '../../lib/Descuentos';
import { enviarComanda, enviarTicket, enviarPreCuenta } from '../../lib/Hub';
import { debeImprimirComanda } from '../../lib/Comanda';
import { siguienteFolio, SERIE_VENTA, SERIE_COMANDA } from '../../lib/Folio';
import { siguienteIdVenta, siguienteIdComanda } from '../../lib/IdVenta';
import { useAtajos } from '../../hooks/useAtajos';
import {
  useConectividad,
  motivoSinImpresion,
} from '../../hooks/useConectividad';
import PanelAcoplable from '../../components/PanelAcoplable';
import HintsAtajos from '../../components/HintsAtajos';
import { OpsButton, OpsModal } from '../../components/ui';

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
    staff,
    roles_permisos,
  } = useAppStore();

  const {
    enqueueAction,
    llegoALaNube,
    descontarStockVenta,
    registrarVisitaCliente,
    canjearPuntosCliente,
  } = useSyncStore();

  /**
   * El papel de cocina sólo si hace falta.
   *
   * `enqueueAction` devuelve el id de la tarea; `llegoALaNube` espera un poco a
   * ver si sube. Si subió, el KDS ya la tiene por realtime y el papel sobra —
   * salvo que el local no tenga pantallas, que es lo que dice el ajuste.
   *
   * Nada de esto bloquea al mesero: se resuelve en segundo plano mientras la
   * comanda ya viajó al KDS y quedó en Dexie.
   */
  const imprimirComandaSiHaceFalta = (comanda, idTarea) => {
    void (async () => {
      const modo = configuracion?.imprimir_comandas || 'siempre';
      // Con `siempre` no se espera a nadie: el papel sale ya, que es lo que
      // necesita una cocina sin pantalla.
      const llego = modo === 'sin_nube' ? await llegoALaNube(idTarea) : false;
      if (!debeImprimirComanda(modo, llego)) return;

      const r = await enviarComanda(comanda, configuracion);
      if (!r?.ok && r?.total > 0) {
        showToast(avisoDeImpresion('La comanda'), 'info');
      }
    })();
  };
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

  // Sólo se mira en pantallas estrechas: en tablet y escritorio el carrito es
  // una columna fija y nunca se cierra. Ver `PanelAcoplable`.
  const [carritoAbierto, setCarritoAbierto] = useState(false);
  const [mostrarGateStock, setMostrarGateStock] = useState(false);
  const [subsVenta, setSubsVenta] = useState({});
  // Gate de inventario: 'cobro' (venta directa) o 'produccion' (mesa → A Producción).
  const [gateContext, setGateContext] = useState('cobro');
  const [gateItems, setGateItems] = useState([]); // delta a producir (modo producción)

  // Aviso de rondas sin entregar: modal PROPIO (window.confirm está vetado).
  const [modalRondasPendientes, setModalRondasPendientes] = useState(false);

  const continuarCobro = () => {
    setModalRondasPendientes(false);
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

  const intentarCobrar = () => {
    // Aviso si hay rondas en producción/listas que aún no se entregan a la mesa.
    if (
      isMesa &&
      hayRondasSinEntregar(
        useAppStore.getState().comandas_activas,
        mesaActual.id,
      )
    ) {
      setModalRondasPendientes(true);
      return;
    }
    continuarCobro();
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

  // Las DOS conectividades. Aquí sólo interesa la local: sin hub no hay papel,
  // pero la venta se registra igual y sincroniza por su cuenta.
  const { local, comprobandoLocal } = useConectividad();

  /**
   * Qué decirle al mesero cuando el papel no sale.
   *
   * Los mensajes que había mentían en el caso más común. «La comanda quedó en
   * la cola de impresión» es falso si el teléfono está fuera de rango: no quedó
   * en ninguna cola, el POST ni siquiera salió del aparato. Y «revisa la
   * impresora» manda a mirar un aparato que está perfectamente — el que se
   * movió fue el teléfono.
   *
   * La diferencia importa porque cada mensaje pide una acción distinta: uno
   * dice «espera», otro «ve a ver la impresora» y el correcto dice «acércate».
   */
  const avisoDeImpresion = (queNoSalio) => {
    const motivo = motivoSinImpresion({ local, comprobandoLocal });
    return motivo
      ? `${motivo}: ${queNoSalio} no se imprimió. La venta sí quedó registrada.`
      : `${queNoSalio} quedó en la cola de impresión.`;
  };

  const ivaRaw = safeNumber(getIva?.(), 0.16);
  const preciosIncluyenIva = configuracion?.precios_incluyen_iva ?? true;

  // El descuento de línea viaja al motor: es el motor quien decide cómo afecta
  // a la base gravable, no la pantalla.
  const lineasCarrito = carrito.map((i) => ({
    precio: getPrecio(i),
    cantidad: safeNumber(i?.cantidad, 0),
    descuento: i?.descuento ?? null,
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

  // PAQUETE CON ELECCIONES: el mesero elige 1 opción por grupo antes de que
  // el combo entre al carrito. { paquete, seleccion: {grupo: recetaId} } | null
  const [modalElecciones, setModalElecciones] = useState(null);

  const agregarAlCarrito = (producto) => {
    // Paquete con grupos "elige 1 de N" → primero se resuelven las elecciones.
    if (esPaquete(producto) && tieneElecciones(producto)) {
      setModalElecciones({ paquete: producto, seleccion: {} });
      return;
    }
    const productoSanitizado = {
      ...producto,
      precio: getPrecio(producto),
      cantidad_enviada: 0,
      // PAQUETE: insumos expandidos AL VUELO desde las recetas componentes
      // vivas (nunca desnormalizados). El item viaja con el shape que el
      // motor de stock y el gate de sustituciones ya entienden.
      ...(esPaquete(producto)
        ? { insumos: expandirInsumosPaquete(producto, recetas) }
        : {}),
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

  const confirmarElecciones = () => {
    if (!modalElecciones) return;
    const { paquete, seleccion } = modalElecciones;
    const grupos = gruposDeEleccion(paquete);
    if (grupos.some((g) => seleccion[g.grupo] == null)) return;

    // Componentes RESUELTOS (fijos + elegidos): con ellos se expande el
    // inventario y el KDS pinta el desglose real de ESTE combo.
    const resueltos = resolverComponentesPaquete(paquete, seleccion);
    const insumos = expandirInsumosPaquete(
      { ...paquete, componentes: resueltos },
      recetas,
    );
    // Línea de carrito por COMBINACIÓN: dos combos con elecciones distintas
    // son líneas distintas (id compuesto estable = paqueteId + elecciones).
    const firma = grupos
      .map((g) => `${g.grupo}=${seleccion[g.grupo]}`)
      .join('|');
    const lineId = `${paquete.id}:${firma}`;

    const item = {
      ...paquete,
      id: lineId,
      receta_id: paquete.id,
      componentes: resueltos,
      elecciones: seleccion,
      insumos,
      precio: getPrecio(paquete),
      cantidad_enviada: 0,
    };
    setCarrito((prev) => {
      const existe = prev.find((i) => i.id === lineId);
      if (existe) {
        return prev.map((i) =>
          i.id === lineId
            ? { ...i, cantidad: safeNumber(i.cantidad, 0) + 1 }
            : i,
        );
      }
      return [...prev, { ...item, cantidad: 1 }];
    });
    setModalElecciones(null);
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

  // ── DESCUENTO POR PRODUCTO ───────────────────────────────────────────────
  // Se guarda EN la línea del carrito, así viaja solo a la comanda, al ticket
  // y a la venta sin que nadie tenga que acordarse de propagarlo.
  const [lineaDescuento, setLineaDescuento] = useState(null);

  const aplicarDescuentoLinea = (id, descuento) => {
    setCarrito((prev) =>
      prev.map((it) => (it.id === id ? { ...it, descuento } : it)),
    );
    const linea = carrito.find((i) => i.id === id);
    // Auditoría: un descuento sin rastro de quién y sobre qué es justo lo que
    // convierte una promoción en una fuga.
    registrarAuditoria?.({
      accion: 'DESCUENTO_PRODUCTO',
      modulo: 'POS',
      nivel: 'warning',
      detalles: `${linea?.nombre ?? id}: ${etiquetaDescuento(descuento)} · autorizó ${descuento?.autorizadoPor ?? '—'}`,
    });
  };

  const quitarDescuentoLinea = (id) =>
    setCarrito((prev) =>
      prev.map((it) => (it.id === id ? { ...it, descuento: null } : it)),
    );

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
    // PAQUETES: se expanden en un item por componente, cada uno enrutado a la
    // estación de SU receta (café → Barra, chilaquiles → Cocina).
    const itemsParaCocina = construirItemsComanda(
      deltaCarrito,
      recetas,
      configuracion?.enrutamiento,
    );

    const nuevaComanda = {
      // Ver `lib/IdVenta.js`: con `CMD-${Date.now()}`, dos meseros mandando a
      // la misma estación en el mismo milisegundo daban el mismo `id` de
      // documento y el hub descartaba la segunda comanda como si fuera un
      // reenvío. Cocina no se enteraba, y nada fallaba.
      id: siguienteIdComanda({ nombreLocal: configuracion?.nombre_empresa }),
      restaurante_id: useAuthStore.getState().restauranteId, // RLS
      folio: siguienteFolio({
        serie: SERIE_COMANDA,
        nombreLocal: configuracion?.nombre_empresa,
      }),
      mesa: mesaActual.nombre,
      mesa_id: mesaActual.id,
      mesero: user?.nombre ?? 'Sistema',
      fecha_hora: new Date().toISOString(),
      items: itemsParaCocina,
      estado: 'preparando',
    };
    registrarComandaKDS(nuevaComanda);

    // IMPRESIÓN (fase 3): una comanda por estación, sin precios. No se espera
    // (`void`) y no se encadena al flujo: la impresora es el periférico más
    // frágil del local y no puede retrasar el envío a cocina, que ya viajó por
    // el KDS. Si falla, el aviso es informativo y el trabajo queda en la cola
    // del hub, visible en /hub.
    //
    // Y desde el 11-ago sólo sale si hace falta: con pantallas de KDS, la
    // comanda que SÍ llegó a la nube ya se está viendo, y el papel sobraba.
    void enqueueAction('comandas', 'insert', nuevaComanda).then((idTarea) =>
      imprimirComandaSiHaceFalta(nuevaComanda, idTarea),
    );

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

    // ── EL PAPEL PARA LA MESA ────────────────────────────────────────────
    // Hasta ahora «Pedir Cuenta» sólo cambiaba el estado y avisaba a caja: el
    // mesero se quedaba sin nada que dejar en la mesa, que es justamente lo que
    // el cliente espera cuando pide la cuenta.
    //
    // No se espera al resultado ni se bloquea el flujo. La regla de la fase de
    // impresión es que la impresora nunca detiene la operación: la mesa ya
    // quedó marcada como `por_cobrar` arriba, y eso —que es lo que sostiene el
    // cobro— no depende de que haya papel.
    enviarPreCuenta(
      {
        items: carrito,
        subtotal,
        iva: totalIva,
        descuento: 0,
        total: granTotal,
        mesa_id: mesaActual.id,
        mesa_nombre: mesaActual.nombre,
        comensales: safeNumber(mesaActual.comensales_reales, 0),
        usuario: user?.nombre ?? 'Mesero',
        fecha: new Date().toISOString(),
      },
      configuracion,
    ).then((r) => {
      // Sólo se avisa si falló, y sin tono de error: no imprimir la cuenta no
      // rompe nada, sólo obliga a dictarla.
      if (!r?.ok) {
        showToast(
          'No se pudo imprimir la cuenta. Revisa la impresora.',
          'info',
        );
      }
    });

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
      // El descuento de producto viaja al cobro: si no, la venta se timbraría
      // por el precio de lista y el cliente pagaría el descuento que se le
      // acababa de conceder.
      descuento: i?.descuento ?? null,
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
      // Clave primaria con carril de dispositivo, no el reloj pelado. Ver
      // `lib/IdVenta.js`: `Date.now()` lo comparten todos los teléfonos, así
      // que dos cobros simultáneos daban dos ventas distintas con la misma
      // clave. Con el respaldo del hub por delante eso dejaría de ser un 23505
      // ruidoso para convertirse en un descarte silencioso por deduplicado.
      id: siguienteIdVenta({ nombreLocal: configuracion?.nombre_empresa }),
      restaurante_id: useAuthStore.getState().restauranteId,
      turno_id: turnoActivo?.id ?? null,
      // Consecutivo por dispositivo, no un trozo del reloj. Ver `lib/Folio.js`:
      // el anterior —los últimos 5 dígitos de `Date.now()`— daba la vuelta cada
      // 100 segundos, así que dos ventas del mismo servicio podían compartir
      // folio (~18 % con 200 tickets) y además la serie no ordenaba.
      folio: siguienteFolio({
        serie: SERIE_VENTA,
        nombreLocal: configuracion?.nombre_empresa,
      }),
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

    // VENTA DIRECTA → KDS: en mostrador no hubo "mandar a producción", así que
    // la comanda nace AQUÍ al cobrar (cocina/barra preparan lo ya pagado).
    // Con paquetes expandidos por componente y enrutados a su estación.
    if (!isMesa && itemsTicket.length > 0) {
      const comandaDirecta = {
        id: siguienteIdComanda({ nombreLocal: configuracion?.nombre_empresa }),
        restaurante_id: useAuthStore.getState().restauranteId, // RLS
        folio: nuevaVentaBD.folio,
        mesa: 'Mostrador',
        mesa_id: null,
        mesero: user?.nombre ?? 'Sistema',
        fecha_hora: new Date().toISOString(),
        items: construirItemsComanda(
          itemsTicket,
          recetas,
          configuracion?.enrutamiento,
        ),
        estado: 'preparando',
      };
      registrarComandaKDS(comandaDirecta);
      void enqueueAction('comandas', 'insert', comandaDirecta).then((idTarea) =>
        imprimirComandaSiHaceFalta(comandaDirecta, idTarea),
      );
    }

    // TICKET DE COBRO. También sin esperar: el dinero ya entró y la venta ya
    // está en Dexie. Un fallo de impresión no puede revertir un cobro ni dejar
    // al cajero mirando una rueda mientras el cliente espera.
    // El ticket tampoco espera, pero ahora sí avisa: antes fallaba en silencio
    // y el cajero se quedaba mirando la impresora sin saber por qué.
    void enviarTicket(ventaVisual, configuracion).then((r) => {
      if (!r?.ok) showToast(avisoDeImpresion('El ticket'), 'info');
    });
    // CRM: acumular visita/gasto/puntos DESPUÉS de encolar la venta (la cola
    // es FIFO: la fila de ventas ya existirá cuando la RPC corra en el server).
    if (nuevaVentaBD.cliente_id) {
      registrarVisitaCliente(
        nuevaVentaBD.id,
        nuevaVentaBD.cliente_id,
        granTotalTicket,
      );
      // Lealtad: canje elegido en ModalCobro. canje_id derivado del id de la
      // venta → idempotente por diseño (ledger crm_canjes) y rastreable.
      if (datosPago?.canje?.puntos > 0) {
        canjearPuntosCliente(
          nuevaVentaBD.id,
          nuevaVentaBD.cliente_id,
          datosPago.canje.puntos,
          datosPago.canje.nombre,
        );
        registrarAuditoria({
          fecha: new Date().toISOString(),
          usuario: user?.nombre || 'Sistema',
          accion: 'CANJE_RECOMPENSA',
          modulo: 'POS',
          nivel: 'info',
          detalles: `Folio ${nuevaVentaBD.folio}: canje "${datosPago.canje.nombre}" (−${datosPago.canje.puntos} pts${
            Number(datosPago.canje.monto) > 0
              ? `, descuento $${datosPago.canje.monto}`
              : ''
          }) del cliente ${datosPago?.clienteNombre || nuevaVentaBD.cliente_id}.`,
        });
      }
    }
    // Inventario: en MESA ya se descontó al mandar a producción. Solo la VENTA
    // DIRECTA descuenta aquí (se vende, se corrobora y luego se prepara).
    if (!isMesa) {
      descontarStockVenta(itemsTicket, subsVenta);
    }

    registrarAuditoria({
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
    // La venta terminó: en teléfono la hoja del carrito no debe quedarse arriba
    // tapando el catálogo con una lista ya vacía.
    setCarritoAbierto(false);
    if (quedaGente)
      showToast(
        'Ticket individual cobrado. La mesa sigue abierta para el resto.',
        'success',
      );
    else if (isMesa) navigate('/mesas');
    else showToast('¡Venta de mostrador cerrada!', 'success');
  };

  // ─── ATAJOS DEL POS (Proyecto D · tanda 3) ───────────────────────────────
  // Teclas de función, que es la convención de los POS de restaurante: un
  // cajero con oficio ya las tiene en los dedos y NUNCA chocan con escribir.
  //
  // Los atajos no se saltan ninguna regla: llaman a los MISMOS handlers que
  // los botones, así que heredan sus gates (carrito vacío, mesero que no
  // cobra en mesa, aviso de rondas sin entregar, gate de inventario). Un atajo
  // que esquive una validación es un bug de caja, no una comodidad.
  const hayModalAbierto =
    showModalCobro ||
    mostrarGateStock ||
    modalRondasPendientes ||
    !!modalElecciones ||
    !!lineaDescuento ||
    !!ticketGenerado;

  const puedeCobrarAqui = !(isMesa && esMesero);
  const hayCarrito = carrito.length > 0;
  // El +/− actúa sobre la ÚLTIMA línea agregada: es la que el cajero acaba de
  // tocar y la que quiere corregir. Sin esto haría falta un cursor de carrito,
  // que en una pantalla táctil no aporta.
  const ultimaLinea = carrito[carrito.length - 1];

  useAtajos(
    'pos',
    {
      f9: {
        descripcion: 'Cobrar',
        accion: () => {
          if (!hayCarrito || isProcessing || !puedeCobrarAqui) return;
          intentarCobrar();
        },
      },
      f2: {
        descripcion: 'Mandar a producción',
        accion: () => {
          if (!isMesa || !hayCarrito) return;
          handleGuardarEnMesa();
        },
      },
      f4: {
        descripcion: 'Pedir la cuenta',
        accion: () => {
          if (!isMesa || !hayCarrito) return;
          handlePedirCuenta();
        },
      },
      '+': {
        descripcion: 'Sumar 1 al último platillo',
        accion: () => ultimaLinea && modificarCantidad(ultimaLinea.id, 1),
      },
      '-': {
        descripcion: 'Restar 1 al último platillo',
        accion: () => ultimaLinea && modificarCantidad(ultimaLinea.id, -1),
      },
      escape: { descripcion: 'Salir del punto de venta', accion: salirDelPos },
    },
    // Con un modal encima, las teclas de acción se apagan: pulsar F9 sobre el
    // cuadro de cobro no puede volver a lanzar el cobro.
    { titulo: 'Punto de venta', activo: !hayModalAbierto },
  );

  // Scope de mayor precedencia mientras hay modal: Escape cierra lo que esté
  // abierto en vez de sacarte del POS.
  useAtajos(
    'pos-modal',
    {
      escape: {
        descripcion: 'Cerrar este cuadro',
        accion: () => {
          if (ticketGenerado) return handleCerrarTicket();
          if (modalElecciones) return setModalElecciones(null);
          if (mostrarGateStock) return setMostrarGateStock(false);
          if (modalRondasPendientes) return setModalRondasPendientes(false);
          if (showModalCobro) return setShowModalCobro(false);
        },
      },
    },
    { titulo: 'Cuadro abierto', activo: hayModalAbierto },
  );

  return (
    <div className="h-screen flex bg-ops-panel-2 font-sans overflow-hidden text-ops-ink transition-colors duration-lenta">
      {/* ─── PANEL IZQUIERDO: MENÚ DE PRODUCTOS ───
          Se lleva TODA la altura, también en teléfono. Antes se repartía
          `h-[50vh]` con el carrito, y en un teléfono de 844 px eso dejaba al
          catálogo —descontando cabecera y categorías— sitio para una fila y
          media de productos. El mesero se pasaba el turno desplazando. */}
      <div className="flex-1 min-w-0 flex flex-col h-screen lg:border-r border-ops-border bg-ops-panel-2 transition-colors duration-lenta">
        <div className="bg-ops-panel p-5 border-b border-ops-border flex items-center justify-between shadow-sm z-10 transition-colors duration-lenta">
          <div className="flex items-center gap-4">
            <button
              onClick={salirDelPos}
              className="p-2 hover:bg-ops-panel-2 dark:hover:bg-ops-border rounded-ui text-ops-muted hover:text-ops-ink dark:hover:text-ops-ink transition-colors"
            >
              <ArrowLeft className="w-6 h-6" />
            </button>
            <div>
              <h1 className="text-xl font-black font-syne text-ops-ink">
                Catálogo de Venta
              </h1>
              <p className="text-xs font-bold text-ops-muted uppercase tracking-widest">
                {productosFiltrados.length} listos
              </p>
            </div>
          </div>

          {/* Atajos a la vista: en un turno nadie abre la ayuda, pero de tanto
              verlos aquí se aprenden. Salen del registro vivo, no de una lista
              escrita a mano. */}
          <HintsAtajos scope="pos" className="hidden xl:flex text-ops-muted" />
        </div>

        <div className="bg-ops-panel px-4 py-3 border-b border-ops-border flex gap-3 overflow-x-auto custom-scrollbar shrink-0 transition-colors duration-lenta">
          {categoriasUnicas.map((cat) => (
            <button
              key={cat}
              onClick={() => setCategoriaActiva(cat)}
              className={`px-5 py-2.5 rounded-ui font-black text-sm whitespace-nowrap transition-all border ${
                categoriaActiva === cat
                  ? 'bg-ops-danger text-ops-danger-fg shadow-lg shadow-ops-danger/30 border-ops-danger'
                  : 'bg-ops-panel-2 text-ops-muted border-transparent hover:border-ops-border dark:hover:border-ops-border hover:text-ops-ink dark:hover:text-ops-ink'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* El hueco de abajo en estrecho es para la barra flotante del
            carrito: sin él, el último producto queda debajo y no se puede
            tocar — y es justo el que acabas de añadir al menú. */}
        <div className="flex-1 overflow-y-auto p-5 pb-24 lg:pb-5 custom-scrollbar bg-ops-panel-2 transition-colors duration-lenta">
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-4">
            {productosFiltrados.map((prod) => (
              <button
                key={prod.id}
                onClick={() => agregarAlCarrito(prod)}
                className="bg-ops-panel border-2 border-ops-border p-5 rounded-ui-lg flex flex-col items-center justify-center text-center gap-3 hover:border-ops-accent dark:hover:border-ops-accent hover:shadow-lg hover:-translate-y-1 transition-all group"
              >
                <div className="w-16 h-16 bg-ops-panel-2 rounded-full flex items-center justify-center group-hover:bg-ops-accent/10 dark:group-hover:bg-ops-accent/20 transition-colors">
                  <Utensils className="w-6 h-6 text-ops-muted group-hover:text-ops-accent transition-colors" />
                </div>
                <div>
                  <p className="font-black text-ops-ink text-sm leading-tight line-clamp-2">
                    {prod.nombre}
                  </p>
                  <p className="text-ops-ok font-black mt-2 text-lg">
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

      {/* ─── PANEL DERECHO: TICKET / CARRITO ───
          Columna fija en tablet y escritorio; hoja desde abajo en teléfono,
          con una barra flotante que ya enseña cuántas líneas van y por cuánto.
          El contenido es el mismo árbol en los dos casos. */}
      <PanelAcoplable
        abierto={carritoAbierto}
        onAbrir={() => setCarritoAbierto(true)}
        onCerrar={() => setCarritoAbierto(false)}
        // Sin `titulo`: el carrito ya trae su propia cabecera con el nombre de
        // la mesa y el contador de comensales.
        etiquetaAbrir={isMesa ? 'Ver comanda' : 'Ver carrito'}
        resumen={`$${granTotal.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`}
        insignia={carrito.reduce((n, i) => n + (Number(i.cantidad) || 0), 0)}
        // Con el carrito vacío no hay nada que ver: la barra sólo taparía
        // productos. Aparece en cuanto entra la primera línea.
        disparador={carrito.length > 0}
      >
        <div
          className={`p-6 flex items-center justify-between border-b border-ops-border transition-colors duration-lenta ${isMesa ? 'bg-ops-danger/5' : 'bg-ops-panel-2'}`}
        >
          <div className="flex items-center gap-3 text-ops-ink">
            {isMesa ? (
              <ChefHat
                className={`w-7 h-7 ${isMesa ? 'text-ops-danger' : 'text-ops-accent'}`}
              />
            ) : (
              <ShoppingCart className="w-7 h-7 text-ops-accent" />
            )}
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-ops-muted mb-0.5">
                {isMesa ? 'Comanda para' : 'Venta Rápida'}
              </p>
              <h2 className="text-xl font-black font-syne tracking-tight leading-none">
                {isMesa ? mesaActual.nombre : 'Mostrador'}
              </h2>
            </div>
          </div>

          {isMesa && (
            <div className="flex items-center gap-2 bg-white dark:bg-ops-bg px-3 py-1.5 rounded-ui border border-ops-border">
              <Users className="w-4 h-4 text-ops-muted" />
              <button
                onClick={() => handleCambiarComensales(-1)}
                className="w-6 h-6 flex items-center justify-center hover:bg-ops-panel-2 dark:hover:bg-ops-border rounded-ui text-lg font-black leading-none active:scale-95 text-ops-ink"
              >
                -
              </button>
              <span className="font-black text-sm w-4 text-center text-ops-danger">
                {safeNumber(mesaActual?.comensales_reales, 1)}
              </span>
              <button
                onClick={() => handleCambiarComensales(1)}
                className="w-6 h-6 flex items-center justify-center hover:bg-ops-panel-2 dark:hover:bg-ops-border rounded-ui text-lg font-black leading-none active:scale-95 text-ops-ink"
              >
                +
              </button>
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-3 custom-scrollbar bg-ops-panel-2/50 transition-colors duration-lenta">
          {carrito.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-ops-muted">
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
                className="bg-ops-panel border border-ops-border p-4 rounded-ui flex gap-3 hover:border-ops-accent/30 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <h4 className="font-black text-ops-ink text-sm leading-tight">
                    {item.nombre}
                  </h4>
                  {(() => {
                    // El importe que se muestra es el NETO: si el cajero ve el
                    // precio de lista junto a un badge de descuento, tiene que
                    // hacer la resta mentalmente y ahí es donde se equivoca.
                    const linea = importeDeLinea({
                      precio: getPrecio(item),
                      cantidad: safeNumber(item.cantidad, 0),
                      descuento: item.descuento,
                    });
                    return (
                      <div className="mt-1 flex items-baseline gap-2 flex-wrap">
                        <p className="text-ops-ok font-black text-sm">
                          $
                          {linea.neto.toLocaleString('es-MX', {
                            minimumFractionDigits: 2,
                          })}
                        </p>
                        {linea.descuento > 0 && (
                          <>
                            <span className="text-[11px] text-ops-muted line-through">
                              $
                              {linea.bruto.toLocaleString('es-MX', {
                                minimumFractionDigits: 2,
                              })}
                            </span>
                            <span className="text-[10px] font-black uppercase tracking-widest text-ops-warn bg-ops-warn/10 border border-ops-warn/30 px-2 py-0.5 rounded-ui">
                              {etiquetaDescuento(item.descuento)}
                            </span>
                          </>
                        )}
                      </div>
                    );
                  })()}
                  {(item.cantidad_enviada || 0) > 0 && (
                    <span className="text-[10px] font-black text-ops-warn bg-ops-warn/10 border border-ops-warn/30 px-2 py-1 rounded-ui mt-2 inline-block uppercase tracking-widest">
                      Enviado: {item.cantidad_enviada}
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-1 bg-ops-panel-2 border border-ops-border p-1 rounded-ui shrink-0 h-fit">
                  <button
                    onClick={() => modificarCantidad(item.id, -1)}
                    className="w-8 h-8 bg-ops-panel text-ops-ink rounded-ui flex items-center justify-center active:scale-95 hover:bg-ops-panel-2 dark:hover:bg-ops-border transition-colors shadow-sm dark:shadow-none"
                  >
                    <Minus className="w-4 h-4" />
                  </button>
                  <span className="w-8 text-center font-black text-ops-ink">
                    {safeNumber(item.cantidad, 0)}
                  </span>
                  <button
                    onClick={() => modificarCantidad(item.id, 1)}
                    className="w-8 h-8 bg-ops-panel text-ops-ink rounded-ui flex items-center justify-center active:scale-95 hover:bg-ops-panel-2 dark:hover:bg-ops-border transition-colors shadow-sm dark:shadow-none"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>

                <button
                  onClick={() => setLineaDescuento(item)}
                  title="Descuento a este producto"
                  className={`w-10 h-10 flex items-center justify-center rounded-ui transition-colors ${
                    item.descuento
                      ? 'text-ops-warn bg-ops-warn/10'
                      : 'text-ops-muted hover:bg-ops-panel-2'
                  }`}
                >
                  <Percent className="w-5 h-5" />
                </button>

                <button
                  onClick={() => removerDelCarrito(item.id)}
                  className="w-10 h-10 flex items-center justify-center text-ops-danger/80 hover:bg-ops-danger/10 dark:hover:bg-ops-danger/20 hover:text-ops-danger dark:hover:text-ops-danger rounded-ui transition-colors shrink-0"
                >
                  <Trash2 className="w-5 h-5" />
                </button>
              </div>
            ))
          )}
        </div>

        {/* Panel de Rondas: estado dinámico de las comandas enviadas a producción */}
        {isMesa && (
          <div className="border-t border-ops-border bg-ops-panel max-h-[40vh] overflow-y-auto custom-scrollbar shrink-0">
            <PanelRondas mesaId={mesaActual.id} />
          </div>
        )}

        <div className="p-6 bg-ops-panel border-t border-ops-border transition-colors duration-lenta">
          <div className="space-y-3 mb-6">
            <div className="flex justify-between text-ops-muted font-bold text-sm">
              <span>Subtotal</span>
              <span>
                $
                {subtotal.toLocaleString('es-MX', {
                  minimumFractionDigits: 2,
                })}
              </span>
            </div>
            <div className="flex justify-between text-ops-muted font-bold text-sm">
              <span>IVA ({ivaRaw * 100}%)</span>
              <span>
                $
                {totalIva.toLocaleString('es-MX', {
                  minimumFractionDigits: 2,
                })}
              </span>
            </div>
            <div className="flex justify-between text-ops-ink font-black text-3xl pt-4 border-t border-ops-border border-dashed">
              <span>Total</span>
              <span className="text-ops-ok">
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
                <OpsButton
                  tamano="lg"
                  icono={ChefHat}
                  tecla="F2"
                  onClick={handleGuardarEnMesa}
                  disabled={carrito.length === 0}
                  className="w-full"
                >
                  A Producción
                </OpsButton>

                <OpsButton
                  tamano="lg"
                  icono={BellRing}
                  tecla="F4"
                  onClick={handlePedirCuenta}
                  disabled={carrito.length === 0}
                  className="w-full"
                >
                  Pedir Cuenta
                </OpsButton>
              </div>
            )}

            {!(isMesa && esMesero) && (
              <OpsButton
                // El botón más importante de la app: alto, con la tecla que
                // dispara lo MISMO (F9) impresa encima.
                tamano="lg"
                variante={isMesa ? 'cobro' : 'exito'}
                icono={CreditCard}
                tecla="F9"
                onClick={intentarCobrar}
                disabled={carrito.length === 0 || isProcessing}
                className="w-full py-5 text-lg"
              >
                {isProcessing
                  ? 'Procesando…'
                  : isMesa
                    ? 'Cerrar Mesa y Cobrar'
                    : 'Cobrar Ticket'}
              </OpsButton>
            )}
          </div>
        </div>
      </PanelAcoplable>

      {/* MODAL: descuento por producto */}
      {lineaDescuento && (
        <DescuentoLineaModal
          item={lineaDescuento}
          rolSesion={user?.rol || user?.puesto}
          nombreSesion={user?.nombre}
          staff={staff}
          rolesPermisos={roles_permisos}
          onAplicar={(d) => aplicarDescuentoLinea(lineaDescuento.id, d)}
          onQuitar={() => quitarDescuentoLinea(lineaDescuento.id)}
          onCerrar={() => setLineaDescuento(null)}
        />
      )}

      {/* MODAL: rondas sin entregar (aviso antes de cobrar) */}
      {modalRondasPendientes && (
        <OpsModal
          titulo="Hay comida sin entregar"
          icono={BellRing}
          ancho="max-w-sm"
          onClose={() => setModalRondasPendientes(false)}
          pie={
            <>
              <OpsButton
                className="flex-1"
                onClick={() => setModalRondasPendientes(false)}
              >
                Esperar la entrega
              </OpsButton>
              <OpsButton
                variante="cobro"
                className="flex-1"
                onClick={continuarCobro}
              >
                Cobrar igual
              </OpsButton>
            </>
          }
        >
          <p className="text-ops-muted font-bold text-sm">
            Esta mesa tiene rondas en producción o listas que aún no se
            entregan. Si cobras ahora, el cliente paga algo que todavía no
            recibió.
          </p>
        </OpsModal>
      )}

      {/* MODAL: elecciones del paquete ("elige 1 de N" por grupo) */}
      {modalElecciones && (
        <div className="fixed inset-0 bg-ops-ink/60 dark:bg-ops-bg/80 backdrop-blur-md z-[120] flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-ops-panel rounded-ui-lg w-full max-w-md shadow-2xl border-2 border-ops-border animate-in zoom-in-95 flex flex-col max-h-[85vh]">
            <div className="p-6 border-b border-ops-border flex justify-between items-center">
              <div className="flex items-center gap-3 min-w-0">
                <div className="bg-ops-accent/15 p-2.5 rounded-ui shrink-0">
                  <Package className="w-6 h-6 text-ops-accent" />
                </div>
                <div className="min-w-0">
                  <h3 className="font-black font-syne text-lg text-ops-ink leading-tight truncate">
                    {modalElecciones.paquete.nombre}
                  </h3>
                  <p className="text-[10px] font-bold text-ops-muted uppercase tracking-widest">
                    Arma el paquete
                  </p>
                </div>
              </div>
              <button
                onClick={() => setModalElecciones(null)}
                className="p-2 text-ops-muted hover:text-ops-danger shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-5">
              {(modalElecciones.paquete.componentes || [])
                .filter((c) => !Array.isArray(c?.opciones))
                .map((c) => (
                  <p
                    key={c.recetaId}
                    className="text-xs font-black text-ops-muted"
                  >
                    ✓ Incluye {Number(c.cantidad) || 1}x {c.nombre}
                  </p>
                ))}
              {gruposDeEleccion(modalElecciones.paquete).map((g) => (
                <div key={g.grupo}>
                  <p className="text-[10px] font-black uppercase tracking-widest text-ops-accent mb-2">
                    {g.grupo} · elige 1
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    {g.opciones.map((op) => {
                      const activa =
                        String(modalElecciones.seleccion[g.grupo] ?? '') ===
                        String(op.recetaId);
                      return (
                        <button
                          key={op.recetaId}
                          onClick={() =>
                            setModalElecciones((prev) => ({
                              ...prev,
                              seleccion: {
                                ...prev.seleccion,
                                [g.grupo]: op.recetaId,
                              },
                            }))
                          }
                          className={`px-4 py-3 rounded-ui font-black text-sm border-2 text-left transition-all active:scale-95 ${
                            activa
                              ? 'border-ops-accent bg-ops-accent/10 text-ops-accent shadow-sm'
                              : 'border-ops-border bg-ops-panel-2 text-ops-muted hover:border-ops-border'
                          }`}
                        >
                          {op.nombre}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            <div className="p-6 border-t border-ops-border">
              <button
                onClick={confirmarElecciones}
                disabled={gruposDeEleccion(modalElecciones.paquete).some(
                  (g) => modalElecciones.seleccion[g.grupo] == null,
                )}
                className="w-full bg-ops-accent text-ops-accent-fg py-4 rounded-ui font-black uppercase tracking-widest shadow-lg disabled:bg-ops-panel-2 disabled:dark:bg-ops-border disabled:text-ops-muted disabled:shadow-none active:scale-95 transition-all"
              >
                Agregar al pedido · $
                {(Number(modalElecciones.paquete.precio_venta) || 0).toFixed(0)}
              </button>
            </div>
          </div>
        </div>
      )}

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
