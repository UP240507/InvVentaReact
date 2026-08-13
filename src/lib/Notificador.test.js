// src/lib/Notificador.test.js
//
// Se prueba `estaDesatendida` porque es LA línea que falló el 12-ago: el aviso
// del KDS sonaba y nunca lanzaba el toast, y una de las dos causas era creerle
// a `document.visibilityState` en una ventana de Tauri minimizada.
//
// Nota de higiene: este archivo corre con `--isolate=false` junto al resto de
// `src/lib`, y tocar `document` es justo lo que contaminó `useConectividad`
// durante dos días. Por eso se usa `vi.spyOn` (que se puede restaurar) y
// NUNCA una asignación directa sobre `document`.
import { describe, it, expect, afterEach, vi } from 'vitest';
import { estaDesatendida } from './Notificador';

const fingir = ({ visibilidad = 'visible', foco = true }) => {
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue(visibilidad);
  vi.spyOn(document, 'hasFocus').mockReturnValue(foco);
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('estaDesatendida', () => {
  it('a la vista y con el foco: atendida', () => {
    fingir({ visibilidad: 'visible', foco: true });
    expect(estaDesatendida()).toBe(false);
  });

  it('pestaña oculta: desatendida', () => {
    fingir({ visibilidad: 'hidden', foco: false });
    expect(estaDesatendida()).toBe(true);
  });

  it('EL CASO DE LA CAJA: se dice visible pero no tiene el foco', () => {
    // Windows minimiza la ventana de Tauri —o WhatsApp la tapa— y WebView2
    // sigue reportando 'visible'. Mirar sólo la visibilidad daba «atendida» y
    // el aviso se quedaba en un cartel que nadie estaba viendo.
    fingir({ visibilidad: 'visible', foco: false });
    expect(estaDesatendida()).toBe(true);
  });

  it('un webview sin hasFocus se cae del lado de «atendida»', () => {
    // Sin forma de saber si están delante, se prefiere el cartel: un toast del
    // sistema cada vez que llega una comanda, con el cocinero mirando la
    // pantalla, se vuelve ruido y se aprende a ignorarlo.
    //
    // `delete document.hasFocus` NO sirve: en jsdom el método vive en
    // `Document.prototype`, así que borrar la propiedad propia deja al
    // descubierto la del prototipo —que además devuelve `false`— y el caso
    // medía justo lo contrario de lo que dice su nombre. Se tapa con una
    // propiedad propia `undefined`, que es lo que de verdad ve el código.
    Object.defineProperty(document, 'hasFocus', {
      value: undefined,
      configurable: true,
      writable: true,
    });
    try {
      vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
      expect(estaDesatendida()).toBe(false);
    } finally {
      // `delete` aquí SÍ es lo correcto: quita la tapa y devuelve el método del
      // prototipo, dejando el `document` como estaba para el archivo siguiente.
      delete document.hasFocus;
    }
    expect(typeof document.hasFocus).toBe('function');
  });
});
