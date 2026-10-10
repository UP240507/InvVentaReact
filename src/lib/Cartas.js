// ─── LA CARTA DE LA MAÑANA Y LA DE LA TARDE ─────────────────────────────────
// Pedido de AZUL (09-oct): a las 2:00 cambia la carta. Las bebidas son las
// mismas recetas, pero algunas cuestan distinto (el agua de fruta, $34 en la
// mañana y $38 en la tarde), y los desayunos no se venden en la tarde ni las
// cenas en la mañana.
//
// ── SE CUELGA DE LAS FRANJAS QUE YA EXISTEN ─────────────────────────────────
// `configuracion.franjas_activas` y `franja_corte` (lib/Franjas.js) ya parten el
// día en matutino y vespertino para los reportes. Una segunda hora de corte
// sólo para la carta sería otro número que mantener, y el día que no
// coincidieran la venta de la tarde quedaría con precio de la mañana. Por eso
// es la misma hora, y con las franjas apagadas todo se comporta como antes:
// un solo precio, todo el menú visible.
//
// ── EL PRECIO SE FIJA AL AGREGAR LA LÍNEA, NO AL COBRAR ─────────────────────
// La franja de la VENTA se estampa al cobrar (lo pide el arqueo: el billete
// entra en el cajón de la tarde). El precio de cada LÍNEA, en cambio, se fija
// cuando se pide: una mesa del desayuno que pide otra agua a las 2:10 paga la
// primera a $34 y la segunda a $38, que es como lo cobraría un mesero a mano.
// Por eso una línea de tarde lleva un id propio: si no, la segunda agua se
// fundiría con la primera y saldría a $34.
//
// Módulo puro, como Franjas.js: lo usan el POS y sus pruebas.

import { VESPERTINO, MATUTINO, franjaAlEscribir } from './Franjas';

/** Lo que se agrega al id de una línea cobrada con precio de la tarde. */
export const SUFIJO_TARDE = '::tarde';

/**
 * La franja de la carta en este instante, o `null` si el local no usa
 * franjas (entonces no hay carta de la tarde: un precio y todo el menú).
 */
export function franjaDeCarta(configuracion, ahora = new Date()) {
  return franjaAlEscribir(configuracion, ahora);
}

/**
 * El precio de la tarde de una receta, o `null` si no tiene.
 * Vacío, texto o negativo cuentan como «no tiene»: cobra lo mismo todo el día.
 */
export function precioDeTarde(receta) {
  const v = receta?.precio_vespertino;
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/**
 * ¿Se ofrece esta receta en la carta de esta franja?
 * `franja_carta` vacía = todo el día. Sin franja (local sin franjas) se ve todo.
 */
export function seVendeEn(receta, franja) {
  if (franja !== MATUTINO && franja !== VESPERTINO) return true;
  const c = receta?.franja_carta;
  if (c !== MATUTINO && c !== VESPERTINO) return true;
  return c === franja;
}

/**
 * La receta lista para entrar al carrito con el precio de la carta vigente.
 *
 * Sólo cambia algo si es de tarde y la receta tiene precio de tarde DISTINTO
 * del normal: entonces se pisan `precio` y `precio_venta` (el POS lee
 * `precio_venta` primero; con sólo `precio` se cobraría el de la mañana) y se
 * marca `precio_carta` para que la línea lleve su propio id.
 */
export function conPrecioDeCarta(receta, franja) {
  if (!receta || franja !== VESPERTINO) return receta;
  const tarde = precioDeTarde(receta);
  if (tarde === null) return receta;
  const normal = Number(receta.precio_venta ?? receta.precio);
  if (Number.isFinite(normal) && Math.abs(normal - tarde) < 0.005) {
    return receta;
  }
  return {
    ...receta,
    precio: tarde,
    precio_venta: tarde,
    precio_carta: VESPERTINO,
  };
}

/** El sufijo de id que le toca a una línea según su precio de carta. */
export function sufijoDeCarta(linea) {
  return linea?.precio_carta === VESPERTINO ? SUFIJO_TARDE : '';
}
