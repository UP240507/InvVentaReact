import { CreditCard, ShieldCheck, CheckCircle2, AlertTriangle, ExternalLink, Infinity } from 'lucide-react';
import { useAuthStore } from '../auth/useAuthStore';

export default function BillingScreen() {
  const { user, suscripcion } = useAuthStore();

  const planVigente = suscripcion !== null;

  // 🌟 Mapeo dinámico de los datos reales de Supabase
  const datosPlan = {
    plan: suscripcion?.plan_nombre || 'Plan Básico',
    precio: suscripcion?.precio_mensual || 0,
    estado: planVigente ? 'Activa' : 'Suspendida',
    proximo_cobro: suscripcion?.fecha_vencimiento || 'Vencido',
    tarjeta_terminacion: suscripcion?.tarjeta_terminacion || '----'
  };

  const handlePortalPago = () => {
    // Aquí conectarías con el portal de Stripe (Stripe Customer Portal)
    alert('Abriendo portal de Stripe para cambiar tarjeta o descargar facturas...');
  };

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto h-full animate-in fade-in duration-500 transition-colors">
      
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-black text-slate-900 dark:text-brand-nacar tracking-tight flex items-center gap-3">
            <CreditCard className="w-8 h-8 text-brand-arrecife" /> Facturación y Plan
          </h1>
          <p className="text-sm font-bold text-slate-500 dark:text-ui-muted mt-1 uppercase tracking-widest">
            {user?.nombre_negocio || 'Restaurante'} - Gestión de suscripción
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* TARJETA DEL PLAN */}
        <div className="lg:col-span-2 bg-white dark:bg-ui-humo rounded-[3rem] p-8 border-2 border-slate-100 dark:border-ui-border shadow-sm flex flex-col transition-colors">
          <div className="flex justify-between items-start mb-8">
            <div>
              <p className="text-[10px] font-black text-slate-400 dark:text-ui-muted uppercase tracking-widest mb-2">Plan Actual</p>
              <h2 className="text-4xl font-black font-syne text-slate-900 dark:text-brand-nacar">{datosPlan.plan}</h2>
            </div>
            <span className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest border-2 ${
              planVigente 
                ? 'bg-emerald-50 text-emerald-600 border-emerald-200 dark:bg-brand-cesped/10 dark:text-brand-cesped dark:border-brand-cesped/30' 
                : 'bg-rose-50 text-rose-600 border-rose-200 dark:bg-brand-arrecife/10 dark:text-brand-arrecife dark:border-brand-arrecife/30'
            }`}>
              {datosPlan.estado}
            </span>
          </div>

          <div className="space-y-4 mb-10">
            <div className="flex items-center gap-3 text-slate-600 dark:text-brand-nacar font-bold">
              <CheckCircle2 className="w-5 h-5 text-emerald-500 dark:text-brand-cesped" /> Usuarios operativos ilimitados
            </div>
            <div className="flex items-center gap-3 text-slate-600 dark:text-brand-nacar font-bold">
              <CheckCircle2 className="w-5 h-5 text-emerald-500 dark:text-brand-cesped" /> Soporte técnico prioritario
            </div>
            <div className="flex items-center gap-3 text-slate-600 dark:text-brand-nacar font-bold">
              <CheckCircle2 className="w-5 h-5 text-emerald-500 dark:text-brand-cesped" /> Almacenamiento en la nube (AWS/Supabase)
            </div>
          </div>

          <div className="mt-auto bg-slate-50 dark:bg-ui-obsidiana p-6 rounded-3xl border border-slate-200 dark:border-ui-border flex flex-col sm:flex-row justify-between items-center gap-4 transition-colors">
            {planVigente ? (
              <div>
                <p className="text-[10px] font-black text-slate-400 dark:text-ui-muted uppercase tracking-widest">Siguiente Cargo</p>
                <p className="text-xl font-black text-slate-900 dark:text-brand-nacar">${datosPlan.precio} MXN <span className="text-sm text-slate-500 dark:text-ui-muted">/ mes</span></p>
                <p className="text-xs font-bold text-slate-500 dark:text-ui-muted mt-1">
                  Vencimiento: {new Date(datosPlan.proximo_cobro).toLocaleDateString('es-MX', { year: 'numeric', month: 'long', day: 'numeric' })}
                </p>
              </div>
            ) : (
              <div>
                <p className="text-[10px] font-black text-rose-500 dark:text-brand-arrecife uppercase tracking-widest">Servicio Suspendido</p>
                <p className="text-xl font-black text-slate-900 dark:text-brand-nacar">Renueva tu plan</p>
                <p className="text-xs font-bold text-slate-500 dark:text-ui-muted mt-1">Para reactivar la operación de tu ERP</p>
              </div>
            )}
            <button onClick={handlePortalPago} className="w-full sm:w-auto bg-slate-900 dark:bg-brand-arrecife hover:bg-slate-800 dark:hover:bg-orange-600 text-white dark:text-ui-obsidiana px-8 py-4 rounded-2xl font-black shadow-lg shadow-slate-900/20 dark:shadow-brand-arrecife/30 transition-transform active:scale-95 flex items-center justify-center gap-2">
              Administrar Plan <ExternalLink className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* MÉTODO DE PAGO */}
        <div className="bg-slate-900 dark:bg-ui-obsidiana rounded-[3rem] p-8 shadow-xl border border-slate-800 dark:border-ui-border text-white dark:text-brand-nacar flex flex-col transition-colors">
          <h3 className="font-black text-slate-400 dark:text-ui-muted uppercase tracking-widest text-xs mb-8 flex items-center gap-2">
            <CreditCard className="w-4 h-4" /> Método de Pago
          </h3>

          <div className="bg-gradient-to-br from-slate-800 to-slate-700 dark:from-ui-humo dark:to-ui-obsidiana p-6 rounded-2xl shadow-inner border border-slate-600 dark:border-ui-border mb-8">
            <div className="flex justify-between items-center mb-6">
              <ShieldCheck className="w-8 h-8 text-emerald-400 dark:text-brand-cesped" />
              <span className="font-black italic text-xl">TARJETA</span>
            </div>
            <p className="font-mono text-xl tracking-[0.2em] mb-2">**** **** **** {datosPlan.tarjeta_terminacion}</p>
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-ui-muted">Método asociado a Stripe</p>
          </div>

          <button onClick={handlePortalPago} className="mt-auto w-full bg-white dark:bg-ui-humo text-slate-900 dark:text-brand-nacar hover:bg-slate-100 dark:hover:bg-ui-border py-4 rounded-2xl font-black transition-colors">
            Actualizar Tarjeta
          </button>
          <button onClick={handlePortalPago} className="w-full mt-3 text-slate-400 dark:text-ui-muted hover:text-white dark:hover:text-brand-nacar font-bold py-3 text-sm transition-colors">
            Descargar Facturas CFDI
          </button>
        </div>

      </div>
    </div>
  );
}