import { describe, it, expect } from 'vitest';
import {
  asistenciasDelDia,
  entradaActiva,
  horasDesde,
  ultimoRegistro,
  plantillaActiva,
  HORAS_PARA_OLVIDO,
  cierreSugerido,
} from './Asistencias';
import { aISOLocal } from './Fechas';

// Construye un registro a una hora LOCAL concreta, guardado en UTC — que es
// exactamente lo que hace la pantalla con `new Date().toISOString()`.
const registro = (empleadoId, tipo, y, m, d, hh, mm = 0) => ({
  empleado_id: empleadoId,
  tipo,
  fecha_hora: new Date(y, m - 1, d, hh, mm, 0).toISOString(),
});

describe('el turno de noche — el bug que rompía el checador', () => {
  // Estas pruebas solo son significativas en un huso al oeste de Greenwich,
  // donde la noche local ya es el día siguiente en UTC. En México (UTC−6) las
  // 20:00 del día 5 son las 02:00 UTC del día 6.
  const hoy = aISOLocal(new Date(2026, 7, 5)); // 5-ago-2026 local

  it('encuentra la entrada de las 20:00 el MISMO día local', () => {
    // Era el fallo: `fecha_hora.startsWith('2026-08-05')` daba falso porque el
    // ISO empezaba por '2026-08-06'. El trabajador no podía marcar su salida.
    const entrada = registro('e1', 'entrada', 2026, 8, 5, 20, 0);
    expect(asistenciasDelDia([entrada], 'e1', hoy)).toHaveLength(1);
    expect(entradaActiva([entrada], 'e1', hoy)).toBeTruthy();
  });

  it('la entrada de anoche NO aparece como activa hoy', () => {
    // El otro lado del mismo bug: al día siguiente por la mañana, la entrada
    // de anoche se colaba y el checador decía «ya tienes entrada registrada»
    // a alguien que acababa de llegar.
    const anoche = registro('e1', 'entrada', 2026, 8, 4, 22, 0);
    const manana = aISOLocal(new Date(2026, 7, 5));
    expect(asistenciasDelDia([anoche], 'e1', manana)).toHaveLength(0);
    expect(entradaActiva([anoche], 'e1', manana)).toBeNull();
  });

  it('funciona igual a mediodía, que es cuando el bug NO se veía', () => {
    const entrada = registro('e1', 'entrada', 2026, 8, 5, 12, 0);
    expect(entradaActiva([entrada], 'e1', hoy)).toBeTruthy();
  });

  it('la medianoche justa pertenece al día que empieza', () => {
    const entrada = registro('e1', 'entrada', 2026, 8, 5, 0, 0);
    expect(asistenciasDelDia([entrada], 'e1', hoy)).toHaveLength(1);
  });

  it('las 23:59 pertenecen al día que termina', () => {
    const entrada = registro('e1', 'entrada', 2026, 8, 5, 23, 59);
    expect(asistenciasDelDia([entrada], 'e1', hoy)).toHaveLength(1);
  });
});

describe('entradaActiva', () => {
  const hoy = aISOLocal(new Date(2026, 7, 5));

  it('tras la salida ya no hay turno abierto', () => {
    const filas = [
      registro('e1', 'entrada', 2026, 8, 5, 9, 0),
      registro('e1', 'salida', 2026, 8, 5, 17, 0),
    ];
    expect(entradaActiva(filas, 'e1', hoy)).toBeNull();
  });

  it('una segunda entrada tras la salida sí abre turno de nuevo', () => {
    const filas = [
      registro('e1', 'entrada', 2026, 8, 5, 9, 0),
      registro('e1', 'salida', 2026, 8, 5, 13, 0),
      registro('e1', 'entrada', 2026, 8, 5, 18, 0),
    ];
    expect(entradaActiva(filas, 'e1', hoy)?.tipo).toBe('entrada');
  });

  it('mira el registro MÁS RECIENTE, no el primero de la lista', () => {
    // El orden en que llegan del store no está garantizado.
    const filas = [
      registro('e1', 'salida', 2026, 8, 5, 17, 0),
      registro('e1', 'entrada', 2026, 8, 5, 9, 0),
    ];
    expect(entradaActiva(filas, 'e1', hoy)).toBeNull();
  });

  it('no mezcla empleados', () => {
    const filas = [registro('e2', 'entrada', 2026, 8, 5, 9, 0)];
    expect(entradaActiva(filas, 'e1', hoy)).toBeNull();
    expect(entradaActiva(filas, 'e2', hoy)).toBeTruthy();
  });

  it('compara el id como texto: el store mezcla números y cadenas', () => {
    const filas = [{ ...registro(7, 'entrada', 2026, 8, 5, 9, 0) }];
    expect(entradaActiva(filas, '7', hoy)).toBeTruthy();
  });

  it('datos basura no revientan la pantalla del checador', () => {
    const filas = [
      { empleado_id: 'e1' }, // sin fecha
      { empleado_id: 'e1', fecha_hora: 'no-es-fecha', tipo: 'entrada' },
      null,
    ];
    expect(() => asistenciasDelDia(filas, 'e1', hoy)).not.toThrow();
    expect(asistenciasDelDia(filas, 'e1', hoy)).toHaveLength(0);
  });

  it('sin lista o sin empleado devuelve vacío', () => {
    expect(asistenciasDelDia(null, 'e1')).toEqual([]);
    expect(asistenciasDelDia([], '')).toEqual([]);
    expect(entradaActiva([], 'e1')).toBeNull();
  });
});

