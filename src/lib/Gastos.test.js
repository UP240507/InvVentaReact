import { describe, it, expect } from 'vitest';
import {
  fechaDeGasto,
  gastosEnRango,
  gastosDeNomina,
  gastosConsolidados,
  agregarGastos,
  generarRecurrentes,
  resumenGastos,
  ESCALAS,
  escalaDeGasto,
  sinClasificar,
  filtrarPorEscala,
  cuantosSinClasificar,
} from './Gastos';

const CATEGORIAS = [
  { id: 'renta', nombre: 'Renta', fijo: true },
  { id: 'servicios', nombre: 'Servicios', fijo: false },
  { id: 'nomina', nombre: 'Nómina', fijo: true },
];

const gasto = (over = {}) => ({
  id: 1,
  categoria_id: 'renta',
  concepto: 'Renta julio',
  monto: 15000,
  fecha: '2026-07-05',
  origen: 'manual',
  estado: 'pagado',
  activo: true,
  ...over,
});

describe('fechaDeGasto', () => {
  it('interpreta YYYY-MM-DD en hora LOCAL, no UTC', () => {
    // Con new Date('2026-07-05') el gasto se adelantaría un día en México y
    // podría caer en el mes anterior en los cierres de fin de mes.
    const d = fechaDeGasto({ fecha: '2026-07-05' });
    expect(d.getDate()).toBe(5);
    expect(d.getMonth()).toBe(6);
  });

  it('tolera fechas ausentes o basura', () => {
    expect(fechaDeGasto({})).toBe(null);
    expect(fechaDeGasto({ fecha: 'no-es-fecha' })).toBe(null);
  });
});

describe('gastosEnRango', () => {
  const desde = new Date(2026, 6, 1);
  const hasta = new Date(2026, 6, 31, 23, 59);

  it('filtra por periodo', () => {
    const dentro = gasto();
    const fuera = gasto({ id: 2, fecha: '2026-06-20' });
    expect(gastosEnRango([dentro, fuera], desde, hasta)).toHaveLength(1);
  });

  it('excluye los dados de baja', () => {
    expect(
      gastosEnRango([gasto({ activo: false })], desde, hasta),
    ).toHaveLength(0);
  });
});

describe('gastosDeNomina', () => {
  const nomina = {
    id: 77,
    fecha_inicio: '2026-07-01',
    fecha_fin: '2026-07-15',
    total_sueldos: 20000,
    total_propinas: 5000,
    gran_total: 25000,
    activo: true,
  };

  it('CLAVE: usa total_sueldos, NUNCA gran_total', () => {
    // La propina no es dinero del negocio: entra del cliente y sale al
    // personal. Contarla como gasto inflaría el costo en $5,000.
    const [g] = gastosDeNomina([nomina]);
    expect(g.monto).toBe(20000);
  });

  it('marca el origen y la referencia para impedir duplicados', () => {
    const [g] = gastosDeNomina([nomina]);
    expect(g.origen).toBe('nomina');
    expect(g.origen_ref).toBe('77');
    expect(g._derivado).toBe(true);
  });

  it('descarta nóminas sin sueldos o sin fecha', () => {
    expect(gastosDeNomina([{ ...nomina, total_sueldos: 0 }])).toHaveLength(0);
    expect(
      gastosDeNomina([{ ...nomina, fecha_fin: null, fecha_inicio: null }]),
    ).toHaveLength(0);
  });

  it('no explota sin datos', () => {
    expect(gastosDeNomina()).toEqual([]);
  });
});

describe('gastosConsolidados · doble conteo (G.5)', () => {
  it('un gasto de nómina capturado a mano NO se suma dos veces', () => {
    // La UI no lo permite y la BD tiene índice único, pero si por lo que fuera
    // existiera esa fila, el motor la descarta igual. Tres capas para lo mismo
    // porque un duplicado aquí no se nota hasta el cierre de mes.
    const manualIndebido = gasto({
      id: 9,
      categoria_id: 'nomina',
      origen: 'nomina',
      monto: 20000,
    });
    const nominas = [
      {
        id: 77,
        fecha_fin: '2026-07-15',
        total_sueldos: 20000,
        activo: true,
      },
    ];
    const todos = gastosConsolidados([manualIndebido], nominas);
    expect(todos).toHaveLength(1);
    expect(todos[0].origen_ref).toBe('77');
  });

  it('los gastos manuales normales sí se conservan', () => {
    const todos = gastosConsolidados([gasto(), gasto({ id: 2 })], []);
    expect(todos).toHaveLength(2);
  });
});

