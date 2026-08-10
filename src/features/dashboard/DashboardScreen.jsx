// ─── DASHBOARD (piloto editorial · Proyecto D · tanda 4) ─────────────────────
// Reescrito sobre las primitivas adm-* y los motores puros lib/Metricas.js y
// lib/Alertas.js.
//
// BUG QUE VENÍA ARRASTRANDO: la versión anterior leía `useAppStore().ordenes`,
// una colección que NO EXISTE en el store (las ventas están en `ventas` y las
// comandas en `comandas_activas`). Ingresos, tickets y comandas mostraban CERO
// desde siempre, sin fallar ni avisar. Por eso los cálculos se mudaron a lib/:
// ahí se testean y un error así no se esconde dentro del JSX.
//
// Layout por capacidades (AUDITORIA_SISTEMA): gestión ve finanzas y P&L;
// operación ve su turno y lo que tiene enfrente.

import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSessionStore } from '../../store/useSessionStore';
import { useAppStore } from '../../store/useAppStore';
import { useSyncStore } from '../../store/useSyncStore';
import { usePermisos } from '../../hooks/usePermisos';
import { useAuthStore } from '../auth/useAuthStore';
import {
  TrendingUp,
  TrendingDown,
  Minus,
  Receipt,
  ChefHat,
  Utensils,
  ArrowRight,
  DoorOpen,
  Wallet,
  Info,
} from 'lucide-react';
import AbrirTurnoModal from './AbrirTurnoModal';
import CierreTurnoModal from './CierreTurnoModal';
import { PERIODOS, resumenDelPeriodo } from '../../lib/Metricas';
import { calcularAlertas } from '../../lib/Alertas';
import {
  PageShell,
  PageHeader,
  Card,
  CardBody,
  Button,
  Chip,
  SegmentedControl,
  EmptyState,
} from '../../components/ui';

