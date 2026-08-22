import { describe, it, expect, beforeEach } from 'vitest';
import {
  firmaDeBloqueo,
  agregarBloqueo,
  bloqueosCsp,
  limpiarBloqueosCsp,
  vigilarCsp,
} from './AvisosCsp';

const violacion = (extra = {}) => ({
  violatedDirective: 'font-src',
  blockedURI: 'https://fonts.gstatic.com/s/syne/v1/abc.woff2',
  documentURI: 'tauri://localhost/pos',
  ...extra,
});

describe('firmaDeBloqueo — qué cuenta como «el mismo bloqueo»', () => {
  it('junta por directiva y ORIGEN, no por ruta', () => {
    // Ocho iconos del mismo dominio son un problema, no ocho. Sin esto, la
    // lista se llena de la misma causa repetida y la segunda causa —la que
    // explica lo que de verdad se rompió— se cae por el tope.
    expect(firmaDeBloqueo(violacion())).toBe(
      firmaDeBloqueo(
        violacion({ blockedURI: 'https://fonts.gstatic.com/otra.woff2' }),
      ),
    );
  });

  it('separa dos directivas distintas del mismo origen', () => {
    expect(firmaDeBloqueo(violacion())).not.toBe(
      firmaDeBloqueo(violacion({ violatedDirective: 'connect-src' })),
    );
  });

  it('no revienta con lo que NO es una URL', () => {
    // `blockedURI` llega como 'inline', 'eval' o cadena vacía según el caso, y
    // `new URL()` lanza con los tres. Un diagnóstico que revienta al recoger el
    // fallo se traga la pantalla que venía a salvar.
    expect(
      firmaDeBloqueo({ violatedDirective: 'style-src', blockedURI: 'inline' }),
    ).toBe('style-src::inline');
    expect(
      firmaDeBloqueo({ violatedDirective: 'script-src', blockedURI: '' }),
    ).toBe('script-src::inline');
    expect(firmaDeBloqueo({})).toBe('?::inline');
  });

  it('las data: se juntan todas, sin guardar el contenido', () => {
    // Una `data:` puede llevar dentro el logo del local entero. Ni cabe en el
    // diagnóstico ni tiene por qué estar ahí.
    const f = firmaDeBloqueo(
      violacion({ blockedURI: 'data:image/png;base64,iVBORw0KGgoAAAA' }),
    );
    expect(f).toBe('font-src::data:');
    expect(f).not.toContain('iVBOR');
  });
});

describe('agregarBloqueo — la lista', () => {
  it('el primero entra con sus datos y contador en 1', () => {
    const [b] = agregarBloqueo([], violacion(), '2026-08-21T10:00:00.000Z');
    expect(b.directiva).toBe('font-src');
    expect(b.documento).toBe('tauri://localhost/pos');
    expect(b.veces).toBe(1);
    expect(b.primera).toBe('2026-08-21T10:00:00.000Z');
  });

  it('el repetido sube el contador y no duplica la fila', () => {
    let l = agregarBloqueo([], violacion(), '2026-08-21T10:00:00.000Z');
    l = agregarBloqueo(l, violacion(), '2026-08-21T10:05:00.000Z');

    expect(l).toHaveLength(1);
    expect(l[0].veces).toBe(2);
    // La primera vez no se pisa: es la que dice cuándo empezó el problema.
    expect(l[0].primera).toBe('2026-08-21T10:00:00.000Z');
    expect(l[0].ultima).toBe('2026-08-21T10:05:00.000Z');
  });

  it('no muta la lista que recibe', () => {
    const antes = agregarBloqueo([], violacion());
    const copia = JSON.parse(JSON.stringify(antes));
    agregarBloqueo(antes, violacion({ violatedDirective: 'img-src' }));
    expect(antes).toEqual(copia);
  });

  it('con más de 20 firmas distintas, se queda con las últimas', () => {
    let l = [];
    for (let i = 0; i < 30; i++) {
      l = agregarBloqueo(l, violacion({ violatedDirective: `d-${i}` }));
    }
    expect(l).toHaveLength(20);
    expect(l[0].directiva).toBe('d-10');
    expect(l[19].directiva).toBe('d-29');
  });
});

describe('vigilarCsp — el enganche', () => {
  beforeEach(() => limpiarBloqueosCsp());

  const disparar = (extra = {}) => {
    const e = new Event('securitypolicyviolation');
    Object.assign(e, violacion(extra));
    document.dispatchEvent(e);
  };

  it('recoge el bloqueo y sobrevive a una recarga', () => {
    // Lo que de verdad se prueba aquí es que va a disco: el bloqueo típico
    // ocurre en el arranque, sin nadie mirando, y la app se recarga.
    const soltar = vigilarCsp();
    disparar();
    soltar();

    const l = bloqueosCsp();
    expect(l).toHaveLength(1);
    expect(l[0].directiva).toBe('font-src');
  });

  it('avisa SÓLO la primera vez de cada firma', () => {
    // Un CSP roto dispara el mismo bloqueo por cada icono de la pantalla. Una
    // lluvia de avisos tapa la aplicación justo cuando hay que usarla.
    const avisos = [];
    const soltar = vigilarCsp((b) => avisos.push(b));

    disparar();
    disparar();
    disparar();
    disparar({ violatedDirective: 'connect-src' });
    soltar();

    expect(avisos).toHaveLength(2);
    expect(avisos.map((a) => a.directiva)).toEqual(['font-src', 'connect-src']);
    // Pero la cuenta sí los recoge todos.
    expect(bloqueosCsp().find((b) => b.directiva === 'font-src').veces).toBe(3);
  });

  it('un aviso que revienta no tumba el arranque', () => {
    const soltar = vigilarCsp(() => {
      throw new Error('la pantalla no está montada todavía');
    });
    expect(() => disparar()).not.toThrow();
    soltar();
    expect(bloqueosCsp()).toHaveLength(1);
  });

  it('desenganchar deja de recoger', () => {
    const soltar = vigilarCsp();
    soltar();
    disparar();
    expect(bloqueosCsp()).toHaveLength(0);
  });
});
