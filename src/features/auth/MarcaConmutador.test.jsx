// src/features/auth/MarcaConmutador.test.jsx
//
// El logo como puerta. Lo que se fija:
//
//   1. **Que tenga nombre.** Con la redirección de `lib/Puerta.js` en marcha,
//      este botón es la ÚNICA salida entre los dos logins: un dispositivo
//      emparejado que teclee `/login` rebota. Un logo sin nombre accesible deja
//      encerrado de verdad a quien use lector de pantalla, y «discreto» no
//      puede significar «invisible para quien no ve».
//   2. **Que la ida no provoque la vuelta.** Ir al correo marca la excepción en
//      `sessionStorage`; ir a personal la olvida. Si esas dos mitades se
//      descolocan, las pantallas se rebotan entre sí.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

import MarcaConmutador from './MarcaConmutador';
import {
  pidioEntrarComoAdmin,
  marcarEntrarComoAdmin,
  olvidarEntrarComoAdmin,
} from '../../lib/Puerta';

const Destino = ({ nombre }) => <div data-testid="destino">{nombre}</div>;

const pintar = (hacia, desde = '/origen') =>
  render(
    <MemoryRouter initialEntries={[desde]}>
      <Routes>
        <Route
          path="/origen"
          element={
            <MarcaConmutador hacia={hacia}>
              <img alt="InvVenta" />
            </MarcaConmutador>
          }
        />
        <Route path="/login" element={<Destino nombre="correo" />} />
        <Route path="/loginempleados" element={<Destino nombre="personal" />} />
      </Routes>
    </MemoryRouter>,
  );

const pulsar = () => fireEvent.click(screen.getByRole('button'));
const destino = () => screen.queryByTestId('destino')?.textContent;

beforeEach(() => olvidarEntrarComoAdmin());

afterEach(() => {
  cleanup();
  // Este archivo ESCRIBE en el `sessionStorage` de verdad. Dejarlo sucio hace
  // que el siguiente fichero vea una excepción que nadie pidió — la misma
  // lección que el `matchMedia` que dos pruebas dejaban puesto.
  olvidarEntrarComoAdmin();
});

describe('la puerta lleva a donde dice', () => {
  it('hacia el correo navega a /login', () => {
    pintar('correo');
    pulsar();
    expect(destino()).toBe('correo');
  });

  it('hacia personal navega a /loginempleados', () => {
    // Este camino NO existía antes: el enlace de texto sólo iba en un sentido,
    // así que desde `/login` no había forma de llegar al acceso de personal.
    pintar('personal');
    pulsar();
    expect(destino()).toBe('personal');
  });
});

describe('la marca de sesión, que es lo que evita el rebote', () => {
  it('ir al correo la pone: si no, /login devolvería al dueño', () => {
    pintar('correo');
    pulsar();
    expect(pidioEntrarComoAdmin()).toBe(true);
  });

  it('ir a personal la quita: el dispositivo vuelve a ser lo que es', () => {
    marcarEntrarComoAdmin();
    pintar('personal');
    pulsar();
    expect(pidioEntrarComoAdmin()).toBe(false);
  });
});

describe('accesibilidad: es la única salida, así que tiene que tener nombre', () => {
  it('se anuncia como botón con su etiqueta', () => {
    pintar('correo');
    expect(
      screen.getByRole('button', { name: 'Cambiar a acceso de administrador' }),
    ).toBeTruthy();
  });

  it('la etiqueta dice a dónde lleva, no «logo»', () => {
    pintar('personal');
    expect(
      screen.getByRole('button', { name: 'Cambiar a acceso de personal' }),
    ).toBeTruthy();
  });

  it('lleva `title`, para quien pasa el cursor sin saber que es pulsable', () => {
    pintar('correo');
    expect(screen.getByRole('button').getAttribute('title')).toBe(
      'Cambiar a acceso de administrador',
    );
  });

  it('la pista visual no se anuncia dos veces', () => {
    // El icono es decorativo: el nombre ya lo da el `aria-label`. Sin
    // `aria-hidden`, un lector leería el botón y luego el icono suelto.
    pintar('correo');
    const pista = screen
      .getByRole('button')
      .querySelector('[aria-hidden="true"]');
    expect(pista).toBeTruthy();
  });

  it('es alcanzable con el tabulador y se ve al enfocarlo', () => {
    // Sin `focus-visible` el navegador de teclado no sabría dónde está, y esta
    // es su única forma de cruzar entre logins.
    pintar('correo');
    const boton = screen.getByRole('button');
    expect(boton.tagName).toBe('BUTTON');
    expect(boton.className).toContain('focus-visible:ring');
  });
});

describe('la marca sigue siendo la marca', () => {
  it('el contenido que se le pasa se pinta tal cual', () => {
    // El conmutador envuelve, no sustituye: si algún día se cambia el logo, no
    // hay que tocar este componente.
    pintar('correo');
    expect(screen.getByAltText('InvVenta')).toBeTruthy();
  });
});
