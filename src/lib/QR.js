/**
 * QR.js — codificador de códigos QR, modo byte, nivel de corrección M.
 *
 * POR QUÉ ESTÁ ESCRITO A MANO Y NO ES UN PAQUETE.
 *
 * Se necesita UN QR, en UNA pantalla, con una URL corta dentro. Traer una
 * dependencia para eso significa cargarla en el bundle de todos los
 * dispositivos del local —incluido el teléfono del mesero, que arranca desde la
 * caja por wifi— y sumar una pieza más que mantener. Son ~250 líneas de
 * aritmética determinista: no cambia, no tiene estado, no habla con nadie.
 *
 * PERO un QR mal generado no da error: da un cuadro que el teléfono no escanea,
 * que es exactamente el problema que esta pantalla venía a resolver. Así que
 * **no se confía en que esté bien**: `QR.test.js` compara la matriz completa,
 * módulo a módulo, contra vectores generados con la librería `qrcode` (la
 * referencia de facto). Esa librería se instaló solo en el entorno de
 * verificación; el proyecto no la lleva.
 *
 * Alcance deliberado: versiones 1–10 (hasta 216 bytes de datos) y solo modo
 * byte. Da de sobra para `http://192.168.1.100:3000/?token=…` y evita el resto
 * de la especificación, que aquí no se usaría nunca.
 *
 * Puro: sin React, sin DOM, sin red. Devuelve una matriz de booleanos.
 */

// ─── Tabla de bloques por versión, nivel M ───────────────────────────────────
// [ecPorBloque, bloquesG1, datosPorBloqueG1, bloquesG2, datosPorBloqueG2]
// El grupo 2 existe porque los datos no siempre reparten exacto entre bloques:
// sus bloques llevan UN codeword más que los del grupo 1.
const BLOQUES_M = {
  1: [10, 1, 16, 0, 0],
  2: [16, 1, 28, 0, 0],
  3: [26, 1, 44, 0, 0],
  4: [18, 2, 32, 0, 0],
  5: [24, 2, 43, 0, 0],
  6: [16, 4, 27, 0, 0],
  7: [18, 4, 31, 0, 0],
  8: [22, 2, 38, 2, 39],
  9: [22, 3, 36, 2, 37],
  10: [26, 4, 43, 1, 44],
};

// Centros de los patrones de alineación por versión.
const ALINEACION = {
  1: [],
  2: [6, 18],
  3: [6, 22],
  4: [6, 26],
  5: [6, 30],
  6: [6, 34],
  7: [6, 22, 38],
  8: [6, 24, 42],
  9: [6, 26, 46],
  10: [6, 28, 50],
};

const VERSION_MAX = 10;

/** Capacidad en bytes de datos (sin contar cabecera) por versión, nivel M. */
function capacidadBytes(version) {
  const [ec, b1, d1, b2, d2] = BLOQUES_M[version];
  void ec;
  const totalDatos = b1 * d1 + b2 * d2;
  // 4 bits de modo + 8 o 16 bits de longitud, redondeado a bytes.
  const cabecera = version < 10 ? 2 : 3;
  return totalDatos - cabecera;
}

// ─── Aritmética en GF(256) ───────────────────────────────────────────────────
// Polinomio primitivo 0x11D, el que fija la especificación de QR.
const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
(function construirTablas() {
  let x = 1;
  for (let i = 0; i < 255; i += 1) {
    EXP[i] = x;
    LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i += 1) EXP[i] = EXP[i - 255];
})();

function mul(a, b) {
  if (a === 0 || b === 0) return 0;
  return EXP[LOG[a] + LOG[b]];
}

/** Polinomio generador de grado `grado` para Reed-Solomon. */
function generador(grado) {
  let poly = [1];
  for (let i = 0; i < grado; i += 1) {
    const siguiente = new Array(poly.length + 1).fill(0);
    for (let j = 0; j < poly.length; j += 1) {
      siguiente[j] ^= poly[j];
      siguiente[j + 1] ^= mul(poly[j], EXP[i]);
    }
    poly = siguiente;
  }
  return poly;
}

