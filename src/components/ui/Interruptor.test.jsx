// src/components/ui/Interruptor.test.jsx
// El interruptor de Configuración (D2, 0.3.4). Ver el comentario de
// `Interruptor` en Adm.jsx.
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Interruptor } from './Adm';

const montar = (props = {}) => {
  const onCambiar = vi.fn();
  render(
    <Interruptor
      etiqueta="La tarde empieza con el primer corte de caja"
      descripcion="El turno cambia cuando se hace el primer corte del día, no a una hora fija. Así una mesa del desayuno que se alarga sigue con la carta y los precios de la mañana."
      onCambiar={onCambiar}
      {...props}
    />,
  );
  return onCambiar;
};

describe('Interruptor', () => {
  it('es un switch con nombre y dice si está encendido', () => {
    montar({ encendido: true });
    const sw = screen.getByRole('switch', {
      name: /La tarde empieza con el primer corte/,
    });
    expect(sw.getAttribute('aria-checked')).toBe('true');
  });

  it('el carril no se encoge aunque la descripción sea larga', () => {
    // Es la causa de la bola fuera del carril: sin `shrink-0`, el texto
    // aprieta al carril en la fila flexible. jsdom no hace layout; se mira la
    // clase que lo impide.
    montar();
    expect(screen.getByRole('switch').className).toMatch(/\bshrink-0\b/);
  });

  it('tocar el texto también lo cambia (antes sólo respondía el carril)', async () => {
    const onCambiar = montar({ encendido: false });
    await userEvent.click(screen.getByText(/La tarde empieza/));
    expect(onCambiar).toHaveBeenCalledWith(true);
  });

  it('se cambia con el teclado: Tab y espacio', async () => {
    const user = userEvent.setup();
    const onCambiar = montar({ encendido: true });
    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole('switch'));
    await user.keyboard(' ');
    expect(onCambiar).toHaveBeenCalledWith(false);
  });

  it('tocar el carril cambia una sola vez (el label no lo repite)', async () => {
    const onCambiar = montar({ encendido: false });
    await userEvent.click(screen.getByRole('switch'));
    expect(onCambiar).toHaveBeenCalledTimes(1);
  });
});
