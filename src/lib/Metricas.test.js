import { describe, it, expect } from 'vitest';
import {
  rangoDePeriodo,
  ventasEnRango,
  agregarVentas,
  calcularPyL,
  variacion,
  topPlatillos,
  resumenDelPeriodo,
} from './Metricas';

// Miércoles 15 de julio de 2026, 13:00 local.
const AHORA = new Date(2026, 6, 15, 13, 0, 0);

const venta = (over = {}) => ({
  total: 100,
  subtotal: 86.21,
  iva: 13.79,
  propina: 0,
  descuento: 0,
  efectivo: 100,
  tarjeta: 0,
  transferencia: 0,
  fecha: new Date(2026, 6, 15, 12, 0, 0).toISOString(),
  items: [{ id: 'r1', nombre: 'Taco', precio: 50, cantidad: 2 }],
  ...over,
});

describe('rangoDePeriodo', () => {
  it('hoy arranca a medianoche', () => {
    const r = rangoDePeriodo('hoy', AHORA);
    expect(r.desde.getHours()).toBe(0);
    expect(r.desde.getDate()).toBe(15);
  });

  it('la semana arranca en LUNES', () => {
    const r = rangoDePeriodo('semana', AHORA);
    expect(r.desde.getDay()).toBe(1); // lunes
    expect(r.desde.getDate()).toBe(13);
  });

  it('el mes arranca el día 1', () => {
    const r = rangoDePeriodo('mes', AHORA);
    expect(r.desde.getDate()).toBe(1);
    expect(r.desdeAnterior.getMonth()).toBe(5); // junio
  });

  it('CLAVE: el periodo anterior se corta a la misma altura', () => {
    // A las 13:00 de hoy se compara contra ayer HASTA las 13:00, no contra el
    // día entero de ayer. Si no, cada mañana parecería que el negocio se hunde.
    const r = rangoDePeriodo('hoy', AHORA);
    expect(r.hastaAnterior.getDate()).toBe(14);
    expect(r.hastaAnterior.getHours()).toBe(13);
  });
});

describe('ventasEnRango', () => {
  const { desde, hasta } = rangoDePeriodo('hoy', AHORA);

  it('deja fuera lo de ayer', () => {
    const ayer = venta({ fecha: new Date(2026, 6, 14, 12).toISOString() });
    expect(ventasEnRango([venta(), ayer], desde, hasta)).toHaveLength(1);
  });

  it('excluye canceladas', () => {
    const nula = venta({ estado: 'cancelada' });
    expect(ventasEnRango([venta(), nula], desde, hasta)).toHaveLength(1);
  });

  it('sobrevive a fechas basura', () => {
    const rota = venta({ fecha: 'no-es-fecha' });
    expect(() => ventasEnRango([rota], desde, hasta)).not.toThrow();
    expect(ventasEnRango([rota], desde, hasta)).toHaveLength(0);
  });
});

describe('agregarVentas', () => {
  it('suma totales y calcula el ticket promedio', () => {
    const a = agregarVentas([venta(), venta({ total: 200 })]);
    expect(a.ingresos).toBe(300);
    expect(a.tickets).toBe(2);
    expect(a.ticketPromedio).toBe(150);
  });

  it('la propina NO entra en ingresos', () => {
    // Es dinero del personal, no del negocio: sumarla inflaría el margen.
    const a = agregarVentas([venta({ total: 100, propina: 30 })]);
    expect(a.ingresos).toBe(100);
    expect(a.propinas).toBe(30);
  });

  it('desglosa por método de pago', () => {
    const a = agregarVentas([
      venta({ efectivo: 40, tarjeta: 60, metodo_pago: 'mixto' }),
    ]);
    expect(a.porMetodo.efectivo).toBe(40);
    expect(a.porMetodo.tarjeta).toBe(60);
  });

  it('sin ventas no divide entre cero', () => {
    expect(agregarVentas([]).ticketPromedio).toBe(0);
  });
});

describe('calcularPyL', () => {
  const recetas = [{ id: 'r1', costo: 20 }];

  it('usa el costo REAL de la receta', () => {
    const p = calcularPyL([venta()], { recetas });
    expect(p.costoReal).toBe(40); // 20 × 2 unidades
    expect(p.costoEstimado).toBe(0);
    expect(p.margen).toBe(60);
    expect(p.pctEstimado).toBe(0);
  });

  it('el costo CONGELADO en el ticket manda sobre el de la receta', () => {
    // El de hoy reescribiría la historia cada vez que sube un insumo.
    const v = venta({
      items: [{ id: 'r1', nombre: 'Taco', precio: 50, cantidad: 2, costo: 15 }],
    });
    expect(calcularPyL([v], { recetas }).costoReal).toBe(30);
  });

  it('cae al food cost % cuando la receta no está costeada', () => {
    const p = calcularPyL([venta()], { recetas: [], foodCostPct: 0.3 });
    expect(p.costoReal).toBe(0);
    expect(p.costoEstimado).toBe(30); // 100 de venta × 30%
    expect(p.pctEstimado).toBe(100);
  });

  it('mide lo estimado en DINERO, no en número de líneas', () => {
    // Un platillo caro sin costear pesa más que tres baratos costeados.
    const v = venta({
      items: [
        { id: 'r1', nombre: 'Barato', precio: 10, cantidad: 1 },
        { id: 'zzz', nombre: 'Caro', precio: 90, cantidad: 1 },
      ],
    });
    const p = calcularPyL([v], { recetas });
    expect(p.lineasCosteadas).toBe(1);
    expect(p.pctEstimado).toBe(90); // 90 de 100 pesos
  });

  it('sin ventas devuelve ceros, no NaN', () => {
    const p = calcularPyL([], { recetas });
    expect(p.margen).toBe(0);
    expect(p.margenPct).toBe(0);
    expect(p.pctEstimado).toBe(0);
  });
});

