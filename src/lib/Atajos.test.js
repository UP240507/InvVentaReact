import { describe, it, expect, beforeEach } from 'vitest';
import {
  normalizarCombo,
  comboDeEvento,
  formatearCombo,
  registrarAtajos,
  listarAtajos,
  siguienteOrden,
  _despachar,
  _reiniciarRegistro,
} from './Atajos';

// KeyboardEvent falso: solo lo que leen comboDeEvento y el despachador.
const ev = (over = {}) => ({
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  metaKey: false,
  key: '',
  code: '',
  target: { tagName: 'BODY' },
  preventDefault() {
    this.prevenido = true;
  },
  ...over,
});

const enInput = (over = {}) => ev({ target: { tagName: 'INPUT' }, ...over });

beforeEach(() => _reiniciarRegistro());

describe('normalizarCombo', () => {
  it('ordena los modificadores y baja a minúsculas', () => {
    expect(normalizarCombo('Shift+Ctrl+L')).toBe('ctrl+shift+l');
    expect(normalizarCombo('CTRL + SHIFT + l')).toBe('ctrl+shift+l');
  });

  it('acepta alias en español', () => {
    expect(normalizarCombo('Esc')).toBe('escape');
    expect(normalizarCombo('ctrl+Intro')).toBe('ctrl+enter');
    expect(normalizarCombo('Abajo')).toBe('arrowdown');
  });

  it('teclas sueltas quedan intactas', () => {
    expect(normalizarCombo('F1')).toBe('f1');
    expect(normalizarCombo('/')).toBe('/');
  });

  it('resuelve las teclas de la DataTable', () => {
    // Las tablas admin usan N, Supr y las de página; si alguna se normalizara
    // distinta de como llega el evento, el atajo sería silenciosamente inerte.
    expect(normalizarCombo('n')).toBe('n');
    expect(normalizarCombo('Supr')).toBe('delete');
    expect(normalizarCombo('PageDown')).toBe('pagedown');
  });
});

describe('comboDeEvento', () => {
  it('usa la tecla FÍSICA con Shift', () => {
    // Con Shift, e.key llega como 'L'. Si nos fiáramos de e.key en crudo,
    // "ctrl+shift+l" nunca coincidiría.
    const combo = comboDeEvento(
      ev({ ctrlKey: true, shiftKey: true, key: 'L', code: 'KeyL' }),
    );
    expect(combo).toBe('ctrl+shift+l');
  });

  it('resuelve Ctrl+1', () => {
    expect(comboDeEvento(ev({ ctrlKey: true, key: '1', code: 'Digit1' }))).toBe(
      'ctrl+1',
    );
  });

  it('resuelve teclas de función', () => {
    expect(comboDeEvento(ev({ key: 'F1', code: 'F1' }))).toBe('f1');
  });

  it('el evento real de Supr y PageDown casa con su combo', () => {
    expect(comboDeEvento(ev({ key: 'Delete', code: 'Delete' }))).toBe(
      normalizarCombo('Supr'),
    );
    expect(comboDeEvento(ev({ key: 'PageDown', code: 'PageDown' }))).toBe(
      normalizarCombo('PageDown'),
    );
  });
});

describe('formatearCombo', () => {
  it('produce etiqueta legible', () => {
    expect(formatearCombo('ctrl+shift+l')).toBe('Ctrl + Shift + L');
    expect(formatearCombo('escape')).toBe('Esc');
    expect(formatearCombo('arrowdown')).toBe('↓');
  });
});

describe('registro', () => {
  it('lista solo los atajos con descripción', () => {
    registrarAtajos({
      scope: 'global',
      titulo: 'Generales',
      mapa: {
        'ctrl+k': { descripcion: 'Buscar', accion: () => {} },
        'ctrl+z': { accion: () => {} }, // sin descripción: no se documenta
      },
    });
    const lista = listarAtajos();
    expect(lista).toHaveLength(1);
    expect(lista[0].atajos).toHaveLength(1);
    expect(lista[0].atajos[0].combo).toBe('ctrl+k');
  });

  it('normaliza los combos al registrar', () => {
    registrarAtajos({
      scope: 'global',
      mapa: { 'Shift+Ctrl+L': { descripcion: 'Tema', accion: () => {} } },
    });
    expect(listarAtajos()[0].atajos[0].combo).toBe('ctrl+shift+l');
  });

  it('la baja retira el scope de la ayuda', () => {
    const baja = registrarAtajos({
      scope: 'mesas',
      mapa: { c: { descripcion: 'Cobrar', accion: () => {} } },
    });
    expect(listarAtajos()).toHaveLength(1);
    baja();
    expect(listarAtajos()).toHaveLength(0);
  });

  it('devuelve la MISMA referencia si nada cambió (useSyncExternalStore)', () => {
    registrarAtajos({
      scope: 'global',
      mapa: { f1: { descripcion: 'Ayuda', accion: () => {} } },
    });
    expect(listarAtajos()).toBe(listarAtajos());
  });

  it('descarta entradas sin acción ejecutable', () => {
    registrarAtajos({
      scope: 'global',
      mapa: { 'ctrl+q': { descripcion: 'Roto' } },
    });
    expect(listarAtajos()).toHaveLength(0);
  });
});

