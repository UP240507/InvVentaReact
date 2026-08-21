import { describe, it, expect } from 'vitest';
import {
  construirComandas,
  construirTicket,
  construirPreCuenta,
  documentoDePrueba,
  nombreDelLocal,
  datosDelEmisor,
  money,
  MARCA,
  debeImprimirComanda,
  construirCorteZ,
  construirValePropina,
} from './Comanda';

const config = {
  nombre_empresa: 'AZUL',
  razon_social: 'ALBERTO DE JESUS CHAVEZ FERNANDEZ',
  direccion: 'Centro, Aguascalientes',
  rfc: 'XAXX010101000',
  telefono: '449 915 7059',
};

const comandaBase = {
  id: 'CMD-1700000000000',
  folio: 'CMD-00000',
  mesa: 'Mesa 4',
  mesero: 'Ana',
  fecha_hora: '2026-07-28T20:15:00.000Z',
  items: [
    {
      id: '1',
      nombre: 'Chilaquiles',
      cantidad: 2,
      destino: 'Cocina',
      nota: 'sin cebolla',
    },
    { id: '2', nombre: 'Café', cantidad: 1, destino: 'Barra', nota: '' },
    { id: '3', nombre: 'Sopa', cantidad: 1, destino: 'Cocina', nota: '' },
  ],
};

describe('construirComandas — separación por estación', () => {
  it('emite un documento por zona, no uno por item', () => {
    const docs = construirComandas(comandaBase, { configuracion: config });
    expect(docs).toHaveLength(2);
    expect(docs.map((d) => d.zona)).toEqual(['Barra', 'Cocina']);
  });

  it('cada documento lleva SOLO los items de su estación', () => {
    const docs = construirComandas(comandaBase, { configuracion: config });
    const cocina = docs.find((d) => d.zona === 'Cocina');
    const barra = docs.find((d) => d.zona === 'Barra');
    expect(cocina.cuerpo.map((l) => l.nombre)).toEqual(['Chilaquiles', 'Sopa']);
    expect(barra.cuerpo.map((l) => l.nombre)).toEqual(['Café']);
  });

  it('una estación sin items no genera papel en blanco', () => {
    const soloCocina = {
      ...comandaBase,
      items: [{ id: '1', nombre: 'Sopa', cantidad: 1, destino: 'Cocina' }],
    };
    const docs = construirComandas(soloCocina, { configuracion: config });
    expect(docs).toHaveLength(1);
    expect(docs[0].zona).toBe('Cocina');
  });

  it('LA COMANDA NO LLEVA PRECIOS — ninguna línea, en ninguna zona', () => {
    // Regla de negocio, no de formato: cocina no debe ver el precio de lo que
    // prepara. Se verifica sobre el documento completo por si alguien añade un
    // campo nuevo con dinero dentro.
    const conPrecios = {
      ...comandaBase,
      items: comandaBase.items.map((i) => ({
        ...i,
        precio: 180,
        importe: 180,
      })),
    };
    const docs = construirComandas(conPrecios, { configuracion: config });
    for (const doc of docs) {
      for (const linea of doc.cuerpo) {
        expect(linea.importe).toBe('');
      }
      expect(doc.totales).toEqual([]);
      expect(JSON.stringify(doc)).not.toContain('$');
    }
  });

  it('el cajón NUNCA se abre desde una comanda', () => {
    const docs = construirComandas(comandaBase, { configuracion: config });
    expect(docs.every((d) => d.abrirCajon === false)).toBe(true);
  });

  it('un item sin destino cae en Cocina y no se pierde', () => {
    const huerfano = {
      ...comandaBase,
      items: [{ id: '9', nombre: 'Misterio', cantidad: 1 }],
    };
    const docs = construirComandas(huerfano, { configuracion: config });
    expect(docs).toHaveLength(1);
    expect(docs[0].zona).toBe('Cocina');
    expect(docs[0].cuerpo[0].nombre).toBe('Misterio');
  });

  it('descarta cantidades en cero o negativas', () => {
    const raro = {
      ...comandaBase,
      items: [
        { id: '1', nombre: 'Fantasma', cantidad: 0, destino: 'Cocina' },
        { id: '2', nombre: 'Negativo', cantidad: -3, destino: 'Cocina' },
        { id: '3', nombre: 'Real', cantidad: 1, destino: 'Cocina' },
      ],
    };
    const docs = construirComandas(raro, { configuracion: config });
    expect(docs[0].cuerpo.map((l) => l.nombre)).toEqual(['Real']);
  });

  it('la nota del item viaja: es la mitad del valor de la comanda', () => {
    const docs = construirComandas(comandaBase, { configuracion: config });
    const cocina = docs.find((d) => d.zona === 'Cocina');
    expect(cocina.cuerpo[0].nota).toBe('sin cebolla');
  });

  it('una comanda nula o sin items devuelve lista vacía, no revienta', () => {
    expect(construirComandas(null)).toEqual([]);
    expect(construirComandas({ id: 'X', items: [] })).toEqual([]);
    expect(construirComandas({ id: 'X' })).toEqual([]);
  });
});

