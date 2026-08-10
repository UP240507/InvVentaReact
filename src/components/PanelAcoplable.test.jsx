// El primitivo del que cuelga toda la adaptación a pantallas. Lo que se fija
// aquí no es el aspecto sino las dos garantías que hacen que valga la pena
// tenerlo en un solo sitio:
//
//  1. El contenido es EL MISMO en las dos figuras. Si algún día alguien mete
//     un `children` distinto para móvil, estas pruebas no lo detectan — pero
//     sí detectan que el contenido llegue completo en ambos casos, que es la
//     mitad barata del problema.
//
//  2. En estrecho, el panel NO ocupa altura cuando está cerrado. Ése era el
//     defecto de partida: el carrito se llevaba media pantalla del teléfono
//     estuviera lleno o vacío.
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import PanelAcoplable from './PanelAcoplable';
import { ANCHO_ACOPLADO } from '../hooks/useAcoplado';

// jsdom no lo trae, así que aquí vale `undefined`. Se guarda igualmente en vez
// de dar por hecho el `undefined`: lo que importa es DEVOLVER el entorno como
// estaba, no ponerlo en un valor concreto.
const matchMediaOriginal = window.matchMedia;

afterEach(() => {
  cleanup();
  // El falso se instala en el objeto global, y el global sobrevive al archivo
  // cuando la suite corre sin aislar entre ficheros. Sin devolverlo, el
  // siguiente archivo hereda un `matchMedia` que contesta a preguntas que nadie
  // le ha hecho, y el fallo sale en un test que no tiene nada que ver.
  window.matchMedia = matchMediaOriginal;
});

// jsdom no implementa matchMedia. Se simula un ancho de ventana y se responde
// a la consulta como lo haría el navegador.
function anchoDeVentana(px) {
  window.matchMedia = vi.fn().mockImplementation((consulta) => {
    const minimo = Number(/min-width:\s*(\d+)px/.exec(consulta)?.[1] ?? 0);
    return {
      matches: px >= minimo,
      media: consulta,
      addEventListener: () => {},
      removeEventListener: () => {},
    };
  });
}

const contenido = <p>Chilaquiles verdes</p>;

beforeEach(() => {
  document.body.style.overflow = '';
});

describe('figura ancha — tablet y escritorio', () => {
  beforeEach(() => anchoDeVentana(ANCHO_ACOPLADO));

  it('es una columna acoplada, siempre visible', () => {
    render(<PanelAcoplable abierto={false}>{contenido}</PanelAcoplable>);
    expect(document.querySelector('[data-figura="acoplado"]')).toBeTruthy();
    expect(screen.getByText('Chilaquiles verdes')).toBeTruthy();
  });

  it('`abierto` no la afecta: una columna fija no se cierra', () => {
    // Es la razón de que el estado de apertura viva en el padre y aquí se
    // ignore: si la columna se pudiera cerrar en escritorio, habría que
    // inventar un botón para volver a abrirla.
    render(<PanelAcoplable abierto={false}>{contenido}</PanelAcoplable>);
    expect(screen.getByText('Chilaquiles verdes')).toBeTruthy();
  });

  it('no pinta la barra flotante, que ahí no pinta nada', () => {
    render(
      <PanelAcoplable abierto={false} etiquetaAbrir="Ver carrito">
        {contenido}
      </PanelAcoplable>,
    );
    expect(screen.queryByText('Ver carrito')).toBeNull();
  });
});