describe('despacho', () => {
  const ctrlB = () => ev({ ctrlKey: true, key: 'b', code: 'KeyB' });

  it('ejecuta el atajo y previene el default del navegador', () => {
    let veces = 0;
    registrarAtajos({ scope: 'global', mapa: { 'ctrl+b': () => veces++ } });
    const e = ctrlB();
    _despachar(e);
    expect(veces).toBe(1);
    expect(e.prevenido).toBe(true);
  });

  it('el scope montado después GANA sobre el global', () => {
    const orden = [];
    registrarAtajos({
      scope: 'global',
      mapa: { 'ctrl+b': () => orden.push('global') },
    });
    registrarAtajos({
      scope: 'mesas',
      mapa: { 'ctrl+b': () => orden.push('mesas') },
    });
    _despachar(ctrlB());
    expect(orden).toEqual(['mesas']); // NO se ejecutan los dos
  });

  it('al desmontar el scope, el global recupera el atajo', () => {
    const orden = [];
    registrarAtajos({
      scope: 'global',
      mapa: { 'ctrl+b': () => orden.push('global') },
    });
    const baja = registrarAtajos({
      scope: 'mesas',
      mapa: { 'ctrl+b': () => orden.push('mesas') },
    });
    baja();
    _despachar(ctrlB());
    expect(orden).toEqual(['global']);
  });

  it('NO dispara si el foco está en un campo de texto', () => {
    let veces = 0;
    registrarAtajos({ scope: 'global', mapa: { 'ctrl+b': () => veces++ } });
    _despachar(enInput({ ctrlKey: true, key: 'b', code: 'KeyB' }));
    expect(veces).toBe(0); // Ctrl+B dentro de un textarea sigue siendo negrita
  });

  it('permitirEnInput deja pasar el atajo aunque se esté escribiendo', () => {
    let veces = 0;
    registrarAtajos({
      scope: 'global',
      mapa: {
        'ctrl+k': { accion: () => veces++, permitirEnInput: true },
      },
    });
    _despachar(enInput({ ctrlKey: true, key: 'k', code: 'KeyK' }));
    expect(veces).toBe(1);
  });

  it('un combo no registrado no toca el evento', () => {
    registrarAtajos({ scope: 'global', mapa: { 'ctrl+b': () => {} } });
    const e = ev({ ctrlKey: true, key: 'p', code: 'KeyP' });
    _despachar(e);
    expect(e.prevenido).toBe(undefined);
  });

  it('el orden reservado sobrevive al re-registro del mismo scope', () => {
    // Caso real: varias etiquetas son dinámicas ("Cobrar la mesa" vs "Abrir la
    // mesa"), así que el scope global se re-registra a menudo. Sin un orden
    // reservado iría adelantando al scope del módulo y le robaría las teclas.
    const ordenGlobal = siguienteOrden();
    const bajaGlobal = registrarAtajos({
      scope: 'global',
      orden: ordenGlobal,
      mapa: { escape: () => resultado.push('global') },
    });
    const resultado = [];
    registrarAtajos({
      scope: 'mesas',
      orden: siguienteOrden(),
      mapa: { escape: () => resultado.push('mesas') },
    });

    // El global se refresca (cambió una descripción) DESPUÉS de mesas.
    bajaGlobal();
    registrarAtajos({
      scope: 'global',
      orden: ordenGlobal,
      mapa: { escape: () => resultado.push('global') },
    });

    _despachar(ev({ key: 'Escape', code: 'Escape' }));
    expect(resultado).toEqual(['mesas']); // sigue mandando el módulo
  });
});
