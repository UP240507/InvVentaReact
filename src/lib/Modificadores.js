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
 * ── EL ALCANCE, ENTONCES Y AHORA ────────────────────────────────────────────
 * Hasta el 01-oct **las opciones no sumaban precio ni descontaban inventario**,
 * a propósito: era la condición para que esto entrara dos días antes de la
 * prueba de campo de agosto sin meter código nuevo en el camino del stock.
 *
 * Desde el 01-oct sí, vía `lineaConOpciones()`: el precio de la opción se suma
 * a la línea y su insumo entra en los insumos de la línea, que es lo que leen
 * el cobro, la comanda de mesa y `verificarStock`. Ver la cabecera de esa
 * función para el modelo.
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
 * Aquí es donde viajan `precio`, `id_producto` y `cantidad`, y salen de una
 * sola función: `lineaConOpciones()` los consume desde aquí y de ningún otro
 * sitio, así que un cambio de nombre en el catálogo se arregla en un lugar.
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
        // El catálogo guarda `precio_extra` (ModificadoresScreen); aquí se
        // leía `precio`, que no existe en ninguna opción real. Nadie lo
        // notó porque nadie consumía el dato: el día que se conectara, los
        // extras habrían salido gratis sin un solo error. `precio` queda de
        // respaldo para opciones que alguien escribiera a mano.
        precio: op?.precio_extra ?? op?.precio ?? null,
        id_producto: op?.id_producto ?? null,
        cantidad: op?.cantidad ?? null,
        // Si viene, la opción no AGREGA su insumo: CAMBIA este de la receta
        // por el suyo, en la misma cantidad. Ver `lineaConOpciones`.
        sustituye: op?.sustituye ?? null,
        // Varios insumos (07-oct). Si la opción trae lista, manda la lista;
        // si no, los tres campos de arriba son su único insumo. Ver
        // `insumosDeOpcion`.
        insumos: Array.isArray(op?.insumos) ? op.insumos : null,
      });
    }
  }
  return out;
}

/** A centavos enteros y de vuelta: sumar 3.10 + 0.20 en coma flotante no da 3.30. */
const aCentavos = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
};

/**
 * Los insumos de UNA opción, siempre como lista.
 *
 * ── VARIOS INSUMOS POR OPCIÓN (Chris, 07-oct) ───────────────────────────────
 * Hasta hoy una opción descontaba un solo insumo, y eso obligaba a mentir de
 * dos maneras: o «Miel y canela» descontaba sólo la miel, o cada Soda
 * Italiana Mix era una receta aparte y la caja dejaba de parecerse a la
 * carta. Ahora la opción puede traer `insumos: [{ id_producto, cantidad,
 * sustituye }]`.
 *
 * Una opción guardada antes —con `id_producto`, `cantidad` y `sustituye`
 * sueltos— se lee como una lista de uno, así que nada de lo que ya existe
 * cambia de comportamiento. Y la pantalla, al guardar una opción con lista,
 * copia el primer renglón a esos campos sueltos: una caja que todavía no se
 * actualiza sigue descontando al menos ese insumo mientras dura el cambio de
 * versión.
 *
 * @returns {Array<{id_producto, cantidad, sustituye}>}
 */
export function insumosDeOpcion(op) {
  const valido = (i) => i && i.id_producto != null && i.id_producto !== '';
  if (Array.isArray(op?.insumos) && op.insumos.length > 0) {
    return op.insumos.filter(valido).map((i) => ({
      id_producto: i.id_producto,
      cantidad: i.cantidad ?? null,
      sustituye: i.sustituye ?? null,
    }));
  }
  const uno = {
    id_producto: op?.id_producto,
    cantidad: op?.cantidad ?? null,
    sustituye: op?.sustituye ?? null,
  };
  return valido(uno) ? [uno] : [];
}

