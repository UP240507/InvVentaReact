import { CreditCard, Lock, AlertTriangle, ArrowRight, ShieldCheck } from 'lucide-react';
import { useAuthStore } from '../auth/useAuthStore';

export default function PaywallScreen() {
  const { logout } = useAuthStore();

  const handlePortalPago = () => {
    // Aquí conectarías con el portal de Stripe (Customer Portal)
    alert('Redirigiendo al portal seguro de Stripe...');
  };

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-ui-obsidiana flex items-center justify-center p-6 transition-colors duration-500 relative overflow-hidden">
      
      {/* Patrón de fondo y luces */}
      <div className="absolute inset-0 opacity-20 dark:opacity-10 pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, currentColor 1px, transparent 0)', backgroundSize: '32px 32px' }}></div>
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-rose-500/10 dark:bg-rose-500/5 blur-[120px] rounded-full pointer-events-none"></div>

      <div className="bg-white/90 dark:bg-ui-humo/90 backdrop-blur-2xl rounded-[3rem] w-full max-w-2xl shadow-2xl p-10 md:p-14 relative z-10 border-2 border-slate-100 dark:border-ui-border text-center animate-in zoom-in-95 duration-500 transition-colors">
        
        <div className="w-24 h-24 bg-rose-50 dark:bg-brand-arrecife/10 rounded-[2rem] flex items-center justify-center mx-auto mb-8 shadow-inner border border-rose-100 dark:border-brand-arrecife/20">
          <Lock className="w-12 h-12 text-rose-500 dark:text-brand-arrecife" />
        </div>

        <h1 className="text-4xl font-black font-syne text-slate-900 dark:text-brand-nacar mb-4 tracking-tight">Suscripción Suspendida</h1>
        
        <p className="text-lg text-slate-600 dark:text-ui-muted font-medium mb-10 leading-relaxed">
          El acceso al ERP de <strong className="text-slate-900 dark:text-brand-nacar">AZUL Restaurante</strong> ha sido bloqueado temporalmente debido a un problema con el pago de tu suscripción.
        </p>

        <div className="bg-slate-50 dark:bg-ui-obsidiana p-6 rounded-3xl border border-slate-200 dark:border-ui-border mb-10 flex items-start gap-4 text-left transition-colors">
          <AlertTriangle className="w-6 h-6 text-amber-500 shrink-0 mt-0.5" />
          <div>
            <h3 className="font-black text-slate-800 dark:text-brand-nacar">Tus datos están a salvo</h3>
            <p className="text-sm font-medium text-slate-500 dark:text-ui-muted mt-1">
              Tu inventario, ventas y configuraciones no se han borrado. Actualiza tu método de pago para restablecer el servicio inmediatamente.
            </p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-4">
          <button 
            onClick={logout}
            className="flex-1 py-5 rounded-2xl font-black text-slate-500 dark:text-ui-muted bg-transparent border-2 border-slate-200 dark:border-ui-border hover:bg-slate-50 dark:hover:bg-ui-obsidiana transition-all"
          >
            Cerrar Sesión
          </button>
          <button 
            onClick={handlePortalPago}
            className="flex-[2] py-5 rounded-2xl font-black text-white dark:text-ui-obsidiana bg-rose-500 hover:bg-rose-600 dark:bg-brand-arrecife dark:hover:bg-orange-600 shadow-xl shadow-rose-500/30 flex items-center justify-center gap-3 transition-transform active:scale-95"
          >
            <CreditCard className="w-5 h-5" /> Actualizar Pago <ArrowRight className="w-5 h-5" />
          </button>
        </div>

        <div className="mt-8 pt-8 border-t border-slate-100 dark:border-ui-border flex items-center justify-center gap-2 text-xs font-bold text-slate-400 dark:text-ui-muted uppercase tracking-widest">
          <ShieldCheck className="w-4 h-4" /> Pagos procesados de forma segura
        </div>
      </div>
    </div>
  );
}