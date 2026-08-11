/**
 * IdVenta.js — clave primaria de una venta, única entre dispositivos.
 *
 * ── QUÉ ESTABA MAL ──────────────────────────────────────────────────────────
 * `PosScreen.jsx` asignaba `id: Date.now()`. Eso es el reloj, y el reloj lo
 * comparten todos los teléfonos del restaurante: dos meseros que cobren en el
 * mismo milisegundo emiten dos ventas DISTINTAS con la MISMA clave primaria.
 *
 * Mientras la sincronización fue cosa de cada dispositivo el fallo era raro y
 * ruidoso —PostgREST devolvía 23505 y la tarea caía en dead-letter, donde se
 * ve—. Deja de serlo en cuanto el hub respalda las ventas: un respaldo que
 * deduplica por `id` —y tiene que deduplicar, porque la LAN reenvía POSTs y
 * dos comandas iguales no pueden salir dos veces— trataría la segunda venta
 * como un reenvío de la primera y la DESCARTARÍA EN SILENCIO.
 *
 * Un cobro que desaparece sin error es peor que la pérdida que el respaldo
 * viene a resolver. De ahí que esto sea prerrequisito de 3.4/3.5 y no deuda.
 *
 * ── POR QUÉ NO LA SECUENCIA DE POSTGRES ─────────────────────────────────────
 * `ventas.id` tiene `DEFAULT nextval('ventas_id_seq')`, hoy muerto: el cliente
 * siempre manda su propio `id`. Y tiene que mandarlo, por la misma razón que
 * `Folio.js` no pide el folio al servidor — el ticket se imprime antes de que
 * exista red, y la venta necesita identidad desde ese instante para poder
 * referenciarla (comanda, propina, CRM) sin haber sincronizado nada.
 *
 * ── LA FORMA: MILISEGUNDO × 1000 + SUFIJO DE DISPOSITIVO ────────────────────
 *     1786412345678 · 1000 + 742  →  1786412345678742
 *
 * Se conserva el orden temporal (un `id` mayor es una venta posterior, que es
 * lo que hacen útiles los índices por `id` y los reportes) y se le añade abajo
 * el carril del dispositivo, que es lo que rompe el empate.
 *
 * Cabe: 1.79e12 × 1000 = 1.79e15, y `Number.MAX_SAFE_INTEGER` es 9.01e15 —
 * margen hasta el año 2255. Importa que quepa como Number ENTERO SEGURO y no
 * sólo como `bigint` de Postgres: en cuanto pasara de 2^53 el propio JavaScript
 * empezaría a redondear la clave primaria antes de enviarla, y ese fallo es
 * invisible hasta que dos ventas distintas redondean al mismo valor.
 *
 * ── EL SUFIJO SE DERIVA DEL PREFIJO DE FOLIO, NO SE SORTEA APARTE ───────────
 * Deliberado. `Folio.js` ya fijó la identidad de este dispositivo y la guardó;
 * sortear un segundo identificador daría DOS verdades sobre quién es esta
 * terminal, que se pueden desincronizar al limpiar el almacén a medias. Es el
 * mismo error que la llave duplicada de `Puerta.js` (10-ago) y el `_costo` de
 * `Payload.js`: preguntar al módulo que ya lo sabe en vez de guardar una copia.
 *
 * ── Y SE DERIVA POR LECTURA, NO POR HASH ───────────────────────────────────
 * La primera versión hasheaba el prefijo entero (FNV-1a) a 1000 carriles. La
 * prueba de veinte terminales la tumbó: 95 claves distintas en vez de 100.
 *
 * El hash parecía inocuo y no lo era. Comprime 1024 prefijos posibles en 1000
 * carriles, así que **dos dispositivos con prefijos DISTINTOS** —o sea, sin
 * colisión de folios, sin nada que se vea al cuadrar el turno— podían caer en
 * el mismo carril y emitir el mismo `id`. Era una segunda lotería, exactamente
 * la que el comentario de arriba presume no añadir, y con el peor perfil
 * posible: invisible, porque el folio de las dos ventas era correcto y
 * distinto.
 *
 * La versión buena no comprime nada: LEE los dos caracteres que `Folio.js` ya
 * sorteó para distinguir esta terminal y los interpreta como un número en base
 * 32. Es una biyección — 32² = 1024 sufijos, 1024 carriles, uno a uno.
 *
 * La consecuencia honesta, ahora sí exacta: dos dispositivos comparten carril
 * si y sólo si comparten sufijo de folio, que es la colisión que `Folio.js`
 * cifra en ~1 % con tres o cuatro terminales y que aparece al cuadrar el turno.
 * No se añade ni un caso nuevo.
 *
 * (Entre RESTAURANTES distintos sí puede repetirse, porque las cuatro letras
 * del local no entran en el carril. No importa para lo que este módulo
 * protege: el respaldo del hub es por restaurante, y una colisión cruzada la
 * atrapa Postgres con un 23505 en el `INSERT`, que es ruidoso y va a
 * dead-letter.)
 *
 * ── NUNCA RETROCEDE, NI SIQUIERA DENTRO DEL MISMO MILISEGUNDO ───────────────
 * Dos cobros de un MISMO dispositivo en el mismo milisegundo son improbables
 * (media un cliente), pero un reloj que se ajusta hacia atrás —NTP, cambio de
 * horario, la caja que arranca con la hora mal y la corrige— no lo es. Por eso
 * se recuerda el último `id` emitido y, si el calculado no lo supera, se emite
 * `último + 1`. Mismo principio que `siguienteConsecutivo`: un hueco se ve y se
 * explica, un duplicado no se ve.
 */