/**
 * Lo que las opciones elegidas le hacen a la línea: precio e insumos.
 *
 * ── EL MODELO (decidido con Chris, 01-oct) ─────────────────────────────────
 * Un extra es **un insumo, una cantidad y un precio colgados de la opción** —
 * los tres campos que el catálogo de modificadores ya pedía desde el principio.
 * No es un producto vendible con receta propia, que era lo que proponía el
 * diseño del 14-ago: para las bebidas de AZUL (shot, crema, jarabe, leche
 * vegetal) un extra siempre es un solo insumo, y el modelo simple no cierra la
 * puerta al otro.
 *
 * El mismo mecanismo sirve para configurar: si el latte NO lleva leche en su
 * receta y el grupo obligatorio «Tipo de leche» aporta 240 ml del insumo
 * elegido, el inventario descuenta la leche que de verdad se sirvió sin ninguna
 * lógica de sustitución.
 *
 * ── LAS REGLAS ──────────────────────────────────────────────────────────────
 * - Sólo suma precio una opción con precio POSITIVO. «Quitar» no abarata el
 *   platillo (DISENO_MODIFICADORES §4), así que un negativo no resta.
 * - Sólo descuenta stock una opción con insumo y cantidad POSITIVA. Una opción
 *   como «Término medio» no tiene ninguno de los dos y no toca nada.
 * - La cantidad de la opción es POR UNIDAD del platillo: el motor de stock ya
 *   multiplica cada insumo por la cantidad de la línea.
 * - `precio_extras` viaja aparte para que el servidor pueda cotejar el precio
 *   del catálogo contra el precio SIN extras. Si sólo viajara el total, cada
 *   latte con shot saldría como divergencia de precio.
 *
 * @param {object} args
 * @param {number} args.precioBase  precio de catálogo del platillo
 * @param {Array}  args.insumos     insumos de la receta, tal cual
 * @param {Array}  args.elegidas    salida de `opcionesElegidas()`
 * @returns {{ precio:number, precio_base:number, precio_extras:number, insumos:Array }}
 */
export function lineaConOpciones({
  precioBase = 0,
  insumos = [],
  elegidas = [],
} = {}) {
  const lista = Array.isArray(elegidas) ? elegidas : [];

  const extrasCent = lista.reduce((acc, o) => {
    const c = aCentavos(o?.precio);
    return c > 0 ? acc + c : acc;
  }, 0);
  const baseCent = aCentavos(precioBase);

  // Cada opción puede traer varios insumos (07-oct): «Tres leches» descuenta
  // condensada, evaporada y crema; «Fresa-Limón», dos jarabes. Se aplanan a
  // una sola lista y cada renglón hace una de dos cosas: agrega su cantidad o
  // sustituye un insumo de la receta.
  const conInsumo = lista.flatMap(insumosDeOpcion);
  const esSustitucion = (o) => o?.sustituye != null && o.sustituye !== '';

  // ── SUSTITUIR (07-oct) ────────────────────────────────────────────────────
  // «Deslactosada» no AGREGA leche: cambia la entera de la receta por la
  // deslactosada, en la cantidad que traiga cada receta. Así un solo grupo
  // «Tipo de leche» sirve para un frappé de 50 ml y un smoothie de 300 ml, y
  // la cantidad la pone quien captura la receta, no el grupo. Es también el
  // requisito de AZUL «sustituir un ingrediente sin abaratar el platillo»: el
  // precio de la opción se cobra igual, sea 0 o +$6.
  //
  // Si la receta no lleva el insumo que se sustituye, no se toca el stock (no
  // hay nada que cambiar) y el precio de la opción se cobra igual.
  const sustituciones = conInsumo.filter(esSustitucion);
  const base = (Array.isArray(insumos) ? insumos : []).map((ins) => {
    const pid = String(ins?.productoId ?? ins?.id_producto);
    const s = sustituciones.find((o) => String(o.sustituye) === pid);
    if (!s) return ins;
    const { id_producto, ...resto } = ins;
    return { ...resto, productoId: s.id_producto };
  });

  const deOpciones = conInsumo
    .filter((o) => !esSustitucion(o))
    .map((o) => ({ productoId: o.id_producto, cantidad: Number(o.cantidad) }))
    .filter((i) => Number.isFinite(i.cantidad) && i.cantidad > 0);

  return {
    precio: (baseCent + extrasCent) / 100,
    precio_base: baseCent / 100,
    precio_extras: extrasCent / 100,
    insumos: [...base, ...deOpciones],
  };
}

/**
 * El precio y los insumos de partida de una línea, ANTES de sus opciones.
 *
 * ── EL FALLO QUE EVITA ──────────────────────────────────────────────────────
 * El cuadro de «¿cómo lo quiere?» se reabre sobre una línea del carrito para
 * cambiarle la nota (`abrirNotaDeLinea`), y en ese caso lo que llega como
 * «producto» es la LÍNEA, que ya lleva los extras sumados y sus insumos
 * agregados. Partir de ahí cobraría el shot dos veces y descontaría el café
 * dos veces, cada vez que alguien tocara la nota.
 *
 * Por eso la línea guarda su base (`precio_base`, `insumos_base`) y se parte
 * siempre de ella. Una línea sin esos campos es un platillo recién tocado en
 * el menú, o una orden de mesa guardada antes del 01-oct: en los dos casos su
 * precio y sus insumos SON la base.
 *
 * @param {object} producto            receta del catálogo o línea del carrito
 * @param {number} precioDeCatalogo    lo que `getPrecio(producto)` devuelve
 */
