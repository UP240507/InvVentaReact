/**
 * Modificadores.js — «¿cómo lo quiere?» antes de que el platillo entre al carrito.
 *
 * ── QUÉ ESTABA PASANDO (13-ago) ─────────────────────────────────────────────
 * El catálogo de grupos existía (`Catálogos → Modificadores`), el enlace a los
 * platillos existía (`receta.grupos_modificadores`, en Recetas), la comanda
 * sabía pintar `nota` y `sublineas`, y el KDS pintaba el 📝. **Todo el camino
 * estaba construido menos el trozo que produce el dato.** El POS no tenía una
 * sola referencia a modificadores ni a notas: cero.
 *
 * Así que un mesero no podía pedir «término medio». No fallaba nada: no había
 * dónde escribirlo. La sexta de la semana en la familia de errores que no dan
 * error.
 *
 * ── POR QUÉ ESTA LÓGICA VIVE FUERA DE REACT ─────────────────────────────────
 * Porque las reglas son una matriz de 2×2 (única/múltiple × obligatorio/no) y
 * dos de las cuatro casillas no son obvias ni para quien las configura. Metida
 * en el JSX del modal, la única forma de comprobarla sería a mano, tocando la
 * pantalla, que es justo lo que no se va a hacer un viernes por la noche.
 *
 * ── EL ALCANCE ES DELIBERADAMENTE CORTO ─────────────────────────────────────
 * **Las opciones NO suman precio ni descuentan inventario.** No es un olvido:
 * es la condición para que esto pueda entrar dos días antes de la prueba de
 * campo. Lo que se verifica el sábado es que el stock se descuenta bien; meter
 * código nuevo en el camino del inventario esa misma semana convertiría un
 * fallo de modificadores en un fallo de inventario, y no habría forma de saber
 * cuál de los dos fue.
 *
 * Los campos `precio` e `id_producto` de cada opción SE LEEN y se dejan
 * disponibles en `opcionesElegidas()` — para que el día que se conecten no haya
 * que volver a tocar esto — pero nadie los consume todavía. Ver
 * `docs/PENDIENTE_LUNES.md` §8.
 */

/** Una selección siempre es `{ [grupoId]: [opcionId, ...] }`. */
const vacia = Object.freeze({});

const idTexto = (v) => (v == null ? '' : String(v));

/**
 * Los grupos que aplican a un platillo, resueltos contra el catálogo vivo.
 *
 * Los ids que ya no existen **se descartan en silencio y a propósito**: borrar
 * un grupo del catálogo no debe dejar un platillo invendible. `RecetasScreen`
 * hace borrado lógico justamente para que esto sea raro, pero raro no es nunca.
 *
 * @param {object} producto   una receta; se lee `grupos_modificadores`
 * @param {Array}  catalogo   `useAppStore().modificadores`
 * @returns {Array} grupos, en el orden en que los ató el platillo
 */
export function gruposDeProducto(producto, catalogo = []) {
  const ids = Array.isArray(producto?.grupos_modificadores)
    ? producto.grupos_modificadores
    : [];
  if (ids.length === 0) return [];

  const porId = new Map(
    (Array.isArray(catalogo) ? catalogo : [])
      .filter((g) => g && g.activo !== false)
      .map((g) => [idTexto(g.id), g]),
  );

  return ids
    .map((id) => porId.get(idTexto(id)))
    .filter(Boolean)
    .map((g) => ({
      ...g,
      // Se normaliza aquí y no en cada consumidor: un grupo guardado antes de
      // que el campo existiera llega sin `tipo`, y el valor por defecto tiene
      // que ser el que menos daño hace. `multiple` no obliga a nada.
      tipo: g.tipo === 'unica' ? 'unica' : 'multiple',
      obligatorio: g.obligatorio === true,
      opciones: Array.isArray(g.opciones) ? g.opciones : [],
    }));
}

