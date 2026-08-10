// src/features/auth/LoginPuerta.test.jsx
//
// Que cada dispositivo aterrice en SU puerta, y —sobre todo— que las dos
// pantallas no se manden la una a la otra.
//
// El riesgo del diseño es concreto: `/login` redirige a `/loginempleados` si el
// dispositivo está emparejado, y `/loginempleados` ofrece volver a `/login`. Sin
// la marca de salida en `sessionStorage`, ese enlace devolvería al dueño a la
// pantalla de la que acaba de salir, y otra vez, y otra.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

// NO se simula `lib/Hub`: se usan sus funciones de verdad.
//
// Simularlo parecía lo cómodo y hacía la suite frágil. `MarcaConmutador.test`
// también carga `lib/Puerta` —que importa el Hub— y dos archivos que simulan el
// mismo módulo con comportamientos distintos no pueden convivir en un registro
// compartido: el primero que cargue impone su versión y el otro falla, en su
// propio archivo, por algo que no hizo.
//
// Guardando el token con `guardarToken()` no hay nada que simular ni una segunda
// copia de la llave. Y `enTauri()` mira `window.__TAURI_INTERNALS__`, que se
// pone y se quita en dos líneas.
vi.mock('./useAuthStore', () => ({
  useAuthStore: Object.assign(
    () => ({ login: async () => false, error: null, isLoading: false }),
    { getState: () => ({}) },
  ),
}));
vi.mock('../../api/supabase', () => ({ supabase: {} }));

import LoginScreen from './LoginScreen';
import { guardarToken } from '../../lib/Hub';
import { olvidarEntrarComoAdmin } from '../../lib/Puerta';

/** Doble de la pantalla de staff: sólo interesa saber si se aterrizó en ella. */
const StaffFalsa = () => <div data-testid="staff">código + PIN</div>;

const pintar = () =>
  render(
    <MemoryRouter initialEntries={['/login']}>
      <Routes>
        <Route path="/login" element={<LoginScreen />} />
        <Route path="/loginempleados" element={<StaffFalsa />} />
      </Routes>
    </MemoryRouter>,
  );

const enStaff = () => screen.queryByTestId('staff') !== null;

const emparejar = (token) => guardarToken(token);
const enTauri = (si) => {
  if (si) window.__TAURI_INTERNALS__ = {};
  else delete window.__TAURI_INTERNALS__;
};

beforeEach(() => {
  emparejar('');
  enTauri(false);
  olvidarEntrarComoAdmin();
});

afterEach(cleanup);

describe('a qué puerta llega cada dispositivo', () => {
  it('un navegador sin emparejar se queda en el login de correo', () => {
    pintar();
    expect(enStaff()).toBe(false);
    expect(screen.getByPlaceholderText(/admin@/i)).toBeTruthy();
  });

  it('un teléfono emparejado se va a código + PIN', () => {
    // La corrección: antes veía el formulario de correo y un teclado de PIN
    // que no podía funcionar.
    emparejar('tok-del-hub');
    pintar();
    expect(enStaff()).toBe(true);
  });

  it('la caja se queda en el correo aunque esté emparejada', () => {
    enTauri(true);
    emparejar('tok-del-hub');
    pintar();
    expect(enStaff()).toBe(false);
  });
});

describe('la salida del dueño no crea un bucle', () => {
  it('tras pedir entrar como administrador, `/login` deja de redirigir', () => {
    emparejar('tok-del-hub');
    // Es lo que hace el enlace «Soy el administrador» de la pantalla de staff.
    window.sessionStorage.setItem('invventa.entrarComoAdmin', '1');
    pintar();
    expect(enStaff()).toBe(false);
    expect(screen.getByPlaceholderText(/admin@/i)).toBeTruthy();
  });

  it('sin esa marca, el mismo dispositivo SÍ redirige', () => {
    // La otra mitad de la prueba anterior: si `pidioAdmin` no pesara, ésta
    // pasaría igual y no estaríamos comprobando nada.
    emparejar('tok-del-hub');
    pintar();
    expect(enStaff()).toBe(true);
  });
});

describe('lo que se quitó de /login', () => {
  it('ya no hay teclado de PIN', () => {
    // Ofrecía la puerta que no funciona: buscaba el PIN contra un `staff` que
    // en un dispositivo sin sesión está vacío.
    pintar();
    expect(screen.queryByText(/PIN de \d dígitos/)).toBeNull();
    expect(screen.queryByText(/Acceso operativo/)).toBeNull();
  });

  it('y tampoco un enlace a la pantalla de empleados', () => {
    // Quien la necesita ya fue redirigido antes de ver esto. Un enlace más
    // sería ruido para el único que se queda aquí: el dueño.
    pintar();
    expect(screen.queryByText(/empleado/i)).toBeNull();
  });
});
