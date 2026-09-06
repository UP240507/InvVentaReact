// src/features/compras/ComprasScreen.test.jsx
//
// Una afirmación: **la orden emitida guarda la IDENTIDAD del proveedor, no
// sólo su nombre.** El nombre se elegía del catálogo y se tiraba el id
// (`:162` guardaba `.nombre`), así que la única forma de volver a saber quién
// era la orden era comparar cadenas — y corregir un nombre en el catálogo
// dejaba a sus órdenes anteriores sin destinatario, sin dar error.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

const h = vi.hoisted(() => ({
  enqueued: [],
  app: {},
  avisos: [],
  abrir: async () => ({ ok: true }),
}));

vi.mock('../../store/useAppStore', () => ({
  useAppStore: Object.assign(() => h.app, {
    setState: () => {},
    getState: () => h.app,
  }),
}));
vi.mock('../../store/useSyncStore', () => ({
  useSyncStore: () => ({ enqueueAction: (...a) => h.enqueued.push(a) }),
}));
vi.mock('../auth/useAuthStore', () => ({
  useAuthStore: Object.assign(() => ({ user: { nombre: 'Admin Test' } }), {
    getState: () => ({ restauranteId: 'rid-test-123' }),
  }),
}));
vi.mock('../../lib/Auditoria', () => ({ registrarAuditoria: () => {} }));

// `abrirFuera` se controla desde la prueba: lo que se afirma abajo es qué hace
// la pantalla CUANDO ABRE y cuándo NO, no cómo abre (eso es `Abrir.test.js`).
vi.mock('../../lib/Abrir', () => ({
  abrirFuera: (...a) => h.abrir(...a),
  motivoLegible: () => 'no se pudo abrir',
}));

import ComprasScreen from './ComprasScreen';

const QUESOS = {
  id: 1,
  nombre: 'Quesos',
  telefono: '449 123 4567',
  email: 'quesos@ejemplo.mx',
  activo: true,
};
const SIN_TELEFONO = { id: 2, nombre: 'Emma', activo: true };

const ARPILLA = {
  id: 77,
  proveedor_id: 1,
  producto_id: 10,
  nombre: 'arpilla',
  factor: 30,
  activo: true,
};

const montar = (proveedorProducto = []) => {
  Object.assign(h.app, {
    productos: [
      {
        id: 10,
        nombre: 'Queso Manchego',
        unidad: 'kg',
        precio: 100,
        activo: true,
      },
    ],
    proveedores: [QUESOS, SIN_TELEFONO],
    proveedorProducto,
    ordenesCompra: [],
    configuracion: { nombre_empresa: 'AZUL' },
    showToast: (m) => h.avisos.push(m),
    // La pantalla lo saca del STORE, no de `lib/Auditoria`: sin esto,
    // `generarOrden` revienta dentro de su try y el cuadro de exito no sale.
    registrarAuditoria: () => {},
  });
  return render(
    <MemoryRouter>
      <ComprasScreen />
    </MemoryRouter>,
  );
};

beforeEach(() => {
  h.enqueued.length = 0;
  h.avisos.length = 0;
  h.abrir = async () => ({ ok: true });
  for (const k of Object.keys(h.app)) delete h.app[k];
});

describe('ComprasScreen · la orden sabe quién es su proveedor', () => {
  it('LA AFIRMACIÓN: la orden emitida lleva `proveedor_id`, no sólo el nombre', async () => {
    const user = userEvent.setup();
    montar();

    await user.click(screen.getByRole('tab', { name: 'Generar orden' }));
    await user.click(await screen.findByRole('button', { name: /Quesos/ }));

    await user.selectOptions(await screen.findByLabelText('Insumo'), '10');
    await user.clear(screen.getByLabelText('Cantidad'));
    await user.type(screen.getByLabelText('Cantidad'), '3');
    await user.click(
      screen.getByRole('button', { name: 'Agregar a la orden' }),
    );

    await user.click(
      await screen.findByRole('button', { name: /Emitir Orden/ }),
    );

    const [tabla, op, orden] = h.enqueued.at(-1);
    expect([tabla, op]).toEqual(['ordenes_compra', 'upsert']);

    // ── LA AFIRMACIÓN Y SU CONTROL NEGATIVO ─────────────────────────────
    // Sin la línea del arreglo esto sale `undefined`, y entonces la única
    // forma de saber de quién es la orden vuelve a ser comparar el nombre.
    expect(orden.proveedor_id).toBe(1);
    expect(orden.proveedor_id).not.toBeUndefined();

    // Y el nombre se conserva: es cómo se llamaba el día de la orden.
    expect(orden.proveedor).toBe('Quesos');
  });
});

