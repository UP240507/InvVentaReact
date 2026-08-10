import { describe, it, expect } from 'vitest';
import { generar, aSvg, versionParaBytes, penalizacion } from './QR';

// ─── Vectores de referencia ──────────────────────────────────────────────────
// Generados con la librería `qrcode` (la implementación de referencia de facto
// en JS), instalada SOLO en el entorno de verificación — el proyecto no la
// lleva. Se forzó `mode: 'byte'` porque esa librería optimiza segmentos y mezcla
// modo numérico y alfanumérico; este codificador implementa solo modo byte, a
// propósito, y comparar contra un símbolo de modo mixto daba diferencias que
// parecían bugs y no lo eran.
//
// Un QR mal generado NO da error: da un cuadro que el teléfono no escanea. Por
// eso la comparación es módulo a módulo y no "parece un QR".

// Hash FNV-1a de 32 bits sobre las filas. Determinista y sin dependencias:
// permite fijar versiones grandes sin meter matrices de 57×57 en el repo.
function huella(matriz) {
  let h = 0x811c9dc5;
  for (const fila of matriz) {
    for (const modulo of fila) {
      h ^= modulo ? 49 : 48; // '1' : '0'
      h = Math.imul(h, 0x01000193) >>> 0;
    }
  }
  return h.toString(16).padStart(8, '0');
}

const aFilas = (matriz) =>
  matriz.map((f) => f.map((v) => (v ? '1' : '0')).join(''));

// Dos matrices completas, para que un fallo se pueda mirar a ojo.
const HOLA = [
  '111111100101001111111',
  '100000101111101000001',
  '101110100010001011101',
  '101110100110101011101',
  '101110101111101011101',
  '100000100011001000001',
  '111111101010101111111',
  '000000000100000000000',
  '101010100100100010010',
  '011011010101010100110',
  '011111110111011101011',
  '100101000101110110010',
  '011001111011011100100',
  '000000001000001000110',
  '111111100010100010111',
  '100000100000001000010',
  '101110101110101010111',
  '101110100001010101010',
  '101110101101011101101',
  '100000100111110111010',
  '111111101111011100111',
];

const ENIE = [
  '111111100100001111111',
  '100000100100001000001',
  '101110101100101011101',
  '101110101010001011101',
  '101110101111101011101',
  '100000101000101000001',
  '111111101010101111111',
  '000000001001100000000',
  '101111100110101111100',
  '010011001000100100111',
  '001110101011010011101',
  '001111010010000110111',
  '101100101001010010100',
  '000000001111111001000',
  '111111100100101100011',
  '100000101011111001001',
  '101110101010100100100',
  '101110101000100100100',
  '101110101111010011100',
  '100000100010000110100',
  '111111101111010011110',
];

// Barrido de versiones 1–10 y varias máscaras, fijado por huella.
const x = (n) => 'x'.repeat(n);
const VECTORES = [
  { texto: 'HOLA', version: 1, tam: 21, huella: '6d6ae2cb' },
  { texto: 'ñ', version: 1, tam: 21, huella: 'cc86fdc5' },
  { texto: 'http://localhost:3000', version: 2, tam: 25, huella: 'c2dbca71' },
  {
    texto: 'http://192.168.1.7:3000/?token=a1b2c3d4e5f60718',
    version: 4,
    tam: 33,
    huella: '7ebb0586',
  },
  { texto: x(14), version: 1, tam: 21, huella: '51cc325f' },
  { texto: x(26), version: 2, tam: 25, huella: '61cc7b11' },
  { texto: x(42), version: 3, tam: 29, huella: 'd9897c6d' },
  { texto: x(62), version: 4, tam: 33, huella: '94fd3ae7' },
  { texto: x(84), version: 5, tam: 37, huella: 'fa6b3bad' },
  { texto: x(106), version: 6, tam: 41, huella: 'f3a7ca2f' },
  { texto: x(122), version: 7, tam: 45, huella: '1f29266b' },
  { texto: x(152), version: 8, tam: 49, huella: '184d2d51' },
  { texto: x(180), version: 9, tam: 53, huella: '6f5f77ad' },
  { texto: x(213), version: 10, tam: 57, huella: '7ed0c5d3' },
];

