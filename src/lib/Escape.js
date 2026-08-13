/**
 * Escape.js — a dónde lleva el botón de salir, para CUALQUIER rol.
 *
 * ── DE DÓNDE SALE ESTE MÓDULO ───────────────────────────────────────────────
 * El 12-ago un barista quedó encerrado en el KDS. `/kds` es pantalla completa
 * —sin riel— y su botón «Salir» llamaba a `getRutaInicial()`, que para Chef y
 * Barista **es `/kds`**: navegaba a donde ya estaban. En el código figuraba como
 * «no-op consciente» y no lo era.
 *
 * El arreglo puntual habría sido un `if` en esa pantalla. Pero el encierro no lo
 * causó el KDS: lo causó que **cada pantalla decidiera su salida por su cuenta**,
 * y que los roles sean editables por restaurante. Mañana AZUL crea «Parrillero»
 * con `ruta_inicial: '/pos'` y se repite el mismo día en otra pantalla.
 *
 * Por eso la salida se calcula aquí, una vez, y `Escape.test.js` la comprueba
 * contra **todos los roles y contra roles inventados** —incluidos los rotos—.
 *
 * ── LA GARANTÍA QUE DA ──────────────────────────────────────────────────────
 * `rutaDeEscape` **siempre** devuelve una ruta, **nunca** la actual, y esa ruta
 * o la puede abrir el rol o es `/checador`, que es pública y está fuera de todos
 * los guards. Dicho de otro modo: no existe combinación de rol y pantalla que
 * deje a alguien sin salida. Ni siquiera un rol con las capacidades corruptas.
 */
import { puedeVerRuta } from './Permisos';
import { itemsVisibles } from './Navegacion';

/**
 * El suelo. `/checador` es PÚBLICA (está fuera de `AdminRoute` en `App.jsx`),
 * así que se puede abrir siempre, y además es donde el empleado marca salida y
 * cierra su sesión. Es el único destino que no depende de tener capacidades
 * bien formadas — por eso es el último recurso y no `/dashboard`.
 */
export const RUTA_ULTIMO_RECURSO = '/checador';

// `String(...)` y no `path || ''`: `roles_permisos` es una tabla que edita el
// restaurante, así que `ruta_inicial` puede llegar como número o como cualquier
// otra cosa. Sin la conversión, `.replace` lanza — y una excepción aquí deja a
// la pantalla SIN botón de salida, que es exactamente el fallo que este módulo
// existe para impedir. La prueba con capacidades corruptas lo cazó.
const normalizar = (path) =>
  path == null ? '' : String(path).replace(/\/+$/, '') || '';

/**
 * @param {object}   cap          capacidades del rol (de `getCapacidades`).
 * @param {string}   rutaActual   dónde está parado ahora.
 * @param {Function} tieneModulo  de `usePlan`; por defecto todo contratado.
 * @returns {string} ruta a la que debe llevar el botón de salir.
 */
export function rutaDeEscape({ cap, rutaActual, tieneModulo = () => true }) {
  const actual = normalizar(rutaActual);
  const puede = (r) => puedeVerRuta(cap, r);

  // El orden NO es arbitrario:
  //
  //  1. `ruta_inicial` primero, para no cambiarle el hábito a nadie: un Admin
  //     que sale del KDS sigue cayendo en su tablero, como siempre.
  //  2. `/perfil` cuando la inicial es esta misma pantalla. Es la respuesta al
  //     encierro: perfil es de donde se cierra sesión, y desde ahí reaparece el
  //     riel para volver.
  //  3. Cualquier destino del menú que el rol pueda abrir. Cubre al rol nuevo
  //     que alguien cree sin `perfil` en su lista.
  //  4. El suelo público.
  const candidatos = [
    cap?.ruta_inicial,
    '/perfil',
    ...itemsVisibles(puede, tieneModulo).map((i) => i.path),
  ];

  for (const c of candidatos) {
    const r = normalizar(c);
    // `r === actual` es la línea que faltaba en el KDS. Un destino que es la
    // pantalla en la que ya estás no es una salida.
    if (!r || r === actual) continue;
    if (puede(r)) return r;
  }

  return RUTA_ULTIMO_RECURSO;
}

/**
 * ¿La salida es «ir a mi perfil» y no «volver a lo mío»?
 *
 * Lo usan las pantallas para etiquetar el botón: mandar a alguien a Perfil bajo
 * un cartel que dice «Salir» es mentirle en pequeño, y quien vive en el KDS lee
 * ese botón todos los días.
 */
export function escapeEsPerfil(destino) {
  return normalizar(destino) === '/perfil';
}
