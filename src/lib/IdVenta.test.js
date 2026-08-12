// src/lib/IdVenta.test.js
//
// Lo que la clave primaria de una venta tiene que garantizar, y que
// `Date.now()` no garantizaba:
//
//   1. No colisiona entre dispositivos, ni cobrando en el MISMO milisegundo.
//      Es el caso que rompe el respaldo del hub: deduplica por `id`, así que
//      una colisión no da error — descarta un cobro en silencio.
//   2. Ordena por tiempo, porque los reportes e índices se apoyan en eso.
//   3. No retrocede aunque el reloj sí lo haga (NTP, horario de verano, una
//      caja que arranca con la hora mal y la corrige).
//   4. Cabe en el entero seguro de JavaScript. Pasado 2^53 el redondeo empieza
//      ANTES de enviar, y es invisible hasta que dos ventas redondean igual.
import { describe, it, expect } from 'vitest';
import {
  siguienteIdVenta,
  siguienteIdComanda,
  siguienteIdUnico,
  carrilDispositivo,
  CARRILES,
} from './IdVenta';
import { ALFABETO, SERIE_VENTA, SERIE_COMANDA } from './Folio';

/** Un almacén de mentira por dispositivo: dos instancias = dos dispositivos. */
const almacenFalso = (inicial = {}) => {
  const datos = { ...inicial };
  return {
    leer: (k) => (k in datos ? datos[k] : null),
    escribir: (k, v) => {
      datos[k] = String(v);
      return true;
    },
    _datos: datos,
  };
};

/** Reloj congelado: todas las ventas caen en el mismo milisegundo. */
const relojFijo = (t) => () => t;

describe('carrilDispositivo', () => {
  it('es estable entre llamadas del mismo dispositivo', () => {
    const a = almacenFalso();
    expect(carrilDispositivo({ almacen: a })).toBe(
      carrilDispositivo({ almacen: a }),
    );
  });

  it('cae dentro del rango de carriles', () => {
    for (let i = 0; i < 200; i++) {
      const c = carrilDispositivo({ almacen: almacenFalso() });
      expect(Number.isInteger(c)).toBe(true);
      expect(c).toBeGreaterThanOrEqual(0);
      expect(c).toBeLessThan(CARRILES);
    }
  });

  it('se deriva del prefijo de folio y no de una llave propia', () => {
    // La razón de ser del diseño: una sola verdad sobre quién es esta terminal.
    // Si el carril guardara su propio identificador, este almacén tendría dos
    // llaves de identidad y podrían desincronizarse al limpiar a medias.
    const a = almacenFalso();
    carrilDispositivo({ almacen: a });
    // Lo que se afirma es la INTENCIÓN: `IdVenta` no crea ninguna llave de
    // identidad propia. Todo lo escrito pertenece a `Folio` —el prefijo y su
    // marca de provisional—, que es quien decide quién es este dispositivo.
    //
    // Antes esto comparaba contra la lista literal de llaves y se rompió el
    // 11-ago al añadir `folio:prefijo-provisional`, que es un cambio correcto
    // de otro módulo. Una prueba que falla porque el vecino creció bien está
    // afirmando de más.
    const llaves = Object.keys(a._datos);
    expect(llaves.length).toBeGreaterThan(0);
    expect(llaves.every((k) => k.startsWith('folio:'))).toBe(true);
    expect(llaves.some((k) => k.startsWith('idunico:'))).toBe(false);
  });

  it('dos dispositivos con el MISMO sufijo comparten carril (limitación asumida)', () => {
    // Documenta la contrapartida en vez de fingir que no existe: el carril
    // hereda la unicidad del sufijo de folio, no añade una segunda lotería.
    // Y es una colisión que se ve — los folios también coinciden — así que
    // aparece al cuadrar el turno, no meses después.
    const prefijo = { 'folio:prefijo-dispositivo': 'AZUL7K' };
    expect(carrilDispositivo({ almacen: almacenFalso(prefijo) })).toBe(
      carrilDispositivo({ almacen: almacenFalso(prefijo) }),
    );
  });

  it('es BIYECTIVO: los 1024 sufijos posibles dan 1024 carriles distintos', () => {
    // Esta es la prueba que tumbó la primera versión (hash FNV-1a a 1000
    // carriles): comprimía 1024 sufijos en 1000, así que dos dispositivos con
    // folios DISTINTOS podían emitir el mismo `id` — una colisión invisible,
    // que es justo la clase de fallo que este módulo existe para evitar.
    const carriles = new Set();
    for (const a of ALFABETO) {
      for (const b of ALFABETO) {
        carriles.add(
          carrilDispositivo({
            almacen: almacenFalso({
              'folio:prefijo-dispositivo': `AZUL${a}${b}`,
            }),
          }),
        );
      }
    }
    expect(carriles.size).toBe(CARRILES);
    expect(CARRILES).toBe(ALFABETO.length ** 2);
  });
});

