import { useState, useEffect, useMemo } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { useAppStore } from "../../store/useAppStore";
import { useSyncStore } from "../../store/useSyncStore";
import { useSessionStore } from "../../store/useSessionStore";
import { useAuthStore } from "../auth/useAuthStore";
import {
  getRolEfectivo,
  getCapacidades,
  puedeVerRuta,
} from "../../lib/Permisos";
import { rutaDeEscape } from "../../lib/Escape";
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
  StickyNote,
  SlidersHorizontal,
} from "lucide-react";
import ModalCobro from "../operacion/components/ModalCobro";
import TicketImpresion from "./components/TicketImpresion";
import PanelRondas, { hayRondasSinEntregar } from "../operacion/PanelRondas";
import { calcularVenta, importeDeLinea } from "../../lib/Fiscal";
import {
  verificarStock,
  esPaquete,
  expandirInsumosPaquete,
  tieneElecciones,
  gruposDeEleccion,
  resolverComponentesPaquete,
  construirItemsComanda,
} from "../../lib/Inventario";
import ConfirmacionStockModal from "./components/ConfirmacionStockModal";
import DescuentoLineaModal from "./components/DescuentoLineaModal";
import { etiquetaDescuento } from "../../lib/Descuentos";
import {
  enviarComanda,
  enviarTicket,
  enviarPreCuenta,
  abrirCajon,
  salioPapel,
} from "../../lib/Hub";
import { debeImprimirComanda } from "../../lib/Comanda";
import {
  gruposDeProducto,
  necesitaEleccion,
  alternar,
  faltantes,
  seleccionCompleta,
  opcionesElegidas,
  textoDeReglas,
  firmaDeLinea,
  repartirPorNota,
} from "../../lib/Modificadores";
import { buscarAutorizador, sesionAutoriza } from "../../lib/Autorizacion";
import { siguienteFolio, SERIE_VENTA, SERIE_COMANDA } from "../../lib/Folio";
import { siguienteIdVenta, siguienteIdComanda } from "../../lib/IdVenta";
import { useAtajos } from "../../hooks/useAtajos";
import {
  useConectividad,
  motivoSinImpresion,
} from "../../hooks/useConectividad";
import PanelAcoplable from "../../components/PanelAcoplable";
import HintsAtajos from "../../components/HintsAtajos";
import { OpsButton, OpsModal } from "../../components/ui";

// ─── HELPERS DE SANITIZACIÓN Y MATEMÁTICA ──────────────────────────────────
const safeNumber = (val, fallback = 0) => {
  if (val === null || val === undefined || val === "") return fallback;
  const n = Number(val);
  return isNaN(n) ? fallback : n;
};