describe('variacion', () => {
  it('calcula el porcentaje y la dirección', () => {
    expect(variacion(150, 100).pct).toBe(50);
    expect(variacion(150, 100).direccion).toBe('sube');
    expect(variacion(50, 100).direccion).toBe('baja');
  });

  it('sin base NO inventa un +100%', () => {
    const v = variacion(500, 0);
    expect(v.pct).toBe(null);
  });

  it('una diferencia mínima cuenta como "igual"', () => {
    expect(variacion(100.2, 100).direccion).toBe('igual');
  });
});

describe('topPlatillos', () => {
  it('agrupa por nombre y ordena por importe', () => {
    const v1 = venta({
      items: [{ nombre: 'Taco', precio: 50, cantidad: 2 }],
    });
    const v2 = venta({
      items: [
        { nombre: 'Taco', precio: 50, cantidad: 1 },
        { nombre: 'Agua', precio: 500, cantidad: 1 },
      ],
    });
    const top = topPlatillos([v1, v2]);
    expect(top[0].nombre).toBe('Agua');
    expect(top[1].cantidad).toBe(3);
  });
});

describe('resumenDelPeriodo', () => {
  it('arma todo el paquete sin romperse con datos vacíos', () => {
    const r = resumenDelPeriodo([], 'hoy', { ahora: AHORA });
    expect(r.actual.ingresos).toBe(0);
    expect(r.pyl.margen).toBe(0);
    expect(Array.isArray(r.serie)).toBe(true);
    expect(r.top).toEqual([]);
  });

  it('compara contra el periodo anterior', () => {
    const hoy = venta({ total: 200 });
    const ayer = venta({
      total: 100,
      fecha: new Date(2026, 6, 14, 12).toISOString(),
    });
    const r = resumenDelPeriodo([hoy, ayer], 'hoy', { ahora: AHORA });
    expect(r.actual.ingresos).toBe(200);
    expect(r.anterior.ingresos).toBe(100);
    expect(r.comparativa.ingresos.pct).toBe(100);
  });
});

// ─── UTILIDAD NETA (fase 2.5) ───────────────────────────────────────────────
describe('calcularPyL · utilidad neta', () => {
  const recetas = [{ id: 'r1', costo: 20 }];
  const rango = {
    desde: new Date(2026, 6, 1),
    hasta: new Date(2026, 6, 31, 23, 59),
  };

  it('sin gastos capturados NO se presenta utilidad', () => {
    // Con cero gastos, la utilidad sería idéntica al margen bruto: justo la
    // confusión que esta fase venía a arreglar. `hayGastos` deja que el
    // Dashboard decida no rotularla.
    const p = calcularPyL([venta()], { recetas, ...rango });
    expect(p.hayGastos).toBe(false);
    expect(p.margen).toBe(60);
  });

  it('resta los gastos del periodo al margen bruto', () => {
    const p = calcularPyL([venta()], {
      recetas,
      ...rango,
      categoriasGasto: [{ id: 'renta', nombre: 'Renta', fijo: true }],
      gastos: [
        {
          id: 1,
          categoria_id: 'renta',
          monto: 25,
          fecha: '2026-07-10',
          estado: 'pagado',
          activo: true,
        },
      ],
    });
    expect(p.margen).toBe(60); // bruto: 100 de venta − 40 de insumos
    expect(p.gastos).toBe(25);
    expect(p.utilidadNeta).toBe(35);
    expect(p.hayGastos).toBe(true);
  });

  it('la NÓMINA entra solo por sueldos, sin propinas', () => {
    const p = calcularPyL([venta()], {
      recetas,
      ...rango,
      nominas: [
        {
          id: 7,
          fecha_fin: '2026-07-15',
          total_sueldos: 30,
          total_propinas: 500, // no debe tocar nada
          activo: true,
        },
      ],
    });
    expect(p.gastos).toBe(30);
    expect(p.utilidadNeta).toBe(30);
  });

  it('la utilidad neta puede ser NEGATIVA y se muestra tal cual', () => {
    // Un mes malo tiene que poder verse. Acotarlo a cero sería maquillar.
    const p = calcularPyL([venta()], {
      recetas,
      ...rango,
      categoriasGasto: [{ id: 'renta', nombre: 'Renta', fijo: true }],
      gastos: [
        {
          id: 1,
          categoria_id: 'renta',
          monto: 500,
          fecha: '2026-07-10',
          estado: 'pagado',
          activo: true,
        },
      ],
    });
    expect(p.utilidadNeta).toBe(-440);
  });

  it('los gastos PENDIENTES no tocan la utilidad', () => {
    const p = calcularPyL([venta()], {
      recetas,
      ...rango,
      categoriasGasto: [{ id: 'servicios', nombre: 'Servicios', fijo: false }],
      gastos: [
        {
          id: 1,
          categoria_id: 'servicios',
          monto: 30,
          fecha: '2026-07-10',
          estado: 'pendiente',
          activo: true,
        },
      ],
    });
    expect(p.gastos).toBe(0);
    expect(p.gastosPendientes).toBe(30);
    expect(p.utilidadNeta).toBe(60);
  });
});
