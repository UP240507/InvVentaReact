// ─── Recuperación de contraseña · paso 2: escribir la nueva ──────────────────
// Pública, y a la que se llega SOLO desde el enlace del correo.
//
// Es la pantalla delicada del flujo, por tres razones que no dan error cuando
// se hacen mal:
//
//  1. El token llega en el FRAGMENTO de la URL (`#access_token=...`), que
//     `searchParams` no ve. Leerlo del query dejaría el flujo muerto sin decir
//     nada. Lo resuelve `leerEnlace` en lib/Recuperacion.js.
//
//  2. Supabase abre una SESIÓN al procesar el enlace. Si el usuario abandona a
//     medias queda con sesión iniciada sin haber cambiado la contraseña, y en un
//     equipo compartido —la caja del restaurante— eso es una cuenta abierta.
//     Por eso al salir sin completar se cierra la sesión.
//
//  3. Un enlace caducado llega como `#error=...` en la propia URL, no como un
//     fallo de red. Sin detectarlo, la pantalla espera para siempre una sesión
//     que no va a existir.

import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Lock,
  Eye,
  EyeOff,
  AlertCircle,
  CheckCircle2,
  ShieldCheck,
} from 'lucide-react';
import { supabase } from '../../api/supabase';
import {
  leerEnlace,
  validarPassword,
  mensajeDeError,
  MIN_PASSWORD,
} from '../../lib/Recuperacion';