describe('ComprasScreen · el empaque de compra', () => {
  it('LA DIVISION QUE YA NO SE HACE A MANO: 2 arpillas a $900', async () => {
    const user = userEvent.setup();
    montar([ARPILLA]);

    await user.click(screen.getByRole('tab', { name: 'Generar orden' }));
    await user.click(await screen.findByRole('button', { name: /Quesos/ }));
    await user.selectOptions(await screen.findByLabelText('Insumo'), '10');

    // El desplegable aparece porque ESTE proveedor tiene un empaque para ESTE
    // insumo.
    await user.selectOptions(
      await screen.findByLabelText('Empaque de compra'),
      '77',
    );

    await user.clear(screen.getByLabelText('Cantidad'));
    await user.type(screen.getByLabelText('Cantidad'), '2');
    await user.clear(screen.getByLabelText('Costo unitario'));
    await user.type(screen.getByLabelText('Costo unitario'), '900');
    await user.click(
      screen.getByRole('button', { name: 'Agregar a la orden' }),
    );

    await user.click(
      await screen.findByRole('button', { name: /Emitir Orden/ }),
    );

    const linea = h.enqueued.at(-1)[2].items[0];

    // Lo DERIVADO, que es lo que mueve el inventario y el costo promedio.
    expect(linea.cantidad).toBe(60);
    expect(linea.precio_unitario).toBe(30);
    expect(linea.total).toBe(1800);

    // Y lo TECLEADO, que es lo que decia el papel del proveedor.
    expect(linea.empaque).toBe('arpilla');
    expect(linea.empaques).toBe(2);
    expect(linea.precio_empaque).toBe(900);
  });

  it('sin empaques dados de alta, la linea se teclea como toda la vida', async () => {
    const user = userEvent.setup();
    montar();

    await user.click(screen.getByRole('tab', { name: 'Generar orden' }));
    await user.click(await screen.findByRole('button', { name: /Quesos/ }));
    await user.selectOptions(await screen.findByLabelText('Insumo'), '10');

    // Ni siquiera aparece el desplegable: un insumo sin empaques no es un caso
    // especial, es el caso por defecto.
    expect(screen.queryByLabelText('Empaque de compra')).toBeNull();

    await user.clear(screen.getByLabelText('Cantidad'));
    await user.type(screen.getByLabelText('Cantidad'), '5');
    await user.clear(screen.getByLabelText('Costo unitario'));
    await user.type(screen.getByLabelText('Costo unitario'), '20');
    await user.click(
      screen.getByRole('button', { name: 'Agregar a la orden' }),
    );
    await user.click(
      await screen.findByRole('button', { name: /Emitir Orden/ }),
    );

    const linea = h.enqueued.at(-1)[2].items[0];
    expect(linea).toMatchObject({
      cantidad: 5,
      precio_unitario: 20,
      total: 100,
    });
    expect(linea.empaque).toBeUndefined();
  });

  it('el empaque de OTRO proveedor no se ofrece', async () => {
    const user = userEvent.setup();
    montar([{ ...ARPILLA, proveedor_id: 2 }]);

    await user.click(screen.getByRole('tab', { name: 'Generar orden' }));
    await user.click(await screen.findByRole('button', { name: /Quesos/ }));
    await user.selectOptions(await screen.findByLabelText('Insumo'), '10');

    expect(screen.queryByLabelText('Empaque de compra')).toBeNull();
  });
});

/** Emite una orden y deja la pantalla en el cuadro de «¡Emitida!». */
const emitirOrden = async (user) => {
  await user.click(screen.getByRole('tab', { name: 'Generar orden' }));
  await user.click(await screen.findByRole('button', { name: /Quesos/ }));
  await user.selectOptions(await screen.findByLabelText('Insumo'), '10');
  await user.clear(screen.getByLabelText('Cantidad'));
  await user.type(screen.getByLabelText('Cantidad'), '2');
  await user.clear(screen.getByLabelText('Costo unitario'));
  await user.type(screen.getByLabelText('Costo unitario'), '50');
  await user.click(screen.getByRole('button', { name: 'Agregar a la orden' }));
  await user.click(await screen.findByRole('button', { name: /Emitir Orden/ }));
  return screen.findByText('¡Emitida!');
};

describe('ComprasScreen · mandar la orden al proveedor', () => {
  it('LA QUE IMPORTA: si no se abrio nada, el flujo NO se cierra', async () => {
    // Este es el fallo entero. Dentro de la caja `window.open` no abria nada y
    // la linea siguiente vaciaba el carrito igual: el encargado veia
    // desaparecer la orden y concluia que se habia enviado.
    const user = userEvent.setup();
    h.abrir = async () => ({ ok: false, motivo: 'tauri' });
    montar();
    await emitirOrden(user);

    await user.click(screen.getByRole('button', { name: /WhatsApp/ }));

    // El cuadro sigue ahi: nada se dio por enviado.
    expect(screen.getByText('¡Emitida!')).toBeTruthy();
    expect(h.avisos.join(' ')).toMatch(/no se pudo abrir/);
  });

  it('si se abrio, el flujo se cierra como siempre', async () => {
    const user = userEvent.setup();
    montar();
    await emitirOrden(user);

    await user.click(screen.getByRole('button', { name: /WhatsApp/ }));
    expect(screen.queryByText('¡Emitida!')).toBeNull();
  });

  it('el correo recibe el mismo trato', async () => {
    const user = userEvent.setup();
    h.abrir = async () => ({ ok: false, motivo: 'bloqueado' });
    montar();
    await emitirOrden(user);

    await user.click(screen.getByRole('button', { name: /Correo|Mail/i }));
    expect(screen.getByText('¡Emitida!')).toBeTruthy();
  });
});
