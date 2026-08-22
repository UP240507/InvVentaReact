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
  reservaDeFolio,
  foliosSinVenta,
  siguienteConsecutivo,
  prefijoDispositivo,
  letrasDelLocal,
  sinPersistencia,
  ANCHO_CONSECUTIVO,
  SERIE_VENTA,
  SERIE_COMANDA,
  LETRAS_LOCAL,
  LETRAS_DISPOSITIVO,
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

// ─────────────────────────────────────────────────────────────────────────────
// El prefijo provisional — salió en el primer ticket impreso de verdad
// (11-ago): decía `PTKL…` en un restaurante llamado AZUL RESTAURANTE, con el
// nombre puesto en la configuración desde hacía semanas.
// ─────────────────────────────────────────────────────────────────────────────

describe('prefijo acuñado sin nombre del local', () => {
  it('sin nombre, sortea las letras y lo marca como provisional', () => {
    const a = almacenFalso();
    const p = prefijoDispositivo({ nombreLocal: undefined, almacen: a });
    expect(p).toHaveLength(LETRAS_LOCAL + LETRAS_DISPOSITIVO);
    expect(a._datos['folio:prefijo-provisional']).toBe('1');
  });

  it('con nombre NO se marca provisional', () => {
    const a = almacenFalso();
    expect(
      prefijoDispositivo({ nombreLocal: 'AZUL RESTAURANTE', almacen: a }),
    ).toMatch(/^AZUL/);
    expect(a._datos['folio:prefijo-provisional']).toBe('0');
  });

  it('EL CASO REAL: se repara en cuanto aparece el nombre', () => {
    const a = almacenFalso();
    // Primera venta antes de que hidrate el store: `configuracion` es undefined.
    const provisional = prefijoDispositivo({ almacen: a });
    const sufijo = provisional.slice(-LETRAS_DISPOSITIVO);

    // Ya con la configuración cargada.
    const reparado = prefijoDispositivo({
      nombreLocal: 'AZUL RESTAURANTE',
      almacen: a,
    });

    expect(reparado).toBe(`AZUL${sufijo}`);
    // El sufijo de dispositivo se conserva: ahí vive la unicidad entre
    // terminales, y tocarlo sería reintroducir la colisión que el módulo evita.
    expect(reparado.slice(-LETRAS_DISPOSITIVO)).toBe(sufijo);
  });

  it('se repara UNA vez: después ya no se toca aunque cambie el nombre', () => {
    // Es la regla que separa reparar de renombrar. Un restaurante que se cambia
    // el nombre NO parte su serie de folios en dos.
    const a = almacenFalso();
    prefijoDispositivo({ almacen: a });
    const reparado = prefijoDispositivo({
      nombreLocal: 'AZUL RESTAURANTE',
      almacen: a,
    });
    const trasRenombrar = prefijoDispositivo({
      nombreLocal: 'OTRO NOMBRE',
      almacen: a,
    });
    expect(trasRenombrar).toBe(reparado);
  });

  it('un prefijo bueno nunca se toca al renombrar', () => {
    const a = almacenFalso();
    const original = prefijoDispositivo({
      nombreLocal: 'AZUL RESTAURANTE',
      almacen: a,
    });
    expect(
      prefijoDispositivo({ nombreLocal: 'BURGER PALACE', almacen: a }),
    ).toBe(original);
  });

  it('un dispositivo anterior a la marca se respeta', () => {
    // Sin la llave `provisional`, se lee como no provisional: no se toca lo que
    // ya está emitiendo folios. Lectura conservadora a propósito.
    const a = almacenFalso({ 'folio:prefijo-dispositivo': 'PTKL7K' });
    expect(
      prefijoDispositivo({ nombreLocal: 'AZUL RESTAURANTE', almacen: a }),
    ).toBe('PTKL7K');
  });

  it('reparar no altera el contador ya emitido', () => {
    // La serie se ve partida —PTKL7K-V-000001, luego AZUL7K-V-000002— pero el
    // consecutivo no retrocede ni salta: no hay folio reemitido.
    const a = almacenFalso();
    const uno = siguienteFolio({ almacen: a });
    const dos = siguienteFolio({ nombreLocal: 'AZUL RESTAURANTE', almacen: a });
    expect(uno).toMatch(/-V-000001$/);
    expect(dos).toMatch(/^AZUL/);
    expect(dos).toMatch(/-V-000002$/);
  });
});

// ─── La reserva ──────────────────────────────────────────────────────────────
// El folio se acuña al imprimir la cuenta, antes de que exista la venta. Hasta
// el 22-ago esa reserva vivía sólo en el aparato: si moría entre imprimir y
// cobrar, el cliente se quedaba con un papel citando un número que ninguna
// venta iba a llevar. Medido en AZUL el 17-ago.

