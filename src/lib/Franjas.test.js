// Pruebas de la franja del día. Lo que se protege aquí, por orden de gravedad:
//
//   1. Que con las franjas APAGADAS no se clasifique nada. Es el estado de
//      todos los locales hoy, incluido AZUL, y el único fallo que se llevaría
//      por delante a gente que no pidió esta función.
//   2. Que la hora sea la LOCAL. El mismo error que motivó `lib/Fechas.js`:
//      leer UTC corre la frontera seis horas y clasifica mal media tarde.
//   3. Que un dato corrupto deje la fila SIN CLASIFICAR en vez de inventarse
//      una franja. Sin clasificar se ve; mal clasificado, no.
//   4. Que sumar por franja no dé más que el total del día.

import { describe, it, expect } from 'vitest';
import {
  franjaDe,
  franjaAlEscribir,
  etiquetaDeFranja,
  franjaDeFila,
  filtrarPorFranja,
  soloDeFranja,
  cuantasSinFranja,
  MATUTINO,
  VESPERTINO,
} from './Franjas';

// Construido con componentes LOCALES a propósito: así la prueba dice la misma
// verdad en la máquina de Chris, en el contenedor y en la caja del local.
const alas = (h, min = 0) => new Date(2026, 7, 23, h, min, 0);

describe('franjaDe', () => {
  it('antes del corte es matutino', () => {
    expect(franjaDe(alas(9, 30), '16:00')).toBe(MATUTINO);
  });

  it('después del corte es vespertino', () => {
    expect(franjaDe(alas(20, 5), '16:00')).toBe(VESPERTINO);
  });

  it('CLAVE: la hora del corte en punto ya es vespertino', () => {
    // El límite tiene que caer de un lado. «Desde las cuatro es la tarde» es
    // como lo diría cualquiera en el local, y así lo dice la migración.
    expect(franjaDe(alas(16, 0), '16:00')).toBe(VESPERTINO);
    expect(franjaDe(alas(15, 59), '16:00')).toBe(MATUTINO);
  });

  it('los extremos del día caen donde deben', () => {
    expect(franjaDe(alas(0, 0), '16:00')).toBe(MATUTINO);
    expect(franjaDe(alas(23, 59), '16:00')).toBe(VESPERTINO);
  });

  it('acepta la hora con segundos, que es como la devuelve Postgres', () => {
    // La columna es `time`; PostgREST la manda como '16:00:00'. Si esto
    // fallara, el corte configurado se ignoraría y todo iría al valor por
    // defecto sin que nada diera error.
    expect(franjaDe(alas(15, 0), '16:00:00')).toBe(MATUTINO);
    expect(franjaDe(alas(17, 0), '16:00:00')).toBe(VESPERTINO);
  });

  it('acepta una fecha en texto, no sólo un Date', () => {
    expect(franjaDe(alas(10, 0).toISOString(), '16:00')).toBe(MATUTINO);
  });

  it('respeta un corte distinto del de por defecto', () => {
    // Un desayunador no corta a las cuatro.
    expect(franjaDe(alas(12, 30), '13:00')).toBe(MATUTINO);
    expect(franjaDe(alas(13, 0), '13:00')).toBe(VESPERTINO);
  });

  it('con corte a medianoche el día entero es vespertino', () => {
    expect(franjaDe(alas(0, 0), '00:00')).toBe(VESPERTINO);
  });

  it('una fecha que no es fecha se queda sin clasificar', () => {
    expect(franjaDe('el martes', '16:00')).toBeNull();
    expect(franjaDe(null, '16:00')).toBeNull();
    expect(franjaDe(new Date('x'), '16:00')).toBeNull();
  });

  it('un corte corrupto NO se sustituye por el de por defecto', () => {
    // Asumir 16:00 clasificaría mal cada venta a partir de ahí, y eso no se
    // nota hasta que alguien compara dos reportes. Sin clasificar, se ve.
    for (const malo of ['', 'tarde', '25:00', '16:60', '16']) {
      expect(franjaDe(alas(17, 0), malo)).toBeNull();
    }
  });

  it('pero «sin corte» no es basura: usa el de por defecto', () => {
    // Un local que nunca tocó el ajuste no tiene un dato corrupto, tiene el
    // valor de fábrica — el mismo que el `default` de la columna.
    expect(franjaDe(alas(17, 0))).toBe(VESPERTINO);
    expect(franjaDe(alas(9, 0), null)).toBe(MATUTINO);
    expect(franjaDe(alas(9, 0), undefined)).toBe(MATUTINO);
  });
});