describe('siguienteIdVenta', () => {
  it('dos dispositivos cobrando en el MISMO milisegundo no colisionan', () => {
    // El caso que hace de esto un prerrequisito de 3.4/3.5.
    const caja = almacenFalso({ 'folio:prefijo-dispositivo': 'AZULAA' });
    const tablet = almacenFalso({ 'folio:prefijo-dispositivo': 'AZULBB' });
    const ahora = relojFijo(1786412345678);

    const idCaja = siguienteIdVenta({ almacen: caja, ahora });
    const idTablet = siguienteIdVenta({ almacen: tablet, ahora });

    expect(idCaja).not.toBe(idTablet);
  });

  it('cien cobros simultáneos repartidos en veinte terminales dan cien claves', () => {
    // Terminales con sufijo EXPLÍCITO y distinto, que es la hipótesis real: si
    // dos comparten sufijo, comparten folio, y eso ya lo cubre `Folio.js`.
    // Sortearlos aquí probaría el cumpleaños del sufijo, no este módulo — y de
    // hecho hacía la prueba intermitente.
    const ahora = relojFijo(1786412345678);
    const ids = new Set();
    for (let d = 0; d < 20; d++) {
      const sufijo = `${ALFABETO[0]}${ALFABETO[d]}`;
      const almacen = almacenFalso({
        'folio:prefijo-dispositivo': `AZUL${sufijo}`,
      });
      for (let v = 0; v < 5; v++) {
        ids.add(siguienteIdVenta({ almacen, ahora }));
      }
    }
    expect(ids.size).toBe(100);
  });

  it('crece con el tiempo, para que ordenar por id sea ordenar por venta', () => {
    const a = almacenFalso();
    const t1 = siguienteIdVenta({
      almacen: a,
      ahora: relojFijo(1786412345678),
    });
    const t2 = siguienteIdVenta({
      almacen: a,
      ahora: relojFijo(1786412349999),
    });
    expect(t2).toBeGreaterThan(t1);
  });

  it('no retrocede si el reloj retrocede', () => {
    const a = almacenFalso();
    const tarde = siguienteIdVenta({
      almacen: a,
      ahora: relojFijo(1786412349999),
    });
    // El equipo sincroniza con NTP y el reloj salta cuatro segundos atrás.
    const temprano = siguienteIdVenta({
      almacen: a,
      ahora: relojFijo(1786412345678),
    });
    expect(temprano).toBeGreaterThan(tarde);
  });

  it('no repite dentro del mismo milisegundo en el mismo dispositivo', () => {
    const a = almacenFalso();
    const ahora = relojFijo(1786412345678);
    const ids = new Set(
      Array.from({ length: 10 }, () => siguienteIdVenta({ almacen: a, ahora })),
    );
    expect(ids.size).toBe(10);
  });

  it('al saltar por el candado se queda en SU carril, no invade el del vecino', () => {
    // `ultimo + 1` habría sido lo obvio y habría reintroducido por detrás
    // exactamente la colisión entre terminales que el módulo evita.
    const a = almacenFalso();
    const ahora = relojFijo(1786412345678);
    const carril = carrilDispositivo({ almacen: a });
    for (let i = 0; i < 5; i++) {
      expect(siguienteIdVenta({ almacen: a, ahora }) % CARRILES).toBe(carril);
    }
  });

  it('cabe en el entero seguro de JavaScript', () => {
    const id = siguienteIdVenta({
      almacen: almacenFalso(),
      ahora: relojFijo(Date.now()),
    });
    expect(Number.isSafeInteger(id)).toBe(true);
  });

  it('falla ruidosamente si el reloj está disparado más allá del entero seguro', () => {
    // Emitir una clave que JavaScript ya está redondeando es peor que caerse.
    expect(() =>
      siguienteIdVenta({
        almacen: almacenFalso(),
        ahora: relojFijo(Number.MAX_SAFE_INTEGER),
      }),
    ).toThrow(RangeError);
  });

  it('recuerda el último emitido entre recargas del mismo dispositivo', () => {
    const datos = {};
    const persistente = () => ({
      leer: (k) => (k in datos ? datos[k] : null),
      escribir: (k, v) => {
        datos[k] = String(v);
        return true;
      },
    });
    const ahora = relojFijo(1786412345678);
    const antes = siguienteIdVenta({ almacen: persistente(), ahora });
    const despues = siguienteIdVenta({ almacen: persistente(), ahora });
    expect(despues).toBeGreaterThan(antes);
  });
});

