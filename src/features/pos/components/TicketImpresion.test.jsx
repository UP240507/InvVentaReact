// Ticket en pantalla. Dos cosas se fijan aquí:
//
//  1. Que pinta el MISMO documento que va a la impresora térmica. Antes esta
//     pantalla rehacía los cálculos por su cuenta y ya divergía del papel: la
//     fila de Descuento no salía y el IVA decía "(16%)" escrito a mano.
//
//  2. Que la marca sale, con cualquier configuración. Es una decisión de
//     producto, no de maquetado: ningún plan puede quitarla.
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

// Explícito aunque `vitest.config.js` traiga `globals: true` y testing-library
// limpie sola: varias de estas pruebas montan y desmontan dentro de un bucle, y
// prefiero que la limpieza esté a la vista en el fichero que depende de ella.
afterEach(cleanup);

const h = vi.hoisted(() => ({ app: { configuracion: {} } }));

vi.mock('../../../store/useAppStore', () => ({
  useAppStore: Object.assign(() => h.app, { getState: () => h.app }),
}));

import TicketImpresion from './TicketImpresion';
import { MARCA } from '../../../lib/Comanda';

const venta = {
  id: 1,
  folio: 'POS-00147',
  fecha: '2026-08-05T20:15:00.000Z',
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

const pintar = (config = {}, v = venta) => {
  h.app.configuracion = config;
  return render(<TicketImpresion venta={v} onClose={() => {}} />);
};

describe('la marca del pie', () => {
  it('sale en el ticket', () => {
    pintar({ nombre_empresa: 'AZUL' });
    expect(screen.getByTestId('marca').textContent).toBe(MARCA);
  });

  it('sale aunque no haya configuración de ningún tipo', () => {
    pintar({});
    expect(screen.getByTestId('marca').textContent).toBe(MARCA);
  });

  it('NINGUNA clave de configuración la quita', () => {
    // Se prueban los nombres que tendría una bandera de plan si alguien
    // decidiera añadirla. La marca no consulta `configuracion`, así que
    // ninguna de éstas puede hacer nada — y esta prueba es la que se rompería
    // si alguien las cableara en el futuro.
    for (const clave of [
      'plan',
      'sin_marca',
      'marca_blanca',
      'ocultar_marca',
      'premium',
      'whitelabel',
    ]) {
      const { unmount } = pintar({
        nombre_empresa: 'AZUL',
        [clave]: true,
      });
      expect(
        screen.getByTestId('marca').textContent,
        `configuracion.${clave}`,
      ).toBe(MARCA);
      unmount();
    }
  });
});

describe('pantalla y papel no divergen', () => {
  it('muestra el descuento total, que la versión anterior se comía', () => {
    // El 12-ago bajó del bloque de totales al desglose del pie (formato AZUL).
    // Lo que se afirma sigue siendo lo mismo —que el descuento SE VE— y por eso
    // la prueba se mueve con él en vez de borrarse: la razón de existir era que
    // una versión anterior se lo comía.
    pintar({ nombre_empresa: 'AZUL' });
    // Se afirma sobre la MISMA línea. Buscar `$4.50` suelto encontraría también
    // el descuento de la línea de producto («−10% (−$4.50)») y la consulta
    // fallaría por ambigüedad, no por ausencia.
    expect(screen.getByText(/DESC:/).textContent).toContain('$4.50');
  });

  it('el IVA no lleva una tasa escrita a mano', () => {
    // Decía "IVA (16%)" fijo. Un restaurante en frontera con 8% habría
    // impreso una tasa falsa junto a un importe correcto.
    pintar({ nombre_empresa: 'AZUL' });
    expect(screen.getByText(/IVA:/)).toBeTruthy();
    expect(screen.queryByText(/16%/)).toBeNull();
  });

  it('el desglose fiscal va en una sola línea, como en el papel', () => {
    // Es la prueba de que pantalla y papel no divergieron al cambiar el
    // maquetado: el componente lee los mismos `totales` y `pie` que
    // `construirTicket` produce para la impresora.
    pintar({ nombre_empresa: 'AZUL' });
    const linea = screen.getByText(/SUBTOTAL:/);
    expect(linea.textContent).toContain('IVA:');
  });

  it('el importe de línea es el NETO, no el precio de lista', () => {
    pintar({ nombre_empresa: 'AZUL' });
    expect(screen.getByText('$40.50')).toBeTruthy();
  });

  it('recibido y cambio salen como filas de dinero', () => {
    pintar({ nombre_empresa: 'AZUL' });
    expect(screen.getByText('Recibido:')).toBeTruthy();
    expect(screen.getByText('Cambio:')).toBeTruthy();
  });

  it('un ticket normal no lleva banda de reimpresión', () => {
    // La banda existe en el maquetado y se pinta desde `doc.avisos`. Aquí se
    // comprueba que no aparece cuando no toca: una banda de "REIMPRESIÓN" en
    // el ticket original haría dudar al cliente de que su cuenta se cobró una
    // sola vez.
    pintar({ nombre_empresa: 'AZUL' });
    expect(screen.queryByText(/REIMPRESIÓN/)).toBeNull();
  });

  it('sin venta no pinta nada, en vez de reventar', () => {
    const { container } = render(
      <TicketImpresion venta={null} onClose={() => {}} />,
    );
    expect(container.firstChild).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('los datos del emisor en pantalla', () => {
  // Pantalla y papel tienen que enseñar el MISMO documento. Es la regla que se
  // arregló el 5-ago, cuando este componente rehacía los cálculos por su cuenta
  // y ya divergía del papel: no mostraba la fila de Descuento y escribía el IVA
  // a mano. Al subir los datos fiscales de `pie` a `emisor` (6-ago), no pintar
  // el campo nuevo habría vuelto a abrir esa brecha, sólo que al revés.
  const config = {
    nombre_empresa: 'AZUL',
    razon_social: 'ALBERTO DE JESUS CHAVEZ FERNANDEZ',
    rfc: 'XAXX010101000',
    direccion: 'Centro, Aguascalientes',
    telefono: '449 915 7059',
  };

  it('pinta razón social, RFC, domicilio y teléfono', () => {
    pintar(config);
    expect(screen.getByText('ALBERTO DE JESUS CHAVEZ FERNANDEZ')).toBeTruthy();
    expect(screen.getByText('RFC: XAXX010101000')).toBeTruthy();
    expect(screen.getByText('Centro, Aguascalientes')).toBeTruthy();
    expect(screen.getByText('Tel: 449 915 7059')).toBeTruthy();
  });

  it('el encabezado lleva el nombre del LOCAL, no el de la marca', () => {
    // El fallo de fondo: `construirTicket` leía un campo inexistente y caía a
    // 'InvVenta', así que el ticket llevaba el nombre del proveedor del
    // software en el sitio del emisor.
    pintar(config);
    expect(screen.getByRole('heading', { name: 'AZUL' })).toBeTruthy();
  });

  it('sin configuración no inventa datos fiscales', () => {
    pintar({});
    expect(screen.queryByText(/RFC:/)).toBeNull();
    expect(screen.queryByText(/^Tel:/)).toBeNull();
  });
});
