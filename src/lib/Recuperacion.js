/**
 * Recuperacion.js — reglas del flujo "olvidé mi contraseña".
 *
 * Puro: sin React, sin store, sin red. Las dos pantallas del flujo lo usan y
 * las pruebas lo ejercitan sin levantar Supabase.
 *
 * POR QUÉ EXISTE ESTE MÓDULO. El flujo tiene tres sitios donde es fácil
 * equivocarse y ninguno da error cuando te equivocas — simplemente el dueño de
 * un restaurante se queda fuera de su propio sistema:
 *
 *   1. **Enumeración de cuentas.** Si la pantalla contesta "ese correo no
 *      existe", cualquiera puede averiguar qué correos están registrados. La
 *      respuesta tiene que ser idéntica exista la cuenta o no.
 *   2. **El enlace del correo.** Supabase manda el token en el FRAGMENTO
 *      (`#access_token=...`), no en el query. Un `searchParams` no lo ve, y el
 *      formato ha cambiado entre versiones: hoy puede llegar como `?code=` de
 *      PKCE. Hay que aceptar los dos.
 *   3. **Los errores.** "Invalid token" puede significar caducado, ya usado o
 *      manipulado, y cada uno pide una acción distinta del usuario. Un mensaje
 *      genérico deja a alguien pulsando el mismo botón caducado otra vez.
 */

/** Mínimo de caracteres. Coincide con lo que ya exige PerfilScreen. */
export const MIN_PASSWORD = 8;

/**
 * Validación de correo deliberadamente permisiva.
 *
 * No se usa una regex "completa" de RFC 5322: son ilegibles, y de todas formas
 * el único juez de si un correo existe es que llegue el mensaje. Lo que se
 * quiere atajar aquí es el dedazo evidente —falta la arroba, falta el punto,
 * hay espacios— para no gastar un envío ni hacer esperar a nadie.
 */
export function correoValido(correo) {
  const s = String(correo ?? '').trim();
  if (!s || /\s/.test(s)) return false;
  return /^[^@]+@[^@.]+(\.[^@.]+)+$/.test(s);
}

/** Normaliza para enviar: sin espacios y en minúsculas. */
export function normalizarCorreo(correo) {
  return String(correo ?? '')
    .trim()
    .toLowerCase();
}

/**
 * Valida la contraseña nueva y su confirmación.
 *
 * Devuelve `{ ok, error }` en vez de lanzar, para que la pantalla pinte el
 * mensaje sin envolver nada en try/catch.
 *
 * Sobre la política: solo longitud mínima. No se exigen mayúsculas ni símbolos
 * a propósito — esas reglas empujan a la gente hacia "Password1!" y hacia el
 * papelito pegado al monitor de la caja, que en un restaurante lo ve todo el
 * mundo. La longitud es lo que de verdad aporta. Lo que sí conviene activar es
 * Leaked Password Protection en el dashboard de Supabase, que rechaza
 * contraseñas ya filtradas: eso vale más que cualquier regla de composición.
 */
export function validarPassword(pass, confirmacion) {
  const p = String(pass ?? '');

  if (!p) return { ok: false, error: 'Escribe una contraseña nueva.' };
  if (p.length < MIN_PASSWORD) {
    return {
      ok: false,
      error: `La contraseña necesita al menos ${MIN_PASSWORD} caracteres.`,
    };
  }
  if (confirmacion !== undefined && p !== String(confirmacion ?? '')) {
    return { ok: false, error: 'Las contraseñas no coinciden.' };
  }
  return { ok: true, error: null };
}

/**
 * URL a la que Supabase debe devolver al usuario tras pulsar el enlace.
 *
 * Se construye desde el origen actual y NO se escribe a mano en ningún sitio,
 * porque tiene que funcionar en tres orígenes distintos: el dominio de
 * producción, `localhost:5173` en desarrollo y —desde la fase 3— la IP del hub
 * en la LAN. Cada uno debe estar en la lista de Redirect URLs del dashboard.
 */
