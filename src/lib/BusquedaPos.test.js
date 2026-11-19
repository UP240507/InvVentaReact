import { describe, it, expect } from 'vitest';
import { filtrarPorBusqueda, palabrasDeBusqueda } from './BusquedaPos';

const menu = [
  { id: 1, nombre: 'Latte', categoria: 'Café caliente' },
  { id: 2, nombre: 'Latte frío de vainilla', categoria: 'Bebidas frías' },
  {
    id: 3,
    nombre: 'Jugo de naranja',
    codigo_pos: 'J NARA',
    categoria: 'Jugos',
  },
  { id: 4, nombre: 'Chilaquiles', categoria: 'Desayunos' },
];
const ids = (l) => l.map((p) => p.id);

describe('filtrarPorBusqueda', () => {
  it('sin texto, todo', () => {
    expect(filtrarPorBusqueda(menu, '')).toBe(menu);
    expect(filtrarPorBusqueda(menu, '   ')).toBe(menu);
  });

  it('sin acentos ni mayúsculas', () => {
    expect(ids(filtrarPorBusqueda(menu, 'FRIO'))).toEqual([2]);
    expect(ids(filtrarPorBusqueda(menu, 'chilaquíles'))).toEqual([4]);
  });

  it('busca en todas las categorías', () => {
    expect(ids(filtrarPorBusqueda(menu, 'latte'))).toEqual([1, 2]);
  });

  it('cada palabra tiene que estar, en cualquier orden', () => {
    expect(ids(filtrarPorBusqueda(menu, 'vainilla latte'))).toEqual([2]);
    expect(ids(filtrarPorBusqueda(menu, 'latte naranja'))).toEqual([]);
  });

  it('también por el código del POS', () => {
    expect(ids(filtrarPorBusqueda(menu, 'j nara'))).toEqual([3]);
  });

  it('las palabras salen normalizadas', () => {
    expect(palabrasDeBusqueda('  Café  FRÍO ')).toEqual(['cafe', 'frio']);
  });
});
