import { useState, useMemo } from 'react';
import { useAppStore, parseUTC } from '../../store/useAppStore';
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
  CheckCircle,
  X,
  FileText,
  ArrowDownToLine,
} from 'lucide-react';

// ─── HELPERS ─────────────────────────────────────────────────────────────────
const fmt = (n) =>
  `$${Number(n || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}`;
const pct = (a, b) => (b > 0 ? ((a / b) * 100).toFixed(1) : '0.0');

// ─── KPI CARD ────────────────────────────────────────────────────────────────
function KPI({ titulo, valor, icono: Icono, accentBg, accentText, subtitulo }) {
  return (
    <div className="bg-white dark:bg-ui-humo p-6 rounded-[2rem] border-2 border-slate-100 dark:border-ui-border shadow-sm flex items-start gap-4 hover:shadow-lg transition-all">
      <div className={`p-3.5 rounded-2xl ${accentBg}`}>
        <Icono className={`w-5 h-5 ${accentText}`} />
      </div>
      <div className="min-w-0">
        <p className="text-[10px] font-black text-slate-400 dark:text-ui-muted uppercase tracking-widest mb-1">
          {titulo}
        </p>
        <p className="text-2xl font-black text-slate-900 dark:text-brand-nacar font-syne leading-none">
          {valor}
        </p>
        {subtitulo && (
          <p className="text-xs font-bold text-slate-400 dark:text-ui-muted mt-1">
            {subtitulo}
          </p>
        )}
      </div>
    </div>
  );
}

