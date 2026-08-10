import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  CreditCard,
  Lock,
  AlertTriangle,
  ArrowRight,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { useAuthStore } from '../auth/useAuthStore';
import { usePlan } from '../../hooks/usePlan';
import { iniciarCheckout, cargarCatalogo, precioMXN } from './checkout';

// ─── Fase 1: Paywall real (editorial adm-*) ──────────────────────────────────
// Dos modos:
//  · SIN ?modulo → suscripción no vigente (vencida/suspendida/cancelada):
//    bloqueo total con CTA de renovación vía Stripe.
//  · CON ?modulo=lealtad|multisucursal|cfdi → upgrade contextual: el plan no
//    incluye ese módulo; ofrece el plan/addon que sí lo trae.

const NOMBRE_MODULO = {
  lealtad: 'Sistema de Lealtad',
  multisucursal: 'Multi-sucursal',
  cfdi: 'Facturación CFDI',
};

export default function PaywallScreen() {
  const { logout, user } = useAuthStore();
  const { suscripcion, estado, vigente } = usePlan();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const modulo = searchParams.get('modulo');

  const [catalogo, setCatalogo] = useState({ planes: [], addons: [] });
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    cargarCatalogo()
      .then(setCatalogo)
      .catch(() => {});
  }, []);

  // Si llegó por módulo pero la suscripción SÍ está vigente, esto es upgrade
  // contextual; si no hay módulo es bloqueo por vigencia.
  const esUpgrade = Boolean(modulo) && vigente;

  // Plan más barato que incluye el módulo; si ninguno, addon disponible.
  const planConModulo = catalogo.planes
    .filter((p) => p.activo && (p.limites?.modulos ?? []).includes(modulo))
    .sort((a, b) => a.precio_anual_centavos - b.precio_anual_centavos)[0];
  const addonDelModulo = catalogo.addons.find((a) => a.id === modulo);

  const handleCheckout = async (planId, addons = []) => {
    setError('');
    setCargando(true);
    try {
      await iniciarCheckout(planId, addons);
    } catch (e) {
      setError(e.message);
      setCargando(false);
    }
  };

  const addonsActuales = Array.isArray(suscripcion?.addons)
    ? suscripcion.addons
    : [];

  return (
    <div className="min-h-screen bg-adm-bg flex items-center justify-center p-6 font-figtree text-adm-ink">
      <div className="bg-adm-panel border border-adm-border rounded-ui w-full max-w-xl p-8 md:p-12 text-center animate-in zoom-in-95 duration-media">
        <div className="w-16 h-16 bg-adm-accent/10 rounded-ui flex items-center justify-center mx-auto mb-6">
          {esUpgrade ? (
            <Sparkles className="w-8 h-8 text-adm-accent" />
          ) : (
            <Lock className="w-8 h-8 text-adm-accent" />
          )}
        </div>

        {esUpgrade ? (
          <>
            <h1 className="font-fraunces text-3xl mb-3">
              {NOMBRE_MODULO[modulo] ?? modulo} no está en tu plan
            </h1>
            <p className="text-adm-muted mb-8 leading-relaxed">
              Tu plan actual no incluye este módulo.
              {planConModulo &&
                ` Está disponible desde el plan ${planConModulo.nombre} (${precioMXN(planConModulo.precio_anual_centavos)}/año más IVA).`}
              {!planConModulo &&
                addonDelModulo?.disponible &&
                ` Agrégalo como add-on por ${precioMXN(addonDelModulo.precio_anual_centavos)}/año más IVA.`}
              {!planConModulo &&
                addonDelModulo &&
                !addonDelModulo.disponible &&
                ' Estará disponible próximamente.'}
            </p>
          </>
        ) : (
          <>
            <h1 className="font-fraunces text-3xl mb-3">
              {estado === 'moroso'
                ? 'Pago pendiente'
                : 'Suscripción no vigente'}
            </h1>
            <p className="text-adm-muted mb-6 leading-relaxed">
              El acceso de{' '}
              <strong className="text-adm-ink">
                {user?.nombre_negocio || 'tu restaurante'}
              </strong>{' '}
              está pausado. Renueva tu anualidad para restablecer el servicio de
              inmediato.
            </p>
            <div className="bg-adm-bg border border-adm-border rounded-ui p-4 mb-8 flex items-start gap-3 text-left">
              <ShieldCheck className="w-5 h-5 text-adm-ok shrink-0 mt-0.5" />
              <p className="text-sm text-adm-muted">
                <strong className="text-adm-ink">
                  Tus datos están a salvo.
                </strong>{' '}
                Inventario, ventas y configuración siguen intactos; nada se
                borra al vencer el plan.
              </p>
            </div>
          </>
        )}

        {error && (
          <div className="flex items-center gap-2 px-4 py-3 bg-adm-danger/5 border border-adm-danger/40 rounded-ui mb-6 text-adm-danger text-sm font-semibold text-left">
            <AlertTriangle className="w-4 h-4 shrink-0" /> {error}
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-3">
          {esUpgrade ? (
            <>
              <button
                onClick={() => navigate(-1)}
                className="flex-1 py-3.5 rounded-ui font-bold text-adm-muted border border-adm-border hover:bg-adm-bg transition-colors"
              >
                Volver
              </button>
              {(planConModulo || addonDelModulo?.disponible) && (
                <button
                  onClick={() =>
                    planConModulo
                      ? handleCheckout(planConModulo.id, addonsActuales)
                      : handleCheckout(suscripcion?.plan ?? 'basico', [
                          ...addonsActuales,
                          modulo,
                        ])
                  }
                  disabled={cargando}
                  className="flex-[2] py-3.5 rounded-ui font-bold bg-adm-accent text-adm-accent-fg hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2 transition-all"
                >
                  <CreditCard className="w-4 h-4" />
                  {cargando
                    ? 'Abriendo Stripe…'
                    : planConModulo
                      ? `Mejorar a ${planConModulo.nombre}`
                      : 'Agregar add-on'}
                  <ArrowRight className="w-4 h-4" />
                </button>
              )}
            </>
          ) : (
            <>
              <button
                onClick={logout}
                className="flex-1 py-3.5 rounded-ui font-bold text-adm-muted border border-adm-border hover:bg-adm-bg transition-colors"
              >
                Cerrar sesión
              </button>
              <button
                onClick={() =>
                  handleCheckout(suscripcion?.plan ?? 'basico', addonsActuales)
                }
                disabled={cargando}
                className="flex-[2] py-3.5 rounded-ui font-bold bg-adm-accent text-adm-accent-fg hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2 transition-all"
              >
                <CreditCard className="w-4 h-4" />
                {cargando ? 'Abriendo Stripe…' : 'Renovar plan'}
                <ArrowRight className="w-4 h-4" />
              </button>
            </>
          )}
        </div>

        <p className="mt-8 pt-6 border-t border-adm-border flex items-center justify-center gap-2 text-[10px] font-bold text-adm-muted uppercase tracking-widest">
          <ShieldCheck className="w-3.5 h-3.5" /> Pagos procesados de forma
          segura por Stripe
        </p>
      </div>
    </div>
  );
}