describe('agregarGastos', () => {
  it('separa fijos de variables', () => {
    const r = agregarGastos(
      [gasto(), gasto({ id: 2, categoria_id: 'servicios', monto: 3000 })],
      CATEGORIAS,
    );
    expect(r.total).toBe(18000);
    expect(r.fijos).toBe(15000);
    expect(r.variables).toBe(3000);
  });

  it('CLAVE: un gasto PENDIENTE no entra en el total', () => {
    // Es una estimación de plantilla sin confirmar. Meterla en la utilidad es
    // el ruido que se quería evitar al modelar la recurrencia.
    const r = agregarGastos(
      [gasto(), gasto({ id: 2, monto: 3000, estado: 'pendiente' })],
      CATEGORIAS,
    );
    expect(r.total).toBe(15000);
    expect(r.pendientes).toBe(3000);
  });

  it('desglosa por categoría, de mayor a menor', () => {
    const r = agregarGastos(
      [
        gasto({ monto: 1000, categoria_id: 'servicios' }),
        gasto({ id: 2, monto: 9000 }),
      ],
      CATEGORIAS,
    );
    expect(r.porCategoria[0].id).toBe('renta');
    expect(r.porCategoria[0].monto).toBe(9000);
  });

  it('sin gastos devuelve ceros, no NaN', () => {
    const r = agregarGastos([], CATEGORIAS);
    expect(r).toEqual({
      total: 0,
      fijos: 0,
      variables: 0,
      pendientes: 0,
      porCategoria: [],
    });
  });
});

describe('generarRecurrentes', () => {
  const plantilla = {
    id: 5,
    categoria_id: 'servicios',
    concepto: 'Luz',
    monto_estimado: 3000,
    dia_del_mes: 5,
    activo: true,
    ultima_generacion: null,
  };

  it('genera el gasto cuando ya pasó su día', () => {
    const r = generarRecurrentes([plantilla], new Date(2026, 6, 10));
    expect(r).toHaveLength(1);
    expect(r[0].fecha).toBe('2026-07-05');
    expect(r[0].origen_ref).toBe('5:2026-07');
  });

  it('nace PENDIENTE: la luz no cuesta lo mismo cada mes', () => {
    const [g] = generarRecurrentes([plantilla], new Date(2026, 6, 10));
    expect(g.estado).toBe('pendiente');
    expect(g.monto).toBe(3000); // estimación, aún no suma al total
  });

  it('no genera antes de su día', () => {
    expect(generarRecurrentes([plantilla], new Date(2026, 6, 3))).toHaveLength(
      0,
    );
  });

  it('IDEMPOTENTE: no regenera lo del mes en curso', () => {
    const ya = { ...plantilla, ultima_generacion: '2026-07-05' };
    expect(generarRecurrentes([ya], new Date(2026, 6, 20))).toHaveLength(0);
  });

  it('sí genera el mes siguiente', () => {
    const ya = { ...plantilla, ultima_generacion: '2026-07-05' };
    const r = generarRecurrentes([ya], new Date(2026, 7, 10));
    expect(r).toHaveLength(1);
    expect(r[0].origen_ref).toBe('5:2026-08');
  });

  it('ignora plantillas desactivadas', () => {
    expect(
      generarRecurrentes(
        [{ ...plantilla, activo: false }],
        new Date(2026, 6, 10),
      ),
    ).toHaveLength(0);
  });

  it('PAUSAR y REANUDAR el mismo mes no duplica el gasto', () => {
    // La pantalla deja pausar y reanudar una plantilla. Si reanudarla contara
    // como "nunca generada", el mes se cobraría dos veces en la utilidad.
    const ya = { ...plantilla, ultima_generacion: '2026-07-05' };
    const pausada = { ...ya, activo: false };
    const reanudada = { ...pausada, activo: true };
    expect(generarRecurrentes([pausada], new Date(2026, 6, 20))).toHaveLength(
      0,
    );
    expect(generarRecurrentes([reanudada], new Date(2026, 6, 20))).toHaveLength(
      0,
    );
  });

  it('el día 28 sí cae en FEBRERO (por eso el tope)', () => {
    // El formulario no ofrece días 29–31: una plantilla el 30 se saltaría
    // febrero entero y el gasto desaparecería un mes sin explicación.
    const fin = { ...plantilla, dia_del_mes: 28 };
    const r = generarRecurrentes([fin], new Date(2027, 1, 28));
    expect(r).toHaveLength(1);
    expect(r[0].fecha).toBe('2027-02-28');
  });

  it('una plantilla creada a mitad de mes genera de inmediato', () => {
    // Se da de alta el día 20 una renta que vence el 5: el mes en curso ya
    // venció, así que el gasto debe aparecer sin esperar al mes siguiente.
    const nueva = { ...plantilla, ultima_generacion: null };
    const r = generarRecurrentes([nueva], new Date(2026, 6, 20));
    expect(r).toHaveLength(1);
    expect(r[0].fecha).toBe('2026-07-05');
  });
});