import {
  ALFABETO,
  LETRAS_DISPOSITIVO,
  SERIE_VENTA,
  SERIE_COMANDA,
  almacenLocal,
  prefijoDispositivo,
} from './Folio';

/**
 * Un candado monotónico POR SERIE, igual que `llaveContador` en `Folio.js`.
 *
 * Con una sola llave compartida, venta y comanda se empujarían mutuamente el
 * contador: cada comanda haría saltar el siguiente `id` de venta un carril
 * adelante y al revés. No sería incorrecto —seguirían siendo únicos y
 * crecientes— pero los `id` avanzarían por motivos ajenos a su propia serie, y
 * eso hace ilegible cualquier diagnóstico que se apoye en ellos.
 */
const llaveUltimo = (serie) => `idunico:ultimo:${serie}`;

/**
 * Cuántos `id` distintos caben en un mismo milisegundo, y cuántos carriles de
 * dispositivo hay. Es exactamente el número de sufijos que `Folio.js` puede
 * sortear (32² = 1024): la correspondencia es uno a uno, no una compresión.
 */
export const CARRILES = ALFABETO.length ** LETRAS_DISPOSITIVO;

/**
 * Carril de este dispositivo, en `[0, CARRILES)`.
 *
 * Los `LETRAS_DISPOSITIVO` caracteres finales del prefijo de folio, leídos como
 * un número en base `ALFABETO.length`. Biyectivo: sufijos distintos dan
 * carriles distintos, siempre. Ver arriba por qué esto no puede ser un hash.
 *
 * @param {object} opciones
 * @param {string} [opciones.nombreLocal] se pasa a `prefijoDispositivo`
 * @param {object} [opciones.almacen]
 * @returns {number} entero en [0, CARRILES)
 */
export function carrilDispositivo({
  nombreLocal = null,
  almacen = almacenLocal,
} = {}) {
  const prefijo = prefijoDispositivo({ nombreLocal, almacen });
  const sufijo = prefijo.slice(-LETRAS_DISPOSITIVO);

  let carril = 0;
  for (const caracter of sufijo) {
    const posicion = ALFABETO.indexOf(caracter);
    // Un carácter fuera del alfabeto sólo puede venir de un prefijo escrito a
    // mano o de una versión anterior del módulo. Se trata como 0 en vez de
    // fallar: perder la biyección en ese caso raro es preferible a que un
    // dispositivo no pueda cobrar.
    carril = carril * ALFABETO.length + (posicion >= 0 ? posicion : 0);
  }
  return carril % CARRILES;
}

/**
 * Siguiente identificador único de este dispositivo, para la serie que se pida.
 *
 * @param {object} opciones
 * @param {string} [opciones.serie] `V` venta, `C` comanda. Ver `llaveUltimo`.
 * @param {string} [opciones.nombreLocal] `configuracion.nombre_empresa`
 * @param {object} [opciones.almacen] inyectable para simular dos dispositivos
 * @param {() => number} [opciones.ahora] inyectable para probar el reloj hacia atrás
 * @returns {number} entero seguro, creciente, único por dispositivo
 */
