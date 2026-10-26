// src/features/operacion/MesasScreen.rastro.test.jsx
//
// ── LA AFIRMACIÓN ───────────────────────────────────────────────────────────
// **Traspasar y juntar mesas dejan rastro en Auditoría, con quién lo hizo.**
//
// El traspaso mueve consumo de una cuenta a otra, incluido lo que ya está en
// cocina. Hasta el 26-oct no escribía nada: si al cobrar faltaba o sobraba un
// platillo, no había forma de saber que se había movido. Juntar sólo une mesas
// libres y no mueve dinero, pero cambia en qué mesa cae lo que se pida después.
// Ver `claude/CENSO_21-OCT_OPERATIVO_CONTRA_ADMINISTRATIVO.md` §3.3.
//
// Se prueba por la pantalla: lo que se rompe en silencio es que el manejador
// deje de llamar a la auditoría, y eso sólo lo ve una prueba que pulse.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

const h = vi.hoisted(() => ({ app: {}, auditado: [], empleadoActivo: null }));

vi.mock('../../store/useAppStore', () => {
  const useAppStore = (sel) => (typeof sel === 'function' ? sel(h.app) : h.app);
  useAppStore.setState = (fn) => Object.assign(h.app, fn(h.app));
  useAppStore.getState = () => h.app;
  return { useAppStore, parseUTC: (s) => (s ? new Date(s) : null) };
});
vi.mock('../../store/useSyncStore', () => {
  const useSyncStore = () => ({ enqueueAction: () => {} });
  useSyncStore.getState = () => ({ enqueueAction: () => {} });
  return { useSyncStore };
});
vi.mock('../../store/useSessionStore', () => {
  const estado = () => ({ empleadoActivo: h.empleadoActivo });
  const useSessionStore = (sel) =>
    typeof sel === 'function' ? sel(estado()) : estado();
  useSessionStore.getState = estado;
  return { useSessionStore };
});
vi.mock('../auth/useAuthStore', () => {
  const estado = () => ({ user: { nombre: 'Dueño Test' }, restauranteId: 'r' });
  const useAuthStore = () => estado();
  useAuthStore.getState = estado;
  return { useAuthStore };
});

import MesasScreen from './MesasScreen';

const mesa = (id, nombre, extra = {}) => ({
  id,
  nombre,
  zona: 'Salón Principal',
  capacidad: 4,
  estado: 'libre',
  comensales_reales: 0,
  mesa_principal_id: null,
  ...extra,
});

beforeEach(() => {
  h.auditado = [];
  h.empleadoActivo = { nombre: 'Mesero Test', rol: 'Mesero' };
  h.app = {
    mesas: [
      mesa('m1', 'Mesa 1', {
        estado: 'ocupada',
        comensales_reales: 2,
        orden_actual: {
          folio: 'A-200',
          items: [
            {
              id: 'l1',
              nombre: 'Latte',
              precio: 60,
              cantidad: 2,
              cantidad_enviada: 1,
            },
            { id: 'l2', nombre: 'Molletes', precio: 90, cantidad: 1 },
          ],
          total: 210,
        },
      }),
      mesa('m2', 'Mesa 2'),
      mesa('m3', 'Mesa 3'),
    ],
    staff: [],
    clientes: [],
    comandas_activas: [],
    configuracion: { nombre_empresa: 'AZUL' },
    showToast: () => {},
    updateConfiguracion: () => {},
    registrarAuditoria: (fila) => h.auditado.push(fila),
  };
});

const monta = () =>
  render(
    <MemoryRouter>
      <MesasScreen />
    </MemoryRouter>,
  );

describe('MesasScreen · rastro de traspasar y juntar', () => {
  it('LA AFIRMACIÓN: el traspaso deja quién, origen con folio, destino y qué se movió', async () => {
    monta();
    const usuario = userEvent.setup();

    await usuario.click(screen.getAllByTitle('Traspasar Artículos')[0]);
    await usuario.selectOptions(screen.getByRole('combobox'), 'm2');
    await usuario.click(screen.getByText('Seleccionar Todo'));
    await usuario.click(screen.getByText('Ejecutar Traspaso'));

    expect(h.auditado).toHaveLength(1);
    const [fila] = h.auditado;
    expect(fila.accion).toBe('TRASPASO_MESA');
    expect(fila.usuario).toBe('Mesero Test');
    expect(fila.detalles).toContain('De Mesa 1 (folio A-200) a Mesa 2');
    expect(fila.detalles).toContain('2x Latte (1 en cocina)');
    expect(fila.detalles).toContain('1x Molletes');
    expect(fila.detalles).toContain('Mesa 1 queda libre');
  });

  it('juntar deja quién y qué mesas', async () => {
    monta();
    const usuario = userEvent.setup();

    await usuario.click(screen.getByTitle('Juntar mesas'));
    // Las opciones del cuadro son las mesas libres: «Mesa 2 … Cap 4».
    const opciones = screen.getAllByRole('button', { name: /Cap 4/ });
    await usuario.click(within(opciones[0]).getByText('Mesa 2'));
    await usuario.click(within(opciones[1]).getByText('Mesa 3'));
    await usuario.click(screen.getByRole('button', { name: /^Juntar \(2\)/ }));

    expect(h.auditado).toHaveLength(1);
    const [fila] = h.auditado;
    expect(fila.accion).toBe('MESAS_JUNTADAS');
    expect(fila.usuario).toBe('Mesero Test');
    expect(fila.detalles).toBe('Mesa 2 junto con Mesa 3.');
  });

  it('sin empleado con PIN, firma el usuario de la sesión', async () => {
    h.empleadoActivo = null;
    monta();
    const usuario = userEvent.setup();

    await usuario.click(screen.getAllByTitle('Traspasar Artículos')[0]);
    await usuario.selectOptions(screen.getByRole('combobox'), 'm2');
    await usuario.click(screen.getByText('Seleccionar Todo'));
    await usuario.click(screen.getByText('Ejecutar Traspaso'));

    expect(h.auditado[0].usuario).toBe('Dueño Test');
  });
});
