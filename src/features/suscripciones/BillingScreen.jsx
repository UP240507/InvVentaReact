import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  CreditCard,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  Users,
  Sparkles,
  ShieldCheck,
} from 'lucide-react';
import { useAuthStore } from '../auth/useAuthStore';
import { useAppStore } from '../../store/useAppStore';
import { usePlan } from '../../hooks/usePlan';
import {
  iniciarCheckout,
  abrirPortal,
  cargarCatalogo,
  precioMXN,
} from './checkout';

// ─── Fase 1: BillingScreen real (editorial adm-*) ────────────────────────────
// Muestra plan actual + uso vs límites, catálogo de upgrade y dispara el
// Checkout de Stripe vía create-checkout. La BD la escribe SOLO el webhook.

const ESTADO_UI = {
  trial: { label: 'Prueba', cls: 'bg-adm-chip text-adm-chip-fg' },
  activo: { label: 'Activa', cls: 'bg-adm-ok/10 text-adm-ok' },
  moroso: { label: 'Pago pendiente', cls: 'bg-adm-danger/10 text-adm-danger' },
  suspendido: { label: 'Suspendida', cls: 'bg-adm-danger/10 text-adm-danger' },
  cancelado: { label: 'Cancelada', cls: 'bg-adm-chip text-adm-chip-fg' },
};

