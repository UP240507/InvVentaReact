/**
 * Notificador.js — avisos del sistema operativo, en la caja y en el teléfono.
 *
 * ── EL FALLO DEL 12-ago, Y POR QUÉ EXISTE ESTE MÓDULO ───────────────────────
 * El aviso del KDS se escribió contra la API web `Notification`. En el teléfono
 * funciona. En la caja —Tauri, o sea WebView2— **no**: WebView2 no implementa
 * las notificaciones web. `Notification.permission` se queda en 'default' para
 * siempre, `requestPermission()` no enseña ningún diálogo, y el resultado es el
 * de siempre en este proyecto: **sonaba y el toast no salía nunca**, sin un
 * error, sin un aviso, sin nada que mirar.
 *
 * La solución es `tauri-plugin-notification`, que habla con el centro de
 * notificaciones de Windows de verdad y de paso **sustituye `window.Notification`
 * dentro del webview**. Por eso este módulo puede seguir hablando el idioma de
 * la API web: el plugin ya la redirige. Lo único que hay que hacer distinto es
 * preguntar el permiso por IPC cuando el shim responde 'default', que es su
 * forma de decir «pregúntame en serio».
 *
 * ── DOS AVISOS PARA CUANDO ESTO NO FUNCIONE ─────────────────────────────────
 *  1. En Windows el plugin **sólo funciona con la app INSTALADA**. En
 *     `npm run tauri dev` la notificación sale con el nombre y el icono de
 *     PowerShell, o no sale. No es un fallo del código.
 *  2. El «modo concentración» / «asistente de concentración» de Windows silencia
 *     los toasts sin decírselo a nadie. Si en la cocina no aparecen, ese
 *     interruptor es lo primero que hay que mirar.
 *
 * ── POR QUÉ NO SE USA `@tauri-apps/plugin-notification` ─────────────────────
 * Se instaló y se quitó. Ese paquete son treinta líneas que hacen exactamente
 * lo de abajo: leer `window.Notification` y, si dice 'default', bajar al IPC.
 * Traerlo obligaría a meter código de Tauri en el bundle del TELÉFONO, donde no
 * hay Tauri — y el proyecto ya decidió lo contrario en `Hub.js`, que habla con
 * el puente global en vez de con `@tauri-apps/api`. Un solo criterio para las
 * dos puertas.
 */
import { enTauri, invocar } from './Hub';

const hayApiWeb = () => typeof Notification !== 'undefined';

/**
 * ¿La pantalla está desatendida?
 *
 * NO basta `document.visibilityState`. Una ventana de Tauri minimizada, o
 * tapada por WhatsApp, sigue reportándose 'visible' en Windows — y ése es
 * justamente el caso que hay que cubrir: «salen a checar el teléfono». Por eso
 * manda el FOCO, que sí se pierde al minimizar y al cambiar de ventana.
 *
 * Falso positivo posible: pulsar en la barra de tareas quita el foco un
 * instante. Como mucho, el aviso sale como toast del sistema en vez de como
 * cartel; se sigue viendo. El fallo caro es el contrario.
 */
export function estaDesatendida() {
  if (typeof document === 'undefined') return false;
  if (document.visibilityState === 'hidden') return true;
  if (typeof document.hasFocus === 'function') return !document.hasFocus();
  return false;
}

/**
 * Estado real del permiso: `'granted' | 'denied' | 'default' | 'unsupported'`.
 *
 * Es asíncrono porque dentro de Tauri la respuesta buena vive en Rust. El shim
 * del plugin dice 'default' mientras no se haya decidido, y ahí es donde hay
 * que bajar al IPC en vez de creerle.
 */
export async function permisoDeAvisos() {
  if (!hayApiWeb()) return 'unsupported';
  const web = Notification.permission;
  if (web !== 'default' || !enTauri()) return web;

  try {
    const ok = await invocar('plugin:notification|is_permission_granted');
    // `null` = el sistema aún no ha decidido. No es un «no».
    if (ok === null || ok === undefined) return 'default';
    return ok ? 'granted' : 'denied';
  } catch {
    // Sin plugin registrado (build viejo) la llamada no existe. Se devuelve
    // 'unsupported' y no 'denied': la diferencia importa, porque 'denied' hace
    // que la pantalla diga «lo bloqueaste tú» y aquí no lo bloqueó nadie.
    return 'unsupported';
  }
}

/** Pide el permiso. Debe salir de un gesto del usuario. */
export async function pedirPermiso() {
  if (!hayApiWeb()) return 'unsupported';
  try {
    await Notification.requestPermission();
  } catch {
    /* el shim puede no devolver promesa; el estado real se relee abajo */
  }
  return permisoDeAvisos();
}

/**
 * Lanza el aviso. Devuelve si salió, para que quien llame pueda tener un plan B
 * en vez de suponer que se vio.
 */
export function notificar({ titulo, cuerpo, etiqueta = null }) {
  if (!hayApiWeb()) return false;
  try {
    // `tag` + `renotify`: tres comandas seguidas reemplazan el mismo aviso en
    // vez de apilar tres. Al volver, lo que importa es la pantalla.
    new Notification(titulo, {
      body: cuerpo,
      ...(etiqueta ? { tag: etiqueta, renotify: true } : {}),
    });
    return true;
  } catch {
    return false;
  }
}
