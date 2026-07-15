// src/lib/Nominas.js
// Motor puro del cálculo de nómina. Cero React, cero stores: funciones que
// reciben datos y devuelven números, para poder testearlas con Vitest igual
// que Fiscal.js / Arqueo.js.
//
// Diseño (decisión de negocio):
//  - El PAGO vive en Nóminas; el PROPINERO es la fuente de verdad de propinas
//    (tabla propinas_reparto). Nóminas LEE los repartos del periodo, jamás
//    recalcula ni reparte.
//  - staff.tipo_sueldo define la unidad del sueldo:
//      'hora'  → horas checadas (pares Entrada/Salida de asistencias)
//      'dia'   → días distintos con al menos un registro de asistencia
//      'turno' → turnos de caja del periodo donde el empleado checó dentro
//                de la ventana [apertura, cierre] del turno
import { parseUTC } from '../utils/parseUTC';

export const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

// Registros de asistencia de un empleado dentro de una ventana, ordenados.
const registrosDe = (asistencias, nombre, desdeDt, hastaDt) =>
  (asistencias || [])
    .filter((a) => a.empleado_nombre === nombre)
    .map((a) => ({ ...a, t: parseUTC(a.fecha_hora) }))
    .filter(
      (a) =>
        a.t && (!desdeDt || a.t >= desdeDt) && (!hastaDt || a.t <= hastaDt),
    )
    .sort((a, b) => a.t - b.t);

// Horas trabajadas por pares Entrada→Salida (mismo criterio que el Propinero).
export function horasTrabajadas(asistencias, nombre, desdeDt, hastaDt) {
  if (!nombre) return 0;
  const regs = registrosDe(asistencias, nombre, desdeDt, hastaDt);
  let total = 0;
  let entradaT = null;
  for (const r of regs) {
    const tipo = String(r.tipo || '').toLowerCase();
    if (tipo.includes('entra')) {
      entradaT = r.t;
    } else if (tipo.includes('sal') && entradaT) {
      total += (r.t - entradaT) / 3600000; // ms → horas
      entradaT = null;
    }
  }
  return round2(total);
}

// Días distintos (fecha local del registro) con al menos una asistencia.
export function diasTrabajados(asistencias, nombre, desdeDt, hastaDt) {
  if (!nombre) return 0;
  const dias = new Set(
    registrosDe(asistencias, nombre, desdeDt, hastaDt).map((r) =>
      r.t.toISOString().slice(0, 10),
    ),
  );
  return dias.size;
}

// Turnos del periodo en los que el empleado checó DENTRO de la ventana del
// turno. Un turno sin fecha_cierre (abierto) usa el fin del periodo como tope.
export function turnosTrabajados(
  asistencias,
  turnos,
  nombre,
  desdeDt,
  hastaDt,
) {
  if (!nombre) return 0;
  const regs = registrosDe(asistencias, nombre, desdeDt, hastaDt);
  if (regs.length === 0) return 0;

  const turnosPeriodo = (turnos || []).filter((t) => {
    const ap = parseUTC(t.fecha_apertura);
    return ap && (!desdeDt || ap >= desdeDt) && (!hastaDt || ap <= hastaDt);
  });

  let count = 0;
  for (const t of turnosPeriodo) {
    const ap = parseUTC(t.fecha_apertura);
    const ci = t.fecha_cierre
      ? parseUTC(t.fecha_cierre)
      : hastaDt || new Date();
    if (regs.some((r) => r.t >= ap && r.t <= ci)) count += 1;
  }
  return count;
}

// Suma de propinas de un empleado a partir de las filas de propinas_reparto.
// Match por staff id (repartos nuevos lo incluyen) con fallback por nombre
// (repartos legados solo traían nombre/rol/base/monto).
export function propinasPorEmpleado(repartos, empleado) {
  const idStr = String(empleado?.id ?? '');
  const nombre = empleado?.nombre || '';
  let total = 0;
  for (const rep of repartos || []) {
    for (const p of rep?.participantes || []) {
      const matchId = p.id != null && String(p.id) === idStr;
      const matchNombre = p.id == null && p.nombre === nombre;
      if (matchId || matchNombre) total += Number(p.monto) || 0;
    }
  }
  return round2(total);
}

// Unidades de sueldo según staff.tipo_sueldo, con su etiqueta para UI/detalle.
export function unidadesDeSueldo(
  emp,
  { asistencias, turnos, desdeDt, hastaDt },
) {
  const tipo = emp?.tipo_sueldo || 'dia';
  if (tipo === 'hora') {
    return {
      tipo,
      etiqueta: 'hrs',
      unidades: horasTrabajadas(asistencias, emp.nombre, desdeDt, hastaDt),
    };
  }
  if (tipo === 'turno') {
    return {
      tipo,
      etiqueta: 'turnos',
      unidades: turnosTrabajados(
        asistencias,
        turnos,
        emp.nombre,
        desdeDt,
        hastaDt,
      ),
    };
  }
  return {
    tipo: 'dia',
    etiqueta: 'días',
    unidades: diasTrabajados(asistencias, emp.nombre, desdeDt, hastaDt),
  };
}
