/**
 * Letras.js — el importe escrito con palabras.
 *
 *   567.00  →  "QUINIENTOS SESENTA Y SIETE PESOS 00/100 M.N."
 *
 * ── PARA QUÉ SIRVE, QUE NO ES ADORNO ────────────────────────────────────────
 * Es la línea que impide alterar la cifra a mano. Un «$567.00» impreso se
 * convierte en «$1,567.00» con un bolígrafo; «QUINIENTOS SESENTA Y SIETE» no.
 * Por eso lleva décadas en los comprobantes mexicanos y por eso aparece en el
 * ticket de referencia que trajo Chris.
 *
 * Y de ahí sale la exigencia de este módulo: **una cifra en letra que no
 * coincide con el número es peor que no ponerla**, porque convierte el
 * documento en discutible justo donde debía ser incuestionable. De las ~200
 * líneas del archivo, la mitad son los casos que el español tiene y el inglés
 * no.
 *
 * ── LOS CASOS QUE SE ESCAPAN SI SE ESCRIBE DEPRISA ──────────────────────────
 *   1 →  UN PESO          (no «UNO PESO»)
 *  21 →  VEINTIUN PESOS   (junto, y sin la Y de «veinte y uno»)
 * 100 →  CIEN PESOS       pero 101 → CIENTO UN PESOS
 * 500 →  QUINIENTOS       (no «CINCOCIENTOS»)
 * 700 →  SETECIENTOS      (no «SIETECIENTOS»)
 * 900 →  NOVECIENTOS      (no «NUEVECIENTOS»)
 *   1 000 → MIL           (no «UN MIL»)
 *   1 000 000 → UN MILLÓN (aquí sí lleva UN)
 *   2 000 000 → DOS MILLONES
 *
 * ── LOS CENTAVOS VAN EN CIFRA ───────────────────────────────────────────────
 * «00/100» y no «CERO CENTAVOS». Es la convención de los comprobantes
 * mexicanos y además evita el problema: los centavos son los que más se
 * manipulan y en fracción quedan pegados al denominador.
 */

const UNIDADES = [
  '',
  'UN',
  'DOS',
  'TRES',
  'CUATRO',
  'CINCO',
  'SEIS',
  'SIETE',
  'OCHO',
  'NUEVE',
  'DIEZ',
  'ONCE',
  'DOCE',
  'TRECE',
  'CATORCE',
  'QUINCE',
  'DIECISEIS',
  'DIECISIETE',
  'DIECIOCHO',
  'DIECINUEVE',
  'VEINTE',
];

// 21-29 se escriben en una sola palabra: VEINTIUNO, VEINTIDOS… De 30 en
// adelante vuelve la Y: TREINTA Y UNO.
const VEINTIS = [
  '',
  'VEINTIUN',
  'VEINTIDOS',
  'VEINTITRES',
  'VEINTICUATRO',
  'VEINTICINCO',
  'VEINTISEIS',
  'VEINTISIETE',
  'VEINTIOCHO',
  'VEINTINUEVE',
];

const DECENAS = [
  '',
  '',
  'VEINTE',
  'TREINTA',
  'CUARENTA',
  'CINCUENTA',
  'SESENTA',
  'SETENTA',
  'OCHENTA',
  'NOVENTA',
];

// Los irregulares están escritos a mano y no derivados: derivarlos costaría más
// que enumerarlos y saldría mal en QUINIENTOS, SETECIENTOS y NOVECIENTOS, que
// son justamente los que la gente escribe mal.
const CENTENAS = [
  '',
  'CIENTO',
  'DOSCIENTOS',
  'TRESCIENTOS',
  'CUATROCIENTOS',
  'QUINIENTOS',
  'SEISCIENTOS',
  'SETECIENTOS',
  'OCHOCIENTOS',
  'NOVECIENTOS',
];

/** 0–999 en palabras. Devuelve '' para el cero: quien llama decide qué hacer. */
function centenasEnLetra(n) {
  if (n === 0) return '';
  if (n === 100) return 'CIEN'; // el único apócope de centena

  const c = Math.floor(n / 100);
  const resto = n % 100;
  const partes = [];

  if (c > 0) partes.push(CENTENAS[c]);
  if (resto > 0) partes.push(decenasEnLetra(resto));

  return partes.join(' ');
}

