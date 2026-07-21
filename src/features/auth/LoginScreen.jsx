import { useState, useEffect, useCallback } from 'react';
import { useAuthStore } from './useAuthStore';
import { useNavigate } from 'react-router-dom';
import { Mail, ArrowRight, Eye, EyeOff, Delete, WifiOff, AlertCircle, Check } from 'lucide-react';

// PIN: altas nuevas son de 6 dígitos; PINs legados de 4-5 se toleran
// (mismo contrato que RelojChecadorScreen / EmpleadosScreen).
const PIN_MIN = 4;
const PIN_MAX = 6;

// ─── PIN DISPLAY ─────────────────────────────────────────────────────────────
function PinDots({ length, filled }) {
  return (
    <div className="flex items-center justify-center gap-2.5 py-2">
      {Array.from({ length }).map((_, i) => (
        <div
          key={i}
          className={`
            w-10 h-11 rounded-adm border flex items-center justify-center
            transition-all duration-200
            ${i < filled
              ? 'bg-adm-accent/10 border-adm-accent'
              : 'bg-adm-bg border-adm-border'
            }
          `}
        >
          {i < filled && (
            <div className="w-2 h-2 rounded-full bg-adm-accent" />
          )}
        </div>
      ))}
    </div>
  );
}

// ─── TECLA NUMPAD ────────────────────────────────────────────────────────────
function NumKey({ value, onClick, children, className = '' }) {
  return (
    <button
      type="button"
      onClick={() => onClick(value)}
      className={`
        h-12 rounded-adm font-semibold text-lg tabular-nums
        transition-all duration-150 active:scale-95 select-none
        ${className}
      `}
    >
      {children ?? value}
    </button>
  );
}