describe('idempotencia y reimpresión', () => {
  it('el mismo envío produce el mismo id — el hub puede descartar el duplicado', () => {
    const a = construirComandas(comandaBase, { configuracion: config });
    const b = construirComandas(comandaBase, { configuracion: config });
    expect(a.map((d) => d.id)).toEqual(b.map((d) => d.id));
  });

  it('zonas distintas de la misma comanda tienen ids distintos', () => {
    const docs = construirComandas(comandaBase, { configuracion: config });
    expect(new Set(docs.map((d) => d.id)).size).toBe(docs.length);
  });

  it('la copia 1 no lleva sufijo: hay una sola forma de nombrar la impresión normal', () => {
    const normal = construirComandas(comandaBase, { configuracion: config });
    const copia1 = construirComandas(comandaBase, {
      configuracion: config,
      copia: 1,
    });
    expect(copia1.map((d) => d.id)).toEqual(normal.map((d) => d.id));
    expect(normal[0].id).not.toContain('::c');
  });

  it('UNA REIMPRESIÓN SÍ SALE: id distinto para que el hub no la descarte', () => {
    const original = construirComandas(comandaBase, { configuracion: config });
    const copia = construirComandas(comandaBase, {
      configuracion: config,
      copia: 2,
    });
    expect(copia[0].id).not.toBe(original[0].id);
    expect(copia[0].id).toContain('::c2');
  });

  it('y va marcada, para que cocina no prepare el platillo dos veces', () => {
    const copia = construirComandas(comandaBase, {
      configuracion: config,
      copia: 2,
    });
    expect(copia[0].avisos.join(' ')).toMatch(/REIMPRESIÓN/);
    expect(copia[0].avisos.join(' ')).toMatch(/NO PREPARAR/);
  });

  it('el ticket también distingue copia y original', () => {
    const venta = { id: 99, folio: 'POS-00099', items: [], total: 0 };
    const a = construirTicket(venta, { configuracion: config });
    const b = construirTicket(venta, { configuracion: config, copia: 3 });
    expect(a.id).toBe('ticket::99');
    expect(b.id).toBe('ticket::99::c3');
  });

  // El id sale del folio cuando la venta aún no tiene id — que es el caso de la
  // cuenta que se imprime ANTES de cobrar. Sin `copia`, la segunda cuenta de la
  // misma mesa llegaba al hub con el id de la primera y se descartaba como
  // duplicada, en silencio. Es el fallo encontrado en AZUL el 15-ago.
  it('dos impresiones de la MISMA cuenta dan documentos distintos', () => {
    const cuenta = { folio: 'AZULHN-V-000004', items: [], total: 0 };
    const primera = construirTicket(cuenta, {
      configuracion: config,
      copia: 1,
    });
    const segunda = construirTicket(cuenta, {
      configuracion: config,
      copia: 2,
    });

    expect(primera.id).toBe('ticket::AZULHN-V-000004');
    expect(segunda.id).toBe('ticket::AZULHN-V-000004::c2');
    expect(segunda.id).not.toBe(primera.id);
  });

  // La contraparte, y la razón de que el contador NO sea `Date.now()`: la misma
  // pulsación repetida por la LAN tiene que seguir dando el mismo id, o el
  // deduplicado del hub deja de servir para lo que existe.
  it('la misma impresión repetida conserva el id', () => {
    const cuenta = { folio: 'AZULHN-V-000004', items: [], total: 0 };
    const a = construirTicket(cuenta, { configuracion: config, copia: 2 });
    const b = construirTicket(cuenta, { configuracion: config, copia: 2 });
    expect(a.id).toBe(b.id);
  });

  // El aviso de copia es de COCINA: le dice a un cocinero que no vuelva a hacer
  // el platillo. En el papel de un cliente no significa nada y sugiere que su
  // cuenta es un borrador. La copia de un ticket es un duplicado exacto.
  it('el TICKET no lleva aviso de reimpresión, ni siquiera en la copia', () => {
    const venta = { id: 99, folio: 'POS-00099', items: [], total: 0 };
    const copia = construirTicket(venta, { configuracion: config, copia: 4 });
    expect(copia.avisos).toEqual([]);
  });

  it('pero la COMANDA lo conserva: ahí el duplicado cuesta comida', () => {
    const copia = construirComandas(comandaBase, {
      configuracion: config,
      copia: 2,
    });
    expect(copia[0].avisos.join(' ')).toMatch(/REIMPRESIÓN/);
  });
});

