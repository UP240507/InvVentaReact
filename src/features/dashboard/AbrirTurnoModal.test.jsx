// src/features/dashboard/AbrirTurnoModal.test.jsx
//
// La afirmación: **el fondo se cuenta, no se teclea.** Y lo que se guarda es el
// conteo, del que el total sale derivado — no al revés.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const h = vi.hoisted(() => ({ app: {}, aperturas: [] }));

vi.mock('../../store/useAppStore', () => ({
  useAppStore: Object.assign(() => h.app, {
    setState: () => {},
    getState: () => h.app,
  }),
}));
vi.mock('../../store/useSessionStore', () => ({
  useSessionStore: () => ({ empleadoActivo: { nombre: 'Sairi' } }),
}));
vi.mock('../../features/auth/useAuthStore', () => ({
  useAuthStore: () => ({ user: { nombre: 'Chris' } }),
}));

import AbrirTurnoModal from './AbrirTurnoModal';

const montar = (configuracion = {}) => {
  Object.assign(h.app, {
    configuracion,
    abrirTurno: async (d) => h.aperturas.push(d),
  });
  render(<AbrirTurnoModal onClose={() => {}} />);
};

const piezas = async (user, etiqueta, cuantas) => {
  const campo = screen.getByLabelText(`Piezas de ${etiqueta}`);
  await user.clear(campo);
  await user.type(campo, String(cuantas));
};

beforeEach(() => {
  h.aperturas.length = 0;
  for (const k of Object.keys(h.app)) delete h.app[k];
});

describe('AbrirTurnoModal · el fondo se cuenta', () => {
  it('YA NO HAY DONDE TECLEAR EL TOTAL', () => {
    // La regla entera del diseño: si se pudiera escribir el total, se
    // escribiría y el desglose se inventaría para que cuadrara.
    montar();
    const totales = screen.getAllByLabelText('Total contado');
    expect(totales.length).toBeGreaterThan(0);
    for (const t of totales) expect(t.tagName).not.toBe('INPUT');
  });

  it('con la configuración en NULL ofrece las denominaciones de fábrica', async () => {
    // Los cinco locales la tienen en NULL. Sin respaldo, no habría con qué
    // contar y el turno no se podría abrir.
    montar({ denominaciones: null });
    expect(screen.getByLabelText('Piezas de $1,000')).toBeTruthy();
    expect(screen.getByLabelText('Piezas de 50¢')).toBeTruthy();
  });

  it('LA AFIRMACIÓN: guarda el conteo y el total derivado de él', async () => {
    const user = userEvent.setup();
    montar();

    await piezas(user, '$500', 2);
    await piezas(user, '$100', 3);
    await piezas(user, '50¢', 4);

    await user.click(screen.getByRole('button', { name: /Iniciar Turno/ }));

    expect(h.aperturas).toHaveLength(1);
    const a = h.aperturas[0];
    expect(a.fondoDesglose).toEqual({ 500: 2, 100: 3, 0.5: 4 });
    expect(a.fondoCaja).toBe(1302); // 1000 + 300 + 2
    expect(a.usuario).toBe('Sairi');
  });

  it('NO se puede abrir sin contar: `{}` no es lo mismo que no contar', async () => {
    // Pulsar sin tocar nada guardaría un conteo de cero que nadie hizo, y un
    // turno sin contar se leería después como una caja vacía.
    const user = userEvent.setup();
    montar();

    const boton = screen.getByRole('button', { name: /Iniciar Turno/ });
    expect(boton).toBeDisabled();

    await user.click(boton);
    expect(h.aperturas).toHaveLength(0);
  });

  it('contar y que no haya nada SÍ se puede: se toca y se deja en cero', async () => {
    const user = userEvent.setup();
    montar();

    await piezas(user, '$500', 3);
    await piezas(user, '$500', 0); // se corrige: no había

    await user.click(screen.getByRole('button', { name: /Iniciar Turno/ }));
    expect(h.aperturas[0].fondoDesglose).toEqual({});
    expect(h.aperturas[0].fondoCaja).toBe(0);
  });

  it('el local manda sobre las denominaciones', () => {
    montar({ denominaciones: { billetes: [200], monedas: [] } });
    expect(screen.getByLabelText('Piezas de $200')).toBeTruthy();
    expect(screen.queryByLabelText('Piezas de $1,000')).toBeNull();
  });
});
