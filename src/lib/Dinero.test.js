import { describe, it, expect } from 'vitest';
import { formatoDinero, formatoImporte } from './Dinero';

describe('formatoDinero', () => {
  it('siempre con dos decimales y separador de miles', () => {
    expect(formatoDinero(1234.5)).toBe('$1,234.50');
    expect(formatoDinero(1234567.891)).toBe('$1,234,567.89');
    expect(formatoDinero(15)).toBe('$15.00');
    expect(formatoDinero(0)).toBe('$0.00');
  });

  it('redondea el tercer decimal en vez de enseñarlo', () => {
    // El caso del 7-sep: un precio derivado de un empaque (30 kg a $100).
    expect(formatoDinero(160.008)).toBe('$160.01');
    expect(formatoDinero(100 / 30)).toBe('$3.33');
  });

  it('lo que no es número se escribe $0.00, nunca $NaN', () => {
    expect(formatoDinero(null)).toBe('$0.00');
    expect(formatoDinero(undefined)).toBe('$0.00');
    expect(formatoDinero('')).toBe('$0.00');
    expect(formatoDinero('hola')).toBe('$0.00');
    expect(formatoDinero(NaN)).toBe('$0.00');
    expect(formatoDinero(Infinity)).toBe('$0.00');
  });

  it('acepta números que llegan como texto desde la base', () => {
    expect(formatoDinero('12.5')).toBe('$12.50');
  });

  it('los negativos se quedan como estaban: $-5.00', () => {
    // Decisión del 23-nov: cambiarlo a -$5.00 es otro commit, y se ve.
    expect(formatoDinero(-5)).toBe('$-5.00');
  });
});

describe('formatoImporte', () => {
  it('es lo mismo sin el signo, para donde el $ se pinta aparte', () => {
    expect(formatoImporte(1234.5)).toBe('1,234.50');
    expect(formatoImporte(undefined)).toBe('0.00');
    expect(formatoDinero(42)).toBe(`$${formatoImporte(42)}`);
  });
});
