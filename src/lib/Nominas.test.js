// src/lib/Nominas.test.js
//
// ── LA AFIRMACIÓN ───────────────────────────────────────────────────────────
// **Las unidades que se le pagan a una persona salen de lo que checó, y un
// registro incompleto nunca se convierte en un número inventado.**
//
// Este motor decide cuánto cobra cada quien. Hasta el 26-sep no tenía ninguna
// prueba: es dinero que sale cada quincena, calculado en silencio, y cuyos
// errores no se notan hasta que alguien reclama su pago. Está en la lista del
// censo (`claude/CENSO_26-SEP_QUE_PROCESO_TIENE_PRUEBA.md`) por eso.
//
// Nóminas LEE los repartos del Propinero, nunca los recalcula: la fuente de
// verdad de las propinas es `propinas_reparto`. Aquí sólo se suman.
import { describe, it, expect } from 'vitest';
import {
  horasTrabajadas,
  diasTrabajados,
  turnosTrabajados,
  propinasPorEmpleado,
  unidadesDeSueldo,
  round2,
} from './Nominas';

const reg = (nombre, tipo, fecha_hora) => ({
  empleado_nombre: nombre,
  tipo,
  fecha_hora,
});

const DIA = '2026-09-01';
const ana = (tipo, hhmm) => reg('Ana', tipo, `${DIA}T${hhmm}:00.000Z`);

describe('horasTrabajadas · pares Entrada → Salida', () => {
  it('LA AFIRMACIÓN: una jornada de 08:00 a 16:00 son 8 horas', () => {
    expect(
      horasTrabajadas([ana('Entrada', '08:00'), ana('Salida', '16:00')], 'Ana'),
    ).toBe(8);
  });

  it('suma varios pares del mismo día: partido de 4 + 3', () => {
    const asistencias = [
      ana('Entrada', '08:00'),
      ana('Salida', '12:00'),
      ana('Entrada', '17:00'),
      ana('Salida', '20:00'),
    ];
    expect(horasTrabajadas(asistencias, 'Ana')).toBe(7);
  });

  it('los minutos cuentan, redondeados a dos decimales', () => {
    expect(
      horasTrabajadas([ana('Entrada', '08:00'), ana('Salida', '08:45')], 'Ana'),
    ).toBe(0.75);
  });

  it('DECISIÓN: quien no checa su SALIDA no acumula horas', () => {
    // No es un descuido del cálculo: sin salida no hay forma de saber cuánto
    // estuvo. Pero para alguien que cobra POR HORA significa cero por ese
    // turno, así que es una regla de negocio, no un detalle técnico.
    expect(horasTrabajadas([ana('Entrada', '08:00')], 'Ana')).toBe(0);
  });

  it('una salida sin entrada previa no inventa horas', () => {
    expect(horasTrabajadas([ana('Salida', '16:00')], 'Ana')).toBe(0);
  });

  it('DECISIÓN: dos entradas seguidas cuentan desde la ÚLTIMA', () => {
    // Olvidó salir a mediodía y volvió a entrar: se pagan 4 horas (17→21), no
    // las 13 que habrían salido de contar desde las 08:00. Conservador a favor
    // del negocio; queda afirmado para que cambiarlo sea deliberado.
    const asistencias = [
      ana('Entrada', '08:00'),
      ana('Entrada', '17:00'),
      ana('Salida', '21:00'),
    ];
    expect(horasTrabajadas(asistencias, 'Ana')).toBe(4);
  });

  it('no mezcla a dos personas', () => {
    const asistencias = [
      ana('Entrada', '08:00'),
      reg('Beto', 'Entrada', `${DIA}T08:00:00.000Z`),
      reg('Beto', 'Salida', `${DIA}T23:00:00.000Z`),
      ana('Salida', '16:00'),
    ];
    expect(horasTrabajadas(asistencias, 'Ana')).toBe(8);
    expect(horasTrabajadas(asistencias, 'Beto')).toBe(15);
  });

  it('respeta la ventana del periodo', () => {
    const asistencias = [
      reg('Ana', 'Entrada', '2026-08-31T08:00:00.000Z'),
      reg('Ana', 'Salida', '2026-08-31T16:00:00.000Z'),
      ana('Entrada', '08:00'),
      ana('Salida', '12:00'),
    ];
    const desde = new Date('2026-09-01T00:00:00.000Z');
    expect(horasTrabajadas(asistencias, 'Ana', desde)).toBe(4);
  });

  it('sin nombre devuelve cero, no todo el mundo', () => {
    expect(horasTrabajadas([ana('Entrada', '08:00')], '')).toBe(0);
    expect(horasTrabajadas(null, 'Ana')).toBe(0);
  });
});

