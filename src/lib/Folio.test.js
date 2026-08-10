// src/lib/Folio.test.js
//
// Lo que un folio tiene que garantizar, y que el anterior —los últimos cinco
// dígitos de `Date.now()`— no garantizaba ninguna:
//
//   1. No colisiona, ni siquiera entre dispositivos cobrando a la vez.
//   2. Ordena. Y ordena COMO TEXTO, que es como lo va a ordenar la base de
//      datos, donde la columna es `text`.
//   3. No retrocede. Un hueco se ve y se explica; un duplicado no se ve.
import { describe, it, expect } from 'vitest';
import {
  siguienteFolio,
  siguienteConsecutivo,
  prefijoDispositivo,
  letrasDelLocal,
  sinPersistencia,
  ANCHO_CONSECUTIVO,
  SERIE_VENTA,
  SERIE_COMANDA,
} from './Folio';

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

/** Almacén que no guarda nada — webview sin storage, modo privado. */
const almacenMudo = () => ({
  leer: () => null,
  escribir: () => false,
});

describe('el consecutivo', () => {
  it('empieza en 1 y avanza de uno en uno', () => {
    const a = almacenFalso();
    expect(siguienteConsecutivo({ almacen: a })).toBe(1);
    expect(siguienteConsecutivo({ almacen: a })).toBe(2);
    expect(siguienteConsecutivo({ almacen: a })).toBe(3);
  });

  it('sobrevive a una recarga: el almacén es la memoria', () => {
    const a = almacenFalso();
    siguienteConsecutivo({ almacen: a });
    siguienteConsecutivo({ almacen: a });
    // Otra "sesión" contra el mismo almacén — como recargar la caja.
    expect(siguienteConsecutivo({ almacen: a })).toBe(3);
  });

  it('NO retrocede si lo guardado está corrupto', () => {
    // Un contador que retrocede reemite folios ya impresos. Prefiere saltar.
    for (const basura of ['', 'abc', '-5', '0', 'NaN', undefined]) {
      const a = almacenFalso({ 'folio:contador:V': basura });
      expect(siguienteConsecutivo({ almacen: a })).toBe(1);
    }
  });

  it('respeta un contador alto ya existente', () => {
    const a = almacenFalso({ 'folio:contador:V': '8588' });
    expect(siguienteConsecutivo({ almacen: a })).toBe(8589);
  });
});

describe('el prefijo: letras del local + dos del dispositivo', () => {
  it('nace del nombre del restaurante, para que se reconozca', () => {
    // «PTKL-V-000004» no le dice nada a nadie; «AZUL7K-V-000004» se reconoce, y
    // en un papel que revisa un auditor eso cuenta.
    const p = prefijoDispositivo({
      nombreLocal: 'AZUL RESTAURANTE',
      almacen: almacenFalso(),
    });
    expect(p.startsWith('AZUL')).toBe(true);
    expect(p).toHaveLength(6);
  });

  it('DOS DISPOSITIVOS DEL MISMO LOCAL NO COMPARTEN SERIE', () => {
    // La prueba que justifica todo el diseño. Si el prefijo naciera SÓLO del
    // nombre del restaurante —que es lo único que todos los dispositivos
    // comparten— los tres empezarían en AZUL-V-000001 y colisionarían desde el
    // primer turno. No sería un riesgo: sería una certeza.
    const nombreLocal = 'AZUL RESTAURANTE';
    const caja = almacenFalso();
    const tablet = almacenFalso();
    const telefono = almacenFalso();

    const emitidos = [];
    for (let i = 0; i < 200; i++) {
      for (const almacen of [caja, tablet, telefono]) {
        emitidos.push(siguienteFolio({ nombreLocal, almacen }));
      }
    }

    expect(new Set(emitidos).size).toBe(emitidos.length);
  });

  it('y los tres se reconocen como del mismo local', () => {
    const nombreLocal = 'AZUL RESTAURANTE';
    const prefijos = [almacenFalso(), almacenFalso(), almacenFalso()].map((a) =>
      prefijoDispositivo({ nombreLocal, almacen: a }),
    );
    expect(prefijos.every((p) => p.startsWith('AZUL'))).toBe(true);
  });

  it('se fija la primera vez: renombrar el local NO parte la serie', () => {
    // El prefijo identifica una SERIE, no un nombre. El nombre puede cambiar;
    // la serie no, o los folios de antes y después dejan de ser comparables.
    const a = almacenFalso();
    const primero = prefijoDispositivo({ nombreLocal: 'AZUL', almacen: a });
    const segundo = prefijoDispositivo({
      nombreLocal: 'OTRO NOMBRE TOTALMENTE DISTINTO',
      almacen: a,
    });
    expect(segundo).toBe(primero);
  });

  it('las letras salen del nombre, normalizadas', () => {
    expect(letrasDelLocal('AZUL RESTAURANTE')).toBe('AZUL');
    expect(letrasDelLocal('Añejo · Barra 2')).toBe('ANEJ');
    expect(letrasDelLocal('  ')).toBeNull();
    expect(letrasDelLocal(null)).toBeNull();
  });

  it('sin nombre configurado sigue sin colisionar, aunque se lea peor', () => {
    // Un prefijo ilegible es peor que uno legible, pero mucho mejor que uno que
    // colisiona. Lo primero se arregla capturando el nombre; lo segundo, no.
    const a = almacenFalso();
    const b = almacenFalso();
    expect(prefijoDispositivo({ almacen: a })).toHaveLength(6);
    expect(prefijoDispositivo({ almacen: a })).not.toBe(
      prefijoDispositivo({ almacen: b }),
    );
  });

  it('sin caracteres que se confundan al dictarlo por teléfono', () => {
    // «el folio A7F2 guion...». O/0 y I/1 fuera.
    for (let i = 0; i < 50; i++) {
      expect(prefijoDispositivo({ almacen: almacenFalso() })).not.toMatch(
        /[O0I1]/,
      );
    }
  });
});

