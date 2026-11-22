// src/lib/Navegacion.test.js
//
// La baraja: cada lugar del menú tiene su carta de lotería y su número, y el
// número es fijo. Estas pruebas cuidan que ningún módulo nuevo entre al menú
// sin carta, y que ninguna carta repita número o nombre.
import { describe, it, expect } from 'vitest';
import { MENU_ITEMS, cartaDeRuta, tituloDeRuta } from './Navegacion';

describe('Las cartas de lotería del menú', () => {
  it('todo lugar del menú tiene carta, en singular y con artículo', () => {
    for (const it of MENU_ITEMS)
      expect(it.carta, it.path).toMatch(/^(El|La) [A-ZÁÉÍÓÚÑ]/);
  });

  it('son 24, numeradas del 1 al 24 en el orden del menú, sin repetir', () => {
    expect(MENU_ITEMS.map((i) => i.numero)).toEqual(
      Array.from({ length: 24 }, (_, i) => i + 1),
    );
    expect(new Set(MENU_ITEMS.map((i) => i.carta)).size).toBe(24);
  });

  it('cartaDeRuta da la carta y el nombre real del módulo', () => {
    expect(cartaDeRuta('/recepcion')).toEqual({
      numero: 10,
      nombre: 'El Diablito',
      modulo: 'Recepción',
    });
    expect(cartaDeRuta('/pos/')).toMatchObject({ nombre: 'La Caja' });
  });

  it('una ruta fuera del menú no tiene carta y se titula como siempre', () => {
    expect(cartaDeRuta('/perfil')).toBeNull();
    expect(tituloDeRuta('/perfil')).toBe('Mi perfil');
  });

  it('el nombre real no se pierde: tituloDeRuta sigue dando el del módulo', () => {
    // Lo que se registra o se exporta usa el nombre real, no la carta.
    expect(tituloDeRuta('/mermas')).toBe('Ajustes y Mermas');
  });
});
