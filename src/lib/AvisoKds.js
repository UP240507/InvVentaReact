/**
 * AvisoKds.js — qué comandas son NUEVAS para esta pantalla.
 *
 * ── POR QUÉ ES UNA FUNCIÓN PURA Y NO UN EFECTO ──────────────────────────────
 * La parte difícil de «avisar cuando llega algo» no es el sonido: es decidir
 * qué cuenta como llegada. Y ahí hay dos errores clásicos que sólo se ven en
 * producción, con la cocina llena:
 *
 *   1. **Avisar de todo al montar.** La primera vez que la pantalla se abre hay
 *      seis comandas en curso; si se tratan como nuevas, suenan seis pitidos
 *      seguidos cada vez que alguien recarga el KDS. Se resuelve sembrando la
 *      memoria en la primera pasada y no avisando de nada.
 *
 *   2. **Volver a avisar de lo mismo.** El KDS recalcula su lista cada vez que
 *      cambia cualquier comanda —marcar un item listo, por ejemplo—. Si se
 *      compara por longitud o por contenido, cualquier cambio parece una
 *      llegada. Se compara por IDENTIDAD: sólo es nueva la comanda cuyo id no
 *      se había visto nunca.
 *
 * Al estar aquí, las dos reglas se prueban sin montar React, sin temporizadores
 * y sin audio.
 */

/**
 * Comandas que aparecen por primera vez.
 *
 * @param {Set<string>|null} vistas ids ya conocidos. `null` = primera pasada.
 * @param {Array} comandas las de la estación, ya filtradas por quien llama.
 * @returns {{nuevas: Array, vistas: Set<string>}} las nuevas y la memoria
 *   actualizada. Devolver la memoria en vez de mutarla mantiene la función
 *   pura y deja que el llamador decida cuándo confirmarla.
 */
export function comandasNuevas(vistas, comandas = []) {
  const lista = Array.isArray(comandas) ? comandas : [];
  const ids = lista.map((c) => String(c?.id ?? '')).filter(Boolean);

  // Primera pasada: se siembra y NO se avisa. Lo que ya estaba en la pantalla
  // cuando se abrió no acaba de llegar.
  if (vistas == null) {
    return { nuevas: [], vistas: new Set(ids) };
  }

  const nuevas = lista.filter(
    (c) => c?.id != null && !vistas.has(String(c.id)),
  );

  // La memoria se queda SÓLO con lo que sigue en pantalla. Si no se podara,
  // crecería todo el turno; y además una comanda que se entrega y luego se
  // reabre —pasa con las devoluciones— volvería a ser una llegada, que es lo
  // correcto: para cocina, vuelve a haber trabajo.
  return { nuevas, vistas: new Set(ids) };
}

/**
 * El texto del aviso. Corto a propósito: se lee de lejos y de reojo.
 *
 * Una comanda → «Mesa 4 · 3 platillos». Varias a la vez → «3 comandas nuevas».
 * Enumerar tres mesas en una notificación del sistema no cabe, y en la franja
 * de la pantalla compite con la propia lista, que ya las enseña.
 */
/**
 * ¿A esta sesión le suena el KDS?
 *
 * Sólo a quien tiene el KDS como puesto de trabajo: Chef y Barista, cuya
 * `ruta_inicial` ES `/kds`. Se pregunta por la capacidad y no por el nombre del
 * rol porque `roles_permisos` es editable por restaurante — si mañana AZUL crea
 * «Parrillero» y lo manda al KDS, le suena sin tocar código.
 *
 * Queda fuera quien tenga `gestion` (Admin, Gerente): entran a supervisar, y un
 * pitido cada vez que cae una comanda mientras revisan el monitor desde la
 * oficina es ruido, no aviso. También queda fuera el mesero, que ve el KDS de
 * paso pero no cocina.
 */
export function puedeRecibirAvisos(cap) {
  if (!cap) return false;
  if (cap.gestion) return false;
  return cap.ruta_inicial === '/kds';
}

/**
 * Por dónde sale el aviso.
 *
 * Es lo que pidió Chris: «no todo el tiempo la cocina estará pendiente del KDS,
 * a lo mejor salen a checar WhatsApp». Si la pestaña está oculta el aviso tiene
 * que salir del navegador; si está a la vista, una notificación del sistema
 * encima de la propia pantalla sobra y además Chrome la suprime.
 *
 * @returns {'sistema'|'pantalla'} `'sistema'` sólo si además hay permiso: sin
 *   él la notificación no aparecería y el aviso se perdería en silencio, que es
 *   exactamente el fallo que no queremos.
 */
export function canalDeAviso({ oculto = false, permiso = 'default' } = {}) {
  return oculto && permiso === 'granted' ? 'sistema' : 'pantalla';
}

export function textoDeAviso(nuevas = [], estacion = '') {
  const lista = Array.isArray(nuevas) ? nuevas : [];
  if (lista.length === 0) return null;

  const donde = estacion ? `${estacion}: ` : '';

  if (lista.length > 1) {
    return `${donde}${lista.length} comandas nuevas`;
  }

  const c = lista[0];
  const mesa = c?.mesa || c?.mesa_nombre || 'Mostrador';
  const n = (c?._itemsEstacion || c?.items || []).length;
  const platillos = n === 1 ? '1 platillo' : `${n} platillos`;
  return `${donde}${mesa} · ${platillos}`;
}
