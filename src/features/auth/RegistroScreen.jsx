import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Store,
  Mail,
  Eye,
  EyeOff,
  ArrowRight,
  AlertCircle,
  CheckCircle2,
  Copy,
} from 'lucide-react';
import { supabase } from '../../api/supabase';

// ─── Fase 1.6: registro self-service de restaurante ─────────────────────────
// Público. Llama a la EF registrar-restaurante (crea tenant completo + trial
// 14 días) y al terminar muestra el CÓDIGO CORTO del restaurante — la llave
// que el staff usará junto con su PIN en cada dispositivo.

export default function RegistroScreen() {
  const [form, setForm] = useState({
    restaurante: '',
    nombre: '',
    email: '',
    password: '',
    confirmar: '',
  });
  const [showPass, setShowPass] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');
  const [exito, setExito] = useState(null); // { codigo, trial_hasta, plan }
  const [copiado, setCopiado] = useState(false);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (form.password !== form.confirmar) {
      setError('Las contraseñas no coinciden.');
      return;
    }
    setCargando(true);
    try {
      const { data, error: err } = await supabase.functions.invoke(
        'registrar-restaurante',
        {
          body: {
            restaurante: form.restaurante,
            nombre: form.nombre,
            email: form.email,
            password: form.password,
          },
        },
      );
      if (err) {
        let msg = err.message;
        try {
          const ctx = await err.context?.json?.();
          if (ctx?.error) msg = ctx.error;
        } catch {
          /* noop */
        }
        throw new Error(msg);
      }
      if (!data?.ok)
        throw new Error(data?.error || 'No se pudo completar el registro.');

      // ── Correo de confirmación ────────────────────────────────────────────
      // La EF crea la cuenta con la API de administración, que **no manda
      // correos**. El de confirmación se dispara aquí. No bloquea el alta: si
      // falla, el restaurante ya existe y la persona puede operar su trial;
      // solo no podrá contratar hasta confirmar, y desde Billing se le puede
      // reenviar.
      //
      // `emailRedirectTo` apunta al login: al confirmar, la persona aterriza
      // donde ya sabe qué hacer, no en una pantalla en blanco.
      try {
        await supabase.auth.resend({
          type: 'signup',
          email: form.email.trim().toLowerCase(),
          options: { emailRedirectTo: `${window.location.origin}/login` },
        });
      } catch (errCorreo) {
        console.warn(
          '⚠️ [Registro] No se pudo enviar el correo de confirmación:',
          errCorreo?.message,
        );
      }

      setExito(data);
    } catch (e2) {
      setError(e2.message);
    } finally {
      setCargando(false);
    }
  };

  const copiarCodigo = async () => {
    try {
      await navigator.clipboard.writeText(exito.codigo);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      /* noop */
    }
  };

  return (
    <div className="min-h-screen bg-adm-bg flex items-center justify-center p-6 font-figtree text-adm-ink">
      <div className="w-full max-w-md">
        {/* Lockup compacto */}
        <div className="flex items-center justify-center gap-3 mb-8">
          <img
            src="./brand/isotipo-tight.png"
            alt=""
            className="h-12 w-auto object-contain"
            onError={(e) => (e.currentTarget.style.display = 'none')}
          />
          <img
            src="./brand/logotipo-tight.png"
            alt="InvVenta"
            className="h-8 w-auto object-contain"
            onError={(e) => (e.currentTarget.style.display = 'none')}
          />
        </div>

        <div className="bg-adm-panel border border-adm-border rounded-ui p-8">
          {exito ? (
            /* ── Éxito: mostrar el código del restaurante ── */
            <div className="text-center">
              <div className="w-14 h-14 bg-adm-ok/10 rounded-ui flex items-center justify-center mx-auto mb-5">
                <CheckCircle2 className="w-7 h-7 text-adm-ok" />
              </div>
              <h1 className="font-fraunces text-2xl mb-2">
                ¡Restaurante creado!
              </h1>

              {/* PRIMERO lo que bloquea, después lo informativo.
                  Confirmar el correo es obligatorio para entrar, así que va
                  arriba y destacado: si se enterrara debajo del código del
                  restaurante, la persona pulsaría "Iniciar sesión" y se
                  llevaría un error que no sabría interpretar. */}
              <div className="text-left bg-adm-chip text-adm-chip-fg rounded-ui p-4 mb-6">
                <p className="font-bold text-sm mb-1">
                  Te mandamos un correo a {form.email.trim().toLowerCase()}
                </p>
                <p className="text-sm">
                  Ábrelo y pulsa el enlace para activar tu cuenta.{' '}
                  <strong>Sin ese paso no vas a poder entrar.</strong> Si no lo
                  ves en unos minutos, revisa la carpeta de spam.
                </p>
              </div>

              <p className="text-sm text-adm-muted mb-6">
                Tu prueba gratis termina el{' '}
                {new Date(exito.trial_hasta).toLocaleDateString('es-MX', {
                  day: 'numeric',
                  month: 'long',
                })}
                . Este es el código de tu restaurante — tu equipo lo usará junto
                con su PIN:
              </p>
              <button
                onClick={copiarCodigo}
                className="w-full bg-adm-bg border border-adm-border rounded-ui py-4 mb-6 font-fraunces text-3xl tracking-widest tabular-nums flex items-center justify-center gap-3 hover:border-adm-accent transition-colors"
                title="Copiar código"
              >
                {exito.codigo}
                <Copy className="w-4 h-4 text-adm-muted" />
              </button>
              {copiado && (
                <p className="text-xs text-adm-ok font-semibold -mt-4 mb-4">
                  Copiado ✓
                </p>
              )}
              <Link
                to="/login"
                className="w-full py-3.5 bg-adm-accent text-adm-accent-fg rounded-ui font-bold flex items-center justify-center gap-2 hover:opacity-90 transition-all"
              >
                Ya confirmé — iniciar sesión <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          ) : (
            /* ── Formulario ── */
            <>
              <span className="inline-block bg-adm-chip text-adm-chip-fg text-[10px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-ui mb-4">
                Prueba gratis 14 días
              </span>
              <h1 className="font-fraunces text-3xl leading-tight mb-1">
                Crea tu restaurante
              </h1>
              <p className="text-adm-muted text-sm mb-6">
                Sin tarjeta. El plan se contrata al terminar la prueba.
              </p>

              {error && (
                <div className="flex items-start gap-2 px-3 py-2.5 border border-adm-danger/40 bg-adm-danger/5 rounded-ui mb-4">
                  <AlertCircle className="w-4 h-4 text-adm-danger shrink-0 mt-0.5" />
                  <p className="text-adm-danger text-xs font-semibold leading-snug">
                    {error}
                  </p>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-adm-muted uppercase tracking-widest block">
                    Nombre del restaurante
                  </label>
                  <div className="relative">
                    <Store className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-adm-muted" />
                    <input
                      required
                      minLength={3}
                      value={form.restaurante}
                      onChange={set('restaurante')}
                      placeholder="La Cabaña"
                      className="w-full pl-9 pr-4 py-3 bg-adm-bg border border-adm-field focus:border-adm-accent rounded-ui font-medium text-sm placeholder:text-adm-muted/50 outline-none transition-all"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-adm-muted uppercase tracking-widest block">
                    Tu nombre
                  </label>
                  <input
                    required
                    value={form.nombre}
                    onChange={set('nombre')}
                    placeholder="Nombre del administrador"
                    className="w-full px-4 py-3 bg-adm-bg border border-adm-field focus:border-adm-accent rounded-ui font-medium text-sm placeholder:text-adm-muted/50 outline-none transition-all"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-adm-muted uppercase tracking-widest block">
                    Correo electrónico
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-adm-muted" />
                    <input
                      type="email"
                      required
                      autoComplete="email"
                      value={form.email}
                      onChange={set('email')}
                      placeholder="tu@correo.com"
                      className="w-full pl-9 pr-4 py-3 bg-adm-bg border border-adm-field focus:border-adm-accent rounded-ui font-medium text-sm placeholder:text-adm-muted/50 outline-none transition-all"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-adm-muted uppercase tracking-widest block">
                      Contraseña
                    </label>
                    <div className="relative">
                      <input
                        type={showPass ? 'text' : 'password'}
                        required
                        minLength={8}
                        autoComplete="new-password"
                        value={form.password}
                        onChange={set('password')}
                        placeholder="Mínimo 8"
                        className="w-full pl-4 pr-9 py-3 bg-adm-bg border border-adm-field focus:border-adm-accent rounded-ui font-medium text-sm placeholder:text-adm-muted/50 outline-none transition-all"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPass((v) => !v)}
                        tabIndex={-1}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-adm-muted hover:text-adm-ink transition-colors"
                      >
                        {showPass ? (
                          <EyeOff className="w-4 h-4" />
                        ) : (
                          <Eye className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-adm-muted uppercase tracking-widest block">
                      Confirmar
                    </label>
                    <input
                      type={showPass ? 'text' : 'password'}
                      required
                      minLength={8}
                      autoComplete="new-password"
                      value={form.confirmar}
                      onChange={set('confirmar')}
                      placeholder="Repítela"
                      className="w-full px-4 py-3 bg-adm-bg border border-adm-field focus:border-adm-accent rounded-ui font-medium text-sm placeholder:text-adm-muted/50 outline-none transition-all"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={cargando}
                  className="w-full py-3.5 bg-adm-accent text-adm-accent-fg disabled:opacity-50 rounded-ui font-bold flex items-center justify-center gap-2 hover:opacity-90 active:scale-[0.99] transition-all mt-2"
                >
                  {cargando ? (
                    <>
                      <span className="w-4 h-4 border-2 border-adm-accent-fg/30 border-t-adm-accent-fg rounded-full animate-spin" />{' '}
                      Creando…
                    </>
                  ) : (
                    <>
                      Crear restaurante <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </form>

              <p className="text-sm text-adm-muted text-center mt-5">
                ¿Ya tienes cuenta?{' '}
                <Link
                  to="/login"
                  className="font-semibold text-adm-accent hover:opacity-80"
                >
                  Inicia sesión
                </Link>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
