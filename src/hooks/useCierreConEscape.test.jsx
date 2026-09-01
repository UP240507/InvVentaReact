// Escape cierra el cuadro de encima, y sólo ése.
//
// Estas pruebas existen porque el fallo que las motiva NO daba error: los
// cuarenta modales del proyecto no escuchaban la tecla, y dos pantallas la
// usaban para SALIR de la pantalla —así que con un cuadro abierto, Escape te
// echaba fuera con el trabajo a medias—. Encontrado en campo el 28-ago.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { useCierreConEscape, _cuadrosAbiertos } from './useCierreConEscape';

afterEach(cleanup);

/** Un cuadro de mentira: se registra mientras está montado. */
function Cuadro({ nombre, onClose, activo = true }) {
  useCierreConEscape(onClose, activo);
  return <div>cuadro {nombre}</div>;
}

describe('useCierreConEscape', () => {
  it('Escape cierra el cuadro abierto', async () => {
    const user = userEvent.setup();
    const cerrar = vi.fn();
    render(<Cuadro nombre="A" onClose={cerrar} />);

    await user.keyboard('{Escape}');
    expect(cerrar).toHaveBeenCalledTimes(1);
  });

  it('otras teclas no cierran nada', async () => {
    const user = userEvent.setup();
    const cerrar = vi.fn();
    render(<Cuadro nombre="A" onClose={cerrar} />);

    await user.keyboard('{Enter}');
    await user.keyboard('a');
    expect(cerrar).not.toHaveBeenCalled();
  });

  // ── EL CASO QUE JUSTIFICA LA PILA ────────────────────────────────────────
  // El cobro abre un sub-modal de autorización encima. Sin pila, la tecla la
  // oirían los dos y se cerraría también el de abajo: el cajero perdería el
  // cobro entero por cancelar una autorización.
  it('con dos cuadros, sólo se cierra el de encima', async () => {
    const user = userEvent.setup();
    const abajo = vi.fn();
    const encima = vi.fn();
    render(
      <>
        <Cuadro nombre="abajo" onClose={abajo} />
        <Cuadro nombre="encima" onClose={encima} />
      </>,
    );

    await user.keyboard('{Escape}');
    expect(encima).toHaveBeenCalledTimes(1);
    expect(abajo).not.toHaveBeenCalled();
  });

  // ── LA TRAMPA FINA: RE-RENDER DEL DE ABAJO ───────────────────────────────
  // Si el handler se registrara con `onClose` en las dependencias, cada render
  // del padre lo sacaría de la pila y lo volvería a meter AL FINAL. Un cuadro
  // de abajo que se re-renderiza —su lista se actualizó por realtime— pasaría
  // a ser «el de encima» y Escape cerraría el equivocado. No daría error:
  // cerraría otra cosa.
  it('que el de abajo se re-renderice no lo asciende en la pila', async () => {
    const user = userEvent.setup();
    const abajo = vi.fn();
    const encima = vi.fn();

    function Escena() {
      const [n, setN] = useState(0);
      return (
        <>
          {/* onClose es una flecha nueva en cada render: el caso peligroso */}
          <Cuadro nombre="abajo" onClose={() => abajo(n)} />
          <Cuadro nombre="encima" onClose={encima} />
          <button onClick={() => setN((v) => v + 1)}>re-render</button>
        </>
      );
    }
    render(<Escena />);

    await user.click(screen.getByRole('button', { name: 're-render' }));
    await user.keyboard('{Escape}');

    expect(encima).toHaveBeenCalledTimes(1);
    expect(abajo).not.toHaveBeenCalled();
  });

  it('el de abajo cierra cuando el de encima ya se fue', async () => {
    const user = userEvent.setup();
    const abajo = vi.fn();

    function Escena() {
      const [hayEncima, setHayEncima] = useState(true);
      return (
        <>
          <Cuadro nombre="abajo" onClose={abajo} />
          {hayEncima && <Cuadro nombre="encima" onClose={() => {}} />}
          <button onClick={() => setHayEncima(false)}>cerrar encima</button>
        </>
      );
    }
    render(<Escena />);

    await user.click(screen.getByRole('button', { name: 'cerrar encima' }));
    await user.keyboard('{Escape}');
    expect(abajo).toHaveBeenCalledTimes(1);
  });

  it('desmontar limpia la pila: no quedan cuadros escuchando', async () => {
    const { unmount } = render(<Cuadro nombre="A" onClose={() => {}} />);
    expect(_cuadrosAbiertos()).toBe(1);
    unmount();
    expect(_cuadrosAbiertos()).toBe(0);
  });

  it('con `activo` en falso no se registra ni responde', async () => {
    const user = userEvent.setup();
    const cerrar = vi.fn();
    render(<Cuadro nombre="A" onClose={cerrar} activo={false} />);

    expect(_cuadrosAbiertos()).toBe(0);
    await user.keyboard('{Escape}');
    expect(cerrar).not.toHaveBeenCalled();
  });

  it('sin `onClose` no se registra: hay cuadros que no deben cerrarse', () => {
    render(<Cuadro nombre="A" onClose={undefined} />);
    expect(_cuadrosAbiertos()).toBe(0);
  });

  // ── EL CONTROL NEGATIVO DE VERDAD ────────────────────────────────────────
  // Lo que rompía en campo no era «no cierra», era «cierra Y ADEMÁS dispara el
  // atajo global que te saca de la pantalla». Aquí se monta un oyente igual
  // que el de `lib/Atajos.js` —en `window`, sin captura— y se comprueba que NO
  // llega a verlo. Sin `stopPropagation` en el hook, este test falla.
  it('la tecla NO llega a los atajos globales de la pantalla', async () => {
    const user = userEvent.setup();
    const salirDeLaPantalla = vi.fn();
    const oyenteGlobal = (e) => {
      if (e.key === 'Escape') salirDeLaPantalla();
    };
    window.addEventListener('keydown', oyenteGlobal);

    try {
      render(<Cuadro nombre="A" onClose={() => {}} />);
      await user.keyboard('{Escape}');
      expect(salirDeLaPantalla).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener('keydown', oyenteGlobal);
    }
  });

  it('sin cuadros abiertos, la pantalla SÍ recibe su Escape', async () => {
    const user = userEvent.setup();
    const salirDeLaPantalla = vi.fn();
    const oyenteGlobal = (e) => {
      if (e.key === 'Escape') salirDeLaPantalla();
    };
    window.addEventListener('keydown', oyenteGlobal);

    try {
      await user.keyboard('{Escape}');
      expect(salirDeLaPantalla).toHaveBeenCalledTimes(1);
    } finally {
      window.removeEventListener('keydown', oyenteGlobal);
    }
  });
});
