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

// ─── EL SELECTOR DE INSUMOS QUE SÍ BUSCA ────────────────────────────────────

/**
 * Texto comparable para buscar: sin acentos, sin mayúsculas, sin espacios de
 * sobra.
 *
 * ── POR QUÉ QUITAR ACENTOS NO ES UN LUJO ───────────────────────────────────
 * Es español y se teclea con prisa. «limon» tiene que encontrar «Limón»,
 * «platano» a «Plátano», «jitomate» a «Jitomate». Sin esto, el buscador
 * funciona sólo si escribes el acento — y quien carga un catálogo de cien
 * ingredientes no lo escribe. El resultado sería «no hay coincidencias» sobre
 * un insumo que existe, que es peor que no tener buscador: hace creer que el
 * ingrediente falta y lleva a darlo de alta dos veces.
 */
export function normalizaBusqueda(v) {
  return (
    String(v ?? '')
      .normalize('NFD')
      // Los diacríticos combinantes, por punto de código y no como caracteres
      // literales: escritos a pelo son invisibles en el editor y un reencodeo
      // del archivo los rompería sin que nadie lo viera — y el síntoma sería que
      // «limon» deja de encontrar «Limón», que es justo lo que esto arregla.
      .replace(/[\u0300-\u036f]/g, '')
      .trim()
      .toLowerCase()
  );
}

/**
 * Los insumos que casan con lo tecleado, ordenados por utilidad.
 *
 * ── QUÉ SUSTITUYE ──────────────────────────────────────────────────────────
 * Un `<select>` cuyo primer `<option>` decía «Buscar insumo en almacén…» **y no
 * buscaba nada**. Es el patrón de este proyecto en la interfaz: un control que
 * promete algo que no hace, señalado por Chris el 13-ago y sin arreglar hasta
 * hoy. Con nueve insumos —los que hay ahora— se nota poco; con los cien de un
 * catálogo cargado de verdad, es la diferencia entre teclear tres letras y
 * recorrer una lista desplegable con el ratón.
 *
 * ── EL ORDEN ───────────────────────────────────────────────────────────────
 * Primero lo que EMPIEZA por lo tecleado, después lo que lo contiene. Escribir
 * «que» debe ofrecer «Queso fresco» antes que «Bisquet», aunque los dos casen.
 * A igualdad, alfabético, para que la lista no baile entre pulsaciones.
 *
 * Los inactivos se quedan fuera: son insumos archivados y meterlos en una
 * receta nueva es resucitar por accidente algo que alguien retiró a propósito.
 */
export function filtrarInsumos(productos = [], texto = '') {
  const activos = (Array.isArray(productos) ? productos : []).filter(
    (p) => p?.activo !== false,
  );
  const q = normalizaBusqueda(texto);

  const ordenAlfabetico = (a, b) =>
    normalizaBusqueda(a?.nombre).localeCompare(normalizaBusqueda(b?.nombre));

  if (!q) return [...activos].sort(ordenAlfabetico);

  const conPuntaje = activos
    .map((p) => {
      const n = normalizaBusqueda(p?.nombre);
      if (n.startsWith(q)) return { p, puntaje: 0 };
      if (n.includes(q)) return { p, puntaje: 1 };
      return null;
    })
    .filter(Boolean);

  return conPuntaje
    .sort((a, b) => a.puntaje - b.puntaje || ordenAlfabetico(a.p, b.p))
    .map((x) => x.p);
}

/**
 * Mueve la selección dentro de la lista sin salirse por los extremos.
 *
 * Se corta en vez de dar la vuelta a propósito: en una lista larga, pulsar
 * ↓ una vez de más y aparecer arriba del todo desorienta más de lo que ayuda.
 * Y se devuelve `-1` cuando no hay nada que elegir, para que quien llama no
 * tenga que distinguir «ninguno» de «el primero».
 */
export function moverSeleccion(indice, paso, total) {
  if (!Number.isFinite(total) || total <= 0) return -1;
  const actual = Number.isFinite(indice) ? indice : -1;
  const siguiente = actual + (paso > 0 ? 1 : -1);
  return Math.max(0, Math.min(total - 1, siguiente < 0 ? 0 : siguiente));
}
