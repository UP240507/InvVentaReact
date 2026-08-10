// scripts/ver-papel.mjs
//
// Arma un documento con los constructores REALES y lo escupe como JSON, para
// que `scripts/ver-papel.sh` se lo pase al renderizador ESC/POS de Rust y
// enseñe cómo va a salir el papel.
//
// ── POR QUÉ EXISTE ──────────────────────────────────────────────────────────
// Hasta ahora la única forma de ver un ticket antes de imprimirlo era la
// pantalla de Ajustes → Hub, que sólo previsualiza `documentoDePrueba`. Para
// mirar una pre-cuenta o un ticket de cobro había que cobrar de verdad, con la
// caja abierta, y gastar papel — o creerse la vista de pantalla, que es OTRO
// renderizador y por tanto no prueba el que importa.
//
// Aquí se usan los constructores de verdad. Si `construirPreCuenta` cambia, lo
// que sale por aquí cambia con él; no hay una copia del formato que mantener.

import {
  construirTicket,
  construirPreCuenta,
  construirComandas,
  documentoDePrueba,
} from '../src/lib/Comanda.js';

// Calcado del ticket de referencia, incluida la separación entre el nombre
// COMERCIAL y el FISCAL — que es justo lo que faltaba poder representar.
const CONFIG = {
  nombre_empresa: 'AZUL RESTAURANTE',
  razon_social: 'ALBERTO DE JESUS CHAVEZ FERNANDEZ',
  rfc: 'CAFA841129WA1',
  direccion: 'Madero 616, La Purísima, Aguascalientes, México, CP 20259',
  telefono: '449 915 7059',
};

// Datos calcados del ticket de referencia que trajo Chris (Soft Restaurant
// V10, 6-ago). Sirven de patrón: si el nuestro sale con la misma información
// legible en las mismas 32 columnas, el formato aguanta un caso real.
const CUENTA = {
  items: [
    { id: '1', nombre: 'Pieza pan dulce', cantidad: 2, precio: 14 },
    { id: '2', nombre: 'Café de olla', cantidad: 3, precio: 44 },
    { id: '3', nombre: 'Mestizos', cantidad: 1, precio: 110 },
    { id: '4', nombre: 'Chilaquiles con arrachera', cantidad: 1, precio: 155 },
    { id: '5', nombre: 'Aporreados Azul', cantidad: 1, precio: 142 },
  ],
  subtotal: 488.79,
  iva: 78.21,
  descuento: 0,
  total: 567,
  mesa_id: 'm9',
  mesa_nombre: 'Mesa 9',
  comensales: 3,
  usuario: 'Sairi',
  fecha: new Date().toISOString(),
};

const VENTA = {
  ...CUENTA,
  id: 'v-demo',
  folio: 'AZUL7K-V-000123',
  propina: 85,
  total: 652,
  metodo_pago: 'efectivo',
  efectivo: 700,
  cambio_entregado: 48,
};

const COMANDA = {
  id: 'c-demo',
  folio: 'AZUL7K-C-000045',
  mesa: 'Mesa 9',
  mesero: 'Sairi',
  fecha_hora: new Date().toISOString(),
  items: CUENTA.items.map((i) => ({ ...i, destino: 'Cocina' })),
};

const QUE = (process.argv[2] || 'precuenta').toLowerCase();

const DOCS = {
  precuenta: () => construirPreCuenta(CUENTA, { configuracion: CONFIG }),
  ticket: () => construirTicket(VENTA, { configuracion: CONFIG }),
  copia: () => construirTicket(VENTA, { configuracion: CONFIG, copia: 2 }),
  comanda: () => construirComandas(COMANDA, { configuracion: CONFIG })[0],
  prueba: () => documentoDePrueba({ configuracion: CONFIG }),
};

if (!DOCS[QUE]) {
  console.error(`Documento desconocido: ${QUE}`);
  console.error(`Opciones: ${Object.keys(DOCS).join(', ')}`);
  process.exit(2);
}

const doc = DOCS[QUE]();
if (!doc) {
  console.error(`El constructor de "${QUE}" devolvió null.`);
  process.exit(1);
}

// El hub espera camelCase en `abrirCajon`; el `Documento` de Rust lo recibe con
// `#[serde(rename_all = "camelCase")]`. Se manda tal cual sale del constructor:
// cualquier traducción aquí sería una tercera versión del formato.
process.stdout.write(JSON.stringify(doc));