describe('construirTicket — dinero', () => {
  const venta = {
    id: 1700000000001,
    folio: 'POS-00001',
    fecha: '2026-07-28T20:15:00.000Z',
    usuario: 'Chris',
    mesa_nombre: 'Mesa 4',
    items: [
      { nombre: 'Chilaquiles', cantidad: 2, precio: 180 },
      {
        nombre: 'Café',
        cantidad: 1,
        precio: 45,
        descuento: { tipo: 'pct', valor: 10 },
      },
    ],
    subtotal: 349.14,
    iva: 55.86,
    descuento: 4.5,
    propina: 40,
    total: 445,
    metodo_pago: 'efectivo',
    efectivo: 500,
    cambio_entregado: 55,
  };

  it('imprime el NETO de la línea, no el precio de lista', () => {
    const doc = construirTicket(venta, { configuracion: config });
    expect(doc.cuerpo[0].importe).toBe('$360.00');
    expect(doc.cuerpo[1].importe).toBe('$40.50');
  });

  it('y muestra debajo el descuento concedido', () => {
    const doc = construirTicket(venta, { configuracion: config });
    expect(doc.cuerpo[1].sublineas.join(' ')).toContain('−10%');
    expect(doc.cuerpo[1].sublineas.join(' ')).toContain('$4.50');
  });

  it('una cortesía se lee como cortesía, no como un 100% raro', () => {
    const doc = construirTicket(
      {
        ...venta,
        items: [
          {
            nombre: 'Postre',
            cantidad: 1,
            precio: 90,
            descuento: { tipo: 'cortesia' },
          },
        ],
      },
      { configuracion: config },
    );
    expect(doc.cuerpo[0].importe).toBe('$0.00');
    expect(doc.cuerpo[0].sublineas.join(' ')).toContain('Cortesía');
  });

  it('el TOTAL va PRIMERO; el desglose baja al pie (formato AZUL, 11-ago)', () => {
    // Cambio de orden deliberado, medido contra un ticket físico de AZUL: quien
    // recibe el papel busca CUÁNTO PAGA, no cómo se descompone. Con el desglose
    // arriba, el ojo recorre tres cifras antes de llegar a la que importa.
    const doc = construirTicket(venta, { configuracion: config });
    expect(doc.totales.map((t) => t.etiqueta)).toEqual([
      // La propina sí queda arriba: no es desglose, es parte de lo que se paga.
      'Propina',
      'TOTAL',
      // Lo entregado y el cambio van DESPUÉS del total: no son desglose de la
      // cuenta, son la liquidación. Y van en la columna del dinero, no como
      // frase suelta en el pie: "Recibido: $1,200.00   Cambio: $614.00" pasa
      // de 32 columnas y se partía en dos justo donde el cliente comprueba.
      'Recibido',
      'Cambio',
    ]);
  });

  it('subtotal e IVA van en el pie, en UNA línea', () => {
    const doc = construirTicket(venta, { configuracion: config });
    const linea = doc.pie.find((p) => p.includes('SUBTOTAL:'));
    expect(linea).toBeTruthy();
    expect(linea).toContain('IVA:');
    // En 32 columnas dos renglones para dos cifras secundarias son caros.
    expect(doc.pie.filter((p) => p.includes('IVA:'))).toHaveLength(1);
  });

  it('el descuento se ve, aunque haya bajado al desglose', () => {
    const doc = construirTicket(venta, { configuracion: config });
    expect(doc.pie.some((p) => p.includes('DESC:'))).toBe(true);
  });

  it('sólo el TOTAL va enfatizado, y nada antes de él', () => {
    const doc = construirTicket(venta, { configuracion: config });
    const i = doc.totales.findIndex((t) => t.etiqueta === 'TOTAL');
    expect(doc.totales[i].enfasis).toBe(true);
    expect(doc.totales.filter((t) => t.enfasis)).toHaveLength(1);
  });

  it('sin descuento ni propina, esas filas no se imprimen', () => {
    const simple = { ...venta, descuento: 0, propina: 0 };
    const doc = construirTicket(simple, { configuracion: config });
    expect(doc.totales.map((t) => t.etiqueta)).toEqual([
      'TOTAL',
      'Recibido',
      'Cambio',
    ]);
    expect(doc.pie.some((p) => p.includes('DESC:'))).toBe(false);
  });

  it('pagando con tarjeta no hay recibido ni cambio que enseñar', () => {
    const doc = construirTicket(
      { ...venta, metodo_pago: 'tarjeta' },
      { configuracion: config },
    );
    const etiquetas = doc.totales.map((t) => t.etiqueta);
    expect(etiquetas).not.toContain('Recibido');
    expect(etiquetas).not.toContain('Cambio');
    expect(etiquetas.at(-1)).toBe('TOTAL');
  });

  it('todo importe viaja como TEXTO: el hub no hace aritmética', () => {
    const doc = construirTicket(venta, { configuracion: config });
    for (const t of doc.totales) expect(typeof t.valor).toBe('string');
    for (const l of doc.cuerpo) expect(typeof l.importe).toBe('string');
  });

  it('desglosa los componentes de un paquete', () => {
    const doc = construirTicket(
      {
        ...venta,
        items: [
          {
            nombre: 'Desayuno completo',
            cantidad: 1,
            precio: 150,
            componentes: [
              { recetaId: 7, nombre: 'Chilaquiles', cantidad: 1 },
              { recetaId: 8, nombre: 'Café', cantidad: 1 },
            ],
          },
        ],
      },
      { configuracion: config },
    );
    const sub = doc.cuerpo[0].sublineas.join(' ');
    expect(sub).toContain('Chilaquiles');
    expect(sub).toContain('Café');
  });

  it('dice que no es comprobante fiscal — el timbrado aún no existe', () => {
    const doc = construirTicket(venta, { configuracion: config });
    expect(doc.pie.join(' ').toLowerCase()).toContain(
      'no es un comprobante fiscal',
    );
  });

  it('la advertencia fiscal cabe en una línea de papel de 58 mm', () => {
    // 32 columnas. Partida en dos renglones se lee como letra chica, y ésta
    // es justo la que conviene que se lea.
    const doc = construirTicket(venta, { configuracion: config });
    const aviso = doc.pie.find((p) =>
      p.toLowerCase().includes('comprobante fiscal'),
    );
    // `ESTE NO ES UN COMPROBANTE FISCAL` mide exactamente 32. Justo, y a
    // propósito: es el texto del ticket de AZUL y cabe en el papel estrecho.
    expect(aviso).toBeTruthy();
    expect(aviso.length).toBeLessThanOrEqual(32);
  });
});

describe('la marca no viaja dentro del documento', () => {
  // La marca es propiedad de RENDERIZAR un ticket, no un dato del ticket. Si
  // viajara en el JSON, cada renderizador tendría que confiar en que el emisor
  // la puso — y un cliente modificado simplemente no la pondría. Al no estar,
  // no hay nada que quitar: la estampan `escpos.rs` y `TicketImpresion.jsx`
  // por su cuenta, sin consultar el documento.
  const venta = { id: 1, folio: 'POS-1', items: [], total: 100 };

  it('ni el pie ni ningún campo del documento la contienen', () => {
    const doc = construirTicket(venta, { configuracion: config });
    expect(JSON.stringify(doc)).not.toContain(MARCA);
  });

  it('salvo que el negocio se llame así, que es su derecho', () => {
    // Caso límite honesto: si el restaurante se llama InvVenta, el título lo
    // dirá. Eso no es la marca del pie, es su nombre.
    const doc = construirTicket(venta, {
      configuracion: { nombre_empresa: MARCA },
    });
    expect(doc.titulo).toBe(MARCA);
  });

  it('la constante es el nombre a secas, sin eslogan', () => {
    // El eslogan va en la cotización y en la web, no en el papel de alguien
    // que sólo vino a comer. El nombre suelto es una pregunta; el eslogan es
    // publicidad de quien no le vendió nada.
    expect(MARCA).toBe('InvVenta');
  });
});