describe('siguienteIdComanda', () => {
  it('dos meseros mandando a la MISMA estación en el mismo ms no colisionan', () => {
    // El fallo vivo: `cola.rs` descarta un `id` de documento ya impreso, y
    // `Comanda.js` lo compone como `comanda::${comanda.id}::${zona}`. Con
    // `CMD-${Date.now()}` la segunda comanda se descartaba como si fuera un
    // reenvío de la primera — y cocina nunca se enteraba del pedido.
    const telefonoA = almacenFalso({ 'folio:prefijo-dispositivo': 'AZULAA' });
    const telefonoB = almacenFalso({ 'folio:prefijo-dispositivo': 'AZULBB' });
    const ahora = relojFijo(1786412345678);

    const docA = `comanda::${siguienteIdComanda({ almacen: telefonoA, ahora })}::cocina`;
    const docB = `comanda::${siguienteIdComanda({ almacen: telefonoB, ahora })}::cocina`;

    expect(docA).not.toBe(docB);
  });

  it('conserva el prefijo CMD- que esperan el KDS y lo ya guardado', () => {
    const id = siguienteIdComanda({ almacen: almacenFalso() });
    expect(id).toMatch(/^CMD-\d+$/);
  });
});

describe('las series no se empujan entre sí', () => {
  it('emitir comandas no hace saltar el contador de ventas', () => {
    // Con una sola llave compartida los `id` avanzarían por motivos ajenos a
    // su propia serie, y eso hace ilegible cualquier diagnóstico que se apoye
    // en ellos. Mismo criterio que `llaveContador` en `Folio.js`.
    const a = almacenFalso();
    const ahora = relojFijo(1786412345678);

    const ventaAntes = siguienteIdVenta({ almacen: a, ahora });
    for (let i = 0; i < 5; i++) siguienteIdComanda({ almacen: a, ahora });
    const ventaDespues = siguienteIdVenta({ almacen: a, ahora });

    // Un solo paso de carril: las cinco comandas no lo movieron.
    expect(ventaDespues - ventaAntes).toBe(CARRILES);
  });

  it('cada serie guarda su propio candado', () => {
    const a = almacenFalso();
    siguienteIdUnico({ serie: SERIE_VENTA, almacen: a });
    siguienteIdUnico({ serie: SERIE_COMANDA, almacen: a });
    // Un candado por serie, y ninguno compartido. No se compara la lista entera
    // de llaves para no romperse cuando `Folio` añada las suyas.
    const candados = Object.keys(a._datos).filter((k) =>
      k.startsWith('idunico:'),
    );
    expect(candados.sort()).toEqual([
      `idunico:ultimo:${SERIE_COMANDA}`,
      `idunico:ultimo:${SERIE_VENTA}`,
    ]);
  });
});