/** 1–99 en palabras. */
function decenasEnLetra(n) {
  if (n <= 20) return UNIDADES[n];
  if (n < 30) return VEINTIS[n - 20];

  const d = Math.floor(n / 10);
  const u = n % 10;
  return u === 0 ? DECENAS[d] : `${DECENAS[d]} Y ${UNIDADES[u]}`;
}

/**
 * Entero en palabras, sin la moneda.
 *
 * @param {number} n entero no negativo
 * @returns {string} p.ej. 'QUINIENTOS SESENTA Y SIETE'
 */
export function enteroEnLetra(n) {
  const entero = Math.floor(Math.abs(Number(n) || 0));
  if (entero === 0) return 'CERO';

  const millones = Math.floor(entero / 1_000_000);
  const miles = Math.floor((entero % 1_000_000) / 1000);
  const resto = entero % 1000;

  const partes = [];

  if (millones > 0) {
    // «UN MILLÓN» sí lleva el UN; «MIL» no lo lleva. No es una inconsistencia
    // del código, es del idioma.
    partes.push(
      millones === 1 ? 'UN MILLON' : `${centenasEnLetra(millones)} MILLONES`,
    );
  }

  if (miles > 0) {
    partes.push(miles === 1 ? 'MIL' : `${centenasEnLetra(miles)} MIL`);
  }

  if (resto > 0) partes.push(centenasEnLetra(resto));

  return partes.join(' ');
}

/**
 * Importe completo, tal y como va en el papel.
 *
 * @param {number} monto
 * @param {object} [opciones]
 * @param {string} [opciones.singular] 'PESO'
 * @param {string} [opciones.plural]   'PESOS'
 * @param {string} [opciones.sufijo]   'M.N.' (moneda nacional)
 * @returns {string} 'QUINIENTOS SESENTA Y SIETE PESOS 00/100 M.N.'
 */
export function importeEnLetra(
  monto,
  { singular = 'PESO', plural = 'PESOS', sufijo = 'M.N.' } = {},
) {
  const valor = Number(monto);
  const seguro = Number.isFinite(valor) ? Math.abs(valor) : 0;

  // ── EL ENTERO Y LOS CENTAVOS SE LEEN DE LA CIFRA YA FORMATEADA ────────────
  // No de `Math.round(monto * 100)`, que era el primer intento y estaba mal.
  //
  // En JavaScript conviven TRES redondeos que no coinciden:
  //
  //   monto     Intl      toFixed   Math.round(x*100)
  //   1.005     1.01      1.00      1.00
  //   1.015     1.02      1.01      1.01
  //   2.675     2.68      2.67      2.68
  //
  // `Intl` redondea sobre la representación DECIMAL del número; los otros dos,
  // sobre el binario, que para 1.005 vale en realidad 1.00499999…
  //
  // La cifra que se imprime en el papel sale de `Intl` (ver `money` en
  // Comanda.js). Si la letra usara otro redondeo, el mismo ticket diría
  // «$1.01» tres renglones encima de «UN PESO 00/100» — y una cifra en letra
  // que contradice al número es peor que no ponerla, porque convierte en
  // discutible justo el dato que venía a blindar.
  //
  // Así que se formatea igual y se lee de ahí. La coincidencia deja de ser una
  // casualidad aritmética y pasa a ser estructural.
  //
  // Locale fijo `en-US` y sin agrupación: aquí sólo se necesitan los dígitos y
  // un punto decimal. El redondeo de `Intl` no depende del locale — sólo los
  // separadores, y son justo lo que estorba para parsear.
  const formateado = seguro.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    useGrouping: false,
  });
  const [parteEntera, parteDecimal] = formateado.split('.');
  const entero = Number.parseInt(parteEntera, 10) || 0;
  const centavos = Number.parseInt(parteDecimal ?? '0', 10) || 0;

  // El plural depende del ENTERO, no del total: $1.50 es «UN PESO 50/100».
  const moneda = entero === 1 ? singular : plural;
  const fraccion = String(centavos).padStart(2, '0');

  const partes = [enteroEnLetra(entero), moneda, `${fraccion}/100`];
  if (sufijo) partes.push(sufijo);

  return partes.join(' ');
}