export function baseDeLinea(producto, precioDeCatalogo = 0) {
  const tieneBase =
    producto?.precio_base != null && producto.precio_base !== '';
  return {
    precioBase: tieneBase ? Number(producto.precio_base) : precioDeCatalogo,
    insumos: Array.isArray(producto?.insumos_base)
      ? producto.insumos_base
      : Array.isArray(producto?.insumos)
        ? producto.insumos
        : [],
  };
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

/**
 * Reparte una línea del carrito cuando se le pone (o se le cambia) una nota.
 *
 * ── EL FALLO QUE ARREGLA (Chris, 21-ago) ───────────────────────────────────
 * «Si ya mandé una pizza a producción y de rato quiero mandar otra pero con
 * nota, no me deja.» El camino era éste: la pizza sale a cocina; más tarde se
 * toca Pizza otra vez y —al no tener grupos— entra directa y SE FUNDE con la
 * línea que ya existe («2x, Enviado 1»); se toca el icono de nota y la
 * pantalla lo frena, porque miraba `cantidad_enviada > 0` y con eso cerraba la
 * línea entera. Quedabas atrapado: la única vía a la nota era esa línea, y esa
 * línea estaba cerrada.
 *
 * ── LA REGLA, Y POR QUÉ NO ES «DEJARLO EDITAR» ─────────────────────────────
 * Reescribir la nota de unas unidades que ya están en la plancha no cambiaría
 * el papel que el cocinero tiene en la mano: la pantalla diría una cosa y la
 * cocina estaría haciendo otra. Eso sigue prohibido, y con razón.
 *
 * Lo que estaba mal era el ALCANCE. Así que no se edita: **se parte**. Lo
 * enviado se queda donde estaba con su nota original, y lo que aún no ha
 * salido se va a una línea nueva con la nota nueva. `firmaDeLinea` ya mete la
 * nota dentro del id, así que las dos líneas conviven sin tocar el modelo.
 *
 * ── POR QUÉ VIVE AQUÍ Y NO DENTRO DEL COMPONENTE ───────────────────────────
 * Porque es aritmética sobre el carrito —cuántas se mueven, cuántas se
 * quedan— y eso se puede probar. Dentro del `setCarrito` no lo miraría nadie
 * hasta que un mesero cobrara de menos.
 *
 * @param {Array}  carrito   Líneas actuales.
 * @param {object} opciones
 * @param {string} opciones.lineaId  Línea que se está anotando. `null` = alta.
 * @param {string} opciones.lineId   Id nuevo, ya calculado con `firmaDeLinea`.
 * @param {object} opciones.base     La línea nueva sin cantidad.
 * @returns {Array} El carrito resultante. El mismo objeto si no hay nada que
 *   mover, para que React no repinte de balde.
 */
export function repartirPorNota(carrito = [], { lineaId, lineId, base } = {}) {
  const prev = Array.isArray(carrito) ? carrito : [];
  const numero = (v, x = 0) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : x;
  };

  const anterior = lineaId ? prev.find((i) => i.id === lineaId) : null;
  const enviadas = numero(anterior?.cantidad_enviada, 0);
  const total = anterior ? numero(anterior.cantidad, 1) : 1;

  // Sólo viaja lo que no ha salido. Ésta es la regla entera.
  const traslado = anterior ? Math.max(total - enviadas, 0) : 1;
  if (anterior && traslado === 0) return prev;

  // Con unidades enviadas la línea vieja SOBREVIVE con ellas; sin ninguna
  // desaparece, que es el caso de siempre: una corrección.
  const resto =
    anterior && enviadas > 0
      ? prev.map((i) => (i.id === lineaId ? { ...i, cantidad: enviadas } : i))
      : lineaId
        ? prev.filter((i) => i.id !== lineaId)
        : prev;

  // Confirmar sin cambiar nada da `lineId === lineaId`: partir y volver a
  // juntar, y el carrito queda igual que estaba.
  if (resto.some((i) => i.id === lineId)) {
    return resto.map((i) =>
      i.id === lineId
        ? { ...i, cantidad: numero(i.cantidad, 0) + traslado }
        : i,
    );
  }

  return [
    ...resto,
    {
      ...base,
      cantidad: traslado,
      // Cero, y no lo que llevara la anterior: aquí sólo se han movido
      // unidades que NO han salido. Heredar el contador dejaría unidades
      // marcadas como enviadas sin comanda que las respalde, y el POS se
      // negaría a quitarlas para siempre.
      cantidad_enviada: 0,
      descuento: anterior?.descuento ?? base?.descuento ?? null,
    },
  ];
}