/** Codewords de corrección de errores de un bloque de datos. */
function ecDeBloque(datos, cuantos) {
  const gen = generador(cuantos);
  const resto = new Array(cuantos).fill(0);

  for (const byte of datos) {
    const factor = byte ^ resto[0];
    resto.shift();
    resto.push(0);
    if (factor !== 0) {
      for (let i = 0; i < cuantos; i += 1) {
        resto[i] ^= mul(gen[i + 1], factor);
      }
    }
  }
  return resto;
}

// ─── Codificación de los datos ───────────────────────────────────────────────

/** Texto a bytes UTF-8. El QR transporta bytes; la interpretación es del lector. */
function aUtf8(texto) {
  return Array.from(new TextEncoder().encode(String(texto ?? '')));
}

/** Versión más pequeña donde caben los datos. */
export function versionParaBytes(cuantos) {
  for (let v = 1; v <= VERSION_MAX; v += 1) {
    if (cuantos <= capacidadBytes(v)) return v;
  }
  return null;
}

class Bits {
  constructor() {
    this.bits = [];
  }
  push(valor, cuantos) {
    for (let i = cuantos - 1; i >= 0; i -= 1) {
      this.bits.push((valor >>> i) & 1);
    }
  }
  get length() {
    return this.bits.length;
  }
}

function codificarDatos(bytes, version) {
  const [ec, b1, d1, b2, d2] = BLOQUES_M[version];
  const totalDatos = b1 * d1 + b2 * d2;

  const bits = new Bits();
  bits.push(0b0100, 4); // modo byte
  bits.push(bytes.length, version < 10 ? 8 : 16);
  for (const b of bytes) bits.push(b, 8);

  // Terminador: hasta 4 ceros, pero sin pasarse de la capacidad.
  const capacidadBits = totalDatos * 8;
  const terminador = Math.min(4, capacidadBits - bits.length);
  bits.push(0, terminador);

  // Relleno hasta cerrar el byte.
  while (bits.length % 8 !== 0) bits.push(0, 1);

  // Bytes de relleno alternos que fija la especificación.
  const relleno = [0xec, 0x11];
  let i = 0;
  while (bits.length < capacidadBits) {
    bits.push(relleno[i % 2], 8);
    i += 1;
  }

  // De bits a codewords.
  const codewords = [];
  for (let k = 0; k < bits.length; k += 8) {
    let byte = 0;
    for (let j = 0; j < 8; j += 1) byte = (byte << 1) | bits.bits[k + j];
    codewords.push(byte);
  }

  // Reparto en bloques.
  const bloquesDatos = [];
  const bloquesEc = [];
  let pos = 0;
  for (let n = 0; n < b1 + b2; n += 1) {
    const tam = n < b1 ? d1 : d2;
    const bloque = codewords.slice(pos, pos + tam);
    pos += tam;
    bloquesDatos.push(bloque);
    bloquesEc.push(ecDeBloque(bloque, ec));
  }

  // INTERCALADO: se toma el codeword 0 de cada bloque, luego el 1, etc. Es lo
  // que permite que una mancha de café concentrada destruya un trozo contiguo
  // del símbolo sin agotar la corrección de un solo bloque.
  const salida = [];
  const maxDatos = Math.max(d1, d2);
  for (let k = 0; k < maxDatos; k += 1) {
    for (const bloque of bloquesDatos) {
      if (k < bloque.length) salida.push(bloque[k]);
    }
  }
  for (let k = 0; k < ec; k += 1) {
    for (const bloque of bloquesEc) salida.push(bloque[k]);
  }

  return salida;
}

// ─── Construcción de la matriz ───────────────────────────────────────────────

function nuevaMatriz(tam) {
  return Array.from({ length: tam }, () => new Array(tam).fill(null));
}