export function siguienteIdUnico({
  serie = SERIE_VENTA,
  nombreLocal = null,
  almacen = almacenLocal,
  ahora = Date.now,
} = {}) {
  const carril = carrilDispositivo({ nombreLocal, almacen });
  const candidato = ahora() * CARRILES + carril;

  const llave = llaveUltimo(serie);
  const crudo = Number.parseInt(almacen.leer(llave) ?? '0', 10);
  const ultimo = Number.isFinite(crudo) && crudo > 0 ? crudo : 0;

  // Candado monotónico. `ultimo + CARRILES` y no `ultimo + 1` para que el `id`
  // emitido siga cayendo en el carril de este dispositivo: sumar 1 lo movería
  // al carril del vecino y reintroduciría por detrás la colisión entre
  // terminales que este módulo existe para evitar.
  const id = candidato > ultimo ? candidato : ultimo + CARRILES;

  if (!Number.isSafeInteger(id)) {
    // No debería ocurrir antes del año 2255. Si ocurre, es que el reloj del
    // equipo está disparado: fallar aquí es mejor que emitir una clave que
    // JavaScript ya está redondeando en silencio.
    throw new RangeError(`IdUnico: ${id} fuera del entero seguro`);
  }

  almacen.escribir(llave, String(id));
  return id;
}

/**
 * Clave primaria de una venta. `ventas.id` es `bigint`, así que va numérica.
 */
export function siguienteIdVenta(opciones = {}) {
  return siguienteIdUnico({ ...opciones, serie: SERIE_VENTA });
}

/**
 * Identificador de una comanda — y, por tanto, del trabajo de impresión.
 *
 * ── POR QUÉ ESTE TENÍA MÁS PRISA QUE EL DE LA VENTA ─────────────────────────
 * `Comanda.js` compone el `id` del documento como
 * `comanda::${comanda.id}::${zona}`, y `cola.rs` descarta un `id` que ya
 * imprimió — tiene que hacerlo, porque la LAN reenvía POSTs y dos comandas
 * iguales no pueden salir dos veces.
 *
 * Con `CMD-${Date.now()}`, dos meseros mandando a la MISMA zona en el mismo
 * milisegundo generaban el mismo `id` de documento, y la segunda comanda —de
 * otra mesa, con otros platillos— se descartaba como si fuera un reenvío de la
 * primera. Sin error, sin dead-letter, sin nada que mirar: cocina simplemente
 * nunca se entera de un pedido que el mesero da por enviado.
 *
 * A diferencia del `id` de venta, este deduplicado ya está desplegado, así que
 * el fallo no era un riesgo futuro sino uno vivo.
 *
 * Sigue siendo texto con prefijo `CMD-` porque así lo esperan el KDS y las
 * comandas ya guardadas; lo que cambia es de dónde sale el número.
 *
 * @returns {string} p.ej. `CMD-1829286241974646`
 */
export function siguienteIdComanda(opciones = {}) {
  return `CMD-${siguienteIdUnico({ ...opciones, serie: SERIE_COMANDA })}`;
}

/**
 * Serie de las marcas del checador.
 *
 * No vive en `Folio.js` porque una asistencia **no se imprime**: no es un folio,
 * es una clave primaria. Se le da serie propia por la misma razón que a las
 * comandas — que su contador no lo empuje el resto del sistema.
 *
 * Importa que no colisione porque `lib/Nominas.js` empareja entradas con salidas
 * para calcular el pago por horas: dos filas con la misma clave son un turno que
 * se pierde o se duplica, y en los dos casos es dinero.
 */
export const SERIE_ASISTENCIA = 'A';

/**
 * Serie de las líneas de auditoría.
 *
 * La asigna `useAppStore.registrarAuditoria` y **no** quien llama. Siete
 * pantallas registraban auditoría y cada una ponía su propio `id: Date.now()`:
 * siete sitios donde escribir la misma decisión, y el store ya tenía que poner
 * uno por defecto para las que no lo hacían. Con el `id` en el store hay una
 * sola verdad, y arreglarlo aquí lo arregla para todas a la vez.
 */
export const SERIE_AUDITORIA = 'U';
