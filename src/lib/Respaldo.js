/**
 * Respaldo.js — qué se respalda en la caja, y con qué clave.
 *
 * La parte de decidir vive aquí, separada de `useSyncStore`, porque es la que
 * puede fallar en silencio: una tarea que se queda fuera de la lista no da
 * ningún error, simplemente no tiene segunda copia, y eso se descubre el día
 * que un teléfono muere. Aquí se prueba sin Dexie, sin red y sin hub.
 *
 * ── QUÉ SE RESPALDA ─────────────────────────────────────────────────────────
 * NO toda la cola. Respaldar un cambio de configuración o una receta es ruido:
 * se rehacen desde la pantalla en treinta segundos. Lo que no se rehace es un
 * cobro que ya ocurrió y del que ya se fue el cliente.
 *
 * La lista está en UN solo sitio a propósito. Pedirle a cada pantalla que se
 * acuerde de marcar sus filas es pedir que alguna se olvide —es la lección de
 * `Payload.js`— y el síntoma tarda semanas en aparecer.
 *
 * ── LA CLAVE ────────────────────────────────────────────────────────────────
 * `${tabla}::${id}`. Sirve porque `lib/IdVenta.js` ya garantiza que el id de una
 * venta es único ENTRE DISPOSITIVOS. Sin eso, dos cobros en el mismo
 * milisegundo desde dos teléfonos compartirían clave y el hub descartaría el
 * segundo como duplicado **sin decir nada**: peor que la pérdida que todo esto
 * viene a evitar.
 */

/**
 * Tablas cuyas filas son dinero o trabajo ya hecho.
 *
 * `movimientos` está por el kardex: una venta adoptada que entre sin su salida
 * de inventario deja el almacén mintiendo, y mentir sin fallar es la peor
 * combinación.
 */
export const TABLAS_RESPALDADAS = [
  'ventas',
  'comandas',
  'movimientos',
  // ── AUDITORÍA, DESDE EL 17-AGO ──────────────────────────────────────────
  // Esta lista se escribió mirando el dinero y se olvidó del rastro. Medido en
  // AZUL: una venta llegó a los libros a las 20:09 y la auditoría se cortó a las
  // 19:40, porque el dispositivo que la cobró murió y su línea de auditoría no
  // estaba respaldada por nadie. Un cobro sin `COBRO_TICKET`, en la pantalla que
  // se llama «Registro inmutable de seguridad y operaciones».
  //
  // No es lo mismo perder una línea de auditoría que perder una venta —la venta
  // es dinero—, pero es lo único que **no se puede reconstruir después**: una
  // venta huérfana se descubre cuadrando la caja; un cobro sin rastro no se
  // descubre nunca, y el hueco aparece exactamente donde alguien que quisiera
  // esconder algo lo dejaría.
  'auditoria',
];

/**
 * RPCs que se respaldan, y **de dónde sale su clave**.
 *
 * Sólo entran las que traen un identificador propio en sus argumentos. Es la
 * condición, no una casualidad: sin clave no hay deduplicado, y sin deduplicado
 * la caja podría ejecutar dos veces algo que ya corrió.
 *
 * ── LA HISTORIA DE `decrementar_stock`, QUE VALE LA PENA ───────────────────
 * Estuvo fuera de esta lista un rato, y por una buena razón: **no era
 * idempotente**. Restaba cada vez que se le llamaba, y el `p_referencia` que
 * parecía su clave resultó ser una etiqueta para el humano —en la base de AZUL
 * hay dos filas «Venta: Pizza x1» separadas por tres meses—.
 *
 * Respaldarla así habría hecho que la caja, al adoptar una venta, descontara un
 * inventario ya descontado. Sin dar error. Hasta el conteo.
 *
 * Se arregló en la migración `decrementar_stock_ledger_por_origen`: ahora tiene
 * su propio ledger (`stock_salidas`), igual que `registrar_visita_cliente` y
 * `canjear_puntos`. De paso tapó un fallo que **ya existía**: un reintento de
 * la cola tras un timeout post-commit descontaba dos veces.
 *
 * Su clave es `p_origen` y es TEXTO: en mesa quien dispara el descuento es la
 * comanda (`CMD-7`) al mandar a producción, no la venta, que aún no existe.
 */
export const RPCS_RESPALDADAS = {
  registrar_visita_cliente: 'p_venta_id',
  canjear_puntos: 'p_canje_id',
  decrementar_stock: 'p_origen',
};

/**
 * Clave de deduplicado de una tarea de la cola, o `null` si no se respalda.
 *
 * Devolver `null` es una respuesta legítima y frecuente: la mayoría de la cola
 * son ajustes y catálogos.
 */
export function claveDeRespaldo(item) {
  if (!item || typeof item !== 'object') return null;

  if (item.metodo === 'rpc') {
    const argumento = RPCS_RESPALDADAS[item.rpc];
    if (!argumento) return null;
    const id = item?.data?.[argumento];
    // Una RPC de la lista SIN su identificador no se respalda. Inventarle una
    // clave —con la fecha, por ejemplo— sería peor: dos copias de la misma
    // llamada entrarían como distintas y se ejecutaría dos veces.
    if (id == null || id === '') return null;
    return `${item.rpc}::${id}`;
  }

  if (!TABLAS_RESPALDADAS.includes(item.tabla)) return null;

  // Un `delete` no se respalda: adoptar un borrado de un dispositivo muerto es
  // borrar algo que quizá nadie quiso borrar. Lo que se protege es lo que se
  // perdería, no lo que se quitó.
  if (item.metodo === 'delete') return null;

  const id = item?.data?.id;
  if (id == null || id === '') return null;
  return `${item.tabla}::${id}`;
}

/** ¿Esta tarea lleva segunda copia? */
export function seRespalda(item) {
  return claveDeRespaldo(item) != null;
}

/**
 * Convierte tareas de la cola en anotaciones para el hub. Las que no se
 * respaldan se caen por el camino, sin ruido.
 */
export function anotacionesDe(items = []) {
  const lista = Array.isArray(items) ? items : [];
  const vistas = new Set();
  const anotaciones = [];

  for (const item of lista) {
    const clave = claveDeRespaldo(item);
    if (!clave || vistas.has(clave)) continue;
    vistas.add(clave);
    anotaciones.push({
      clave,
      // La tarea entera, tal cual, para que la caja pueda reejecutarla sin
      // reconstruir nada. El hub la guarda opaca: no entiende de ventas.
      tarea: {
        tabla: item.tabla,
        metodo: item.metodo,
        rpc: item.rpc ?? null,
        data: item.data,
      },
      creado_ms: Number(item.createdAt) || 0,
    });
  }

  return anotaciones;
}