export function urlDeRetorno(origen) {
  const base = String(origen ?? '').replace(/\/$/, '');
  return `${base}/nueva-contrasena`;
}

/**
 * Decide DESDE QUÉ ORIGEN se construye el enlace del correo.
 *
 * No es un detalle: el enlace se abre en el **navegador del sistema**, no en la
 * ventana donde se pidió. Y la ventana de Tauri tiene un origen interno
 * (`tauri://localhost`, o `http://tauri.localhost` en Windows) que ningún
 * navegador externo sabe resolver. Si se usara ese origen sin más, el correo
 * llegaría con un enlace que **no lleva a ninguna parte** — y encima habría que
 * meter esa dirección en la lista blanca de Supabase para nada.
 *
 * Por eso, desde la caja se usa la URL del HUB en la LAN, que sí es una
 * dirección real y alcanzable desde el teléfono o desde otra computadora del
 * local. Desde un navegador —el teléfono servido por el hub, o localhost en
 * desarrollo— el propio origen ya es correcto.
 *
 * Devuelve `null` cuando no hay ningún origen utilizable. La pantalla lo trata
 * como un error explicado, no como un envío silencioso a la nada.
 *
 * @param {{ origenActual?: string, urlDelHub?: string|null, esTauri?: boolean }} p
 */
export function origenDeRetorno({
  origenActual = '',
  urlDelHub = null,
  esTauri = false,
} = {}) {
  const esWeb = (u) => /^https?:\/\//i.test(String(u || ''));

  if (esTauri) {
    // Solo vale una dirección de red real. `tauri.localhost` es http pero no
    // existe fuera de la ventana, así que se descarta explícitamente.
    return esWeb(urlDelHub) && !/tauri/i.test(urlDelHub) ? urlDelHub : null;
  }

  if (!esWeb(origenActual)) return null;
  if (/tauri/i.test(origenActual)) return esWeb(urlDelHub) ? urlDelHub : null;
  return origenActual;
}

/**
 * Extrae el token de recuperación del enlace del correo.
 *
 * Acepta las dos formas que usa Supabase, porque cuál llega depende del flujo
 * configurado en el proyecto y no queremos que un cambio de ajuste rompa el
 * único camino de vuelta que tiene un usuario bloqueado:
 *
 *   - **Implícito**: `#access_token=...&refresh_token=...&type=recovery`
 *   - **PKCE**:      `?code=...`
 *
 * También detecta el caso en que Supabase devuelve un ERROR en el propio
 * enlace (`#error=access_denied&error_description=...`), que es exactamente lo
 * que pasa con un enlace caducado. Sin esto la pantalla se quedaría esperando
 * una sesión que nunca va a llegar, sin decir por qué.
 *
 * @param {string} href  window.location.href completo
 * @returns {{ tipo:'implicito'|'pkce'|'error'|'ninguno', ... }}
 */