describe('cajón de efectivo', () => {
  const base = { id: 1, folio: 'POS-1', items: [], total: 100 };

  it('se abre con efectivo', () => {
    const doc = construirTicket({ ...base, metodo_pago: 'efectivo' });
    expect(doc.abrirCajon).toBe(true);
  });

  it('se abre con pago mixto: parte entró en billetes', () => {
    const doc = construirTicket({ ...base, metodo_pago: 'mixto' });
    expect(doc.abrirCajon).toBe(true);
  });

  it('NO se abre con tarjeta: dejaría el dinero expuesto sin razón', () => {
    const doc = construirTicket({ ...base, metodo_pago: 'tarjeta' });
    expect(doc.abrirCajon).toBe(false);
  });

  it('NO se abre con transferencia', () => {
    const doc = construirTicket({ ...base, metodo_pago: 'transferencia' });
    expect(doc.abrirCajon).toBe(false);
  });

  it('se puede forzar a mano (botón "abrir cajón" del arqueo)', () => {
    const doc = construirTicket(
      { ...base, metodo_pago: 'tarjeta' },
      { abrirCajon: true },
    );
    expect(doc.abrirCajon).toBe(true);
  });
});

describe('fecha y hora impresas', () => {
  it('la fecha del ticket es la LOCAL, no la de UTC', () => {
    // 28-jul 23:20 en México (UTC−6) es 29-jul 05:20 en UTC. El ticket debe
    // decir 28: es el día de trabajo que el cliente vivió. Con `.slice(0,10)`
    // sobre el ISO diría 29 — el bug de los gastos, pero ya impreso en papel.
    const iso = new Date(2026, 6, 28, 23, 20, 0).toISOString();
    const doc = construirTicket(
      { id: 1, folio: 'POS-1', items: [], total: 0, fecha: iso },
      { configuracion: config },
    );
    const fecha = doc.meta.find((m) => m.etiqueta === 'Fecha').valor;
    expect(fecha).toBe('2026-07-28');
  });

  it('la hora es la del reloj de pared', () => {
    const iso = new Date(2026, 6, 28, 23, 20, 0).toISOString();
    const doc = construirTicket(
      { id: 1, folio: 'POS-1', items: [], total: 0, fecha: iso },
      { configuracion: config },
    );
    expect(doc.meta.find((m) => m.etiqueta === 'Hora').valor).toBe('23:20');
  });

  it('una fecha inválida no rompe la impresión', () => {
    const doc = construirTicket(
      { id: 1, folio: 'POS-1', items: [], total: 0, fecha: 'basura' },
      { configuracion: config },
    );
    expect(doc.meta.find((m) => m.etiqueta === 'Hora').valor).toBe('');
  });
});

describe('money', () => {
  it('formatea a dos decimales con separador de miles', () => {
    expect(money(1234.5)).toBe('$1,234.50');
    expect(money(0)).toBe('$0.00');
  });

  it('un valor basura se imprime como cero, no como NaN', () => {
    expect(money(undefined)).toBe('$0.00');
    expect(money('hola')).toBe('$0.00');
  });
});

