// src/components/AvisoSincronizado.test.jsx
// La frase que reemplaza al toast de «cambio sincronizado» (0.3.4). Ver el
// encabezado del componente.
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import AvisoSincronizado from './AvisoSincronizado';
import { useSyncStore } from '../store/useSyncStore';

beforeEach(() => {
  useSyncStore.setState({ ultimaSubida: null });
});

describe('AvisoSincronizado', () => {
  it('sin nada subido dice «Sincronizado», apagado', () => {
    const { container } = render(<AvisoSincronizado />);
    expect(screen.getByText('Sincronizado')).toBeTruthy();
    expect(container.querySelector('.aviso-sync-brillo')).toBeNull();
  });

  it('al subir algo dice cuánto y se ilumina', () => {
    const { container } = render(<AvisoSincronizado />);
    act(() => useSyncStore.setState({ ultimaSubida: { cantidad: 3, en: 1 } }));
    expect(screen.getByText('3 cambios sincronizados')).toBeTruthy();
    expect(container.querySelector('.aviso-sync-brillo')).toBeTruthy();
  });

  it('cada subida nueva vuelve a montar la frase, para que la animación arranque otra vez', () => {
    const { container } = render(<AvisoSincronizado />);
    act(() => useSyncStore.setState({ ultimaSubida: { cantidad: 1, en: 1 } }));
    const primera = container.querySelector('[data-aviso-sync]');
    act(() => useSyncStore.setState({ ultimaSubida: { cantidad: 1, en: 2 } }));
    const segunda = container.querySelector('[data-aviso-sync]');
    expect(segunda).not.toBe(primera);
  });

  it('en el teléfono sólo enseña el icono; el texto queda para el lector', () => {
    act(() => useSyncStore.setState({ ultimaSubida: { cantidad: 1, en: 5 } }));
    render(<AvisoSincronizado compacto />);
    expect(screen.getByText('1 cambio sincronizado').className).toContain(
      'sr-only',
    );
  });

  it('una subida mal formada no pinta «undefined»', () => {
    act(() => useSyncStore.setState({ ultimaSubida: { cantidad: 2 } }));
    render(<AvisoSincronizado />);
    expect(screen.getByText('Sincronizado')).toBeTruthy();
  });
});
