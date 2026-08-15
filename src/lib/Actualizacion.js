/**
 * Actualizacion.js — buscar y aplicar actualizaciones de la caja.
 *
 * ── LA DECISIÓN QUE MANDA SOBRE EL DISEÑO ───────────────────────────────────
 * **No se actualiza en silencio.** Nunca.
 *
 * Chris decidió (11-ago) no comprar certificado de firma de código. La
 * consecuencia documentada por Microsoft es que, sin firma, la reputación de
 * SmartScreen se acumula **por hash de archivo y no por publicador**: cada
 * versión nueva es «un programa distinto» que empieza de cero, así que Windows
 * enseñará su aviso azul en la máquina del cliente **en cada actualización**.
 *
 * Un updater silencioso convertiría eso en una llamada de soporte a media
 * comida: la caja se reinicia sola y sale una pantalla que llama peligroso al
 * punto de venta. Por eso este módulo sólo BUSCA, y quien decide es una persona
 * mirando un aviso que le dice exactamente qué va a pasar.
 *
 * ── CUÁNDO SE BUSCA ─────────────────────────────────────────────────────────
 * A mano, desde Ajustes. No al arrancar: el arranque de la caja es lo primero
 * que hace el local a las once de la mañana y no es el momento de proponer
 * nada. La política acordada es «sólo actualizaciones de seguridad, raras y
 * avisadas», así que un sondeo automático sería ruido casi todo el año.
 */
import { check } from '@tauri-apps/plugin-updater';
import { enTauri, invocar } from './Hub';

/**
 * ── POR QUÉ SE USA EL PAQUETE OFICIAL Y NO `invocar` A PELO ─────────────────
 * La primera versión llamaba `invocar('plugin:updater|download_and_install')`
 * sin argumentos, y en la caja salía:
 *
 *     invalid args `rid` for command `download_and_install`:
 *     command download_and_install missing required key rid
 *
 * El comando necesita DOS cosas: el `rid` —el identificador del recurso que
 * devolvió `check`, que vive en el proceso de Rust— y un `onEvent` que tiene
 * que ser un **Channel**, cuya serialización (`__CHANNEL__:<id>`) es un detalle
 * interno de Tauri. Replicar eso a mano son quince líneas apoyadas en un
 * contrato no documentado que se rompería en la siguiente actualización de
 * Tauri, y se rompería justo aquí: en el botón que un restaurante pulsa una vez
 * cada varios meses y nadie prueba.
 *
 * El resto del proyecto habla con Tauri por `invocar` a propósito, porque el
 * mismo bundle corre en los teléfonos. Aquí se hace la excepción: importar la
 * clase no ejecuta nada, y todas las llamadas siguen detrás de `enTauri()`.
 */

/**
 * El `Update` vivo entre buscar e instalar.
 *
 * No es un capricho de diseño: `rid` es un puntero a un recurso que vive en el
 * proceso de Rust, no un dato. Guardar el objeto es la forma que tiene el
 * plugin de que «instala esto» se refiera a lo mismo que se acaba de mirar.
 */
let pendiente = null;

/**
 * ¿Hay versión nueva?
 *
 * @returns {Promise<{hay: boolean, version?: string, actual?: string, notas?: string, error?: string}>}
 *   Nunca lanza. Sin red, o fuera de Tauri, devuelve `hay: false` con motivo —
 *   un fallo al buscar actualizaciones no puede molestar a nadie que esté
 *   cobrando.
 */
export async function buscarActualizacion() {
  if (!enTauri()) {
    return { hay: false, error: 'sólo desde la aplicación de escritorio' };
  }
  try {
    const r = await check();
    pendiente = r; // `null` si no hay nada nuevo, y entonces instalar no aplica
    if (!r) return { hay: false };
    return {
      hay: true,
      version: r.version || '',
      // La instalada. Antes la pantalla la sacaba de `hub_estado`, que no la
      // devuelve, así que enseñaba un guion para siempre.
      actual: r.currentVersion || '',
      notas: r.body || '',
    };
  } catch (e) {
    return { hay: false, error: String(e?.message || e) };
  }
}

/**
 * Descarga e instala. **Reinicia la aplicación al terminar.**
 *
 * Quien llame a esto ya tuvo que enseñar el aviso de Windows y el de «se va a
 * cerrar la caja»; este módulo no lo comprueba porque no puede, pero el texto
 * está en `docs/CHECKLIST_ACTUALIZACIONES.md` y en la pantalla de Ajustes.
 *
 * No hace falta decir «no lo hagas con una mesa abierta»: la cuenta y el
 * respaldo ya sobreviven a un reinicio. Pero sí conviene no hacerlo a las dos
 * de la tarde.
 */
export async function instalarActualizacion() {
  if (!enTauri()) return { ok: false, error: 'sólo desde la aplicación' };
  try {
    // Si la pantalla estuvo abierta mucho rato, o se recargó entre buscar e
    // instalar, el recurso pudo cerrarse. Se vuelve a preguntar en vez de
    // fallar con un error que hablaría de `rid`, que no significa nada para
    // quien lo lee.
    if (!pendiente) {
      pendiente = await check();
      if (!pendiente) {
        return { ok: false, error: 'ya no hay ninguna versión nueva' };
      }
    }
    await pendiente.downloadAndInstall();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e?.message || e) };
  }
}

/**
 * La versión que hay instalada ahora mismo.
 *
 * Se pregunta al propio Tauri (`plugin:app|version`) y no al hub: `hub_estado`
 * no devuelve la versión, así que la pantalla enseñaba «Versión instalada: —»
 * pasara lo que pasara. Otro selector que mentía sin dar error.
 */
export async function versionInstalada() {
  if (!enTauri()) return '';
  try {
    return String((await invocar('plugin:app|version')) || '');
  } catch {
    return '';
  }
}

/**
 * El texto del aviso. Vive aquí y no en la pantalla porque es la parte que hay
 * que acertar: si no se dice lo del aviso de Windows ANTES, el cliente lo
 * interpreta como que la app está infectada.
 */
export function avisoDeActualizacion(version, notas = '') {
  // Las notas van PRIMERO y separadas: es lo único del aviso que responde a la
  // pregunta que de verdad se hace quien lo lee —«¿esto para qué es?»— y sin
  // ellas el resto suena a trámite.
  //
  // Se descubrió que `buscarActualizacion` las traía y nadie las enseñaba: el
  // texto viajaba desde el `latest.json` hasta aquí para morir. Justo el tipo
  // de cosa que no da error.
  const cuerpo = String(notas || '').trim();

  return [
    version ? `Hay una versión nueva (${version}).` : 'Hay una versión nueva.',
    ...(cuerpo ? ['', cuerpo] : []),
    '',
    'Al instalarla, la caja se va a cerrar y volver a abrir sola.',
    '',
    'Windows va a mostrar un aviso azul diciendo que no reconoce el programa. ' +
      'Es normal y pasa en cada actualización: hay que pulsar «Más información» ' +
      'y luego «Ejecutar de todas formas».',
    '',
    'Conviene hacerlo con el local cerrado, no en hora de comida.',
  ].join('\n');
}