describe('diasTrabajados · días distintos con al menos un registro', () => {
  it('dos registros del mismo día son UN día', () => {
    expect(
      diasTrabajados([ana('Entrada', '08:00'), ana('Salida', '16:00')], 'Ana'),
    ).toBe(1);
  });

  it('dos jornadas separadas por un día son DOS', () => {
    const asistencias = [
      ana('Entrada', '10:00'),
      reg('Ana', 'Entrada', '2026-09-02T10:00:00.000Z'),
    ];
    expect(diasTrabajados(asistencias, 'Ana')).toBe(2);
  });

  it('basta con haber checado la entrada: el día cuenta igual', () => {
    // A diferencia de las horas, aquí un registro suelto SÍ paga el día. Las
    // dos reglas conviven a propósito según `staff.tipo_sueldo`.
    expect(diasTrabajados([ana('Entrada', '08:00')], 'Ana')).toBe(1);
  });

  it('sin registros, cero', () => {
    expect(diasTrabajados([], 'Ana')).toBe(0);
  });
});

describe('turnosTrabajados · turnos de caja donde el empleado estuvo', () => {
  const turno = (id, ap, ci) => ({
    id,
    fecha_apertura: ap,
    fecha_cierre: ci,
  });

  const TURNOS = [
    turno('t1', `${DIA}T07:00:00.000Z`, `${DIA}T15:00:00.000Z`),
    turno('t2', `${DIA}T15:00:00.000Z`, `${DIA}T23:00:00.000Z`),
  ];

  it('LA AFIRMACIÓN: cuenta sólo los turnos en los que checó', () => {
    expect(turnosTrabajados([ana('Entrada', '08:00')], TURNOS, 'Ana')).toBe(1);
  });

  it('quien cruza dos turnos cuenta los dos', () => {
    const asistencias = [ana('Entrada', '08:00'), ana('Salida', '18:00')];
    expect(turnosTrabajados(asistencias, TURNOS, 'Ana')).toBe(2);
  });

  it('un turno ABIERTO —sin fecha_cierre— también se paga', () => {
    // El código cierra ese turno con `hastaDt || new Date()`. Ese respaldo NO
    // se puede observar desde fuera: los registros ya vienen filtrados por
    // `hastaDt`, así que ninguna asistencia puede caer entre el fin del
    // periodo y «ahora». Cambiarlo por `new Date()` a secas no altera ningún
    // resultado — se comprobó mutándolo, y las 30 pruebas siguieron verdes.
    //
    // Queda dicho aquí en vez de fingir que esta prueba lo defiende: lo que
    // afirma es lo observable, que un turno sin cerrar cuenta igual.
    const abiertos = [turno('t3', `${DIA}T07:00:00.000Z`, null)];
    const hasta = new Date(`${DIA}T12:00:00.000Z`);
    expect(
      turnosTrabajados([ana('Entrada', '08:00')], abiertos, 'Ana', null, hasta),
    ).toBe(1);
  });

  it('los turnos fuera del periodo no cuentan', () => {
    const desde = new Date(`${DIA}T14:00:00.000Z`);
    expect(
      turnosTrabajados([ana('Entrada', '16:00')], TURNOS, 'Ana', desde),
    ).toBe(1);
  });

  it('sin asistencias no hay turnos que pagar', () => {
    expect(turnosTrabajados([], TURNOS, 'Ana')).toBe(0);
  });
});