/**
 * ¿Hay que abrir el modal al tocar este platillo?
 *
 * Devuelve `true` sólo si el platillo tiene grupos. **La nota libre no cuenta**:
 * si abriera el modal para todo, cada taco costaría dos toques en vez de uno y
 * el POS dejaría de servir en una barra con cola. La nota se pone desde la
 * línea del carrito, que es donde estorba a nadie.
 */
export function necesitaEleccion(producto, catalogo = []) {
  return gruposDeProducto(producto, catalogo).length > 0;
}

/**
 * Marca o desmarca una opción, respetando el tipo del grupo.
 *
 * `unica` sustituye; `multiple` alterna. Devuelve una selección NUEVA — nadie
 * muta el estado de React por debajo.
 */
export function alternar(grupo, seleccion = vacia, opcionId) {
  const gid = idTexto(grupo?.id);
  const oid = idTexto(opcionId);
  if (!gid || !oid) return seleccion;

  const actuales = (seleccion[gid] || []).map(idTexto);

  if (grupo?.tipo === 'unica') {
    // Volver a tocar la que ya estaba la quita. Sin esto, un grupo NO
    // obligatorio marcado por error no se puede desmarcar nunca.
    return { ...seleccion, [gid]: actuales.includes(oid) ? [] : [oid] };
  }

  return {
    ...seleccion,
    [gid]: actuales.includes(oid)
      ? actuales.filter((x) => x !== oid)
      : [...actuales, oid],
  };
}

/**
 * Los grupos obligatorios que siguen sin respuesta, por nombre.
 *
 * Se devuelven los NOMBRES y no un booleano porque el modal tiene que poder
 * decir *cuál* falta. Un botón desactivado sin decir por qué es una pantalla
 * que no se puede usar.
 */
export function faltantes(grupos = [], seleccion = vacia) {
  return grupos
    .filter((g) => {
      if (!g?.obligatorio) return false;
      // Un grupo obligatorio SIN opciones es imposible de satisfacer. Si
      // contara como pendiente, el platillo no se podría vender nunca y el
      // mesero no tendría forma de salir del modal. Se ignora.
      if ((g.opciones || []).length === 0) return false;
      return (seleccion[idTexto(g.id)] || []).length === 0;
    })
    .map((g) => g.nombre || 'Sin nombre');
}

/** Atajo para el `disabled` del botón. */
export function seleccionCompleta(grupos = [], seleccion = vacia) {
  return faltantes(grupos, seleccion).length === 0;
}

/**
 * Las opciones elegidas, aplanadas y con su grupo al lado.
 *
 * Aquí es donde viajan `precio`, `id_producto` y `cantidad` — hoy nadie los
 * mira (ver la cabecera), pero salen de una sola función para que conectarlos
 * el día de mañana sea un cambio en un sitio y no una búsqueda por el repo.
 */
export function opcionesElegidas(grupos = [], seleccion = vacia) {
  const out = [];
  for (const g of grupos) {
    const elegidas = (seleccion[idTexto(g.id)] || []).map(idTexto);
    if (elegidas.length === 0) continue;
    for (const op of g.opciones || []) {
      if (!elegidas.includes(idTexto(op?.id_opcion))) continue;
      out.push({
        grupo_id: g.id,
        grupo: g.nombre || '',
        id_opcion: op.id_opcion,
        nombre: op?.nombre || '',
        // Se conservan tal cual vienen. No se convierten a número ni se ponen
        // a 0: un `null` dice «no configurado» y un 0 diría «configurado en
        // cero», y esa diferencia importará cuando esto se conecte.
        precio: op?.precio ?? null,
        id_producto: op?.id_producto ?? null,
        cantidad: op?.cantidad ?? null,
      });
    }
  }
  return out;
}

/**
 * Lo que se imprime debajo de la línea, en cocina y en el ticket.
 *
 * Los dos espacios de delante son el formato que ya usan los paquetes en
 * `Comanda.js`; se repiten aquí para que las dos clases de sublínea salgan
 * indistinguibles en el papel. En una comanda a 32 columnas, dos sangrías
 * distintas se leen como un error de impresión.
 */