describe('matriz idéntica a la referencia', () => {
  it('«HOLA» — matriz completa, módulo a módulo', () => {
    expect(aFilas(generar('HOLA'))).toEqual(HOLA);
  });

  it('«ñ» — dos bytes UTF-8, matriz completa', () => {
    // Comprueba de paso que el texto viaja como UTF-8 y no como latin-1.
    expect(aFilas(generar('ñ'))).toEqual(ENIE);
  });

  for (const v of VECTORES) {
    const nombre =
      v.texto.length > 20
        ? `${v.texto.length} bytes → v${v.version}`
        : `«${v.texto}»`;

    it(`${nombre} coincide con la referencia`, () => {
      const m = generar(v.texto);
      expect(m).not.toBeNull();
      expect(m.length).toBe(v.tam);
      expect(huella(m)).toBe(v.huella);
    });
  }
});

describe('elección de versión', () => {
  it('usa la versión más pequeña donde quepa', () => {
    expect(versionParaBytes(1)).toBe(1);
    expect(versionParaBytes(14)).toBe(1);
    expect(versionParaBytes(15)).toBe(2);
    expect(versionParaBytes(26)).toBe(2);
    expect(versionParaBytes(27)).toBe(3);
  });

  it('devuelve null por encima de la versión 10, en vez de un QR roto', () => {
    // El alcance es deliberado: una URL de emparejamiento nunca llega ahí. Si
    // alguna vez llegara, es mejor no pintar nada que pintar algo ilegible.
    expect(versionParaBytes(214)).toBeNull();
    expect(generar(x(400))).toBeNull();
  });

  it('la frontera exacta de la versión 10 cabe', () => {
    expect(versionParaBytes(213)).toBe(10);
    expect(generar(x(213))).not.toBeNull();
  });
});

describe('estructura del símbolo', () => {
  const m = generar('http://192.168.1.7:3000/?token=a1b2c3d4e5f60718');

  it('los tres patrones de posición están donde deben', () => {
    const tam = m.length;
    for (const [f, c] of [
      [0, 0],
      [0, tam - 7],
      [tam - 7, 0],
    ]) {
      expect(m[f][c]).toBe(true); // esquina del anillo
      expect(m[f + 1][c + 1]).toBe(false); // hueco blanco
      expect(m[f + 3][c + 3]).toBe(true); // centro
    }
  });

  it('el separador alrededor del patrón va en blanco', () => {
    // Es el bug que tuvo la primera versión: pintarlo de negro da un símbolo
    // del tamaño correcto y con los datos correctos que ningún lector acepta.
    for (let k = 0; k <= 7; k += 1) {
      expect(m[7][k]).toBe(false);
      expect(m[k][7]).toBe(false);
    }
  });

  it('el patrón de sincronización alterna desde el módulo 8', () => {
    for (let i = 8; i < m.length - 8; i += 1) {
      expect(m[6][i]).toBe(i % 2 === 0);
      expect(m[i][6]).toBe(i % 2 === 0);
    }
  });

  it('el módulo oscuro fijo está puesto', () => {
    expect(m[m.length - 8][8]).toBe(true);
  });
});

describe('máscara', () => {
  it('se elige la de menor penalización', () => {
    const texto = 'http://192.168.1.7:3000/?token=a1b2c3d4e5f60718';
    const elegida = penalizacion(generar(texto));
    for (let k = 0; k < 8; k += 1) {
      expect(elegida).toBeLessThanOrEqual(
        penalizacion(generar(texto, { mascara: k })),
      );
    }
  });

  it('forzar una máscara distinta cambia el símbolo', () => {
    const a = aFilas(generar('HOLA', { mascara: 0 }));
    const b = aFilas(generar('HOLA', { mascara: 5 }));
    expect(a).not.toEqual(b);
  });
});

describe('aSvg', () => {
  const m = generar('HOLA');

  it('deja la zona tranquila de 4 módulos', () => {
    // Sin margen, muchos lectores no encuentran el símbolo. Es el fallo más
    // común al pintar un QR a mano y solo se nota con el teléfono en la mano.
    const svg = aSvg(m);
    expect(svg).toContain(`viewBox="0 0 ${m.length + 8} ${m.length + 8}"`);
  });

  it('respeta un margen distinto si se pide', () => {
    expect(aSvg(m, { margen: 2 })).toContain(
      `viewBox="0 0 ${m.length + 4} ${m.length + 4}"`,
    );
  });

  it('lleva fondo blanco explícito: sobre superficie oscura no se escanea', () => {
    expect(aSvg(m)).toContain('fill="#ffffff"');
  });

  it('una matriz vacía o nula da cadena vacía, no un SVG roto', () => {
    expect(aSvg(null)).toBe('');
    expect(aSvg([])).toBe('');
  });
});
