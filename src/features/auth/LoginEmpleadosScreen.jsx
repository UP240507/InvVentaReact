import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../api/supabase';
import { olvidarEntrarComoAdmin } from '../../lib/Puerta';
import MarcaConmutador from './MarcaConmutador';
import { Store, Delete, Loader2, ArrowRight, Pencil } from 'lucide-react';

// El código del restaurante NO es secreto (solo enruta al tenant; el login real
// exige PIN). Por eso vive en localStorage del dispositivo. Los TOKENS, en cambio,
// los persiste el cliente principal de Supabase vía setSession (sb-...-auth-token).
const CODE_KEY = 'invventa.codigoRestaurante';
const PIN_LEN = 6;

export default function LoginEmpleadoScreen({ onSuccess }) {
  const [codigoGuardado, setCodigoGuardado] = useState(
    () => localStorage.getItem(CODE_KEY) || '',
  );
  const [codigoInput, setCodigoInput] = useState('');
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Llegar a esta pantalla cancela la salida manual: si el dueño se fue al
  // login de correo y vuelve aquí, este dispositivo es de staff otra vez. Sin
  // esto, la excepción se quedaría puesta toda la sesión y el mesero seguiría
  // aterrizando en el formulario de correo.
  useEffect(() => {
    olvidarEntrarComoAdmin();
  }, []);

  const necesitaCodigo = !codigoGuardado;
  const codigoEfectivo = (codigoGuardado || codigoInput).trim().toUpperCase();
  const puedeEnviar =
    pin.length === PIN_LEN && codigoEfectivo.length > 0 && !loading;

  const handleLogin = useCallback(async () => {
    if (loading) return;
    const codigo = (codigoGuardado || codigoInput).trim().toUpperCase();
    if (!codigo) {
      setError('Ingresa el código del restaurante.');
      return;
    }
    if (pin.length !== PIN_LEN) {
      setError(`El PIN son ${PIN_LEN} dígitos.`);
      return;
    }

    setLoading(true);
    setError('');
    try {
      // login-pin es PÚBLICA (--no-verify-jwt). Resuelve el tenant por código,
      // busca staff por (restaurante_id, pin), rechaza rol elevado / inactivo /
      // sin auth_id, y devuelve { empleado, session:{access_token, refresh_token} }.
      const { data, error: efError } = await supabase.functions.invoke(
        'login-pin',
        {
          body: { codigo, pin },
        },
      );

      if (efError) {
        let msg = 'PIN o código incorrecto.';
        try {
          const b = await efError.context?.json?.();
          if (b?.error) msg = b.error;
        } catch {
          /* body no-JSON; nos quedamos con el genérico */
        }
        setError(msg);
        setPin('');
        return;
      }

      const session = data?.session;
      if (!session?.access_token || !session?.refresh_token) {
        setError('Respuesta inválida del servidor. Intenta de nuevo.');
        setPin('');
        return;
      }

      // Establece la sesión REAL en el cliente principal. A partir de aquí el JWT
      // ES de la persona logueada → los writes con RLS (asistencias, etc.) pasan.
      const { error: setErr } = await supabase.auth.setSession({
        access_token: session.access_token,
        refresh_token: session.refresh_token,
      });
      if (setErr) {
        setError(`No se pudo iniciar sesión: ${setErr.message}`);
        setPin('');
        return;
      }

      // Recordar el código en este dispositivo SOLO tras un login válido.
      localStorage.setItem(CODE_KEY, codigo);
      setCodigoGuardado(codigo);

      if (typeof onSuccess === 'function') {
        // Hook para que el contenedor setee empleadoActivo en su store y navegue
        // sin recargar. Recibe el empleado y la sesión ya establecida.
        onSuccess(data.empleado, session);
      } else {
        // FLUJO DIRIGIDO: login → CHECADOR (registrar entrada) → el propio
        // checador navega a la ruta por rol, y TurnoRoute rebota a /espera si
        // no hay caja abierta. Antes se recargaba a '/' y el checador quedaba
        // huérfano: nadie registraba entrada a menos que navegara a mano.
        window.location.assign('/checador');
      }
    } catch (e) {
      setError(`Error inesperado: ${e?.message || e}`);
      setPin('');
    } finally {
      setLoading(false);
    }
  }, [codigoGuardado, codigoInput, pin, loading, onSuccess]);

  // Teclado físico (caja / Tauri con teclado): dígitos, Backspace, Enter.
  useEffect(() => {
    const onKey = (e) => {
      if (loading) return;
      // No secuestrar teclas mientras se escribe en un campo de texto: el código
      // del restaurante lleva dígitos (AZUL-C172) y, sin este guard, esos dígitos
      // se irían al PIN y "no dejarían" teclear el código con normalidad.
      const tag = (e.target?.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea') return;
      if (/^\d$/.test(e.key)) {
        setPin((p) => (p.length < PIN_LEN ? p + e.key : p));
      } else if (e.key === 'Backspace') {
        setPin((p) => p.slice(0, -1));
      } else if (e.key === 'Enter' && pin.length === PIN_LEN) {
        handleLogin();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [loading, pin, handleLogin]);

  const tecla = (d) => setPin((p) => (p.length < PIN_LEN ? p + d : p));
  const borrar = () => setPin((p) => p.slice(0, -1));
  const cambiarCodigo = () => {
    localStorage.removeItem(CODE_KEY);
    setCodigoGuardado('');
    setCodigoInput('');
    setPin('');
    setError('');
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center p-4 bg-ops-panel-2 dark:bg-ops-bg transition-colors">
      <div className="w-full max-w-sm bg-white dark:bg-ops-panel rounded-ui-lg shadow-2xl border-2 border-ops-border p-8 flex flex-col items-center transition-colors">
        {/* ─── MARCA, QUE ADEMÁS ES LA PUERTA AL OTRO LOGIN ─── */}
        <MarcaConmutador
          hacia="correo"
          className="w-16 h-16 rounded-ui-lg bg-ops-info flex items-center justify-center shadow-lg shadow-ops-info/30 mb-5"
        >
          <Store className="w-8 h-8 text-ops-accent-fg" />
        </MarcaConmutador>
        <h1 className="text-2xl font-black text-ops-ink tracking-tight">
          Acceso de Personal
        </h1>
        <p className="text-xs font-bold text-ops-muted uppercase tracking-widest mt-1 mb-7">
          InvVenta
        </p>

        {/* ─── CÓDIGO DE RESTAURANTE (solo primera vez en el dispositivo) ─── */}
        {necesitaCodigo ? (
          <div className="w-full space-y-2 mb-6">
            <label className="text-[10px] font-black text-ops-muted uppercase tracking-widest px-2">
              Código del restaurante
            </label>
            <input
              type="text"
              value={codigoInput}
              onChange={(e) => setCodigoInput(e.target.value.toUpperCase())}
              placeholder="Ej. AZUL-C172"
              autoFocus
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              className="w-full px-4 py-3.5 bg-ops-bg border-2 border-ops-field rounded-ui font-black text-center text-lg tracking-widest text-ops-ink outline-none focus:border-ops-info transition-colors"
            />
            <p className="text-[11px] font-bold text-ops-muted px-2 text-center">
              Solo se pide una vez; queda guardado en este dispositivo.
            </p>
          </div>
        ) : (
          <button
            onClick={cambiarCodigo}
            className="mb-6 inline-flex items-center gap-1.5 text-xs font-bold text-ops-muted hover:text-ops-info transition-colors"
          >
            <Pencil className="w-3 h-3" /> {codigoGuardado} · cambiar
          </button>
        )}

        {/* ─── DOTS DEL PIN ─── */}
        <div
          className="flex items-center justify-center gap-3 mb-6"
          aria-label="PIN"
        >
          {Array.from({ length: PIN_LEN }).map((_, i) => (
            <div
              key={i}
              className={`w-3.5 h-3.5 rounded-full transition-all ${
                i < pin.length
                  ? 'bg-ops-info scale-110'
                  : 'bg-ops-panel-2 dark:bg-ops-border'
              }`}
            />
          ))}
        </div>

        {/* ─── ERROR ─── */}
        {error && (
          <p className="text-sm font-bold text-ops-danger text-center mb-5 -mt-1">
            {error}
          </p>
        )}

        {/* ─── TECLADO NUMÉRICO (tablets / celulares) ─── */}
        <div className="grid grid-cols-3 gap-3 w-full mb-6">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => tecla(d)}
              disabled={loading}
              className="aspect-square rounded-ui bg-ops-bg hover:bg-ops-panel-2 dark:hover:bg-ops-border active:scale-95 text-2xl font-black text-ops-ink transition-all disabled:opacity-50"
            >
              {d}
            </button>
          ))}
          <div aria-hidden="true" />
          <button
            type="button"
            onClick={() => tecla('0')}
            disabled={loading}
            className="aspect-square rounded-ui bg-ops-bg hover:bg-ops-panel-2 dark:hover:bg-ops-border active:scale-95 text-2xl font-black text-ops-ink transition-all disabled:opacity-50"
          >
            0
          </button>
          <button
            type="button"
            onClick={borrar}
            disabled={loading || pin.length === 0}
            className="aspect-square rounded-ui bg-ops-bg hover:bg-ops-panel-2 dark:hover:bg-ops-border active:scale-95 text-ops-muted transition-all disabled:opacity-50 flex items-center justify-center"
            aria-label="Borrar"
          >
            <Delete className="w-6 h-6" />
          </button>
        </div>

        {/* ─── ENTRAR ─── */}
        <button
          type="button"
          onClick={handleLogin}
          disabled={!puedeEnviar}
          className="w-full bg-ops-info hover:bg-ops-info disabled:opacity-50 disabled:cursor-not-allowed text-ops-accent-fg font-black py-4 rounded-ui active:scale-95 transition-all shadow-lg shadow-ops-info/30 flex items-center justify-center gap-2"
        >
          {loading ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" /> Entrando...
            </>
          ) : (
            <>
              Entrar <ArrowRight className="w-5 h-5" />
            </>
          )}
        </button>
      </div>
    </div>
  );
}