export function sublineasDe(grupos = [], seleccion = vacia) {
  return opcionesElegidas(grupos, seleccion).map((o) => `  ${o.nombre}`);
}

/**
 * El id de la línea del carrito.
 *
 * **Esto es lo que impide el peor fallo de esta pantalla:** sin una firma que
 * incluya la selección y la nota, dos hamburguesas —una término medio y otra
 * bien cocida— se fusionarían en «2x Hamburguesa» y la cocina sacaría dos
 * iguales. El mesero no se entera hasta que el cliente devuelve el plato.
 *
 * Se ordenan las claves y los valores para que la misma elección hecha en
 * distinto orden dé la misma línea; si no, marcar A y luego B crearía una línea
 * distinta que marcar B y luego A.
 */
export function firmaDeLinea(productoId, seleccion = vacia, nota = '') {
  const partes = Object.keys(seleccion)
    .sort()
    .map(
      (gid) =>
        `${gid}=${[...(seleccion[gid] || [])].map(idTexto).sort().join(',')}`,
    )
    .filter((p) => !p.endsWith('='));

  const n = String(nota || '').trim();
  const sufijo = [partes.join('|'), n && `nota:${n}`].filter(Boolean).join('|');
  return sufijo ? `${idTexto(productoId)}::${sufijo}` : idTexto(productoId);
}

/**
 * La frase que dice qué va a vivir el cajero, en función de los dos controles.
 *
 * Existe porque el formulario del catálogo se contradecía a sí mismo: la
 * descripción de «Selección Múltiple» decía «puede elegir varios **o
 * ninguno**» y justo debajo había una casilla «El cajero DEBE seleccionar» que
 * la desmentía. Y la casilla obligatoria sobre un grupo múltiple —que significa
 * «al menos una»— no estaba escrita en ninguna parte.
 *
 * La misma función la usan el formulario del catálogo y el modal del POS, para
 * que lo que se promete al configurar sea literalmente el texto que se lee al
 * vender.
 */
export function textoDeReglas(grupo) {
  const unica = grupo?.tipo === 'unica';
  const obligatorio = grupo?.obligatorio === true;
  if (unica && obligatorio) return 'Hay que elegir una, y sólo una.';
  if (unica) return 'Se puede elegir una, o ninguna.';
  if (obligatorio) return 'Hay que elegir al menos una; puede elegir varias.';
  return 'Se pueden elegir varias, o ninguna.';
}

/**
 * En cuántas recetas está atado este grupo.
 *
 * ── LA TRAMPA QUE CIERRA ────────────────────────────────────────────────────
 * **Un grupo no hace absolutamente nada hasta que se ata a un platillo en
 * Recetas**, y eso no se anunciaba en ninguna parte. El recorrido del que lo
 * configura por primera vez es: crea el grupo, escribe sus opciones, lo guarda,
 * se va al POS a probarlo, toca el platillo… y no pasa nada. Hizo todo bien y
 * concluye que el sistema está roto. Es la parte del programa que Chris señaló
 * como la que más cuesta configurar (13-ago), y esta es su causa gorda.
 *
 * No falla nada, que es lo peor: no hay error que buscar ni pantalla que
 * culpar. Sólo silencio.
 *
 * Se cuenta aquí y no en la pantalla porque es una regla sobre los datos —qué
 * significa que un grupo esté «en uso»— y porque así se puede probar. La
 * comparación va por texto: los ids de receta y de grupo llegan de la base como
 * números o como cadenas según el camino, y un `===` crudo daría cero justo
 * cuando hay algo.
 */
export function recetasQueUsan(grupoId, recetas = []) {
  const id = idTexto(grupoId);
  if (!id) return 0;
  return (Array.isArray(recetas) ? recetas : []).filter((r) =>
    (Array.isArray(r?.grupos_modificadores) ? r.grupos_modificadores : []).some(
      (g) => idTexto(g) === id,
    ),
  ).length;
}
