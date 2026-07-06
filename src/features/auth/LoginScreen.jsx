import { useState, useEffect, useCallback } from 'react';
import { useAuthStore } from './useAuthStore';
import { useNavigate } from 'react-router-dom';
import { Mail, ArrowRight, Eye, EyeOff, Delete, WifiOff, AlertCircle, CheckCircle } from 'lucide-react';

// ─── PIN DISPLAY ─────────────────────────────────────────────────────────────
function PinDots({ length, filled }) {
  return (
    <div className="flex items-center justify-center gap-4 py-2">
      {Array.from({ length }).map((_, i) => (
        <div
          key={i}
          className={`
            w-14 h-14 rounded-2xl border-2 flex items-center justify-center
            transition-all duration-200
            ${i < filled
              ? 'bg-brand-cesped/20 border-brand-cesped shadow-lg shadow-brand-cesped/20'
              : 'bg-ui-obsidiana/40 border-ui-border'
            }
          `}
        >
          {i < filled && (
            <div className="w-3 h-3 rounded-full bg-brand-cesped" />
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
        h-14 rounded-2xl font-black text-xl
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
  const [pinOk, setPinOk]       = useState(false);

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
  const handlePinKey = useCallback((val) => {
    setPinError('');
    setPin(prev => prev.length < 4 ? prev + val : prev);
  }, []);

  const handlePinDelete = useCallback(() => {
    setPinError('');
    setPin(prev => prev.slice(0, -1));
  }, []);

  const handlePinSubmit = useCallback(async () => {
    if (pin.length < 4) {
      setPinError('Ingresa los 4 dígitos.');
      return;
    }
    // Delega al RelojChecadorScreen para registrar asistencia + abrir sesión de empleado
    // Aquí solo navegamos al checador con el PIN pre-cargado via query param
    navigate(`/checador?pin=${pin}`);
    setPin('');
  }, [pin, navigate]);

  // Enter físico del teclado dispara submit del PIN
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
      min-h-screen bg-ui-obsidiana flex flex-col overflow-hidden font-sans
      transition-opacity duration-500 ${mounted ? 'opacity-100' : 'opacity-0'}
    `}>

      {/* ── HEADER — Logo centrado ── */}
      <header className="flex flex-col items-center pt-10 pb-2 relative z-10">
        <img
          src="./brand/Logotipo.png"
          alt="InvVenta"
          className="h-[120px] w-auto object-contain"
          style={{ filter: 'brightness(0) invert(1)' }}
          onError={e => {
            e.currentTarget.style.display = 'none';
            const fb = e.currentTarget.parentNode;
            fb.innerHTML = '<span style="font-family:Syne,sans-serif;font-weight:900;font-size:1.75rem;color:#F0EAD6;">Inv<span style=\'color:#FF5F40\'>Venta</span></span><p style="font-size:0.75rem;color:#6B7A8D;font-weight:700;margin-top:2px;">Sistema de Gestión Gastronómica</p>';
          }}
        />
        <p className="text-ui-muted text-sm font-bold mt-1">Sistema de Gestión Gastronómica</p>
      </header>

      {/* ── BANNER OFFLINE ── */}
      {isOffline && (
        <div className="mx-auto mt-3 flex items-center gap-2 px-4 py-2 bg-brand-ambar/10 border border-brand-ambar/30 rounded-xl z-10">
          <WifiOff className="w-3.5 h-3.5 text-brand-ambar" />
          <span className="text-brand-ambar text-xs font-black uppercase tracking-widest">Sin conexión — modo offline</span>
        </div>
      )}

      {/* ── LAYOUT PRINCIPAL: 3 columnas ── */}
      <main className="flex-1 flex items-center justify-center gap-8 px-8 py-8 relative">

        {/* Orbe de fondo centrado */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-[500px] h-[500px] rounded-full bg-brand-arrecife/8 blur-[120px]" />
        </div>

        {/* ─── CARD IZQUIERDA — Admin ─────────────────────────────────────── */}
        <div className={`
          w-full max-w-[380px] bg-ui-humo border-2 border-ui-border rounded-[2rem]
          p-8 shadow-2xl shadow-black/40 relative z-10
          transition-all duration-700 ease-out
          ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'}
        `}>
          {/* Badge */}
          <span className="inline-block bg-brand-arrecife text-white text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-full mb-5">
            Administrador
          </span>

          <h2 className="text-3xl font-black text-brand-nacar font-syne leading-tight mb-1">
            Acceso<br />Administrativo
          </h2>
          <p className="text-ui-muted text-sm font-bold mb-6">Gestión completa del sistema</p>

          {/* Error auth */}
          {authError && !adminLoading && (
            <div className="flex items-start gap-2 px-3 py-2.5 bg-brand-arrecife/10 border border-brand-arrecife/30 rounded-xl mb-4 animate-in fade-in duration-200">
              <AlertCircle className="w-4 h-4 text-brand-arrecife shrink-0 mt-0.5" />
              <p className="text-brand-arrecife text-xs font-bold leading-snug">
                {authError === 'Invalid login credentials'
                  ? 'Correo o contraseña incorrectos.'
                  : authError}
              </p>
            </div>
          )}

          <form onSubmit={handleAdminLogin} className="space-y-4">
            {/* Email */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-ui-muted uppercase tracking-widest block">
                Correo electrónico
              </label>
              <div className="relative group">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-ui-muted group-focus-within:text-brand-arrecife transition-colors" />
                <input
                  type="email" required autoComplete="email"
                  value={email} onChange={e => setEmail(e.target.value)}
                  placeholder="admin@inventa.com"
                  className="w-full pl-10 pr-4 py-3.5 bg-ui-obsidiana border-2 border-ui-border focus:border-brand-arrecife rounded-xl font-bold text-brand-nacar text-sm placeholder:text-ui-muted/40 outline-none transition-all"
                />
              </div>
            </div>

            {/* Password */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-ui-muted uppercase tracking-widest block">
                Contraseña
              </label>
              <div className="relative group">
                <input
                  type={showPass ? 'text' : 'password'} required autoComplete="current-password"
                  value={password} onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-4 pr-10 py-3.5 bg-ui-obsidiana border-2 border-ui-border focus:border-brand-arrecife rounded-xl font-bold text-brand-nacar text-sm placeholder:text-ui-muted/40 outline-none transition-all"
                />
                <button type="button" onClick={() => setShowPass(v => !v)} tabIndex={-1}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-ui-muted hover:text-brand-nacar transition-colors">
                  {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Recordarme + Olvidé */}
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 cursor-pointer group">
                <div
                  onClick={() => setRemember(v => !v)}
                  className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-all ${remember ? 'bg-brand-arrecife border-brand-arrecife' : 'border-ui-border group-hover:border-ui-muted'}`}
                >
                  {remember && <CheckCircle className="w-3 h-3 text-white" />}
                </div>
                <span className="text-xs font-bold text-ui-muted">Recordarme</span>
              </label>
              <button type="button" className="text-xs font-bold text-brand-arrecife hover:text-orange-400 transition-colors">
                ¿Olvidaste tu contraseña?
              </button>
            </div>

            {/* Submit */}
            <button
              type="submit" disabled={adminLoading || isLoading}
              className="w-full py-4 bg-brand-arrecife hover:bg-orange-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-2xl font-black text-white flex items-center justify-center gap-2 shadow-lg shadow-brand-arrecife/30 transition-all active:scale-[0.98] mt-2"
            >
              {(adminLoading || isLoading) ? (
                <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Verificando...</>
              ) : (
                <>Entrar al panel <ArrowRight className="w-4 h-4" /></>
              )}
            </button>
          </form>

          {/* Feature pills */}
          <div className="flex items-center gap-3 mt-5 flex-wrap">
            {['Multi-sucursal', 'Reportes', 'Facturación CFDI'].map(f => (
              <span key={f} className="text-[10px] font-black text-ui-muted">✓ {f}</span>
            ))}
          </div>
        </div>

        {/* ─── CENTRO — Isotipo hero ──────────────────────────────────────── */}
        <div className={`
          hidden lg:flex flex-col items-center justify-center gap-6 relative z-10 flex-shrink-0
          transition-all duration-700 ease-out delay-150
          ${mounted ? 'opacity-100 scale-100' : 'opacity-0 scale-90'}
        `}>
          {/* Halo */}
          <div className="absolute w-[340px] h-[340px] rounded-full bg-brand-arrecife/12 blur-[80px] pointer-events-none" />
          <div className="absolute w-[220px] h-[220px] rounded-full bg-brand-amatista/10 blur-[60px] pointer-events-none translate-y-4" />

          <img
            src="./brand/Isotipo (1).png"
            alt="InvVenta"
            className="relative w-[280px] h-[280px] object-contain drop-shadow-2xl"
            style={{ filter: 'drop-shadow(0 0 40px rgba(255,95,64,0.3))' }}
            onError={e => { e.currentTarget.style.display = 'none'; }}
          />
          <div className="text-center relative">
            <p className="text-brand-nacar font-black text-xl font-syne leading-snug">
              Tu negocio, bajo control<br />
              <span className="text-brand-arrecife">en todo momento</span>
            </p>
          </div>
        </div>

        {/* ─── CARD DERECHA — Empleado PIN ────────────────────────────────── */}
        <div className={`
          w-full max-w-[380px] bg-ui-humo border-2 border-brand-cesped/40 rounded-[2rem]
          p-8 shadow-2xl shadow-black/40 relative z-10
          transition-all duration-700 ease-out delay-300
          ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'}
        `}>
          {/* Badge */}
          <span className="inline-block bg-brand-cesped text-ui-obsidiana text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-full mb-5">
            Empleado
          </span>

          <h2 className="text-3xl font-black text-brand-nacar font-syne leading-tight mb-1">
            Acceso<br />Operativo
          </h2>
          <p className="text-ui-muted text-sm font-bold mb-6">Inicia tu turno rápidamente</p>

          {/* PIN display */}
          <div className="mb-2">
            <p className="text-[10px] font-black text-ui-muted uppercase tracking-widest text-center mb-3">
              Ingresa tu PIN de 4 dígitos
            </p>
            <PinDots length={4} filled={pin.length} />
          </div>

          {/* Error PIN */}
          {pinError && (
            <p className="text-brand-arrecife text-xs font-bold text-center mb-2 animate-in fade-in duration-200">
              {pinError}
            </p>
          )}

          {/* Numpad */}
          <div className="grid grid-cols-3 gap-2.5 mt-4">
            {['1','2','3','4','5','6','7','8','9'].map(n => (
              <NumKey
                key={n} value={n} onClick={handlePinKey}
                className="bg-ui-obsidiana hover:bg-ui-border text-brand-nacar border border-ui-border"
              />
            ))}
            {/* Fila final: borrar / 0 / confirmar */}
            <NumKey
              value="del" onClick={handlePinDelete}
              className="bg-ui-obsidiana hover:bg-brand-arrecife/20 text-brand-nacar border border-ui-border"
            >
              <Delete className="w-5 h-5 mx-auto" />
            </NumKey>
            <NumKey
              value="0" onClick={handlePinKey}
              className="bg-ui-obsidiana hover:bg-ui-border text-brand-nacar border border-ui-border"
            />
            <NumKey
              value="ok" onClick={handlePinSubmit}
              className={`
                flex items-center justify-center
                ${pin.length === 4
                  ? 'bg-brand-cesped hover:bg-emerald-500 text-ui-obsidiana shadow-lg shadow-brand-cesped/30'
                  : 'bg-ui-border text-ui-muted cursor-not-allowed'
                }
              `}
            >
              <ArrowRight className="w-5 h-5 mx-auto" />
            </NumKey>
          </div>

          {/* Feature pills */}
          <div className="flex items-center gap-3 mt-5 flex-wrap">
            {['POS', 'Ventas', 'Inventario rápido'].map(f => (
              <span key={f} className="text-[10px] font-black text-ui-muted">✓ {f}</span>
            ))}
          </div>
        </div>
      </main>

      {/* ── FOOTER ── */}
      <footer className="text-center py-5 relative z-10">
        <p className="text-[10px] font-bold text-ui-muted/50 uppercase tracking-widest">
          © {new Date().getFullYear()} InvVenta · Todos los derechos reservados
        </p>
      </footer>
    </div>
  );
}