const dinero = (n) =>
  `$${Number(n || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const TONO_ALERTA = {
  critica: 'peligro',
  aviso: 'alerta',
  info: 'neutro',
};

// ── Variación vs periodo anterior ────────────────────────────────────────────
function Delta({ v }) {
  if (!v || v.pct === null) {
    // Sin base de comparación no se pinta un porcentaje inventado.
    return (
      <span className="text-[11px] text-adm-muted">sin dato comparable</span>
    );
  }
  const sube = v.direccion === 'sube';
  const igual = v.direccion === 'igual';
  const Icono = igual ? Minus : sube ? TrendingUp : TrendingDown;
  return (
    <span
      className={`text-[11px] font-bold flex items-center gap-1 ${
        igual ? 'text-adm-muted' : sube ? 'text-adm-ok' : 'text-adm-danger'
      }`}
    >
      <Icono className="w-3 h-3" />
      {igual ? 'sin cambio' : `${v.pct > 0 ? '+' : ''}${v.pct}%`}
      <span className="text-adm-muted font-medium">vs anterior</span>
    </span>
  );
}

// ── KPI editorial: el número manda, el resto susurra ─────────────────────────
function Kpi({ etiqueta, valor, pie, delta, icono: Icono }) {
  return (
    <Card>
      <CardBody className="flex flex-col gap-1">
        <div className="flex items-center justify-between">
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-adm-muted">
            {etiqueta}
          </p>
          {Icono && <Icono className="w-4 h-4 text-adm-muted" />}
        </div>
        <p className="font-fraunces font-bold text-adm-ink text-3xl leading-tight tabular-nums">
          {valor}
        </p>
        {pie && <p className="text-xs text-adm-muted">{pie}</p>}
        {delta && <Delta v={delta} />}
      </CardBody>
    </Card>
  );
}

// ── Gráfico compacto, SVG a mano ─────────────────────────────────────────────
// Sin recharts: son barras. Meter una librería de gráficas para esto engorda el
// bundle de una app que tiene que arrancar en una caja modesta y offline.
function Barras({ serie }) {
  const max = Math.max(...serie.map((c) => c.total), 0);
  if (!serie.length || max <= 0) return null;
  return (
    <div className="flex items-end gap-[3px] h-24">
      {serie.map((c, i) => (
        <div
          key={i}
          className="flex-1 min-w-0 flex flex-col justify-end h-full group relative"
          title={`${c.etiqueta}: ${dinero(c.total)} · ${c.tickets} ticket${c.tickets !== 1 ? 's' : ''}`}
        >
          <div
            className="w-full bg-adm-accent/70 group-hover:bg-adm-accent transition-colors rounded-t-ui"
            style={{ height: `${Math.max(2, (c.total / max) * 100)}%` }}
          />
        </div>
      ))}
    </div>
  );
}

export default function DashboardScreen() {
  const navigate = useNavigate();
  const { empleadoActivo } = useSessionStore();
  const { user } = useAuthStore();
  const { flag, puedeVerRuta } = usePermisos();

  // FUENTES CORRECTAS (esto es lo que estaba roto): ventas + comandas_activas.
  const ventas = useAppStore((s) => s.ventas);
  const comandasActivas = useAppStore((s) => s.comandas_activas);
  const mesas = useAppStore((s) => s.mesas);
  const turnos = useAppStore((s) => s.turnos);
  const recetas = useAppStore((s) => s.recetas);
  const productos = useAppStore((s) => s.productos);
  const asistencias = useAppStore((s) => s.asistencias);
  const nominas = useAppStore((s) => s.nominas);
  const gastos = useAppStore((s) => s.gastos);
  const categoriasGasto = useAppStore((s) => s.categorias_gasto);
  const configuracion = useAppStore((s) => s.configuracion);
  const deadTasks = useSyncStore((s) => s.deadTasks);

  const [periodo, setPeriodo] = useState('hoy');
  const [showAbrirModal, setShowAbrirModal] = useState(false);
  const [showCierreModal, setShowCierreModal] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const esGestion = flag('gestion');
  const puedeCaja = flag('abre_caja');
  const turnoActivo =
    (turnos || []).find((t) => t.estado === 'abierto') || null;

  // Reloj de minuto para la duración del turno y para que las alertas por
  // tiempo (mesa estancada) se refresquen solas.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(id);
  }, []);

  const foodCostPct = Number(configuracion?.food_cost_pct ?? 0.3);

  const resumen = useMemo(
    () =>
      resumenDelPeriodo(ventas, periodo, {
        recetas,
        foodCostPct,
        ahora: new Date(now),
        gastos,
        nominas,
        categoriasGasto,
      }),
    [
      ventas,
      periodo,
      recetas,
      foodCostPct,
      now,
      gastos,
      nominas,
      categoriasGasto,
    ],
  );

  const alertas = useMemo(
    () =>
      calcularAlertas(
        { productos, mesas, asistencias, deadTasks },
        { flag, puedeVerRuta, ahora: new Date(now) },
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [productos, mesas, asistencias, deadTasks, now, esGestion, puedeCaja],
  );

  const mesasActivas = (mesas || []).filter((m) =>
    ['ocupada', 'por_cobrar'].includes(m.estado),
  ).length;
  const comandasEnCurso = (comandasActivas || []).filter(
    (c) => !['entregada', 'completada', 'cancelada'].includes(c?.estado),
  ).length;

  const nombreUsuario = empleadoActivo?.nombre || user?.nombre || 'Usuario';
  const fechaLarga = new Date(now).toLocaleDateString('es-MX', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

  let duracionTurno = '—';
  if (turnoActivo?.fecha_apertura) {
    const mins = Math.floor(
      (now - new Date(turnoActivo.fecha_apertura).getTime()) / 60000,
    );
    duracionTurno = `${Math.floor(mins / 60)}h ${mins % 60}m`;
  }

  const { actual, comparativa, pyl, serie, top } = resumen;

  return (
    <PageShell className="overflow-y-auto">
      <PageHeader
        titulo={`Hola, ${nombreUsuario}`}
        descripcion={fechaLarga.charAt(0).toUpperCase() + fechaLarga.slice(1)}
        acciones={
          <SegmentedControl
            opciones={PERIODOS}
            valor={periodo}
            onChange={setPeriodo}
          />
        }
      />

      {/* ── TURNO DE CAJA ── */}
      <Card className="mb-6">
        <CardBody className="flex flex-col md:flex-row md:items-center gap-5">
          <div className="flex items-center gap-3 min-w-0">
            <span
              className={`w-2.5 h-2.5 rounded-full shrink-0 ${turnoActivo ? 'bg-adm-ok animate-pulse' : 'bg-adm-muted'}`}
            />
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-adm-muted">
                Turno de caja
              </p>
              <p className="font-fraunces font-bold text-lg leading-tight">
                {turnoActivo ? 'Abierto' : 'Cerrado'}
              </p>
            </div>
          </div>

          {turnoActivo && (
            <div className="flex items-center gap-8 md:border-l md:border-adm-border md:pl-6">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-adm-muted">
                  Duración
                </p>
                <p className="font-bold tabular-nums">{duracionTurno}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-adm-muted">
                  Fondo
                </p>
                <p className="font-bold tabular-nums">
                  {dinero(turnoActivo.fondo_inicial)}
                </p>
              </div>
            </div>
          )}

          <div className="flex-1" />

          {/* Abrir y cerrar caja exigen el mismo flag que en EsperaScreen. */}
          {puedeCaja &&
            (turnoActivo ? (
              <Button
                variante="secundario"
                onClick={() => setShowCierreModal(true)}
              >
                Cerrar turno
              </Button>
            ) : (
              <Button icono={DoorOpen} onClick={() => setShowAbrirModal(true)}>
                Abrir turno
              </Button>
            ))}
        </CardBody>
      </Card>

      {/* ── ALERTAS ── */}
      {alertas.length > 0 && (
        <section className="mb-6">
          <h2 className="text-[10px] font-bold uppercase tracking-[0.2em] text-adm-muted mb-2">
            Requiere atención
          </h2>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {alertas.map((a) => {
              const Icono = a.icono;
              return (
                <Card
                  key={a.id}
                  className={
                    a.severidad === 'critica' ? 'border-adm-danger/50' : ''
                  }
                >
                  <CardBody className="flex items-start gap-3 py-4">
                    <div
                      className={`p-2 rounded-ui shrink-0 ${
                        a.severidad === 'critica'
                          ? 'bg-adm-danger/10 text-adm-danger'
                          : 'bg-adm-accent/10 text-adm-accent'
                      }`}
                    >
                      <Icono className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-bold text-sm">{a.titulo}</p>
                        <Chip tono={TONO_ALERTA[a.severidad]}>
                          {a.severidad === 'critica' ? 'Crítica' : 'Aviso'}
                        </Chip>
                      </div>
                      <p className="text-xs text-adm-muted mt-0.5">
                        {a.detalle}
                      </p>
                    </div>
                    {a.ruta && (
                      <Button
                        variante="fantasma"
                        tamano="sm"
                        icono={ArrowRight}
                        onClick={() => navigate(a.ruta)}
                      >
                        {a.cta}
                      </Button>
                    )}
                  </CardBody>
                </Card>
              );
            })}
          </div>
        </section>
      )}

      {/* ── KPIs ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
        <Kpi
          etiqueta="Ingresos"
          icono={Wallet}
          valor={dinero(actual.ingresos)}
          pie={`${actual.tickets} ticket${actual.tickets !== 1 ? 's' : ''}`}
          delta={comparativa.ingresos}
        />
        <Kpi
          etiqueta="Ticket promedio"
          icono={Receipt}
          valor={dinero(actual.ticketPromedio)}
          pie={
            actual.propinas > 0
              ? `${dinero(actual.propinas)} en propinas`
              : 'Sin propinas registradas'
          }
          delta={comparativa.ticketPromedio}
        />
        <Kpi
          etiqueta="Mesas activas"
          icono={Utensils}
          valor={mesasActivas}
          pie="Ocupadas o por cobrar"
        />
        <Kpi
          etiqueta="En producción"
          icono={ChefHat}
          valor={comandasEnCurso}
          pie="Comandas en cocina y barra"
        />
      </div>

      {/* ── P&L + gráfico (solo gestión: son cifras de negocio) ── */}
      {esGestion && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
          <Card className="lg:col-span-2">
            <CardBody>
              <div className="flex items-baseline justify-between mb-4">
                <h2 className="font-fraunces font-bold text-lg">
                  Ventas del periodo
                </h2>
                <span className="text-xs text-adm-muted">
                  {periodo === 'hoy' ? 'por hora' : 'por día'}
                </span>
              </div>
              {serie.length && actual.ingresos > 0 ? (
                <Barras serie={serie} />
              ) : (
                <p className="text-sm text-adm-muted py-8 text-center">
                  Sin ventas registradas en este periodo.
                </p>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardBody>
              {/* La cifra GRANDE es la utilidad neta SOLO cuando hay gastos
                  capturados. Sin ellos sería idéntica al margen bruto, y
                  llamarle "utilidad" a un margen es exactamente el error que
                  la fase 2.5 venía a corregir. */}
              <h2 className="font-fraunces font-bold text-lg mb-4">
                {pyl.hayGastos ? 'Utilidad neta' : 'Margen bruto'}
              </h2>
              <p
                className={`font-fraunces font-bold text-3xl tabular-nums leading-none ${
                  pyl.hayGastos && pyl.utilidadNeta < 0 ? 'text-adm-danger' : ''
                }`}
              >
                {dinero(pyl.hayGastos ? pyl.utilidadNeta : pyl.margen)}
              </p>
              <p className="text-xs text-adm-muted mt-1">
                {pyl.hayGastos
                  ? `${pyl.utilidadNetaPct}% sobre ventas`
                  : `${pyl.margenPct}% sobre ventas · food cost ${pyl.foodCostPct}%`}
              </p>

              <dl className="mt-4 space-y-1.5 text-sm">
                <div className="flex justify-between">
                  <dt className="text-adm-muted">Ingresos</dt>
                  <dd className="tabular-nums font-bold">
                    {dinero(pyl.ingresos)}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-adm-muted">Costo de insumos</dt>
                  <dd className="tabular-nums font-bold">
                    −{dinero(pyl.costo)}
                  </dd>
                </div>
                {pyl.hayGastos && (
                  <>
                    <div className="flex justify-between">
                      <dt className="text-adm-muted">Gastos y costos fijos</dt>
                      <dd className="tabular-nums font-bold">
                        −{dinero(pyl.gastos)}
                      </dd>
                    </div>
                    <div className="flex justify-between pt-1.5 border-t border-adm-border">
                      <dt className="text-adm-muted">Margen bruto</dt>
                      <dd className="tabular-nums font-bold">
                        {dinero(pyl.margen)}
                      </dd>
                    </div>
                  </>
                )}
              </dl>

              {/* Sin gastos, se dice POR QUÉ la cifra no es la utilidad. */}
              {!pyl.hayGastos && (
                <p className="mt-4 pt-3 border-t border-adm-border text-xs text-adm-muted flex gap-2">
                  <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <span>
                    Esto es margen bruto: solo descuenta insumos. Registra tus{' '}
                    <button
                      type="button"
                      onClick={() => navigate('/gastos')}
                      className="underline font-bold hover:text-adm-accent"
                    >
                      gastos y costos fijos
                    </button>{' '}
                    para ver la utilidad real.
                  </span>
                </p>
              )}
              {pyl.gastosPendientes > 0 && (
                <p className="mt-3 text-xs text-adm-warn flex gap-2">
                  <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <span>
                    Hay {dinero(pyl.gastosPendientes)} en gastos recurrentes sin
                    confirmar; aún no cuentan aquí.
                  </span>
                </p>
              )}

              {/* Honestidad de la cifra: si parte del costo salió del
                  porcentaje y no de recetas costeadas, se dice. */}
              {pyl.pctEstimado > 0 && (
                <p className="mt-4 pt-3 border-t border-adm-border text-xs text-adm-muted flex gap-2">
                  <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <span>
                    El {pyl.pctEstimado}% de la venta usa un food cost estimado
                    del {Math.round(foodCostPct * 100)}%: esas recetas aún no
                    tienen costo capturado.
                  </span>
                </p>
              )}
            </CardBody>
          </Card>
        </div>
      )}

      {/* ── TOP DE PLATILLOS ── */}
      {esGestion && (
        <Card className="mb-4">
          <CardBody>
            <h2 className="font-fraunces font-bold text-lg mb-4">
              Lo que más facturó
            </h2>
            {top.length === 0 ? (
              <EmptyState
                icono={ChefHat}
                titulo="Todavía nada"
                descripcion="En cuanto se cobre el primer ticket del periodo aparece aquí."
              />
            ) : (
              <ol className="divide-y divide-adm-border">
                {top.map((p, i) => (
                  <li
                    key={p.nombre}
                    className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0"
                  >
                    <span className="w-5 text-xs font-bold text-adm-muted tabular-nums">
                      {i + 1}
                    </span>
                    <span className="flex-1 min-w-0 truncate font-medium">
                      {p.nombre}
                    </span>
                    <span className="text-xs text-adm-muted tabular-nums">
                      {p.cantidad} u.
                    </span>
                    <span className="font-bold tabular-nums w-24 text-right">
                      {dinero(p.importe)}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </CardBody>
        </Card>
      )}

      {/* ── MODALES ── */}
      {showAbrirModal && (
        <AbrirTurnoModal onClose={() => setShowAbrirModal(false)} />
      )}
      {showCierreModal && (
        <CierreTurnoModal onClose={() => setShowCierreModal(false)} />
      )}
    </PageShell>
  );
}