export function leerEnlace(href) {
  let url;
  try {
    url = new URL(String(href ?? ''));
  } catch {
    return { tipo: 'ninguno' };
  }

  // El fragmento viene como '#a=1&b=2'; se parsea como si fuera un query.
  const frag = new URLSearchParams((url.hash || '').replace(/^#/, ''));
  const query = url.searchParams;

  const error = frag.get('error') || query.get('error');
  if (error) {
    return {
      tipo: 'error',
      codigo: frag.get('error_code') || query.get('error_code') || error,
      descripcion:
        frag.get('error_description') || query.get('error_description') || '',
    };
  }

  const accessToken = frag.get('access_token');
  if (accessToken) {
    return {
      tipo: 'implicito',
      accessToken,
      refreshToken: frag.get('refresh_token') || '',
      // `type` debería ser 'recovery'. Se devuelve para que la pantalla pueda
      // distinguir un enlace de recuperación de uno de invitación o de
      // confirmación de correo, que llegan por el mismo camino.
      subtipo: frag.get('type') || '',
    };
  }

  const code = query.get('code');
  if (code) return { tipo: 'pkce', code };

  return { tipo: 'ninguno' };
}

/**
 * Traduce un error de Supabase a algo que diga QUÉ HACER.
 *
 * El criterio no es informar del fallo sino dar la siguiente acción: alguien
 * que no puede entrar a su sistema no necesita saber que el token es inválido,
 * necesita saber que tiene que pedir otro correo.
 */
export function mensajeDeError(error) {
  const texto = String(
    error?.message ||
      error?.error_description ||
      error?.descripcion ||
      error ||
      '',
  ).toLowerCase();

  if (!texto) return 'No se pudo completar la operación. Vuelve a intentarlo.';

  // Caducado o ya usado. Los enlaces de recuperación son de un solo uso, así
  // que "ya usado" pasa de verdad: el usuario abre el correo dos veces.
  if (
    texto.includes('expired') ||
    texto.includes('caducado') ||
    texto.includes('otp_expired') ||
    texto.includes('invalid') ||
    texto.includes('access_denied')
  ) {
    return 'El enlace ya no sirve: caducó o se usó antes. Pide uno nuevo desde la pantalla de recuperación.';
  }

  // Límite de envíos. Supabase lo aplica por correo y por IP.
  if (
    texto.includes('rate limit') ||
    texto.includes('too many') ||
    texto.includes('seconds')
  ) {
    return 'Se enviaron demasiadas solicitudes. Espera un minuto y vuelve a intentarlo.';
  }

  // ANTES del caso genérico de contraseña: el mensaje de Supabase para esto es
  // "New password should be different from the old password", que contiene la
  // palabra "password" y caería en la rama de abajo. El orden importa, y sin la
  // prueba que lo fija volvería a romperse: el usuario que reteclea su
  // contraseña vieja leería "prueba con otra más larga", que no es el problema.
  if (
    texto.includes('same_password') ||
    texto.includes('should be different')
  ) {
    return 'Esa es la contraseña que ya tenías. Escribe una distinta.';
  }

  if (texto.includes('failed to fetch') || texto.includes('network')) {
    return 'Sin conexión. La recuperación de contraseña necesita internet.';
  }

  // Contraseña rechazada por el servidor (p. ej. Leaked Password Protection).
  if (texto.includes('password')) {
    return 'El servidor rechazó esa contraseña. Prueba con otra más larga o menos común.';
  }

  return 'No se pudo completar la operación. Vuelve a intentarlo.';
}

/**
 * ¿El fallo es "la cuenta existe pero el correo no está confirmado"?
 *
 * Merece su propia función porque es el ÚNICO error de login que no se arregla
 * reintentando ni cambiando la contraseña: hay que ir al buzón. Confundirlo con
 * "credenciales inválidas" —que es lo que parece a primera vista— manda a la
 * persona a probar contraseñas que sí eran correctas.
 *
 * Supabase lo devuelve en inglés y con más de una redacción según la versión,
 * de ahí que se busque el patrón y no una cadena exacta.
 */
export function esCorreoSinConfirmar(error) {
  const texto = String(
    error?.message || error?.error_description || error || '',
  ).toLowerCase();

  if (!texto) return false;
  return (
    texto.includes('email not confirmed') ||
    texto.includes('email_not_confirmed') ||
    (texto.includes('confirm') && texto.includes('email'))
  );
}

/**
 * Mensaje de confirmación del envío.
 *
 * Es SIEMPRE el mismo, exista la cuenta o no. Si dijéramos "no encontramos ese
 * correo", cualquiera podría usar esta pantalla para averiguar qué correos
 * están dados de alta en el sistema. La redacción evita prometer que el correo
 * salió —dice qué hacer y qué esperar— sin confirmar ni negar la cuenta.
 */
export function mensajeEnviado(correo) {
  const c = normalizarCorreo(correo);
  return `Si ${c} tiene una cuenta, le llegará un enlace para crear una contraseña nueva. Revisa también la carpeta de spam; el enlace caduca en una hora.`;
}