describe('figura estrecha — teléfono', () => {
  beforeEach(() => anchoDeVentana(ANCHO_ACOPLADO - 1));

  it('cerrado NO ocupa altura: el contenido no está montado', () => {
    // El defecto que vino a arreglar. Antes el carrito se llevaba `h-[50vh]`
    // aunque estuviera vacío, y al catálogo le quedaba una fila y media.
    render(
      <PanelAcoplable abierto={false} etiquetaAbrir="Ver carrito">
        {contenido}
      </PanelAcoplable>,
    );
    expect(screen.queryByText('Chilaquiles verdes')).toBeNull();
    expect(document.querySelector('[data-figura="acoplado"]')).toBeNull();
  });

  it('la barra flotante enseña cuenta y total sin abrir nada', () => {
    render(
      <PanelAcoplable
        abierto={false}
        etiquetaAbrir="Ver carrito"
        resumen="$586.00"
        insignia={3}
      >
        {contenido}
      </PanelAcoplable>,
    );
    expect(screen.getByText('Ver carrito')).toBeTruthy();
    expect(screen.getByText('$586.00')).toBeTruthy();
    expect(screen.getByText('3')).toBeTruthy();
  });

  it('sin nada que enseñar, la barra no aparece y no tapa productos', () => {
    render(
      <PanelAcoplable
        abierto={false}
        etiquetaAbrir="Ver carrito"
        disparador={false}
      >
        {contenido}
      </PanelAcoplable>,
    );
    expect(screen.queryByText('Ver carrito')).toBeNull();
  });

  it('pulsar la barra pide abrir', () => {
    const abrir = vi.fn();
    render(
      <PanelAcoplable
        abierto={false}
        onAbrir={abrir}
        etiquetaAbrir="Ver carrito"
      >
        {contenido}
      </PanelAcoplable>,
    );
    fireEvent.click(screen.getByText('Ver carrito'));
    expect(abrir).toHaveBeenCalledOnce();
  });

  it('abierta, la hoja trae el MISMO contenido que la columna', () => {
    render(
      <PanelAcoplable abierto onCerrar={() => {}}>
        {contenido}
      </PanelAcoplable>,
    );
    expect(document.querySelector('[data-figura="hoja"]')).toBeTruthy();
    expect(screen.getByText('Chilaquiles verdes')).toBeTruthy();
  });

  it('abierta, la barra flotante desaparece: no se llama a lo que ya está', () => {
    render(
      <PanelAcoplable abierto onCerrar={() => {}} etiquetaAbrir="Ver carrito">
        {contenido}
      </PanelAcoplable>,
    );
    expect(screen.queryByText('Ver carrito')).toBeNull();
  });

  it('Escape la cierra', () => {
    const cerrar = vi.fn();
    render(
      <PanelAcoplable abierto onCerrar={cerrar}>
        {contenido}
      </PanelAcoplable>,
    );
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(cerrar).toHaveBeenCalledOnce();
  });

  it('tocar fuera la cierra', () => {
    const cerrar = vi.fn();
    render(
      <PanelAcoplable abierto onCerrar={cerrar}>
        {contenido}
      </PanelAcoplable>,
    );
    fireEvent.click(document.querySelector('[data-figura="velo"]'));
    expect(cerrar).toHaveBeenCalledOnce();
  });

  it('el velo no se anuncia como una salida más: sólo el aspa lo es', () => {
    // Dentro del diálogo tiene que haber UN «Cerrar». Dos —el velo y el aspa—
    // se leen como dos salidas distintas que hacen lo mismo.
    render(
      <PanelAcoplable abierto onCerrar={() => {}}>
        {contenido}
      </PanelAcoplable>,
    );
    expect(screen.getAllByRole('button', { name: 'Cerrar' })).toHaveLength(1);
  });

  it('con la hoja arriba el fondo no se desplaza bajo el dedo', () => {
    // En un teléfono el gesto se le escapa al contenedor de atrás: crees estar
    // moviendo el carrito y estás moviendo el catálogo.
    const { unmount } = render(
      <PanelAcoplable abierto onCerrar={() => {}}>
        {contenido}
      </PanelAcoplable>,
    );
    expect(document.body.style.overflow).toBe('hidden');
    unmount();
    expect(document.body.style.overflow).not.toBe('hidden');
  });

  it('cerrada NO bloquea el desplazamiento del fondo', () => {
    render(
      <PanelAcoplable abierto={false} etiquetaAbrir="Ver carrito">
        {contenido}
      </PanelAcoplable>,
    );
    expect(document.body.style.overflow).not.toBe('hidden');
  });
});