function ponerFinder(m, fila, col) {
  for (let i = -1; i <= 7; i += 1) {
    for (let j = -1; j <= 7; j += 1) {
      const r = fila + i;
      const c = col + j;
      if (r < 0 || c < 0 || r >= m.length || c >= m.length) continue;

      // El patrón es de 7×7 (índices 0..6). El anillo de fuera —índices −1 y 7—
      // es el SEPARADOR y va en blanco: es lo que aísla el patrón de los datos
      // para que el lector lo reconozca. Pintarlo de negro, como hacía la
      // primera versión de esta función, produce un símbolo que no escanea.
      const dentro = i >= 0 && i <= 6 && j >= 0 && j <= 6;
      if (!dentro) {
        m[r][c] = false;
        continue;
      }

      const borde = i === 0 || i === 6 || j === 0 || j === 6;
      const centro = i >= 2 && i <= 4 && j >= 2 && j <= 4;
      m[r][c] = borde || centro;
    }
  }
}

function ponerAlineacion(m, version) {
  const centros = ALINEACION[version];
  const tam = m.length;
  for (const r of centros) {
    for (const c of centros) {
      // Los tres solapes con los finders se omiten.
      const enFinder =
        (r <= 8 && c <= 8) ||
        (r <= 8 && c >= tam - 9) ||
        (r >= tam - 9 && c <= 8);
      if (enFinder) continue;
      for (let i = -2; i <= 2; i += 1) {
        for (let j = -2; j <= 2; j += 1) {
          m[r + i][c + j] = Math.max(Math.abs(i), Math.abs(j)) !== 1;
        }
      }
    }
  }
}

function ponerTiming(m) {
  const tam = m.length;
  for (let i = 8; i < tam - 8; i += 1) {
    const oscuro = i % 2 === 0;
    if (m[6][i] === null) m[6][i] = oscuro;
    if (m[i][6] === null) m[i][6] = oscuro;
  }
}

/** Casillas que ocupará la información de formato (y el módulo oscuro fijo). */
function reservarFormato(m) {
  const tam = m.length;
  for (let i = 0; i < 9; i += 1) {
    if (m[8][i] === null) m[8][i] = false;
    if (m[i][8] === null) m[i][8] = false;
  }
  for (let i = 0; i < 8; i += 1) {
    if (m[8][tam - 1 - i] === null) m[8][tam - 1 - i] = false;
    if (m[tam - 1 - i][8] === null) m[tam - 1 - i][8] = false;
  }
  m[tam - 8][8] = true; // módulo oscuro, siempre negro
}

function reservarVersion(m, version) {
  if (version < 7) return;
  const tam = m.length;
  for (let i = 0; i < 6; i += 1) {
    for (let j = 0; j < 3; j += 1) {
      m[tam - 11 + j][i] = false;
      m[i][tam - 11 + j] = false;
    }
  }
}

/** Copia de la matriz marcando qué casillas son de función (no llevan datos). */
function mapaFunciones(version) {
  const tam = 17 + 4 * version;
  const m = nuevaMatriz(tam);
  ponerFinder(m, 0, 0);
  ponerFinder(m, 0, tam - 7);
  ponerFinder(m, tam - 7, 0);
  ponerAlineacion(m, version);
  ponerTiming(m);
  reservarFormato(m);
  reservarVersion(m, version);
  return m;
}

/** Coloca los codewords en zigzag, de abajo a la derecha hacia arriba. */
function ponerDatos(m, codewords) {
  const tam = m.length;
  let bitIndex = 0;
  const totalBits = codewords.length * 8;

  const siguienteBit = () => {
    if (bitIndex >= totalBits) return false; // bits de relleno del final
    const byte = codewords[bitIndex >> 3];
    const bit = (byte >>> (7 - (bitIndex & 7))) & 1;
    bitIndex += 1;
    return bit === 1;
  };

  let arriba = true;
  for (let col = tam - 1; col > 0; col -= 2) {
    // La columna 6 es la de timing vertical: se salta entera.
    if (col === 6) col -= 1;
    for (let paso = 0; paso < tam; paso += 1) {
      const fila = arriba ? tam - 1 - paso : paso;
      for (let d = 0; d < 2; d += 1) {
        const c = col - d;
        if (m[fila][c] !== null) continue;
        m[fila][c] = siguienteBit();
      }
    }
    arriba = !arriba;
  }
}

