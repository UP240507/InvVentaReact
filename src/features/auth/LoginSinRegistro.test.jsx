// src/features/auth/LoginSinRegistro.test.jsx
//
// El registro público está cerrado mientras dura la prueba con los fundadores
// (19-nov). El servidor ya rechaza el alta; esta prueba cuida el otro lado: que
// el login no ofrezca un camino que termina en un error.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

// Los mismos dobles que LoginPuerta.test: el login sólo necesita que el almacén
// de sesión exista y que Supabase no se llame.
vi.mock('./useAuthStore', () => ({
  useAuthStore: Object.assign(
    () => ({ login: async () => false, error: null, isLoading: false }),
    { getState: () => ({}) },
  ),
}));
vi.mock('../../api/supabase', () => ({ supabase: {} }));

import LoginScreen from './LoginScreen';

afterEach(cleanup);

describe('Login con el registro cerrado', () => {
  it('no ofrece crear un restaurante', () => {
    render(
      <MemoryRouter initialEntries={['/login']}>
        <Routes>
          <Route path="/login" element={<LoginScreen />} />
        </Routes>
      </MemoryRouter>,
    );
    // Ancla: si el login no se pintara, la ausencia del enlace no probaría nada.
    expect(
      screen.getByRole('button', { name: /olvidaste tu contraseña/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /crear restaurante/i }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/crear restaurante/i)).not.toBeInTheDocument();
  });
});
