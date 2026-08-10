// ─── Recuperación de contraseña · paso 1: pedir el enlace ────────────────────
// Pública. Cierra el último pendiente de la fase 1: el link "¿Olvidaste tu
// contraseña?" se había quitado del login porque este flujo no existía, y sin
// él un dueño de restaurante que olvida su contraseña se queda fuera de su
// propio sistema sin nadie a quien llamar. En un producto self-service eso no
// es una molestia, es un cliente perdido.
//
// Las reglas del flujo viven en `lib/Recuperacion.js` (puro, 34 aserciones).
// Aquí solo está la pantalla.

import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Mail,
  ArrowRight,
  ArrowLeft,
  AlertCircle,
  MailCheck,
} from 'lucide-react';
import { supabase } from '../../api/supabase';
import {
  correoValido,
  normalizarCorreo,
  urlDeRetorno,
  origenDeRetorno,
  mensajeDeError,
  mensajeEnviado,
} from '../../lib/Recuperacion';
import { enTauri, estado as estadoDelHub } from '../../lib/Hub';

export default function RecuperarScreen() {
  const [correo, setCorreo] = useState('');
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');
  const [enviado, setEnviado] = useState(null);

  const sinConexion = !navigator.onLine;

  const enviar = async (e) => {
    e.preventDefault();
    setError('');

    if (!correoValido(correo)) {
      setError('Revisa el correo: parece que falta algo.');
      return;
    }

    setCargando(true);
    const destino = normalizarCorreo(correo);

    try {
      // ── A DÓNDE VUELVE EL ENLACE ────────────────────────────────────────
      // El correo se abre en el navegador del sistema, no aquí. Desde la caja
      // (Tauri) el origen de la ventana no existe para un navegador externo,
      // así que se usa la dirección del HUB en la LAN. Desde un navegador, el
      // propio origen ya sirve. Toda la decisión vive en `origenDeRetorno`.
      let urlDelHub = null;
      if (enTauri()) {
        const hub = await estadoDelHub();
        urlDelHub = hub?.activo ? hub.url : null;
      }

      const origen = origenDeRetorno({
        origenActual: window.location.origin,
        urlDelHub,
        esTauri: enTauri(),
      });

      if (!origen) {
        // Mejor decirlo que mandar un correo con un enlace muerto.
        setError(
          'Para recuperar la contraseña desde la caja hace falta que el hub esté activo, porque el enlace del correo se abre en el navegador. Revisa Sistema → Hub e impresora, o hazlo desde un teléfono conectado a la caja.',
        );
        setCargando(false);
        return;
      }

      const { error: err } = await supabase.auth.resetPasswordForEmail(
        destino,
        { redirectTo: urlDeRetorno(origen) },
      );

      // Un error de RED o de límite de envíos sí se muestra: son cosas que el
      // usuario puede resolver (esperar, conectarse). Lo que NO se distingue es
      // si la cuenta existe — ver abajo.
      if (err) throw err;

      setEnviado(mensajeEnviado(destino));
    } catch (e2) {
      const msg = mensajeDeError(e2);
      // Si el fallo no es de red ni de límite, se trata como éxito a
      // propósito: cualquier otra respuesta distinta permitiría usar esta
      // pantalla para averiguar qué correos están dados de alta.
      if (/Sin conexión|Espera un minuto/.test(msg)) setError(msg);
      else setEnviado(mensajeEnviado(destino));
    } finally {
      setCargando(false);
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
          {enviado ? (
            <div className="text-center">
              <div className="w-14 h-14 bg-adm-ok/10 rounded-ui flex items-center justify-center mx-auto mb-5">
                <MailCheck className="w-7 h-7 text-adm-ok" />
              </div>
              <h1 className="font-fraunces text-2xl mb-3">Revisa tu correo</h1>
              <p className="text-sm text-adm-muted mb-8">{enviado}</p>
              <Link
                to="/login"
                className="w-full py-3.5 bg-adm-accent text-adm-accent-fg rounded-ui font-bold flex items-center justify-center gap-2 hover:opacity-90 transition-all duration-rapida"
              >
                Volver al inicio de sesión
              </Link>
            </div>
          ) : (
            <>
              <h1 className="font-fraunces text-2xl mb-2">
                Recuperar contraseña
              </h1>
              <p className="text-sm text-adm-muted mb-6">
                Escribe el correo con el que te dieron de alta y te mandamos un
                enlace para crear una contraseña nueva.
              </p>

              {sinConexion && (
                <div className="flex items-start gap-2 text-sm text-adm-muted bg-adm-bg border border-adm-border rounded-ui p-3 mb-5">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  {/* Se dice por adelantado: es de las pocas cosas de la app
                      que NO funciona offline, y el usuario merece saberlo
                      antes de teclear su correo y esperar. */}
                  <span>
                    Sin conexión. Este paso necesita internet porque el enlace
                    lo manda el servidor.
                  </span>
                </div>
              )}

              <form onSubmit={enviar}>
                <label
                  htmlFor="correo-recuperacion"
                  className="block text-xs font-bold uppercase tracking-[0.14em] text-adm-muted mb-2"
                >
                  Correo
                </label>
                <div className="relative mb-5">
                  <Mail className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-adm-muted pointer-events-none" />
                  <input
                    id="correo-recuperacion"
                    type="email"
                    autoComplete="email"
                    autoFocus
                    value={correo}
                    onChange={(e) => setCorreo(e.target.value)}
                    placeholder="tu@correo.com"
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
                  disabled={cargando}
                  className="w-full py-3.5 bg-adm-accent text-adm-accent-fg rounded-ui font-bold flex items-center justify-center gap-2 hover:opacity-90 disabled:opacity-50 disabled:pointer-events-none transition-all duration-rapida"
                >
                  {cargando ? 'Enviando…' : 'Enviar enlace'}
                  {!cargando && <ArrowRight className="w-4 h-4" />}
                </button>
              </form>

              <Link
                to="/login"
                className="mt-6 text-sm text-adm-muted hover:text-adm-ink flex items-center justify-center gap-1.5 transition-colors duration-rapida"
              >
                <ArrowLeft className="w-4 h-4" />
                Volver al inicio de sesión
              </Link>
            </>
          )}
        </div>

        <p className="text-xs text-adm-muted text-center mt-6">
          {/* El staff no tiene correo: entra con el código del restaurante y su
              PIN. Sin esta nota, un mesero acabaría aquí sin salida. */}
          ¿Eres parte del equipo y olvidaste tu PIN? Pídele a un administrador
          que lo restablezca desde Staff.
        </p>
      </div>
    </div>
  );
}