const MASCARAS = [
  (i, j) => (i + j) % 2 === 0,
  (i) => i % 2 === 0,
  (i, j) => j % 3 === 0,
  (i, j) => (i + j) % 3 === 0,
  (i, j) => (Math.floor(i / 2) + Math.floor(j / 3)) % 2 === 0,
  (i, j) => ((i * j) % 2) + ((i * j) % 3) === 0,
  (i, j) => (((i * j) % 2) + ((i * j) % 3)) % 2 === 0,
  (i, j) => (((i + j) % 2) + ((i * j) % 3)) % 2 === 0,
];

/**
 * Penalización de un patrón, según las cuatro reglas de la especificación.
 * Se elige la máscara con MENOR penalización: la que menos se parece a los
 * patrones de posicionamiento y menos zonas uniformes deja, que es lo que
 * confunde a un lector.
 */
export function penalizacion(m) {
  const tam = m.length;
  let total = 0;

  // Regla 1: rachas de 5 o más del mismo color.
  const rachas = (obtener) => {
    let suma = 0;
    for (let a = 0; a < tam; a += 1) {
      let largo = 1;
      for (let b = 1; b < tam; b += 1) {
        if (obtener(a, b) === obtener(a, b - 1)) {
          largo += 1;
        } else {
          if (largo >= 5) suma += 3 + (largo - 5);
          largo = 1;
        }
      }
      if (largo >= 5) suma += 3 + (largo - 5);
    }
    return suma;
  };
  total += rachas((a, b) => m[a][b]);
  total += rachas((a, b) => m[b][a]);

  // Regla 2: bloques de 2×2 del mismo color.
  for (let i = 0; i < tam - 1; i += 1) {
    for (let j = 0; j < tam - 1; j += 1) {
      const v = m[i][j];
      if (v === m[i][j + 1] && v === m[i + 1][j] && v === m[i + 1][j + 1]) {
        total += 3;
      }
    }
  }

  // Regla 3: el patrón 1:1:3:1:1 con zona clara, que imita a un finder.
  const patronA = [
    true,
    false,
    true,
    true,
    true,
    false,
    true,
    false,
    false,
    false,
    false,
  ];
  const patronB = [
    false,
    false,
    false,
    false,
    true,
    false,
    true,
    true,
    true,
    false,
    true,
  ];
  const coincide = (obtener, a, b, patron) => {
    for (let k = 0; k < 11; k += 1) {
      if (obtener(a, b + k) !== patron[k]) return false;
    }
    return true;
  };
  for (let a = 0; a < tam; a += 1) {
    for (let b = 0; b <= tam - 11; b += 1) {
      if (coincide((x, y) => m[x][y], a, b, patronA)) total += 40;
      if (coincide((x, y) => m[x][y], a, b, patronB)) total += 40;
      if (coincide((x, y) => m[y][x], a, b, patronA)) total += 40;
      if (coincide((x, y) => m[y][x], a, b, patronB)) total += 40;
    }
  }

  // Regla 4: desequilibrio entre claro y oscuro.
  let oscuros = 0;
  for (let i = 0; i < tam; i += 1) {
    for (let j = 0; j < tam; j += 1) if (m[i][j]) oscuros += 1;
  }
  const porcentaje = (oscuros * 100) / (tam * tam);
  total += Math.floor(Math.abs(porcentaje - 50) / 5) * 10;

  return total;
}

/** BCH(15,5) para la información de formato. */
function bitsFormato(mascara) {
  // Nivel M = 0b00.
  const datos = (0b00 << 3) | mascara;
  let resto = datos << 10;
  for (let i = 14; i >= 10; i -= 1) {
    if ((resto >>> i) & 1) resto ^= 0x537 << (i - 10);
  }
  return ((datos << 10) | resto) ^ 0x5412;
}

/** BCH(18,6) para la información de versión (solo v7 en adelante). */
function bitsVersion(version) {
  let resto = version << 12;
  for (let i = 17; i >= 12; i -= 1) {
    if ((resto >>> i) & 1) resto ^= 0x1f25 << (i - 12);
  }
  return (version << 12) | resto;
}

