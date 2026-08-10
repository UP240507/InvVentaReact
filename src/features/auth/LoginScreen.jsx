import { useState, useEffect } from 'react';
import { useAuthStore } from './useAuthStore';
import { enTauri } from '../../lib/Hub';
import {
  puertaDelDispositivo,
  estaEmparejado,
  pidioEntrarComoAdmin,
} from '../../lib/Puerta';
import MarcaConmutador from './MarcaConmutador';
import { useNavigate, Navigate } from 'react-router-dom';
import { supabase } from '../../api/supabase';
import { esCorreoSinConfirmar } from '../../lib/Recuperacion';
import {
  Mail,
  ArrowRight,
  Eye,
  EyeOff,
  WifiOff,
  AlertCircle,
  Check,
} from 'lucide-react';

export default function LoginScreen() {
  // ── Admin form
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [remember, setRemember] = useState(false);
  const [adminLoading, setAdminLoading] = useState(false);

  // ── Shared
  const [mounted, setMounted] = useState(false);
  const isOffline = !navigator.onLine;

  const { login, error: authError, isLoading } = useAuthStore();
  const navigate = useNavigate();

  // Cuenta creada pero sin activar. Se deriva del error, no se guarda: si el
  // usuario corrige el correo y reintenta, el estado se recalcula solo.
  const sinConfirmar = esCorreoSinConfirmar({ message: authError });
  const [reenviando, setReenviando] = useState(false);
  const [reenviado, setReenviado] = useState(false);

  const reenviarConfirmacion = async () => {
    setReenviando(true);
    try {
      await supabase.auth.resend({
        type: 'signup',
        email: email.trim().toLowerCase(),
        options: { emailRedirectTo: `${window.location.origin}/login` },
      });
      setReenviado(true);
    } catch (e) {
      console.warn(
        '⚠️ [Login] No se pudo reenviar la confirmación:',
        e?.message,
      );
    } finally {
      setReenviando(false);
    }
  };

  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 60);
    return () => clearTimeout(t);
  }, []);

  // ── Admin submit
  const handleAdminLogin = async (e) => {
    e.preventDefault();
    setAdminLoading(true);
    const ok = await login(email, password);
    setAdminLoading(false);
    if (ok) navigate('/dashboard', { replace: true });
  };

  // ── ¿Este dispositivo debería estar en la otra puerta? ───────────────────
  // Va aquí abajo y no arriba a propósito: un `return` antes de los hooks
  // rompe la regla de que se llamen siempre en el mismo orden, y React lo
  // avisa. La comprobación no es un hook —lee localStorage— así que puede
  // esperar a que todos se hayan registrado.
  // Un teléfono o tablet emparejado con la caja es de operación por
  // construcción: llegó escaneando el QR de `/hub`. Su entrada es
  // `/loginempleados` (código + PIN), no ésta.
  //
  // Se decide en `lib/Puerta.js` y no aquí para que la regla viva en un sitio
  // probable, y `replace` para no dejar esta pantalla en el historial: quien
  // pulse «atrás» debe volver a donde estaba, no rebotar en la redirección.
  const puerta = puertaDelDispositivo({
    enTauri: enTauri(),
    emparejado: estaEmparejado(),
    pidioAdmin: pidioEntrarComoAdmin(),
  });
  if (puerta === 'codigo-pin') {
    return <Navigate to="/loginempleados" replace />;
  }

  return (
    <div
      className={`
      min-h-screen bg-adm-bg flex font-figtree text-adm-ink
      transition-opacity duration-lenta ${mounted ? 'opacity-100' : 'opacity-0'}
    `}
    >
      {/* ─── RAIL IZQUIERDO — lockup de marca, navy editorial ───────────── */}
      <aside
        className={`
        hidden lg:flex flex-col items-center justify-center w-[360px] shrink-0
        bg-adm-sidebar text-adm-sidebar-fg p-10
        transition-all duration-lenta ease-out
        ${mounted ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-4'}
      `}
      >
        {/* Lockup: isotipo + wordmark como UNA sola unidad (assets tight, sin
            colchón). Y además la puerta al acceso de personal — ver
            `MarcaConmutador`: el logo cambia de pantalla para no tener que
            poner un enlace de texto permanente en la primera pantalla que ve
            alguien cada día. */}
        <MarcaConmutador
          hacia="personal"
          className="flex flex-col items-center gap-6"
        >
          <img
            src="./brand/isotipo-tight.png"
            alt=""
            className="w-52 h-auto object-contain drop-shadow-2xl"
            onError={(e) => {
              e.currentTarget.style.display = 'none';
            }}
          />
          <img
            src="./brand/logotipo-tight.png"
            alt="InvVenta"
            className="w-60 h-auto object-contain"
            onError={(e) => {
              e.currentTarget.style.display = 'none';
              e.currentTarget.parentNode.insertAdjacentHTML(
                'beforeend',
                '<span style="font-family:Fraunces,serif;font-weight:600;font-size:2rem;">InvVenta</span>',
              );
            }}
          />
        </MarcaConmutador>
      </aside>

      {/* ─── ÁREA PRINCIPAL — crema editorial ───────────────────────────── */}
      <main className="flex-1 flex flex-col">
        {/* Header móvil (cuando el rail está oculto): lockup horizontal compacto */}
        {/* En teléfono el riel está oculto, así que la puerta tiene que estar
            también aquí: si no, un dispositivo estrecho se quedaría sin ella. */}
        <header className="lg:hidden flex items-center justify-center pt-8">
          <MarcaConmutador
            hacia="personal"
            className="flex items-center justify-center gap-3"
          >
            <img
              src="./brand/isotipo-tight.png"
              alt=""
              className="h-12 w-auto object-contain"
              onError={(e) => {
                e.currentTarget.style.display = 'none';
              }}
            />
            <img
              src="./brand/logotipo-tight.png"
              alt="InvVenta"
              className="h-8 w-auto object-contain"
              onError={(e) => {
                e.currentTarget.style.display = 'none';
              }}
            />
          </MarcaConmutador>
        </header>

        {/* Banner offline */}
        {isOffline && (
          <div className="mx-auto mt-6 flex items-center gap-2 px-4 py-2 bg-adm-chip border border-adm-border rounded-ui">
            <WifiOff className="w-3.5 h-3.5 text-adm-chip-fg" />
            <span className="text-adm-chip-fg text-[11px] font-bold uppercase tracking-widest">
              Sin conexión — modo offline
            </span>
          </div>
        )}

        <div className="flex-1 flex flex-wrap items-center justify-center content-center gap-8 px-8 py-10">
          {/* ── CARD Admin ─────────────────────────────────────────────── */}
          <section
            className={`
            w-full max-w-[380px] bg-adm-panel border border-adm-border rounded-ui
            p-8 shadow-sm
            transition-all duration-lenta ease-out
            ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}
          `}
          >
            <span className="inline-block bg-adm-chip text-adm-chip-fg text-[10px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-ui mb-5">
              Administrador
            </span>

            <h2 className="font-fraunces text-3xl leading-tight mb-1">
              Acceso administrativo
            </h2>
            <p className="text-adm-muted text-sm mb-6">
              Gestión completa del sistema
            </p>

            {/* Error auth.
                El caso "correo sin confirmar" se trata aparte porque es el
                ÚNICO que no se arregla reintentando: la contraseña era buena y
                lo que falta es abrir un correo. Mostrarlo como error genérico
                manda a la persona a probar contraseñas que sí eran correctas. */}
            {authError && !adminLoading && !sinConfirmar && (
              <div className="flex items-start gap-2 px-3 py-2.5 border border-adm-danger/40 bg-adm-danger/5 rounded-ui mb-4">
                <AlertCircle className="w-4 h-4 text-adm-danger shrink-0 mt-0.5" />
                <p className="text-adm-danger text-xs font-semibold leading-snug">
                  {authError === 'Invalid login credentials'
                    ? 'Correo o contraseña incorrectos.'
                    : authError}
                </p>
              </div>
            )}

            {sinConfirmar && !adminLoading && (
              <div className="px-3 py-2.5 border border-adm-border bg-adm-chip/40 rounded-ui mb-4">
                <p className="text-xs font-semibold leading-snug mb-2">
                  Falta activar tu cuenta. Te mandamos un correo cuando te
                  registraste: ábrelo y pulsa el enlace.
                </p>
                <button
                  type="button"
                  onClick={reenviarConfirmacion}
                  disabled={reenviando}
                  className="text-xs font-bold text-adm-accent hover:opacity-80 disabled:opacity-50"
                >
                  {reenviando
                    ? 'Enviando…'
                    : reenviado
                      ? 'Enviado ✓ — revisa también el spam'
                      : 'No me llegó, reenviar'}
                </button>
              </div>
            )}

            <form onSubmit={handleAdminLogin} className="space-y-4">
              {/* Email */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-adm-muted uppercase tracking-widest block">
                  Correo electrónico
                </label>
                <div className="relative group">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-adm-muted group-focus-within:text-adm-accent transition-colors" />
                  <input
                    type="email"
                    required
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="admin@inventa.com"
                    className="w-full pl-9 pr-4 py-3 bg-adm-bg border border-adm-field focus:border-adm-accent rounded-ui font-medium text-adm-ink text-sm placeholder:text-adm-muted/50 outline-none transition-all"
                  />
                </div>
              </div>

              {/* Password */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-adm-muted uppercase tracking-widest block">
                  Contraseña
                </label>
                <div className="relative">
                  <input
                    type={showPass ? 'text' : 'password'}
                    required
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full pl-4 pr-10 py-3 bg-adm-bg border border-adm-field focus:border-adm-accent rounded-ui font-medium text-adm-ink text-sm placeholder:text-adm-muted/50 outline-none transition-all"
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

              {/* Recordarme + Olvidé */}
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 cursor-pointer group">
                  <div
                    onClick={() => setRemember((v) => !v)}
                    className={`w-4 h-4 rounded-ui border flex items-center justify-center transition-all ${remember ? 'bg-adm-accent border-adm-accent' : 'border-adm-border group-hover:border-adm-muted'}`}
                  >
                    {remember && (
                      <Check className="w-3 h-3 text-adm-accent-fg" />
                    )}
                  </div>
                  <span className="text-xs font-semibold text-adm-muted">
                    Recordarme
                  </span>
                </label>
                <div className="flex items-center gap-3">
                  {/* Restaurado: se había quitado en la fase 1 porque el flujo
                      de recuperación no existía todavía. Ya existe. */}
                  <button
                    type="button"
                    onClick={() => navigate('/recuperar')}
                    className="text-xs font-semibold text-adm-muted hover:text-adm-ink transition-colors"
                  >
                    ¿Olvidaste tu contraseña?
                  </button>
                  <span aria-hidden="true" className="text-adm-border">
                    ·
                  </span>
                  <button
                    type="button"
                    onClick={() => navigate('/registro')}
                    className="text-xs font-semibold text-adm-accent hover:opacity-80 transition-opacity"
                  >
                    Crear restaurante
                  </button>
                </div>
              </div>

              {/* Submit */}
              <button
                type="submit"
                disabled={adminLoading || isLoading}
                className="w-full py-3.5 bg-adm-accent text-adm-accent-fg disabled:opacity-50 disabled:cursor-not-allowed rounded-ui font-bold flex items-center justify-center gap-2 transition-all hover:opacity-90 active:scale-[0.99] mt-2"
              >
                {adminLoading || isLoading ? (
                  <>
                    <span className="w-4 h-4 border-2 border-adm-accent-fg/30 border-t-adm-accent-fg rounded-full animate-spin" />{' '}
                    Verificando...
                  </>
                ) : (
                  <>
                    Entrar al panel <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>
          </section>

          {/* ── LA TARJETA DE PIN SE QUITÓ (6-ago) ──────────────────────
              Ofrecía al mesero la puerta que NO funciona. Navegaba a
              `/checador`, que busca el PIN contra `staff` del store, y `staff`
              sólo está poblado si YA hay sesión en el dispositivo —lo trae
              `fetchInitialData` bajo RLS—. En un teléfono recién emparejado
              está vacío, así que el PIN correcto no encontraba a nadie.

              La entrada que sí sirve es `/loginempleados`: se autentica de
              verdad contra Supabase con el código del restaurante. Ahí van
              ahora los dispositivos emparejados, y solos (ver `lib/Puerta.js`).

              Aquí no queda enlace a esa pantalla a propósito: quien llegue a
              este login con un dispositivo de staff ya habrá sido redirigido
              antes de verlo. Un enlace más sería ruido para el dueño, que es
              el único que se queda mirando esta pantalla. */}
        </div>

        {/* Footer */}
        <footer className="text-center py-5">
          <p className="text-[10px] font-semibold text-adm-muted/60 uppercase tracking-widest">
            © {new Date().getFullYear()} InvVenta · Todos los derechos
            reservados
          </p>
        </footer>
      </main>
    </div>
  );
}
