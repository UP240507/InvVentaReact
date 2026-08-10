import { describe, it, expect } from 'vitest';
import { calcularAlertas } from './Alertas';

const AHORA = new Date(2026, 6, 15, 13, 0, 0);

const gestion = {
  flag: (f) => ['gestion', 'abre_caja'].includes(f),
  puedeVerRuta: () => true,
  ahora: AHORA,
};

const mesero = {
  flag: () => false,
  puedeVerRuta: (r) => ['/mesas', '/pos'].includes(r),
  ahora: AHORA,
};

const ids = (datos, op = gestion) =>
  calcularAlertas(datos, op).map((a) => a.id);

describe('desabasto', () => {
  const productos = [
    { id: 1, nombre: 'Jitomate', stock: 0, min: 5 },
    { id: 2, nombre: 'Cebolla', stock: 3, min: 5, unidad: 'kg' },
    { id: 3, nombre: 'Sal', stock: 40, min: 5 },
  ];

  it('separa agotado de bajo mínimo', () => {
    const r = calcularAlertas({ productos }, gestion);
    const agotado = r.find((a) => a.id === 'desabasto-agotado');
    const minimo = r.find((a) => a.id === 'desabasto-minimo');
    expect(agotado.severidad).toBe('critica'); // ya frena ventas
    expect(minimo.severidad).toBe('aviso'); // aún da margen
  });

  it('SEGURIDAD: un mesero no ve alertas de compras', () => {
    expect(ids({ productos }, mesero)).not.toContain('desabasto-agotado');
  });

  it('sin problemas de stock no inventa alertas', () => {
    expect(ids({ productos: [productos[2]] })).toEqual([]);
  });
});

describe('cola muerta de sincronización', () => {
  it('es crítica: son cambios que el usuario cree guardados', () => {
    const r = calcularAlertas({ deadTasks: 3 }, gestion);
    expect(r[0].id).toBe('dead-letter');
    expect(r[0].severidad).toBe('critica');
  });

  it('SEGURIDAD: solo la ve gestión', () => {
    expect(ids({ deadTasks: 3 }, mesero)).not.toContain('dead-letter');
  });
});

describe('mesas estancadas', () => {
  const haceRato = new Date(2026, 6, 15, 12, 30).toISOString(); // 30 min
  const reciente = new Date(2026, 6, 15, 12, 55).toISOString(); // 5 min

  it('avisa de las que llevan mucho pidiendo la cuenta', () => {
    const mesas = [
      {
        id: 1,
        nombre: 'Mesa 1',
        estado: 'por_cobrar',
        actualizado_en: haceRato,
      },
    ];
    expect(ids({ mesas })).toContain('mesas-estancadas');
  });

  it('no molesta con las recién solicitadas', () => {
    const mesas = [
      {
        id: 1,
        nombre: 'Mesa 1',
        estado: 'por_cobrar',
        actualizado_en: reciente,
      },
    ];
    expect(ids({ mesas })).not.toContain('mesas-estancadas');
  });

  it('sin marca de tiempo no adivina', () => {
    const mesas = [{ id: 1, nombre: 'Mesa 1', estado: 'por_cobrar' }];
    expect(ids({ mesas })).not.toContain('mesas-estancadas');
  });
});

describe('jornadas abiertas', () => {
  it('detecta entradas sin salida de días anteriores', () => {
    const asistencias = [
      {
        empleado_nombre: 'Ana',
        tipo: 'entrada',
        fecha_hora: new Date(2026, 6, 14, 9).toISOString(),
      },
    ];
    expect(ids({ asistencias })).toContain('jornadas-abiertas');
  });

  it('la jornada de HOY todavía no es un problema', () => {
    const asistencias = [
      {
        empleado_nombre: 'Ana',
        tipo: 'entrada',
        fecha_hora: new Date(2026, 6, 15, 9).toISOString(),
      },
    ];
    expect(ids({ asistencias })).not.toContain('jornadas-abiertas');
  });

  it('una salida posterior cierra el caso', () => {
    const asistencias = [
      {
        empleado_nombre: 'Ana',
        tipo: 'entrada',
        fecha_hora: new Date(2026, 6, 14, 9).toISOString(),
      },
      {
        empleado_nombre: 'Ana',
        tipo: 'salida',
        fecha_hora: new Date(2026, 6, 14, 18).toISOString(),
      },
    ];
    expect(ids({ asistencias })).not.toContain('jornadas-abiertas');
  });
});

describe('orden y robustez', () => {
  it('las críticas van primero', () => {
    const r = calcularAlertas(
      {
        deadTasks: 1,
        productos: [{ id: 1, nombre: 'X', stock: 2, min: 5 }],
      },
      gestion,
    );
    expect(r[0].severidad).toBe('critica');
  });

  it('no explota sin datos', () => {
    expect(() => calcularAlertas()).not.toThrow();
    expect(calcularAlertas()).toEqual([]);
  });

  it('toda alerta accionable trae ruta y CTA', () => {
    const r = calcularAlertas(
      { deadTasks: 1, productos: [{ id: 1, nombre: 'X', stock: 0 }] },
      gestion,
    );
    expect(r.every((a) => a.ruta && a.cta)).toBe(true);
  });
});
