import { useState, useMemo } from 'react';
import {
  X,
  CreditCard,
  Banknote,
  Calculator,
  Users,
  Receipt,
  HeartHandshake,
  Landmark,
  Percent,
  ShieldCheck,
  UserRound,
  UserPlus,
  Search,
  Star,
} from 'lucide-react';
import { useAppStore } from '../../../store/useAppStore';
import { useAuthStore } from '../../auth/useAuthStore';
import { useSyncStore } from '../../../store/useSyncStore';
import { getCapacidades, tieneFlag } from '../../../lib/Permisos';
import { buscarAutorizador } from '../../../lib/Autorizacion';
import { importeDeLinea, parteDeCuenta } from '../../../lib/Fiscal';
import { useAcoplado } from '../../../hooks/useAcoplado';

// HELPERS ORIGINALES (Intactos)
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
  // Lectura canónica de precio. El catálogo (recetas) usa 'precio_venta'.
  // Los ítems del carrito llevan 'precio' (campo interno normalizado al
  // agregar) → compat hacia atrás con órdenes de mesa ya persistidas.
  // Se elimina el fallback a 'costo'/'price'/'valor' (devolvía el COSTO
  // como precio: bug latente).
  const v = item?.precio_venta ?? item?.precio ?? item?.precioVenta;
  return safePriceString(v);
};

const round2 = (num) => Math.round((Number(num) || 0) * 100) / 100;