export default function BillingScreen() {
  const { user } = useAuthStore();
  const staff = useAppStore((s) => s.staff);
  const configuracion = useAppStore((s) => s.configuracion);
  const nombreNegocio =
    configuracion?.nombre_empresa || user?.nombre_negocio || 'Restaurante';
  const {
    suscripcion,
    planNombre,
    estado,
    vigente,
    limiteEmpleados,
    modulos,
    diasRestantes,
  } = usePlan();

  const [catalogo, setCatalogo] = useState({ planes: [], addons: [] });
  const [cargando, setCargando] = useState(null); // plan_id en proceso
  const [error, setError] = useState('');
  const [searchParams] = useSearchParams();
  const pago = searchParams.get('pago'); // exito | cancelado (vuelta de Stripe)

  useEffect(() => {
    cargarCatalogo()
      .then(setCatalogo)
      .catch(() => {});
  }, []);

  const empleadosActivos = (staff || []).filter(
    (s) => s.activo !== false,
  ).length;
  const usoPct =
    limiteEmpleados > 0
      ? Math.min(100, Math.round((empleadosActivos / limiteEmpleados) * 100))
      : 0;

  const estadoUi = ESTADO_UI[estado] ?? ESTADO_UI.cancelado;
  const addonsContratados = Array.isArray(suscripcion?.addons)
    ? suscripcion.addons
    : [];

  const handleCheckout = async (planId, addons = []) => {
    setError('');
    setCargando(planId);
    try {
      await iniciarCheckout(planId, addons);
    } catch (e) {
      setError(e.message);
      setCargando(null);
    }
  };

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto font-figtree text-adm-ink animate-in fade-in duration-media">
      {/* ── Header ── */}
      <header className="mb-8">
        <h1 className="font-fraunces text-3xl flex items-center gap-3">
          <CreditCard className="w-7 h-7 text-adm-accent" /> Mi plan
        </h1>
        <p className="text-sm text-adm-muted mt-1">
          {nombreNegocio} · suscripción anual
        </p>
      </header>

      {/* ── Aviso de retorno de Stripe ── */}
      {pago === 'exito' && (
        <div className="flex items-center gap-2 px-4 py-3 bg-adm-ok/10 border border-adm-ok/30 rounded-ui mb-6 text-adm-ok text-sm font-semibold">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          Pago recibido. Tu plan se activará en unos segundos (al confirmar
          Stripe).
        </div>
      )}
      {pago === 'cancelado' && (
        <div className="flex items-center gap-2 px-4 py-3 bg-adm-chip border border-adm-border rounded-ui mb-6 text-adm-chip-fg text-sm font-semibold">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          Pago cancelado. Tu plan no cambió.
        </div>
      )}
      {error && (
        <div className="flex items-center gap-2 px-4 py-3 bg-adm-danger/5 border border-adm-danger/40 rounded-ui mb-6 text-adm-danger text-sm font-semibold">
          <AlertTriangle className="w-4 h-4 shrink-0" /> {error}
        </div>
      )}

      {/* ── Plan actual + uso ── */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-10">
        <div className="lg:col-span-2 bg-adm-panel border border-adm-border rounded-ui p-6">
          <div className="flex justify-between items-start mb-5">
            <div>
              <p className="text-[10px] font-bold text-adm-muted uppercase tracking-widest mb-1">
                Plan actual
              </p>
              <h2 className="font-fraunces text-3xl">
                {planNombre ?? 'Sin plan'}
              </h2>
            </div>
            <span
              className={`px-3 py-1.5 rounded-ui text-[11px] font-bold uppercase tracking-widest ${estadoUi.cls}`}
            >
              {estadoUi.label}
            </span>
          </div>

          <div className="flex flex-wrap gap-x-8 gap-y-3 text-sm mb-6">
            <div>
              <p className="text-[10px] font-bold text-adm-muted uppercase tracking-widest">
                {estado === 'trial' ? 'Prueba termina' : 'Vence'}
              </p>
              <p className="font-semibold tabular-nums">
                {(
                  estado === 'trial'
                    ? suscripcion?.trial_hasta
                    : suscripcion?.fecha_vencimiento
                )
                  ? new Date(
                      estado === 'trial'
                        ? suscripcion.trial_hasta
                        : suscripcion.fecha_vencimiento,
                    ).toLocaleDateString('es-MX', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                    })
                  : '—'}
                {vigente && (
                  <span className="text-adm-muted">
                    {' '}
                    · {diasRestantes} días
                  </span>
                )}
              </p>
            </div>
            <div>
              <p className="text-[10px] font-bold text-adm-muted uppercase tracking-widest">
                Módulos premium
              </p>
              <p className="font-semibold">
                {modulos.length ? modulos.join(' · ') : 'Ninguno'}
                {addonsContratados.length > 0 && (
                  <span className="text-adm-muted">
                    {' '}
                    (add-on: {addonsContratados.join(', ')})
                  </span>
                )}
              </p>
            </div>
          </div>

          {/* Uso: empleados (el único límite duro) */}
          <div className="bg-adm-bg border border-adm-border rounded-ui p-4">
            <div className="flex items-center justify-between mb-2 text-sm">
              <span className="flex items-center gap-2 font-semibold">
                <Users className="w-4 h-4 text-adm-muted" /> Empleados activos
              </span>
              <span className="font-semibold tabular-nums">
                {empleadosActivos} / {limiteEmpleados || '—'}
              </span>
            </div>
            <div className="h-1.5 bg-adm-chip rounded-ui overflow-hidden">
              <div
                className={`h-full transition-all ${usoPct >= 100 ? 'bg-adm-danger' : 'bg-adm-accent'}`}
                style={{ width: `${usoPct}%` }}
              />
            </div>
            {usoPct >= 100 && (
              <p className="text-xs text-adm-danger font-semibold mt-2">
                Límite alcanzado: desactiva un empleado o mejora tu plan.
              </p>
            )}
          </div>
        </div>

        {/* Renovación / pago */}
        <div className="bg-adm-sidebar text-adm-sidebar-fg rounded-ui p-6 flex flex-col">
          <h3 className="text-[11px] font-bold uppercase tracking-widest text-adm-sidebar-muted mb-4 flex items-center gap-2">
            <ShieldCheck className="w-4 h-4" /> Renovación
          </h3>
          <p className="text-sm leading-relaxed mb-6">
            Anualidad con renovación automática. El pago se procesa de forma
            segura en Stripe; los precios no incluyen IVA.
          </p>
          {suscripcion?.cancelar_al_final && (
            <p className="text-xs font-semibold text-adm-danger mb-4">
              Cancelación programada al final del periodo.
            </p>
          )}
          <button
            onClick={() =>
              handleCheckout(suscripcion?.plan ?? 'basico', addonsContratados)
            }
            disabled={cargando !== null}
            className="mt-auto w-full py-3 bg-adm-accent text-adm-accent-fg rounded-ui font-bold flex items-center justify-center gap-2 hover:opacity-90 disabled:opacity-50 transition-all"
          >
            {cargando ? 'Abriendo Stripe…' : 'Renovar / actualizar pago'}
            <ArrowRight className="w-4 h-4" />
          </button>
          {suscripcion?.stripe_customer_id && (
            <button
              onClick={async () => {
                setError('');
                setCargando('portal');
                try {
                  await abrirPortal();
                } catch (e) {
                  setError(e.message);
                  setCargando(null);
                }
              }}
              disabled={cargando !== null}
              className="w-full mt-3 py-2.5 rounded-ui font-bold text-sm text-adm-sidebar-fg border border-adm-sidebar-fg/20 hover:bg-adm-sidebar-2 disabled:opacity-50 transition-colors"
            >
              {cargando === 'portal'
                ? 'Abriendo portal…'
                : 'Tarjeta, facturas y cancelación'}
            </button>
          )}
        </div>
      </section>

      {/* ── Catálogo de planes ── */}
      <section>
        <h2 className="font-fraunces text-2xl mb-4">Planes</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {catalogo.planes
            .filter((p) => p.activo || p.id === suscripcion?.plan)
            .map((p) => {
              const esActual = p.id === suscripcion?.plan;
              const lim = p.limites ?? {};
              return (
                <div
                  key={p.id}
                  className={`bg-adm-panel border rounded-ui p-5 flex flex-col ${
                    esActual ? 'border-adm-accent' : 'border-adm-border'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-fraunces text-xl">{p.nombre}</h3>
                    {esActual && (
                      <span className="text-[10px] font-bold uppercase tracking-widest text-adm-accent">
                        Actual
                      </span>
                    )}
                  </div>
                  <p className="text-2xl font-bold tabular-nums mb-1">
                    {precioMXN(p.precio_anual_centavos)}
                    <span className="text-sm font-semibold text-adm-muted">
                      {' '}
                      /año más IVA
                    </span>
                  </p>
                  <ul className="text-sm text-adm-muted space-y-1.5 my-4">
                    <li className="flex items-center gap-2">
                      <CheckCircle2 className="w-3.5 h-3.5 text-adm-ok shrink-0" />
                      Dispositivos ilimitados
                    </li>
                    <li className="flex items-center gap-2">
                      <CheckCircle2 className="w-3.5 h-3.5 text-adm-ok shrink-0" />
                      Hasta {lim.empleados ?? '—'} empleados
                    </li>
                    {(lim.modulos ?? []).map((m) => (
                      <li key={m} className="flex items-center gap-2">
                        <Sparkles className="w-3.5 h-3.5 text-adm-accent shrink-0" />
                        {m === 'lealtad'
                          ? 'Sistema de Lealtad'
                          : m === 'multisucursal'
                            ? 'Multi-sucursal'
                            : m}
                      </li>
                    ))}
                  </ul>
                  <button
                    onClick={() => handleCheckout(p.id)}
                    disabled={esActual || cargando !== null}
                    className={`mt-auto w-full py-2.5 rounded-ui font-bold text-sm transition-all ${
                      esActual
                        ? 'bg-adm-chip text-adm-muted cursor-default'
                        : 'bg-adm-accent text-adm-accent-fg hover:opacity-90 disabled:opacity-50'
                    }`}
                  >
                    {esActual
                      ? 'Tu plan'
                      : cargando === p.id
                        ? 'Abriendo Stripe…'
                        : 'Cambiar a este plan'}
                  </button>
                </div>
              );
            })}
        </div>

        {/* Add-ons */}
        {catalogo.addons.some((a) => a.disponible) && (
          <div className="mt-6">
            <h3 className="font-fraunces text-lg mb-3">Add-ons</h3>
            <div className="flex flex-wrap gap-4">
              {catalogo.addons.map((a) => {
                const incluido = modulos.includes(a.id);
                return (
                  <div
                    key={a.id}
                    className="bg-adm-panel border border-adm-border rounded-ui p-4 flex items-center gap-4"
                  >
                    <div>
                      <p className="font-semibold text-sm">{a.nombre}</p>
                      <p className="text-sm text-adm-muted tabular-nums">
                        {precioMXN(a.precio_anual_centavos)} /año más IVA
                      </p>
                    </div>
                    {incluido ? (
                      <span className="text-[10px] font-bold uppercase tracking-widest text-adm-ok">
                        Incluido
                      </span>
                    ) : a.disponible ? (
                      <button
                        onClick={() =>
                          handleCheckout(suscripcion?.plan ?? 'basico', [
                            ...addonsContratados,
                            a.id,
                          ])
                        }
                        disabled={cargando !== null}
                        className="py-2 px-4 bg-adm-accent text-adm-accent-fg rounded-ui font-bold text-xs hover:opacity-90 disabled:opacity-50 transition-all"
                      >
                        Agregar
                      </button>
                    ) : (
                      <span className="text-[10px] font-bold uppercase tracking-widest text-adm-muted">
                        Próximamente
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
