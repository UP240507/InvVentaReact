import { useState, useMemo, useEffect } from 'react';
import { useAppStore, parseUTC } from '../../store/useAppStore';
import { useSyncStore } from '../../store/useSyncStore';
import { useAuthStore } from '../auth/useAuthStore';
import {
  enviarTicket,
  enviarCorteZ,
  enviarValePropina,
  salioPapel,
} from '../../lib/Hub';
import {
  PageShell,
  PageHeader,
  Card,
  SegmentedControl,
  Chip,
  Input,
  Field,
} from '../../components/ui';
import {
  BarChart2,
  DollarSign,
  TrendingUp,
  TrendingDown,
  CreditCard,
  PieChart,
  Activity,
  UtensilsCrossed,
  Receipt,
  Printer,
  Coins,
  Package,
  AlertTriangle,
  ShieldAlert,
} from 'lucide-react';
import { aISOLocal } from '../../lib/Fechas';
import { FRANJAS, soloDeFranja, cuantasSinFranja } from '../../lib/Franjas';
import { foliosSinVenta } from '../../lib/Folio';
import { supabase } from '../../api/supabase';

// ─── HELPERS ─────────────────────────────────────────────────────────────────
const fmt = (n) =>
  `$${Number(n || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}`;
const pct = (a, b) => (b > 0 ? ((a / b) * 100).toFixed(1) : '0.0');

// ─── KPI CARD ────────────────────────────────────────────────────────────────
function KPI({ titulo, valor, icono: Icono, accentBg, accentText, subtitulo }) {
  return (
    <div className="bg-white dark:bg-adm-panel p-6 rounded-ui-lg border-2 border-adm-border shadow-sm flex items-start gap-4 hover:shadow-lg transition-all">
      <div className={`p-3.5 rounded-ui ${accentBg}`}>
        <Icono className={`w-5 h-5 ${accentText}`} />
      </div>
      <div className="min-w-0">
        <p className="text-[10px] font-black text-adm-muted uppercase tracking-widest mb-1">
          {titulo}
        </p>
        <p className="text-2xl font-black text-adm-ink font-syne leading-none">
          {valor}
        </p>
        {subtitulo && (
          <p className="text-xs font-bold text-adm-muted mt-1">{subtitulo}</p>
        )}
      </div>
    </div>
  );
}

// ─── BARRA DE PROGRESO ───────────────────────────────────────────────────────
function Bar({ value, max, color }) {
  const w = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="w-full h-2.5 bg-adm-chip dark:bg-adm-border rounded-full overflow-hidden">
      <div
        className={`h-full rounded-full transition-all duration-lenta ${color}`}
        style={{ width: `${w}%` }}
      />
    </div>
  );
}

const TABS = [
  { id: 'financiero', label: 'Dashboard Financiero', icon: Activity },
  { id: 'zcut', label: 'Corte de Caja (Z)', icon: Receipt },
  { id: 'menu', label: 'Rentabilidad (ABC)', icon: PieChart },
  { id: 'operacion', label: 'Meseros y Propinas', icon: Coins },
  { id: 'almacen', label: 'Control de Almacén', icon: Package },
];