export default function ModalCobro({
  total,
  comensales,
  carrito,
  onClose,
  onProcesarPago,
  /**
   * Esconde la división por platillos.
   *
   * Se pone cuando lo que se está cobrando es una CUENTA YA IMPRESA (§F del
   * flujo de cuenta): qué se cobra lo dice el papel que el cliente tiene en la
   * mano, y volver a preguntarlo abriría la puerta a cobrar algo distinto de
   * lo impreso. Nadie se enteraría hasta cuadrar la caja, si es que alguien la
   * cuadra.
   *
   * La división por personas y el pago en partes siguen ahí: repartir entre
   * cinco lo que dice el papel no cambia lo que dice el papel.
   */
  divisionBloqueada = false,
}) {
  // ¿Caben las dos columnas del modal, o hay que apilarlas? Mismo umbral y
  // mismo hook que el resto de la app.
  //
  // Antes el modal cambiaba de figura en `md` (768) y todo lo demás en 1024:
  // dos números que mantener, y entre ellos una franja donde el modal se ponía
  // a dos columnas mientras el mapa que hay detrás seguía en una. `useAcoplado`
  // existe justamente para que ese número esté escrito en un sitio.
  const acoplado = useAcoplado();

  // ─── LÓGICA ORIGINAL INTACTA ───
  const totalSanitizado = round2(safePriceString(total));
  const comensalesSanitizado = safeNumber(comensales, 1);
  const carritoSanitizado = Array.isArray(carrito) ? carrito : [];

  const [pagos, setPagos] = useState([]);
  const [metodoActivo, setMetodoActivo] = useState('Efectivo');
  const [montoInput, setMontoInput] = useState('');

  const [propinaSeleccionada, setPropinaSeleccionada] = useState(0);
  const [propinaManual, setPropinaManual] = useState('');

  // Propina proveniente de sobrepagos en tarjeta/transferencia. Se "congela"
  // como monto fijo (no porcentaje) para no entrar en el bucle
  // más-propina → más-total → más-excedente. Se suma a la propina elegida.
  const [propinaExtra, setPropinaExtra] = useState(0);

  // Pago pendiente de confirmar cuando tarjeta/transferencia exceden el saldo.
  // null = sin diálogo. { metodo, monto, excedente } = mostrar confirmación.
  const [dialogoExcedente, setDialogoExcedente] = useState(null);

  // ─── DESCUENTO (autorizado) ────────────────────────────────────────────────
  // Cualquiera puede ABRIR la opción, pero aplicarla exige la capacidad
  // 'autoriza_descuentos' (Proyecto L — flag, no nombre de rol):
  //  - Sesión con el flag → aplica directo, sin fricción.
  //  - Cualquier otra sesión → pinpad de autorización: alguien de staff con el
  //    flag teclea SU PIN (4-6 dígitos) y queda registrado como autorizador.
  const { staff, clientes, upsertCliente, configuracion, roles_permisos } =
    useAppStore();
  const { enqueueAction } = useSyncStore();
  const { user } = useAuthStore();
  const autorizaDescuento = (rol) =>
    tieneFlag(getCapacidades(rol, roles_permisos), 'autoriza_descuentos');
  const sesionAutoriza = autorizaDescuento(user?.rol || user?.puesto);

  const [mostrarDescuento, setMostrarDescuento] = useState(false);
  const [descTipo, setDescTipo] = useState('pct'); // 'pct' | 'monto'
  const [descValor, setDescValor] = useState('');
  // { tipo, valor, autorizadoPor } — solo existe cuando ya fue autorizado.
  const [descuentoAplicado, setDescuentoAplicado] = useState(null);
  const [pinAuthAbierto, setPinAuthAbierto] = useState(false);
  const [pinAuth, setPinAuth] = useState('');
  const [pinAuthError, setPinAuthError] = useState('');

  const intentarAplicarDescuento = () => {
    const v = safeNumber(descValor, 0);
    if (v <= 0) return;
    if (descTipo === 'pct' && v > 100) return;
    if (sesionAutoriza) {
      setDescuentoAplicado({
        tipo: descTipo,
        valor: v,
        autorizadoPor: user?.nombre || 'Gestión',
      });
      setMostrarDescuento(false);
    } else {
      setPinAuthError('');
      setPinAuth('');
      setPinAuthAbierto(true);
    }
  };

  const autorizarDescuentoConPin = () => {
    const p = String(pinAuth).trim();
    if (p.length < 4) {
      setPinAuthError('PIN incompleto.');
      return;
    }
    // ── LA TERCERA COPIA, RETIRADA EL 18-AGO ──────────────────────────────
    // Aquí estaba escrita a mano la misma búsqueda que hacen el checador y la
    // reapertura de cuenta: capacidad + empleado activo + PIN en `pin` o en
    // `pin_acceso`. `lib/Autorizacion.js` nació para eso y esta pantalla era
    // la que faltaba por migrar.
    //
    // La parte que de verdad importa es la de «activo». Con tres copias, la
    // que diverge es siempre ésa, porque su fallo NO se nota probando: todo
    // funciona igual, sólo que autoriza descuentos alguien que ya no trabaja
    // aquí. Un fallo que no da error, otra vez.
    const autorizador = buscarAutorizador({
      staff,
      roles_permisos,
      pin: p,
      flag: 'autoriza_descuentos',
    });
    if (!autorizador) {
      setPinAuthError('PIN inválido o sin permiso para autorizar.');
      setPinAuth('');
      return;
    }
    setDescuentoAplicado({
      tipo: descTipo,
      valor: safeNumber(descValor, 0),
      autorizadoPor: autorizador.nombre,
    });
    setPinAuthAbierto(false);
    setMostrarDescuento(false);
  };

  const quitarDescuento = () => {
    setDescuentoAplicado(null);
    setDescValor('');
  };

  // ─── CLIENTE (CRM, opt-in) ─────────────────────────────────────────────────
  // La venta de mostrador NO exige cliente: la sección nace colapsada y todo
  // el flujo de cobro funciona igual sin tocarla. Asociar un cliente manda
  // cliente_id en la venta y dispara la acumulación (visitas/gasto/puntos)
  // vía RPC atómica por la cola de sync.
  const [mostrarCliente, setMostrarCliente] = useState(false);
  const [clienteBusqueda, setClienteBusqueda] = useState('');
  const [clienteSel, setClienteSel] = useState(null);
  const [altaExpres, setAltaExpres] = useState(false);
  const [nuevoCliente, setNuevoCliente] = useState({
    nombre: '',
    telefono: '',
  });

  const clientesMatch = useMemo(() => {
    const term = clienteBusqueda.trim().toLowerCase();
    if (term.length < 2) return [];
    return (clientes || [])
      .filter((c) => c.activo !== false)
      .filter(
        (c) =>
          (c.nombre || '').toLowerCase().includes(term) ||
          (c.telefono || '').toLowerCase().includes(term),
      )
      .slice(0, 5);
  }, [clientes, clienteBusqueda]);

  const seleccionarCliente = (c) => {
    setClienteSel(c);
    setClienteBusqueda('');
    setAltaExpres(false);
  };

  const quitarCliente = () => {
    setClienteSel(null);
    setClienteBusqueda('');
    setAltaExpres(false);
    setCanjeSel(null);
  };

  // ─── LEALTAD: canje de recompensa del catálogo del dueño ──────────────────
  // configuracion.recompensas = [{ id, nombre, costo_puntos, activo }].
  // Solo se ofrecen las activas; el cliente vivo del store dicta el saldo
  // (el eco realtime lo mantiene fresco). El canje se confirma al cobrar:
  // PosScreen encola canjear_puntos (atómica + idempotente).
  const [canjeSel, setCanjeSel] = useState(null); // { nombre, puntos } | null

  const clienteVivo = clienteSel
    ? (clientes || []).find((c) => String(c.id) === String(clienteSel.id)) ||
      clienteSel
    : null;
  const puntosCliente = Number(clienteVivo?.puntos_lealtad) || 0;
  const recompensasActivas = (
    Array.isArray(configuracion?.recompensas) ? configuracion.recompensas : []
  ).filter((r) => r?.activo !== false && Number(r?.costo_puntos) > 0);

  // Alta exprés: nombre + teléfono mínimos, mismo shape que ClientesScreen
  // (id estilo Date.now(), contadores en 0). enqueueAction persiste en Dexie
  // y encola el upsert remoto; upsertCliente lo mete al estado en RAM.
  const registrarClienteExpres = () => {
    const nombre = nuevoCliente.nombre.trim();
    if (!nombre) return;
    const payload = {
      id: Date.now(),
      nombre,
      telefono: nuevoCliente.telefono.trim(),
      email: '',
      cumpleanos: '',
      preferencias: '',
      visitas: 0,
      total_gastado: 0,
      puntos_lealtad: 0,
      activo: true,
    };
    enqueueAction('clientes', 'upsert', payload);
    upsertCliente(payload);
    seleccionarCliente(payload);
    setNuevoCliente({ nombre: '', telefono: '' });
  };

  const [tipoDivision, setTipoDivision] = useState('monto');
  const [divisorPersonas, setDivisorPersonas] = useState(comensalesSanitizado);
  const [seleccionPlatillos, setSeleccionPlatillos] = useState({});

  const subtotalSeleccion = round2(
    Object.entries(seleccionPlatillos).reduce((acc, [id, qty]) => {
      const item = carritoSanitizado.find((i) => String(i.id) === String(id));
      if (!item) return acc;
      // importeDeLinea aplica el descuento de producto: cobrar una selección
      // parcial debe respetarlo igual que el cobro completo.
      const { neto } = importeDeLinea({
        precio: getPrecio(item),
        cantidad: safeNumber(qty, 0),
        descuento: item.descuento,
      });
      return acc + neto;
    }, 0),
  );

  const isCobroParcial = tipoDivision === 'platillos' && subtotalSeleccion > 0;
  const totalBase = isCobroParcial ? subtotalSeleccion : totalSanitizado;

  // Descuento → SIEMPRE se normaliza a % del total. Un % escala base e IVA por
  // igual, así que el % sobre el total mostrado es idéntico al descuentoPct
  // sobre la base que espera calcularVenta (el motor recalcula IVA sobre la
  // base neta). Un monto fijo se convierte a su % equivalente del total.
  const pctDescuento = descuentoAplicado
    ? descuentoAplicado.tipo === 'pct'
      ? Math.min(100, Math.max(0, safeNumber(descuentoAplicado.valor, 0)))
      : Math.min(
          100,
          (Math.min(safeNumber(descuentoAplicado.valor, 0), totalBase) /
            (totalBase || 1)) *
            100,
        )
    : 0;
  const montoDescuento = round2(totalBase * (pctDescuento / 100));
  const totalConDescuento = round2(totalBase - montoDescuento);

  // ─── CANJE CON LÓGICA ──────────────────────────────────────────────────────
  // La recompensa canjeada SÍ toca el total cuando es de tipo descuento:
  //  - descuento_pct: % sobre el total ya descontado (lo que se iba a pagar).
  //  - descuento_monto: $ fijo, acotado a no dejar el total en negativo.
  //  - cortesia: no descuenta (el mesero entrega el premio físico).
  // El canje ES la autorización: no pasa por pinpad. Los puntos se restan al
  // confirmar el cobro (RPC atómica encolada por PosScreen).
  const canjeDescuento = !canjeSel
    ? 0
    : canjeSel.tipo === 'descuento_pct'
      ? round2(
          totalConDescuento *
            (Math.min(100, Math.max(0, safeNumber(canjeSel.valor, 0))) / 100),
        )
      : canjeSel.tipo === 'descuento_monto'
        ? round2(
            Math.min(
              Math.max(0, safeNumber(canjeSel.valor, 0)),
              totalConDescuento,
            ),
          )
        : 0;
  const totalCobrable = round2(totalConDescuento - canjeDescuento);

  const propinaCalculada = round2(
    propinaSeleccionada !== 'manual'
      ? totalCobrable * (safeNumber(propinaSeleccionada, 0) / 100)
      : safeNumber(propinaManual, 0),
  );

  // Propina total = la elegida (botones/manual) + la que entró por sobrepago.
  const propinaTotal = round2(propinaCalculada + safeNumber(propinaExtra, 0));

  const granTotal = round2(totalCobrable + propinaTotal);
  const totalPagado = round2(
    pagos.reduce((acc, p) => acc + safeNumber(p?.monto, 0), 0),
  );
  const saldoPendiente = round2(granTotal - totalPagado);

  // El cambio SOLO existe por sobrepago en efectivo. La tarjeta/transferencia
  // cobran el monto exacto: nunca devuelven cambio. Por eso acotamos el excedente
  // a cuánto efectivo se recibió (no se devuelve cambio de un sobrepago de tarjeta).
  const totalEfectivoRecibido = round2(
    pagos
      .filter((p) => (p?.metodo || '').toLowerCase() === 'efectivo')
      .reduce((acc, p) => acc + safeNumber(p?.monto, 0), 0),
  );
  const excedente = saldoPendiente < 0 ? Math.abs(saldoPendiente) : 0;
  const cambio = round2(Math.min(excedente, totalEfectivoRecibido));

  const estaPagado = saldoPendiente <= 0 && totalPagado > 0;

  const UMBRAL_EXCEDENTE = 1; // < $1 = redondeo, no dispara diálogo

  const registrarPago = (metodo, monto) => {
    setPagos((prev) => [
      ...prev,
      { id: Date.now().toString(), metodo, monto: round2(monto) },
    ]);
  };

  const agregarPago = (montoEspecifico = null) => {
    let montoAAgregar =
      montoEspecifico !== null
        ? safeNumber(montoEspecifico)
        : safePriceString(montoInput);

    montoAAgregar = round2(montoAAgregar);

    if (isNaN(montoAAgregar) || montoAAgregar <= 0) return;

    // ¿Este pago de tarjeta/transferencia hace que se supere el saldo?
    // Solo entonces preguntamos si el excedente es propina. Efectivo NO entra
    // (su sobrante es cambio, ya manejado). Excedente < $1 = redondeo, se ignora.
    const metodoLower = metodoActivo.toLowerCase();
    const esDigital =
      metodoLower === 'tarjeta' || metodoLower === 'transferencia';
    const nuevoSaldo = round2(saldoPendiente - montoAAgregar);
    const excedentePago = nuevoSaldo < 0 ? round2(Math.abs(nuevoSaldo)) : 0;

    if (esDigital && excedentePago >= UMBRAL_EXCEDENTE) {
      // No registramos aún: pedimos confirmación.
      setDialogoExcedente({
        metodo: metodoActivo,
        monto: montoAAgregar,
        excedente: excedentePago,
      });
      return;
    }

    // Caso normal (sin excedente digital): registrar directo, venta ágil.
    registrarPago(metodoActivo, montoAAgregar);
    setMontoInput('');
  };

  // El cajero confirmó que el excedente ES propina.
  const confirmarExcedenteComoPropina = () => {
    if (!dialogoExcedente) return;
    registrarPago(dialogoExcedente.metodo, dialogoExcedente.monto);
    setPropinaExtra((prev) =>
      round2(safeNumber(prev) + dialogoExcedente.excedente),
    );
    setDialogoExcedente(null);
    setMontoInput('');
  };

  // El cajero dice que fue error: no registramos el pago, dejamos re-teclear.
  const corregirExcedente = () => {
    setDialogoExcedente(null);
    // montoInput se conserva para que pueda ajustarlo.
  };

  const removerPago = (id) => setPagos(pagos.filter((p) => p.id !== id));

  const sugerencias = [50, 100, 200, 500];

  const handleSugerencia = (valorBillete) => {
    const actual = safePriceString(montoInput);
    setMontoInput(round2(actual + valorBillete).toString());
  };

  // Lo que toca ESTA parte, no `granTotal / N` a secas. La división a secas
  // dejaba un centavo colgando —tres de 33.33 son 99.99— y la venta no cerraba;
  // el porqué entero está en `parteDeCuenta`. Se acota al saldo para que, si
  // alguien metió un pago suelto por en medio, la parte no cobre de más.
  const montoPorPersona = Math.min(
    parteDeCuenta(granTotal, divisorPersonas, pagos.length),
    round2(saldoPendiente),
  );

  // ─── EL PIE DEL COBRO, EXTRAÍDO ──────────────────────────────────────────
  // Saldo, cambio y el botón de confirmar. Se saca a una constante porque las
  // dos figuras lo colocan en sitios DISTINTOS del árbol —dentro de la columna
  // derecha con sitio, como pie del modal entero sin él— y la alternativa era
  // escribirlo dos veces. Dos copias de un botón que cobra es exactamente el
  // tipo de duplicado que se desincroniza: se arregla una y la otra sigue
  // cobrando mal durante meses.
  //
  // Definido una vez, colocado una vez: abajo sólo una de las dos ramas lo
  // pinta.
  const pieDeCobro = (
    <div className="shrink-0 p-5 lg:p-8 bg-white dark:bg-ops-panel border-t-2 border-ops-border shadow-[0_-10px_20px_rgba(0,0,0,0.02)] transition-colors z-10">
      <div className="flex justify-between items-center mb-3">
        <span className="font-black text-ops-muted uppercase tracking-widest text-xs">
          Saldo Pendiente
        </span>
        <span
          className={`font-black text-2xl ${saldoPendiente > 0 ? 'text-ops-danger' : 'text-ops-ok'}`}
        >
          $
          {Math.max(0, saldoPendiente).toLocaleString('es-MX', {
            minimumFractionDigits: 2,
          })}
        </span>
      </div>
      {cambio > 0 && (
        <div className="flex justify-between items-center mb-4 p-4 bg-ops-ok/10 rounded-ui border-2 border-ops-ok/30">
          <span className="font-black text-ops-ok uppercase tracking-widest text-xs">
            Cambio a entregar
          </span>
          <span className="font-black text-3xl text-ops-ok">
            ${cambio.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
          </span>
        </div>
      )}

      <button
        onClick={() =>
          onProcesarPago({
            pagosDetalle: pagos,
            totalPagado,
            cambio,
            propina: propinaTotal,
            totalConPropina: granTotal,
            isCobroParcial,
            seleccion: seleccionPlatillos,
            // % EFECTIVO total (descuento autorizado + canje): el motor
            // fiscal escala base e IVA con este único porcentaje.
            descuentoPct:
              totalBase > 0
                ? ((montoDescuento + canjeDescuento) / totalBase) * 100
                : 0,
            descuentoMonto: round2(montoDescuento + canjeDescuento),
            descuentoAutorizadoPor: descuentoAplicado?.autorizadoPor || null,
            // CRM: null = venta de mostrador sin cliente (default).
            clienteId: clienteSel?.id ?? null,
            clienteNombre: clienteSel?.nombre ?? null,
            // Lealtad: canje elegido con su monto aplicado (PosScreen
            // encola canjear_puntos y audita).
            canje: canjeSel ? { ...canjeSel, monto: canjeDescuento } : null,
          })
        }
        disabled={!estaPagado}
        // `py-4 text-base` sin ancho: a `text-xl` la frase «Confirmar y Cerrar
        // Cuenta» pide ~250 px y el botón tiene ~276, así que con el `gap-3` de
        // por medio se salía por la derecha. `text-center` y sin `truncate`
        // aposta: si algún día no cupiera, que se parta en dos líneas antes que
        // esconder mitad de la palabra «Cuenta».
        className={`w-full mt-4 font-black py-4 lg:py-6 rounded-ui shadow-xl transition-all text-base lg:text-xl flex justify-center items-center text-center gap-2 lg:gap-3 ${
          isCobroParcial
            ? 'bg-ops-accent text-ops-accent-fg shadow-ops-accent/30'
            : 'bg-ops-ok text-ops-ok-fg shadow-ops-ok/30'
        } disabled:bg-ops-panel-2 disabled:dark:bg-ops-border disabled:text-ops-muted disabled:dark:text-ops-muted disabled:shadow-none hover:scale-[1.02] active:scale-95`}
      >
        {isCobroParcial
          ? 'Cobrar Selección (Mesa Abierta)'
          : 'Confirmar y Cerrar Cuenta'}
      </button>
    </div>
  );

  // ─── INTERFAZ REDISEÑADA (TEMA DÍA/NOCHE) ───
  return (
    // Sin margen en estrecho: el modal ocupa la pantalla. Los 16 px de `p-4` a
    // cada lado se comen 32 de 390, y aquí dentro hay filas de etiqueta+cifra
    // que ya iban justas — es de donde salía que «Total Final» y «$40.00» se
    // montaran uno encima del otro.
    <div className="fixed inset-0 z-[150] flex items-center justify-center p-0 lg:p-4 bg-ops-ink/60 dark:bg-ops-bg/80 backdrop-blur-md animate-in fade-in">
      <div className="bg-white dark:bg-ops-panel rounded-none lg:rounded-ui-lg w-full lg:max-w-5xl shadow-2xl flex flex-col overflow-hidden h-full lg:h-auto lg:max-h-[90dvh] border-0 lg:border-2 border-ops-border">
        {/* ─── CABECERA · sólo en estrecho ───
            Con sitio, cada columna trae su propio encabezado y el aspa vive en
            la esquina del panel derecho. Apiladas, esa aspa `absolute` aterriza
            sobre el cuerpo del ticket —encima de «Desglose de la cuenta»— y el
            título de la columna izquierda se va con el scroll. Una barra fija
            resuelve las dos: dice dónde estás y ofrece la salida sin depender
            de que algo esté a la vista. */}
        {!acoplado && (
          <div className="shrink-0 flex items-center justify-between gap-3 px-5 py-4 border-b-2 border-ops-border bg-ops-panel-2 dark:bg-ops-bg/50">
            <h2 className="text-xl font-black font-syne text-ops-ink flex items-center gap-2 min-w-0">
              <Calculator className="w-5 h-5 text-ops-accent shrink-0" />
              <span className="truncate">Cobro</span>
            </h2>
            <button
              onClick={onClose}
              aria-label="Cerrar"
              className="shrink-0 p-2 -mr-1 bg-ops-panel-2 dark:bg-ops-bg text-ops-muted hover:text-ops-ink rounded-full transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        )}

        {/* ─── BANNER DEL TOTAL · sólo en estrecho ───
            La cifra sale del scroll y se ancla. Es lo que corrigió la maqueta
            de teléfono y tenía razón: el total estaba puesto donde PERTENECE
            —cerrando el desglose, que es su sitio semántico— y no donde hace
            falta mirarlo. Cambia cada vez que se toca la propina o el
            descuento, o sea justo mientras estás desplazado por las opciones y
            el desglose te queda debajo del pliegue.

            Con sitio no hace falta: ahí el desglose entero está siempre a la
            vista en la columna de al lado, y un segundo total sería el mismo
            número dos veces en la misma pantalla.

            El total aparece igualmente al pie del desglose, y es deliberado: no
            son repeticiones sino dos papeles. Aquí es la cifra viva que se está
            componiendo; allí, la conclusión de la suma. Por eso la de allí se
            queda pequeña cuando ésta existe. */}
        {!acoplado && (
          <div className="shrink-0 flex items-center justify-between gap-4 px-5 py-3 border-b-2 border-ops-border bg-ops-panel-2/60 dark:bg-ops-bg/40">
            <div className="min-w-0">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-ops-muted">
                Total Final
              </p>
              <p className="text-4xl font-black font-syne text-ops-ink leading-none tabular-nums">
                $
                {granTotal.toLocaleString('es-MX', {
                  minimumFractionDigits: 2,
                })}
              </p>
            </div>
            {propinaTotal > 0 && (
              <div className="text-right shrink-0">
                <p className="text-[10px] font-black uppercase tracking-[0.15em] text-ops-muted">
                  Propina
                </p>
                <p className="text-sm font-black text-ops-ok tabular-nums">
                  +$
                  {propinaTotal.toLocaleString('es-MX', {
                    minimumFractionDigits: 2,
                  })}
                </p>
              </div>
            )}
          </div>
        )}

        {/* ─── CUERPO ───
            Con sitio, dos columnas con su scroll cada una. Sin él, UN SOLO
            scroll: dos regiones que se desplazan por separado dentro de una
            pantalla de teléfono son dos sitios donde perderse, y el síntoma era
            que la cabecera de una se cortaba mientras leías la otra.

            El orden apilado ya era el bueno y no se toca: primero lo que se
            hace —descuento, cliente, propina, división, método— y después lo
            que se comprueba —desglose y pagos registrados—. */}
        <div
          className={
            acoplado
              ? 'flex flex-row flex-1 min-h-0 overflow-hidden'
              : 'flex flex-col flex-1 min-h-0 overflow-y-auto custom-scrollbar'
          }
        >
          {/* LADO IZQUIERDO: CONTROLES DE PAGO */}
          <div className="w-full lg:w-1/2 bg-ops-panel-2 dark:bg-ops-bg/50 p-5 lg:p-8 flex flex-col border-b-2 lg:border-b-0 lg:border-r border-ops-border lg:overflow-y-auto custom-scrollbar transition-colors">
            <h2 className="hidden lg:flex text-2xl font-black font-syne text-ops-ink mb-6 items-center gap-2">
              <Calculator className="w-6 h-6 text-ops-accent" /> Opciones de
              Cobro
            </h2>

            {/* SECCIÓN DE DESCUENTO (autorizado)
                Cerrada es una FILA, no una tarjeta: `p-3` y sin margen inferior
                bajo el encabezado. La maqueta de teléfono las dibuja así y el
                cálculo le da la razón — descuento y cliente son las dos que
                menos se usan y estaban primeras, gastando ~80 px de alto entre
                las dos antes de llegar a propina y método, que se tocan en cada
                cobro. Abierta recupera su aire: el margen lo pone el contenido
                desplegado, no el envoltorio. */}
            <div className="mb-3 lg:mb-6 bg-white dark:bg-ops-panel p-3 lg:p-5 rounded-ui border border-ops-border shadow-sm transition-colors">
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-black uppercase tracking-widest text-ops-muted flex items-center gap-2">
                  <Percent className="w-4 h-4 text-ops-accent" /> Descuento
                </p>
                {!descuentoAplicado && (
                  <button
                    onClick={() => setMostrarDescuento((v) => !v)}
                    className="text-[10px] font-black uppercase tracking-widest text-ops-accent hover:underline"
                  >
                    {mostrarDescuento ? 'Cancelar' : 'Agregar'}
                  </button>
                )}
              </div>

              {descuentoAplicado ? (
                <div className="flex items-center justify-between bg-ops-accent/10 border border-ops-accent/30 rounded-ui px-4 py-3 mt-2">
                  <div>
                    <p className="font-black text-ops-accent">
                      −$
                      {montoDescuento.toLocaleString('es-MX', {
                        minimumFractionDigits: 2,
                      })}{' '}
                      ({round2(pctDescuento)}%)
                    </p>
                    <p className="text-[10px] font-bold text-ops-muted flex items-center gap-1 mt-0.5">
                      <ShieldCheck className="w-3 h-3" /> Autorizó:{' '}
                      {descuentoAplicado.autorizadoPor}
                    </p>
                  </div>
                  <button
                    onClick={quitarDescuento}
                    className="p-2 text-ops-muted hover:text-ops-danger dark:hover:text-ops-danger rounded-ui"
                    title="Quitar descuento"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                mostrarDescuento && (
                  <div className="mt-3 space-y-3">
                    <div className="flex gap-2">
                      <button
                        onClick={() => setDescTipo('pct')}
                        className={`flex-1 py-2.5 rounded-ui font-bold border-2 transition-all ${descTipo === 'pct' ? 'border-ops-accent bg-ops-accent/10 text-ops-accent' : 'border-ops-border bg-ops-panel-2 text-ops-muted dark:bg-ops-bg'}`}
                      >
                        %
                      </button>
                      <button
                        onClick={() => setDescTipo('monto')}
                        className={`flex-1 py-2.5 rounded-ui font-bold border-2 transition-all ${descTipo === 'monto' ? 'border-ops-accent bg-ops-accent/10 text-ops-accent' : 'border-ops-border bg-ops-panel-2 text-ops-muted dark:bg-ops-bg'}`}
                      >
                        $
                      </button>
                    </div>
                    <div className="flex items-center bg-ops-panel-2 dark:bg-ops-bg p-3 rounded-ui border border-ops-border">
                      <span className="text-ops-muted font-black px-3 text-lg">
                        {descTipo === 'pct' ? '%' : '$'}
                      </span>
                      <input
                        type="number"
                        min="0"
                        placeholder={
                          descTipo === 'pct' ? 'Porcentaje...' : 'Monto...'
                        }
                        value={descValor}
                        onChange={(e) => setDescValor(e.target.value)}
                        className="w-full bg-transparent font-black text-ops-ink outline-none text-lg"
                      />
                    </div>
                    <button
                      onClick={intentarAplicarDescuento}
                      disabled={safeNumber(descValor, 0) <= 0}
                      className="w-full py-3 rounded-ui font-black bg-ops-accent text-ops-accent-fg disabled:opacity-40 active:scale-95 transition-all flex items-center justify-center gap-2"
                    >
                      <ShieldCheck className="w-4 h-4" />
                      {sesionAutoriza
                        ? 'Aplicar descuento'
                        : 'Solicitar autorización'}
                    </button>
                  </div>
                )
              )}
            </div>

            {/* SECCIÓN DE CLIENTE (CRM, opcional — un tap para ignorarla)
                Misma fila compacta que descuento, y por la misma razón. */}
            <div className="mb-3 lg:mb-6 bg-white dark:bg-ops-panel p-3 lg:p-5 rounded-ui border border-ops-border shadow-sm transition-colors">
              <div className="flex justify-between items-center">
                <p className="text-[10px] font-black uppercase tracking-widest text-ops-muted flex items-center gap-2">
                  <UserRound className="w-4 h-4 text-ops-info dark:text-ops-info" />{' '}
                  Cliente (opcional)
                </p>
                {!clienteSel && (
                  <button
                    onClick={() => setMostrarCliente((v) => !v)}
                    className="text-[10px] font-black uppercase tracking-widest text-ops-info dark:text-ops-info hover:underline"
                  >
                    {mostrarCliente ? 'Cancelar' : 'Asociar'}
                  </button>
                )}
              </div>

              {clienteSel ? (
                <div className="flex items-center justify-between bg-ops-info/10 dark:bg-ops-info/10 border border-ops-info/30 dark:border-ops-info/30 rounded-ui px-4 py-3 mt-2">
                  <div className="min-w-0">
                    <p className="font-black text-ops-info dark:text-ops-info truncate">
                      {clienteSel.nombre}
                    </p>
                    <p className="text-[10px] font-bold text-ops-muted mt-0.5">
                      {clienteSel.telefono || 'Sin teléfono'} ·{' '}
                      {Number(clienteSel.visitas) || 0} visitas ·{' '}
                      {Number(clienteSel.puntos_lealtad) || 0} pts
                    </p>
                  </div>
                  <button
                    onClick={quitarCliente}
                    className="p-2 text-ops-muted hover:text-ops-danger dark:hover:text-ops-danger rounded-ui shrink-0"
                    title="Quitar cliente"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                mostrarCliente && null
              )}
              {clienteSel && recompensasActivas.length > 0 && (
                <div className="mt-3">
                  <p className="text-[10px] font-black uppercase tracking-widest text-ops-warn mb-2 flex items-center gap-1.5">
                    <Star className="w-3.5 h-3.5" /> Recompensas ·{' '}
                    {puntosCliente} pts disponibles
                  </p>
                  {canjeSel ? (
                    <div className="flex items-center justify-between bg-ops-warn/10 border border-ops-warn/30 rounded-ui px-4 py-3">
                      <div>
                        <p className="font-black text-ops-warn">
                          {canjeSel.nombre}
                          {canjeDescuento > 0 && (
                            <span className="ml-2 text-ops-ok">
                              −$
                              {canjeDescuento.toLocaleString('es-MX', {
                                minimumFractionDigits: 2,
                              })}
                            </span>
                          )}
                        </p>
                        <p className="text-[10px] font-bold text-ops-muted mt-0.5">
                          −{canjeSel.puntos} pts al confirmar el cobro
                          {canjeSel.tipo === 'cortesia'
                            ? ' · cortesía: se entrega, no descuenta'
                            : ''}
                        </p>
                      </div>
                      <button
                        onClick={() => setCanjeSel(null)}
                        className="p-2 text-ops-muted hover:text-ops-danger dark:hover:text-ops-danger rounded-ui"
                        title="Cancelar canje"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      {recompensasActivas.map((r) => {
                        const costo = Number(r.costo_puntos) || 0;
                        const alcanza = puntosCliente >= costo;
                        return (
                          <button
                            key={r.id}
                            disabled={!alcanza}
                            onClick={() =>
                              setCanjeSel({
                                nombre: r.nombre,
                                puntos: costo,
                                tipo: r.tipo || 'cortesia',
                                valor: Number(r.valor) || 0,
                              })
                            }
                            className={`w-full flex justify-between items-center rounded-ui px-4 py-2.5 border transition-colors text-left ${
                              alcanza
                                ? 'bg-ops-panel-2 dark:bg-ops-bg hover:bg-ops-warn/10 dark:hover:bg-ops-warn/10 border-ops-border'
                                : 'bg-ops-panel-2/50 dark:bg-ops-bg/50 border-ops-border opacity-45 cursor-not-allowed'
                            }`}
                          >
                            <span className="font-black text-ops-ink truncate">
                              {r.nombre}
                            </span>
                            <span className="text-[10px] font-black text-ops-warn shrink-0 ml-2 flex items-center gap-1">
                              {r.tipo === 'descuento_pct' && (
                                <span className="text-ops-ok">
                                  −{Number(r.valor) || 0}%
                                </span>
                              )}
                              {r.tipo === 'descuento_monto' && (
                                <span className="text-ops-ok">
                                  −${Number(r.valor) || 0}
                                </span>
                              )}
                              <Star className="w-3 h-3" /> {costo} pts
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
              {!clienteSel && mostrarCliente && (
                <div className="mt-3 space-y-3">
                  {!altaExpres ? (
                    <>
                      <div className="flex items-center bg-ops-panel-2 dark:bg-ops-bg p-3 rounded-ui border border-ops-border">
                        <Search className="w-4 h-4 text-ops-muted mx-2 shrink-0" />
                        <input
                          type="text"
                          autoFocus
                          placeholder="Nombre o teléfono..."
                          value={clienteBusqueda}
                          onChange={(e) => setClienteBusqueda(e.target.value)}
                          className="w-full bg-transparent font-black text-ops-ink outline-none"
                        />
                      </div>
                      {clientesMatch.length > 0 && (
                        <div className="space-y-1.5">
                          {clientesMatch.map((c) => (
                            <button
                              key={c.id}
                              onClick={() => seleccionarCliente(c)}
                              className="w-full flex justify-between items-center bg-ops-panel-2 dark:bg-ops-bg hover:bg-ops-info/10 dark:hover:bg-ops-info/10 border border-ops-border rounded-ui px-4 py-2.5 transition-colors text-left"
                            >
                              <span className="font-black text-ops-ink truncate">
                                {c.nombre}
                              </span>
                              <span className="text-[10px] font-bold text-ops-muted shrink-0 ml-2">
                                {c.telefono ||
                                  `${Number(c.visitas) || 0} visitas`}
                              </span>
                            </button>
                          ))}
                        </div>
                      )}
                      {clienteBusqueda.trim().length >= 2 &&
                        clientesMatch.length === 0 && (
                          <p className="text-[11px] font-bold text-ops-muted text-center">
                            Sin coincidencias.
                          </p>
                        )}
                      <button
                        onClick={() => {
                          setAltaExpres(true);
                          setNuevoCliente({
                            nombre: clienteBusqueda.trim(),
                            telefono: '',
                          });
                        }}
                        className="w-full py-2.5 rounded-ui font-black text-[11px] uppercase tracking-widest text-ops-info dark:text-ops-info border-2 border-dashed border-ops-info/30 dark:border-ops-info/30 hover:bg-ops-info/10 dark:hover:bg-ops-info/10 transition-colors flex items-center justify-center gap-2"
                      >
                        <UserPlus className="w-4 h-4" /> Cliente nuevo
                      </button>
                    </>
                  ) : (
                    <>
                      <input
                        type="text"
                        autoFocus
                        placeholder="Nombre *"
                        value={nuevoCliente.nombre}
                        onChange={(e) =>
                          setNuevoCliente((p) => ({
                            ...p,
                            nombre: e.target.value,
                          }))
                        }
                        className="w-full bg-ops-panel-2 dark:bg-ops-bg p-3 rounded-ui border border-ops-field font-black text-ops-ink outline-none focus:border-ops-info"
                      />
                      <input
                        type="tel"
                        placeholder="Teléfono"
                        value={nuevoCliente.telefono}
                        onChange={(e) =>
                          setNuevoCliente((p) => ({
                            ...p,
                            telefono: e.target.value,
                          }))
                        }
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') registrarClienteExpres();
                        }}
                        className="w-full bg-ops-panel-2 dark:bg-ops-bg p-3 rounded-ui border border-ops-field font-bold text-ops-ink outline-none focus:border-ops-info"
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={() => setAltaExpres(false)}
                          className="flex-1 py-2.5 rounded-ui font-black text-[11px] uppercase tracking-widest bg-ops-panel-2 dark:bg-ops-bg text-ops-muted"
                        >
                          Volver
                        </button>
                        <button
                          onClick={registrarClienteExpres}
                          disabled={!nuevoCliente.nombre.trim()}
                          className="flex-1 py-2.5 rounded-ui font-black text-[11px] uppercase tracking-widest bg-ops-info text-ops-accent-fg disabled:opacity-40 active:scale-95 transition-all flex items-center justify-center gap-2"
                        >
                          <UserPlus className="w-4 h-4" /> Registrar y asociar
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>

            {/* SECCIÓN DE PROPINA */}
            <div className="mb-6 bg-white dark:bg-ops-panel p-5 rounded-ui border border-ops-border shadow-sm transition-colors">
              <p className="text-[10px] font-black uppercase tracking-widest text-ops-muted mb-3 flex items-center gap-2">
                <HeartHandshake className="w-4 h-4 text-ops-danger" /> Servicio
                / Propina
              </p>
              <div className="flex gap-2 mb-2">
                {[0, 10, 15, 20].map((pct) => (
                  <button
                    key={pct}
                    onClick={() => {
                      setPropinaSeleccionada(pct);
                      setPropinaManual('');
                    }}
                    className={`flex-1 py-3 rounded-ui font-bold border-2 transition-all ${propinaSeleccionada === pct ? 'border-ops-danger bg-ops-danger/10 text-ops-danger shadow-sm' : 'border-ops-border bg-ops-panel-2 text-ops-muted hover:border-ops-border dark:bg-ops-bg dark:hover:border-ops-muted'}`}
                  >
                    {pct}%
                  </button>
                ))}
                <button
                  onClick={() => setPropinaSeleccionada('manual')}
                  className={`flex-1 py-3 rounded-ui font-bold border-2 transition-all ${propinaSeleccionada === 'manual' ? 'border-ops-danger bg-ops-danger/10 text-ops-danger shadow-sm' : 'border-ops-border bg-ops-panel-2 text-ops-muted hover:border-ops-border dark:bg-ops-bg dark:hover:border-ops-muted'}`}
                >
                  Otro
                </button>
              </div>
              {propinaSeleccionada === 'manual' && (
                <div className="flex items-center bg-ops-panel-2 dark:bg-ops-bg p-3 rounded-ui border border-ops-border mt-3 transition-colors">
                  <span className="text-ops-muted font-black px-3 text-lg">
                    $
                  </span>
                  <input
                    type="number"
                    placeholder="Monto exacto..."
                    value={propinaManual}
                    onChange={(e) => setPropinaManual(e.target.value)}
                    className="w-full bg-transparent font-black text-ops-ink outline-none text-lg"
                  />
                </div>
              )}
            </div>

            {/* Selector de División */}
            <div className="flex bg-ops-panel-2/50 dark:bg-ops-bg p-1.5 rounded-ui mb-6 shrink-0 transition-colors">
              <button
                onClick={() => {
                  setTipoDivision('monto');
                  setSeleccionPlatillos({});
                }}
                className={`flex-1 py-3 font-bold text-sm rounded-ui transition-all ${tipoDivision === 'monto' ? 'bg-white dark:bg-ops-panel shadow-sm text-ops-ink' : 'text-ops-muted hover:text-ops-ink dark:hover:text-ops-ink'}`}
              >
                Total
              </button>
              <button
                onClick={() => {
                  setTipoDivision('personas');
                  setSeleccionPlatillos({});
                }}
                className={`flex-1 py-3 font-bold text-sm rounded-ui transition-all ${tipoDivision === 'personas' ? 'bg-white dark:bg-ops-panel shadow-sm text-ops-ink' : 'text-ops-muted hover:text-ops-ink dark:hover:text-ops-ink'}`}
              >
                Personas
              </button>
              {!divisionBloqueada && (
                <button
                  onClick={() => setTipoDivision('platillos')}
                  className={`flex-1 py-3 font-bold text-sm rounded-ui transition-all flex items-center justify-center gap-2 ${tipoDivision === 'platillos' ? 'bg-white dark:bg-ops-panel shadow-sm text-ops-accent' : 'text-ops-muted hover:text-ops-ink dark:hover:text-ops-ink'}`}
                >
                  <Receipt className="w-4 h-4" /> Platillos
                </button>
              )}
            </div>

            {/* Se dice POR QUÉ no está: un botón que desaparece sin
                explicación se lee como una app rota. */}
            {divisionBloqueada && (
              <p className="text-[11px] font-bold text-ops-muted mb-6 -mt-3">
                Esta cuenta ya se imprimió: se cobra tal como salió en el papel.
              </p>
            )}

            {/* PANEL: POR PLATILLOS */}
            {!divisionBloqueada && tipoDivision === 'platillos' && (
              <div className="mb-6 bg-white dark:bg-ops-panel p-5 rounded-ui border border-ops-border shadow-sm animate-in slide-in-from-left-2 transition-colors">
                <p className="text-[10px] font-black text-ops-muted uppercase tracking-widest mb-4">
                  1. Selecciona qué se va a cobrar ahorita:
                </p>

                <div className="space-y-3 max-h-48 overflow-y-auto custom-scrollbar pr-2 mb-4">
                  {carritoSanitizado.map((item) => {
                    const maxQty = safeNumber(item?.cantidad, 0);
                    const selQty = safeNumber(seleccionPlatillos[item.id], 0);
                    const precioDisplay = getPrecio(item);

                    return (
                      <div
                        key={item.id}
                        className={`flex justify-between items-center p-3 rounded-ui border-2 transition-colors ${selQty > 0 ? 'bg-ops-accent/10 border-ops-accent/30' : 'bg-ops-panel-2 border-ops-border dark:bg-ops-bg'}`}
                      >
                        <div className="flex-1">
                          <p
                            className={`font-bold text-sm leading-tight ${selQty > 0 ? 'text-ops-accent dark:text-ops-ink' : 'text-ops-ink'}`}
                          >
                            {item.nombre || 'Sin nombre'}
                          </p>
                          <p className="text-xs font-black text-ops-accent mt-0.5">
                            $
                            {precioDisplay.toLocaleString('es-MX', {
                              minimumFractionDigits: 2,
                            })}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 bg-white dark:bg-ops-panel rounded-ui border border-ops-border p-1 shadow-sm">
                          <button
                            onClick={() =>
                              setSeleccionPlatillos((prev) => ({
                                ...prev,
                                [item.id]: Math.max(
                                  0,
                                  safeNumber(prev[item.id], 0) - 1,
                                ),
                              }))
                            }
                            className="w-7 h-7 bg-ops-panel-2 dark:bg-ops-bg rounded-ui text-ops-muted dark:text-ops-ink font-black hover:bg-ops-panel-2 dark:hover:bg-ops-border transition-colors"
                          >
                            -
                          </button>
                          <span className="font-black text-ops-ink w-5 text-center text-sm">
                            {selQty}
                          </span>
                          <button
                            onClick={() =>
                              setSeleccionPlatillos((prev) => ({
                                ...prev,
                                [item.id]: Math.min(
                                  maxQty,
                                  safeNumber(prev[item.id], 0) + 1,
                                ),
                              }))
                            }
                            className="w-7 h-7 bg-ops-panel-2 dark:bg-ops-bg rounded-ui text-ops-muted dark:text-ops-ink font-black hover:bg-ops-panel-2 dark:hover:bg-ops-border transition-colors"
                          >
                            +
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="border-t-2 border-ops-border pt-4 mt-2">
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] font-black text-ops-muted uppercase tracking-widest">
                      Subtotal seleccionado
                    </span>
                    <span className="font-black text-ops-accent text-xl">
                      $
                      {subtotalSeleccion.toLocaleString('es-MX', {
                        minimumFractionDigits: 2,
                      })}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* PANEL: POR PERSONAS */}
            {tipoDivision === 'personas' && (
              <div className="mb-6 bg-white dark:bg-ops-panel p-6 rounded-ui border border-ops-border shadow-sm text-center animate-in slide-in-from-left-2 transition-colors">
                <p className="text-[10px] font-black text-ops-muted uppercase tracking-widest mb-4">
                  Dividir $
                  {granTotal.toLocaleString('es-MX', {
                    minimumFractionDigits: 2,
                  })}{' '}
                  entre:
                </p>
                <div className="flex items-center justify-center gap-6 mb-6">
                  <button
                    onClick={() =>
                      setDivisorPersonas(
                        Math.max(2, safeNumber(divisorPersonas, 2) - 1),
                      )
                    }
                    className="w-14 h-14 bg-ops-panel-2 dark:bg-ops-bg rounded-ui font-black text-2xl text-ops-ink hover:bg-ops-panel-2 dark:hover:bg-ops-border transition-colors"
                  >
                    -
                  </button>
                  <div className="text-5xl font-black font-syne text-ops-ink w-24">
                    <Users className="w-8 h-8 inline mr-2 text-ops-accent opacity-50" />
                    {divisorPersonas}
                  </div>
                  <button
                    onClick={() =>
                      setDivisorPersonas(safeNumber(divisorPersonas, 2) + 1)
                    }
                    className="w-14 h-14 bg-ops-panel-2 dark:bg-ops-bg rounded-ui font-black text-2xl text-ops-ink hover:bg-ops-panel-2 dark:hover:bg-ops-border transition-colors"
                  >
                    +
                  </button>
                </div>
                <p className="text-xl font-black text-ops-accent mb-6">
                  Toca de $
                  {montoPorPersona.toLocaleString('es-MX', {
                    minimumFractionDigits: 2,
                  })}
                </p>
                <button
                  onClick={() => agregarPago(montoPorPersona)}
                  disabled={estaPagado}
                  className="w-full py-4 bg-ops-accent/10 hover:bg-ops-accent/15 dark:hover:bg-ops-accent/20 text-ops-accent font-black rounded-ui transition-colors disabled:opacity-50"
                >
                  Cobrar Parte (1/{divisorPersonas})
                </button>
              </div>
            )}

            {/* PANEL BASE: METODO DE PAGO */}
            <div className="flex-1 flex flex-col pt-2 border-t border-ops-border">
              <p className="text-[10px] font-black uppercase tracking-widest text-ops-muted mb-3 mt-4">
                Método de Ingreso
              </p>
              <div className="grid grid-cols-3 gap-2 mb-5">
                <button
                  onClick={() => setMetodoActivo('Efectivo')}
                  className={`py-4 rounded-ui border-2 font-black flex flex-col justify-center items-center gap-1 transition-all active:scale-95 ${metodoActivo === 'Efectivo' ? 'border-ops-ok bg-ops-ok/10 text-ops-ok shadow-sm' : 'border-ops-border bg-white dark:bg-ops-panel text-ops-muted hover:border-ops-border dark:hover:border-ops-muted'}`}
                >
                  <Banknote className="w-5 h-5" />{' '}
                  <span className="text-xs">Efectivo</span>
                </button>
                <button
                  onClick={() => setMetodoActivo('Tarjeta')}
                  className={`py-4 rounded-ui border-2 font-black flex flex-col justify-center items-center gap-1 transition-all active:scale-95 ${metodoActivo === 'Tarjeta' ? 'border-ops-accent bg-ops-accent/10 text-ops-accent dark:bg-ops-danger/10 dark:border-ops-danger dark:text-ops-danger shadow-sm' : 'border-ops-border bg-white dark:bg-ops-panel text-ops-muted hover:border-ops-border dark:hover:border-ops-muted'}`}
                >
                  <CreditCard className="w-5 h-5" />{' '}
                  <span className="text-xs">Tarjeta</span>
                </button>
                <button
                  onClick={() => setMetodoActivo('Transferencia')}
                  className={`py-4 rounded-ui border-2 font-black flex flex-col justify-center items-center gap-1 transition-all active:scale-95 ${metodoActivo === 'Transferencia' ? 'border-ops-accent bg-ops-accent/10 text-ops-accent shadow-sm' : 'border-ops-border bg-white dark:bg-ops-panel text-ops-muted hover:border-ops-border dark:hover:border-ops-muted'}`}
                >
                  <Landmark className="w-5 h-5" />{' '}
                  <span className="text-xs">Transfer.</span>
                </button>
              </div>

              <div className="bg-white dark:bg-ops-panel p-3 rounded-ui border-2 border-ops-border shadow-sm flex items-center mb-4 transition-colors focus-within:border-ops-ok dark:focus-within:border-ops-ok">
                <span className="text-ops-muted font-black text-2xl pl-4">
                  $
                </span>
                <input
                  type="number"
                  value={montoInput}
                  onChange={(e) => setMontoInput(e.target.value)}
                  placeholder={
                    saldoPendiente > 0 ? saldoPendiente.toFixed(2) : '0.00'
                  }
                  className="w-full bg-transparent text-3xl font-black text-ops-ink p-2 outline-none"
                />
              </div>

              <div className="grid grid-cols-4 gap-2 mb-6">
                {sugerencias.map((s) => (
                  <button
                    key={s}
                    onClick={() => handleSugerencia(s)}
                    className="py-3 bg-white dark:bg-ops-bg border-2 border-ops-border rounded-ui font-black text-ops-muted dark:text-ops-ink hover:border-ops-ok/30 hover:text-ops-ok dark:hover:border-ops-ok/50 dark:hover:text-ops-ok transition-colors"
                  >
                    +${s}
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-2 gap-3 mt-auto">
                <button
                  onClick={() =>
                    agregarPago(saldoPendiente > 0 ? saldoPendiente : 0)
                  }
                  disabled={estaPagado}
                  className="py-4 bg-ops-panel-2 dark:bg-ops-bg hover:bg-ops-panel-2 dark:hover:bg-ops-border border border-transparent dark:border-ops-border text-ops-ink font-black rounded-ui transition-colors disabled:opacity-50"
                >
                  Pagar Restante
                </button>
                <button
                  onClick={() => agregarPago()}
                  disabled={!montoInput || estaPagado}
                  className="py-4 bg-ops-ink hover:bg-ops-ink dark:bg-ops-accent text-ops-accent-fg font-black rounded-ui shadow-lg transition-colors disabled:opacity-50"
                >
                  Añadir Pago
                </button>
              </div>
            </div>
          </div>

          {/* LADO DERECHO: TICKET Y TOTALES */}
          <div className="w-full lg:w-1/2 bg-white dark:bg-ops-panel flex flex-col relative transition-colors">
            {/* El aspa flotante sólo tiene esquina propia cuando esto es una
                columna. Apilado, la cabecera de arriba ya lleva la suya. */}
            {acoplado && (
              <button
                onClick={onClose}
                aria-label="Cerrar"
                className="absolute top-4 right-4 p-2 bg-ops-panel-2 dark:bg-ops-bg hover:bg-ops-panel-2 dark:hover:bg-ops-border text-ops-muted rounded-full transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            )}

            <div className="p-5 lg:p-8 pb-6 border-b-2 border-ops-border">
              <p className="text-[10px] font-black text-ops-muted uppercase tracking-[0.2em] mb-4">
                {isCobroParcial
                  ? 'Desglose Parcial (Separado)'
                  : 'Desglose de la Cuenta'}
              </p>
              <div className="flex justify-between items-center text-ops-muted font-bold mb-3">
                <span>Subtotal (Consumo)</span>
                <span>
                  $
                  {totalBase.toLocaleString('es-MX', {
                    minimumFractionDigits: 2,
                  })}
                </span>
              </div>
              {montoDescuento > 0 && (
                <div className="flex justify-between items-center text-ops-accent font-bold mb-3">
                  <span>Descuento ({round2(pctDescuento)}%)</span>
                  <span>
                    −$
                    {montoDescuento.toLocaleString('es-MX', {
                      minimumFractionDigits: 2,
                    })}
                  </span>
                </div>
              )}
              {propinaTotal > 0 && (
                <div className="flex justify-between items-center text-ops-danger font-bold mb-3">
                  <span>
                    Propina{propinaExtra > 0 ? ' (incl. excedente)' : ''}
                  </span>
                  <span>
                    $
                    {propinaTotal.toLocaleString('es-MX', {
                      minimumFractionDigits: 2,
                    })}
                  </span>
                </div>
              )}
              {/* El solape original —«Total Final» y «$40.00» montados— salía
                de pedirle a una fila de ~300 px que alojara una etiqueta de 20
                px y una cifra de 48 en Syne 800, sin `gap` ni `min-w-0`. No se
                truncaban: se pisaban, que es peor, porque la cifra que el
                cliente comprueba acababa ilegible.

                La salida NO es encoger la cifra —la identidad pide números
                grandes en Syne y encogerla sería perder justo lo que se quiere
                conservar— sino no pedirle a ESTA fila que la lleve. Con el
                banner anclado arriba, la cifra grande ya existe y además está
                siempre a la vista; aquí basta con cerrar la suma, y a
                `text-lg` la fila cabe de sobra.

                Con sitio no hay banner, así que aquí se conserva a `text-5xl`:
                es el remate del desglose y no compite con nada. */}
              <div className="mt-6 pt-6 border-t-2 border-ops-border border-dashed flex justify-between items-center lg:items-end gap-4">
                <span className="text-ops-ink font-black text-sm lg:text-xl shrink-0">
                  Total Final
                </span>
                <h2 className="text-lg lg:text-5xl font-black font-syne text-ops-ink tabular-nums leading-none min-w-0">
                  $
                  {granTotal.toLocaleString('es-MX', {
                    minimumFractionDigits: 2,
                  })}
                </h2>
              </div>
            </div>

            {/* El scroll propio sólo con sitio. Apilado lo lleva el cuerpo
                entero, y una región que se desplaza dentro de otra que también
                se desplaza es la forma más rápida de que el dedo mueva lo que
                no quería. */}
            <div className="p-5 lg:p-8 lg:flex-1 lg:overflow-y-auto custom-scrollbar bg-ops-panel-2/50 dark:bg-ops-bg/30">
              <h3 className="font-black text-ops-ink mb-4 text-sm uppercase tracking-widest">
                Pagos Registrados
              </h3>
              {pagos.length === 0 ? (
                <div className="text-center py-10 border-2 border-dashed border-ops-border rounded-ui">
                  <p className="text-ops-muted font-bold text-sm">
                    Aún no se han registrado pagos.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {pagos.map((pago, idx) => (
                    <div
                      key={pago.id}
                      className="flex justify-between items-center bg-white dark:bg-ops-bg p-4 rounded-ui border border-ops-border shadow-sm animate-in slide-in-from-right-4 transition-colors"
                    >
                      <div className="flex items-center gap-4">
                        <div
                          className={`p-3 rounded-ui ${pago.metodo === 'Efectivo' ? 'bg-ops-ok/10 text-ops-ok' : pago.metodo === 'Transferencia' ? 'bg-ops-accent/10 text-ops-accent' : 'bg-ops-accent/10 text-ops-accent dark:bg-ops-danger/10 dark:text-ops-danger'}`}
                        >
                          {pago.metodo === 'Efectivo' ? (
                            <Banknote className="w-6 h-6" />
                          ) : pago.metodo === 'Transferencia' ? (
                            <Landmark className="w-6 h-6" />
                          ) : (
                            <CreditCard className="w-6 h-6" />
                          )}
                        </div>
                        <div>
                          <p className="font-black text-ops-ink">
                            Abono {idx + 1}
                          </p>
                          <p className="text-[10px] font-bold text-ops-muted uppercase tracking-widest">
                            {pago.metodo}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <span className="font-black text-xl text-ops-ink">
                          $
                          {safeNumber(pago.monto).toLocaleString('es-MX', {
                            minimumFractionDigits: 2,
                          })}
                        </span>
                        <button
                          onClick={() => removerPago(pago.id)}
                          className="text-ops-muted hover:text-ops-danger dark:text-ops-border dark:hover:text-ops-danger transition-colors"
                        >
                          <X className="w-5 h-5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {acoplado && pieDeCobro}
          </div>
        </div>

        {/* Apilado, el pie sale del scroll y se ancla al fondo del modal.
            Dentro del scroll quedaba al final de una columna larguísima: el
            saldo pendiente y el botón de cobrar —las dos cosas que se miran sin
            parar mientras se cobra— sólo aparecían después de recorrer todas
            las opciones de pago. `sticky` no vale aquí: el pie vive dentro de
            la mitad derecha, y mientras esa mitad esté por debajo del pliegue
            no hay nada a lo que pegarse. */}
        {!acoplado && pieDeCobro}
      </div>

      {/* PINPAD DE AUTORIZACIÓN DE DESCUENTO (Gerente/Admin) */}
      {pinAuthAbierto && (
        <div className="fixed inset-0 bg-ops-ink/70 dark:bg-ops-bg/85 backdrop-blur-sm z-[130] flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white dark:bg-ops-panel rounded-ui-lg p-7 max-w-xs w-full shadow-2xl border-2 border-ops-border text-center animate-in zoom-in-95">
            <div className="w-14 h-14 bg-ops-accent/15 rounded-full flex items-center justify-center mx-auto mb-4">
              <ShieldCheck className="w-7 h-7 text-ops-accent" />
            </div>
            <h3 className="font-black text-ops-ink text-xl font-syne mb-1">
              Autorización requerida
            </h3>
            <p className="text-ops-muted text-xs font-bold mb-5">
              Un Gerente o Admin debe teclear su PIN para aplicar el descuento.
            </p>
            <input
              type="password"
              inputMode="numeric"
              autoFocus
              maxLength={6}
              value={pinAuth}
              onChange={(e) => {
                setPinAuth(e.target.value.replace(/\D/g, ''));
                setPinAuthError('');
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') autorizarDescuentoConPin();
              }}
              placeholder="••••••"
              className="w-full text-center text-3xl tracking-[0.5em] font-black bg-ops-panel-2 dark:bg-ops-bg border-2 border-ops-field focus:border-ops-accent dark:focus:border-ops-accent rounded-ui py-4 outline-none text-ops-ink transition-colors mb-3"
            />
            {pinAuthError && (
              <p className="text-ops-danger text-xs font-bold mb-3">
                {pinAuthError}
              </p>
            )}
            <div className="flex gap-3">
              <button
                onClick={() => setPinAuthAbierto(false)}
                className="flex-1 py-3.5 rounded-ui border-2 border-ops-border font-bold text-ops-muted hover:bg-ops-panel-2 dark:hover:bg-ops-border transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={autorizarDescuentoConPin}
                disabled={pinAuth.length < 4}
                className="flex-1 py-3.5 rounded-ui bg-ops-accent text-ops-accent-fg font-black disabled:opacity-40 active:scale-95 transition-all"
              >
                Autorizar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MINI-DIÁLOGO: ¿el excedente es propina? (solo tarjeta/transferencia) */}
      {dialogoExcedente && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-ops-ink/70 dark:bg-ops-bg/90 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white dark:bg-ops-panel rounded-ui-lg w-full max-w-md shadow-2xl border-2 border-ops-border overflow-hidden animate-in zoom-in-95">
            <div className="p-8 text-center">
              <div className="w-16 h-16 bg-ops-danger/15 text-ops-danger rounded-full flex items-center justify-center mx-auto mb-4">
                <HeartHandshake className="w-8 h-8" />
              </div>
              <h3 className="text-2xl font-black font-syne text-ops-ink mb-2">
                Pago mayor al total
              </h3>
              <p className="text-ops-muted font-medium mb-1">
                El pago con {dialogoExcedente.metodo.toLowerCase()} de{' '}
                <span className="font-black text-ops-ink">
                  $
                  {dialogoExcedente.monto.toLocaleString('es-MX', {
                    minimumFractionDigits: 2,
                  })}
                </span>{' '}
                excede el saldo por:
              </p>
              <p className="text-4xl font-black font-syne text-ops-danger my-3">
                $
                {dialogoExcedente.excedente.toLocaleString('es-MX', {
                  minimumFractionDigits: 2,
                })}
              </p>
              <p className="text-sm text-ops-muted font-bold">
                {propinaCalculada > 0
                  ? 'Se sumará a la propina actual.'
                  : '¿Este excedente es propina?'}
              </p>
            </div>
            <div className="px-8 pb-8 grid grid-cols-2 gap-3">
              <button
                onClick={corregirExcedente}
                className="py-4 rounded-ui border-2 border-ops-border font-black text-ops-muted dark:text-ops-ink hover:bg-ops-panel-2 dark:hover:bg-ops-border transition-colors active:scale-95"
              >
                Fue error
              </button>
              <button
                onClick={confirmarExcedenteComoPropina}
                className="py-4 rounded-ui bg-ops-danger font-black text-ops-danger-fg shadow-lg shadow-ops-danger/30 transition-transform active:scale-95"
              >
                Sí, es propina
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
