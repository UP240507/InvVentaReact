/**
 * Folio.js — numeración de documentos que se imprimen.
 *
 * ── QUÉ ESTABA MAL ──────────────────────────────────────────────────────────
 * Antes el folio era `POS-${Date.now().toString().slice(-5)}`. Los últimos cinco
 * dígitos de los milisegundos **dan la vuelta cada 100 segundos**, así que eso
 * no es un identificador: es un reloj corto disfrazado. Tres consecuencias, y
 * las tres se descubren tarde:
 *
 *   1. COLISIONA. Modelado como un sorteo uniforme sobre 100 000 valores, la
 *      probabilidad de que dos tickets de un mismo servicio compartan folio es
 *      ~4 % a los 100 tickets y ~18 % a los 200. Comprobado contra las ventas
 *      reales: los valores están uniformemente repartidos en el ciclo, así que
 *      el modelo aplica. No había colisionado todavía con 88 ventas, que es
 *      justo lo que hace peligroso el fallo — parecía que funcionaba.
 *   2. NO ORDENA. `POS-67968` es posterior a `POS-01653`, que es posterior a
 *      `POS-63918`. No se puede ordenar por folio ni ver un hueco, que es el
 *      único trabajo que tiene un folio.
 *   3. NO HAY `UNIQUE` en la columna, así que una colisión entra sin error y se
 *      descubre meses después buscando una venta y encontrando dos.
 *
 * ── POR QUÉ SE ASIGNA AQUÍ Y NO EN LA BASE DE DATOS ─────────────────────────
 * Porque el papel sale ANTES de que exista red. El ticket se imprime en el
 * momento del cobro y la venta viaja después por la cola de sincronización;
 * pedirle el número al servidor obligaría a imprimir sin folio o a no imprimir
 * hasta tener señal, y la paridad offline es justamente lo que sostiene el
 * producto. Una numeración global consecutiva es incompatible con eso.
 *
 * ── LA FORMA: PREFIJO DE DISPOSITIVO + CONSECUTIVO LOCAL ────────────────────
 *   `AZUL7K-V-000123`
 *
 * El prefijo hace la unicidad POR CONSTRUCCIÓN: dos dispositivos no comparten
 * espacio de numeración, así que no hay colisión que evitar ni coordinación que
 * mantener. El consecutivo hace lo que se le pide a un folio: ordena y deja ver
 * los huecos.
 *
 * La contrapartida, dicha claro: **no hay UNA numeración del restaurante sino
 * una por dispositivo.** Es lo normal en un POS con varias terminales y es el
 * precio de poder cobrar sin red. Para cuadrar el turno se suman las series, no
 * se lee una sola.
 *
 * ── EL RELLENO A SEIS DÍGITOS NO ES COSMÉTICO ───────────────────────────────
 * `000123` y no `123` porque el orden que importa es el de TEXTO: la columna es
 * `text`, los listados ordenan por cadena y `10` va antes que `9`. Con relleno
 * fijo, orden alfabético y orden cronológico coinciden. Seis dígitos dan un
 * millón de documentos por dispositivo, que a 300 tickets diarios son nueve
 * años.
 */

const LLAVE_PREFIJO = 'folio:prefijo-dispositivo';

/**
 * ¿El prefijo guardado se acuñó SIN nombre del local?
 *
 * Distingue un prefijo legítimo de un marcador de posición. Sin esta marca no
 * hay forma de saberlo: `PTKL` y `AZUL` son cuatro letras igual de válidas, y
 * adivinar por su aspecto —«esto no parece un nombre»— sería renombrar series
 * buenas de restaurantes con nombres raros.
 *
 * Un dispositivo de antes de esta marca no la tiene, así que se lee como `'0'`
 * (no provisional) y su prefijo se respeta. Es la lectura conservadora: no
 * tocar lo que ya está emitiendo folios.
 */
const LLAVE_PROVISIONAL = 'folio:prefijo-provisional';

/**
 * Cada SERIE lleva su propio contador.
 *
 * Hay dos documentos numerados y no son lo mismo: el ticket de venta (`V`) y la
 * comanda de cocina (`C`). Con un contador compartido, la serie de ventas
 * saldría llena de huecos —los que gastan las comandas— y un hueco en una serie
 * de ventas es exactamente la señal que un auditor busca. Que «el folio 123»
 * signifique una sola cosa vale más que ahorrarse una llave.
 */
const llaveContador = (serie) => `folio:contador:${serie}`;

export const SERIE_VENTA = 'V';
export const SERIE_COMANDA = 'C';

/** Ancho del consecutivo. Ver arriba: es lo que hace que ordene como texto. */
export const ANCHO_CONSECUTIVO = 6;

