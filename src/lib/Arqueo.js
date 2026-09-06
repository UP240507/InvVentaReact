// src/lib/Arqueo.js
// Cálculo de totales de un turno para el corte de caja. Fuente única del arqueo.
// Arregla D5: bucketiza por el DESGLOSE real efectivo/tarjeta de cada venta
// (que el POS persiste), no por el string metodo_pago sumando el total completo
// (que mandaba los tickets 'mixto' enteros a efectivo, inflando la caja esperada).

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

/**
 * @param {Array}  ventas
 * @param {Object} turnoActivo   turno con { id, fecha_apertura }
 * @param {Function} [parseUTC]  parser de fecha (inyectable)
 * @returns {{efectivo:number,tarjeta:number,transferencia:number,propinas:number,
 *            totalVentas:number,ventasNetas:number,ticketsCount:number}}
 */
export function calcularTotalesTurno(
  ventas,
  turnoActivo,
  parseUTC = (d) => new Date(d),
) {
  const base = {
    efectivo: 0,
    tarjeta: 0,
    transferencia: 0,
    propinas: 0,
    totalVentas: 0,
    ventasNetas: 0,
    ticketsCount: 0,
  };
  if (!turnoActivo) return base;

  const apertura = turnoActivo.fecha_apertura
    ? parseUTC(turnoActivo.fecha_apertura)
    : null;

  const ventasTurno = (ventas || []).filter((v) => {
    // Trazabilidad exacta por turno_id si existe; fallback a rango por fecha.
    if (v?.turno_id != null && turnoActivo.id != null) {
      return String(v.turno_id) === String(turnoActivo.id);
    }
    if (!apertura) return false;
    const f = parseUTC(v?.fecha || v?.created_at);
    return f && f >= apertura;
  });

  const t = { ...base, ticketsCount: ventasTurno.length };

  for (const v of ventasTurno) {
    const total = Number(v?.total) || 0;
    const propina = Number(v?.propina) || 0;
    const efe = Number(v?.efectivo) || 0;
    const tar = Number(v?.tarjeta) || 0;
    const transfer = Number(v?.transferencia) || 0;

    t.propinas += propina;
    t.totalVentas += total;

    if (efe || tar || transfer) {
      // D5: desglose real (cubre pagos mixtos correctamente).
      t.efectivo += efe;
      t.tarjeta += tar;
      t.transferencia += transfer;
    } else {
      // Compat: ventas viejas sin desglose → inferir por metodo_pago.
      const metodo = (v?.metodo_pago || 'efectivo').toLowerCase();
      if (metodo.includes('tarjeta')) t.tarjeta += total;
      else if (metodo.includes('transfer')) t.transferencia += total;
      else t.efectivo += total;
    }
  }

  t.ventasNetas = t.totalVentas - t.propinas; // venta neta = sin propina
  for (const k of [
    'efectivo',
    'tarjeta',
    'transferencia',
    'propinas',
    'totalVentas',
    'ventasNetas',
  ]) {
    t[k] = r2(t[k]);
  }
  return t;
}

// ─────────────────────────────────────────────────────────────────────────────
// EL DESGLOSE POR DENOMINACIONES
//
// `turnos.fondo_inicial` y `turnos.efectivo_declarado` son dos `numeric` que
// ALGUIEN TECLEA. Son afirmaciones sin nada detrás, de la misma familia que la
// pantalla del hub afirmando que el nombre resuelve, o la nota de versión
// anunciando funciones que el binario no traía.
//
// Con desglose, el total deja de ser una afirmación y pasa a ser **derivado de
// un conteo que queda guardado**. Y eso cambia la investigación cuando algo
// falta: hoy sólo se sabe «faltan 500»; con desglose se sabe si falta UN
// BILLETE de 500 o si son 500 EN MONEDAS DE DIEZ. Uno huele a robo y el otro a
// cambio mal dado durante seis horas.
//
// También caza el error más común contando efectivo, que es transponer cifras:
// 1,250 por 1,520.
//
// Ver `docs/DISENO_ARQUEO_Y_CAJON.md` §4.

