// src/lib/Catalogo.js — de dónde salen las unidades y las categorías
//
// ── POR QUÉ EXISTE ESTE FICHERO ──────────────────────────────────────────────
//
// Hasta el 01-sep la lista de unidades vivía DURA dentro de
// `IngredientesScreen.jsx`, y no coincidía con la que siembra
// `supabase/seed/plantilla_local.sql`:
//
//     la pantalla   kg  g  lt  ml  pza  caja  lata  paquete
//     la plantilla  kg  g  L   ml  pz   paq   caja  bolsa
//
// Cuatro de ocho distintas. Nada daba error: simplemente, el insumo capturado
// en la caja y el sembrado por la plantilla eran dos cosas que no se pueden
// sumar. En AZUL, con DIEZ insumos, ya convivían `pz` con `pza` y un `Bolsa`
// con mayúscula. Con doscientos eso es el inventario partido, y el costo
// promedio ponderado no olvida.
//
// ── LAS DOS REGLAS QUE GOBIERNAN ESTE MÓDULO ─────────────────────────────────
//
// 1. **La configuración manda; la constante sólo rescata.** Si el local tiene
//    su lista, se usa la suya. La constante es para que un local recién
//    instalado —o AZUL hoy, que tiene `unidades` en `[]`— pueda capturar desde
//    el primer minuto en vez de encontrarse un desplegable vacío.
//
// 2. **Lo que ya está en uso NUNCA desaparece del desplegable.** Es la regla
//    importante y es de las que no se ven: un `<select>` cuyo `value` no está
//    entre sus `<option>` enseña la primera opción, y al guardar cambia la
//    unidad del insumo SIN AVISAR. Preferir una lista limpia a costa de eso
//    sería cambiar datos del inventario en silencio. Así que lo que está en uso
//    y no está en la lista sale igual, pero APARTE: la pantalla lo enseña bajo
//    «ya en uso» para que se vea que hay que arreglarlo, en vez de esconderlo.
//
// Las categorías son DOS listas y no una: `categorias` es el MENÚ (lo que
// agrupa platillos en el POS y lo que `ZonasImpresionScreen` enruta a cocina o
// barra) y `categorias_insumo` es el ALMACÉN. Ver la migración
// `20260902030723_configuracion_categorias_insumo.sql`.

/**
 * Las unidades que vienen decididas de fábrica, y las mismas que siembra
 * `plantilla_local.sql`. Si aquí y allí dejan de coincidir, vuelve el fallo
 * que este fichero vino a cerrar: hay una prueba que lo comprueba.
 *
 * Sin sinónimos a propósito: ni `lt` junto a `L`, ni `pza` junto a `pz`.
 */
export const UNIDADES_BASE = [
  'kg',
  'g',
  'L',
  'ml',
  'pz',
  'paq',
  'caja',
  'bolsa',
];

/**
 * Categorías de ALMACÉN de fábrica. Valen para cualquier local —un almacén se
 * organiza igual en una taquería que en una cafetería—, por eso vienen
 * decididas.
 */
export const CATEGORIAS_INSUMO_BASE = [
  'Abarrotes',
  'Carnes',
  'Lácteos',
  'Frutas y verduras',
  'Bebidas',
  'Limpieza',
];

/**
 * Categorías de MENÚ de fábrica. Punto de partida, no lista cerrada: el menú
 * es la identidad del negocio. Se editan en Ajustes.
 */
export const CATEGORIAS_MENU_BASE = [
  'Desayunos',
  'Platos fuertes',
  'Bebidas',
  'Postres',
];

/**
 * Normaliza una columna jsonb que DEBERÍA ser un array de textos.
 *
 * Se defiende de lo que de verdad llega, que no siempre es un array: hay filas
 * donde el jsonb viaja como string doble-codificado (`'["A","B"]'`), y hacer
 * spread de eso lo explota carácter por carácter —`[`, `"`, `A`…—. La misma
 * defensa que ya tenía `ZonasImpresionScreen`, ahora en un solo sitio.
 *
 * @param {unknown} valor
 * @returns {string[]} textos limpios, sin vacíos y sin repetidos, en su orden.
 */
export function listaDeTextos(valor) {
  let bruto = valor ?? [];

  if (typeof bruto === 'string') {
    try {
      const parsed = JSON.parse(bruto);
      bruto = Array.isArray(parsed) ? parsed : [];
    } catch {
      bruto = [];
    }
  }
  if (!Array.isArray(bruto)) return [];

  const vistos = new Set();
  const salida = [];
  for (const x of bruto) {
    if (typeof x !== 'string') continue; // un número no es una unidad
    const t = x.trim();
    if (!t || vistos.has(t)) continue;
    vistos.add(t);
    salida.push(t);
  }
  return salida;
}

/**
 * Junta la lista que toca ofrecer con lo que ya está en uso pero no está en
 * ella. No mezcla las dos: quien pinte el desplegable tiene que poder
 * distinguirlas.
 *
 * @param {string[]} lista     La lista buena (configuración, o la de fábrica).
 * @param {string[]} enUso     Valores que ya llevan escritos las filas vivas.
 * @returns {{lista: string[], sueltas: string[]}}
 */
function conLoQueYaSeUsa(lista, enUso) {
  const dentro = new Set(lista);
  const sueltas = [];
  const vistas = new Set();
  for (const v of enUso) {
    if (!v || dentro.has(v) || vistas.has(v)) continue;
    vistas.add(v);
    sueltas.push(v);
  }
  // Se comparan TAL CUAL: `Bolsa` y `bolsa` son dos valores distintos en la
  // base, y tratarlos como uno aquí escondería justo lo que hay que ver.
  return { lista, sueltas: sueltas.sort((a, b) => a.localeCompare(b)) };
}

/** Los valores de un campo entre las filas vivas (`activo !== false`). */
const enUsoPor = (filas, campo) =>
  (filas || [])
    .filter((f) => f && f.activo !== false)
    .map((f) => (typeof f[campo] === 'string' ? f[campo].trim() : ''))
    .filter(Boolean);

/**
 * Unidades que ofrece la pantalla de insumos.
 * @param {object|null} configuracion
 * @param {Array|null} productos
 */
export function unidadesDisponibles(configuracion, productos) {
  const deConfig = listaDeTextos(configuracion?.unidades);
  const lista = deConfig.length ? deConfig : UNIDADES_BASE;
  return conLoQueYaSeUsa(lista, enUsoPor(productos, 'unidad'));
}

/**
 * Categorías que ofrece la pantalla de insumos (ALMACÉN).
 * Lee `categorias_insumo`, NUNCA `categorias`: esa es la del menú y es la que
 * enruta la pantalla de zonas de impresión.
 */
export function categoriasDeInsumo(configuracion, productos) {
  const deConfig = listaDeTextos(configuracion?.categorias_insumo);
  const lista = deConfig.length ? deConfig : CATEGORIAS_INSUMO_BASE;
  return conLoQueYaSeUsa(lista, enUsoPor(productos, 'categoria'));
}

/**
 * Categorías que ofrece la pantalla de recetas (MENÚ).
 */
export function categoriasDeMenu(configuracion, recetas) {
  const deConfig = listaDeTextos(configuracion?.categorias);
  const lista = deConfig.length ? deConfig : CATEGORIAS_MENU_BASE;
  return conLoQueYaSeUsa(lista, enUsoPor(recetas, 'categoria'));
}
