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
import { enTauri, invocar } from './Hub';

/**
 * ¿Hay versión nueva?
 *
 * @returns {Promise<{hay: boolean, version?: string, notas?: string, error?: string}>}
 *   Nunca lanza. Sin red, o fuera de Tauri, devuelve `hay: false` con motivo —
 *   un fallo al buscar actualizaciones no puede molestar a nadie que esté
 *   cobrando.
 */
export async function buscarActualizacion() {
  if (!enTauri()) {
    return { hay: false, error: 'sólo desde la aplicación de escritorio' };
  }
  try {
    const r = await invocar('plugin:updater|check');
    // El plugin devuelve `null` cuando no hay nada nuevo.
    if (!r) return { hay: false };
    return {
      hay: true,
      version: r.version || r.currentVersion || '',
      notas: r.body || r.notes || '',
      // Se devuelve el identificador para que `instalar` sepa qué aplicar sin
      // volver a preguntar; si el plugin no lo da, `instalar` vuelve a buscar.
      rid: r.rid ?? null,
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
    await invocar('plugin:updater|download_and_install');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e?.message || e) };
  }
}

/**
 * El texto del aviso. Vive aquí y no en la pantalla porque es la parte que hay
 * que acertar: si no se dice lo del aviso de Windows ANTES, el cliente lo
 * interpreta como que la app está infectada.
 */
export function avisoDeActualizacion(version) {
  return [
    version ? `Hay una versión nueva (${version}).` : 'Hay una versión nueva.',
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
