/**
 * Los bloqueos del CSP, recogidos donde alguien pueda verlos.
 *
 * ── POR QUÉ EXISTE ESTE ARCHIVO ─────────────────────────────────────────────
 * Un CSP mal puesto **no da un error legible**. Bloquea una petición y la
 * pantalla se queda a medias, o en blanco, o sin una tipografía, o sin
 * realtime. El navegador sí avisa —escribe la violación en la consola— pero en
 * la caja **no hay consola**: las devtools no se compilan en release, y con
 * razón (`docs/DISENO_CSP.md` §4).
 *
 * O sea que activar el CSP sin esto sería añadir a propósito un fallo del
 * patrón que este proyecto lleva semanas persiguiendo: dos capas correctas, el
 * hueco justo en medio, y ni excepción ni log. La diferencia es que este lo
 * estaríamos metiendo nosotros con los ojos abiertos.
 *
 * `securitypolicyviolation` es el evento que el navegador dispara por cada
 * bloqueo. Engancharlo cuesta cuatro líneas y convierte «la app se ve rara» en
 * «me bloqueó `font-src` con esta URL», que es la diferencia entre una tarde y
 * cinco minutos.
 *
 * ── POR QUÉ SE GUARDA EN DISCO Y NO SÓLO EN MEMORIA ─────────────────────────
 * Porque el bloqueo típico pasa **en el arranque**, antes de que nadie esté
 * mirando, y porque la app se recarga. Un aviso que se pierde al recargar no
 * sirve para diagnosticar por teléfono, que es exactamente el caso: el dueño
 * llama, y alguien tiene que poder decirle dónde mirar.
 *
 * ── LO QUE ESTE MÓDULO NO HACE ──────────────────────────────────────────────
 * No manda nada a ningún sitio. La caja no reporta telemetría y esto no va a
 * ser lo primero que lo haga.
 */

const CLAVE = 'invventa.bloqueos_csp';
// Un tope bajo a propósito. Un CSP roto dispara el MISMO bloqueo cientos de
// veces —cada icono, cada fuente—, y lo que hace falta para diagnosticar es la
// lista de directivas distintas, no el recuento. Con la deduplicación de abajo,
// veinte entradas distintas ya son un problema muy diferente al que se buscaba.
const TOPE = 20;

/** La huella que decide si dos bloqueos son «el mismo». */
export function firmaDeBloqueo(v) {
  const directiva = String(
    v?.violatedDirective || v?.effectiveDirective || '?',
  );
  // Sólo el origen de la URL bloqueada, no la ruta entera: ocho iconos del
  // mismo dominio son un bloqueo, no ocho. Y una ruta completa puede llevar
  // datos dentro (una `data:` con el logo del local, por ejemplo).
  const uri = String(v?.blockedURI || '');
  let origen;
  try {
    origen = uri.startsWith('data:') ? 'data:' : new URL(uri).origin;
  } catch {
    // `blockedURI` no siempre es una URL: puede ser 'inline', 'eval' o ''.
    origen = uri || 'inline';
  }
  return `${directiva}::${origen}`;
}

function leer() {
  try {
    const crudo = JSON.parse(localStorage.getItem(CLAVE) || '[]');
    return Array.isArray(crudo) ? crudo : [];
  } catch {
    // Disco lleno, modo privado, JSON corrupto. Un diagnóstico que revienta al
    // leerse es peor que no tenerlo: se traga la pantalla que venía a salvar.
    return [];
  }
}

function escribir(lista) {
  try {
    localStorage.setItem(CLAVE, JSON.stringify(lista));
  } catch {
    /* Si no se puede guardar, se sigue: esto es diagnóstico, no operación. */
  }
}

/**
 * Mete un bloqueo en la lista, o sube el contador del que ya estaba.
 *
 * Separada del evento y sin tocar el DOM para que se pueda probar: el reparto
 * —qué se junta con qué y qué se tira al llegar al tope— es la única parte con
 * decisiones dentro.
 *
 * @param {Array}  lista   Lo que ya había.
 * @param {object} v       El evento (o un objeto con su misma forma).
 * @param {string} cuando  ISO. Se pasa en vez de leerse del reloj para poder
 *                         fijarlo en las pruebas.
 * @returns {Array} La lista nueva. Siempre un array distinto.
 */
export function agregarBloqueo(lista = [], v = {}, cuando = null) {
  const previos = Array.isArray(lista) ? lista : [];
  const firma = firmaDeBloqueo(v);
  const fecha = cuando || new Date().toISOString();

  const ya = previos.find((b) => b.firma === firma);
  if (ya) {
    return previos.map((b) =>
      b.firma === firma
        ? { ...b, veces: Number(b.veces || 1) + 1, ultima: fecha }
        : b,
    );
  }

  const nuevo = {
    firma,
    directiva: String(v?.violatedDirective || v?.effectiveDirective || '?'),
    bloqueado: String(v?.blockedURI || 'inline'),
    // De dónde salía la petición. Es lo que dice QUÉ pantalla se rompió.
    documento: String(v?.documentURI || ''),
    veces: 1,
    primera: fecha,
    ultima: fecha,
  };

  // Se tira el más ANTIGUO por primera aparición. El primer bloqueo suele ser
  // el que explica los demás, pero si ya hay veinte distintos el CSP está mal
  // de raíz y lo que importa es ver los últimos, que son los que el usuario
  // acaba de provocar navegando.
  return [...previos, nuevo].slice(-TOPE);
}

/** Lo recogido hasta ahora, lo más reciente primero. */
export function bloqueosCsp() {
  return [...leer()].sort((a, b) =>
    String(b.ultima).localeCompare(String(a.ultima)),
  );
}

/** Vacía la lista. Se usa desde la pantalla del hub después de mirarla. */
export function limpiarBloqueosCsp() {
  escribir([]);
}

/**
 * Engancha el detector. Se llama una sola vez, desde `main.jsx`.
 *
 * Va en el arranque y no dentro de un componente porque el bloqueo que más
 * importa —una fuente, una hoja de estilo, el propio bundle— ocurre **antes**
 * de que React haya montado nada.
 *
 * @param {function} alBloquear  Opcional: se le pasa el bloqueo para avisar en
 *   pantalla. Se separa para que este módulo no dependa de la interfaz.
 * @returns {function} Para desenganchar. Lo usan las pruebas.
 */
export function vigilarCsp(alBloquear = null) {
  if (typeof document === 'undefined') return () => {};

  const alVerVioloacion = (evento) => {
    const lista = agregarBloqueo(leer(), evento);
    escribir(lista);
    const ultimo = lista.find((b) => b.firma === firmaDeBloqueo(evento));
    // Sólo se avisa la PRIMERA vez de cada firma. Un CSP roto dispara el mismo
    // bloqueo por cada icono de la pantalla, y una lluvia de avisos tapa la
    // aplicación entera justo cuando hay que usarla.
    if (ultimo?.veces === 1) {
      try {
        alBloquear?.(ultimo);
      } catch {
        /* Un aviso que revienta no puede tumbar el arranque. */
      }
    }
  };

  document.addEventListener('securitypolicyviolation', alVerVioloacion);
  return () =>
    document.removeEventListener('securitypolicyviolation', alVerVioloacion);
}
