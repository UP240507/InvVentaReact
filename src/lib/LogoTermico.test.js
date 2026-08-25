// Pruebas del logo térmico. Lo que se protege, por orden de gravedad:
//
//   1. Que el bitmap tenga EXACTAMENTE los bytes que su tamaño declara. Uno de
//      menos y la impresora se queda esperando el resto — muda, sin error, con
//      el local abierto. El hub lo comprueba también; esto evita llegar a
//      guardar en la base un logo que nunca podría imprimirse.
//   2. Que lo transparente salga blanco. Un PNG con fondo transparente tiene
//      RGB (0,0,0) donde no se ve: sin mirar el alfa, el logo sale como un
//      rectángulo negro que gasta media tira y tapa la marca.
//   3. Que el orden de los bits sea el que pide `GS v 0` —el más significativo
//      a la izquierda—. Al revés, el logo sale espejado por bloques de ocho.

import { describe, it, expect } from 'vitest';
import {
  anchoDePapel,
  anchoValido,
  bytesEsperados,
  aMonocromo,
  empaquetar,
  aBase64,
  logoValido,
  medidaDestino,
  logoDeConfiguracion,
  ALTO_MAXIMO,
} from './LogoTermico';

/** Un píxel RGBA. */
const px = (r, g, b, a = 255) => [r, g, b, a];
const negro = px(0, 0, 0);
const blanco = px(255, 255, 255);
const transparente = px(0, 0, 0, 0);

/** Aplana una lista de píxeles a la forma que devuelve `getImageData`. */
const rgba = (pixeles) => Uint8ClampedArray.from(pixeles.flat());

describe('el ancho del papel', () => {
  it('32 columnas son 384 puntos y 48 son 576', () => {
    expect(anchoDePapel(32)).toBe(384);
    expect(anchoDePapel(48)).toBe(576);
  });

  it('el ancho utilizable siempre es múltiplo de 8, redondeando hacia abajo', () => {
    // Hacia abajo a propósito: un logo un punto más ancho que el papel no se
    // imprime «casi bien», se rechaza entero.
    expect(anchoValido(384)).toBe(384);
    expect(anchoValido(383)).toBe(376);
    expect(anchoValido(7)).toBe(0);
    expect(anchoValido(-10)).toBe(0);
  });
});

describe('bytesEsperados', () => {
  it('es (ancho/8) por alto', () => {
    expect(bytesEsperados(64, 4)).toBe(32);
    expect(bytesEsperados(384, 100)).toBe(4800);
  });

  it('un ancho que no es múltiplo de 8 no tiene tamaño válido', () => {
    expect(bytesEsperados(60, 4)).toBe(0);
    expect(bytesEsperados(0, 4)).toBe(0);
  });
});

describe('aMonocromo', () => {
  it('lo oscuro es punto y lo claro no', () => {
    expect(Array.from(aMonocromo(rgba([negro, blanco])))).toEqual([1, 0]);
  });

  it('CLAVE: lo transparente es blanco, aunque su RGB sea negro', () => {
    // El caso real: un PNG de logo con fondo transparente. Sin esta regla, el
    // ticket sale con un rectángulo negro donde debería estar la marca.
    expect(Array.from(aMonocromo(rgba([transparente])))).toEqual([0]);
    expect(Array.from(aMonocromo(rgba([px(0, 0, 0, 100)])))).toEqual([0]);
    expect(Array.from(aMonocromo(rgba([px(0, 0, 0, 200)])))).toEqual([1]);
  });

  it('usa luminancia perceptual, no el promedio de los canales', () => {
    // Un rojo de marca (200,0,0): el promedio daría 67 —negro— pero se ve
    // claro. Con Rec. 601 da 60, que también es negro; el caso que separa las
    // dos fórmulas es el verde, que el ojo ve mucho más claro de lo que un
    // promedio sugiere.
    const verde = px(0, 200, 0); // promedio 67 → negro; Rec.601 → 117
    expect(Array.from(aMonocromo(rgba([verde]), { umbral: 100 }))).toEqual([0]);
    expect(Array.from(aMonocromo(rgba([verde]), { umbral: 160 }))).toEqual([1]);
  });

  it('el umbral se puede mover', () => {
    const gris = px(150, 150, 150);
    expect(Array.from(aMonocromo(rgba([gris]), { umbral: 100 }))).toEqual([0]);
    expect(Array.from(aMonocromo(rgba([gris]), { umbral: 200 }))).toEqual([1]);
  });
});

describe('empaquetar', () => {
  it('CLAVE: el primer punto de la fila es el bit más significativo', () => {
    // Es lo que pide `GS v 0`. Al revés, cada bloque de ocho puntos sale
    // espejado y el logo parece «tejido».
    const fila = [1, 0, 0, 0, 0, 0, 0, 0];
    expect(Array.from(empaquetar(Uint8Array.from(fila), 8, 1))).toEqual([0x80]);

    const ultimo = [0, 0, 0, 0, 0, 0, 0, 1];
    expect(Array.from(empaquetar(Uint8Array.from(ultimo), 8, 1))).toEqual([
      0x01,
    ]);
  });

  it('empaqueta fila por fila', () => {
    const puntos = Uint8Array.from([
      1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1,
    ]);
    expect(Array.from(empaquetar(puntos, 8, 2))).toEqual([0xf0, 0x0f]);
  });

  it('devuelve el número exacto de bytes que declara el tamaño', () => {
    const puntos = new Uint8Array(64 * 4);
    expect(empaquetar(puntos, 64, 4).length).toBe(bytesEsperados(64, 4));
  });

  it('un ancho que no es múltiplo de 8 se rechaza, no se rellena', () => {
    // Rellenar en silencio daría un bitmap que el hub aceptaría y que saldría
    // escalonado en el papel — y eso ya no se diagnostica desde la caja.
    expect(empaquetar(new Uint8Array(60), 60, 1)).toBeNull();
  });

  it('si faltan puntos no se inventa el resto', () => {
    expect(empaquetar(new Uint8Array(8), 8, 4)).toBeNull();
  });
});

