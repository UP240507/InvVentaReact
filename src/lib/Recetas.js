/**
 * Recetas.js — reglas del catálogo de platillos que se pueden probar.
 *
 * Nace el 22-ago con lo de duplicar. La pantalla tiene 1350 líneas y todo lo
 * que decide algo vive dentro de ella; sacar aquí lo que es una regla —y no
 * pintura— es lo que permite fijarlo con pruebas.
 */

/** Texto comparable: sin espacios de sobra y sin importar mayúsculas. */
const clave = (v) =>
  String(v ?? '')
    .trim()
    .toLowerCase();

/**
 * El nombre de una copia, sin chocar con lo que ya existe.
 *
 * ── POR QUÉ NUMERA EN VEZ DE PONER «(copia)» Y YA ──────────────────────────
 * Porque duplicar se usa en ráfaga: se saca un platillo base y se hacen tres
 * variantes seguidas. Con un sufijo fijo, la segunda copia se llamaría igual
 * que la primera, y en una lista de cien platillos dos filas idénticas no se
 * distinguen — se edita la equivocada y el error aparece semanas después en un
 * ticket.
 *
 * ── Y POR QUÉ NO SE ENCADENA «(copia) (copia)» ─────────────────────────────
 * Duplicar una copia da «Tacos (copia 2)», no «Tacos (copia) (copia)». El
 * nombre crece una vez y deja de crecer; si no, a la cuarta variante el nombre
 * ya no cabe en el botón del POS ni en la comanda de cocina.
 *
 * @param {string} nombre    El de la receta original.
 * @param {Array}  recetas   Todas, para no chocar.
 * @returns {string}
 */
export function nombreDeCopia(nombre, recetas = []) {
  const base = String(nombre ?? '').trim() || 'Sin nombre';
  // Si ya es una copia, se numera la raíz en vez de anidar sufijos.
  const raiz = base.replace(/\s*\(copia(?:\s+\d+)?\)\s*$/i, '').trim() || base;

  const usados = new Set(
    (Array.isArray(recetas) ? recetas : []).map((r) => clave(r?.nombre)),
  );

  const candidato = (n) =>
    n === 1 ? `${raiz} (copia)` : `${raiz} (copia ${n})`;
  let n = 1;
  // El tope no es por miedo a un bucle infinito: es que si alguien tiene 99
  // copias del mismo platillo, el problema no es el nombre.
  while (n < 100 && usados.has(clave(candidato(n)))) n += 1;
  return candidato(n);
}

/**
 * La copia de una receta, lista para abrir en el formulario.
 *
 * ── LO QUE NO SE COPIA, Y ES LO IMPORTANTE ─────────────────────────────────
 *
 * **`id`** — la copia todavía no existe. Se le asigna al guardar, como a
 * cualquier receta nueva. Copiarlo sobrescribiría el original.
 *
 * **`codigo_pos`** — y esto se comprobó contra la base antes de decidirlo:
 * **la columna NO tiene índice único ni constraint**. O sea que dos platillos
 * con el mismo código entran sin dar un solo error, y a partir de ahí quien
 * busque por código se lleva uno de los dos —siempre el mismo, y no
 * necesariamente el que quería—. Un duplicado que el sistema acepta en
 * silencio es peor que uno que rechaza.
 *
 * **`activo`** — la copia nace visible. Heredar «oculto del menú» de un
 * platillo archivado daría una receta nueva que no aparece en el POS sin que
 * nadie sepa por qué.
 *
 * Lo que SÍ se copia es todo lo que cuesta teclear: los insumos con sus
 * cantidades y mermas, los componentes del paquete, los grupos de
 * modificadores, la categoría y el precio. Que es el motivo entero de que
 * exista este botón.
 *
 * ── NO GUARDA ──────────────────────────────────────────────────────────────
 * Devuelve el formulario relleno y ya. Autoguardar dejaría filas «(copia)» en
 * el catálogo cada vez que alguien pulsa por error, y en una pantalla que ya
 * cuesta configurar, la basura silenciosa es lo último que hace falta.
 */
/**
 * Los campos que NO viajan a la copia. Lista con nombre en vez de una
 * desestructuración con variables tiradas: aquí lo que se excluye es la
 * decisión, así que merece leerse de un vistazo y no deducirse de un `...resto`.
 */
const NO_SE_COPIA = new Set(['id', 'codigo_pos', 'created_at', 'activo']);

export function copiaDeReceta(receta, recetas = []) {
  if (!receta || typeof receta !== 'object') return null;

  const resto = Object.fromEntries(
    Object.entries(receta).filter(([campo]) => !NO_SE_COPIA.has(campo)),
  );

  return {
    ...resto,
    nombre: nombreDeCopia(receta.nombre, recetas),
    codigo_pos: '',
    activo: true,
    // Arrays nuevos, no los del original: el formulario los muta al editar, y
    // compartir la referencia haría que tocar la copia cambiara la receta de
    // la que salió. Sin error, y descubierto al mirar un costo que no cuadra.
    insumos: (receta.insumos || receta.ingredientes || []).map((i) => ({
      ...i,
    })),
    componentes: (receta.componentes || []).map((c) => ({
      ...c,
      ...(Array.isArray(c?.opciones)
        ? { opciones: c.opciones.map((o) => ({ ...o })) }
        : {}),
    })),
    grupos_modificadores: [...(receta.grupos_modificadores || [])],
  };
}