describe('documentoDePrueba', () => {
  it('ejercita acentos, línea larga y alineación de importes', () => {
    const doc = documentoDePrueba({ configuracion: config });
    const texto = JSON.stringify(doc);
    expect(texto).toMatch(/[ñáéíóúÑ]/);
    expect(doc.cuerpo.some((l) => l.nombre.length > 30)).toBe(true);
    expect(doc.totales.at(-1).enfasis).toBe(true);
  });

  it('no abre el cajón: es una prueba de papel, no de caja', () => {
    expect(documentoDePrueba({ configuracion: config }).abrirCajon).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('construirPreCuenta', () => {
  const cuenta = {
    items: [
      { id: '1', nombre: 'Chilaquiles', cantidad: 2, precio: 155 },
      { id: '2', nombre: 'Café de olla', cantidad: 3, precio: 44 },
    ],
    subtotal: 488.79,
    iva: 78.21,
    descuento: 0,
    total: 567,
    mesa_id: 'm9',
    mesa_nombre: 'Mesa 9',
    comensales: 3,
    usuario: 'Sairi',
    fecha: '2026-08-06T14:30:00.000Z',
  };

  const pre = (extra = {}) =>
    construirPreCuenta({ ...cuenta, ...extra }, { configuracion: config });

  it('NO lleva datos de pago: todavía no hay pago', () => {
    // Es la diferencia de fondo con el ticket. Un papel con «Recibido» y
    // «Cambio» dice que ya se cobró, y el cliente que lo recibe da por hecho
    // que está pagado.
    const etiquetas = pre().totales.map((t) => t.etiqueta);
    expect(etiquetas).not.toContain('Recibido');
    expect(etiquetas).not.toContain('Cambio');
    expect(etiquetas).not.toContain('Propina');
    expect(JSON.stringify(pre().pie)).not.toMatch(/Pago:/);
  });

  it('avisa de que la propina no está incluida', () => {
    // Su razón de existir: es el papel con el que el cliente decide cuánto
    // deja. Sin el aviso, puede creer que ya va dentro del total.
    expect(pre().pie.join('\n')).toContain('PROPINA NO INCLUIDA');
  });

  it('lleva el importe en letra, pegado a los totales', () => {
    // Es la línea que impide alterar la cifra a mano. Separada del total no
    // protege nada, así que abre el pie — justo debajo del TOTAL.
    //
    // Antes iba en segunda posición porque el RFC ocupaba la primera; desde que
    // los datos fiscales subieron a la cabecera, que es su sitio, la letra
    // quedó pegada al total como debía estar desde el principio.
    const pie = pre().pie;
    expect(pie.join('\n')).toContain(
      'SON: QUINIENTOS SESENTA Y SIETE PESOS 00/100 M.N.',
    );
    expect(pie.findIndex((l) => l.startsWith('SON:'))).toBe(0);
  });

  it('NUNCA abre el cajón', () => {
    // Una mesa pide la cuenta varias veces por turno. Abrir el cajón en cada
    // una deja el efectivo expuesto sin que haya entrado nada.
    expect(pre().abrirCajon).toBe(false);
  });

  it('no gasta folio', () => {
    // Se reimprime —el cliente la pide, pide postre, la pide otra vez— y si
    // consumiera folios de venta la serie saldría llena de huecos.
    const etiquetas = pre().meta.map((m) => m.etiqueta);
    expect(etiquetas).not.toContain('Folio');
  });

  it('se identifica por mesa, personas y quién atiende', () => {
    const meta = Object.fromEntries(
      pre().meta.map((m) => [m.etiqueta, m.valor]),
    );
    expect(meta.Mesa).toBe('Mesa 9');
    expect(meta.Personas).toBe('3');
    expect(meta.Atendió).toBe('Sairi');
  });

  it('sin comensales no inventa la línea', () => {
    const etiquetas = pre({ comensales: 0 }).meta.map((m) => m.etiqueta);
    expect(etiquetas).not.toContain('Personas');
  });

  it('se reimprime siempre: dos peticiones son dos papeles', () => {
    // Lo contrario que la comanda de cocina, donde el duplicado silencioso
    // cuesta un platillo. Aquí no imprimir cuando el cliente la pide cuesta un
    // mesero volviendo a la caja.
    const a = pre();
    const b = pre();
    expect(a.id).not.toBe(b.id);
    expect(a.id.startsWith('precuenta::m9::')).toBe(true);
  });

  it('el aviso dice qué es este papel', () => {
    expect(pre().avisos.join(' ')).toMatch(/NO ES PAGO/);
  });

  it('muestra el neto por línea, como el ticket', () => {
    const cuerpo = pre().cuerpo;
    expect(cuerpo).toHaveLength(2);
    expect(cuerpo[0]).toMatchObject({ cantidad: '2', importe: '$310.00' });
    expect(cuerpo[1]).toMatchObject({ cantidad: '3', importe: '$132.00' });
  });

  it('el descuento aparece sólo si lo hay, y ahora en el desglose del pie', () => {
    expect(pre().pie.some((p) => p.includes('DESC:'))).toBe(false);
    expect(pre({ descuento: 50 }).pie.some((p) => p.includes('DESC:'))).toBe(
      true,
    );
  });

  it('el desglose fiscal va en el pie, en una línea', () => {
    const linea = pre().pie.find((p) => p.includes('SUBTOTAL:'));
    expect(linea).toBeTruthy();
    expect(linea).toContain('IVA:');
  });

  it('«PROPINA NO INCLUIDA» sólo cuando la propina NO está incluida', () => {
    // Se decide por el dato y no por el tipo de documento: el mismo constructor
    // sirve para la cuenta de la mesa (sin propina) y —en el flujo de un solo
    // papel— para el ticket. Decirlo en un papel que ya la cobró sería falso, y
    // podría hacer que el cliente la pague dos veces.
    expect(pre().pie.join(' ')).toContain('PROPINA NO INCLUIDA');
    expect(pre({ propina: 40 }).pie.join(' ')).not.toContain(
      'PROPINA NO INCLUIDA',
    );
  });

  it('el TOTAL va con énfasis y es el último', () => {
    const totales = pre().totales;
    expect(totales.at(-1)).toMatchObject({ etiqueta: 'TOTAL', enfasis: true });
  });

  it('una cuenta vacía no produce documento', () => {
    expect(construirPreCuenta(null, { configuracion: config })).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('los datos del emisor', () => {
  const ventaBase = {
    id: 1,
    folio: 'CAJA-V-000001',
    items: [{ nombre: 'Café', cantidad: 1, precio: 45 }],
    subtotal: 38.79,
    iva: 6.21,
    total: 45,
    metodo_pago: 'efectivo',
    efectivo: 50,
    cambio_entregado: 5,
  };

  it('el título es el nombre del LOCAL, nunca el de la marca', () => {
    // El fallo que había: leía `nombre_restaurante`, campo que no existe en
    // ninguna parte del sistema —la columna es `nombre_empresa`—, así que el
    // valor era siempre undefined y caía al respaldo, que era 'InvVenta'.
    // Todos los tickets impresos llevaron el nombre del proveedor del software
    // en el sitio del emisor.
    expect(construirTicket(ventaBase, { configuracion: config }).titulo).toBe(
      'AZUL',
    );
  });

  it('sin nombre configurado, el respaldo NO puede ser la marca', () => {
    // En el hueco del emisor va el emisor, o un aviso de que falta
    // configurarlo. Nunca quien vendió el software.
    const doc = construirTicket(ventaBase, { configuracion: {} });
    expect(doc.titulo).not.toBe(MARCA);
    expect(doc.titulo).toBe('MI RESTAURANTE');
  });

  it('`_restaurante` tampoco iba vacío por el mismo motivo', () => {
    expect(
      construirTicket(ventaBase, { configuracion: config })._restaurante,
    ).toBe('AZUL');
  });

  it('el emisor va ARRIBA y en el orden de un comprobante', () => {
    // Quién factura, con qué RFC, desde dónde y a qué teléfono.
    expect(datosDelEmisor(config)).toEqual([
      'ALBERTO DE JESUS CHAVEZ FERNANDEZ',
      'RFC: XAXX010101000',
      'Centro, Aguascalientes',
      'Tel: 449 915 7059',
    ]);
  });

  it('el RFC ya NO va en el pie', () => {
    // Estuvo ahí hasta el 6-ago y era el sitio equivocado: entre el «gracias
    // por su visita» y la advertencia legal parecía una nota más.
    const doc = construirTicket(ventaBase, { configuracion: config });
    expect(doc.pie.join('\n')).not.toMatch(/RFC/);
    expect(doc.emisor.join('\n')).toMatch(/RFC/);
  });

  it('los datos que faltan no dejan renglones en blanco', () => {
    // Un local a medio configurar no debe imprimir huecos en su encabezado.
    expect(datosDelEmisor({ rfc: 'XAXX010101000' })).toEqual([
      'RFC: XAXX010101000',
    ]);
    expect(datosDelEmisor({})).toEqual([]);
    expect(datosDelEmisor(null)).toEqual([]);
  });

  it('sin razón social NO se repite el nombre comercial', () => {
    // Sería afirmar un dato fiscal que nadie ha capturado.
    const sinFiscal = { nombre_empresa: 'AZUL', rfc: 'XAXX010101000' };
    expect(datosDelEmisor(sinFiscal)).not.toContain('AZUL');
  });

  it('el nombre comercial y el fiscal son cosas distintas', () => {
    expect(nombreDelLocal(config)).toBe('AZUL');
    expect(datosDelEmisor(config)[0]).toBe('ALBERTO DE JESUS CHAVEZ FERNANDEZ');
  });

  it('la pre-cuenta identifica al emisor igual que el ticket', () => {
    const pre = construirPreCuenta(
      { items: [], total: 0, mesa_nombre: 'Mesa 1' },
      { configuracion: config },
    );
    expect(pre.titulo).toBe('AZUL');
    expect(pre.emisor).toContain('RFC: XAXX010101000');
  });

  it('la comanda de cocina NO lleva datos fiscales', () => {
    // No sale del local y nadie de fuera la ve: ahí el RFC sólo gastaría papel.
    const doc = construirComandas(comandaBase, { configuracion: config })[0];
    expect(doc.emisor ?? []).toEqual([]);
  });
});

describe('debeImprimirComanda — cuándo sale papel de cocina', () => {
  it('«siempre» imprime aunque la comanda haya llegado a la nube', () => {
    // Cocina sin pantalla: el papel es el único canal y no depende de la red.
    expect(debeImprimirComanda('siempre', true)).toBe(true);
    expect(debeImprimirComanda('siempre', false)).toBe(true);
  });

  it('«sin_nube» sólo imprime lo que NO llegó', () => {
    // El caso que motivó el cambio: con KDS, la comanda que subió ya se está
    // viendo en la pantalla y el papel sobraba.
    expect(debeImprimirComanda('sin_nube', true)).toBe(false);
    expect(debeImprimirComanda('sin_nube', false)).toBe(true);
  });

  it('«nunca» no imprime ni sin nube', () => {
    // No es redundante con `sin_nube`: un local con KDS por LAN ve las comandas
    // aunque no haya internet, así que imprimir al caerse la nube sería gastar
    // papel por un problema que no le afecta.
    expect(debeImprimirComanda('nunca', false)).toBe(false);
    expect(debeImprimirComanda('nunca', true)).toBe(false);
  });

  it('un modo desconocido o vacío cae en «siempre»', () => {
    // Degradación segura: ante un dato corrupto, papel de más. Lo contrario es
    // una cocina que deja de recibir comandas sin que nada falle.
    for (const modo of [undefined, null, '', 'Sí', 'xyz']) {
      expect(debeImprimirComanda(modo, true)).toBe(true);
    }
  });

  it('no distingue mayúsculas', () => {
    expect(debeImprimirComanda('SIN_NUBE', true)).toBe(false);
    expect(debeImprimirComanda('Nunca', false)).toBe(false);
  });
});

describe('el ticket sin pago — la cuenta que se lleva a la mesa', () => {
  // Con el flujo de un solo papel, `construirTicket` se usa ANTES de cobrar.
  // Todo lo que hable de un pago que no ha ocurrido está mal en ese papel.
  const base = {
    folio: 'AZUL7K-V-000001',
    mesa_nombre: '9',
    usuario: 'Sairi',
    comensales: 3,
    fecha: new Date(2026, 7, 6, 13, 42).toISOString(),
    subtotal: 488.79,
    iva: 78.21,
    total: 567,
    items: [{ cantidad: 1, nombre: 'Mestizos', precio_venta: 110 }],
  };
  const sinPago = () => construirTicket(base, { configuracion: config });

  it('no inventa «Recibido» ni «Cambio» de $0.00', () => {
    // Antes `metodo` caía a 'efectivo' por defecto y el papel afirmaba un pago
    // inexistente: «Recibido: $0.00 / Cambio: $0.00» en una cuenta sin pagar.
    const etiquetas = sinPago().totales.map((t) => t.etiqueta);
    expect(etiquetas).not.toContain('Recibido');
    expect(etiquetas).not.toContain('Cambio');
  });

  it('no dice cómo se pagó, porque todavía no se ha pagado', () => {
    expect(sinPago().pie.join(' ')).not.toContain('Pago:');
  });

  it('con pago sí aparecen las dos cosas', () => {
    const doc = construirTicket(
      { ...base, metodo_pago: 'efectivo', efectivo: 600, cambio_entregado: 33 },
      { configuracion: config },
    );
    expect(doc.totales.map((t) => t.etiqueta)).toContain('Recibido');
    expect(doc.pie.join(' ')).toContain('Pago:');
  });

  it('una fila de `ventas` no trae el cambio, y entonces no se inventa', () => {
    // `cambio_entregado` se calcula en el modal de cobro y muere con él: NO
    // está en la base. Una reimpresión desde Reportes trabaja con la fila, y
    // sin esta guarda `money(undefined)` imprimiría «Cambio: $0.00» — que en
    // un papel que se lleva el cliente no es un hueco, es una cifra falsa.
    const filaDeLaBase = {
      ...base,
      metodo_pago: 'efectivo',
      efectivo: 110,
      // sin `cambio_entregado`, como viene de Supabase
    };
    const etiquetas = construirTicket(filaDeLaBase, {
      configuracion: config,
    }).totales.map((t) => t.etiqueta);
    expect(etiquetas).not.toContain('Recibido');
    expect(etiquetas).not.toContain('Cambio');
    // Lo demás del ticket sigue entero: esto quita dos filas, no el papel.
    expect(etiquetas).toContain('TOTAL');
  });

  it('un cambio de CERO de verdad sí se imprime', () => {
    // La distinción es «no lo sé» contra «fue cero». Pago exacto es un cero
    // legítimo y el cliente tiene derecho a verlo en el papel.
    const doc = construirTicket(
      { ...base, metodo_pago: 'efectivo', efectivo: 110, cambio_entregado: 0 },
      { configuracion: config },
    );
    expect(doc.totales.map((t) => t.etiqueta)).toContain('Cambio');
  });

  it('la mesa va primero en la meta, y las personas si las hay', () => {
    // Quien revisa una pila de cuentas busca la mesa; el folio se usa después.
    const meta = sinPago().meta.map((m) => m.etiqueta);
    expect(meta[0]).toBe('Mesa');
    expect(meta).toContain('Personas');
    expect(meta).toContain('Folio');
  });
});

// ── Modificadores en el papel (13-ago) ──────────────────────────────────────
// El camino estaba entero y no lo recorría nadie: el POS no producía el dato.
// Estas pruebas fijan el tramo del papel para que, si alguien vuelve a
// reconstruir un item campo a campo por el camino, falle aquí y no en cocina.
describe('modificadores · lo elegido llega al papel', () => {
  const conMods = {
    ...comandaBase,
    items: [
      {
        id: '1',
        nombre: 'Hamburguesa',
        cantidad: 1,
        destino: 'Cocina',
        nota: 'salsa aparte',
        modificadores: [
          { grupo_id: 1, id_opcion: 11, nombre: 'Término medio' },
          { grupo_id: 2, id_opcion: 21, nombre: 'Extra queso', precio: 15 },
        ],
      },
    ],
  };

  it('la comanda de cocina las lista como sublíneas', () => {
    const [cocina] = construirComandas(conMods, { configuracion: config });
    expect(cocina.cuerpo[0].sublineas).toEqual([
      '  Término medio',
      '  Extra queso',
    ]);
  });

  it('la nota y los modificadores conviven: no se pisan', () => {
    // Son dos cosas distintas —lo estructurado y lo que el cliente dijo— y el
    // cocinero necesita las dos.
    const [cocina] = construirComandas(conMods, { configuracion: config });
    expect(cocina.cuerpo[0].nota).toBe('salsa aparte');
    expect(cocina.cuerpo[0].sublineas).toHaveLength(2);
  });

  it('NO imprime el precio de la opción, aunque el dato venga', () => {
    // Hoy los modificadores no suman al total. Un papel que enseñara «+$15»
    // junto a un total que no lo incluye es una discusión en la mesa.
    const [cocina] = construirComandas(conMods, { configuracion: config });
    expect(cocina.cuerpo[0].sublineas.join(' ')).not.toMatch(/15|\$/);
  });

  it('sangra igual que los componentes de un paquete', () => {
    // Dos sangrías distintas en 32 columnas se leen como un error de
    // impresión, no como dos clases de información.
    const [cocina] = construirComandas(conMods, { configuracion: config });
    for (const s of cocina.cuerpo[0].sublineas) {
      expect(s.startsWith('  ')).toBe(true);
    }
  });

  it('un item sin modificadores sigue saliendo igual que siempre', () => {
    const [barra] = construirComandas(comandaBase, { configuracion: config });
    expect(barra.cuerpo[0].sublineas).toEqual([]);
  });
});

// ─── Los dos papeles del cierre ──────────────────────────────────────────────
// Corte Z y vale de propinas. Hasta hoy salían por `window.open` + `win.print()`
// y dentro de la caja eso no imprime nada: código vivo que no puede funcionar.
// Estas pruebas fijan la forma del documento, que es lo que `escpos.rs` lee.

const corteBase = {
  turno: '4f2a1',
  apertura: '2026-07-28T14:00:00.000Z',
  cierre: '2026-07-28T23:30:00.000Z',
  usuario: 'Ana',
  tickets: 37,
  efectivo: 4210.5,
  tarjeta: 1890,
  propinas: 640,
  fondo: 1000,
  total: 6100.5,
  enCaja: 5210.5,
  impreso: '2026-07-28T23:35:00.000Z',
};

describe('construirCorteZ — el papel que se pega en la libreta', () => {
  it('deja el cuerpo vacío: un corte no tiene artículos', () => {
    // No es un detalle de estilo. `escpos.rs` pinta la cabecera
    // «CANT DESCRIPCION IMPORTE» encima de cualquier `cuerpo` no vacío, y bajo
    // ese título «1x Efectivo» no significa nada. Los conceptos van en
    // `totales`, que es la sección que existe para pares etiqueta/cifra.
    const doc = construirCorteZ(corteBase, { configuracion: config });
    expect(doc.cuerpo).toEqual([]);
  });

  it('lo único enfatizado es la cifra que se cuenta contra el cajón', () => {
    const doc = construirCorteZ(corteBase, { configuracion: config });
    const fuertes = doc.totales.filter((t) => t.enfasis);
    expect(fuertes).toHaveLength(1);
    expect(fuertes[0].etiqueta).toBe('TOTAL EN CAJA');
    expect(fuertes[0].valor).toBe(money(5210.5));
  });

  it('lleva el desglose completo del turno, con dinero ya formateado', () => {
    // El hub no hace aritmética: todo el dinero viaja como texto hecho.
    const doc = construirCorteZ(corteBase, { configuracion: config });
    const filas = Object.fromEntries(
      doc.totales.map((t) => [t.etiqueta, t.valor]),
    );
    expect(filas['Tickets']).toBe('37');
    expect(filas['Efectivo']).toBe(money(4210.5));
    expect(filas['Tarjeta']).toBe(money(1890));
    expect(filas['Propinas']).toBe(money(640));
    expect(filas['Fondo inicial']).toBe(money(1000));
    expect(filas['Total ventas']).toBe(money(6100.5));
  });

  it('un turno sin cerrar dice «En curso», no un hueco', () => {
    // Mirar cómo va el turno a media tarde es legítimo, y el papel tiene que
    // decir cuál de las dos cosas es: un cierre en blanco se lee como un corte
    // definitivo al que le falta el dato.
    const doc = construirCorteZ(
      { ...corteBase, cierre: null },
      { configuracion: config },
    );
    const cierre = doc.meta.find((m) => m.etiqueta === 'Cierre');
    expect(cierre.valor).toBe('En curso');
  });

  it('NO abre el cajón', () => {
    // Al cerrar, el cajón lo abre quien cuenta. Un corte no mueve dinero: sólo
    // cuenta el que ya está.
    expect(
      construirCorteZ(corteBase, { configuracion: config }).abrirCajon,
    ).toBe(false);
  });

  it('dos cortes seguidos del mismo turno llevan ids distintos', () => {
    // LA PRUEBA QUE IMPORTA. `hub/cola.rs` descarta por id ya impreso SIN dar
    // error, así que un id estable haría que el segundo papel —el del dueño,
    // después del de la libreta— no saliera y nadie se enterara. Este documento
    // se reimprime a propósito; la comanda hace lo contrario y también por
    // buenas razones.
    const a = construirCorteZ(corteBase, { configuracion: config });
    const b = construirCorteZ(corteBase, { configuracion: config });
    expect(a.id).not.toBe(b.id);
  });

  it('sin corte, no hay documento', () => {
    expect(construirCorteZ(null)).toBeNull();
  });
});

describe('construirValePropina — el papel que se firma', () => {
  const vale = {
    mesero: 'Ana',
    desde: '2026-07-01',
    hasta: '2026-07-28',
    monto: 640,
    impreso: '2026-07-28T23:40:00.000Z',
  };

  it('el importe es lo enfatizado y va formateado', () => {
    const doc = construirValePropina(vale, { configuracion: config });
    expect(doc.totales).toHaveLength(1);
    expect(doc.totales[0].etiqueta).toBe('IMPORTE');
    expect(doc.totales[0].valor).toBe(money(640));
    expect(doc.totales[0].enfasis).toBe(true);
  });

  it('lleva la línea de firma con aire delante', () => {
    // La firma no es adorno: es lo que convierte este papel en comprobante. Y
    // una raya pegada al importe no se puede firmar en una tira de 58 mm, de
    // ahí las dos líneas vacías.
    const doc = construirValePropina(vale, { configuracion: config });
    expect(doc.pie[doc.pie.length - 1]).toMatch(/^Firma: _+$/);
    expect(doc.pie.slice(-3, -1)).toEqual(['', '']);
  });

  it('lleva el importe con letra, como cualquier comprobante de dinero', () => {
    const doc = construirValePropina(vale, { configuracion: config });
    expect(doc.pie[0]).toMatch(/^SON: .+/);
  });

  it('dice a nombre de quién y de qué periodo', () => {
    const doc = construirValePropina(vale, { configuracion: config });
    const meta = Object.fromEntries(doc.meta.map((m) => [m.etiqueta, m.valor]));
    expect(meta['A nombre de']).toBe('Ana');
    expect(meta['Periodo']).toBe('2026-07-01 a 2026-07-28');
  });

  it('no abre el cajón y no hay cuerpo que imprimir', () => {
    const doc = construirValePropina(vale, { configuracion: config });
    expect(doc.abrirCajon).toBe(false);
    expect(doc.cuerpo).toEqual([]);
  });

  it('dos vales iguales llevan ids distintos', () => {
    // Mismo motivo que el corte: se reimprime a propósito.
    const a = construirValePropina(vale, { configuracion: config });
    const b = construirValePropina(vale, { configuracion: config });
    expect(a.id).not.toBe(b.id);
  });

  it('sin vale, no hay documento', () => {
    expect(construirValePropina(null)).toBeNull();
  });
});
