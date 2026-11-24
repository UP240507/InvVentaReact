import { describe, it, expect } from 'vitest';
import { unir } from './Clases';

describe('unir', () => {
  it('junta con un espacio y tira lo falso', () => {
    const activa = true;
    const oculta = false;
    expect(unir('a', oculta && 'b', null, undefined, '', 'c')).toBe('a c');
    expect(unir('a', activa && 'b')).toBe('a b');
    expect(unir()).toBe('');
  });
});
