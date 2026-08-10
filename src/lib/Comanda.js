/**
 * Comanda.js — construcción de DOCUMENTOS DE IMPRESIÓN.
 *
 * Este módulo decide QUÉ se imprime. El hub (Rust) decide CÓMO se pinta.
 * La frontera entre los dos es el "documento semántico" que se describe abajo,
 * y está puesta a propósito en este punto:
 *
 *  - El hub no sabe de recetas, ni de zonas, ni de descuentos. Recibe líneas
 *    ya resueltas y las convierte en bytes ESC/POS. Un cambio en las reglas de
 *    negocio no obliga a recompilar el binario de la caja.
 *
 *  - EL HUB NO HACE ARITMÉTICA. Todos los importes viajan ya formateados como
 *    texto. Si el hub sumara o redondeara, habría dos motores de dinero en el
 *    sistema y tarde o temprano el ticket impreso diría algo distinto del
 *    ticket en pantalla. `lib/Fiscal.js` es el único que calcula.
 *
 *  - Un teléfono de mesero produce exactamente el mismo documento que la caja.
 *    El móvil nunca habla ESC/POS ni conoce la impresora: manda JSON al hub.
 *
 * FORMA DEL DOCUMENTO
 * -------------------
 * {
 *   id:        string   — identidad lógica de la impresión (ver idempotencia)
 *   tipo:      'comanda' | 'ticket' | 'precuenta' | 'prueba'
 *   zona:      string|null — estación destino; null para el ticket de cobro
 *   titulo:    string
 *   subtitulo: string
 *   meta:      [{ etiqueta, valor }]  — folio, mesa, hora, mesero...
 *   avisos:    [string]               — banda destacada (p. ej. REIMPRESIÓN)
 *   cuerpo:    [{ cantidad, nombre, nota, importe, sublineas: [string] }]
 *   totales:   [{ etiqueta, valor, enfasis: boolean }]
 *   pie:       [string]
 *   abrirCajon: boolean
 *   copias:    number
 * }
 *
 * IDEMPOTENCIA Y REIMPRESIÓN
 * --------------------------
 * El `id` es estable para una misma impresión lógica, de modo que si la red
 * LAN duplica el POST el hub descarta el segundo. Pero una REIMPRESIÓN debe
 * salir sí o sí —el papel se atascó, la tira se cortó—, así que lleva su
 * propio sufijo de copia Y un aviso impreso. Sin ese aviso, cocina ve dos
 * comandas iguales y prepara el platillo dos veces: el duplicado silencioso
 * cuesta comida, no papel.
 */

import { importeDeLinea } from './Fiscal';
import { etiquetaDescuento } from './Descuentos';
import { aISOLocal } from './Fechas';
import { importeEnLetra } from './Letras';

/**
 * Marca que se estampa al pie del ticket de cobro.
 *
 * NO forma parte del documento: no viaja dentro del JSON que se manda al hub.
 * Es propiedad de *renderizar un ticket*, y cada renderizador la estampa por su
 * cuenta —éste para pantalla y navegador, `escpos.rs` para la térmica—. La
 * diferencia importa: un dato dentro del documento se puede quitar con un `if`
 * por plan o con un cliente modificado que arme su propio JSON; una línea que
 * el renderizador escribe siempre, no.
 *
 * En la impresora térmica la garantía es dura: habría que recompilar el binario
 * de la caja. Aquí, en JavaScript, la garantía es más blanda por naturaleza
 * —el bundle es editable— y lo que se puede asegurar es que no hay ninguna
 * condición que consultar: no depende de `configuracion`, ni de plan, ni de
 * tenant, y una prueba lo fija.
 *
 * Dice solo el nombre a propósito. Un eslogan en el papel de un comensal es
 * publicidad de alguien que no le vendió nada; el nombre suelto es una pregunta.
 */