function escribirFormato(m, mascara) {
  const tam = m.length;
  const bits = bitsFormato(mascara);
  const bit = (k) => ((bits >>> k) & 1) === 1;

  // Copia junto al patrón superior izquierdo: baja por la COLUMNA 8 y luego
  // sigue por la fila 8. El orden fila/columna importa y es fácil de invertir
  // —la primera versión de esto estaba transpuesta—; el símbolo salía con el
  // tamaño y los datos correctos, y ningún lector lo reconocía.
  for (let k = 0; k <= 5; k += 1) m[k][8] = bit(k);
  m[7][8] = bit(6);
  m[8][8] = bit(7);
  m[8][7] = bit(8);
  for (let k = 9; k <= 14; k += 1) m[8][14 - k] = bit(k);

  // Segunda copia, repartida entre los otros dos patrones. Está duplicada a
  // propósito en la especificación: si se daña una esquina, el lector todavía
  // puede saber con qué máscara y nivel se codificó.
  for (let k = 0; k <= 7; k += 1) m[8][tam - 1 - k] = bit(k);
  for (let k = 8; k <= 14; k += 1) m[tam - 15 + k][8] = bit(k);

  m[tam - 8][8] = true;
}

function escribirVersion(m, version) {
  if (version < 7) return;
  const tam = m.length;
  const bits = bitsVersion(version);
  for (let k = 0; k < 18; k += 1) {
    const valor = ((bits >>> k) & 1) === 1;
    const fila = Math.floor(k / 3);
    const col = (k % 3) + tam - 11;
    m[fila][col] = valor;
    m[col][fila] = valor;
  }
}

/**
 * Genera la matriz del QR.
 *
 * @param {string} texto
 * @param {{ mascara?: number }} [opciones]  máscara fija; si no, se elige la
 *   de menor penalización, que es lo que manda la especificación.
 * @returns {boolean[][]|null}  `null` si el texto no cabe en la versión 10.
 */
export function generar(texto, { mascara = null } = {}) {
  const bytes = aUtf8(texto);
  const version = versionParaBytes(bytes.length);
  if (!version) return null;

  const codewords = codificarDatos(bytes, version);
  const funciones = mapaFunciones(version);

  // Se marca qué casillas son de función ANTES de colocar datos: la máscara no
  // debe tocarlas, o el lector no encontraría los patrones de referencia.
  const esFuncion = funciones.map((fila) => fila.map((v) => v !== null));

  const base = funciones.map((fila) => fila.slice());
  ponerDatos(base, codewords);

  const candidatas = mascara === null ? [0, 1, 2, 3, 4, 5, 6, 7] : [mascara];
  let mejor = null;
  let mejorPuntos = Infinity;

  for (const idx of candidatas) {
    const m = base.map((fila) => fila.slice());
    for (let i = 0; i < m.length; i += 1) {
      for (let j = 0; j < m.length; j += 1) {
        if (!esFuncion[i][j] && MASCARAS[idx](i, j)) m[i][j] = !m[i][j];
      }
    }
    escribirFormato(m, idx);
    escribirVersion(m, version);

    const puntos = penalizacion(m);
    if (puntos < mejorPuntos) {
      mejorPuntos = puntos;
      mejor = m;
    }
  }

  return mejor;
}

/**
 * Dibuja la matriz como SVG.
 *
 * El margen (zona tranquila) es de 4 módulos y NO es decorativo: sin él muchos
 * lectores no encuentran el símbolo. Es el fallo más común al pintar un QR a
 * mano, y se nota justo cuando alguien intenta escanearlo con prisa.
 */
export function aSvg(matriz, { tamano = 240, margen = 4 } = {}) {
  if (!matriz || matriz.length === 0) return '';
  const modulos = matriz.length + margen * 2;
  const camino = [];

  for (let i = 0; i < matriz.length; i += 1) {
    for (let j = 0; j < matriz.length; j += 1) {
      if (matriz[i][j]) camino.push(`M${j + margen} ${i + margen}h1v1h-1z`);
    }
  }

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${modulos} ${modulos}"`,
    ` width="${tamano}" height="${tamano}" shape-rendering="crispEdges">`,
    `<rect width="${modulos}" height="${modulos}" fill="#ffffff"/>`,
    `<path d="${camino.join('')}" fill="#000000"/>`,
    '</svg>',
  ].join('');
}