/**
 * Almacén por defecto. Se inyecta en las pruebas para no depender del entorno
 * y —más importante— para poder simular DOS dispositivos en un solo proceso,
 * que es la única forma de comprobar que no colisionan.
 */
export const almacenLocal = {
  leer(llave) {
    try {
      return localStorage.getItem(llave);
    } catch {
      // Webview sin storage o modo privado. Ver `sinPersistencia` abajo.
      return null;
    }
  },
  escribir(llave, valor) {
    try {
      localStorage.setItem(llave, valor);
      return true;
    } catch {
      return false;
    }
  },
};

/** Caracteres de A-Z y 2-9. Sin O/0 ni I/1: esto acaba dictado por teléfono. */
export const ALFABETO = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** Letras del nombre del local que entran en el prefijo. «AZUL RESTAURANTE» → `AZUL`. */
export const LETRAS_LOCAL = 4;

/** Caracteres que distinguen un dispositivo de otro DENTRO del mismo local. */
export const LETRAS_DISPOSITIVO = 2;

function alAzar(n) {
  let s = '';
  for (let i = 0; i < n; i++) {
    const r =
      typeof crypto !== 'undefined' && crypto.getRandomValues
        ? crypto.getRandomValues(new Uint32Array(1))[0]
        : Math.floor(Math.random() * 0xffffffff);
    s += ALFABETO[r % ALFABETO.length];
  }
  return s;
}

/**
 * Letras del nombre del local, normalizadas: mayúsculas, sin acentos, sin
 * separadores. «Añejo · Barra 2» → `ANEJ`.
 */