export const MARCA = 'InvVenta';

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/**
 * Contador para los documentos que DEBEN salir siempre, aunque se pidan dos
 * veces seguidas.
 *
 * `Date.now()` no sirve solo: el reloj tiene resolución de milisegundo y dos
 * pulsaciones seguidas del mismo botón caen en el mismo. El hub descarta por
 * `id` repetido —que es lo que protege a cocina de preparar dos veces— así que
 * un id que se repite significa un papel que no sale, y el caso en que se pulsa
 * dos veces rápido es exactamente «se atascó el papel, dale otra vez».
 *
 * Es la misma lección que el folio: un reloj no es un identificador. Aquí basta
 * con un contador de proceso porque el id sólo tiene que ser único frente al
 * caché del hub, no entre dispositivos ni entre sesiones.
 */
let secuenciaImpresion = 0;

/**
 * Nombre comercial del local, para la cabecera.
 *
 * ── EL FALLO QUE HABÍA AQUÍ ─────────────────────────────────────────────────
 * Esto leía `configuracion.nombre_restaurante`, **y ese campo no existe**. La
 * columna se llama `nombre_empresa`, es lo que escribe la pantalla de
 * Configuración y lo que lee el sidebar; sólo este módulo pedía el otro nombre.
 * Así que el valor era siempre `undefined` y caía al respaldo… que era
 * `'InvVenta'`.
 *
 * Resultado: **todos los tickets impresos han llevado el nombre del proveedor
 * del software en el sitio del emisor**, y `_restaurante` ha ido siempre vacío.
 * Nadie lo notó porque no falla nada: el papel sale, sólo dice algo que no es.
 *
 * El respaldo ya no puede ser la marca. En el hueco del emisor va el emisor o
 * un aviso de que falta configurarlo — nunca quien vendió el software. Se usa
 * el mismo texto que ya emplean Configuración y el sidebar, para que un local
 * a medio configurar diga lo mismo en los tres sitios.
 */
export function nombreDelLocal(configuracion) {
  return (configuracion?.nombre_empresa || '').trim() || 'MI RESTAURANTE';
}

/**
 * Los datos fiscales del EMISOR, en el orden en que se leen en un comprobante
 * mexicano: quién factura, con qué RFC, desde dónde y a qué teléfono.
 *
 * Van ARRIBA, bajo el nombre comercial. El RFC estuvo al pie hasta el 6-ago y
 * ése era el sitio equivocado: allí abajo, entre el «gracias por su visita» y
 * la advertencia de que no es comprobante fiscal, parecía una nota más. El
 * emisor se identifica en la cabecera porque es quien expide el documento.
 *
 * Los datos que falten no dejan hueco: se filtran aquí y el renderizador
 * además los vuelve a saltar. Un local sin RFC capturado no debe imprimir un
 * renglón en blanco en mitad de su encabezado.
 *
 * `razon_social` es el nombre FISCAL —persona física o moral— y es distinto del
 * comercial: en el ticket de referencia son «AZUL RESTAURANTE» y «ALBERTO DE
 * JESUS CHAVEZ FERNANDEZ». Si no está capturado, se omite en vez de repetir el
 * comercial, que sería afirmar un dato fiscal que nadie ha dicho.
 */
export function datosDelEmisor(configuracion) {
  const c = configuracion || {};
  return [
    (c.razon_social || '').trim(),
    c.rfc ? `RFC: ${String(c.rfc).trim()}` : '',
    (c.direccion || '').trim(),
    c.telefono ? `Tel: ${String(c.telefono).trim()}` : '',
  ].filter(Boolean);
}