describe('resumenGastos', () => {
  it('consolida capturados y nómina en un solo total', () => {
    const r = resumenGastos({
      gastos: [gasto()],
      nominas: [
        {
          id: 77,
          fecha_fin: '2026-07-15',
          total_sueldos: 20000,
          total_propinas: 5000,
          activo: true,
        },
      ],
      categorias: CATEGORIAS,
      desde: new Date(2026, 6, 1),
      hasta: new Date(2026, 6, 31, 23, 59),
    });
    // 15,000 de renta + 20,000 de sueldos. Las propinas NO entran.
    expect(r.total).toBe(35000);
    expect(r.gastos).toHaveLength(2);
  });

  it('no explota sin nada', () => {
    expect(() => resumenGastos()).not.toThrow();
    expect(resumenGastos().total).toBe(0);
  });
});

// ─── Las dos pestañas ────────────────────────────────────────────────────────
// Chris (22-ago): separar los gastos del turno de los fuertes. Se llama por lo
// que es y no «caja chica», porque una etiqueta no tiene saldo y el nombre no
// puede prometer lo que la pantalla no hace.

describe('filtrarPorEscala — y lo que NUNCA puede esconder', () => {
  const lista = [
    { id: 1, concepto: 'Hielo', escala: 'turno' },
    { id: 2, concepto: 'Renta', escala: 'fuerte' },
    { id: 3, concepto: 'Viejo, de antes de la columna' }, // sin escala
    { id: 4, concepto: 'Vacío', escala: '  ' },
    { id: 5, concepto: 'Inventado', escala: 'mediano' },
  ];

  it('LA REGLA QUE IMPORTA: lo sin clasificar sale en LAS DOS pestañas', () => {
    // El fallo caro de una pantalla de dinero con filtros no es enseñar de más:
    // es esconder. Si las filas viejas cayeran fuera de las dos vistas, un
    // gasto real quedaría invisible y sólo se notaría al cuadrar el mes, si
    // alguien lo cuadra. Enseñarlo dos veces se ve y se corrige en un clic; no
    // enseñarlo no se ve nunca.
    const turno = filtrarPorEscala(lista, 'turno').map((g) => g.id);
    const fuerte = filtrarPorEscala(lista, 'fuerte').map((g) => g.id);

    expect(turno).toContain(3);
    expect(fuerte).toContain(3);
    // Y ningún gasto se queda fuera de las dos.
    const vistos = new Set([...turno, ...fuerte]);
    lista.forEach((g) => expect(vistos.has(g.id)).toBe(true));
  });

  it('cada pestaña sí deja fuera la escala contraria', () => {
    expect(filtrarPorEscala(lista, 'turno').map((g) => g.id)).not.toContain(2);
    expect(filtrarPorEscala(lista, 'fuerte').map((g) => g.id)).not.toContain(1);
  });

  it('«todos» devuelve la lista tal cual', () => {
    expect(filtrarPorEscala(lista, 'todos')).toHaveLength(5);
    expect(filtrarPorEscala(lista)).toHaveLength(5);
  });

  it('un valor corrupto cuenta como sin clasificar, no como perdido', () => {
    // 'mediano' no es una escala válida. Tratarlo como desconocido lo deja
    // visible en las dos vistas; tratarlo como su propia categoría lo
    // escondería de ambas, que es justo lo que no puede pasar.
    expect(escalaDeGasto({ escala: 'mediano' })).toBeNull();
    expect(filtrarPorEscala(lista, 'turno').map((g) => g.id)).toContain(5);
    expect(filtrarPorEscala(lista, 'fuerte').map((g) => g.id)).toContain(5);
  });

  it('aguanta basura sin reventar', () => {
    expect(filtrarPorEscala(null, 'turno')).toEqual([]);
    expect(filtrarPorEscala(undefined)).toEqual([]);
    expect(escalaDeGasto(null)).toBeNull();
    expect(escalaDeGasto(undefined)).toBeNull();
  });

  it('`sinClasificar` es la pregunta con nombre propio', () => {
    // Se hace en tres sitios de la pantalla —el chip, el aviso y el filtro— y
    // en los tres tiene que significar lo mismo.
    expect(sinClasificar({ escala: 'turno' })).toBe(false);
    expect(sinClasificar({ escala: 'fuerte' })).toBe(false);
    expect(sinClasificar({})).toBe(true);
    expect(sinClasificar({ escala: 'mediano' })).toBe(true);
    expect(sinClasificar(null)).toBe(true);
  });

  it('cuenta los que faltan por clasificar', () => {
    expect(cuantosSinClasificar(lista)).toBe(3);
    expect(cuantosSinClasificar([])).toBe(0);
    expect(cuantosSinClasificar(null)).toBe(0);
  });

  it('la pestaña por defecto es la del turno, y va primera', () => {
    // No es cosmética: es la que se usa con prisa y con gente esperando, así
    // que es la que no debe costar un clic.
    expect(ESCALAS[0].id).toBe('turno');
    expect(ESCALAS.map((e) => e.id)).toEqual(['turno', 'fuerte', 'todos']);
  });
});
