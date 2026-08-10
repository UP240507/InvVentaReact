// ─── SANEADO DE PAYLOADS ANTES DE PERSISTIR ──────────────────────────────────
// Bug real (27-jul-2026): dos recetas quedaron en dead-letter con
// `Could not find the '_costo' column of 'recetas' in the schema cache`.
//
// La causa: la tabla de Recetas decora cada fila con campos calculados para
// poder ordenar por rentabilidad (`_costo`, `_precio`, `_margen`). Al ocultar
// un platillo se hacía `{ ...fila, activo: false }`, así que esos campos —que
// no son columnas— viajaban al upsert y PostgREST rechazaba la fila entera.
//
// El fallo es de una clase incómoda: la pantalla decía "ocultado", el cambio
// quedaba en el equipo, y solo NO estaba en la nube. Por eso la regla no vive
// en la pantalla sino aquí: cualquier vista puede decorar una fila para
// mostrarla, y ninguna debería tener que acordarse de desnudarla al guardar.
//
// Convención: el guion bajo inicial marca un campo DERIVADO, de interfaz.
// Verificado contra el esquema el 27-jul: ninguna columna de `public` empieza
// por `_`, así que el filtro no puede borrar un dato real.

/**
 * Quita las claves derivadas (`_algo`) del NIVEL SUPERIOR de una fila.
 *
 * Solo el nivel superior a propósito: las claves internas de una columna jsonb
 * (los insumos de una receta, por ejemplo) son contenido, no columnas, y ahí un
 * `_` puede ser legítimo. Bajar recursivamente borraría datos buenos.
 *
 * @param {object|Array|any} data fila, arreglo de filas, o cualquier otra cosa
 * @returns {any} lo mismo, sin campos derivados arriba
 */
export function sinCamposDerivados(data) {
  if (Array.isArray(data)) return data.map(sinCamposDerivados);
  if (!data || typeof data !== 'object' || data instanceof Date) return data;

  const limpio = {};
  for (const clave of Object.keys(data)) {
    if (clave.startsWith('_')) continue;
    limpio[clave] = data[clave];
  }
  return limpio;
}

/** ¿La fila trae campos derivados? Útil para avisar en desarrollo. */
export function camposDerivadosDe(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return [];
  return Object.keys(data).filter((k) => k.startsWith('_'));
}