describe('franjaAlEscribir', () => {
  it('LA QUE PROTEGE A TODOS LOS LOCALES: apagado, no clasifica nada', () => {
    const conf = { franjas_activas: false, franja_corte: '16:00' };
    expect(franjaAlEscribir(conf, alas(9, 0))).toBeNull();
    expect(franjaAlEscribir(conf, alas(20, 0))).toBeNull();
  });

  it('sin configuración tampoco clasifica', () => {
    expect(franjaAlEscribir(null, alas(9, 0))).toBeNull();
    expect(franjaAlEscribir(undefined, alas(20, 0))).toBeNull();
    expect(franjaAlEscribir({}, alas(20, 0))).toBeNull();
  });

  it('encendido, estampa la franja que toca', () => {
    const conf = { franjas_activas: true, franja_corte: '16:00:00' };
    expect(franjaAlEscribir(conf, alas(9, 0))).toBe(MATUTINO);
    expect(franjaAlEscribir(conf, alas(16, 30))).toBe(VESPERTINO);
  });

  it('encendido y sin hora de corte, usa las 16:00', () => {
    const conf = { franjas_activas: true, franja_corte: null };
    expect(franjaAlEscribir(conf, alas(15, 59))).toBe(MATUTINO);
    expect(franjaAlEscribir(conf, alas(16, 0))).toBe(VESPERTINO);
  });
});

describe('etiquetaDeFranja', () => {
  it('en pantalla se dice «turno», que es como se habla en el local', () => {
    expect(etiquetaDeFranja(MATUTINO)).toBe('Turno matutino');
    expect(etiquetaDeFranja(VESPERTINO)).toBe('Turno vespertino');
  });

  it('lo sin clasificar tiene nombre propio, no un hueco', () => {
    expect(etiquetaDeFranja(null)).toBe('Sin clasificar');
    expect(etiquetaDeFranja('otra cosa')).toBe('Sin clasificar');
  });
});

describe('franjaDeFila', () => {
  it('normaliza lo que venga de la base', () => {
    expect(franjaDeFila({ franja: 'matutino' })).toBe(MATUTINO);
    expect(franjaDeFila({ franja: null })).toBeNull();
    expect(franjaDeFila({})).toBeNull();
    expect(franjaDeFila({ franja: 'nocturno' })).toBeNull();
  });
});

describe('los dos filtros, que son dos a propósito', () => {
  const filas = [
    { id: 1, franja: MATUTINO, total: 100 },
    { id: 2, franja: VESPERTINO, total: 200 },
    { id: 3, franja: null, total: 50 },
  ];
  const suma = (xs) => xs.reduce((t, x) => t + x.total, 0);

  it('en una LISTA, lo sin clasificar sale en las dos', () => {
    // Esconder es el fallo caro: una venta real invisible sólo se nota al
    // cuadrar el mes, si alguien lo cuadra.
    expect(filtrarPorFranja(filas, MATUTINO).map((f) => f.id)).toEqual([1, 3]);
    expect(filtrarPorFranja(filas, VESPERTINO).map((f) => f.id)).toEqual([2, 3]);
  });

  it('en una CIFRA, lo sin clasificar no cuenta en ninguna', () => {
    expect(soloDeFranja(filas, MATUTINO).map((f) => f.id)).toEqual([1]);
    expect(soloDeFranja(filas, VESPERTINO).map((f) => f.id)).toEqual([2]);
  });

  it('CLAVE: mañana + tarde nunca da más que el día', () => {
    const dia = suma(filas);
    expect(
      suma(soloDeFranja(filas, MATUTINO)) +
        suma(soloDeFranja(filas, VESPERTINO)),
    ).toBeLessThanOrEqual(dia);

    // El control negativo, que es lo que justifica que haya dos funciones:
    // con el filtro de lista, esa misma suma se pasa del total.
    expect(
      suma(filtrarPorFranja(filas, MATUTINO)) +
        suma(filtrarPorFranja(filas, VESPERTINO)),
    ).toBeGreaterThan(dia);
  });

  it('«todos» no filtra nada, y una entrada rara tampoco esconde', () => {
    expect(filtrarPorFranja(filas, 'todos')).toHaveLength(3);
    expect(filtrarPorFranja(filas, 'ninguna')).toHaveLength(3);
    expect(soloDeFranja(filas, 'todos')).toHaveLength(3);
  });

  it('tolera que no le pasen lista', () => {
    expect(filtrarPorFranja(undefined, MATUTINO)).toEqual([]);
    expect(soloDeFranja(null, MATUTINO)).toEqual([]);
  });
});

describe('cuantasSinFranja', () => {
  it('cuenta las que nadie ha clasificado', () => {
    expect(
      cuantasSinFranja([
        { franja: MATUTINO },
        { franja: null },
        {},
        { franja: 'x' },
      ]),
    ).toBe(3);
    expect(cuantasSinFranja([])).toBe(0);
  });
});
