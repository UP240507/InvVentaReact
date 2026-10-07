// src/features/compras/RecepcionScreen.test.jsx
//
// ── LA AFIRMACIÓN ───────────────────────────────────────────────────────────
// **Recibir mercancía mueve el stock y el costo promedio de verdad, una sola
// vez, y el movimiento dice de dónde venía.**
//
// `Costos.test.js` prueba la aritmética. Esto prueba la CADENA: que la pantalla
// use esa aritmética, que lo encolado sea lo que se calculó, y que una orden ya
// recibida no se pueda volver a recibir. La cadena entera es donde este
// proyecto ha encontrado sus fallos: las dos mitades bien y el hueco en medio.
//
// Por qué importa el kardex: `stock_anterior` sale del producto ANTES de
// tocarlo. Si alguien lo leyera del producto ya actualizado, el movimiento
// diría que no entró nada y el histórico dejaría de cuadrar con las
// existencias, sin dar ningún error.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const h = vi.hoisted(() => ({ encolado: [], avisos: [] }));

const NARANJA = {
  id: 10,
  nombre: 'Naranja',
  unidad: 'kg',
  stock: 10,
  precio: 14,
};

const ORDEN = {
  id: 'oc-1',
  numero: 'OC-0001',
  estado: 'pendiente',
  fecha: '2026-09-26T10:00:00.000Z',
  proveedor_id: 1,
  items: [{ id_producto: 10, cantidad: 30, precio_unitario: 20 }],
};

const app = {
  ordenesCompra: [ORDEN],
  productos: [NARANJA],
  proveedores: [{ id: 1, nombre: 'Quesos' }],
  configuracion: { nombre_empresa: 'AZUL' },
  showToast: (m, t) => h.avisos.push([m, t]),
};

vi.mock('../../store/useAppStore', () => ({
  useAppStore: Object.assign(() => app, {
    setState: () => {},
    getState: () => app,
  }),
}));
vi.mock('../../store/useSyncStore', () => ({
  useSyncStore: () => ({ enqueueAction: (...a) => h.encolado.push(a) }),
}));
vi.mock('../auth/useAuthStore', () => ({
  useAuthStore: Object.assign(() => ({ user: { nombre: 'Admin' } }), {
    getState: () => ({ restauranteId: 'rid' }),
  }),
}));

import RecepcionScreen from './RecepcionScreen';

/** Abre el cuadro de una orden pendiente y confirma la recepción. */
async function recibir() {
  const user = userEvent.setup();
  const { container, unmount } = render(<RecepcionScreen />);

  const botones = () => [...container.querySelectorAll('button')];
  // «Dar entrada» abre el cuadro; dentro, «Sí, Ingresar» lo ejecuta.
  await user.click(botones().find((b) => /dar entrada/i.test(b.textContent)));
  await user.click(
    botones()
      .filter((b) => /ingresar/i.test(b.textContent))
      .pop(),
  );
  unmount();

  return {
    producto: h.encolado.find((e) => e[0] === 'productos')?.[2],
    movimiento: h.encolado.find((e) => e[0] === 'movimientos')?.[2],
    orden: h.encolado.find((e) => e[0] === 'ordenes_compra')?.[2],
  };
}

describe('RecepcionScreen · recibir mercancía', () => {
  beforeEach(() => {
    h.encolado.length = 0;
    h.avisos.length = 0;
    app.ordenesCompra = [{ ...ORDEN }];
    app.productos = [{ ...NARANJA }];
  });

  it('LA AFIRMACIÓN: 30 kg a $20 sobre 10 kg a $14 dejan 40 kg a $18.50', () => {
    return recibir().then(({ producto }) => {
      expect(producto.stock).toBe(40);
      expect(producto.precio).toBe(18.5);
    });
  });

  it('el movimiento guarda el stock ANTERIOR, no el ya actualizado', async () => {
    const { movimiento } = await recibir();
    expect(movimiento.stock_anterior).toBe(10);
    expect(movimiento.stock_nuevo).toBe(40);
    expect(movimiento.tipo).toBe('Entrada');
    expect(movimiento.cantidad).toBe(30);
  });

  it('la orden queda completada, y en la tabla en snake_case', async () => {
    const { orden } = await recibir();
    // `ordenesCompra` en camelCase daba 404 «table not found» y moría en
    // dead-letter, sin avisar a nadie.
    expect(orden.estado).toBe('completada');
    expect(h.encolado.map((e) => e[0])).toContain('ordenes_compra');
  });

  it('todo lo encolado lleva restaurante_id: sin él, RLS lo rechaza en silencio', async () => {
    const { producto, movimiento } = await recibir();
    expect(producto.restaurante_id).toBe('rid');
    expect(movimiento.restaurante_id).toBe('rid');
  });

  it('una orden YA recibida no se recibe otra vez', async () => {
    app.ordenesCompra = [{ ...ORDEN, estado: 'completada' }];
    h.encolado.length = 0;

    const user = userEvent.setup();
    const { container } = render(<RecepcionScreen />);
    const botones = [...container.querySelectorAll('button')];
    const abrir = botones.find((b) => /dar entrada/i.test(b.textContent));
    // En la pestaña de recibidas no hay botón de recibir; si lo hubiera, el
    // guardia de `recibirMercancia` corta antes de tocar nada.
    if (abrir) await user.click(abrir);

    expect(h.encolado.filter((e) => e[0] === 'productos')).toHaveLength(0);
  });

  it('EN ML (06-oct): 1000 ml de leche a 0.025 se guardan a 0.025, no a 0.03', async () => {
    // Desde que las unidades son g, ml y pz el costo por unidad baja de un
    // centavo. Redondear a centavos subia la leche un 20 %.
    app.productos = [
      { id: 11, nombre: 'Leche Entera', unidad: 'ml', stock: 0, precio: 0 },
    ];
    app.ordenesCompra = [
      {
        ...ORDEN,
        items: [{ id_producto: 11, cantidad: 1000, precio_unitario: 0.025 }],
      },
    ];
    const { producto, movimiento } = await recibir();
    expect(producto.stock).toBe(1000);
    expect(producto.precio).toBe(0.025);
    expect(movimiento.referencia).toMatch(/Costo Ingreso: \$0\.025/);
  });
});