export default function ReportesScreen() {
  const {
    ventas,
    ordenesCompra,
    nominas,
    turnos,
    movimientos,
    productos,
    recetas,
    mesas,
    configuracion,
    showToast,
    registrarAuditoria,
  } = useAppStore();
  const { enqueueAction } = useSyncStore();
  const { user } = useAuthStore();

  const [tab, setTab] = useState('financiero');
  // Folio que se está reimprimiendo, para apagar su botón. Uno a la vez: dos
  // pulsaciones seguidas sobre el mismo ticket son el error caro aquí.
  const [reimprimiendo, setReimprimiendo] = useState(null);
  // Y lo mismo para los dos documentos del cierre. Ahora que van a la cola del
  // hub tardan lo que tarde la impresora, y sin un candado por fila el segundo
  // clic de quien no ve salir el papel manda un segundo corte.
  const [imprimiendoCorte, setImprimiendoCorte] = useState(null);
  const [imprimiendoVale, setImprimiendoVale] = useState(null);
  const hoy = new Date();
  const primerDiaMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
  // Fechas LOCALES (ver lib/Fechas.js): con UTC el reporte del mes arrancaba
  // el día 1 pero terminaba en mañana, incluyendo un día que no existe aún.
  const [fechaInicio, setFechaInicio] = useState(aISOLocal(primerDiaMes));
  const [fechaFin, setFechaFin] = useState(aISOLocal(hoy));
  const [turnoSeleccionado, setTurnoSeleccionado] = useState(null);
  // Arranca en «todos»: mientras nadie elija, no se esconde nada.
  const [franja, setFranja] = useState('todos');

  // ── Costo de receta ─────────────────────────────────────────────────────────
  const costoReceta = (ingredientes = []) =>
    ingredientes.reduce((acc, ing) => {
      const p = (productos || []).find(
        (x) => String(x.id) === String(ing.id_producto),
      );
      if (!p) return acc;
      const rendimiento = 1 - (ing.merma || 0) / 100;
      return (
        acc +
        (rendimiento > 0
          ? (Number(p.precio) / rendimiento) * Number(ing.cantidad)
          : 0)
      );
    }, 0);

  // ── Motor de cálculo ────────────────────────────────────────────────────────
  const data = useMemo(() => {
    const inicio = new Date(fechaInicio + 'T00:00:00Z');
    const fin = new Date(fechaFin + 'T23:59:59Z');

    const vDelPeriodo = (ventas || []).filter((v) => {
      const f = parseUTC(v.fecha || v.created_at);
      return f && f >= inicio && f <= fin;
    });

    // ── EL FILTRO DE FRANJA, Y POR QUÉ AQUÍ SÍ MUEVE LAS CIFRAS ─────────────
    // En Gastos, la pestaña filtra la lista y deja los totales quietos. Aquí es
    // al revés a propósito: la razón de existir de las franjas es **comparar**
    // la mañana con la tarde —producto, propinas, mesas—, y un filtro que no
    // cambiara las cifras no contestaría esa pregunta.
    //
    // Por eso se usa `soloDeFranja` y no `filtrarPorFranja`: lo sin clasificar
    // no cuenta en ninguna de las dos, o mañana + tarde daría más que el día.
    // Lo que queda fuera no se calla — se dice arriba, con `sinClasificar`.
    const franjaActiva = !!configuracion?.franjas_activas && franja !== 'todos';
    const vPeriodo = franjaActiva
      ? soloDeFranja(vDelPeriodo, franja)
      : vDelPeriodo;
    const sinClasificar = franjaActiva ? cuantasSinFranja(vDelPeriodo) : 0;
    const cPeriodo = (ordenesCompra || []).filter((c) => {
      const f = parseUTC(c.fecha || c.created_at);
      return f && f >= inicio && f <= fin && c.estado === 'Completada';
    });
    const nPeriodo = (nominas || []).filter((n) => {
      const f = parseUTC(n.fecha_fin || n.created_at);
      return f && f >= inicio && f <= fin;
    });
    const mDelPeriodo = (movimientos || []).filter((m) => {
      const f = parseUTC(m.fecha);
      return f && f >= inicio && f <= fin;
    });
    // El inventario sigue siendo uno: esto filtra QUÉ MOVIMIENTOS se miran, no
    // parte el stock. La valorización total no se toca por elegir una franja.
    const mPeriodo = franjaActiva
      ? soloDeFranja(mDelPeriodo, franja)
      : mDelPeriodo;

    // Financiero
    const tIngresos = vPeriodo.reduce((s, v) => s + Number(v.total || 0), 0);
    const tEfectivo = vPeriodo.reduce(
      (s, v) =>
        s +
        (v.metodo_pago === 'efectivo'
          ? Number(v.total)
          : v.metodo_pago === 'mixto'
            ? Number(v.efectivo || 0)
            : 0),
      0,
    );
    const tTarjeta = vPeriodo.reduce(
      (s, v) =>
        s +
        (v.metodo_pago === 'tarjeta'
          ? Number(v.total)
          : v.metodo_pago === 'mixto'
            ? Number(v.tarjeta || 0)
            : 0),
      0,
    );
    const tPropinas = vPeriodo.reduce((s, v) => s + Number(v.propina || 0), 0);
    const tInsumos = cPeriodo.reduce((s, c) => s + Number(c.total || 0), 0);
    const tNominas = nPeriodo.reduce(
      (s, n) => s + Number(n.gran_total || 0),
      0,
    );
    const tEgresos = tInsumos + tNominas;
    const utilNeta = tIngresos - tEgresos;

    // Meseros
    const porMesero = {};
    vPeriodo.forEach((v) => {
      const u = v.usuario || 'Sistema';
      if (!porMesero[u]) porMesero[u] = { total: 0, propinas: 0, tickets: 0 };
      porMesero[u].total += Number(v.total || 0);
      porMesero[u].propinas += Number(v.propina || 0);
      porMesero[u].tickets += 1;
    });
    const meserosRank = Object.entries(porMesero)
      .map(([nombre, d]) => ({ nombre, ...d }))
      .sort((a, b) => b.total - a.total);

    // ABC Menú
    const analisisMenu = (recetas || [])
      .map((r) => {
        const costo = costoReceta(r.ingredientes || []);
        const precio = Number(r.precio_venta) || 0;
        const ganancia = precio - costo;
        const margen = precio > 0 ? (ganancia / precio) * 100 : 0;
        let uds = 0,
          ingresosGenerados = 0;
        vPeriodo.forEach((v) =>
          (v.items || []).forEach((i) => {
            if (i.nombre === r.nombre) {
              uds += i.cantidad;
              ingresosGenerados += i.cantidad * precio;
            }
          }),
        );
        return {
          nombre: r.nombre,
          categoria: r.categoria,
          costo,
          precio,
          ganancia,
          margen,
          uds,
          ingresosGenerados,
        };
      })
      .sort((a, b) => b.ingresosGenerados - a.ingresosGenerados);

    // abcData: reduce con acumulador explícito [items[], acumTotal]
    const [abcData] = analisisMenu
      .filter((m) => m.uds > 0)
      .reduce(
        ([items, acumTotal], m) => {
          const nuevoAcum = acumTotal + m.ingresosGenerados;
          const p = tIngresos > 0 ? (nuevoAcum / tIngresos) * 100 : 0;
          const cls = p <= 80 ? 'A' : p <= 95 ? 'B' : 'C';
          return [[...items, { ...m, cls }], nuevoAcum];
        },
        [[], 0],
      );

    // Almacén
    const valorizacionTotal = (productos || []).reduce(
      (s, p) => s + Number(p.stock) * Number(p.precio),
      0,
    );
    const mermas = mPeriodo
      .filter((m) => m.tipo === 'Merma')
      .map((m) => {
        const p = (productos || []).find(
          (x) => String(x.id) === String(m.producto_id),
        );
        return {
          ...m,
          producto: p?.nombre || '—',
          perdida: Math.abs(m.cantidad) * Number(p?.precio || 0),
        };
      });
    const totalPerdidaMermas = mermas.reduce((s, m) => s + m.perdida, 0);

    // Kardex completo del periodo: TODOS los movimientos (Entrada, Salida POS,
    // Merma, Ajuste) con producto resuelto, más reciente primero. Tope 200
    // filas para no ahogar el render (el periodo acota el resto).
    const kardex = mPeriodo
      .map((m) => {
        const p = (productos || []).find(
          (x) => String(x.id) === String(m.producto_id),
        );
        return { ...m, producto: p?.nombre || '—', unidad: p?.unidad || '' };
      })
      .sort((a, b) => new Date(b.fecha) - new Date(a.fecha))
      .slice(0, 200);

    return {
      vPeriodo,
      sinClasificar,
      tIngresos,
      tEfectivo,
      tTarjeta,
      tPropinas,
      tInsumos,
      tNominas,
      tEgresos,
      utilNeta,
      meserosRank,
      abcData,
      analisisMenu,
      valorizacionTotal,
      mermas,
      totalPerdidaMermas,
      kardex,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    ventas,
    ordenesCompra,
    nominas,
    movimientos,
    productos,
    recetas,
    fechaInicio,
    fechaFin,
    franja,
    configuracion,
  ]);

  const turnosPeriodo = useMemo(() => {
    const inicio = new Date(fechaInicio + 'T00:00:00Z');
    const fin = new Date(fechaFin + 'T23:59:59Z');
    return (turnos || []).filter((t) => {
      const f = parseUTC(t.fecha_apertura);
      return f && f >= inicio && f <= fin;
    });
  }, [turnos, fechaInicio, fechaFin]);

  // ── LOS FOLIOS QUE SE IMPRIMIERON Y NUNCA LLEGARON A VENTA ────────────────
  // Se cargan aquí y NO en el arranque de la app a propósito: es un dato de
  // cierre que la mayoría de los aparatos no va a mirar nunca, y meterlo en el
  // `Promise.all` del boot le cobraría el arranque a todo el mundo por una
  // pantalla que abre el dueño.
  const [reservas, setReservas] = useState([]);
  useEffect(() => {
    if (tab !== 'zcut') return;
    let vivo = true;
    supabase
      .from('folios_reservados')
      .select('*')
      .gte('reservado_en', `${fechaInicio}T00:00:00`)
      .lte('reservado_en', `${fechaFin}T23:59:59`)
      .order('reservado_en', { ascending: false })
      .then(({ data }) => {
        if (vivo) setReservas(data || []);
      });
    return () => {
      vivo = false;
    };
  }, [tab, fechaInicio, fechaFin]);

  // Un hueco puede ser inocente —la mesa pidió la cuenta y se fue sin pagar—,
  // así que esto NO es una alarma: es una lista para mirar al cerrar. Lo que no
  // puede pasar es que nadie sepa que existe.
  const huecos = useMemo(
    () => foliosSinVenta(reservas, ventas || []),
    [reservas, ventas],
  );

  // ── Z-Cut: ventas del turno seleccionado ────────────────────────────────────
  const ventasTurno = useMemo(() => {
    if (!turnoSeleccionado) return [];
    const t = turnosPeriodo.find(
      (x) => String(x.id) === String(turnoSeleccionado),
    );
    if (!t) return [];
    const apertura = parseUTC(t.fecha_apertura);
    const cierre = t.fecha_cierre ? parseUTC(t.fecha_cierre) : new Date();
    return (ventas || []).filter((v) => {
      const f = parseUTC(v.fecha || v.created_at);
      return f && f >= apertura && f <= cierre;
    });
  }, [turnoSeleccionado, turnosPeriodo, ventas]);

  // ── Reimprimir el ticket de una venta ya cobrada ────────────────────────────
  //
  // «La copia es un duplicado EXACTO del original, sin texto extra de ningún
  // tipo» (Chris). Por eso `construirTicket` ya no estampa el aviso de
  // reimpresión en los tickets —sólo en las comandas, donde evita que cocina
  // prepare dos veces—.
  //
  // ── LA TRAMPA, QUE ES LO IMPORTANTE ───────────────────────────────────────
  // El número de copia entra en el ID del documento (`sufijoCopia`) y
  // `hub/cola.rs` DESCARTA por id ya impreso. El descarte no es un error para
  // el hub: la promesa vuelve con `ok`. Si se mandara siempre el mismo id, la
  // segunda copia no saldría y el cajero le diría al cliente «ya salió»
  // mientras la impresora no hace nada. De ahí que el contador viva en la base
  // (`ventas.copias_impresas`) y no en estado local, que se pierde al recargar.
  //
  // `?? 1` para las filas anteriores a la columna: su ticket se imprimió, así
  // que la siguiente es la 2. Es la misma razón por la que el DEFAULT de la
  // columna es 1 y no 0.
  const reimprimirTicket = async (venta) => {
    if (!venta || reimprimiendo) return;
    setReimprimiendo(venta.id);
    const copia = Number(venta.copias_impresas ?? 1) + 1;

    try {
      const r = await enviarTicket(
        {
          ...venta,
          // La fila de la base guarda el id de la mesa, no su nombre, y el
          // ticket enseña el nombre. Sin esto una mesa se reimprimiría como
          // «Mostrador», que es sencillamente falso.
          mesa_nombre:
            (mesas || []).find((m) => String(m.id) === String(venta.mesa))
              ?.nombre || undefined,
        },
        configuracion,
        {
          copia,
          // Una copia no mueve dinero. Sin este `false` explícito,
          // `construirTicket` decide el pulso por el método de pago y el cajón
          // se abriría cada vez que un cliente pide su ticket otra vez.
          abrirCajon: false,
        },
      );

      // `salioPapel` y no `r.ok`, y la diferencia es todo el punto de esta
      // pantalla. `imprimir()` devuelve `ok: true` también cuando el hub
      // DESCARTA el documento por id repetido —ahí `estado` es 'duplicado'—, y
      // ése es justo el desenlace contra el que existe el contador de copias.
      // Con `r.ok` a secas, un descarte se celebraría con «Copia 2 impresa» y
      // el contador subiría solo, tapando el único síntoma que había.
      if (!salioPapel(r)) {
        showToast(
          r?.estado === 'duplicado'
            ? 'El hub descartó esta copia como repetida y no salió papel. Avisa a soporte.'
            : 'No se pudo imprimir la copia. Revisa la impresora.',
          'error',
        );
        return;
      }

      // El contador se sube DESPUÉS de que el papel salga. Al revés, una
      // impresora apagada gastaría números de copia y el siguiente intento
      // saltaría a `::c3` sin que nunca hubiera existido una `::c2`.
      const actualizada = { ...venta, copias_impresas: copia };
      enqueueAction('ventas', 'update', actualizada);
      useAppStore.setState((prev) => ({
        ventas: (prev.ventas || []).map((x) =>
          String(x.id) === String(venta.id) ? actualizada : x,
        ),
      }));

      // ── EL ÚNICO RASTRO QUE VA A QUEDAR ─────────────────────────────────
      // Al ser la copia un duplicado exacto, desde el papel es IMPOSIBLE
      // distinguir un original de una copia. Es lo que se quiere y es lo que
      // el cliente espera — pero significa que sin esta línea dos tickets
      // idénticos circulan sin dejar huella en ninguna parte. Hermana de
      // `CUENTA_IMPRESA` (`cfbc428`), y dicen lo mismo a propósito.
      registrarAuditoria?.({
        fecha: new Date().toISOString(),
        usuario: user?.nombre ?? 'Sistema',
        accion: 'REIMPRESION_TICKET',
        modulo: 'REPORTES',
        nivel: 'info',
        detalles:
          `Folio ${venta.folio} reimpreso. Total: $${venta.total}. ` +
          `Impresión ${copia}.`,
      });

      showToast(`Copia ${copia} del folio ${venta.folio}.`, 'success');
    } finally {
      setReimprimiendo(null);
    }
  };

  // ── Imprimir Corte Z ────────────────────────────────────────────────────────
  // Sale por la MISMA impresora que los tickets, no por el diálogo de Windows.
  // Antes esto era `window.open` + `win.print()`, y dentro de la caja —Tauri
  // sobre WebView2— `window.open` no devuelve una ventana usable: el botón no
  // imprimía, no avisaba y no dejaba rastro. Un fallo de los que duelen aquí,
  // porque el único momento en que se descubre es al cerrar el turno.
  const imprimirCorteZ = async (t, vts) => {
    const total = vts.reduce((s, v) => s + Number(v.total || 0), 0);
    const efectivo = vts.reduce(
      (s, v) => s + (v.metodo_pago === 'efectivo' ? Number(v.total) : 0),
      0,
    );
    const tarjeta = vts.reduce(
      (s, v) => s + (v.metodo_pago === 'tarjeta' ? Number(v.total) : 0),
      0,
    );
    const propinas = vts.reduce((s, v) => s + Number(v.propina || 0), 0);
    const fondo = Number(t.fondo_inicial || 0);

    setImprimiendoCorte(String(t.id));
    try {
      const r = await enviarCorteZ(
        {
          // Los últimos cinco dígitos, igual que enseñaba el papel viejo: el id
          // completo es un uuid y nadie lo lee en una tira de 58 mm.
          turno: String(t.id).slice(-5),
          apertura: t.fecha_apertura,
          cierre: t.fecha_cierre,
          usuario: t.usuario,
          tickets: vts.length,
          efectivo,
          tarjeta,
          propinas,
          fondo,
          total,
          // Fondo + efectivo, sin tarjeta y sin propinas. Es lo que tiene que
          // haber físicamente en el cajón; las tarjetas no pasaron por ahí y
          // las propinas se pagan aparte. Misma cuenta que la versión de papel
          // anterior — cambiarla aquí, callando, descuadraría el arqueo.
          enCaja: fondo + efectivo,
          impreso: new Date().toISOString(),
        },
        configuracion,
      );

      // `salioPapel` y no `r.ok`: el hub responde `ok` también cuando descarta
      // el documento, y un corte que se cree impreso y no salió es peor que uno
      // que falla a la vista.
      if (!salioPapel(r)) {
        showToast(
          'No salió el corte. Revisa la impresora en Configuración › Hub.',
          'error',
        );
        return;
      }
      showToast('Corte Z enviado a la impresora.', 'success');
    } finally {
      setImprimiendoCorte(null);
    }
  };

  // ── Imprimir vale propina ────────────────────────────────────────────────────
  // Este papel se FIRMA, así que tiene que existir en papel de verdad. Mismo
  // arreglo y misma razón que el corte.
  const imprimirValePropina = async (mesero, monto) => {
    setImprimiendoVale(mesero);
    try {
      const r = await enviarValePropina(
        {
          mesero,
          desde: fechaInicio,
          hasta: fechaFin,
          monto,
          impreso: new Date().toISOString(),
        },
        configuracion,
      );
      if (!salioPapel(r)) {
        showToast(
          'No salió el vale. Revisa la impresora en Configuración › Hub.',
          'error',
        );
        return;
      }

      // ── POR QUÉ ESTE VALE SÍ SE AUDITA Y EL CORTE NO ────────────────────
      // El corte es un resumen de datos que ya están en la base: se puede
      // volver a sacar y sale igual. El vale es un comprobante de dinero que
      // sale del cajón contra una firma, y el papel es el único sitio donde
      // consta. Sin esta línea, «ya me pagaron las propinas» y «no me han
      // pagado» son indistinguibles desde el sistema.
      registrarAuditoria?.({
        fecha: new Date().toISOString(),
        usuario: user?.nombre ?? 'Sistema',
        accion: 'VALE_PROPINA_IMPRESO',
        modulo: 'REPORTES',
        nivel: 'info',
        detalles:
          `Vale de propinas de ${mesero} por $${Number(monto || 0).toFixed(2)} ` +
          `(${fechaInicio} a ${fechaFin}).`,
      });

      showToast(`Vale de ${mesero} enviado a la impresora.`, 'success');
    } finally {
      setImprimiendoVale(null);
    }
  };

  return (
    <PageShell className="overflow-y-auto">
      <PageHeader
        icono={BarChart2}
        titulo="Centro de Reportes"
        descripcion="Inteligencia de negocio · auditoría · cortes Z"
        acciones={
          <Card className="flex items-center gap-2 px-3 py-1.5">
            <Field label="Desde">
              <Input
                type="date"
                value={fechaInicio}
                onChange={(e) => setFechaInicio(e.target.value)}
                className="w-32 border-0 bg-transparent px-1 py-0.5 text-xs font-bold"
              />
            </Field>
            <Field label="Hasta">
              <Input
                type="date"
                value={fechaFin}
                onChange={(e) => setFechaFin(e.target.value)}
                className="w-32 border-0 bg-transparent px-1 py-0.5 text-xs font-bold"
              />
            </Field>
          </Card>
        }
      />

      <SegmentedControl
        className="mb-5 self-start"
        valor={tab}
        onChange={setTab}
        opciones={TABS.map((t) => ({ id: t.id, label: t.label }))}
      />

      {/* ── FRANJA DEL DÍA ────────────────────────────────────────────────────
          Sólo aparece si el local encendió las franjas. Con el ajuste apagado
          —que es como están todos hoy— esta pantalla no enseña ni una palabra
          nueva, que es la condición que se puso al diseñarlo. */}
      {configuracion?.franjas_activas && (
        <div className="mb-5 flex flex-wrap items-center gap-3">
          <SegmentedControl
            className="self-start"
            valor={franja}
            onChange={setFranja}
            opciones={FRANJAS}
          />
          {data.sinClasificar > 0 && (
            <Chip tono="alerta">
              {data.sinClasificar} sin clasificar, fuera de estas cifras
            </Chip>
          )}
        </div>
      )}

      {/* ── CONTENIDO ── */}
      <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-media">
        {/* ══ FINANCIERO ══ */}
        {tab === 'financiero' && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5">
              <KPI
                titulo="Ventas Totales"
                valor={fmt(data.tIngresos)}
                icono={DollarSign}
                accentBg="bg-adm-ok/10"
                accentText="text-adm-ok"
                subtitulo={`${data.vPeriodo.length} tickets`}
              />
              <KPI
                titulo="Ticket Promedio"
                valor={fmt(
                  data.vPeriodo.length
                    ? data.tIngresos / data.vPeriodo.length
                    : 0,
                )}
                icono={CreditCard}
                accentBg="bg-adm-info/10"
                accentText="text-adm-info"
              />
              <KPI
                titulo="Gastos Operativos"
                valor={fmt(data.tEgresos)}
                icono={TrendingDown}
                accentBg="bg-adm-danger/10"
                accentText="text-adm-danger"
                subtitulo="Insumos + Nómina"
              />
              <KPI
                titulo="Utilidad Neta"
                valor={fmt(data.utilNeta)}
                icono={TrendingUp}
                accentBg="bg-adm-warn/10"
                accentText="text-adm-warn"
                subtitulo={`Margen: ${pct(data.utilNeta, data.tIngresos)}%`}
              />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Distribución */}
              <div className="bg-white dark:bg-adm-panel rounded-ui-lg border-2 border-adm-border p-6 md:p-8 shadow-sm transition-colors">
                <h3 className="text-[10px] font-black text-adm-muted uppercase tracking-widest flex items-center gap-2 mb-6">
                  <PieChart className="w-4 h-4" /> Distribución de Ingresos
                </h3>
                <div className="space-y-6">
                  {[
                    {
                      label: 'Efectivo',
                      valor: data.tEfectivo,
                      color: 'bg-adm-ok',
                    },
                    {
                      label: 'Tarjeta',
                      valor: data.tTarjeta,
                      color: 'bg-adm-info',
                    },
                    {
                      label: 'Propinas',
                      valor: data.tPropinas,
                      color: 'bg-adm-warn',
                    },
                  ].map(({ label, valor, color }) => (
                    <div key={label}>
                      <div className="flex justify-between mb-1.5">
                        <span className="text-xs font-black text-adm-muted">
                          {label}
                        </span>
                        <span className="text-sm font-black text-adm-ink">
                          {fmt(valor)}
                        </span>
                      </div>
                      <Bar value={valor} max={data.tIngresos} color={color} />
                    </div>
                  ))}
                </div>
              </div>

              {/* Top platillos */}
              <div className="lg:col-span-2 bg-white dark:bg-adm-panel rounded-ui-lg border-2 border-adm-border p-6 md:p-8 shadow-sm transition-colors">
                <h3 className="text-[10px] font-black text-adm-muted uppercase tracking-widest flex items-center gap-2 mb-6">
                  <UtensilsCrossed className="w-4 h-4" /> Top 5 Platillos
                </h3>
                <div className="space-y-5">
                  {data.abcData.slice(0, 5).map((p, idx) => (
                    <div key={p.nombre} className="flex items-center gap-4">
                      <div className="w-8 h-8 rounded-ui bg-adm-warn/10 text-adm-warn font-black flex items-center justify-center shrink-0 text-sm">
                        {idx + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-end mb-1.5">
                          <p className="font-black text-adm-ink text-sm truncate">
                            {p.nombre}
                          </p>
                          <span className="text-xs font-bold text-adm-muted ml-2 shrink-0">
                            {p.uds} uds ·{' '}
                            <span className="text-adm-ok font-black">
                              {fmt(p.ingresosGenerados)}
                            </span>
                          </span>
                        </div>
                        <Bar
                          value={p.ingresosGenerados}
                          max={data.abcData[0]?.ingresosGenerados || 1}
                          color="bg-adm-warn"
                        />
                      </div>
                    </div>
                  ))}
                  {data.abcData.length === 0 && (
                    <p className="text-center text-adm-muted font-bold py-8 text-sm">
                      Sin ventas en el periodo.
                    </p>
                  )}
                </div>
              </div>
            </div>
          </>
        )}

        {/* ══ CORTE Z ══ */}
        {tab === 'zcut' && huecos.length > 0 && (
          /* ── FOLIOS IMPRESOS QUE NUNCA LLEGARON A VENTA ──────────────────
             Un hueco puede ser inocente: la mesa pidió la cuenta y se fue sin
             pagar, o el aparato murió entre imprimir y cobrar. Por eso esto no
             es una alarma sino una lista para mirar al cerrar. Lo que no puede
             pasar es que nadie sepa que existe: el cliente tiene un papel con
             un número, y hasta hoy ese número podía no corresponder a nada sin
             que quedara rastro en ninguna parte. */
          <div className="mb-6 bg-white dark:bg-adm-panel rounded-ui-lg border-2 border-adm-warn shadow-sm p-6">
            <div className="flex items-start gap-3 mb-4">
              <AlertTriangle className="w-5 h-5 text-adm-warn shrink-0 mt-0.5" />
              <div>
                <h3 className="text-[10px] font-black text-adm-warn uppercase tracking-widest">
                  Cuentas impresas sin cobrar · {huecos.length}
                </h3>
                <p className="text-xs font-bold text-adm-muted mt-1 max-w-2xl">
                  Se imprimió un papel con estos folios y no existe una venta
                  que los lleve. Puede ser una mesa que se fue sin pagar, o un
                  aparato que murió entre imprimir y cobrar. Cuadra cada uno
                  antes de cerrar el periodo.
                </p>
              </div>
            </div>
            <div className="space-y-2">
              {huecos.map((h) => (
                <div
                  key={h.id}
                  className="flex items-center justify-between gap-4 bg-adm-chip/40 dark:bg-adm-bg rounded-ui px-4 py-2.5 flex-wrap"
                >
                  <span className="font-mono font-black text-sm text-adm-ink">
                    {h.id}
                  </span>
                  <span className="text-xs font-bold text-adm-muted">
                    {h.mesa_nombre || 'Sin mesa'}
                    {h.usuario ? ` · ${h.usuario}` : ''}
                    {h.dispositivo ? ` · ${h.dispositivo}` : ''}
                  </span>
                  <span className="font-black text-sm text-adm-warn">
                    {h.total_impreso == null ? '—' : fmt(h.total_impreso)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === 'zcut' && (
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            {/* Lista de turnos */}
            <div className="bg-white dark:bg-adm-panel rounded-ui-lg border-2 border-adm-border shadow-sm p-6 transition-colors">
              <h3 className="text-[10px] font-black text-adm-muted uppercase tracking-widest flex items-center gap-2 mb-5">
                <ShieldAlert className="w-4 h-4" /> Turnos del Periodo
              </h3>
              <div className="space-y-3">
                {turnosPeriodo.length === 0 && (
                  <p className="text-center text-adm-muted font-bold py-8 text-sm">
                    Sin turnos en el periodo.
                  </p>
                )}
                {turnosPeriodo.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setTurnoSeleccionado(String(t.id))}
                    className={`w-full text-left p-4 rounded-ui border-2 transition-all ${
                      String(turnoSeleccionado) === String(t.id)
                        ? 'border-adm-info bg-adm-info/10'
                        : 'border-adm-border hover:border-adm-border dark:hover:border-adm-muted/40 bg-adm-bg'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <p className="font-black text-sm text-adm-ink">
                        #{String(t.id).slice(-5)}
                      </p>
                      <span
                        className={`text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded-ui ${
                          t.estado === 'abierto'
                            ? 'bg-adm-ok/15 text-adm-ok'
                            : 'bg-adm-chip dark:bg-adm-border text-adm-muted'
                        }`}
                      >
                        {t.estado}
                      </span>
                    </div>
                    <p className="text-xs font-bold text-adm-muted mt-1">
                      {new Date(t.fecha_apertura).toLocaleDateString('es-MX', {
                        day: '2-digit',
                        month: 'short',
                      })}{' '}
                      · {t.usuario || '—'}
                    </p>
                  </button>
                ))}
              </div>
            </div>

            {/* Detalle del corte */}
            <div className="xl:col-span-2 bg-white dark:bg-adm-panel rounded-ui-lg border-2 border-adm-border shadow-sm p-6 md:p-8 transition-colors">
              {!turnoSeleccionado ? (
                <div className="h-full flex flex-col items-center justify-center text-center py-20">
                  <Receipt className="w-14 h-14 text-adm-muted dark:text-adm-border mb-4" />
                  <p className="font-black text-adm-muted text-lg">
                    Selecciona un turno
                  </p>
                  <p className="text-sm font-bold text-adm-muted dark:text-adm-border mt-1">
                    para ver el corte de caja
                  </p>
                </div>
              ) : (
                (() => {
                  const t = turnosPeriodo.find(
                    (x) => String(x.id) === turnoSeleccionado,
                  );
                  if (!t) return null;
                  const total = ventasTurno.reduce(
                    (s, v) => s + Number(v.total || 0),
                    0,
                  );
                  const efectivo = ventasTurno.reduce(
                    (s, v) =>
                      s + (v.metodo_pago === 'efectivo' ? Number(v.total) : 0),
                    0,
                  );
                  const tarjeta = ventasTurno.reduce(
                    (s, v) =>
                      s + (v.metodo_pago === 'tarjeta' ? Number(v.total) : 0),
                    0,
                  );
                  const propinas = ventasTurno.reduce(
                    (s, v) => s + Number(v.propina || 0),
                    0,
                  );
                  const fondo = Number(t.fondo_inicial || 0);
                  const totalCaja = fondo + efectivo;

                  return (
                    <div className="space-y-6">
                      {/* Header turno */}
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="text-[10px] font-black text-adm-muted uppercase tracking-widest">
                            Corte Z
                          </p>
                          <h2 className="text-2xl font-black font-syne text-adm-ink">
                            Turno #{String(t.id).slice(-5)}
                          </h2>
                          <p className="text-xs font-bold text-adm-muted mt-1">
                            {new Date(t.fecha_apertura).toLocaleString(
                              'es-MX',
                              {
                                day: '2-digit',
                                month: 'long',
                                hour: '2-digit',
                                minute: '2-digit',
                              },
                            )}
                            {t.fecha_cierre &&
                              ` → ${new Date(t.fecha_cierre).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}`}
                          </p>
                        </div>
                        <button
                          onClick={() => imprimirCorteZ(t, ventasTurno)}
                          disabled={imprimiendoCorte === String(t.id)}
                          className="flex items-center gap-2 px-4 py-2.5 bg-adm-ink dark:bg-adm-info hover:bg-adm-ink dark:hover:bg-adm-info text-adm-info-fg rounded-ui font-black text-sm shadow-md transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100"
                        >
                          <Printer className="w-4 h-4" />{' '}
                          {imprimiendoCorte === String(t.id)
                            ? 'Imprimiendo…'
                            : 'Imprimir Z'}
                        </button>
                      </div>

                      {/* KPIs del turno */}
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        {[
                          {
                            label: 'Tickets',
                            valor: ventasTurno.length,
                            color: 'text-adm-ink',
                          },
                          {
                            label: 'Efectivo',
                            valor: fmt(efectivo),
                            color: 'text-adm-ok',
                          },
                          {
                            label: 'Tarjeta',
                            valor: fmt(tarjeta),
                            color: 'text-adm-info',
                          },
                          {
                            label: 'Propinas',
                            valor: fmt(propinas),
                            color: 'text-adm-warn',
                          },
                        ].map(({ label, valor, color }) => (
                          <div
                            key={label}
                            className="bg-adm-bg rounded-ui p-4 border-2 border-adm-border"
                          >
                            <p className="text-[10px] font-black text-adm-muted uppercase tracking-widest">
                              {label}
                            </p>
                            <p
                              className={`text-lg font-black font-syne mt-1 ${color}`}
                            >
                              {valor}
                            </p>
                          </div>
                        ))}
                      </div>

                      {/* Resumen caja */}
                      <div className="bg-adm-bg rounded-ui border-2 border-adm-border p-5 space-y-3">
                        {[
                          { label: 'Fondo inicial', valor: fmt(fondo) },
                          { label: 'Total ventas', valor: fmt(total) },
                        ].map(({ label, valor }) => (
                          <div
                            key={label}
                            className="flex justify-between items-center"
                          >
                            <span className="text-sm font-bold text-adm-muted">
                              {label}
                            </span>
                            <span className="font-black text-adm-ink">
                              {valor}
                            </span>
                          </div>
                        ))}
                        <div className="border-t-2 border-adm-border pt-3 flex justify-between items-center">
                          <span className="font-black text-adm-ink">
                            TOTAL EN CAJA
                          </span>
                          <span className="text-2xl font-black font-syne text-adm-ok">
                            {fmt(totalCaja)}
                          </span>
                        </div>
                      </div>

                      {/* Últimos tickets */}
                      <div>
                        <p className="text-[10px] font-black text-adm-muted uppercase tracking-widest mb-3">
                          Tickets del turno
                        </p>
                        <div className="max-h-[220px] overflow-y-auto space-y-2 pr-1">
                          {ventasTurno.length === 0 ? (
                            <p className="text-center text-adm-muted font-bold py-6 text-sm">
                              Sin tickets en este turno.
                            </p>
                          ) : (
                            ventasTurno.map((v) => (
                              <div
                                key={v.id}
                                className="flex items-center justify-between p-3 bg-adm-bg rounded-ui border border-adm-border"
                              >
                                <div className="flex items-center gap-3">
                                  <span className="font-black text-xs text-adm-muted dark:text-adm-ink">
                                    {v.folio}
                                  </span>
                                  <span className="text-[10px] font-black text-adm-muted">
                                    {new Date(
                                      v.fecha || v.created_at,
                                    ).toLocaleTimeString('es-MX', {
                                      hour: '2-digit',
                                      minute: '2-digit',
                                    })}
                                  </span>
                                  {/* ── EL DETECTOR QUE NADIE MIRABA ──────
                                      `total_divergente` lo calcula un trigger
                                      en cada venta desde el 11-ago y **ningún
                                      sitio del front lo leía**: viajaba en el
                                      `select('*')` del store, hasta la memoria
                                      del navegador, para morir ahí.
                                      Enseñarlo no cuesta ni una consulta.

                                      Y hasta el 17-ago no habría servido de
                                      nada: `verificar_total_venta` calculaba
                                      sin redondear en medio, así que el front
                                      y Postgres discrepaban POR CONSTRUCCIÓN y
                                      sólo la tolerancia de dos centavos evitaba
                                      que saltara en cada venta. Desde el
                                      arreglo del fallo 3 coinciden exacto, o
                                      sea que ahora un aviso aquí significa algo.

                                      Sin jerga: quien lee esta pantalla es el
                                      dueño o el gerente, no nosotros. */}
                                  {v.total_divergente && (
                                    <span
                                      title={`El total de este ticket no cuadra con la suma de sus renglones. Avisa a soporte con el folio ${v.folio}.`}
                                      className="flex items-center gap-1 text-[10px] font-black uppercase tracking-wide text-adm-danger bg-adm-danger/10 border border-adm-danger/30 px-2 py-0.5 rounded-ui whitespace-nowrap"
                                    >
                                      <AlertTriangle className="w-3 h-3" />
                                      Cuadra mal
                                    </span>
                                  )}
                                </div>
                                <div className="flex items-center gap-3">
                                  <span className="font-black text-sm text-adm-ok">
                                    {fmt(v.total)}
                                  </span>
                                  {/* El botón vive aquí y no en una pantalla
                                      nueva porque esta lista ya está gateada
                                      por `gestion`: reimprimir queda en
                                      Admin/Gerente sin inventar permisos. */}
                                  <button
                                    type="button"
                                    onClick={() => reimprimirTicket(v)}
                                    disabled={reimprimiendo === v.id}
                                    title={`Imprimir otra copia del folio ${v.folio}`}
                                    className="p-2 rounded-ui border-2 border-adm-border text-adm-muted hover:text-adm-ink hover:border-adm-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                                  >
                                    <Printer className="w-4 h-4" />
                                    <span className="sr-only">
                                      Imprimir copia
                                    </span>
                                  </button>
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })()
              )}
            </div>
          </div>
        )}

        {/* ══ ABC MENÚ ══ */}
        {tab === 'menu' && (
          <div className="space-y-6">
            <div className="grid grid-cols-3 gap-5">
              {[
                {
                  cls: 'A',
                  label: 'Vitales (80% Ingresos)',
                  bg: 'bg-adm-ok/10',
                  border: 'border-adm-ok/30',
                  text: 'text-adm-ok',
                },
                {
                  cls: 'B',
                  label: 'Regulares (15%)',
                  bg: 'bg-adm-warn/10',
                  border: 'border-adm-warn/30',
                  text: 'text-adm-warn',
                },
                {
                  cls: 'C',
                  label: 'Baja Rotación (5%)',
                  bg: 'bg-adm-danger/10',
                  border: 'border-adm-danger/30',
                  text: 'text-adm-danger',
                },
              ].map(({ cls, label, bg, border, text }) => (
                <div
                  key={cls}
                  className={`${bg} border-2 ${border} rounded-ui-lg p-6 text-center`}
                >
                  <h3 className={`text-5xl font-black ${text} font-syne`}>
                    {cls}
                  </h3>
                  <p
                    className={`text-[10px] font-black uppercase tracking-widest mt-2 ${text}`}
                  >
                    {label}
                  </p>
                </div>
              ))}
            </div>

            <div className="bg-white dark:bg-adm-panel rounded-ui-lg border-2 border-adm-border shadow-sm overflow-hidden transition-colors">
              <table className="w-full text-left text-sm">
                <thead className="bg-adm-bg border-b-2 border-adm-border">
                  <tr className="text-[10px] font-black text-adm-muted uppercase tracking-widest">
                    <th className="p-5">Platillo</th>
                    <th className="p-5 text-center">Clase</th>
                    <th className="p-5 text-center">Uds</th>
                    <th className="p-5 text-right">Costo / Precio</th>
                    <th className="p-5 text-right">Margen</th>
                    <th className="p-5 text-right">Generado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-adm-border">
                  {data.abcData.map((p) => (
                    <tr
                      key={p.nombre}
                      className="hover:bg-adm-bg dark:hover:bg-adm-bg/50 transition-colors"
                    >
                      <td className="p-5 font-black text-adm-ink">
                        {p.nombre}
                      </td>
                      <td className="p-5 text-center">
                        <span
                          className={`px-3 py-1 rounded-ui text-[10px] font-black ${
                            p.cls === 'A'
                              ? 'bg-adm-ok/15 text-adm-ok'
                              : p.cls === 'B'
                                ? 'bg-adm-warn/15 text-adm-warn'
                                : 'bg-adm-danger/15 text-adm-danger'
                          }`}
                        >
                          {p.cls}
                        </span>
                      </td>
                      <td className="p-5 text-center font-bold text-adm-muted">
                        {p.uds}
                      </td>
                      <td className="p-5 text-right font-bold">
                        <span className="text-adm-danger">{fmt(p.costo)}</span>
                        <span className="text-adm-muted dark:text-adm-border mx-1">
                          /
                        </span>
                        <span className="text-adm-ok">{fmt(p.precio)}</span>
                      </td>
                      <td className="p-5 text-right font-black">
                        <span
                          className={
                            p.margen < 30 ? 'text-adm-warn' : 'text-adm-ok'
                          }
                        >
                          {p.margen.toFixed(1)}%
                        </span>
                      </td>
                      <td className="p-5 text-right font-black text-adm-ink">
                        {fmt(p.ingresosGenerados)}
                      </td>
                    </tr>
                  ))}
                  {data.abcData.length === 0 && (
                    <tr>
                      <td
                        colSpan="6"
                        className="py-12 text-center text-adm-muted font-bold"
                      >
                        Sin datos en el periodo.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ══ MESEROS Y PROPINAS ══ */}
        {tab === 'operacion' && (
          <div className="bg-white dark:bg-adm-panel rounded-ui-lg border-2 border-adm-border shadow-sm p-6 md:p-8 transition-colors">
            <h3 className="text-[10px] font-black text-adm-muted uppercase tracking-widest flex items-center gap-2 mb-6">
              <Coins className="w-4 h-4" /> Rendimiento y Propinas por Mesero
            </h3>
            <div className="space-y-4">
              {data.meserosRank.length === 0 && (
                <p className="text-center text-adm-muted font-bold py-10 text-sm">
                  Sin ventas en el periodo.
                </p>
              )}
              {data.meserosRank.map((m) => (
                <div
                  key={m.nombre}
                  className="flex flex-col sm:flex-row justify-between items-start sm:items-center p-5 bg-adm-bg border-2 border-adm-border rounded-ui gap-4"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-11 h-11 rounded-ui bg-adm-warn/15 text-adm-warn font-black flex items-center justify-center text-lg">
                      {m.nombre[0].toUpperCase()}
                    </div>
                    <div>
                      <p className="font-black text-adm-ink">{m.nombre}</p>
                      <p className="text-xs font-bold text-adm-muted">
                        {m.tickets} tickets · Vendió {fmt(m.total)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <p className="text-[10px] font-black text-adm-warn uppercase tracking-widest">
                        Propinas
                      </p>
                      <p className="font-black text-xl text-adm-warn font-syne">
                        {fmt(m.propinas)}
                      </p>
                    </div>
                    {m.propinas > 0 && (
                      <button
                        onClick={() =>
                          imprimirValePropina(m.nombre, m.propinas)
                        }
                        disabled={imprimiendoVale === m.nombre}
                        title={`Imprimir vale de propinas de ${m.nombre}`}
                        className="p-2.5 bg-adm-warn/15 text-adm-warn hover:bg-adm-warn dark:hover:bg-adm-warn/30 rounded-ui transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100"
                      >
                        <Printer className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ══ ALMACÉN ══ */}
        {tab === 'almacen' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-adm-info text-adm-info-fg p-8 rounded-ui-lg shadow-xl">
                <p className="text-[10px] font-black uppercase tracking-widest mb-2 opacity-80">
                  Valorización de Inventario
                </p>
                <h3 className="text-4xl font-black font-syne">
                  {fmt(data.valorizacionTotal)}
                </h3>
                <p className="text-sm font-bold text-adm-info mt-2">
                  Capital congelado en almacén.
                </p>
              </div>
              <div className="bg-white dark:bg-adm-panel rounded-ui-lg border-2 border-adm-danger/30 shadow-sm p-8 transition-colors">
                <p className="text-[10px] font-black text-adm-danger uppercase tracking-widest mb-2 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4" /> Pérdida por Mermas
                </p>
                <h3 className="text-4xl font-black font-syne text-adm-danger">
                  {fmt(data.totalPerdidaMermas)}
                </h3>
                <p className="text-sm font-bold text-adm-muted mt-2">
                  En el periodo seleccionado.
                </p>
              </div>
            </div>

            <div className="bg-white dark:bg-adm-panel rounded-ui-lg border-2 border-adm-border shadow-sm overflow-hidden transition-colors">
              <div className="p-5 border-b-2 border-adm-border">
                <h4 className="text-[10px] font-black text-adm-muted uppercase tracking-widest flex items-center gap-2">
                  <TrendingDown className="w-4 h-4" /> Detalle de Mermas
                </h4>
              </div>
              <table className="w-full text-left text-sm">
                <thead className="bg-adm-bg border-b-2 border-adm-border">
                  <tr className="text-[10px] font-black text-adm-muted uppercase tracking-widest">
                    <th className="p-4">Fecha</th>
                    <th className="p-4">Insumo</th>
                    <th className="p-4 text-center">Cant</th>
                    <th className="p-4">Motivo</th>
                    <th className="p-4 text-right">Pérdida</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-adm-border">
                  {data.mermas.map((m, i) => (
                    <tr
                      key={i}
                      className="hover:bg-adm-danger/10 dark:hover:bg-adm-danger/5 transition-colors"
                    >
                      <td className="p-4 font-mono text-xs text-adm-muted">
                        {new Date(m.fecha).toLocaleDateString('es-MX')}
                      </td>
                      <td className="p-4 font-bold text-adm-ink">
                        {m.producto}
                      </td>
                      <td className="p-4 text-center font-black text-adm-danger">
                        {Math.abs(m.cantidad)}
                      </td>
                      <td className="p-4 text-xs italic text-adm-muted">
                        {m.referencia || '—'}
                      </td>
                      <td className="p-4 text-right font-black text-adm-ink">
                        {fmt(m.perdida)}
                      </td>
                    </tr>
                  ))}
                  {data.mermas.length === 0 && (
                    <tr>
                      <td
                        colSpan="5"
                        className="py-10 text-center text-adm-muted font-bold"
                      >
                        Sin mermas en este periodo.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* KARDEX COMPLETO: trazabilidad total del periodo */}
            <div className="bg-white dark:bg-adm-panel rounded-ui-lg border-2 border-adm-border shadow-sm overflow-hidden transition-colors">
              <div className="p-5 border-b-2 border-adm-border">
                <h4 className="text-[10px] font-black text-adm-muted uppercase tracking-widest flex items-center gap-2">
                  <Package className="w-4 h-4" /> Kardex del Periodo (Entradas ·
                  Salidas POS · Mermas · Ajustes)
                </h4>
              </div>
              <div className="max-h-[28rem] overflow-y-auto custom-scrollbar">
                <table className="w-full text-left text-sm">
                  <thead className="bg-adm-bg border-b-2 border-adm-border sticky top-0">
                    <tr className="text-[10px] font-black text-adm-muted uppercase tracking-widest">
                      <th className="p-4">Fecha</th>
                      <th className="p-4">Tipo</th>
                      <th className="p-4">Insumo</th>
                      <th className="p-4 text-center">Cant</th>
                      <th className="p-4 text-center">Stock</th>
                      <th className="p-4">Usuario</th>
                      <th className="p-4">Referencia</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-adm-border">
                    {data.kardex.map((m, i) => {
                      const esEntrada = m.tipo === 'Entrada';
                      const esAjuste = m.tipo === 'Ajuste';
                      return (
                        <tr
                          key={m.id ?? i}
                          className="hover:bg-adm-bg dark:hover:bg-adm-bg/50 transition-colors"
                        >
                          <td className="p-4 font-mono text-xs text-adm-muted whitespace-nowrap">
                            {new Date(m.fecha).toLocaleString('es-MX', {
                              dateStyle: 'short',
                              timeStyle: 'short',
                            })}
                          </td>
                          <td className="p-4">
                            <span
                              className={`text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded-ui border ${
                                esEntrada
                                  ? 'text-adm-ok bg-adm-ok/10 border-adm-ok/30'
                                  : esAjuste
                                    ? 'text-adm-info bg-adm-info/10 border-adm-info/30'
                                    : m.tipo === 'Merma'
                                      ? 'text-adm-danger bg-adm-danger/10 border-adm-danger/30'
                                      : 'text-adm-warn bg-adm-warn/10 border-adm-warn/30'
                              }`}
                            >
                              {m.tipo}
                            </span>
                          </td>
                          <td className="p-4 font-bold text-adm-ink">
                            {m.producto}
                          </td>
                          <td
                            className={`p-4 text-center font-black ${esEntrada ? 'text-adm-ok' : 'text-adm-ink'}`}
                          >
                            {esEntrada ? '+' : '−'}
                            {Math.abs(Number(m.cantidad) || 0)} {m.unidad}
                          </td>
                          <td className="p-4 text-center font-mono text-xs text-adm-muted whitespace-nowrap">
                            {m.stock_anterior != null
                              ? `${m.stock_anterior} → ${m.stock_nuevo}`
                              : '—'}
                          </td>
                          <td className="p-4 text-xs font-bold text-adm-muted">
                            {m.usuario || '—'}
                          </td>
                          <td className="p-4 text-xs italic text-adm-muted max-w-[16rem] truncate">
                            {m.referencia || '—'}
                          </td>
                        </tr>
                      );
                    })}
                    {data.kardex.length === 0 && (
                      <tr>
                        <td
                          colSpan="7"
                          className="py-10 text-center text-adm-muted font-bold"
                        >
                          Sin movimientos en este periodo.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
    </PageShell>
  );
}
