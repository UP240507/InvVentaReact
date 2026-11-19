// src/lib/BusquedaPos.js
// ─────────────────────────────────────────────────────────────────────────────
// EL BUSCADOR DEL PUNTO DE VENTA (0.3.3, Chris 19-nov)
//
// Hasta la 0.3.2 la única forma de llegar a un producto era su categoría. Con
// el menú de bebidas de AZUL (86 recetas) eso es desplazar mucho, y un mesero
// nuevo no sabe en qué categoría vive cada cosa.
//
// Reglas, decididas con Chris:
//  - Sin acentos ni mayúsculas: «jitomate» encuentra «Jitomaté». Es el mismo
//    `normalizar` del buscador de arriba, para que los dos digan lo mismo.
//  - Por nombre y por el código del POS («J NARA»), que es como lo piden en
//    barra quienes ya se lo saben.
//  - Cada palabra tiene que aparecer, en cualquier orden: «latte frio»
//    encuentra «Latte frío de vainilla».
//  - Busca en TODAS las categorías: buscar «latte» parado en «Bebidas frías»
//    y no encontrar el caliente sería peor que no tener buscador.
//  - Mientras se escribe, sin Enter. El campo sólo se activa tocándolo: así
//    ninguna tecla del turno puede abrir una búsqueda sin querer.
// ─────────────────────────────────────────────────────────────────────────────

import { normalizar } from './BuscadorGlobal';

/** Las palabras de lo tecleado, ya normalizadas. Vacío = no hay búsqueda. */
export function palabrasDeBusqueda(texto) {
  return normalizar(texto).split(/\s+/).filter(Boolean);
}

/** ¿El producto tiene todas las palabras, en su nombre o en su código? */
export function coincideConBusqueda(producto, palabras) {
  if (!palabras.length) return true;
  const donde = normalizar(
    `${producto?.nombre ?? ''} ${producto?.codigo_pos ?? ''}`,
  );
  return palabras.every((p) => donde.includes(p));
}

/** Los productos que coinciden, en el mismo orden en que llegaron. */
export function filtrarPorBusqueda(productos = [], texto = '') {
  const palabras = palabrasDeBusqueda(texto);
  const lista = Array.isArray(productos) ? productos : [];
  if (!palabras.length) return lista;
  return lista.filter((p) => coincideConBusqueda(p, palabras));
}