/**
 * Las denominaciones de fábrica. México, y las mismas que siembra
 * `supabase/seed/plantilla_local.sql` — hay una prueba que las compara, porque
 * el fallo de las unidades no fue que la lista estuviera dura: fue que la dura
 * y la sembrada no eran la misma y nadie las comparaba nunca.
 *
 * Dos grupos porque quien cuenta los cuenta así. Que el 20 esté en los dos no
 * es un error: existen el billete y la moneda.
 */
export const DENOMINACIONES_BASE = Object.freeze({
  billetes: [1000, 500, 200, 100, 50, 20],
  monedas: [20, 10, 5, 2, 1, 0.5],
});

const numeros = (x) =>
  (Array.isArray(x) ? x : [])
    .map((n) => Number(n))
    .filter((n) => Number.isFinite(n) && n > 0)
    .sort((a, b) => b - a);

/**
 * Las denominaciones que ofrece la pantalla de arqueo.
 *
 * La configuración manda; la constante sólo rescata. Misma regla que
 * `lib/Catalogo.js`: los cinco locales tienen hoy la columna en NULL, y leerla
 * a secas dejaría la pantalla sin con qué contar.
 */
export function denominacionesDe(configuracion) {
  let bruto = configuracion?.denominaciones ?? null;

  // El jsonb a veces viaja como string doble-codificado. La misma defensa que
  // en `lib/Catalogo.js`, por el mismo motivo.
  if (typeof bruto === 'string') {
    try {
      bruto = JSON.parse(bruto);
    } catch {
      bruto = null;
    }
  }

  const billetes = numeros(bruto?.billetes);
  const monedas = numeros(bruto?.monedas);
  if (!billetes.length && !monedas.length) return DENOMINACIONES_BASE;
  return { billetes, monedas };
}

/** Céntimos enteros, para que sumar dinero no arrastre coma flotante. */
const centavos = (n) => Math.round((Number(n) || 0) * 100);

/**
 * ¿Se contó?
 *
 * **Un desglose vacío (`{}`) NO es lo mismo que ausente (`null`).** `{}` es
 * «conté y no había nada»; `null` es «no se contó». Si no se distinguen, un
 * cierre sin contar se lee después como una caja vacía — y eso es inventar un
 * dato, no perderlo.
 */
export function seConto(desglose) {
  return !!desglose && typeof desglose === 'object' && !Array.isArray(desglose);
}

/**
 * Lo que dice un desglose: cuánto suma y cuántas piezas hay.
 *
 * @returns {{conto: boolean, contado: number, piezas: number}}
 *   `contado` y `piezas` son 0 cuando no se contó. **Quien decida algo con
 *   esos ceros tiene que mirar `conto` primero.**
 */
export function arqueoDeDesglose(desglose) {
  if (!seConto(desglose)) return { conto: false, contado: 0, piezas: 0 };

  let cent = 0;
  let piezas = 0;
  for (const [den, cuantas] of Object.entries(desglose)) {
    const valor = Number(den);
    const n = Number(cuantas);
    // Basura fuera: una denominación que no es número, o un conteo negativo o
    // fraccionario, no se «arregla» — se ignora. Media moneda no existe.
    if (!Number.isFinite(valor) || valor <= 0) continue;
    if (!Number.isInteger(n) || n <= 0) continue;
    cent += centavos(valor) * n;
    piezas += n;
  }
  return { conto: true, contado: cent / 100, piezas };
}

/**
 * El arqueo de un turno: lo esperado contra lo contado.
 *
 * **La diferencia sale del desglose, nunca de un número tecleado.** Y cuando no
 * se contó, `diferencia` es `null` y no cero: un cero diría que la caja cuadra,
 * que es justo lo que no se sabe.
 *
 * @param {{esperado:number, desglose:object|null}} p
 * @returns {{conto:boolean, esperado:number, contado:number, piezas:number,
 *            diferencia:number|null}}
 */
export function arqueoDelTurno({ esperado, desglose } = {}) {
  const esp = Math.round((Number(esperado) || 0) * 100) / 100;
  const { conto, contado, piezas } = arqueoDeDesglose(desglose);
  return {
    conto,
    esperado: esp,
    contado,
    piezas,
    diferencia: conto ? Math.round((contado - esp) * 100) / 100 : null,
  };
}