export default function NuevaContrasenaScreen() {
  const navigate = useNavigate();

  // El enlace se lee UNA vez, al montar, con un inicializador perezoso. No es
  // una suscripción a nada externo —la URL ya está ahí cuando la pantalla
  // aparece—, así que sacarlo a un efecto obligaría a un setState síncrono en
  // el cuerpo del efecto y a un render extra con el estado equivocado.
  const [enlace] = useState(() => leerEnlace(window.location.href));

  // 'verificando' | 'listo' | 'invalido' | 'hecho'
  const [fase, setFase] = useState(() =>
    enlace.tipo === 'error' || enlace.tipo === 'ninguno'
      ? 'invalido'
      : 'verificando',
  );
  const [motivo, setMotivo] = useState(() => {
    if (enlace.tipo === 'error')
      return mensajeDeError(enlace.descripcion || enlace.codigo);
    if (enlace.tipo === 'ninguno')
      return 'Esta pantalla se abre desde el enlace del correo. Pide uno nuevo para continuar.';
    return '';
  });

  const [pass, setPass] = useState('');
  const [confirmar, setConfirmar] = useState('');
  const [verPass, setVerPass] = useState(false);
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);

  // Marca si el cambio se completó, para no cerrar sesión dos veces al salir.
  const completado = useRef(false);

  useEffect(() => {
    if (enlace.tipo === 'error' || enlace.tipo === 'ninguno') return;

    let vivo = true;

    const verificar = async () => {
      // `detectSessionInUrl` del cliente ya procesa el fragmento; con PKCE hay
      // que canjear el código a mano.
      if (enlace.tipo === 'pkce') {
        const { error: err } = await supabase.auth.exchangeCodeForSession(
          enlace.code,
        );
        if (err) {
          if (!vivo) return;
          setMotivo(mensajeDeError(err));
          setFase('invalido');
          return;
        }
      }

      const { data } = await supabase.auth.getSession();
      if (!vivo) return;

      if (!data?.session) {
        setMotivo(
          'No se pudo validar el enlace. Puede que haya caducado o que ya se usara. Pide uno nuevo.',
        );
        setFase('invalido');
        return;
      }

      setFase('listo');
    };

    verificar();
    return () => {
      vivo = false;
    };
  }, [enlace]);

  // Abandonar la pantalla SIN haber cambiado la contraseña cierra la sesión que
  // abrió el enlace. En la caja de un restaurante el equipo es compartido: una
  // sesión abierta por un enlace a medio usar sería peor que el problema que
  // vinimos a resolver.
  //
  // Sin dependencias y con un ref para saber si se completó: si dependiera de
  // `fase`, el paso de 'listo' a 'hecho' ejecutaría la limpieza y cerraría
  // sesión en el camino del éxito, que ya la cierra por su cuenta.
  useEffect(() => {
    return () => {
      if (!completado.current) supabase.auth.signOut();
    };
  }, []);

  const guardar = async (e) => {
    e.preventDefault();
    setError('');

    const v = validarPassword(pass, confirmar);
    if (!v.ok) {
      setError(v.error);
      return;
    }

    setGuardando(true);
    try {
      const { error: err } = await supabase.auth.updateUser({ password: pass });
      if (err) throw err;

      // Se cierra la sesión a propósito y se manda al login: obliga a entrar
      // con la contraseña nueva, que es la única forma de comprobar de verdad
      // que quedó guardada.
      completado.current = true;
      await supabase.auth.signOut();
      setFase('hecho');
    } catch (e2) {
      setError(mensajeDeError(e2));
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="min-h-screen bg-adm-bg flex items-center justify-center p-6 font-figtree text-adm-ink">
      <div className="w-full max-w-md">
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
          {fase === 'verificando' && (
            <div className="text-center py-6">
              <ShieldCheck className="w-8 h-8 mx-auto mb-4 text-adm-muted opacity-50" />
              <p className="text-sm text-adm-muted">Validando el enlace…</p>
            </div>
          )}

          {fase === 'invalido' && (
            <div className="text-center">
              <div className="w-14 h-14 bg-adm-danger/10 rounded-ui flex items-center justify-center mx-auto mb-5">
                <AlertCircle className="w-7 h-7 text-adm-danger" />
              </div>
              <h1 className="font-fraunces text-2xl mb-3">Enlace no válido</h1>
              <p className="text-sm text-adm-muted mb-8">{motivo}</p>
              {/* La salida es la acción, no un "volver": quien llega aquí
                  necesita otro enlace, así que el botón principal lo pide. */}
              <Link
                to="/recuperar"
                className="w-full py-3.5 bg-adm-accent text-adm-accent-fg rounded-ui font-bold flex items-center justify-center gap-2 hover:opacity-90 transition-all duration-rapida"
              >
                Pedir un enlace nuevo
              </Link>
              <Link
                to="/login"
                className="mt-4 text-sm text-adm-muted hover:text-adm-ink block transition-colors duration-rapida"
              >
                Volver al inicio de sesión
              </Link>
            </div>
          )}

          {fase === 'hecho' && (
            <div className="text-center">
              <div className="w-14 h-14 bg-adm-ok/10 rounded-ui flex items-center justify-center mx-auto mb-5">
                <CheckCircle2 className="w-7 h-7 text-adm-ok" />
              </div>
              <h1 className="font-fraunces text-2xl mb-3">
                Contraseña actualizada
              </h1>
              <p className="text-sm text-adm-muted mb-8">
                Ya puedes entrar con tu contraseña nueva.
              </p>
              <button
                onClick={() => navigate('/login', { replace: true })}
                className="w-full py-3.5 bg-adm-accent text-adm-accent-fg rounded-ui font-bold hover:opacity-90 transition-all duration-rapida"
              >
                Iniciar sesión
              </button>
            </div>
          )}

          {fase === 'listo' && (
            <>
              <h1 className="font-fraunces text-2xl mb-2">Nueva contraseña</h1>
              <p className="text-sm text-adm-muted mb-6">
                Al menos {MIN_PASSWORD} caracteres. Una frase que recuerdes
                funciona mejor que una palabra con símbolos.
              </p>

              <form onSubmit={guardar}>
                <label
                  htmlFor="pass-nueva"
                  className="block text-xs font-bold uppercase tracking-[0.14em] text-adm-muted mb-2"
                >
                  Contraseña
                </label>
                <div className="relative mb-4">
                  <Lock className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-adm-muted pointer-events-none" />
                  <input
                    id="pass-nueva"
                    type={verPass ? 'text' : 'password'}
                    autoComplete="new-password"
                    autoFocus
                    value={pass}
                    onChange={(e) => setPass(e.target.value)}
                    className="w-full h-11 pl-10 pr-11 bg-adm-bg border border-adm-field rounded-ui text-sm outline-none focus-visible:ring-2 focus-visible:ring-adm-accent transition-colors duration-rapida"
                  />
                  <button
                    type="button"
                    onClick={() => setVerPass((v) => !v)}
                    aria-label={
                      verPass ? 'Ocultar contraseña' : 'Mostrar contraseña'
                    }
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-adm-muted hover:text-adm-ink transition-colors duration-rapida"
                  >
                    {verPass ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>

                <label
                  htmlFor="pass-confirmar"
                  className="block text-xs font-bold uppercase tracking-[0.14em] text-adm-muted mb-2"
                >
                  Repetir
                </label>
                <div className="relative mb-5">
                  <Lock className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-adm-muted pointer-events-none" />
                  <input
                    id="pass-confirmar"
                    type={verPass ? 'text' : 'password'}
                    autoComplete="new-password"
                    value={confirmar}
                    onChange={(e) => setConfirmar(e.target.value)}
                    className="w-full h-11 pl-10 pr-3 bg-adm-bg border border-adm-field rounded-ui text-sm outline-none focus-visible:ring-2 focus-visible:ring-adm-accent transition-colors duration-rapida"
                  />
                </div>

                {error && (
                  <div className="flex items-start gap-2 text-sm text-adm-danger mb-5">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span className="min-w-0">{error}</span>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={guardando}
                  className="w-full py-3.5 bg-adm-accent text-adm-accent-fg rounded-ui font-bold hover:opacity-90 disabled:opacity-50 disabled:pointer-events-none transition-all duration-rapida"
                >
                  {guardando ? 'Guardando…' : 'Guardar contraseña'}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
