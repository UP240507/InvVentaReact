// src/lib/Abrir.js — abrir un enlace FUERA de la caja
//
// ── EL FALLO QUE CIERRA ──────────────────────────────────────────────────────
//
// `ComprasScreen` mandaba la orden al proveedor con `window.open` y, en la
// línea siguiente, daba el flujo por terminado: vaciaba el carrito, soltaba al
// proveedor y volvía al historial.
//
// En un navegador eso funciona. **Dentro de la caja no**: Tauri sobre WebView2
// no devuelve una ventana usable, así que no se abría nada — pero el carrito se
// vaciaba igual. El encargado veía la orden desaparecer de la pantalla y
// concluía lo único razonable: que se había enviado. Ni excepción ni log.
//
// ── LO QUE ESTA FUNCIÓN GARANTIZA ────────────────────────────────────────────
//
// **Dice si abrió o no.** Nada más. Quien la llama decide qué hacer con eso, y
// lo que NO puede hacer es cerrar el flujo cuando la respuesta es que no.
//
// ── POR QUÉ NO SE IMPORTA `@tauri-apps/plugin-opener` ────────────────────────
//
// Por lo mismo que `lib/Hub.js` no importa `@tauri-apps/api/core`, y está
// escrito allí: Vite resuelve los imports dinámicos de cadena literal en
// tiempo de transformación, así que un paquete ausente tumba **cualquier**
// prueba que llegue a tocar el fichero. Se usa el puente que Tauri ya inyecta
// en la ventana, que es lo mismo que hace el paquete por dentro.
import { enTauri, invocar } from './Hub';

/**
 * Esquemas que se dejan abrir.
 *
 * La lista es corta a propósito. Esto recibe URLs armadas con datos del
 * catálogo —el teléfono y el correo de un proveedor, que los teclea una
 * persona—, y `file:` o `javascript:` no tienen nada que hacer aquí.
 */
const ESQUEMAS = ['http:', 'https:', 'mailto:'];

/** ¿Es una URL que estamos dispuestos a abrir? */
export function esquemaPermitido(url) {
  try {
    return ESQUEMAS.includes(new URL(String(url)).protocol);
  } catch {
    return false;
  }
}

/**
 * Abre `url` fuera de la aplicación.
 *
 * @param {string} url
 * @returns {Promise<{ok: boolean, motivo?: 'sin-url'|'esquema'|'tauri'|'bloqueado'}>}
 *
 *   `sin-url`    no había nada que abrir.
 *   `esquema`    la URL no es http, https ni mailto.
 *   `tauri`      el sistema no pudo abrirla (sin navegador, sin cliente de
 *                correo, o el plugin no está registrado en esta versión).
 *   `bloqueado`  el navegador bloqueó la ventana emergente.
 */
export async function abrirFuera(url) {
  if (!url) return { ok: false, motivo: 'sin-url' };
  if (!esquemaPermitido(url)) return { ok: false, motivo: 'esquema' };

  if (enTauri()) {
    try {
      await invocar('plugin:opener|open_url', { url: String(url) });
      return { ok: true };
    } catch {
      // Se traga el error a propósito y se devuelve el motivo: quien llama
      // tiene que poder AVISAR, no reventar a media orden de compra.
      return { ok: false, motivo: 'tauri' };
    }
  }

  // Fuera de la caja —los teléfonos abren la app por LAN en su navegador—
  // `window.open` sí sirve. `noopener` porque la página de destino no tiene por
  // qué recibir una referencia a la nuestra.
  try {
    const ventana = window.open(String(url), '_blank', 'noopener,noreferrer');
    // `null` es el bloqueador de ventanas emergentes. Es el caso que hacía
    // falta distinguir: no abrió, así que el flujo no se cierra.
    return ventana ? { ok: true } : { ok: false, motivo: 'bloqueado' };
  } catch {
    return { ok: false, motivo: 'bloqueado' };
  }
}

/** Un aviso en español para cada motivo, para no repetirlo en cada pantalla. */
export function motivoLegible(motivo) {
  switch (motivo) {
    case 'sin-url':
      return 'No hay a dónde mandarlo.';
    case 'esquema':
      return 'Ese enlace no se puede abrir desde aquí.';
    case 'tauri':
      return 'No se pudo abrir. Revisa que la caja tenga navegador o cliente de correo.';
    case 'bloqueado':
      return 'El navegador bloqueó la ventana. Permite las ventanas emergentes de esta página.';
    default:
      return 'No se pudo abrir el enlace.';
  }
}