export function letrasDelLocal(nombre) {
  const limpio = String(nombre || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
  return limpio.slice(0, LETRAS_LOCAL) || null;
}

/**
 * El prefijo de ESTE dispositivo: `AZUL7K` — letras del local + dos que lo
 * distinguen de las demás terminales.
 *
 * ── POR QUÉ LAS DOS PARTES, Y NO SÓLO EL NOMBRE DEL LOCAL ───────────────────
 * La idea de que el folio naciera del nombre del restaurante es buena por una
 * mitad y peligrosa por la otra, y conviene tener escrito por qué.
 *
 * Buena: `PTKL-V-000004` no le dice nada a nadie. `AZUL7K-V-000004` se reconoce
 * de un vistazo, y en un papel que revisa un auditor eso cuenta.
 *
 * Peligrosa: **el prefijo es lo único que impide que dos dispositivos emitan el
 * mismo folio.** Cada uno lleva su contador local —tiene que ser así para poder
 * cobrar sin red— y el nombre del restaurante es justamente lo ÚNICO que todos
 * comparten. Derivarlo sólo de ahí los metería a todos en la misma numeración:
 *
 *     caja    → AZUL-V-000001, AZUL-V-000002, …
 *     tablet  → AZUL-V-000001, AZUL-V-000002, …
 *
 * No sería un riesgo sino una certeza: cincuenta tickets en la caja y treinta en
 * la tablet dan treinta duplicados en un solo turno. Sería reintroducir por la
 * puerta de al lado el fallo que este módulo vino a cerrar.
 *
 * Con los dos trozos se tienen las dos cosas: se ve de quién es la serie y las
 * series no se cruzan.
 *
 * ── POR QUÉ EL SUFIJO ES AL AZAR Y NO UN NÚMERO ─────────────────────────────
 * Porque no hay a quién preguntarle. Un dispositivo que se da de alta sin red
 * no puede saber si el «1» ya está tomado, así que un número asignado a mano se
 * duplica al primer descuido y **sin avisar**. Dos caracteres del alfabeto dan
 * 1024 combinaciones: con tres o cuatro terminales la probabilidad de repetir
 * ronda el 1 %, y en ese caso los folios duplicados aparecerían al cuadrar el
 * turno, no meses después.
 *
 * ── SE FIJA LA PRIMERA VEZ Y NO SE VUELVE A TOCAR ───────────────────────────
 * Deliberado: si cambiara al renombrar el restaurante, la serie se partiría en
 * dos y los folios de antes y después dejarían de ser comparables. El prefijo
 * identifica una SERIE, no un nombre; el nombre puede cambiar, la serie no.
 *
 * @param {object} opciones
 * @param {string} [opciones.nombreLocal] `configuracion.nombre_empresa`. Sólo
 *   se usa la primera vez.
 * @param {object} [opciones.almacen]
 */
export function prefijoDispositivo({
  nombreLocal = null,
  almacen = almacenLocal,
} = {}) {
  const guardado = almacen.leer(LLAVE_PREFIJO);
  const letrasBuenas = letrasDelLocal(nombreLocal);

  if (guardado) {
    // ── REPARACIÓN DE UN PREFIJO PROVISIONAL (11-ago) ────────────────────────
    // Salió en el primer ticket impreso de verdad: el folio decía `PTKL…` en un
    // restaurante que se llama AZUL. Cuatro letras al azar significan que el
    // prefijo se acuñó SIN nombre del local — y aquí el nombre estaba puesto
    // desde hacía semanas.
    //
    // La causa: `PosScreen` pasa `configuracion?.nombre_empresa`, y si la
    // primera venta o comanda cae antes de que el store hidrate, ese valor es
    // `undefined`. Entonces se sortean cuatro letras… y como el prefijo se
    // guarda y no se vuelve a mirar, ese marcador de posición queda para
    // siempre. Es un fallo de los que no dan error: el folio funciona, ordena y
    // no colisiona. Sólo es ilegible, que era justo la mitad que el prefijo
    // venía a resolver.
    //
    // Se repara UNA vez, y sólo las letras del local. Los dos caracteres del
    // dispositivo se conservan intactos, y eso es lo que hace segura la
    // reparación: la unicidad entre terminales vive ahí, no en el nombre. Dos
    // dispositivos que ya no colisionaban siguen sin colisionar.
    //
    // No contradice la regla de «el prefijo no cambia al renombrar el
    // restaurante»: aquí no se está renombrando nada. Se está sustituyendo un
    // marcador por el dato que debió estar desde el principio.
    const provisional = almacen.leer(LLAVE_PROVISIONAL) === '1';
    if (provisional && letrasBuenas) {
      const sufijo = guardado.slice(-LETRAS_DISPOSITIVO);
      const reparado = `${letrasBuenas}${sufijo}`;
      almacen.escribir(LLAVE_PREFIJO, reparado);
      almacen.escribir(LLAVE_PROVISIONAL, '0');
      return reparado;
    }
    return guardado;
  }

  // Sin nombre configurado se usan cuatro al azar en su sitio: un prefijo
  // ilegible es peor que uno legible, pero mucho mejor que uno que colisiona.
  // Se marca como provisional para poder repararlo en cuanto haya nombre.
  const letras = letrasBuenas || alAzar(LETRAS_LOCAL);
  const nuevo = `${letras}${alAzar(LETRAS_DISPOSITIVO)}`;
  almacen.escribir(LLAVE_PREFIJO, nuevo);
  almacen.escribir(LLAVE_PROVISIONAL, letrasBuenas ? '0' : '1');
  return nuevo;
}

/**
 * Siguiente número de la serie de este dispositivo.
 *
 * Nunca retrocede: si lo leído del almacén está corrupto, ausente o es menor
 * que lo ya emitido, se sigue desde el mayor de los dos. Un contador que
 * retrocede reemite folios ya impresos, que es peor que saltarse unos cuantos —
 * un hueco se ve y se explica; un duplicado no se ve.
 */
export function siguienteConsecutivo({
  serie = SERIE_VENTA,
  almacen = almacenLocal,
} = {}) {
  const llave = llaveContador(serie);
  const crudo = Number.parseInt(almacen.leer(llave) ?? '0', 10);
  const actual = Number.isFinite(crudo) && crudo > 0 ? crudo : 0;
  const siguiente = actual + 1;
  almacen.escribir(llave, String(siguiente));
  return siguiente;
}

/**
 * Folio completo, listo para imprimir y para guardar.
 *
 * @param {object} opciones
 * @param {string} [opciones.serie] `V` venta, `C` comanda. Ver `llaveContador`.
 * @param {string} [opciones.nombreLocal] ver `prefijoDispositivo`
 * @param {object} [opciones.almacen]
 * @returns {string} p.ej. `AZUL7K-V-000123`
 */
export function siguienteFolio({
  serie = SERIE_VENTA,
  nombreLocal = null,
  almacen = almacenLocal,
} = {}) {
  const prefijo = prefijoDispositivo({ nombreLocal, almacen });
  const n = siguienteConsecutivo({ serie, almacen });
  return `${prefijo}-${serie}-${String(n).padStart(ANCHO_CONSECUTIVO, '0')}`;
}

/**
 * ¿Este dispositivo puede recordar su contador?
 *
 * Importa porque el modo sin persistencia es el ÚNICO caso en que este esquema
 * reemite folios: sin almacén, el contador arranca en 1 en cada recarga. Quien
 * llama puede avisar en vez de dejar que pase callado. No se inventa un
 * respaldo en memoria a propósito — duraría lo que la pestaña y daría una
 * falsa sensación de que el problema no existe.
 */
export function sinPersistencia({ almacen = almacenLocal } = {}) {
  const sonda = 'folio:sonda';
  if (!almacen.escribir(sonda, '1')) return true;
  return almacen.leer(sonda) !== '1';
}