// ─── BARRA DE PROGRESO ───────────────────────────────────────────────────────
function Bar({ value, max, color }) {
  const w = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="w-full h-2.5 bg-slate-100 dark:bg-ui-border rounded-full overflow-hidden">
      <div
        className={`h-full rounded-full transition-all duration-500 ${color}`}
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
  } = useAppStore();

  const [tab, setTab] = useState('financiero');
  const hoy = new Date();
  const primerDiaMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
  const [fechaInicio, setFechaInicio] = useState(
    primerDiaMes.toISOString().split('T')[0],
  );
  const [fechaFin, setFechaFin] = useState(hoy.toISOString().split('T')[0]);
  const [turnoSeleccionado, setTurnoSeleccionado] = useState(null);

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

    const vPeriodo = (ventas || []).filter((v) => {
      const f = parseUTC(v.fecha || v.created_at);
      return f && f >= inicio && f <= fin;
    });
    const cPeriodo = (ordenesCompra || []).filter((c) => {
      const f = parseUTC(c.fecha || c.created_at);
      return f && f >= inicio && f <= fin && c.estado === 'Completada';
    });
    const nPeriodo = (nominas || []).filter((n) => {
      const f = parseUTC(n.fecha_fin || n.created_at);
      return f && f >= inicio && f <= fin;
    });
    const mPeriodo = (movimientos || []).filter((m) => {
      const f = parseUTC(m.fecha);
      return f && f >= inicio && f <= fin;
    });

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

    return {
      vPeriodo,
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
  ]);

  const turnosPeriodo = useMemo(() => {
    const inicio = new Date(fechaInicio + 'T00:00:00Z');
    const fin = new Date(fechaFin + 'T23:59:59Z');
    return (turnos || []).filter((t) => {
      const f = parseUTC(t.fecha_apertura);
      return f && f >= inicio && f <= fin;
    });
  }, [turnos, fechaInicio, fechaFin]);

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

  // ── Imprimir Corte Z ────────────────────────────────────────────────────────
  const imprimirCorteZ = (t, vts) => {
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

    const win = window.open('', '_blank', 'width=340,height=700');
    win.document.write(`
      <html><head><style>
        body { font-family: 'Courier New', monospace; font-size: 12px; padding: 20px; max-width: 280px; margin: auto; }
        h2 { text-align: center; font-size: 16px; }
        .sep { border-top: 1px dashed #000; margin: 8px 0; }
        .row { display: flex; justify-content: space-between; margin: 3px 0; }
        .bold { font-weight: bold; }
        .big { font-size: 18px; font-weight: 900; text-align: center; margin: 8px 0; }
      </style></head><body>
        <h2>★ CORTE DE CAJA Z ★</h2>
        <p style="text-align:center">Turno #${String(t.id).slice(-5)}</p>
        <p style="text-align:center">${new Date(t.fecha_apertura).toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' })}</p>
        <div class="sep"></div>
        <div class="row"><span>Apertura</span><span>${new Date(t.fecha_apertura).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}</span></div>
        <div class="row"><span>Cierre</span><span>${t.fecha_cierre ? new Date(t.fecha_cierre).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }) : 'En curso'}</span></div>
        <div class="row"><span>Responsable</span><span>${t.usuario || '—'}</span></div>
        <div class="sep"></div>
        <div class="row"><span>Tickets emitidos</span><span>${vts.length}</span></div>
        <div class="row"><span>Efectivo</span><span>$${efectivo.toFixed(2)}</span></div>
        <div class="row"><span>Tarjeta</span><span>$${tarjeta.toFixed(2)}</span></div>
        <div class="row"><span>Propinas</span><span>$${propinas.toFixed(2)}</span></div>
        <div class="sep"></div>
        <div class="row bold"><span>FONDO INICIAL</span><span>$${fondo.toFixed(2)}</span></div>
        <div class="row bold"><span>TOTAL VENTAS</span><span>$${total.toFixed(2)}</span></div>
        <div class="big">TOTAL EN CAJA: $${(fondo + efectivo).toFixed(2)}</div>
        <div class="sep"></div>
        <p style="text-align:center; font-size:10px; margin-top:16px">Generado por AZUL ERP</p>
        <p style="text-align:center; font-size:10px">${new Date().toLocaleString('es-MX')}</p>
      </body></html>
    `);
    win.document.close();
    setTimeout(() => {
      win.print();
      win.close();
    }, 500);
  };

  // ── Imprimir vale propina ────────────────────────────────────────────────────
  const imprimirValePropina = (mesero, monto) => {
    const win = window.open('', '_blank', 'width=320,height=400');
    win.document.write(`
      <html><head><style>body{font-family:'Courier New',monospace;font-size:12px;text-align:center;padding:20px}</style></head>
      <body>
        <h2>VALE DE PROPINAS</h2>
        <br/>
        <h1 style="font-size:2rem">$${Number(monto).toFixed(2)}</h1>
        <br/>
        <p>${mesero.toUpperCase()}</p>
        <p>Periodo: ${fechaInicio} al ${fechaFin}</p>
        <hr style="margin-top:50px"/>
        <p>Firma: _______________</p>
      </body></html>
    `);
    win.document.close();
    setTimeout(() => {
      win.print();
      win.close();
    }, 500);
  };

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-ui-obsidiana p-4 md:p-8 transition-colors duration-500">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* ── CABECERA + FILTRO DE FECHAS ── */}
        <div className="bg-white dark:bg-ui-humo rounded-[2rem] border-2 border-slate-100 dark:border-ui-border shadow-sm p-6 md:p-8 flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6 transition-colors">
          <div className="flex items-center gap-4">
            <div className="bg-indigo-100 dark:bg-brand-amatista/20 p-3.5 rounded-2xl">
              <BarChart2 className="w-7 h-7 text-indigo-600 dark:text-brand-amatista" />
            </div>
            <div>
              <h1 className="text-2xl font-black font-syne text-slate-900 dark:text-brand-nacar">
                Centro de Reportes
              </h1>
              <p className="text-[10px] font-black text-slate-400 dark:text-ui-muted uppercase tracking-widest mt-0.5">
                Inteligencia de negocio · Auditoría · Cortes Z
              </p>
            </div>
          </div>

          {/* Filtro fechas */}
          <div className="flex items-center bg-slate-50 dark:bg-ui-obsidiana border-2 border-slate-200 dark:border-ui-border rounded-2xl overflow-hidden">
            <div className="px-5 py-3 border-r-2 border-slate-200 dark:border-ui-border">
              <label className="text-[9px] font-black text-slate-400 dark:text-ui-muted uppercase tracking-widest block mb-0.5">
                Desde
              </label>
              <input
                type="date"
                value={fechaInicio}
                onChange={(e) => setFechaInicio(e.target.value)}
                className="bg-transparent font-black text-slate-700 dark:text-brand-nacar outline-none text-sm"
              />
            </div>
            <div className="px-5 py-3">
              <label className="text-[9px] font-black text-slate-400 dark:text-ui-muted uppercase tracking-widest block mb-0.5">
                Hasta
              </label>
              <input
                type="date"
                value={fechaFin}
                onChange={(e) => setFechaFin(e.target.value)}
                className="bg-transparent font-black text-slate-700 dark:text-brand-nacar outline-none text-sm"
              />
            </div>
          </div>
        </div>

        {/* ── TABS ── */}
        <div className="flex gap-2 overflow-x-auto pb-1">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 px-5 py-3 rounded-2xl text-sm font-black whitespace-nowrap transition-all ${
                tab === t.id
                  ? 'bg-slate-900 dark:bg-brand-amatista text-white shadow-lg'
                  : 'bg-white dark:bg-ui-humo text-slate-500 dark:text-ui-muted border-2 border-slate-100 dark:border-ui-border hover:border-slate-300 dark:hover:border-ui-muted/40'
              }`}
            >
              <t.icon className="w-4 h-4" /> {t.label}
            </button>
          ))}
        </div>

        {/* ── CONTENIDO ── */}
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
          {/* ══ FINANCIERO ══ */}
          {tab === 'financiero' && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5">
                <KPI
                  titulo="Ventas Totales"
                  valor={fmt(data.tIngresos)}
                  icono={DollarSign}
                  accentBg="bg-emerald-50 dark:bg-brand-cesped/10"
                  accentText="text-emerald-600 dark:text-brand-cesped"
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
                  accentBg="bg-indigo-50 dark:bg-brand-amatista/10"
                  accentText="text-indigo-600 dark:text-brand-amatista"
                />
                <KPI
                  titulo="Gastos Operativos"
                  valor={fmt(data.tEgresos)}
                  icono={TrendingDown}
                  accentBg="bg-rose-50 dark:bg-brand-arrecife/10"
                  accentText="text-rose-500 dark:text-brand-arrecife"
                  subtitulo="Insumos + Nómina"
                />
                <KPI
                  titulo="Utilidad Neta"
                  valor={fmt(data.utilNeta)}
                  icono={TrendingUp}
                  accentBg="bg-amber-50 dark:bg-brand-ambar/10"
                  accentText="text-amber-600 dark:text-brand-ambar"
                  subtitulo={`Margen: ${pct(data.utilNeta, data.tIngresos)}%`}
                />
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Distribución */}
                <div className="bg-white dark:bg-ui-humo rounded-[2rem] border-2 border-slate-100 dark:border-ui-border p-6 md:p-8 shadow-sm transition-colors">
                  <h3 className="text-[10px] font-black text-slate-400 dark:text-ui-muted uppercase tracking-widest flex items-center gap-2 mb-6">
                    <PieChart className="w-4 h-4" /> Distribución de Ingresos
                  </h3>
                  <div className="space-y-6">
                    {[
                      {
                        label: 'Efectivo',
                        valor: data.tEfectivo,
                        color: 'bg-emerald-400 dark:bg-brand-cesped',
                      },
                      {
                        label: 'Tarjeta',
                        valor: data.tTarjeta,
                        color: 'bg-indigo-400 dark:bg-brand-amatista',
                      },
                      {
                        label: 'Propinas',
                        valor: data.tPropinas,
                        color: 'bg-amber-400 dark:bg-brand-ambar',
                      },
                    ].map(({ label, valor, color }) => (
                      <div key={label}>
                        <div className="flex justify-between mb-1.5">
                          <span className="text-xs font-black text-slate-500 dark:text-ui-muted">
                            {label}
                          </span>
                          <span className="text-sm font-black text-slate-800 dark:text-brand-nacar">
                            {fmt(valor)}
                          </span>
                        </div>
                        <Bar value={valor} max={data.tIngresos} color={color} />
                      </div>
                    ))}
                  </div>
                </div>

                {/* Top platillos */}
                <div className="lg:col-span-2 bg-white dark:bg-ui-humo rounded-[2rem] border-2 border-slate-100 dark:border-ui-border p-6 md:p-8 shadow-sm transition-colors">
                  <h3 className="text-[10px] font-black text-slate-400 dark:text-ui-muted uppercase tracking-widest flex items-center gap-2 mb-6">
                    <UtensilsCrossed className="w-4 h-4" /> Top 5 Platillos
                  </h3>
                  <div className="space-y-5">
                    {data.abcData.slice(0, 5).map((p, idx) => (
                      <div key={p.nombre} className="flex items-center gap-4">
                        <div className="w-8 h-8 rounded-xl bg-amber-50 dark:bg-brand-ambar/10 text-amber-600 dark:text-brand-ambar font-black flex items-center justify-center shrink-0 text-sm">
                          {idx + 1}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex justify-between items-end mb-1.5">
                            <p className="font-black text-slate-800 dark:text-brand-nacar text-sm truncate">
                              {p.nombre}
                            </p>
                            <span className="text-xs font-bold text-slate-400 dark:text-ui-muted ml-2 shrink-0">
                              {p.uds} uds ·{' '}
                              <span className="text-emerald-600 dark:text-brand-cesped font-black">
                                {fmt(p.ingresosGenerados)}
                              </span>
                            </span>
                          </div>
                          <Bar
                            value={p.ingresosGenerados}
                            max={data.abcData[0]?.ingresosGenerados || 1}
                            color="bg-amber-400 dark:bg-brand-ambar"
                          />
                        </div>
                      </div>
                    ))}
                    {data.abcData.length === 0 && (
                      <p className="text-center text-slate-400 dark:text-ui-muted font-bold py-8 text-sm">
                        Sin ventas en el periodo.
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </>
          )}

          {/* ══ CORTE Z ══ */}
          {tab === 'zcut' && (
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
              {/* Lista de turnos */}
              <div className="bg-white dark:bg-ui-humo rounded-[2rem] border-2 border-slate-100 dark:border-ui-border shadow-sm p-6 transition-colors">
                <h3 className="text-[10px] font-black text-slate-400 dark:text-ui-muted uppercase tracking-widest flex items-center gap-2 mb-5">
                  <ShieldAlert className="w-4 h-4" /> Turnos del Periodo
                </h3>
                <div className="space-y-3">
                  {turnosPeriodo.length === 0 && (
                    <p className="text-center text-slate-400 dark:text-ui-muted font-bold py-8 text-sm">
                      Sin turnos en el periodo.
                    </p>
                  )}
                  {turnosPeriodo.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => setTurnoSeleccionado(String(t.id))}
                      className={`w-full text-left p-4 rounded-2xl border-2 transition-all ${
                        String(turnoSeleccionado) === String(t.id)
                          ? 'border-indigo-400 dark:border-brand-amatista bg-indigo-50 dark:bg-brand-amatista/10'
                          : 'border-slate-100 dark:border-ui-border hover:border-slate-300 dark:hover:border-ui-muted/40 bg-slate-50 dark:bg-ui-obsidiana'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <p className="font-black text-sm text-slate-800 dark:text-brand-nacar">
                          #{String(t.id).slice(-5)}
                        </p>
                        <span
                          className={`text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded-lg ${
                            t.estado === 'abierto'
                              ? 'bg-emerald-100 dark:bg-brand-cesped/20 text-emerald-600 dark:text-brand-cesped'
                              : 'bg-slate-100 dark:bg-ui-border text-slate-500 dark:text-ui-muted'
                          }`}
                        >
                          {t.estado}
                        </span>
                      </div>
                      <p className="text-xs font-bold text-slate-400 dark:text-ui-muted mt-1">
                        {new Date(t.fecha_apertura).toLocaleDateString(
                          'es-MX',
                          { day: '2-digit', month: 'short' },
                        )}{' '}
                        · {t.usuario || '—'}
                      </p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Detalle del corte */}
              <div className="xl:col-span-2 bg-white dark:bg-ui-humo rounded-[2rem] border-2 border-slate-100 dark:border-ui-border shadow-sm p-6 md:p-8 transition-colors">
                {!turnoSeleccionado ? (
                  <div className="h-full flex flex-col items-center justify-center text-center py-20">
                    <Receipt className="w-14 h-14 text-slate-200 dark:text-ui-border mb-4" />
                    <p className="font-black text-slate-400 dark:text-ui-muted text-lg">
                      Selecciona un turno
                    </p>
                    <p className="text-sm font-bold text-slate-300 dark:text-ui-border mt-1">
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
                        s +
                        (v.metodo_pago === 'efectivo' ? Number(v.total) : 0),
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
                            <p className="text-[10px] font-black text-slate-400 dark:text-ui-muted uppercase tracking-widest">
                              Corte Z
                            </p>
                            <h2 className="text-2xl font-black font-syne text-slate-800 dark:text-brand-nacar">
                              Turno #{String(t.id).slice(-5)}
                            </h2>
                            <p className="text-xs font-bold text-slate-400 dark:text-ui-muted mt-1">
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
                            className="flex items-center gap-2 px-4 py-2.5 bg-slate-900 dark:bg-brand-amatista hover:bg-slate-700 dark:hover:bg-indigo-600 text-white rounded-xl font-black text-sm shadow-md transition-all active:scale-95"
                          >
                            <Printer className="w-4 h-4" /> Imprimir Z
                          </button>
                        </div>

                        {/* KPIs del turno */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                          {[
                            {
                              label: 'Tickets',
                              valor: ventasTurno.length,
                              color: 'text-slate-800 dark:text-brand-nacar',
                            },
                            {
                              label: 'Efectivo',
                              valor: fmt(efectivo),
                              color: 'text-emerald-600 dark:text-brand-cesped',
                            },
                            {
                              label: 'Tarjeta',
                              valor: fmt(tarjeta),
                              color: 'text-indigo-600 dark:text-brand-amatista',
                            },
                            {
                              label: 'Propinas',
                              valor: fmt(propinas),
                              color: 'text-amber-600 dark:text-brand-ambar',
                            },
                          ].map(({ label, valor, color }) => (
                            <div
                              key={label}
                              className="bg-slate-50 dark:bg-ui-obsidiana rounded-2xl p-4 border-2 border-slate-100 dark:border-ui-border"
                            >
                              <p className="text-[10px] font-black text-slate-400 dark:text-ui-muted uppercase tracking-widest">
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
                        <div className="bg-slate-50 dark:bg-ui-obsidiana rounded-2xl border-2 border-slate-200 dark:border-ui-border p-5 space-y-3">
                          {[
                            { label: 'Fondo inicial', valor: fmt(fondo) },
                            { label: 'Total ventas', valor: fmt(total) },
                          ].map(({ label, valor }) => (
                            <div
                              key={label}
                              className="flex justify-between items-center"
                            >
                              <span className="text-sm font-bold text-slate-500 dark:text-ui-muted">
                                {label}
                              </span>
                              <span className="font-black text-slate-800 dark:text-brand-nacar">
                                {valor}
                              </span>
                            </div>
                          ))}
                          <div className="border-t-2 border-slate-200 dark:border-ui-border pt-3 flex justify-between items-center">
                            <span className="font-black text-slate-800 dark:text-brand-nacar">
                              TOTAL EN CAJA
                            </span>
                            <span className="text-2xl font-black font-syne text-emerald-600 dark:text-brand-cesped">
                              {fmt(totalCaja)}
                            </span>
                          </div>
                        </div>

                        {/* Últimos tickets */}
                        <div>
                          <p className="text-[10px] font-black text-slate-400 dark:text-ui-muted uppercase tracking-widest mb-3">
                            Tickets del turno
                          </p>
                          <div className="max-h-[220px] overflow-y-auto space-y-2 pr-1">
                            {ventasTurno.length === 0 ? (
                              <p className="text-center text-slate-400 dark:text-ui-muted font-bold py-6 text-sm">
                                Sin tickets en este turno.
                              </p>
                            ) : (
                              ventasTurno.map((v) => (
                                <div
                                  key={v.id}
                                  className="flex items-center justify-between p-3 bg-slate-50 dark:bg-ui-obsidiana rounded-xl border border-slate-100 dark:border-ui-border"
                                >
                                  <div className="flex items-center gap-3">
                                    <span className="font-black text-xs text-slate-600 dark:text-brand-nacar">
                                      {v.folio}
                                    </span>
                                    <span className="text-[10px] font-black text-slate-400 dark:text-ui-muted">
                                      {new Date(
                                        v.fecha || v.created_at,
                                      ).toLocaleTimeString('es-MX', {
                                        hour: '2-digit',
                                        minute: '2-digit',
                                      })}
                                    </span>
                                  </div>
                                  <span className="font-black text-sm text-emerald-600 dark:text-brand-cesped">
                                    {fmt(v.total)}
                                  </span>
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
                    bg: 'bg-emerald-50 dark:bg-brand-cesped/10',
                    border: 'border-emerald-200 dark:border-brand-cesped/30',
                    text: 'text-emerald-600 dark:text-brand-cesped',
                  },
                  {
                    cls: 'B',
                    label: 'Regulares (15%)',
                    bg: 'bg-amber-50 dark:bg-brand-ambar/10',
                    border: 'border-amber-200 dark:border-brand-ambar/30',
                    text: 'text-amber-500 dark:text-brand-ambar',
                  },
                  {
                    cls: 'C',
                    label: 'Baja Rotación (5%)',
                    bg: 'bg-rose-50 dark:bg-brand-arrecife/10',
                    border: 'border-rose-200 dark:border-brand-arrecife/30',
                    text: 'text-rose-500 dark:text-brand-arrecife',
                  },
                ].map(({ cls, label, bg, border, text }) => (
                  <div
                    key={cls}
                    className={`${bg} border-2 ${border} rounded-[2rem] p-6 text-center`}
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

              <div className="bg-white dark:bg-ui-humo rounded-[2rem] border-2 border-slate-100 dark:border-ui-border shadow-sm overflow-hidden transition-colors">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 dark:bg-ui-obsidiana border-b-2 border-slate-100 dark:border-ui-border">
                    <tr className="text-[10px] font-black text-slate-400 dark:text-ui-muted uppercase tracking-widest">
                      <th className="p-5">Platillo</th>
                      <th className="p-5 text-center">Clase</th>
                      <th className="p-5 text-center">Uds</th>
                      <th className="p-5 text-right">Costo / Precio</th>
                      <th className="p-5 text-right">Margen</th>
                      <th className="p-5 text-right">Generado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-ui-border">
                    {data.abcData.map((p) => (
                      <tr
                        key={p.nombre}
                        className="hover:bg-slate-50 dark:hover:bg-ui-obsidiana/50 transition-colors"
                      >
                        <td className="p-5 font-black text-slate-800 dark:text-brand-nacar">
                          {p.nombre}
                        </td>
                        <td className="p-5 text-center">
                          <span
                            className={`px-3 py-1 rounded-lg text-[10px] font-black ${
                              p.cls === 'A'
                                ? 'bg-emerald-100 dark:bg-brand-cesped/20 text-emerald-700 dark:text-brand-cesped'
                                : p.cls === 'B'
                                  ? 'bg-amber-100 dark:bg-brand-ambar/20 text-amber-700 dark:text-brand-ambar'
                                  : 'bg-rose-100 dark:bg-brand-arrecife/20 text-rose-700 dark:text-brand-arrecife'
                            }`}
                          >
                            {p.cls}
                          </span>
                        </td>
                        <td className="p-5 text-center font-bold text-slate-500 dark:text-ui-muted">
                          {p.uds}
                        </td>
                        <td className="p-5 text-right font-bold">
                          <span className="text-rose-500 dark:text-brand-arrecife">
                            {fmt(p.costo)}
                          </span>
                          <span className="text-slate-300 dark:text-ui-border mx-1">
                            /
                          </span>
                          <span className="text-emerald-600 dark:text-brand-cesped">
                            {fmt(p.precio)}
                          </span>
                        </td>
                        <td className="p-5 text-right font-black">
                          <span
                            className={
                              p.margen < 30
                                ? 'text-amber-500 dark:text-brand-ambar'
                                : 'text-emerald-600 dark:text-brand-cesped'
                            }
                          >
                            {p.margen.toFixed(1)}%
                          </span>
                        </td>
                        <td className="p-5 text-right font-black text-slate-900 dark:text-brand-nacar">
                          {fmt(p.ingresosGenerados)}
                        </td>
                      </tr>
                    ))}
                    {data.abcData.length === 0 && (
                      <tr>
                        <td
                          colSpan="6"
                          className="py-12 text-center text-slate-400 dark:text-ui-muted font-bold"
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
            <div className="bg-white dark:bg-ui-humo rounded-[2rem] border-2 border-slate-100 dark:border-ui-border shadow-sm p-6 md:p-8 transition-colors">
              <h3 className="text-[10px] font-black text-slate-400 dark:text-ui-muted uppercase tracking-widest flex items-center gap-2 mb-6">
                <Coins className="w-4 h-4" /> Rendimiento y Propinas por Mesero
              </h3>
              <div className="space-y-4">
                {data.meserosRank.length === 0 && (
                  <p className="text-center text-slate-400 dark:text-ui-muted font-bold py-10 text-sm">
                    Sin ventas en el periodo.
                  </p>
                )}
                {data.meserosRank.map((m) => (
                  <div
                    key={m.nombre}
                    className="flex flex-col sm:flex-row justify-between items-start sm:items-center p-5 bg-slate-50 dark:bg-ui-obsidiana border-2 border-slate-100 dark:border-ui-border rounded-2xl gap-4"
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-11 h-11 rounded-2xl bg-amber-100 dark:bg-brand-ambar/20 text-amber-600 dark:text-brand-ambar font-black flex items-center justify-center text-lg">
                        {m.nombre[0].toUpperCase()}
                      </div>
                      <div>
                        <p className="font-black text-slate-800 dark:text-brand-nacar">
                          {m.nombre}
                        </p>
                        <p className="text-xs font-bold text-slate-400 dark:text-ui-muted">
                          {m.tickets} tickets · Vendió {fmt(m.total)}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <p className="text-[10px] font-black text-amber-500 dark:text-brand-ambar uppercase tracking-widest">
                          Propinas
                        </p>
                        <p className="font-black text-xl text-amber-600 dark:text-brand-ambar font-syne">
                          {fmt(m.propinas)}
                        </p>
                      </div>
                      {m.propinas > 0 && (
                        <button
                          onClick={() =>
                            imprimirValePropina(m.nombre, m.propinas)
                          }
                          className="p-2.5 bg-amber-100 dark:bg-brand-ambar/20 text-amber-600 dark:text-brand-ambar hover:bg-amber-200 dark:hover:bg-brand-ambar/30 rounded-xl transition-all active:scale-95"
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
                <div className="bg-gradient-to-br from-indigo-600 to-indigo-800 dark:from-brand-amatista dark:to-indigo-800 p-8 rounded-[2rem] shadow-xl text-white">
                  <p className="text-[10px] font-black text-indigo-200 uppercase tracking-widest mb-2">
                    Valorización de Inventario
                  </p>
                  <h3 className="text-4xl font-black font-syne">
                    {fmt(data.valorizacionTotal)}
                  </h3>
                  <p className="text-sm font-bold text-indigo-200 mt-2">
                    Capital congelado en almacén.
                  </p>
                </div>
                <div className="bg-white dark:bg-ui-humo rounded-[2rem] border-2 border-rose-200 dark:border-brand-arrecife/30 shadow-sm p-8 transition-colors">
                  <p className="text-[10px] font-black text-rose-400 dark:text-brand-arrecife uppercase tracking-widest mb-2 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4" /> Pérdida por Mermas
                  </p>
                  <h3 className="text-4xl font-black font-syne text-rose-600 dark:text-brand-arrecife">
                    {fmt(data.totalPerdidaMermas)}
                  </h3>
                  <p className="text-sm font-bold text-slate-400 dark:text-ui-muted mt-2">
                    En el periodo seleccionado.
                  </p>
                </div>
              </div>

              <div className="bg-white dark:bg-ui-humo rounded-[2rem] border-2 border-slate-100 dark:border-ui-border shadow-sm overflow-hidden transition-colors">
                <div className="p-5 border-b-2 border-slate-100 dark:border-ui-border">
                  <h4 className="text-[10px] font-black text-slate-400 dark:text-ui-muted uppercase tracking-widest flex items-center gap-2">
                    <TrendingDown className="w-4 h-4" /> Detalle de Mermas
                  </h4>
                </div>
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 dark:bg-ui-obsidiana border-b-2 border-slate-100 dark:border-ui-border">
                    <tr className="text-[10px] font-black text-slate-400 dark:text-ui-muted uppercase tracking-widest">
                      <th className="p-4">Fecha</th>
                      <th className="p-4">Insumo</th>
                      <th className="p-4 text-center">Cant</th>
                      <th className="p-4">Motivo</th>
                      <th className="p-4 text-right">Pérdida</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-ui-border">
                    {data.mermas.map((m, i) => (
                      <tr
                        key={i}
                        className="hover:bg-rose-50 dark:hover:bg-brand-arrecife/5 transition-colors"
                      >
                        <td className="p-4 font-mono text-xs text-slate-500 dark:text-ui-muted">
                          {new Date(m.fecha).toLocaleDateString('es-MX')}
                        </td>
                        <td className="p-4 font-bold text-slate-800 dark:text-brand-nacar">
                          {m.producto}
                        </td>
                        <td className="p-4 text-center font-black text-rose-500 dark:text-brand-arrecife">
                          {Math.abs(m.cantidad)}
                        </td>
                        <td className="p-4 text-xs italic text-slate-400 dark:text-ui-muted">
                          {m.referencia || '—'}
                        </td>
                        <td className="p-4 text-right font-black text-slate-800 dark:text-brand-nacar">
                          {fmt(m.perdida)}
                        </td>
                      </tr>
                    ))}
                    {data.mermas.length === 0 && (
                      <tr>
                        <td
                          colSpan="5"
                          className="py-10 text-center text-slate-400 dark:text-ui-muted font-bold"
                        >
                          Sin mermas en este periodo.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