const safePriceString = (val) => {
  if (val === null || val === undefined || val === "") return 0;
  if (typeof val === "string") {
    val = val.replace(",", ".");
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
    modificadores,
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
      const modo = configuracion?.imprimir_comandas || "siempre";
      // Con `siempre` no se espera a nadie: el papel sale ya, que es lo que
      // necesita una cocina sin pantalla.
      // `llegoALaNube?.()` — un store simulado puede no traerlo. Sin la guarda,
      // no imprimir una comanda se convertiría en un error no capturado.
      const llego =
        modo === "sin_nube" && typeof llegoALaNube === "function"
          ? await llegoALaNube(idTarea)
          : false;
      if (!debeImprimirComanda(modo, llego)) return;

      const r = await enviarComanda(comanda, configuracion);
      if (!r?.ok && r?.total > 0) {
        showToast(avisoDeImpresion("La comanda"), "info");
      }
    })();
  };
  const { user } = useAuthStore();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const mesaId = searchParams.get("mesa");
  const mesaActual = useMemo(
    () => (mesas || []).find((m) => String(m.id) === String(mesaId)),
    [mesas, mesaId],
  );
  const isMesa = Boolean(mesaActual);

  // Rol del usuario (gancho preparado; hoy admin lo ve todo). Cuando exista el
  // sistema de PIN, un mesero no verá el botón de cobrar en mesa.
  const rolActivo = (user?.rol || user?.puesto || "").toLowerCase();
  const esMesero = rolActivo.includes("mesero");

  // Capacidades de QUIEN está usando la pantalla: el empleado del PIN si lo hay,
  // y si no la cuenta del aparato. Sólo se usan para calcular la salida.
  const capDeLaSesion = useMemo(() => {
    const empleado = useSessionStore.getState().empleadoActivo;
    return getCapacidades(
      getRolEfectivo(empleado || user),
      useAppStore.getState().roles_permisos,
    );
  }, [user]);

  // Salida del POS por rol (deuda #1 del traspaso): navigate(-1) era ambiguo
  // para quien aterriza DIRECTO en /pos (historial vacío) y /dashboard
  // hardcodeado expulsaba a roles cuyo guard lo rechaza. Regla:
  //  - En mesa → volver al mapa de mesas (origen natural del flujo).
  //  - Mostrador → lo que diga `lib/Escape.js`.
  //
  // El `?? '/mesas'` de antes tapaba el mismo agujero que encerró al barista en
  // el KDS —un destino que es la propia pantalla—, pero lo tapaba SUPONIENDO que
  // todo el mundo puede abrir `/mesas`. Un rol futuro con `['pos']` y nada más
  // se habría quedado igual de atrapado. Ahora la salida se calcula en un solo
  // sitio y se prueba contra roles que todavía no existen.
  const salirDelPos = () => {
    // El mapa de mesas es el origen natural del flujo, pero sólo vale como
    // salida si este rol puede abrirlo.
    if (isMesa && puedeVerRuta(capDeLaSesion, "/mesas")) {
      navigate("/mesas");
      return;
    }
    navigate(rutaDeEscape({ cap: capDeLaSesion, rutaActual: "/pos" }));
  };

  const [carrito, setCarrito] = useState([]);
  const [categoriaActiva, setCategoriaActiva] = useState("Todas");
  const [isProcessing, setIsProcessing] = useState(false);
  const [showModalCobro, setShowModalCobro] = useState(false);

  // Sólo se mira en pantallas estrechas: en tablet y escritorio el carrito es
  // una columna fija y nunca se cierra. Ver `PanelAcoplable`.
  const [carritoAbierto, setCarritoAbierto] = useState(false);
  const [mostrarGateStock, setMostrarGateStock] = useState(false);
  const [subsVenta, setSubsVenta] = useState({});
  // Gate de inventario: 'cobro' (venta directa) o 'produccion' (mesa → A Producción).
  const [gateContext, setGateContext] = useState("cobro");
  const [gateItems, setGateItems] = useState([]); // delta a producir (modo producción)

  // Aviso de rondas sin entregar: modal PROPIO (window.confirm está vetado).
  const [modalRondasPendientes, setModalRondasPendientes] = useState(false);

  // ── CUENTA CERRADA ───────────────────────────────────────────────────────
  // Una vez impresa la cuenta, la mesa deja de aceptar cambios. Hasta ahora
  // `por_cobrar` sólo pintaba la mesa distinta en el mapa y NADIE lo consultaba:
  // el mesero podía seguir agregando platillos a una cuenta que el cliente ya
  // tenía en la mano, y el papel dejaba de coincidir con lo que se iba a cobrar.
  //
  // Sólo aplica al flujo de un solo papel. Con `precuenta_y_ticket` el papel que
  // se llevó era una propuesta y añadir después es legítimo: el ticket definitivo
  // sale al cobrar y recoge lo que haya.
  const cuentaCerrada =
    isMesa &&
    mesaActual?.estado === "por_cobrar" &&
    (configuracion?.flujo_cuenta || "") === "ticket_final";

  // Copia en vuelo, para apagar su botón. Una a la vez: dos pulsaciones
  // seguidas son el error caro aquí — gastan número de copia y papel.
  const [reimprimiendoCuenta, setReimprimiendoCuenta] = useState(false);
  // Candado del botón «Imprimir» del ticket recién cobrado: ahora ese papel va
  // a la cola del hub y tarda, y dos clics seguidos gastarían un número de
  // copia que el hub descartaría sin decir nada.
  const [reimprimiendoTicket, setReimprimiendoTicket] = useState(false);
  const [pinReapertura, setPinReapertura] = useState("");
  const [pinReaperturaError, setPinReaperturaError] = useState("");
  const [pidiendoReapertura, setPidiendoReapertura] = useState(false);

  /**
   * Rechaza una acción sobre una cuenta ya entregada.
   *
   * Devuelve `true` si la acción NO debe seguir. Se llama al principio de cada
   * mutación del carrito en vez de esconder los botones: un botón que
   * desaparece no explica nada, y el mesero acaba pensando que la app se rompió.
   * Así el aviso dice qué pasa y dónde está la salida.
   */
  const bloqueadoPorCuenta = () => {
    if (!cuentaCerrada) return false;
    showToast(
      "La cuenta ya se imprimió. Para agregar algo, reábrela con PIN.",
      "info",
    );
    return true;
  };

  /**
   * Reabre una cuenta ya entregada.
   *
   * ── POR QUÉ EL BLOQUEO NECESITA LLAVE ───────────────────────────────────
   * El cliente que pide la cuenta y luego pide un café pasa todo el tiempo. Sin
   * salida, el mesero se queda atascado con un cliente delante y el bloqueo
   * deja de proteger para empezar a estorbar — y lo que se estorba a esa hora
   * se acaba resolviendo saltándose el sistema.
   *
   * La capacidad es `autoriza_descuentos` y no `gestion`: es la que ya
   * significa «autoriza una excepción EN LA MESA», y la tienen Admin, Gerente y
   * Capitán de Meseros. `gestion` dejaría fuera al Capitán, que es justamente
   * quien está en el piso cuando esto ocurre.
   *
   * Quien ya tiene la capacidad no teclea nada: pedirle al encargado que se
   * autorice a sí mismo es fricción sin ganancia. Ver `sesionAutoriza`.
   */
  const puedeReabrirSinPin = sesionAutoriza({
    usuario: user,
    roles_permisos,
    flag: "autoriza_descuentos",
  });

  const reabrirCuenta = (autorizador) => {
    const mesaReabierta = {
      ...mesaActual,
      estado: "ocupada",
      // El folio NO se toca. El cliente tiene ese número en la mano; una cuenta
      // reabierta sigue siendo la misma cuenta, y darle otro folio dejaría dos
      // papeles distintos para un solo consumo.
      orden_actual: { ...(mesaActual?.orden_actual || {}) },
    };
    enqueueAction("mesas", "upsert", mesaReabierta);
    useAppStore.setState((prev) => ({
      mesas: prev.mesas.map((m) =>
        m.id === mesaActual.id ? mesaReabierta : m,
      ),
    }));

    registrarAuditoria?.({
      fecha: new Date().toISOString(),
      usuario: autorizador?.nombre || user?.nombre || "Gestión",
      accion: "REAPERTURA_CUENTA",
      modulo: "POS",
      nivel: "warning",
      detalles:
        `Mesa ${mesaActual?.nombre ?? mesaActual?.id} reabierta tras imprimir la cuenta` +
        `${mesaActual?.orden_actual?.folio ? ` (folio ${mesaActual.orden_actual.folio})` : ""}. ` +
        `Autorizó: ${autorizador?.nombre || user?.nombre || "sesión con permiso"}.`,
    });

    setPidiendoReapertura(false);
    setPinReapertura("");
    setPinReaperturaError("");
    showToast("Cuenta reabierta. Se puede volver a agregar.", "success");
  };

  const intentarReabrir = () => {
    if (puedeReabrirSinPin) {
      reabrirCuenta(null);
      return;
    }
    setPinReapertura("");
    setPinReaperturaError("");
    setPidiendoReapertura(true);
  };

  const confirmarReapertura = () => {
    const quien = buscarAutorizador({
      staff,
      roles_permisos,
      pin: pinReapertura,
      flag: "autoriza_descuentos",
    });
    if (!quien) {
      setPinReaperturaError("PIN inválido para reabrir la cuenta.");
      setPinReapertura("");
      return;
    }
    reabrirCuenta(quien);
  };

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
    setGateContext("cobro");
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
    if (gateContext === "produccion") {
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
    "Todas",
    ...new Set(menuList.map((p) => p.categoria || "Sin Categoría")),
  ];
  const productosFiltrados = menuList.filter(
    (p) => categoriaActiva === "Todas" || p.categoria === categoriaActiva,
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
  const avisoDeImpresion = (
    queNoSalio,
    { resultado = null, yaQuedo = "La venta sí quedó registrada." } = {},
  ) => {
    // ── EL TERCER CASO, AÑADIDO EL 18-AGO ─────────────────────────────────
    // El hub contestó bien y AUN ASÍ tiró el documento, por id ya impreso.
    // `imprimir()` devuelve `ok: true` ahí —y hace bien, un reenvío por wifi
    // no es un fallo— así que este aviso ni siquiera se estaba enseñando. Y
    // cuando se enseñe, «quedó en la cola» sería mentira: no quedó en ninguna.
    // Es un problema nuestro, no de la red ni del aparato, y por eso manda a
    // soporte y no a mirar la impresora.
    if (resultado?.ok && resultado?.estado === "duplicado") {
      return `${queNoSalio} no salió: el hub ya tenía ese documento y lo descartó. Avisa a soporte.`;
    }
    const motivo = motivoSinImpresion({ local, comprobandoLocal });
    return motivo
      ? `${motivo}: ${queNoSalio} no se imprimió. ${yaQuedo}`
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
    enqueueAction("mesas", "upsert", mesaActualizada);
    useAppStore.setState((prev) => ({
      mesas: prev.mesas.map((m) =>
        m.id === mesaActual.id ? mesaActualizada : m,
      ),
    }));
  };

  // PAQUETE CON ELECCIONES: el mesero elige 1 opción por grupo antes de que
  // el combo entre al carrito. { paquete, seleccion: {grupo: recetaId} } | null
  const [modalElecciones, setModalElecciones] = useState(null);

  // MODIFICADORES Y NOTA: «¿cómo lo quiere?». Se abre solo cuando el platillo
  // tiene grupos atados; para poner una nota suelta se abre a mano desde la
  // línea del carrito (ver `abrirNotaDeLinea`).
  //
  // Por qué NO se abre para todo: si cada producto pidiera confirmación, un
  // refresco costaría dos toques en vez de uno y el POS dejaría de servir en
  // una barra con cola. Los grupos obligatorios sí lo justifican — son la única
  // forma de que «obligatorio» signifique algo, porque una vez que la línea
  // entró al carrito ya no se puede exigir nada.
  //
  // { producto, seleccion, nota, lineaId } | null   (lineaId ⇒ editando)
  const [modalMods, setModalMods] = useState(null);

  const gruposDelModal = useMemo(
    () =>
      modalMods ? gruposDeProducto(modalMods.producto, modificadores) : [],
    [modalMods, modificadores],
  );

  const agregarAlCarrito = (producto) => {
    if (bloqueadoPorCuenta()) return;
    // Paquete con grupos "elige 1 de N" → primero se resuelven las elecciones.
    if (esPaquete(producto) && tieneElecciones(producto)) {
      setModalElecciones({ paquete: producto, seleccion: {} });
      return;
    }
    // Platillo con modificadores → «¿cómo lo quiere?» antes de entrar.
    if (necesitaEleccion(producto, modificadores)) {
      setModalMods({ producto, seleccion: {}, nota: "", lineaId: null });
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
      .join("|");
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

  /**
   * Abre el mismo cuadro para una línea que YA está en el carrito — es la vía
   * para poner una nota a un producto sin grupos («sin hielo»), y para
   * corregirse.
   *
   * ── LO QUE SE BLOQUEA, Y LO QUE NO ────────────────────────────────────────
   * Reescribir la nota de unas unidades que ya están en la plancha no cambia
   * el papel que el cocinero tiene en la mano: la pantalla diría una cosa y la
   * cocina estaría haciendo otra. Eso sigue prohibido.
   *
   * Lo que ANTES estaba mal era el alcance. La guarda miraba
   * `cantidad_enviada > 0` y con eso frenaba la línea entera, aunque sólo una
   * parte hubiera salido — y ése es el caso normal: mandas una pizza, más
   * tarde tocas Pizza otra vez (se funde en la misma línea, «2x, Enviado 1») y
   * quieres que la segunda lleve «sin cebolla». Quedabas atrapado: la única
   * vía para la nota era esta línea, y esta línea estaba cerrada.
   *
   * Ahora se abre mientras quede algo sin enviar, y al confirmar la línea SE
   * PARTE (ver `repartirPorNota`). Sólo cuando no queda nada libre se frena, y
   * el aviso dice qué hacer en vez de sólo decir que no.
   */
  const abrirNotaDeLinea = (item) => {
    if (bloqueadoPorCuenta()) return;
    const enviadas = safeNumber(item.cantidad_enviada, 0);
    const libres = safeNumber(item.cantidad, 0) - enviadas;
    if (libres <= 0) {
      showToast(
        enviadas > 0
          ? "Todas esas unidades ya están en cocina. Agrega otra con el + y ponle la nota a ésa."
          : "Esa línea no tiene unidades a las que ponerles nota.",
        "error",
      );
      return;
    }
    setModalMods({
      producto: item,
      seleccion: item.seleccion_mods || {},
      // La nota arranca en blanco cuando la línea se va a partir: lo que se
      // está anotando son las unidades NUEVAS, no las que ya salieron, y
      // heredar el texto de las viejas invita a creer que se está corrigiendo
      // aquéllas.
      nota: enviadas > 0 ? "" : item.nota || "",
      lineaId: item.id,
      // Cuántas unidades se van a mover. La lee el cuadro para avisar.
      libres: enviadas > 0 ? libres : 0,
    });
  };

  const confirmarModificadores = () => {
    if (!modalMods) return;
    const { producto, seleccion, nota, lineaId } = modalMods;
    if (!seleccionCompleta(gruposDelModal, seleccion)) return;

    const notaLimpia = String(nota || "").trim();
    const elegidas = opcionesElegidas(gruposDelModal, seleccion);
    // El id de línea lleva DENTRO la selección y la nota. Sin eso, una
    // hamburguesa término medio y otra bien cocida se fundirían en «2x
    // Hamburguesa» y la cocina sacaría dos iguales; el mesero no se entera
    // hasta que el cliente devuelve el plato.
    const lineId = firmaDeLinea(
      producto.receta_id ?? producto.id,
      seleccion,
      notaLimpia,
    );

    const base = {
      ...producto,
      id: lineId,
      receta_id: producto.receta_id ?? producto.id,
      precio: getPrecio(producto),
      nota: notaLimpia,
      // La selección cruda se guarda para poder reabrir el cuadro tal y como
      // se dejó; `modificadores` es la forma aplanada que leen la comanda, el
      // KDS y el ticket.
      seleccion_mods: seleccion,
      modificadores: elegidas,
    };

    // El reparto vive en `lib/Modificadores.js` y tiene sus propias pruebas:
    // es aritmética sobre el carrito —cuántas unidades se mueven a la nota
    // nueva y cuántas se quedan en cocina— y un error aquí se cobra en la
    // cuenta del cliente, no en la pantalla.
    setCarrito((prev) => repartirPorNota(prev, { lineaId, lineId, base }));
    setModalMods(null);
  };

  const modificarCantidad = (id, delta) => {
    if (bloqueadoPorCuenta()) return;
    setCarrito((prev) =>
      prev.map((item) => {
        if (item.id === id) {
          const nuevaCantidad = safeNumber(item.cantidad, 0) + delta;
          if (nuevaCantidad < (item.cantidad_enviada || 0)) {
            showToast(
              `Ya hay ${item.cantidad_enviada} en preparación. Cancélalo con perfil de Gerente.`,
              "error",
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
      accion: "DESCUENTO_PRODUCTO",
      modulo: "POS",
      nivel: "warning",
      detalles: `${linea?.nombre ?? id}: ${etiquetaDescuento(descuento)} · autorizó ${descuento?.autorizadoPor ?? "—"}`,
    });
  };

  const quitarDescuentoLinea = (id) =>
    setCarrito((prev) =>
      prev.map((it) => (it.id === id ? { ...it, descuento: null } : it)),
    );

  const removerDelCarrito = (id) => {
    if (bloqueadoPorCuenta()) return;
    const itemEnCarrito = carrito.find((i) => i.id === id);
    if (itemEnCarrito && (itemEnCarrito.cantidad_enviada || 0) > 0) {
      showToast(
        "No puedes eliminar un platillo que ya está en la cocina.",
        "error",
      );
      return;
    }
    setCarrito((prev) => prev.filter((item) => item.id !== id));
  };

  // ─── COMANDAS Y PAGOS ────────────────────────────────────────────────────
  // MESA: al mandar A PRODUCCIÓN se corrobora inventario y se descuenta el stock
  // del DELTA (solo lo nuevo de esta ronda). El insumo se consume al cocinar.
  const handleGuardarEnMesa = () => {
    if (bloqueadoPorCuenta()) return;
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
      showToast("No hay productos nuevos para enviar", "info");
      return;
    }

    // Corroborar inventario del delta. Si falta algo → gate de sustituciones.
    const problemas = verificarStock(deltaCarrito, productos, subsVenta);
    if (problemas.length > 0) {
      setGateItems(deltaCarrito);
      setGateContext("produccion");
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
      mesero: user?.nombre ?? "Sistema",
      fecha_hora: new Date().toISOString(),
      items: itemsParaCocina,
      estado: "preparando",
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
    // `Promise.resolve(...)` y no `.then()` directo. Esta es una ruta
    // «fire and forget» dentro del cobro: si `enqueueAction` devolviera algo que
    // no es una promesa —una versión anterior, o un doble simulado en una
    // prueba— el `.then` reventaría el manejador del clic y se llevaría por
    // delante el cobro entero. La impresión de una comanda no puede tumbar una
    // venta; es la misma regla que hace que la impresora nunca bloquee.
    void Promise.resolve(
      enqueueAction("comandas", "insert", nuevaComanda),
    ).then((idTarea) => imprimirComandaSiHaceFalta(nuevaComanda, idTarea));

    // Inventario: se descuenta AL PRODUCIR (no al cobrar). Solo el delta.
    //
    // El id de la comanda va como ORIGEN, y no es opcional: la RPC lo usa como
    // clave de idempotencia. Sin él, un reintento de la cola tras un timeout
    // post-commit descontaría el mismo platillo dos veces, sin dar error.
    descontarStockVenta(deltaCarrito, subs, nuevaComanda.id);

    const carritoMarcado = carrito.map((item) => ({
      ...item,
      cantidad_enviada: item.cantidad,
    }));
    // ── SE CONSERVA LO QUE YA HABÍA EN LA ORDEN ─────────────────────────────
    // Antes esto se armaba desde cero —`{ items, subtotal, total }`— y **se
    // llevaba por delante el folio reservado**. La secuencia que lo destapa es
    // corriente: pedir cuenta (acuña folio), reabrir, agregar algo, mandarlo a
    // cocina, cobrar. Al cobrar ya no había folio que reutilizar, así que se
    // acuñaba otro y el cliente se quedaba con un papel citando un número que
    // ninguna venta iba a tener. Encontrado el 17-ago persiguiendo el hueco
    // `AZULHN-V-000004`, que primero se atribuyó al teléfono que murió.
    //
    // El hueco importa por lo que significa fuera de aquí: `Folio.js` separó las
    // series de venta y comanda precisamente para no dejar huecos, porque un
    // hueco en una serie de ventas es la primera señal que busca un auditor.
    const mesaActualizada = {
      ...mesaActual,
      estado: "ocupada",
      orden_actual: {
        ...(mesaActual?.orden_actual || {}),
        items: carritoMarcado,
        subtotal,
        total: granTotal,
      },
    };
    enqueueAction("mesas", "upsert", mesaActualizada);
    useAppStore.setState((prev) => ({
      mesas: prev.mesas.map((m) =>
        m.id === mesaActual.id ? mesaActualizada : m,
      ),
    }));

    setSubsVenta({});
    setGateItems([]);
    setGateContext("cobro");
    showToast("Comanda enviada a producción", "success");
    navigate("/mesas");
  };

  /**
   * Los datos del papel de la cuenta, en un solo sitio.
   *
   * Lo usan `handlePedirCuenta` y `reimprimirCuenta`, y por eso no está escrito
   * dos veces: es una lista de campos, y las listas de campos escritas dos veces
   * son las que se separan sin dar error. La lección es de `construirItemsComanda`
   * —armaba el item campo a campo y se comía en silencio todo dato nuevo—, y
   * aquí el síntoma sería una copia a la que le falta algo que el original sí
   * llevaba, que es peor todavía porque parece un problema de impresora.
   *
   * Se leen los valores VIVOS del carrito y no `orden_actual`, y es correcto:
   * mientras la cuenta está cerrada no se puede agregar ni quitar
   * —`rechazarSiCuentaCerrada` lo impide en todas las acciones—, así que lo que
   * hay en pantalla es exactamente lo que se imprimió. Y `orden_actual` no
   * guarda el IVA, así que reconstruirlo desde ahí obligaría a recalcularlo,
   * que es justo el segundo motor de dinero que este proyecto evita.
   */
  const datosDeLaCuenta = () => ({
    items: carrito,
    subtotal,
    iva: totalIva,
    descuento: 0,
    total: granTotal,
    mesa_id: mesaActual?.id,
    mesa_nombre: mesaActual?.nombre,
    comensales: safeNumber(mesaActual?.comensales_reales, 0),
    usuario: user?.nombre ?? "Mesero",
    fecha: new Date().toISOString(),
  });

  const handlePedirCuenta = () => {
    if (!isMesa || carrito.length === 0) return;

    // ── EL FOLIO NACE AQUÍ CUANDO LA CUENTA ES EL DOCUMENTO FINAL ───────────
    // Si el papel que se lleva a la mesa es el ticket, tiene que llevar folio, y
    // el folio tiene que existir antes de imprimirlo. Se guarda en la mesa para
    // que el cobro use EL MISMO: reimprimir o reabrir no puede cambiar el número
    // de una cuenta que el cliente ya tiene en la mano.
    const flujo = configuracion?.flujo_cuenta || "precuenta_y_ticket";
    const esTicketFinal = flujo === "ticket_final";

    const folioCuenta = esTicketFinal
      ? mesaActual?.orden_actual?.folio ||
        siguienteFolio({
          serie: SERIE_VENTA,
          nombreLocal: configuracion?.nombre_empresa,
        })
      : null;

    // ── POR QUÉ SE CUENTAN LAS IMPRESIONES ──────────────────────────────────
    // El id del documento sale del folio, y el folio NO cambia al reabrir —eso
    // es correcto y el cliente tiene ese número en la mano—. Pero el hub
    // descarta por id ya impreso (`hub/cola.rs`), así que la segunda cuenta de
    // la misma mesa llegaba con el id de la primera y se tiraba **en silencio**:
    // `Recibo::Duplicado` no es un error para el hub, la promesa volvía con
    // `ok`, y el mesero pulsaba sin obtener papel ni aviso. Encontrado en AZUL
    // el 15-ago, y es justo el caso en que hace falta un papel nuevo: se reabre
    // para agregar algo, y el total cambia.
    //
    // El contador va en la orden y no en un `Date.now()` a propósito. Con el
    // reloj, un POST duplicado por la LAN sería otro id y saldrían dos papeles
    // por una sola pulsación, que es lo que el deduplicado existe para evitar.
    // Con el contador, dos pulsaciones distintas dan documentos distintos y la
    // misma pulsación repetida da el mismo: cada uno protege de lo suyo.
    const impresionesPrevias = safeNumber(
      mesaActual?.orden_actual?.impresiones,
      0,
    );
    const impresionActual = impresionesPrevias + 1;

    const mesaActualizada = {
      ...mesaActual,
      estado: "por_cobrar",
      orden_actual: {
        items: carrito,
        subtotal,
        total: granTotal,
        impresiones: impresionActual,
        ...(folioCuenta ? { folio: folioCuenta } : {}),
      },
    };
    enqueueAction("mesas", "upsert", mesaActualizada);
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
    const datosCuenta = datosDeLaCuenta();

    // Un papel o dos, según el local. Con `ticket_final` el que se lleva a la
    // mesa YA es el comprobante —lleva folio y no lleva método de pago, que es
    // opcional— y al cobrar no se imprime nada más.
    // `abrirCajon: false` EXPLÍCITO, y es lo más importante de esta línea.
    // `construirTicket` decide el pulso por el método de pago, y aquí todavía no
    // hay pago: sin este `false` el cajón se abriría cada vez que una mesa pide
    // la cuenta —varias veces por turno y por mesa— dejando el dinero expuesto
    // sin nadie delante. Es exactamente lo que la pre-cuenta evitaba, y al
    // reusar el ticket había que volver a decirlo.
    const enviar = esTicketFinal
      ? enviarTicket({ ...datosCuenta, folio: folioCuenta }, configuracion, {
          abrirCajon: false,
          // Distingue esta impresión de la anterior de la MISMA cuenta. Sólo
          // cambia el id del documento: el papel sale idéntico, sin aviso de
          // copia. Ver `construirTicket`.
          copia: impresionActual,
        })
      : enviarPreCuenta(datosCuenta, configuracion);

    enviar.then((r) => {
      // Sólo se avisa si falló, y sin tono de error: no imprimir la cuenta no
      // rompe nada, sólo obliga a dictarla.
      //
      // `salioPapel` y no `r.ok`: el hub contesta `ok: true` también cuando
      // descarta el documento por id repetido, que es EXACTAMENTE el fallo 2
      // del 15-ago. Con `r.ok` a secas, ese caso no avisaba de nada — el
      // mesero pulsaba, no salía papel, y la pantalla se quedaba callada.
      //
      // Y el texto sale de `avisoDeImpresion`, que ya distingue «el teléfono
      // se salió de rango» de «la impresora». El que había aquí mandaba
      // siempre a revisar la impresora, que es justo lo que ese helper existe
      // para no hacer.
      if (!salioPapel(r)) {
        showToast(
          avisoDeImpresion("La cuenta", {
            resultado: r,
            yaQuedo: "La mesa sí quedó marcada para cobrar.",
          }),
          "info",
        );
      }
    });

    // ── EL FOLIO IMPRESO QUEDA REGISTRADO, AUNQUE LA CUENTA NO SE COBRE ─────
    // Pedir la cuenta acuña un folio y lo reserva en `mesa.orden_actual`, que
    // vive en el aparato hasta que la cola lo sincroniza. Si el aparato muere
    // antes —o si la cuenta acaba no cobrándose— esa reserva se pierde y queda
    // un HUECO en la serie de ventas: el cliente tiene un papel citando un
    // número que ninguna venta va a llevar. Pasó en AZUL el 17-ago con
    // `AZULHN-V-000004`.
    //
    // `Folio.js` separó las series de venta y comanda precisamente para no
    // dejar huecos, «porque un hueco en una serie de ventas es exactamente la
    // señal que un auditor busca». Esto no impide el hueco —para eso haría
    // falta que la reserva sobreviva al aparato, y eso es una decisión de
    // sincronización aparte— pero sí lo deja EXPLICADO: queda dicho qué folio
    // se imprimió, en qué mesa y por cuánto.
    //
    // Y la auditoría ya sí sobrevive al aparato: entró en el respaldo hoy.
    if (folioCuenta) {
      registrarAuditoria?.({
        fecha: new Date().toISOString(),
        usuario: user?.nombre ?? "Mesero",
        accion: "CUENTA_IMPRESA",
        modulo: "POS",
        nivel: "info",
        detalles:
          `Folio ${folioCuenta} impreso para ${mesaActual?.nombre ?? mesaActual?.id}. ` +
          `Total: $${granTotal}. Impresión ${impresionActual}.`,
      });
    }

    showToast("Cuenta solicitada. Notificando a caja...", "info");
    setTimeout(() => {
      navigate("/mesas");
    }, 1500);
  };

  /**
   * Otra copia de la cuenta que ya se entregó, sin reabrirla.
   *
   * ── EL HUECO QUE CIERRA ─────────────────────────────────────────────────
   * Con `ticket_final`, en cuanto la cuenta se imprime la mesa pasa a
   * `por_cobrar`, `cuentaCerrada` se pone en `true` y **«Pedir Cuenta» se
   * apaga**. Correcto para lo que ese bloqueo protege —que nadie agregue a una
   * cuenta ya entregada— pero dejaba sin salida el caso más común de todos: al
   * cliente se le cayó el papel, o quiere revisarlo otra vez.
   *
   * La única salida era **reabrir**, que pide PIN de encargado y significa otra
   * cosa —«el cliente pidió algo más»—. Usar una operación privilegiada para
   * pedir una fotocopia es la clase de fricción que enseña a la gente a reabrir
   * cuentas por costumbre, y entonces el bloqueo deja de proteger nada.
   *
   * Sin PIN a propósito: esto no mueve dinero ni cambia el estado de la mesa.
   * Es el mismo papel otra vez, y queda en auditoría con `CUENTA_IMPRESA`, que
   * es más rastro del que deja hoy reabrir y volver a imprimir.
   *
   * ── LO ÚNICO DELICADO ───────────────────────────────────────────────────
   * El contador. `sufijoCopia` no pone sufijo a la copia 1 y `hub/cola.rs`
   * descarta por id ya impreso SIN dar error, así que sin subir `impresiones`
   * el segundo papel no saldría y nadie se enteraría. Es exactamente el fallo
   * 2 del 15-ago, y este botón lo pisaría otra vez si no contara.
   *
   * La hora del papel SÍ cambia: es la de esta impresión, no la de la primera.
   * Es lo honesto —este papel se imprimió ahora— y el folio es lo que dice que
   * las dos son la misma cuenta.
   */
  const reimprimirCuenta = async () => {
    const folioCuenta = mesaActual?.orden_actual?.folio;
    if (!folioCuenta || reimprimiendoCuenta) return;

    setReimprimiendoCuenta(true);
    const impresionActual =
      safeNumber(mesaActual?.orden_actual?.impresiones, 0) + 1;

    try {
      const r = await enviarTicket(
        { ...datosDeLaCuenta(), folio: folioCuenta },
        configuracion,
        {
          // Una copia no mueve dinero. Ver `handlePedirCuenta`: sin este
          // `false` explícito el cajón se abriría por el método de pago.
          abrirCajon: false,
          copia: impresionActual,
        },
      );

      // `salioPapel` y no `r.ok`: el hub contesta `ok: true` también cuando
      // DESCARTA el documento por id repetido, y ése es justo el desenlace
      // contra el que existe el contador.
      if (!salioPapel(r)) {
        showToast(
          r?.estado === "duplicado"
            ? "El hub descartó esta copia como repetida y no salió papel. Avisa a soporte."
            : "No se pudo imprimir la copia. Revisa la impresora.",
          "error",
        );
        return;
      }

      // El contador sube DESPUÉS del papel. Al revés, una impresora apagada
      // gastaría números y el siguiente intento saltaría a `::c3` sin que
      // hubiera existido nunca una `::c2`.
      const mesaActualizada = {
        ...mesaActual,
        orden_actual: {
          ...mesaActual.orden_actual,
          impresiones: impresionActual,
        },
      };
      enqueueAction("mesas", "upsert", mesaActualizada);
      useAppStore.setState((prev) => ({
        mesas: prev.mesas.map((m) =>
          m.id === mesaActual.id ? mesaActualizada : m,
        ),
      }));

      registrarAuditoria?.({
        fecha: new Date().toISOString(),
        usuario: user?.nombre ?? "Mesero",
        accion: "CUENTA_IMPRESA",
        modulo: "POS",
        nivel: "info",
        detalles:
          `Folio ${folioCuenta} impreso para ${mesaActual?.nombre ?? mesaActual?.id}. ` +
          `Total: $${granTotal}. Impresión ${impresionActual}.`,
      });

      showToast(`Copia ${impresionActual} de la cuenta.`, "success");
    } finally {
      setReimprimiendoCuenta(false);
    }
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
        .filter((p) => p.metodo.toLowerCase() === "efectivo")
        .reduce((acc, p) => acc + safeNumber(p.monto), 0),
    );
    const montoTarjeta = round2(
      pagosDetalle
        .filter((p) => p.metodo.toLowerCase() === "tarjeta")
        .reduce((acc, p) => acc + safeNumber(p.monto), 0),
    );
    const montoTransferencia = round2(
      pagosDetalle
        .filter((p) => p.metodo.toLowerCase() === "transferencia")
        .reduce((acc, p) => acc + safeNumber(p.monto), 0),
    );

    const turnoActivo =
      (turnos || []).find((t) => t.estado === "abierto") || null;

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
      // El folio de la cuenta si ya se imprimió una (flujo `ticket_final`): el
      // cliente tiene ese número en la mano y la venta tiene que llevar el
      // mismo. Sólo se emite uno nuevo si no había.
      folio:
        mesaActual?.orden_actual?.folio ||
        siguienteFolio({
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
          ? "mixto"
          : pagosDetalle[0]?.metodo?.toLowerCase() || "efectivo",
      efectivo: montoEfectivo,
      tarjeta: montoTarjeta,
      transferencia: montoTransferencia,
      usuario: user?.nombre ?? "Sistema",
      fecha: new Date().toISOString(),
      propina: fiscalTicket.propina,
      // ── CUÁNTAS VECES HA SALIDO ESTE TICKET EN PAPEL ────────────────────
      // Nace en 1 porque abajo se imprime, y en 0 cuando NO se imprime nada
      // —flujo de un solo papel en mesa, donde el comprobante salió al pedir
      // la cuenta—. La condición es la misma que decide el papel; ver
      // `yaSeImprimioLaCuenta` unas líneas más abajo.
      //
      // El número importa porque entra en el id del documento al reimprimir
      // desde Reportes: `sufijoCopia` no pone sufijo a la copia 1, y
      // `hub/cola.rs` descarta por id ya impreso SIN dar error. Arrancar en 0
      // una venta cuyo ticket sí salió haría que su primera reimpresión
      // pidiera el id del original y el hub la tirara en silencio.
      copias_impresas:
        isMesa && (configuracion?.flujo_cuenta || "") === "ticket_final"
          ? 0
          : 1,
      mesa: isMesa ? mesaActual.id : null,
      // CRM: asociación opcional hecha en ModalCobro (null = mostrador).
      cliente_id: datosPago?.clienteId ?? null,
    };

    const ventaVisual = {
      ...nuevaVentaBD,
      iva: ivaTicket,
      cambio_entregado: safeNumber(datosPago?.cambio, 0),
      mesa_nombre: isMesa ? mesaActual.nombre : "Directa",
      _quedaGente: isParcial && carritoRestante.length > 0,
    };

    enqueueAction("ventas", "insert", nuevaVentaBD);
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
        mesa: "Mostrador",
        mesa_id: null,
        mesero: user?.nombre ?? "Sistema",
        fecha_hora: new Date().toISOString(),
        items: construirItemsComanda(
          itemsTicket,
          recetas,
          configuracion?.enrutamiento,
        ),
        estado: "preparando",
      };
      registrarComandaKDS(comandaDirecta);
      void Promise.resolve(
        enqueueAction("comandas", "insert", comandaDirecta),
      ).then((idTarea) => imprimirComandaSiHaceFalta(comandaDirecta, idTarea));
    }

    // TICKET DE COBRO. También sin esperar: el dinero ya entró y la venta ya
    // está en Dexie. Un fallo de impresión no puede revertir un cobro ni dejar
    // al cajero mirando una rueda mientras el cliente espera.
    // El ticket tampoco espera, pero ahora sí avisa: antes fallaba en silencio
    // y el cajero se quedaba mirando la impresora sin saber por qué.
    //
    // ── EL SEGUNDO PAPEL, CUANDO NO TOCA ────────────────────────────────────
    // Con `ticket_final` el comprobante ya salió al pedir la cuenta y lo tiene
    // el cliente en la mano: imprimir otro es el duplicado que este cambio vino
    // a quitar. En mostrador NO aplica —ahí no hay «pedir cuenta», así que el
    // ticket del cobro es el único papel que existe.
    const yaSeImprimioLaCuenta =
      isMesa && (configuracion?.flujo_cuenta || "") === "ticket_final";

    // ── EL CAJÓN, CUANDO NO HAY TICKET QUE LO LLEVE ─────────────────────────
    // El pulso viaja DENTRO del ticket (`construirTicket` lo decide por el
    // método de pago). Con el flujo de un solo papel no se imprime ninguno al
    // cobrar, así que sin esto el cajón NO SE ABRIRÍA NUNCA — un fallo que
    // introdujo el propio cambio de un papel y que sólo se ve con dinero en la
    // mano.
    //
    // Se dispara SÓLO en ese caso: cuando sí hay ticket, él lleva el pulso y
    // mandar otro sería un segundo golpe al solenoide sin ganar nada.
    //
    // Fuera de la cola a propósito: un pulso reintentado abriría el cajón
    // cuando la impresora vuelva, con dinero dentro y nadie delante. Si falla,
    // el cajero tiene una llave. Ver `abrirCajon` en lib/Hub.js.
    if (
      yaSeImprimioLaCuenta &&
      (nuevaVentaBD.metodo_pago === "efectivo" ||
        nuevaVentaBD.metodo_pago === "mixto")
    ) {
      void abrirCajon();
    }

    if (!yaSeImprimioLaCuenta)
      void enviarTicket(ventaVisual, configuracion).then((r) => {
        // `salioPapel` y no `r.ok`: ver `avisoDeImpresion`. Un descarte por id
        // repetido vuelve con `ok: true` y sin papel.
        if (!salioPapel(r))
          showToast(avisoDeImpresion("El ticket", { resultado: r }), "info");
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
          usuario: user?.nombre || "Sistema",
          accion: "CANJE_RECOMPENSA",
          modulo: "POS",
          nivel: "info",
          detalles: `Folio ${nuevaVentaBD.folio}: canje "${datosPago.canje.nombre}" (−${datosPago.canje.puntos} pts${
            Number(datosPago.canje.monto) > 0
              ? `, descuento $${datosPago.canje.monto}`
              : ""
          }) del cliente ${datosPago?.clienteNombre || nuevaVentaBD.cliente_id}.`,
        });
      }
    }
    // Inventario: en MESA ya se descontó al mandar a producción. Solo la VENTA
    // DIRECTA descuenta aquí (se vende, se corrobora y luego se prepara).
    if (!isMesa) {
      // Aquí el origen es la venta: en mostrador no hay comanda previa.
      descontarStockVenta(itemsTicket, subsVenta, nuevaVentaBD.id);
    }

    registrarAuditoria({
      fecha: new Date().toISOString(),
      usuario: user?.nombre || "Sistema",
      accion: "COBRO_TICKET",
      modulo: "POS",
      nivel: fiscalTicket.descuento > 0 ? "warning" : "info",
      detalles: `Folio ${nuevaVentaBD.folio} cobrado. Total: $${granTotalTicket}${
        fiscalTicket.descuento > 0
          ? ` | Descuento: $${fiscalTicket.descuento} autorizado por ${datosPago?.descuentoAutorizadoPor || "sesión de gestión"}`
          : ""
      }`,
    });

    if (isMesa) {
      if (ventaVisual._quedaGente) {
        const mesaActualizada = {
          ...mesaActual,
          estado: "ocupada",
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
        enqueueAction("mesas", "upsert", mesaActualizada);
        useAppStore.setState((prev) => ({
          mesas: prev.mesas.map((m) =>
            m.id === mesaActual.id ? mesaActualizada : m,
          ),
        }));
        setCarrito(carritoRestante);
      } else {
        const mesaLiberada = {
          ...mesaActual,
          estado: "libre",
          comensales_reales: 0,
          orden_actual: null,
        };
        enqueueAction("mesas", "upsert", mesaLiberada);

        // Cerrar las comandas activas de esta mesa al cobrar: salen de la fila
        // del KDS y del panel de rondas (estado 'completada').
        const comandasMesa = (
          useAppStore.getState().comandas_activas || []
        ).filter(
          (c) =>
            String(c.mesa_id) === String(mesaActual.id) &&
            !["completada", "cancelada"].includes(c.estado),
        );
        comandasMesa.forEach((c) => {
          enqueueAction("comandas", "upsert", { ...c, estado: "completada" });
        });

        // Si era una mesa principal de un grupo, liberar también las satélites.
        const satelites = (useAppStore.getState().mesas || []).filter(
          (m) => String(m.mesa_principal_id) === String(mesaActual.id),
        );
        satelites.forEach((s) => {
          const liberada = {
            ...s,
            estado: "libre",
            mesa_principal_id: null,
            orden_actual: null,
            comensales_reales: 0,
          };
          enqueueAction("mesas", "upsert", liberada);
        });

        useAppStore.setState((prev) => ({
          mesas: prev.mesas.map((m) => {
            if (String(m.id) === String(mesaActual.id)) return mesaLiberada;
            if (String(m.mesa_principal_id) === String(mesaActual.id))
              return {
                ...m,
                estado: "libre",
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

  /**
   * El botón «Imprimir» del ticket que se enseña recién cobrada la venta.
   *
   * ── LO QUE HACÍA ANTES ──────────────────────────────────────────────────
   * `window.print()` a secas, dentro de `TicketImpresion`. En el navegador eso
   * saca el modal por la impresora del sistema en A4; en la caja —Tauri sobre
   * WebView2— es una de dos: o no hace nada, o abre un diálogo de Windows para
   * mandar el ticket a una hoja tamaño carta. Ninguna de las dos es lo que
   * quiere quien lo pulsa, que es papel térmico como el que acaba de salir.
   *
   * ── POR QUÉ CUENTA COPIAS ───────────────────────────────────────────────
   * Porque el ticket original ya salió al cobrar. Éste es, por definición, la
   * copia 2, y `hub/cola.rs` descarta por id repetido SIN dar error. Sin subir
   * `copias_impresas` el papel no saldría y el sistema diría que sí. Hermano
   * exacto del botón de reimpresión de Reportes; comparten razón y forma.
   */
  const reimprimirTicketRecien = async () => {
    const venta = ticketGenerado;
    if (!venta || reimprimiendoTicket) return;

    setReimprimiendoTicket(true);
    const copia = safeNumber(venta.copias_impresas, 1) + 1;

    try {
      const r = await enviarTicket(venta, configuracion, {
        copia,
        // Una copia no mueve dinero: el cajón ya se abrió al cobrar.
        abrirCajon: false,
      });

      if (!salioPapel(r)) {
        showToast(
          r?.estado === "duplicado"
            ? "El hub descartó esta copia como repetida y no salió papel. Avisa a soporte."
            : "No se pudo imprimir la copia. Revisa la impresora.",
          "error",
        );
        return;
      }

      // El contador sube DESPUÉS del papel, y se sube en los tres sitios donde
      // vive esta venta: el modal abierto, la lista en memoria y la cola de
      // sincronización. Dejar fuera el modal haría que el segundo clic pidiera
      // otra vez la copia 2 y el hub la descartara en silencio.
      const actualizada = { ...venta, copias_impresas: copia };
      setTicketGenerado(actualizada);
      enqueueAction("ventas", "update", {
        ...actualizada,
        _quedaGente: undefined,
      });
      useAppStore.setState((prev) => ({
        ventas: (prev.ventas || []).map((x) =>
          String(x.id) === String(venta.id)
            ? { ...x, copias_impresas: copia }
            : x,
        ),
      }));

      registrarAuditoria?.({
        fecha: new Date().toISOString(),
        usuario: user?.nombre ?? "Sistema",
        accion: "REIMPRESION_TICKET",
        modulo: "POS",
        nivel: "info",
        detalles:
          `Folio ${venta.folio} reimpreso desde el ticket de cobro. ` +
          `Impresión ${copia}.`,
      });

      showToast(`Copia ${copia} del folio ${venta.folio}.`, "success");
    } finally {
      setReimprimiendoTicket(false);
    }
  };

  const handleCerrarTicket = () => {
    const quedaGente = ticketGenerado?._quedaGente;
    setTicketGenerado(null);
    // La venta terminó: en teléfono la hoja del carrito no debe quedarse arriba
    // tapando el catálogo con una lista ya vacía.
    setCarritoAbierto(false);
    if (quedaGente)
      showToast(
        "Ticket individual cobrado. La mesa sigue abierta para el resto.",
        "success",
      );
    else if (isMesa) navigate("/mesas");
    else showToast("¡Venta de mostrador cerrada!", "success");
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
    !!modalMods ||
    !!lineaDescuento ||
    !!ticketGenerado;

  const puedeCobrarAqui = !(isMesa && esMesero);
  const hayCarrito = carrito.length > 0;
  // El +/− actúa sobre la ÚLTIMA línea agregada: es la que el cajero acaba de
  // tocar y la que quiere corregir. Sin esto haría falta un cursor de carrito,
  // que en una pantalla táctil no aporta.
  const ultimaLinea = carrito[carrito.length - 1];

  useAtajos(
    "pos",
    {
      f9: {
        descripcion: "Cobrar",
        accion: () => {
          if (!hayCarrito || isProcessing || !puedeCobrarAqui) return;
          intentarCobrar();
        },
      },
      f2: {
        descripcion: "Mandar a producción",
        accion: () => {
          if (!isMesa || !hayCarrito) return;
          handleGuardarEnMesa();
        },
      },
      f4: {
        descripcion: "Pedir la cuenta",
        accion: () => {
          if (!isMesa || !hayCarrito) return;
          handlePedirCuenta();
        },
      },
      "+": {
        descripcion: "Sumar 1 al último platillo",
        accion: () => ultimaLinea && modificarCantidad(ultimaLinea.id, 1),
      },
      "-": {
        descripcion: "Restar 1 al último platillo",
        accion: () => ultimaLinea && modificarCantidad(ultimaLinea.id, -1),
      },
      escape: { descripcion: "Salir del punto de venta", accion: salirDelPos },
    },
    // Con un modal encima, las teclas de acción se apagan: pulsar F9 sobre el
    // cuadro de cobro no puede volver a lanzar el cobro.
    { titulo: "Punto de venta", activo: !hayModalAbierto },
  );

  // Scope de mayor precedencia mientras hay modal: Escape cierra lo que esté
  // abierto en vez de sacarte del POS.
  useAtajos(
    "pos-modal",
    {
      escape: {
        descripcion: "Cerrar este cuadro",
        accion: () => {
          if (ticketGenerado) return handleCerrarTicket();
          if (modalMods) return setModalMods(null);
          if (modalElecciones) return setModalElecciones(null);
          if (mostrarGateStock) return setMostrarGateStock(false);
          if (modalRondasPendientes) return setModalRondasPendientes(false);
          if (showModalCobro) return setShowModalCobro(false);
        },
      },
    },
    { titulo: "Cuadro abierto", activo: hayModalAbierto },
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
                  ? "bg-ops-danger text-ops-danger-fg shadow-lg shadow-ops-danger/30 border-ops-danger"
                  : "bg-ops-panel-2 text-ops-muted border-transparent hover:border-ops-border dark:hover:border-ops-border hover:text-ops-ink dark:hover:text-ops-ink"
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
                    {getPrecio(prod).toLocaleString("es-MX", {
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
        etiquetaAbrir={isMesa ? "Ver comanda" : "Ver carrito"}
        resumen={`$${granTotal.toLocaleString("es-MX", { minimumFractionDigits: 2 })}`}
        insignia={carrito.reduce((n, i) => n + (Number(i.cantidad) || 0), 0)}
        // Con el carrito vacío no hay nada que ver: la barra sólo taparía
        // productos. Aparece en cuanto entra la primera línea.
        disparador={carrito.length > 0}
      >
        <div
          className={`p-6 flex items-center justify-between border-b border-ops-border transition-colors duration-lenta ${isMesa ? "bg-ops-danger/5" : "bg-ops-panel-2"}`}
        >
          <div className="flex items-center gap-3 text-ops-ink">
            {isMesa ? (
              <ChefHat
                className={`w-7 h-7 ${isMesa ? "text-ops-danger" : "text-ops-accent"}`}
              />
            ) : (
              <ShoppingCart className="w-7 h-7 text-ops-accent" />
            )}
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-ops-muted mb-0.5">
                {isMesa ? "Comanda para" : "Venta Rápida"}
              </p>
              <h2 className="text-xl font-black font-syne tracking-tight leading-none">
                {isMesa ? mesaActual.nombre : "Mostrador"}
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
                          {linea.neto.toLocaleString("es-MX", {
                            minimumFractionDigits: 2,
                          })}
                        </p>
                        {linea.descuento > 0 && (
                          <>
                            <span className="text-[11px] text-ops-muted line-through">
                              $
                              {linea.bruto.toLocaleString("es-MX", {
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
                  {/* Lo elegido y la nota se ven SIEMPRE en el carrito, no
                      escondidos tras un icono. Es lo que el mesero repite en
                      voz alta para confirmar con el cliente antes de mandar. */}
                  {(item.modificadores || []).length > 0 && (
                    <ul className="mt-1.5 space-y-0.5">
                      {item.modificadores.map((m) => (
                        <li
                          key={`${m.grupo_id}-${m.id_opcion}`}
                          className="text-[11px] font-bold text-ops-muted leading-tight"
                        >
                          · {m.nombre}
                        </li>
                      ))}
                    </ul>
                  )}
                  {item.nota && (
                    <p className="mt-1.5 text-[11px] font-bold text-ops-accent leading-tight break-words">
                      📝 {item.nota}
                    </p>
                  )}
                  {/* `whitespace-nowrap` no es estética. Con `uppercase` y
                      `tracking-widest` esta etiqueta ocupa bastante más de lo
                      que aparenta, la columna no da, y rompía por el espacio:
                      «Enviado:» en un renglón y el número en otro. Y este
                      número es el que dice que esas unidades YA están en
                      cocina —o sea que no se pueden quitar sin autorización de
                      gerente, y hay código aquí mismo que lo impide—. Partido
                      en dos y en 10 px, un mesero con prisa no lo lee y se
                      pelea con un botón que no responde sin saber por qué. */}
                  {(item.cantidad_enviada || 0) > 0 && (
                    <span className="text-[10px] font-black text-ops-warn bg-ops-warn/10 border border-ops-warn/30 px-2 py-1 rounded-ui mt-2 inline-block uppercase tracking-widest whitespace-nowrap">
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
                  onClick={() => abrirNotaDeLinea(item)}
                  title="Cómo lo quiere / nota para cocina"
                  className={`w-10 h-10 flex items-center justify-center rounded-ui transition-colors ${
                    item.nota || (item.modificadores || []).length > 0
                      ? "text-ops-accent bg-ops-accent/10"
                      : "text-ops-muted hover:bg-ops-panel-2"
                  }`}
                >
                  <StickyNote className="w-5 h-5" />
                </button>

                <button
                  onClick={() => setLineaDescuento(item)}
                  title="Descuento a este producto"
                  className={`w-10 h-10 flex items-center justify-center rounded-ui transition-colors ${
                    item.descuento
                      ? "text-ops-warn bg-ops-warn/10"
                      : "text-ops-muted hover:bg-ops-panel-2"
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
          <div className="border-t border-ops-border bg-ops-panel max-h-[40dvh] overflow-y-auto custom-scrollbar shrink-0">
            <PanelRondas mesaId={mesaActual.id} />
          </div>
        )}

        <div className="p-6 bg-ops-panel border-t border-ops-border transition-colors duration-lenta">
          <div className="space-y-3 mb-6">
            <div className="flex justify-between text-ops-muted font-bold text-sm">
              <span>Subtotal</span>
              <span>
                $
                {subtotal.toLocaleString("es-MX", {
                  minimumFractionDigits: 2,
                })}
              </span>
            </div>
            <div className="flex justify-between text-ops-muted font-bold text-sm">
              <span>IVA ({ivaRaw * 100}%)</span>
              <span>
                $
                {totalIva.toLocaleString("es-MX", {
                  minimumFractionDigits: 2,
                })}
              </span>
            </div>
            <div className="flex justify-between text-ops-ink font-black text-3xl pt-4 border-t border-ops-border border-dashed">
              <span>Total</span>
              <span className="text-ops-ok">
                $
                {granTotal.toLocaleString("es-MX", {
                  minimumFractionDigits: 2,
                })}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3">
            {isMesa && (
              <>
                {/* La cuenta ya está en la mesa: se dice, y se ofrece la salida.
                  Un botón que simplemente no responde se lee como una app rota;
                  un aviso con su llave al lado se lee como una regla. */}
                {cuentaCerrada && (
                  <div className="mb-3 p-3 rounded-ui border-2 border-ops-warn bg-ops-warn/10">
                    <p className="text-xs font-black text-ops-ink mb-2">
                      Cuenta impresa y entregada
                      {mesaActual?.orden_actual?.folio
                        ? ` · ${mesaActual.orden_actual.folio}`
                        : ""}
                    </p>
                    <p className="text-[11px] font-bold text-ops-muted mb-3">
                      No se puede agregar hasta cobrarla. Si el cliente pidió
                      algo más, reábrela. Si sólo quiere el papel otra vez,
                      imprímele una copia.
                    </p>
                    {/* Las dos salidas, y en este orden. Reabrir es la que
                        cambia algo —pide PIN y desbloquea la cuenta—; la copia
                        no mueve nada. Sin ella, «se me cayó el papel» obligaba
                        a reabrir, y una operación privilegiada usada por
                        costumbre deja de proteger lo que protege. */}
                    <div className="flex flex-wrap gap-2">
                      <OpsButton tamano="sm" onClick={intentarReabrir}>
                        Reabrir cuenta
                      </OpsButton>
                      <OpsButton
                        tamano="sm"
                        icono={ReceiptText}
                        onClick={reimprimirCuenta}
                        disabled={
                          reimprimiendoCuenta ||
                          !mesaActual?.orden_actual?.folio
                        }
                      >
                        Imprimir copia
                      </OpsButton>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <OpsButton
                    tamano="lg"
                    icono={ChefHat}
                    tecla="F2"
                    onClick={handleGuardarEnMesa}
                    disabled={carrito.length === 0 || cuentaCerrada}
                    className="w-full"
                  >
                    A Producción
                  </OpsButton>

                  <OpsButton
                    tamano="lg"
                    icono={BellRing}
                    tecla="F4"
                    onClick={handlePedirCuenta}
                    disabled={carrito.length === 0 || cuentaCerrada}
                    className="w-full"
                  >
                    Pedir Cuenta
                  </OpsButton>
                </div>
              </>
            )}

            {!(isMesa && esMesero) && (
              <OpsButton
                // El botón más importante de la app: alto, con la tecla que
                // dispara lo MISMO (F9) impresa encima.
                tamano="lg"
                variante={isMesa ? "cobro" : "exito"}
                icono={CreditCard}
                tecla="F9"
                onClick={intentarCobrar}
                disabled={carrito.length === 0 || isProcessing}
                className="w-full py-5 text-lg"
              >
                {isProcessing
                  ? "Procesando…"
                  : isMesa
                    ? "Cerrar Mesa y Cobrar"
                    : "Cobrar Ticket"}
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

      {/* PIN para reabrir una cuenta ya entregada. Modal propio: window.confirm
          está vetado, y esto además pide un dato. */}
      {pidiendoReapertura && (
        <OpsModal
          titulo="Reabrir la cuenta"
          icono={ReceiptText}
          ancho="max-w-sm"
          onClose={() => setPidiendoReapertura(false)}
          pie={
            <>
              <OpsButton
                className="flex-1"
                onClick={() => setPidiendoReapertura(false)}
              >
                Cancelar
              </OpsButton>
              <OpsButton
                variante="cobro"
                className="flex-1"
                disabled={pinReapertura.length < 4}
                onClick={confirmarReapertura}
              >
                Reabrir
              </OpsButton>
            </>
          }
        >
          <p className="text-ops-muted font-bold text-sm mb-1">
            El cliente ya tiene la cuenta
            {mesaActual?.orden_actual?.folio
              ? ` ${mesaActual.orden_actual.folio}`
              : ""}
            . Reabrirla queda registrado.
          </p>
          <p className="text-ops-muted font-bold text-xs mb-4">
            PIN de quien autoriza (encargado, gerente o capitán):
          </p>
          <input
            type="password"
            inputMode="numeric"
            autoFocus
            maxLength={6}
            value={pinReapertura}
            onChange={(e) => {
              setPinReapertura(e.target.value.replace(/\D/g, ""));
              setPinReaperturaError("");
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && pinReapertura.length >= 4)
                confirmarReapertura();
            }}
            className="w-full text-center text-3xl tracking-[0.4em] font-black bg-ops-panel-2 dark:bg-ops-bg border-2 border-ops-border rounded-ui py-3 text-ops-ink"
            placeholder="••••••"
          />
          {pinReaperturaError && (
            <p className="text-ops-danger text-xs font-black mt-2">
              {pinReaperturaError}
            </p>
          )}
        </OpsModal>
      )}

      {/* MODAL: elecciones del paquete ("elige 1 de N" por grupo) */}
      {modalElecciones && (
        <div className="fixed inset-0 bg-ops-ink/60 dark:bg-ops-bg/80 backdrop-blur-md z-[120] flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-ops-panel rounded-ui-lg w-full max-w-md shadow-2xl border-2 border-ops-border animate-in zoom-in-95 flex flex-col max-h-[85dvh]">
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
                        String(modalElecciones.seleccion[g.grupo] ?? "") ===
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
                              ? "border-ops-accent bg-ops-accent/10 text-ops-accent shadow-sm"
                              : "border-ops-border bg-ops-panel-2 text-ops-muted hover:border-ops-border"
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

      {/* MODAL: «¿cómo lo quiere?» — modificadores del platillo + nota libre.
          Nada de lo que se elige aquí suma precio ni descuenta inventario
          todavía; es deliberado y está explicado en lib/Modificadores.js. */}
      {modalMods && (
        <div className="fixed inset-0 bg-ops-ink/60 dark:bg-ops-bg/80 backdrop-blur-md z-[120] flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-ops-panel rounded-ui-lg w-full max-w-md shadow-2xl border-2 border-ops-border animate-in zoom-in-95 flex flex-col max-h-[85dvh]">
            <div className="p-6 border-b border-ops-border flex justify-between items-center">
              <div className="flex items-center gap-3 min-w-0">
                <div className="bg-ops-accent/15 p-2.5 rounded-ui shrink-0">
                  <SlidersHorizontal className="w-6 h-6 text-ops-accent" />
                </div>
                <div className="min-w-0">
                  <h3 className="font-black font-syne text-lg text-ops-ink leading-tight truncate">
                    {modalMods.producto.nombre}
                  </h3>
                  <p className="text-[10px] font-bold text-ops-muted uppercase tracking-widest">
                    ¿Cómo lo quiere?
                  </p>
                </div>
              </div>
              <button
                onClick={() => setModalMods(null)}
                className="p-2 text-ops-muted hover:text-ops-danger shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-5">
              {/* ── EL AVISO DE QUE LA LÍNEA SE VA A PARTIR ──────────────────
                  Sin esto, el mesero teclea la nota creyendo que se la pone a
                  las tres pizzas y sólo se la lleva la que no ha salido. El
                  reparto es el correcto —lo que está en la plancha no se
                  reescribe—, pero tiene que verlo ANTES de escribir, no
                  descubrirlo en el carrito después. */}
              {safeNumber(modalMods.libres, 0) > 0 && (
                <div className="rounded-ui border-2 border-ops-warn/40 bg-ops-warn/10 px-4 py-3">
                  <p className="text-[11px] font-black uppercase tracking-widest text-ops-warn">
                    Esta nota va sólo a lo que no ha salido
                  </p>
                  <p className="text-xs font-bold text-ops-ink mt-1 leading-snug">
                    {safeNumber(modalMods.libres, 0)} sin enviar se separan con
                    esta nota. Lo que ya está en cocina se queda como está: el
                    papel del cocinero no cambia.
                  </p>
                </div>
              )}
              {gruposDelModal.map((g) => {
                const marcadas = (modalMods.seleccion[String(g.id)] || []).map(
                  String,
                );
                return (
                  <div key={g.id}>
                    <p className="text-[10px] font-black uppercase tracking-widest text-ops-accent">
                      {g.nombre}
                      {g.obligatorio && " *"}
                    </p>
                    {/* La regla se escribe con la MISMA función que usa el
                        catálogo, para que lo prometido al configurar sea
                        literalmente lo que se lee al vender. */}
                    <p className="text-[11px] text-ops-muted mb-2">
                      {textoDeReglas(g)}
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      {g.opciones.map((op) => {
                        const activa = marcadas.includes(String(op.id_opcion));
                        return (
                          <button
                            key={op.id_opcion}
                            onClick={() =>
                              setModalMods((prev) => ({
                                ...prev,
                                seleccion: alternar(
                                  g,
                                  prev.seleccion,
                                  op.id_opcion,
                                ),
                              }))
                            }
                            className={`px-4 py-3 rounded-ui font-black text-sm border-2 text-left transition-all active:scale-95 ${
                              activa
                                ? "border-ops-accent bg-ops-accent/10 text-ops-accent shadow-sm"
                                : "border-ops-border bg-ops-panel-2 text-ops-muted hover:border-ops-border"
                            }`}
                          >
                            {op.nombre}
                          </button>
                        );
                      })}
                      {g.opciones.length === 0 && (
                        <p className="col-span-2 text-[11px] text-ops-muted italic">
                          Este grupo no tiene opciones configuradas.
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}

              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-ops-muted mb-2 flex items-center gap-1.5">
                  <StickyNote className="w-3.5 h-3.5" /> Nota para cocina
                </p>
                <textarea
                  value={modalMods.nota}
                  onChange={(e) =>
                    setModalMods((prev) => ({ ...prev, nota: e.target.value }))
                  }
                  rows={2}
                  maxLength={120}
                  placeholder="Sin cebolla, salsa aparte…"
                  className="w-full bg-ops-panel-2 border-2 border-ops-border text-ops-ink font-bold px-3 py-2.5 rounded-ui outline-none focus:border-ops-accent text-sm resize-none transition-colors"
                />
                <p className="text-[10px] text-ops-muted mt-1">
                  Se imprime en la comanda y se ve en la pantalla de cocina.
                </p>
              </div>
            </div>

            <div className="p-6 border-t border-ops-border">
              {/* Un botón apagado sin decir POR QUÉ es una pantalla que no se
                  puede usar: se nombra el grupo que falta. */}
              {faltantes(gruposDelModal, modalMods.seleccion).length > 0 && (
                <p className="text-[11px] font-bold text-ops-warn mb-3 text-center">
                  Falta elegir:{" "}
                  {faltantes(gruposDelModal, modalMods.seleccion).join(", ")}
                </p>
              )}
              <button
                onClick={confirmarModificadores}
                disabled={
                  !seleccionCompleta(gruposDelModal, modalMods.seleccion)
                }
                className="w-full bg-ops-accent text-ops-accent-fg py-4 rounded-ui font-black uppercase tracking-widest shadow-lg disabled:bg-ops-panel-2 disabled:dark:bg-ops-border disabled:text-ops-muted disabled:shadow-none active:scale-95 transition-all"
              >
                {modalMods.lineaId ? "Guardar cambios" : "Agregar al pedido"}
              </button>
            </div>
          </div>
        </div>
      )}

      {mostrarGateStock && (
        <ConfirmacionStockModal
          carrito={gateContext === "produccion" ? gateItems : carrito}
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
        <TicketImpresion
          venta={ticketGenerado}
          onClose={handleCerrarTicket}
          onImprimir={reimprimirTicketRecien}
          imprimiendo={reimprimiendoTicket}
        />
      )}
    </div>
  );
}