describe('reservaDeFolio — el hecho que sobrevive al aparato', () => {
  const datos = {
    mesaId: 'm-4',
    mesaNombre: 'Mesa 4',
    dispositivo: 'iPhone de Ana',
    usuario: 'Ana',
    total: 940.5,
    fecha: '2026-08-22T20:05:00.000Z',
  };

  it('el folio ES el id', () => {
    // Ya es único por construcción, y así la clave de respaldo del hub queda
    // legible: `folios_reservados::AZUL7K-V-000004` se dicta por teléfono, un
    // uuid no.
    expect(reservaDeFolio('AZUL7K-V-000004', datos).id).toBe('AZUL7K-V-000004');
  });

  it('la serie sale del propio folio, no de un parámetro', () => {
    // Para que no puedan discrepar. Un parámetro aparte es una segunda fuente
    // de verdad esperando a desincronizarse.
    expect(reservaDeFolio('AZUL7K-V-000004').serie).toBe('V');
    expect(reservaDeFolio('AZUL7K-C-000012').serie).toBe('C');
  });

  it('un folio con forma rara cae a la serie de ventas', () => {
    expect(reservaDeFolio('SUELTO').serie).toBe(SERIE_VENTA);
  });

  it('lleva de quién y de qué mesa era', () => {
    const r = reservaDeFolio('AZUL7K-V-000004', datos);
    expect(r.mesa_id).toBe('m-4');
    expect(r.mesa_nombre).toBe('Mesa 4');
    expect(r.dispositivo).toBe('iPhone de Ana');
    expect(r.usuario).toBe('Ana');
    expect(r.total_impreso).toBe(940.5);
    expect(r.reservado_en).toBe('2026-08-22T20:05:00.000Z');
  });

  it('sin total, `null` y NO cero', () => {
    // Un cero afirma que la cuenta era de cero. Aquí no se sabe, y decir que
    // se sabe es peor que callar.
    expect(reservaDeFolio('AZUL7K-V-000004', {}).total_impreso).toBeNull();
    expect(
      reservaDeFolio('AZUL7K-V-000004', { total: 'x' }).total_impreso,
    ).toBeNull();
    // Pero un cero de verdad sí pasa.
    expect(reservaDeFolio('AZUL7K-V-000004', { total: 0 }).total_impreso).toBe(
      0,
    );
  });

  it('los campos vacíos entran como null, no como cadena vacía', () => {
    const r = reservaDeFolio('AZUL7K-V-000004', { mesaId: '   ', usuario: '' });
    expect(r.mesa_id).toBeNull();
    expect(r.usuario).toBeNull();
  });

  it('sin folio no hay reserva', () => {
    expect(reservaDeFolio('')).toBeNull();
    expect(reservaDeFolio(null)).toBeNull();
    expect(reservaDeFolio('   ')).toBeNull();
  });

  it('NO lleva estado ni consumido', () => {
    // Marcar una reserva como consumida sería un UPDATE, y un UPDATE es lo que
    // impide que el respaldo la reproduzca sin riesgo. Que se consumió se sabe
    // mirando si hay una venta con ese folio.
    const r = reservaDeFolio('AZUL7K-V-000004', datos);
    expect(r).not.toHaveProperty('estado');
    expect(r).not.toHaveProperty('consumido');
  });
});

describe('foliosSinVenta — los huecos, con nombre', () => {
  const reservas = [
    { id: 'AZUL7K-V-000004' },
    { id: 'AZUL7K-V-000005' },
    { id: 'AZULHN-V-000001' },
  ];

  it('deja fuera los que sí llegaron a venta', () => {
    const huecos = foliosSinVenta(reservas, [
      { folio: 'AZUL7K-V-000005' },
      { folio: 'AZULHN-V-000001' },
    ]);
    expect(huecos.map((h) => h.id)).toEqual(['AZUL7K-V-000004']);
  });

  it('un espacio de más no inventa un hueco', () => {
    // El folio pasa por la cola, por el NDJSON del hub y por Postgres. Basta un
    // espacio para que dos cadenas iguales dejen de serlo, y el síntoma sería
    // mandar a alguien a buscar un problema que no existe.
    expect(
      foliosSinVenta(
        [{ id: ' AZUL7K-V-000004 ' }],
        [{ folio: 'AZUL7K-V-000004' }],
      ),
    ).toEqual([]);
  });

  it('ventas sin folio no tapan ningún hueco', () => {
    // Una venta con folio vacío no consume nada. Si contara, un solo registro
    // corrupto haría desaparecer todos los huecos de golpe.
    expect(
      foliosSinVenta(
        [{ id: 'AZUL7K-V-000004' }],
        [{ folio: '' }, { folio: null }, {}],
      ),
    ).toHaveLength(1);
  });

  it('sin reservas no hay huecos, y aguanta basura', () => {
    expect(foliosSinVenta([], [{ folio: 'X' }])).toEqual([]);
    expect(foliosSinVenta(null, null)).toEqual([]);
    expect(foliosSinVenta(undefined, undefined)).toEqual([]);
  });
});
