// src/lib/Letras.test.js
//
// La cifra en letra existe para que el importe no se pueda alterar a mano. De
// ahí que una letra que NO coincide con el número sea peor que no ponerla:
// convierte el documento en discutible justo donde debía ser incuestionable.
//
// Por eso esta prueba no comprueba «que funcione» sino los casos concretos que
// el español tiene y que se escapan al escribir deprisa. Cada `it` de abajo
// corresponde a una regla que se rompe si alguien simplifica el módulo.
import { describe, it, expect } from 'vitest';
import { importeEnLetra, enteroEnLetra } from './Letras';
// El formateador REAL del ticket. La garantía que importa no es «redondea
// bien» en abstracto sino que la letra diga lo mismo que la cifra que se
// imprime tres renglones más arriba, en el mismo papel.
import { money } from './Comanda';

describe('los apócopes y las formas irregulares', () => {
  it('UN, no UNO', () => {
    expect(enteroEnLetra(1)).toBe('UN');
    expect(enteroEnLetra(21)).toBe('VEINTIUN');
    expect(enteroEnLetra(31)).toBe('TREINTA Y UN');
    expect(enteroEnLetra(101)).toBe('CIENTO UN');
  });

  it('CIEN a secas, CIENTO cuando le sigue algo', () => {
    expect(enteroEnLetra(100)).toBe('CIEN');
    expect(enteroEnLetra(101)).toBe('CIENTO UN');
    expect(enteroEnLetra(199)).toBe('CIENTO NOVENTA Y NUEVE');
  });

  it('las centenas irregulares, que son las que se escriben mal', () => {
    expect(enteroEnLetra(500)).toBe('QUINIENTOS'); // no CINCOCIENTOS
    expect(enteroEnLetra(700)).toBe('SETECIENTOS'); // no SIETECIENTOS
    expect(enteroEnLetra(900)).toBe('NOVECIENTOS'); // no NUEVECIENTOS
  });

  it('los veintitantos van juntos y sin Y', () => {
    expect(enteroEnLetra(20)).toBe('VEINTE');
    expect(enteroEnLetra(22)).toBe('VEINTIDOS');
    expect(enteroEnLetra(29)).toBe('VEINTINUEVE');
    // De 30 en adelante vuelve la Y.
    expect(enteroEnLetra(30)).toBe('TREINTA');
    expect(enteroEnLetra(32)).toBe('TREINTA Y DOS');
  });

  it('MIL no lleva UN delante; UN MILLÓN sí', () => {
    // No es una inconsistencia del código, es del idioma.
    expect(enteroEnLetra(1000)).toBe('MIL');
    expect(enteroEnLetra(2000)).toBe('DOS MIL');
    expect(enteroEnLetra(1_000_000)).toBe('UN MILLON');
    expect(enteroEnLetra(2_000_000)).toBe('DOS MILLONES');
  });

  it('los adolescentes en una sola palabra', () => {
    expect(enteroEnLetra(11)).toBe('ONCE');
    expect(enteroEnLetra(15)).toBe('QUINCE');
    expect(enteroEnLetra(16)).toBe('DIECISEIS');
    expect(enteroEnLetra(19)).toBe('DIECINUEVE');
  });

  it('cero es CERO y no cadena vacía', () => {
    expect(enteroEnLetra(0)).toBe('CERO');
  });
});