/** Dinero como texto. Vive aquí porque el hub no formatea ni redondea. */
export function money(v) {
  return `$${num(v).toLocaleString('es-MX', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/**
 * Sufijo de copia para el id. La copia 1 no lleva sufijo: así el id de la
 * impresión normal es el mismo que se generaría sin pensar en reimpresiones,
 * y no hay dos formas de nombrar la misma cosa.
 */
function sufijoCopia(copia) {
  const c = Math.max(1, Math.trunc(num(copia)) || 1);
  return c > 1 ? `::c${c}` : '';
}

function avisosDeCopia(copia) {
  const c = Math.max(1, Math.trunc(num(copia)) || 1);
  return c > 1 ? [`REIMPRESIÓN (copia ${c}) — NO PREPARAR DE NUEVO`] : [];
}

/**
 * Hora del reloj de pared, en local, 'HH:MM'. No vive en lib/Fechas a
 * propósito: ese módulo trata la fecha de CALENDARIO —a qué día de trabajo
 * pertenece algo—, que es justamente lo que no tiene hora. Meter aquí el
 * reloj volvería a mezclar los dos conceptos que ese módulo separó.
 */
function horaDe(iso) {
  if (!iso) return '';
  const d = iso instanceof Date ? iso : new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/**
 * Fecha impresa. Va por `aISOLocal` y NO por `iso.slice(0, 10)`: el segundo
 * lee la fecha en UTC, y a partir de las 18:00 de México imprimiría el día
 * siguiente. Es el mismo fallo que se corrigió en 9 sitios el 27-jul; en un
 * ticket sería peor, porque el papel ya se lo llevó el cliente.
 */
function fechaDe(iso) {
  return aISOLocal(iso ? new Date(iso) : new Date()) || '';
}

/**
 * Agrupa los items de una comanda por su `destino` y devuelve un documento por
 * estación. El enrutamiento NO se recalcula aquí: `construirItemsComanda`
 * (lib/Inventario) ya resolvió `destino` para cada línea, incluidos los
 * componentes de un paquete, que pueden ir a estaciones distintas. Duplicar esa
 * decisión sería tener dos verdades sobre a dónde va un platillo.
 *
 * Una estación sin items no genera documento: no se imprime papel en blanco en
 * la barra porque el pedido era solo de cocina.
 *
 * @param {Object} comanda  fila de `comandas` tal como la arma el POS
 * @param {Object} opciones { configuracion, copia }
 * @returns {Array} documentos, uno por zona, ordenados por nombre de zona
 */
export function construirComandas(
  comanda,
  { configuracion = {}, copia = 1 } = {},
) {
  if (!comanda) return [];

  const items = Array.isArray(comanda.items) ? comanda.items : [];
  const porZona = new Map();

  for (const item of items) {
    const cantidad = num(item?.cantidad);
    if (cantidad <= 0) continue;
    const zona = (item?.destino || 'Cocina').trim() || 'Cocina';
    if (!porZona.has(zona)) porZona.set(zona, []);
    porZona.get(zona).push({
      cantidad: String(cantidad),
      nombre: item?.nombre || 'Producto',
      nota: item?.nota || '',
      // Sin `importe` NUNCA. La comanda de cocina no lleva precios, y eso se
      // garantiza por construcción: no hay una bandera que alguien pueda
      // encender por error, simplemente no existe el campo.
      importe: '',
      sublineas: [],
    });
  }

  const zonas = [...porZona.keys()].sort();
  const mesa = comanda?.mesa || 'Mostrador';

  return zonas.map((zona) => ({
    id: `comanda::${comanda.id}::${zona}${sufijoCopia(copia)}`,
    tipo: 'comanda',
    zona,
    titulo: zona.toUpperCase(),
    subtitulo: mesa,
    meta: [
      { etiqueta: 'Folio', valor: String(comanda.folio || comanda.id || '') },
      { etiqueta: 'Mesero', valor: comanda.mesero || 'Sistema' },
      { etiqueta: 'Hora', valor: horaDe(comanda.fecha_hora) },
    ],
    avisos: avisosDeCopia(copia),
    cuerpo: porZona.get(zona),
    totales: [],
    pie: [],
    // Cocina no cobra: el cajón no se abre desde una comanda.
    abrirCajon: false,
    copias: 1,
    _restaurante: nombreDelLocal(configuracion),
  }));
}

/**
 * Ticket de cobro. Muestra el NETO por línea y, debajo, el descuento concedido:
 * un cliente que ve el precio de lista sin su descuento reclama en la mesa.
 * Es la misma regla que ya aplica `TicketImpresion` en pantalla — de ahí que
 * ambos usen `importeDeLinea`, para que papel y pantalla no puedan divergir.
 *
 * @param {Object} venta    fila de `ventas` (+ campos visuales del POS)
 * @param {Object} opciones { configuracion, copia, abrirCajon }
 */
export function construirTicket(
  venta,
  { configuracion = {}, copia = 1, abrirCajon = null } = {},
) {
  if (!venta) return null;

  const items = Array.isArray(venta.items) ? venta.items : [];
  const cuerpo = [];

  for (const item of items) {
    const cantidad = num(item?.cantidad);
    if (cantidad <= 0) continue;

    const linea = importeDeLinea(item);
    const sublineas = [];

    // Los componentes de un paquete se listan: el cliente pagó "Desayuno
    // completo" y tiene derecho a ver qué incluía.
    const componentes = (item?.componentes || []).filter(
      (c) => c?.recetaId != null,
    );
    for (const c of componentes) {
      sublineas.push(`  ${num(c.cantidad) || 1}x ${c.nombre || ''}`.trimEnd());
    }

    if (linea.descuento > 0) {
      sublineas.push(
        `  ${etiquetaDescuento(item.descuento)} (−${money(linea.descuento)})`,
      );
    }

    cuerpo.push({
      cantidad: String(cantidad),
      nombre: item?.nombre || 'Producto',
      nota: '',
      importe: money(linea.neto),
      sublineas,
    });
  }

  const totales = [
    { etiqueta: 'Subtotal', valor: money(venta.subtotal), enfasis: false },
  ];

  if (num(venta.descuento) > 0) {
    totales.push({
      etiqueta: 'Descuento',
      valor: `−${money(venta.descuento)}`,
      enfasis: false,
    });
  }

  totales.push({ etiqueta: 'IVA', valor: money(venta.iva), enfasis: false });

  if (num(venta.propina) > 0) {
    totales.push({
      etiqueta: 'Propina',
      valor: money(venta.propina),
      enfasis: false,
    });
  }

  totales.push({ etiqueta: 'TOTAL', valor: money(venta.total), enfasis: true });

  const metodo = String(venta.metodo_pago || 'efectivo');

  // Lo recibido y el cambio son DINERO, y el dinero va en la columna del
  // dinero. Antes viajaban como una frase suelta en el pie —"Recibido: $X
  // Cambio: $Y"— y con un billete de $1,200 esa línea pasaba de 32 columnas y
  // se partía en dos justo por donde el cliente comprueba que no le robaron.
  // Como filas de total, la impresora las alinea a la derecha y nunca se parten.
  if (metodo === 'efectivo') {
    totales.push({
      etiqueta: 'Recibido',
      valor: money(venta.efectivo),
      enfasis: false,
    });
    totales.push({
      etiqueta: 'Cambio',
      valor: money(venta.cambio_entregado),
      enfasis: false,
    });
  }

  const pie = [`Pago: ${metodo.toUpperCase()}`];

  pie.push('');
  pie.push('¡GRACIAS POR SU VISITA!');
  // Se dice explícitamente porque el timbrado no existe todavía. Un ticket que
  // parece factura y no lo es genera un reclamo en la mesa siguiente. Cabe en
  // 32 columnas a propósito: una advertencia partida en dos renglones se lee
  // como letra chica, y esta advertencia conviene que se lea.
  pie.push('Este no es comprobante fiscal.');

  const meta = [
    { etiqueta: 'Folio', valor: String(venta.folio || '') },
    { etiqueta: 'Fecha', valor: fechaDe(venta.fecha) },
    { etiqueta: 'Hora', valor: horaDe(venta.fecha) },
    { etiqueta: 'Atendió', valor: venta.usuario || 'Cajero' },
    { etiqueta: 'Mesa', valor: venta.mesa_nombre || 'Mostrador' },
  ];

  return {
    id: `ticket::${venta.id ?? venta.folio}${sufijoCopia(copia)}`,
    tipo: 'ticket',
    zona: null,
    titulo: nombreDelLocal(configuracion),
    subtitulo: '',
    emisor: datosDelEmisor(configuracion),
    meta,
    avisos: avisosDeCopia(copia),
    cuerpo,
    totales,
    pie,
    // El cajón se abre solo si entró efectivo. Abrirlo en una venta con tarjeta
    // deja dinero expuesto sin razón, y en un turno largo eso se nota.
    abrirCajon:
      abrirCajon === null
        ? metodo === 'efectivo' || metodo === 'mixto'
        : !!abrirCajon,
    copias: 1,
    _restaurante: nombreDelLocal(configuracion),
  };
}

/**
 * PRE-CUENTA — el papel que se deja en la mesa antes de cobrar.
 *
 * ── POR QUÉ ES UN DOCUMENTO APARTE Y NO UN TICKET SIN PAGO ──────────────────
 * Son dos papeles con dos trabajos distintos, y confundirlos se nota en la
 * mesa:
 *
 *   · El TICKET es el comprobante de que ya pagaste. Lleva método de pago, lo
 *     recibido y el cambio, y abre el cajón porque entró dinero.
 *   · La PRE-CUENTA es una propuesta: «esto es lo que llevas». No lleva pago
 *     porque todavía no lo hay, no abre el cajón porque no ha entrado nada, y
 *     **dice que la propina no está incluida** — que es su razón de existir,
 *     porque es el papel con el que el cliente decide cuánto deja.
 *
 * Un ticket al que se le quitan los campos de pago sigue pareciendo un
 * comprobante, y un cliente que recibe algo con pinta de comprobante da por
 * hecho que ya está cobrado.
 *
 * ── NO LLEVA FOLIO, Y ES DELIBERADO ─────────────────────────────────────────
 * Una pre-cuenta se reimprime: el cliente la pide, luego pide un postre, y la
 * pide otra vez. Si consumiera folios de venta, la serie de ventas saldría
 * llena de huecos —y un hueco en una serie de ventas es la señal que un auditor
 * busca—. Si consumiera folios de una serie propia, los huecos de esa serie no
 * significarían nada y el número invitaría a tratar el papel como documento
 * numerado, que no lo es.
 *
 * Se identifica con lo que de verdad la identifica: mesa, hora y mesero. El
 * número aparece cuando hay venta, en el ticket.
 *
 * ── SE REIMPRIME SIEMPRE ────────────────────────────────────────────────────
 * El `id` lleva el instante, así que el hub no la descarta por repetida. Es lo
 * contrario que la comanda de cocina, donde un duplicado silencioso cuesta un
 * platillo: aquí un duplicado cuesta papel, y no imprimirla cuando el cliente
 * la pide cuesta un mesero volviendo a la caja.
 *
 * @param {Object} cuenta   { items, subtotal, iva, descuento, total,
 *                            mesa_nombre, comensales, usuario, fecha }
 * @param {Object} opciones { configuracion }
 */
export function construirPreCuenta(cuenta, { configuracion = {} } = {}) {
  if (!cuenta) return null;

  const items = Array.isArray(cuenta.items) ? cuenta.items : [];
  const cuerpo = [];

  for (const item of items) {
    const cantidad = num(item?.cantidad);
    if (cantidad <= 0) continue;

    const linea = importeDeLinea(item);
    const sublineas = [];

    const componentes = (item?.componentes || []).filter(
      (c) => c?.recetaId != null,
    );
    for (const c of componentes) {
      sublineas.push(`  ${num(c.cantidad) || 1}x ${c.nombre || ''}`.trimEnd());
    }

    if (linea.descuento > 0) {
      sublineas.push(
        `  ${etiquetaDescuento(item.descuento)} (−${money(linea.descuento)})`,
      );
    }

    cuerpo.push({
      cantidad: String(cantidad),
      nombre: item?.nombre || 'Producto',
      nota: '',
      importe: money(linea.neto),
      sublineas,
    });
  }

  const totales = [
    { etiqueta: 'Subtotal', valor: money(cuenta.subtotal), enfasis: false },
  ];

  if (num(cuenta.descuento) > 0) {
    totales.push({
      etiqueta: 'Descuento',
      valor: `−${money(cuenta.descuento)}`,
      enfasis: false,
    });
  }

  totales.push({ etiqueta: 'IVA', valor: money(cuenta.iva), enfasis: false });
  totales.push({
    etiqueta: 'TOTAL',
    valor: money(cuenta.total),
    enfasis: true,
  });

  // Nada de Propina, Recibido ni Cambio: no hay pago todavía. Ver arriba.

  const meta = [{ etiqueta: 'Mesa', valor: cuenta.mesa_nombre || 'Mostrador' }];
  if (num(cuenta.comensales) > 0) {
    meta.push({ etiqueta: 'Personas', valor: String(num(cuenta.comensales)) });
  }
  meta.push({ etiqueta: 'Atendió', valor: cuenta.usuario || 'Mesero' });
  meta.push({ etiqueta: 'Fecha', valor: fechaDe(cuenta.fecha) });
  meta.push({ etiqueta: 'Hora', valor: horaDe(cuenta.fecha) });

  const pie = [];

  // El importe en letra va PRIMERO, pegado a los totales: es la línea que
  // impide alterar la cifra a mano, y separada del total no protege nada.
  pie.push(`SON: ${importeEnLetra(cuenta.total)}`);
  pie.push('');
  // Las dos advertencias que hacen que este papel se lea como lo que es.
  pie.push('PROPINA NO INCLUIDA');
  pie.push('Este no es comprobante fiscal.');

  return {
    // El instante Y un contador: una pre-cuenta pedida dos veces se imprime dos
    // veces, incluso si las dos pulsaciones caen en el mismo milisegundo. La
    // comanda de cocina hace lo contrario y por buenas razones.
    id: `precuenta::${cuenta.mesa_id ?? cuenta.mesa_nombre ?? 's-n'}::${Date.now()}-${++secuenciaImpresion}`,
    tipo: 'precuenta',
    zona: null,
    titulo: nombreDelLocal(configuracion),
    subtitulo: '',
    emisor: datosDelEmisor(configuracion),
    meta,
    avisos: ['CUENTA — NO ES PAGO'],
    cuerpo,
    totales,
    pie,
    // No ha entrado dinero. Abrir el cajón aquí lo dejaría expuesto cada vez
    // que una mesa pide la cuenta, que es varias veces por turno y por mesa.
    abrirCajon: false,
    copias: 1,
    _restaurante: nombreDelLocal(configuracion),
  };
}

/**
 * Documento de prueba para la pantalla de diagnóstico. Ejercita todo lo que
 * puede salir mal en el render: acentos y ñ (tabla de caracteres), una línea
 * larga que obliga a cortar palabra, alineación de importes a la derecha,
 * corte de papel y apertura de cajón.
 */
export function documentoDePrueba({ configuracion = {} } = {}) {
  return {
    id: `prueba::${Date.now()}`,
    tipo: 'prueba',
    zona: null,
    titulo: nombreDelLocal(configuracion),
    subtitulo: 'Impresión de prueba',
    meta: [{ etiqueta: 'Hora', valor: horaDe(new Date().toISOString()) }],
    avisos: [],
    cuerpo: [
      {
        cantidad: '1',
        nombre: 'Ñoquis con jalapeño y crème fraîche al horno',
        nota: 'sin cebolla, término medio',
        importe: money(1234.5),
        sublineas: ['  −10% (−$137.17)'],
      },
      {
        cantidad: '12',
        nombre: 'Café',
        nota: '',
        importe: money(45),
        sublineas: [],
      },
    ],
    totales: [
      { etiqueta: 'Subtotal', valor: money(1279.5), enfasis: false },
      { etiqueta: 'TOTAL', valor: money(1483.62), enfasis: true },
    ],
    pie: ['Si lees esto completo y derecho, la impresora está lista.'],
    abrirCajon: false,
    copias: 1,
    _restaurante: nombreDelLocal(configuracion),
  };
}