describe('el folio completo', () => {
  it('rellena a ancho fijo para que ordene COMO TEXTO', () => {
    // La columna es `text`. Sin relleno, «CAJA-10» iría antes que «CAJA-9».
    const a = almacenFalso({ 'folio:prefijo-dispositivo': 'CAJA' });
    const folios = Array.from({ length: 12 }, () =>
      siguienteFolio({ almacen: a }),
    );
    expect(folios[0]).toBe(`CAJA-V-${'1'.padStart(ANCHO_CONSECUTIVO, '0')}`);
    expect([...folios].sort()).toEqual(folios);
  });

  it('dos dispositivos cobrando a la vez NO colisionan', () => {
    // El fallo que se venía a arreglar. Con el esquema anterior, dos ventas
    // separadas por un múltiplo de 100 s compartían folio.
    const caja = almacenFalso({ 'folio:prefijo-dispositivo': 'CAJA' });
    const tablet = almacenFalso({ 'folio:prefijo-dispositivo': 'TAB1' });

    const emitidos = [];
    for (let i = 0; i < 300; i++) {
      emitidos.push(siguienteFolio({ almacen: caja }));
      emitidos.push(siguienteFolio({ almacen: tablet }));
    }

    expect(new Set(emitidos).size).toBe(emitidos.length);
  });

  it('600 folios seguidos en un mismo dispositivo, todos distintos', () => {
    // Un servicio cargado. Con el esquema anterior, 200 daban ~18 % de
    // probabilidad de duplicado.
    const a = almacenFalso();
    const emitidos = Array.from({ length: 600 }, () =>
      siguienteFolio({ almacen: a }),
    );
    expect(new Set(emitidos).size).toBe(600);
  });

  it('se puede leer en voz alta: prefijo, serie, número', () => {
    const a = almacenFalso({ 'folio:prefijo-dispositivo': 'CAJA' });
    expect(siguienteFolio({ almacen: a })).toMatch(
      /^[A-Z0-9]{1,6}-[VC]-\d{6}$/,
    );
  });

  it('ventas y comandas llevan series separadas', () => {
    // Con un contador compartido, la serie de ventas saldría llena de huecos
    // —los que gastan las comandas— y un hueco en una serie de ventas es
    // exactamente la señal que un auditor busca.
    const a = almacenFalso({ 'folio:prefijo-dispositivo': 'CAJA' });
    expect(siguienteFolio({ serie: SERIE_VENTA, almacen: a })).toBe(
      'CAJA-V-000001',
    );
    expect(siguienteFolio({ serie: SERIE_COMANDA, almacen: a })).toBe(
      'CAJA-C-000001',
    );
    expect(siguienteFolio({ serie: SERIE_VENTA, almacen: a })).toBe(
      'CAJA-V-000002',
    );
  });
});

describe('el caso en que este esquema SÍ falla', () => {
  it('lo detecta y no finge que funciona', () => {
    // Sin almacén el contador arranca en 1 en cada recarga, o sea que reemite.
    // No se inventa un respaldo en memoria: duraría lo que la pestaña y daría
    // una falsa sensación de que el problema no existe. Se avisa y ya.
    const mudo = almacenMudo();
    expect(sinPersistencia({ almacen: mudo })).toBe(true);
    expect(sinPersistencia({ almacen: almacenFalso() })).toBe(false);
  });

  it('y efectivamente reemite, que es la razón de avisar', () => {
    const mudo = almacenMudo();
    expect(siguienteConsecutivo({ almacen: mudo })).toBe(1);
    expect(siguienteConsecutivo({ almacen: mudo })).toBe(1);
  });
});