export default function LoginScreen() {
  // ── Admin form
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [remember, setRemember] = useState(false);
  const [adminLoading, setAdminLoading] = useState(false);

  // ── PIN form
  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState('');

  // ── Shared
  const [mounted, setMounted] = useState(false);
  const isOffline = !navigator.onLine;

  const { login, error: authError, isLoading } = useAuthStore();
  const navigate = useNavigate();

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

  // ── PIN logic
  const handlePinSubmitWith = useCallback((valor) => {
    if (valor.length < PIN_MIN) {
      setPinError(`El PIN tiene entre ${PIN_MIN} y ${PIN_MAX} dígitos.`);
      return;
    }
    // Delega al RelojChecadorScreen para registrar asistencia + abrir sesión de empleado
    navigate(`/checador?pin=${valor}`);
    setPin('');
  }, [navigate]);

  const handlePinKey = useCallback((val) => {
    setPinError('');
    setPin(prev => {
      if (prev.length >= PIN_MAX) return prev;
      const next = prev + val;
      // Auto-submit al completar los 6: un tap menos en el flujo más común
      if (next.length === PIN_MAX) {
        setTimeout(() => handlePinSubmitWith(next), 120);
      }
      return next;
    });
  }, [handlePinSubmitWith]);

  const handlePinDelete = useCallback(() => {
    setPinError('');
    setPin(prev => prev.slice(0, -1));
  }, []);

  const handlePinSubmit = useCallback(() => handlePinSubmitWith(pin), [pin, handlePinSubmitWith]);

  // Teclado físico opera el PIN (Tauri: teclado es primera clase)
  useEffect(() => {
    const onKey = (e) => {
      if (document.activeElement?.tagName === 'INPUT') return;
      if (e.key >= '0' && e.key <= '9') handlePinKey(e.key);
      if (e.key === 'Backspace') handlePinDelete();
      if (e.key === 'Enter') handlePinSubmit();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handlePinKey, handlePinDelete, handlePinSubmit]);

  return (
    <div className={`
      min-h-screen bg-adm-bg flex font-figtree text-adm-ink
      transition-opacity duration-500 ${mounted ? 'opacity-100' : 'opacity-0'}
    `}>

      {/* ─── RAIL IZQUIERDO — lockup de marca, navy editorial ───────────── */}
      <aside className={`
        hidden lg:flex flex-col items-center justify-center w-[360px] shrink-0
        bg-adm-sidebar text-adm-sidebar-fg p-10
        transition-all duration-700 ease-out
        ${mounted ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-4'}
      `}>
        {/* Lockup: isotipo + wordmark como UNA sola unidad (assets tight, sin colchón) */}
        <div className="flex flex-col items-center gap-6">
          <img
            src="./brand/isotipo-tight.png"
            alt=""
            className="w-52 h-auto object-contain drop-shadow-2xl"
            onError={e => { e.currentTarget.style.display = 'none'; }}
          />
          <img
            src="./brand/logotipo-tight.png"
            alt="InvVenta"
            className="w-60 h-auto object-contain"
            onError={e => {
              e.currentTarget.style.display = 'none';
              e.currentTarget.parentNode.insertAdjacentHTML(
                'beforeend',
                '<span style="font-family:Fraunces,serif;font-weight:600;font-size:2rem;">InvVenta</span>',
              );
            }}
          />
        </div>
      </aside>

      {/* ─── ÁREA PRINCIPAL — crema editorial ───────────────────────────── */}
      <main className="flex-1 flex flex-col">

        {/* Header móvil (cuando el rail está oculto): lockup horizontal compacto */}
        <header className="lg:hidden flex items-center justify-center gap-3 pt-8">
          <img
            src="./brand/isotipo-tight.png"
            alt=""
            className="h-12 w-auto object-contain"
            onError={e => { e.currentTarget.style.display = 'none'; }}
          />
          <img
            src="./brand/logotipo-tight.png"
            alt="InvVenta"
            className="h-8 w-auto object-contain"
            onError={e => { e.currentTarget.style.display = 'none'; }}
          />
        </header>

        {/* Banner offline */}
        {isOffline && (
          <div className="mx-auto mt-6 flex items-center gap-2 px-4 py-2 bg-adm-chip border border-adm-border rounded-adm">
            <WifiOff className="w-3.5 h-3.5 text-adm-chip-fg" />
            <span className="text-adm-chip-fg text-[11px] font-bold uppercase tracking-widest">
              Sin conexión — modo offline
            </span>
          </div>
        )}

        <div className="flex-1 flex flex-wrap items-center justify-center content-center gap-8 px-8 py-10">

          {/* ── CARD Admin ─────────────────────────────────────────────── */}
          <section className={`
            w-full max-w-[380px] bg-adm-panel border border-adm-border rounded-adm
            p-8 shadow-sm
            transition-all duration-700 ease-out
            ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}
          `}>
            <span className="inline-block bg-adm-chip text-adm-chip-fg text-[10px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-adm mb-5">
              Administrador
            </span>

            <h2 className="font-fraunces text-3xl leading-tight mb-1">
              Acceso administrativo
            </h2>
            <p className="text-adm-muted text-sm mb-6">Gestión completa del sistema</p>

            {/* Error auth */}
            {authError && !adminLoading && (
              <div className="flex items-start gap-2 px-3 py-2.5 border border-adm-danger/40 bg-adm-danger/5 rounded-adm mb-4">
                <AlertCircle className="w-4 h-4 text-adm-danger shrink-0 mt-0.5" />
                <p className="text-adm-danger text-xs font-semibold leading-snug">
                  {authError === 'Invalid login credentials'
                    ? 'Correo o contraseña incorrectos.'
                    : authError}
                </p>
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
                    type="email" required autoComplete="email"
                    value={email} onChange={e => setEmail(e.target.value)}
                    placeholder="admin@inventa.com"
                    className="w-full pl-9 pr-4 py-3 bg-adm-bg border border-adm-border focus:border-adm-accent rounded-adm font-medium text-adm-ink text-sm placeholder:text-adm-muted/50 outline-none transition-all"
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
                    type={showPass ? 'text' : 'password'} required autoComplete="current-password"
                    value={password} onChange={e => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full pl-4 pr-10 py-3 bg-adm-bg border border-adm-border focus:border-adm-accent rounded-adm font-medium text-adm-ink text-sm placeholder:text-adm-muted/50 outline-none transition-all"
                  />
                  <button type="button" onClick={() => setShowPass(v => !v)} tabIndex={-1}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-adm-muted hover:text-adm-ink transition-colors">
                    {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Recordarme + Olvidé */}
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 cursor-pointer group">
                  <div
                    onClick={() => setRemember(v => !v)}
                    className={`w-4 h-4 rounded-adm border flex items-center justify-center transition-all ${remember ? 'bg-adm-accent border-adm-accent' : 'border-adm-border group-hover:border-adm-muted'}`}
                  >
                    {remember && <Check className="w-3 h-3 text-adm-accent-fg" />}
                  </div>
                  <span className="text-xs font-semibold text-adm-muted">Recordarme</span>
                </label>
                <button type="button" className="text-xs font-semibold text-adm-accent hover:opacity-80 transition-opacity">
                  ¿Olvidaste tu contraseña?
                </button>
              </div>

              {/* Submit */}
              <button
                type="submit" disabled={adminLoading || isLoading}
                className="w-full py-3.5 bg-adm-accent text-adm-accent-fg disabled:opacity-50 disabled:cursor-not-allowed rounded-adm font-bold flex items-center justify-center gap-2 transition-all hover:opacity-90 active:scale-[0.99] mt-2"
              >
                {(adminLoading || isLoading) ? (
                  <><span className="w-4 h-4 border-2 border-adm-accent-fg/30 border-t-adm-accent-fg rounded-full animate-spin" /> Verificando...</>
                ) : (
                  <>Entrar al panel <ArrowRight className="w-4 h-4" /></>
                )}
              </button>
            </form>
          </section>

          {/* ── CARD Empleado PIN ──────────────────────────────────────── */}
          <section className={`
            w-full max-w-[380px] bg-adm-panel border border-adm-border rounded-adm
            p-8 shadow-sm
            transition-all duration-700 ease-out delay-150
            ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}
          `}>
            <span className="inline-block bg-adm-ok/10 text-adm-ok text-[10px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-adm mb-5">
              Empleado
            </span>

            <h2 className="font-fraunces text-3xl leading-tight mb-1">
              Acceso operativo
            </h2>
            <p className="text-adm-muted text-sm mb-6">Inicia tu turno con tu PIN</p>

            {/* PIN display */}
            <div className="mb-2">
              <p className="text-[10px] font-bold text-adm-muted uppercase tracking-widest text-center mb-3">
                PIN de {PIN_MAX} dígitos
              </p>
              <PinDots length={PIN_MAX} filled={pin.length} />
            </div>

            {/* Error PIN */}
            {pinError && (
              <p className="text-adm-danger text-xs font-semibold text-center mb-2">
                {pinError}
              </p>
            )}

            {/* Numpad */}
            <div className="grid grid-cols-3 gap-2 mt-4">
              {['1','2','3','4','5','6','7','8','9'].map(n => (
                <NumKey
                  key={n} value={n} onClick={handlePinKey}
                  className="bg-adm-bg hover:bg-adm-chip text-adm-ink border border-adm-border"
                />
              ))}
              {/* Fila final: borrar / 0 / confirmar */}
              <NumKey
                value="del" onClick={handlePinDelete}
                className="bg-adm-bg hover:bg-adm-danger/10 text-adm-ink border border-adm-border"
              >
                <Delete className="w-5 h-5 mx-auto" />
              </NumKey>
              <NumKey
                value="0" onClick={handlePinKey}
                className="bg-adm-bg hover:bg-adm-chip text-adm-ink border border-adm-border"
              />
              <NumKey
                value="ok" onClick={handlePinSubmit}
                className={`
                  flex items-center justify-center
                  ${pin.length >= PIN_MIN
                    ? 'bg-adm-accent text-adm-accent-fg hover:opacity-90'
                    : 'bg-adm-chip text-adm-muted cursor-not-allowed'
                  }
                `}
              >
                <ArrowRight className="w-5 h-5 mx-auto" />
              </NumKey>
            </div>

            <p className="text-[11px] text-adm-muted text-center mt-4">
              También puedes usar el teclado numérico · Enter confirma
            </p>
          </section>
        </div>

        {/* Footer */}
        <footer className="text-center py-5">
          <p className="text-[10px] font-semibold text-adm-muted/60 uppercase tracking-widest">
            © {new Date().getFullYear()} InvVenta · Todos los derechos reservados
          </p>
        </footer>
      </main>
    </div>
  );
}