describe('horasDesde', () => {
  it('cuenta las horas trabajadas desde la entrada', () => {
    const entrada = registro('e1', 'entrada', 2026, 8, 5, 9, 0);
    const ahora = new Date(2026, 7, 5, 14, 30);
    expect(horasDesde(entrada, ahora)).toBeCloseTo(5.5, 5);
  });

  it('nunca devuelve negativo aunque el reloj del equipo se mueva', () => {
    const entrada = registro('e1', 'entrada', 2026, 8, 5, 14, 0);
    const ahora = new Date(2026, 7, 5, 9, 0);
    expect(horasDesde(entrada, ahora)).toBe(0);
  });

  it('sin entrada da cero, no NaN', () => {
    expect(horasDesde(null)).toBe(0);
    expect(horasDesde({ fecha_hora: 'basura' })).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// «¿Quién está dentro AHORA?» — pedido de Chris el 10-ago.
//
// Es otra pregunta que «¿tiene turno abierto hoy?», y la diferencia se nota a
// una hora concreta: la madrugada. El turno de noche cruza la medianoche, así
// que su entrada pertenece al día de AYER y cualquier filtro por día local
// devolvería una plantilla vacía a la 1:00 — el único turno en el que el dueño
// no está en el local y por tanto el único en el que necesita mirar la lista.
// ─────────────────────────────────────────────────────────────────────────────

/** Como `registro`, pero con nombre, que es lo que la vista pinta. */
const marca = (empleadoId, nombre, tipo, y, m, d, hh, mm = 0) => ({
  empleado_id: empleadoId,
  empleado_nombre: nombre,
  tipo,
  fecha_hora: new Date(y, m - 1, d, hh, mm, 0).toISOString(),
});

describe('ultimoRegistro — sin filtro de día', () => {
  it('cruza la medianoche: encuentra la entrada de ayer a las 22:00', () => {
    const filas = [marca(1, 'Diego', 'entrada', 2026, 8, 9, 22, 0)];
    const u = ultimoRegistro(filas, 1);
    expect(u?.tipo).toBe('entrada');
  });

  it('devuelve el más reciente aunque las filas lleguen desordenadas', () => {
    const filas = [
      marca(1, 'Diego', 'entrada', 2026, 8, 10, 8, 0),
      marca(1, 'Diego', 'salida', 2026, 8, 10, 16, 0),
      marca(1, 'Diego', 'entrada', 2026, 8, 10, 12, 0),
    ];
    expect(ultimoRegistro(filas, 1)?.tipo).toBe('salida');
  });

  it('ignora fechas corruptas en vez de dejar que ganen la comparación', () => {
    const filas = [
      marca(1, 'Diego', 'entrada', 2026, 8, 10, 8, 0),
      { empleado_id: 1, tipo: 'salida', fecha_hora: 'no-es-una-fecha' },
    ];
    expect(ultimoRegistro(filas, 1)?.tipo).toBe('entrada');
  });

  it('sin id no adivina: devuelve null', () => {
    expect(
      ultimoRegistro([marca(1, 'D', 'entrada', 2026, 8, 10, 8)], null),
    ).toBeNull();
  });
});

describe('plantillaActiva', () => {
  it('A LA 1:00 ve al que entró AYER a las 22:00 — el caso que motiva todo', () => {
    // Con un filtro por día local, `activos` saldría vacío aquí.
    const filas = [marca(1, 'Diego', 'entrada', 2026, 8, 9, 22, 0)];
    const ahora = new Date(2026, 7, 10, 1, 0, 0);

    const { activos } = plantillaActiva(filas, { ahora });

    expect(activos).toHaveLength(1);
    expect(activos[0].nombre).toBe('Diego');
    expect(activos[0].horas).toBeCloseTo(3, 1);
  });

  it('a quien ya marcó salida no lo cuenta', () => {
    const filas = [
      marca(1, 'Diego', 'entrada', 2026, 8, 10, 8, 0),
      marca(1, 'Diego', 'salida', 2026, 8, 10, 16, 0),
    ];
    const { activos } = plantillaActiva(filas, {
      ahora: new Date(2026, 7, 10, 17, 0),
    });
    expect(activos).toHaveLength(0);
  });

  it('cuenta a quien salió y volvió a entrar', () => {
    // Comida de dos horas en medio del turno: la última marca es entrada.
    const filas = [
      marca(1, 'Diego', 'entrada', 2026, 8, 10, 8, 0),
      marca(1, 'Diego', 'salida', 2026, 8, 10, 14, 0),
      marca(1, 'Diego', 'entrada', 2026, 8, 10, 16, 0),
    ];
    const { activos } = plantillaActiva(filas, {
      ahora: new Date(2026, 7, 10, 18, 0),
    });
    expect(activos).toHaveLength(1);
    // Cuenta desde la reentrada, no desde la mañana.
    expect(activos[0].horas).toBeCloseTo(2, 1);
  });

  it('ordena de más antiguo a más reciente: primero quien lleva más dentro', () => {
    const filas = [
      marca(2, 'Sairi', 'entrada', 2026, 8, 10, 12, 0),
      marca(1, 'Diego', 'entrada', 2026, 8, 10, 8, 0),
      marca(3, 'Beto', 'entrada', 2026, 8, 10, 10, 0),
    ];
    const { activos } = plantillaActiva(filas, {
      ahora: new Date(2026, 7, 10, 14, 0),
    });
    expect(activos.map((a) => a.nombre)).toEqual(['Diego', 'Beto', 'Sairi']);
  });

  it('marca jornada cumplida sólo si hay jornada configurada', () => {
    const filas = [marca(1, 'Diego', 'entrada', 2026, 8, 10, 8, 0)];
    const ahora = new Date(2026, 7, 10, 17, 0); // 9 horas dentro

    const conCandado = plantillaActiva(filas, { ahora, horasJornada: 8 });
    expect(conCandado.activos[0].jornadaCumplida).toBe(true);

    // Con el candado apagado (0), nadie se marca: un aviso que sale siempre
    // deja de ser un aviso.
    const sinCandado = plantillaActiva(filas, { ahora, horasJornada: 0 });
    expect(sinCandado.activos[0].jornadaCumplida).toBe(false);
  });

  it('separa a quien olvidó marcar salida en vez de contarlo como presente', () => {
    // Inflar la plantilla activa y esconder el error de captura entre los
    // nombres correctos serían dos fallos a la vez.
    const filas = [
      marca(1, 'Diego', 'entrada', 2026, 8, 10, 8, 0),
      marca(2, 'Sairi', 'entrada', 2026, 8, 8, 9, 0), // hace dos días
    ];
    const { activos, olvidados } = plantillaActiva(filas, {
      ahora: new Date(2026, 7, 10, 14, 0),
    });

    expect(activos.map((a) => a.nombre)).toEqual(['Diego']);
    expect(olvidados.map((o) => o.nombre)).toEqual(['Sairi']);
    expect(olvidados[0].horas).toBeGreaterThan(HORAS_PARA_OLVIDO);
  });

  it('un turno doble largo sigue siendo trabajo, no un olvido', () => {
    // 15 horas es duro y es real. El corte está en 18 justamente para no
    // llamar «error de captura» a un turno doble.
    const filas = [marca(1, 'Diego', 'entrada', 2026, 8, 10, 7, 0)];
    const { activos, olvidados } = plantillaActiva(filas, {
      ahora: new Date(2026, 7, 10, 22, 0),
    });
    expect(activos).toHaveLength(1);
    expect(olvidados).toHaveLength(0);
  });

  it('funciona sin `staff` cargado — el nombre viaja en la marca', () => {
    // Es la razón de recorrer las asistencias y no la plantilla: en un teléfono
    // recién emparejado `staff` puede estar vacío.
    const filas = [marca(1, 'Diego', 'entrada', 2026, 8, 10, 8, 0)];
    const { activos } = plantillaActiva(filas, {
      ahora: new Date(2026, 7, 10, 9, 0),
    });
    expect(activos[0].nombre).toBe('Diego');
    expect(activos[0].puesto).toBeNull();
  });

  it('enriquece con el puesto cuando `staff` sí está', () => {
    const filas = [marca(1, 'Diego', 'entrada', 2026, 8, 10, 8, 0)];
    const { activos } = plantillaActiva(filas, {
      staff: [{ id: 1, puesto: 'Mesero' }],
      ahora: new Date(2026, 7, 10, 9, 0),
    });
    expect(activos[0].puesto).toBe('Mesero');
  });

  it('sin asistencias no revienta', () => {
    expect(plantillaActiva(null)).toEqual({ activos: [], olvidados: [] });
    expect(plantillaActiva([])).toEqual({ activos: [], olvidados: [] });
  });
});

describe('cierreSugerido — porque esto acaba en la nómina', () => {
  it('un turno normal se cierra AHORA', () => {
    const entrada = marca(1, 'Diego', 'entrada', 2026, 8, 10, 8, 0);
    const ahora = new Date(2026, 7, 10, 16, 0);
    const c = cierreSugerido(entrada, { horasJornada: 8, ahora });
    expect(c.tipo).toBe('ahora');
    expect(c.fecha.getTime()).toBe(ahora.getTime());
    expect(c.horas).toBeCloseTo(8, 1);
  });

  it('un OLVIDO se cierra a entrada + jornada, no a la hora actual', () => {
    // El caso que cuesta dinero: cerrar con now() pagaría ~53 horas.
    const entrada = marca(1, 'Diego', 'entrada', 2026, 8, 8, 9, 0);
    const ahora = new Date(2026, 7, 10, 14, 0);

    const c = cierreSugerido(entrada, { horasJornada: 8, ahora });

    expect(c.tipo).toBe('jornada');
    expect(c.horas).toBe(8);
    // 8-ago 09:00 + 8 h = 8-ago 17:00, no 10-ago 14:00.
    expect(c.fecha.getTime()).toBe(new Date(2026, 7, 8, 17, 0).getTime());
    expect(c.fecha.getTime()).toBeLessThan(ahora.getTime());
  });

  it('sin jornada configurada NO inventa una hora', () => {
    // Adivinar aquí sería adivinar sobre el sueldo de alguien.
    const entrada = marca(1, 'Diego', 'entrada', 2026, 8, 8, 9, 0);
    const c = cierreSugerido(entrada, {
      horasJornada: 0,
      ahora: new Date(2026, 7, 10, 14, 0),
    });
    expect(c.tipo).toBe('indeterminable');
    expect(c.fecha).toBeNull();
  });

  it('con jornada apagada, un turno normal sigue cerrándose ahora', () => {
    // El candado apagado no debe impedir marcar una salida corriente.
    const entrada = marca(1, 'Diego', 'entrada', 2026, 8, 10, 8, 0);
    const ahora = new Date(2026, 7, 10, 16, 0);
    expect(cierreSugerido(entrada, { horasJornada: 0, ahora }).tipo).toBe(
      'ahora',
    );
  });

  it('una fecha corrupta no produce una salida inventada', () => {
    const c = cierreSugerido({ fecha_hora: 'nada' }, { horasJornada: 8 });
    expect(c.tipo).toBe('indeterminable');
    expect(c.fecha).toBeNull();
  });

  it('el corte entre «ahora» y «jornada» es HORAS_PARA_OLVIDO', () => {
    const entrada = marca(1, 'Diego', 'entrada', 2026, 8, 10, 0, 0);
    const justoAntes = new Date(2026, 7, 10, 0, 0);
    justoAntes.setHours(justoAntes.getHours() + HORAS_PARA_OLVIDO - 1);
    const justoDespues = new Date(2026, 7, 10, 0, 0);
    justoDespues.setHours(justoDespues.getHours() + HORAS_PARA_OLVIDO + 1);

    expect(
      cierreSugerido(entrada, { horasJornada: 8, ahora: justoAntes }).tipo,
    ).toBe('ahora');
    expect(
      cierreSugerido(entrada, { horasJornada: 8, ahora: justoDespues }).tipo,
    ).toBe('jornada');
  });
});