describe('el importe completo', () => {
  it('reproduce el ticket de referencia', () => {
    // El de Soft Restaurant que trajo Chris: total $567.00.
    expect(importeEnLetra(567)).toBe(
      'QUINIENTOS SESENTA Y SIETE PESOS 00/100 M.N.',
    );
  });

  it('el plural depende del ENTERO, no del total', () => {
    // $1.50 es «UN PESO 50/100», no «UN PESOS» ni «UNOS PESOS».
    expect(importeEnLetra(1)).toBe('UN PESO 00/100 M.N.');
    expect(importeEnLetra(1.5)).toBe('UN PESO 50/100 M.N.');
    expect(importeEnLetra(2)).toBe('DOS PESOS 00/100 M.N.');
    expect(importeEnLetra(0)).toBe('CERO PESOS 00/100 M.N.');
    expect(importeEnLetra(0.5)).toBe('CERO PESOS 50/100 M.N.');
  });

  it('los centavos van en cifra y siempre con dos dígitos', () => {
    expect(importeEnLetra(10.05)).toBe('DIEZ PESOS 05/100 M.N.');
    expect(importeEnLetra(10.5)).toBe('DIEZ PESOS 50/100 M.N.');
    expect(importeEnLetra(10.9)).toBe('DIEZ PESOS 90/100 M.N.');
  });

  it('usa el MISMO redondeo que la cifra impresa', () => {
    // El primer intento hacía `Math.round(monto * 100)` y discrepaba con el
    // papel: para 1.005 el ticket imprime «$1.01» y la letra decía «00/100».
    // En JS conviven tres redondeos —`Intl`, `toFixed` y el binario a mano— y
    // sólo uno de ellos es el que sale impreso.
    expect(importeEnLetra(0.1 + 0.2)).toBe('CERO PESOS 30/100 M.N.');
    expect(importeEnLetra(1.005)).toBe('UN PESO 01/100 M.N.');
    expect(importeEnLetra(1.015)).toBe('UN PESO 02/100 M.N.');
    expect(importeEnLetra(2.675)).toBe('DOS PESOS 68/100 M.N.');
  });

  it('el redondeo hacia arriba arrastra el entero', () => {
    // 9.999 son 1000 centavos: DIEZ PESOS 00/100, no NUEVE PESOS 100/100.
    expect(importeEnLetra(9.999)).toBe('DIEZ PESOS 00/100 M.N.');
  });

  it('aguanta importes que no se van a ver pero tampoco pueden mentir', () => {
    expect(importeEnLetra(1234.56)).toBe(
      'MIL DOSCIENTOS TREINTA Y CUATRO PESOS 56/100 M.N.',
    );
    expect(importeEnLetra(15000)).toBe('QUINCE MIL PESOS 00/100 M.N.');
    expect(importeEnLetra(100000)).toBe('CIEN MIL PESOS 00/100 M.N.');
    expect(importeEnLetra(999999.99)).toBe(
      'NOVECIENTOS NOVENTA Y NUEVE MIL NOVECIENTOS NOVENTA Y NUEVE PESOS 99/100 M.N.',
    );
  });

  it('no revienta con basura ni con negativos', () => {
    // Un total negativo no debería existir, pero si llega, el papel tiene que
    // salir igualmente: la impresora nunca bloquea un cobro.
    expect(importeEnLetra(null)).toBe('CERO PESOS 00/100 M.N.');
    expect(importeEnLetra(undefined)).toBe('CERO PESOS 00/100 M.N.');
    expect(importeEnLetra('abc')).toBe('CERO PESOS 00/100 M.N.');
    expect(importeEnLetra(NaN)).toBe('CERO PESOS 00/100 M.N.');
    expect(importeEnLetra(Infinity)).toBe('CERO PESOS 00/100 M.N.');
    expect(importeEnLetra(-5)).toBe('CINCO PESOS 00/100 M.N.');
  });

  it('se puede cambiar la moneda sin tocar el módulo', () => {
    expect(
      importeEnLetra(5, { singular: 'DOLAR', plural: 'DOLARES', sufijo: '' }),
    ).toBe('CINCO DOLARES 00/100');
  });
});

describe('barrido: la letra nunca contradice a la cifra', () => {
  /** Los centavos tal y como los IMPRIME el ticket: «$1,234.56» → «56». */
  const centavosImpresos = (monto) => money(monto).split('.')[1];

  it('mil importes al azar: los centavos de la letra son los del papel', () => {
    // Ésta es LA prueba del módulo. No compara contra una expectativa escrita a
    // mano —que es lo que ya me hizo escribir mal el caso de 1.005— sino contra
    // el mismo formateador que pinta la cifra en el ticket. Si los dos
    // redondeos divergen, el documento se contradice a sí mismo y aquí salta.
    for (let i = 0; i < 1000; i++) {
      const monto = Math.random() * 50_000;
      expect(importeEnLetra(monto)).toContain(`${centavosImpresos(monto)}/100`);
    }
  });

  it('y los casos con decimales incómodos, uno por uno', () => {
    const raros = [
      0.005,
      0.015,
      0.025,
      1.005,
      1.015,
      2.675,
      8.165,
      9.999,
      1.115,
      1234.565,
      0.1 + 0.2,
      1e-9,
      4999.995,
    ];
    for (const monto of raros) {
      expect(importeEnLetra(monto)).toContain(`${centavosImpresos(monto)}/100`);
    }
  });

  it('todos los enteros de 0 a 1000 producen una letra no vacía y sin dobles espacios', () => {
    // Un espacio doble delata una rama que devolvió cadena vacía donde debía
    // haber una palabra — el síntoma de un hueco en las tablas.
    for (let n = 0; n <= 1000; n++) {
      const letra = enteroEnLetra(n);
      expect(letra.length).toBeGreaterThan(0);
      expect(letra).not.toMatch(/\s{2}/);
      expect(letra.trim()).toBe(letra);
    }
  });
});
