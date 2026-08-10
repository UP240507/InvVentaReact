import { describe, it, expect } from 'vitest';
import { asistenciasDelDia, entradaActiva, horasDesde } from './Asistencias';
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