describe('propinasPorEmpleado · se leen, no se reparten', () => {
  const EMP = { id: 7, nombre: 'Ana' };

  it('LA AFIRMACIÓN: suma los montos de esa persona en todos los repartos', () => {
    const repartos = [
      { participantes: [{ id: 7, nombre: 'Ana', monto: 120.5 }] },
      { participantes: [{ id: 7, nombre: 'Ana', monto: 80.25 }] },
    ];
    expect(propinasPorEmpleado(repartos, EMP)).toBe(200.75);
  });

  it('no se lleva lo de otros', () => {
    const repartos = [
      {
        participantes: [
          { id: 7, nombre: 'Ana', monto: 100 },
          { id: 8, nombre: 'Beto', monto: 999 },
        ],
      },
    ];
    expect(propinasPorEmpleado(repartos, EMP)).toBe(100);
  });

  it('un reparto viejo sin id casa por nombre', () => {
    const repartos = [{ participantes: [{ nombre: 'Ana', monto: 50 }] }];
    expect(propinasPorEmpleado(repartos, EMP)).toBe(50);
  });

  it('DECISIÓN: con id presente manda el id, aunque el nombre coincida', () => {
    // Dos personas llamadas igual es el caso que esto evita. El nombre sólo
    // sirve de respaldo cuando el reparto es viejo y no traía id.
    const repartos = [
      { participantes: [{ id: 99, nombre: 'Ana', monto: 50 }] },
    ];
    expect(propinasPorEmpleado(repartos, EMP)).toBe(0);
  });

  it('sin repartos, cero: nunca undefined ni NaN', () => {
    expect(propinasPorEmpleado(null, EMP)).toBe(0);
    expect(propinasPorEmpleado([{}], EMP)).toBe(0);
    expect(Number.isFinite(propinasPorEmpleado([], EMP))).toBe(true);
  });
});

describe('unidadesDeSueldo · la unidad la manda staff.tipo_sueldo', () => {
  const ctx = {
    asistencias: [ana('Entrada', '08:00'), ana('Salida', '16:00')],
    turnos: [
      {
        id: 't1',
        fecha_apertura: `${DIA}T07:00:00.000Z`,
        fecha_cierre: `${DIA}T15:00:00.000Z`,
      },
    ],
    desdeDt: null,
    hastaDt: null,
  };

  it('por hora paga horas', () => {
    const r = unidadesDeSueldo({ nombre: 'Ana', tipo_sueldo: 'hora' }, ctx);
    expect(r).toEqual({ tipo: 'hora', etiqueta: 'hrs', unidades: 8 });
  });

  it('por turno paga turnos', () => {
    const r = unidadesDeSueldo({ nombre: 'Ana', tipo_sueldo: 'turno' }, ctx);
    expect(r).toEqual({ tipo: 'turno', etiqueta: 'turnos', unidades: 1 });
  });

  it('por día paga días', () => {
    const r = unidadesDeSueldo({ nombre: 'Ana', tipo_sueldo: 'dia' }, ctx);
    expect(r).toEqual({ tipo: 'dia', etiqueta: 'días', unidades: 1 });
  });

  it('sin tipo declarado se paga por DÍA, que es lo más común en el local', () => {
    const r = unidadesDeSueldo({ nombre: 'Ana' }, ctx);
    expect(r.tipo).toBe('dia');
    expect(r.unidades).toBe(1);
  });

  it('un tipo desconocido no revienta: cae a día', () => {
    const r = unidadesDeSueldo({ nombre: 'Ana', tipo_sueldo: 'quincena' }, ctx);
    expect(r.tipo).toBe('dia');
  });
});

describe('round2', () => {
  it('redondea a centavos y nunca devuelve NaN', () => {
    expect(round2(12.345)).toBe(12.35);
    expect(round2('12.345')).toBe(12.35);
    expect(round2(0.1 + 0.2)).toBe(0.3);
    expect(round2(undefined)).toBe(0);
    expect(round2('hola')).toBe(0);
  });

  it('el medio centavo cae del lado que diga la coma flotante, no el de la regla', () => {
    // 1.005 no vale 1.005 en binario, vale un pelo MENOS, asi que
    // `1.005 * 100` da 100.49999999999999 y redondea a la baja: 1.00, no 1.01.
    // 2.675, en cambio, vale un pelo mas y sube: 2.68.
    //
    // No se arregla aqui. Se deja afirmado porque es justo el tipo de cosa que
    // luego aparece como "me faltan tres centavos en la nomina" y nadie sabe
    // de donde salieron. El mismo `round2` vive en `Empaques.js` y en
    // `Fiscal.js`: si algun dia se corrige, se corrige en los tres.
    expect(round2(1.005)).toBe(1);
    expect(round2(2.675)).toBe(2.68);
  });
});