describe('aBase64', () => {
  it('coincide con la decodificación estándar', () => {
    const bytes = Uint8Array.from([0, 1, 2, 250, 255]);
    const vuelta = Uint8Array.from(atob(aBase64(bytes)), (c) =>
      c.charCodeAt(0),
    );
    expect(Array.from(vuelta)).toEqual(Array.from(bytes));
  });
});

describe('logoValido — la misma regla que aplica el hub', () => {
  const bueno = () => ({
    bitmap: aBase64(new Uint8Array(bytesEsperados(64, 4))),
    ancho: 64,
    alto: 4,
  });

  it('acepta uno que cuadra', () => {
    expect(logoValido(bueno(), 32)).toBe(true);
  });

  it('EL QUE IMPORTA: rechaza si sobran o faltan bytes', () => {
    const corto = {
      ...bueno(),
      bitmap: aBase64(new Uint8Array(bytesEsperados(64, 4) - 1)),
    };
    const largo = {
      ...bueno(),
      bitmap: aBase64(new Uint8Array(bytesEsperados(64, 4) + 1)),
    };
    expect(logoValido(corto, 32)).toBe(false);
    expect(logoValido(largo, 32)).toBe(false);
  });

  it('rechaza un ancho que no es múltiplo de 8', () => {
    expect(logoValido({ ...bueno(), ancho: 60 }, 32)).toBe(false);
  });

  it('rechaza lo que no cabe en el papel, y lo acepta en uno más ancho', () => {
    const ancho = {
      bitmap: aBase64(new Uint8Array(bytesEsperados(512, 4))),
      ancho: 512,
      alto: 4,
    };
    expect(logoValido(ancho, 32)).toBe(false); // 384 puntos
    expect(logoValido(ancho, 48)).toBe(true); // 576 puntos
  });

  it('rechaza un logo altísimo: son centímetros de papel por ticket', () => {
    const alto = ALTO_MAXIMO + 8;
    expect(
      logoValido(
        {
          bitmap: aBase64(new Uint8Array(bytesEsperados(64, alto))),
          ancho: 64,
          alto,
        },
        32,
      ),
    ).toBe(false);
  });

  it('rechaza lo vacío y lo que no es un logo', () => {
    expect(logoValido(null)).toBe(false);
    expect(logoValido({})).toBe(false);
    expect(logoValido({ bitmap: '   ', ancho: 64, alto: 4 })).toBe(false);
    expect(logoValido({ bitmap: 'AAA', ancho: 0, alto: 0 })).toBe(false);
  });
});

describe('medidaDestino', () => {
  it('reduce al ancho del papel conservando la proporción', () => {
    // 800x400 en papel de 384 puntos → 384x192.
    expect(medidaDestino(800, 400, 32)).toEqual({ ancho: 384, alto: 192 });
  });

  it('NO agranda un logo pequeño', () => {
    // Estirar 40 puntos hasta 384 da una mancha con bordes de escalera. Si es
    // pequeño, se imprime pequeño.
    expect(medidaDestino(40, 20, 32)).toEqual({ ancho: 40, alto: 20 });
  });

  it('el ancho que devuelve siempre es múltiplo de 8', () => {
    for (const w of [37, 100, 383, 799]) {
      expect(medidaDestino(w, 50, 32).ancho % 8).toBe(0);
    }
  });

  it('recorta el alto al máximo en vez de devolver algo inimprimible', () => {
    const { alto } = medidaDestino(64, 5000, 32);
    expect(alto).toBe(ALTO_MAXIMO);
  });

  it('una imagen sin tamaño no da medida', () => {
    expect(medidaDestino(0, 0, 32)).toEqual({ ancho: 0, alto: 0 });
  });
});

describe('logoDeConfiguracion', () => {
  it('devuelve el logo cuando la configuración lo tiene bien', () => {
    const conf = {
      logo_bitmap: aBase64(new Uint8Array(bytesEsperados(64, 4))),
      logo_ancho: 64,
      logo_alto: 4,
    };
    expect(logoDeConfiguracion(conf, 32)).toEqual({
      bitmap: conf.logo_bitmap,
      ancho: 64,
      alto: 4,
    });
  });

  it('sin logo configurado devuelve null, no un objeto vacío', () => {
    // El documento no debe llevar un `logo` que el hub tenga que descartar:
    // que no haya logo se dice no mandándolo.
    expect(logoDeConfiguracion({}, 32)).toBeNull();
    expect(logoDeConfiguracion(null, 32)).toBeNull();
  });

  it('una configuración a medias no se manda a la impresora', () => {
    // El caso real: alguien guardó el bitmap pero las medidas se perdieron.
    expect(
      logoDeConfiguracion(
        { logo_bitmap: aBase64(new Uint8Array(32)), logo_ancho: 0 },
        32,
      ),
    ).toBeNull();
  });
});
